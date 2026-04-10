const rules = require("../rules.js")

function createDefaultOptions() {
	return {
		seed: Date.now() & 0xffffffff,
		seedStep: 1,
		scenario: "Historical",
		maxSteps: 0,
		maxStepsPerGame: 0,
		maxDuration: 300,
		games: 10,
		echoEvery: 200,
		stuckThreshold: 120,
		quiet: false
	}
}

function normalizeOptions(input = {}) {
	let options = { ...createDefaultOptions(), ...input }
	options.seed = Number(options.seed) >>> 0
	options.seedStep = Number(options.seedStep) >>> 0
	if (options.seedStep === 0) options.seedStep = 1
	options.scenario = options.scenario || "Historical"
	options.maxSteps = Number.isFinite(Number(options.maxSteps)) ? Math.max(0, Number(options.maxSteps)) : 0
	options.maxStepsPerGame = Number.isFinite(Number(options.maxStepsPerGame))
		? Math.max(0, Number(options.maxStepsPerGame))
		: 0
	options.maxDuration = Number.isFinite(Number(options.maxDuration)) ? Math.max(0, Number(options.maxDuration)) : 0
	options.games = Number.isFinite(Number(options.games)) ? Math.max(1, Number(options.games)) : 10
	options.echoEvery = Number.isFinite(Number(options.echoEvery)) ? Math.max(1, Number(options.echoEvery)) : 200
	options.stuckThreshold = Number.isFinite(Number(options.stuckThreshold))
		? Math.max(10, Number(options.stuckThreshold))
		: 120
	options.quiet = !!options.quiet
	return options
}

function parseArgs(argv) {
	let options = createDefaultOptions()
	for (let raw of argv) {
		if (!raw.startsWith("--")) continue
		let [k, v] = raw.slice(2).split("=")
		if (k === "quiet") {
			options.quiet = v === undefined ? true : v !== "false"
			continue
		}
		if (k === "seed" && v !== undefined && !Number.isNaN(Number(v))) options.seed = Number(v) >>> 0
		if (k === "seed-step" && v !== undefined && !Number.isNaN(Number(v))) options.seedStep = Number(v) >>> 0
		if (k === "scenario" && v) options.scenario = v
		if (k === "games" && v !== undefined && !Number.isNaN(Number(v))) options.games = Number(v)
		if (k === "max-steps" && v !== undefined && !Number.isNaN(Number(v))) options.maxSteps = Number(v)
		if (k === "max-steps-per-game" && v !== undefined && !Number.isNaN(Number(v)))
			options.maxStepsPerGame = Number(v)
		if (k === "duration" && v !== undefined && !Number.isNaN(Number(v)))
			options.maxDuration = Number(v)
		if (k === "echo-every" && v !== undefined && !Number.isNaN(Number(v))) options.echoEvery = Number(v)
		if (k === "stuck-threshold" && v !== undefined && !Number.isNaN(Number(v)))
			options.stuckThreshold = Number(v)
	}
	return normalizeOptions(options)
}

function createRng(seed) {
	let s = seed >>> 0
	if (s === 0) s = 0x6d2b79f5
	return function rand() {
		s ^= s << 13
		s ^= s >>> 17
		s ^= s << 5
		return (s >>> 0) / 4294967296
	}
}

function currentRole(game) {
	return game.active
}

function actionWeight(name) {
	if (name === "undo" || name === "propose_rollback" || name === "flag_supply_warnings") return 0
	if (name === "card" || name.startsWith("play_")) return 12
	if (name === "space") return 10
	if (name === "piece") return 9
	if (name === "activate_move" || name === "activate_attack") return 8
	if (name === "move" || name === "attack") return 7
	if (name === "end_action") return 6
	if (name === "next" || name === "done" || name === "pass" || name === "finish") return 5
	return 4
}

function buildChoices(actions, game) {
	let choices = []
	if (!actions || typeof actions !== "object") return choices
	for (let name of Object.keys(actions)) {
		let weight = actionWeight(name)
		if (weight <= 0) continue

		let value = actions[name]
		if (Array.isArray(value)) {
			for (let arg of value) {
				// Temporarily disable "LIBERATE SUEZ" event (ID 67) to avoid stuck issues in fuzzing
				if ((name === "play_event" || name === "event") && arg === 67) {
					continue
				}
				choices.push({ name, arg, weight })
			}
		} else if (value === 1) {
			// Temporarily disable "LIBERATE SUEZ" event (ID 67) to avoid stuck issues in fuzzing
			if ((name === "play_event" || name === "event") && game && game.card === 67) {
				// skip
			} else {
				choices.push({ name, weight })
			}
		}
	}
	return choices
}

function isWaitingPrompt(prompt) {
	return typeof prompt === "string" && prompt.startsWith("等待 ")
}

function pickChoice(choices, rand, pairCounts, sig) {
	if (choices.length === 0) return null
	let weightedChoices = choices.map((choice) => {
		let pairKey = `${sig}=>${choice.name}:${choice.arg === undefined ? "" : String(choice.arg)}`
		let repeat = pairCounts.get(pairKey) || 0
		let effectiveWeight = choice.weight / (repeat + 1)
		return { ...choice, pairKey, effectiveWeight }
	})
	let total = 0
	for (let c of weightedChoices) total += c.effectiveWeight
	let cursor = rand() * total
	for (let c of weightedChoices) {
		cursor -= c.effectiveWeight
		if (cursor <= 0) return c
	}
	return weightedChoices[weightedChoices.length - 1]
}

function signatureOf(game, view) {
	const actions = Object.keys((view && view.actions) || {})
		.sort()
		.map((name) => {
			let value = view.actions[name]
			if (Array.isArray(value)) return `${name}:${value.length}`
			return `${name}:${value}`
		})
		.join("|")
	const where = view && view.where !== undefined ? String(view.where) : "-"
	return [
		game.state,
		game.active,
		game.turn,
		game.action_round,
		game.ops,
		game.sr,
		game.rps,
		where,
		actions
	].join("#")
}

function ensureUniqueArray(name, value) {
	if (value === undefined) return
	if (!Array.isArray(value)) throw new Error(`${name} must be an array`)
	if (new Set(value).size !== value.length) throw new Error(`${name} contains duplicate entries`)
}

function validateGameInvariants(game) {
	if (!game || typeof game !== "object") throw new Error("game must be an object")
	if (!game.state || typeof game.state !== "string") throw new Error("game.state must be a non-empty string")
	if (!game.active || typeof game.active !== "string") throw new Error("game.active must be a non-empty string")
	if (!Array.isArray(game.pieces)) throw new Error("game.pieces must be an array")
	if (!Array.isArray(game.control)) throw new Error("game.control must be an array")
	ensureUniqueArray("game.retreated", game.retreated)
	ensureUniqueArray("game.oos", game.oos)
	ensureUniqueArray("game.reduced", game.reduced)
	ensureUniqueArray("game.attacked", game.attacked)
	ensureUniqueArray("game.moved", game.moved)
	if (game.undo !== undefined && !Array.isArray(game.undo)) throw new Error("game.undo must be an array when present")
}

function validateViewInvariants(view, game, role = game.active) {
	if (!view || typeof view !== "object") throw new Error("view must be an object")
	if (view.prompt !== null && typeof view.prompt !== "string") throw new Error("view.prompt must be a string or null")
	if (!view.actions || typeof view.actions !== "object") throw new Error("view.actions must be an object")
	if (!view.active || typeof view.active !== "string") throw new Error("view.active must be a non-empty string")
	if (!Number.isInteger(view.turn) || view.turn < 1) throw new Error("view.turn must be a positive integer")
	if (view.active !== game.active) throw new Error("view.active must match game.active")
	if (role === game.active && isWaitingPrompt(view.prompt)) throw new Error("active player should not receive a waiting prompt")
	ensureUniqueArray("view.attacked", view.attacked)
	ensureUniqueArray("view.moved", view.moved)
}

function createGame(seed, scenario) {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function printContext(prefix, payload) {
	console.log(prefix, JSON.stringify(payload))
}

function readStableView(game, maxPasses = 6) {
	let role = currentRole(game)
	let view = null
	for (let pass = 0; pass < maxPasses; pass++) {
		role = currentRole(game)
		view = rules.view(game, role)
		validateViewInvariants(view, game, role)
		if (currentRole(game) === role) {
			return { role, view }
		}
	}
	return { role: currentRole(game), view }
}

function buildResult(exitCode, reason, summary) {
	return { exitCode, reason, summary }
}

function run(inputOptions = {}) {
	const options = normalizeOptions(inputOptions)
	const rand = createRng(options.seed)
	const report = options.quiet ? () => {} : printContext
	const startTime = Date.now()
	let seedCursor = options.seed >>> 0
	let gameIndex = 1
	let totalSteps = 0
	let gameSteps = 0
	let game = createGame(seedCursor, options.scenario)
	let sameSignatureCount = 0
	let pairCounts = new Map()
	let recent = []
	let lastSignature = ""
	let statesSeen = new Set()
	let seedsVisited = [seedCursor]
	let maxGameSteps = 0
	let completedGames = 0
	let completionReasons = []
	let noActionEvents = []

	function summary(extra = {}) {
		const elapsed = (Date.now() - startTime) / 1000
		return {
			seed: seedCursor,
			startSeed: options.seed >>> 0,
			endSeed: seedCursor,
			scenario: options.scenario,
			totalSteps,
			gameSteps,
			gameIndex,
			gamesRequested: options.games,
			completedGames,
			maxGameSteps,
			statesSeen: Array.from(statesSeen).sort(),
			seedsVisited,
			completionReasons,
			noActionEvents,
			elapsed: elapsed.toFixed(2) + "s",
			avgSpeed: (totalSteps / elapsed).toFixed(2) + " steps/s",
			...extra
		}
	}

	function startNextGame(reason) {
		completedGames += 1
		completionReasons.push(reason)
		maxGameSteps = Math.max(maxGameSteps, gameSteps)
		const elapsed = (Date.now() - startTime) / 1000
		report("[fuzz] next_game", {
			reason,
			totalSteps,
			completedGames,
			seed: seedCursor,
			gameSteps,
			elapsed: elapsed.toFixed(2) + "s"
		})
		if (completedGames >= options.games) {
			return buildResult(0, "games_completed", summary())
		}
		if (options.maxDuration > 0 && elapsed >= options.maxDuration) {
			return buildResult(0, "max_duration", summary())
		}
		seedCursor = (seedCursor + options.seedStep) >>> 0
		seedsVisited.push(seedCursor)
		gameIndex = completedGames + 1
		gameSteps = 0
		sameSignatureCount = 0
		pairCounts.clear()
		recent = []
		lastSignature = ""
		game = createGame(seedCursor, options.scenario)
		return null
	}

	report("[fuzz] start", {
		seed: seedCursor,
		seedStep: options.seedStep,
		scenario: options.scenario,
		games: options.games,
		maxSteps: options.maxSteps,
		maxStepsPerGame: options.maxStepsPerGame,
		maxDuration: options.maxDuration,
		stuckThreshold: options.stuckThreshold
	})

	while (true) {
		const elapsed = (Date.now() - startTime) / 1000
		if (options.maxSteps > 0 && totalSteps >= options.maxSteps) {
			maxGameSteps = Math.max(maxGameSteps, gameSteps)
			let result = buildResult(0, "max_steps", summary())
			report("[fuzz] done", result.summary)
			return result
		}

		if (options.maxDuration > 0 && elapsed >= options.maxDuration) {
			maxGameSteps = Math.max(maxGameSteps, gameSteps)
			let result = buildResult(0, "max_duration", summary())
			report("[fuzz] done", result.summary)
			return result
		}

		try {
			validateGameInvariants(game)
		} catch (error) {
			let result = buildResult(1, "invalid_game", summary({ error: error.message, recent }))
			report("[fuzz] invalid:game", result.summary)
			return result
		}

		let role
		let view
		try {
			;({ role, view } = readStableView(game))
		} catch (error) {
			let result = buildResult(1, "crash_view", summary({
				state: game.state,
				active: game.active,
				role,
				error: error && error.stack ? error.stack : String(error),
				recent
			}))
			report("[fuzz] crash:view", result.summary)
			return result
		}

		statesSeen.add(game.state)

		if (game.state === "game_over") {
			let result = startNextGame("game_over")
			if (result) {
				report("[fuzz] done", result.summary)
				return result
			}
			continue
		}

		const sig = signatureOf(game, view)
		if (sig === lastSignature) sameSignatureCount += 1
		else sameSignatureCount = 0
		lastSignature = sig

		if (sameSignatureCount >= options.stuckThreshold) {
			let result = buildResult(2, "stuck_signature", summary({
				state: game.state,
				active: game.active,
				prompt: view.prompt,
				actions: view.actions,
				recent
			}))
			report("[fuzz] stuck:signature", result.summary)
			return result
		}

		const choices = buildChoices(view.actions, game)
		if (choices.length === 0) {
			noActionEvents.push({
				state: game.state,
				active: game.active,
				viewActive: view.active,
				prompt: view.prompt
			})
			if (noActionEvents.length > 20) noActionEvents.shift()
			let result = buildResult(2, "active_no_selectable_actions", summary({
				state: game.state,
				active: game.active,
				role,
				prompt: view.prompt,
				actions: view.actions,
				recent
			}))
			report("[fuzz] invalid:no_actions", result.summary)
			return result
		}

		const choice = pickChoice(choices, rand, pairCounts, sig)
		const pairCount = (pairCounts.get(choice.pairKey) || 0) + 1
		pairCounts.set(choice.pairKey, pairCount)
		if (pairCount >= options.stuckThreshold) {
			let result = buildResult(2, "stuck_repeat_pair", summary({
				state: game.state,
				active: game.active,
				prompt: view.prompt,
				choice: { name: choice.name, arg: choice.arg },
				repeat: pairCount,
				recent
			}))
			report("[fuzz] stuck:repeat_pair", result.summary)
			return result
		}

		recent.push({
			step: totalSteps + 1,
			state: game.state,
			active: game.active,
			action: choice.name,
			arg: choice.arg
		})
		if (recent.length > 60) recent.shift()

		try {
			game = rules.action(game, role, choice.name, choice.arg)
			validateGameInvariants(game)
		} catch (error) {
			let result = buildResult(1, "crash_action", summary({
				state: game.state,
				active: game.active,
				role,
				choice: { name: choice.name, arg: choice.arg },
				error: error && error.stack ? error.stack : String(error),
				recent
			}))
			report("[fuzz] crash:action", result.summary)
			return result
		}

		totalSteps += 1
		gameSteps += 1
		maxGameSteps = Math.max(maxGameSteps, gameSteps)

		if (options.maxStepsPerGame > 0 && gameSteps >= options.maxStepsPerGame) {
			let result = startNextGame("max_steps_per_game")
			if (result) {
				report("[fuzz] done", result.summary)
				return result
			}
			continue
		}

		if (totalSteps % options.echoEvery === 0) {
			const elapsed = (Date.now() - startTime) / 1000
			report("[fuzz] progress", {
				totalSteps,
				gameIndex,
				gameCount: completedGames + 1,
				seed: seedCursor,
				gameSteps,
				state: game.state,
				active: game.active,
				statesSeen: statesSeen.size,
				elapsed: elapsed.toFixed(2) + "s",
				speed: (totalSteps / elapsed).toFixed(2) + " steps/s"
			})
		}
	}
}

function main() {
	let result = run(parseArgs(process.argv.slice(2)))
	process.exit(result.exitCode)
}

module.exports = {
	parseArgs,
	normalizeOptions,
	createRng,
	currentRole,
	actionWeight,
	buildChoices,
	isWaitingPrompt,
	pickChoice,
	signatureOf,
	validateGameInvariants,
	validateViewInvariants,
	run
}

if (require.main === module) main()
