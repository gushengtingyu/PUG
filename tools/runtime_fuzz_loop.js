const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP } = Engine.constants

function parseArgs(argv) {
	const options = {
		seed: Date.now() & 0xffffffff,
		scenario: "Historical",
		maxSteps: 0,
		echoEvery: 200,
		stuckThreshold: 120
	}
	for (let raw of argv) {
		if (!raw.startsWith("--")) continue
		let [k, v] = raw.slice(2).split("=")
		if (k === "seed" && v !== undefined && !Number.isNaN(Number(v))) options.seed = Number(v) >>> 0
		if (k === "scenario" && v) options.scenario = v
		if (k === "max-steps" && v !== undefined && !Number.isNaN(Number(v))) options.maxSteps = Number(v)
		if (k === "echo-every" && v !== undefined && !Number.isNaN(Number(v))) options.echoEvery = Math.max(1, Number(v))
		if (k === "stuck-threshold" && v !== undefined && !Number.isNaN(Number(v)))
			options.stuckThreshold = Math.max(10, Number(v))
	}
	return options
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
	return game.active === AP ? "Allied Powers" : "Central Powers"
}

function actionWeight(name) {
	if (name === "undo" || name === "propose_rollback" || name === "flag_supply_warnings") return 0
	if (name === "card" || name.startsWith("play_")) return 12
	if (name === "space") return 10
	if (name === "piece") return 9
	if (name === "activate_move" || name === "activate_attack") return 8
	if (name === "move" || name === "attack") return 7
	if (name === "next" || name === "done" || name === "pass" || name === "finish") return 5
	return 4
}

function buildChoices(actions) {
	let choices = []
	if (!actions || typeof actions !== "object") return choices
	for (let name of Object.keys(actions)) {
		let weight = actionWeight(name)
		if (weight <= 0) continue
		let value = actions[name]
		if (Array.isArray(value)) {
			for (let arg of value) choices.push({ name, arg, weight })
		} else if (value === 1) {
			choices.push({ name, weight })
		}
	}
	return choices
}

function pickChoice(choices, rand) {
	if (choices.length === 0) return null
	let total = 0
	for (let c of choices) total += c.weight
	let cursor = rand() * total
	for (let c of choices) {
		cursor -= c.weight
		if (cursor <= 0) return c
	}
	return choices[choices.length - 1]
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

function createGame(seed, scenario) {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function printContext(prefix, payload) {
	console.log(prefix, JSON.stringify(payload))
}

function run() {
	const options = parseArgs(process.argv.slice(2))
	const rand = createRng(options.seed)
	let seedCursor = options.seed >>> 0
	let gameCount = 1
	let totalSteps = 0
	let gameSteps = 0
	let game = createGame(seedCursor, options.scenario)
	let sameSignatureCount = 0
	let pairCounts = new Map()
	let recent = []
	let lastSignature = ""

	printContext("[fuzz] start", {
		seed: seedCursor,
		scenario: options.scenario,
		maxSteps: options.maxSteps,
		stuckThreshold: options.stuckThreshold
	})

	while (true) {
		if (options.maxSteps > 0 && totalSteps >= options.maxSteps) {
			printContext("[fuzz] done", { reason: "max_steps", totalSteps, gameCount })
			process.exit(0)
		}

		let role = currentRole(game)
		let view
		try {
			view = rules.view(game, role)
		} catch (error) {
			printContext("[fuzz] crash:view", {
				seed: seedCursor,
				totalSteps,
				gameSteps,
				gameCount,
				state: game.state,
				active: game.active,
				role,
				error: error && error.stack ? error.stack : String(error),
				recent
			})
			process.exit(1)
		}

		if (game.state === "game_over") {
			seedCursor = (seedCursor + 1) >>> 0
			gameCount += 1
			gameSteps = 0
			sameSignatureCount = 0
			pairCounts.clear()
			recent = []
			lastSignature = ""
			game = createGame(seedCursor, options.scenario)
			continue
		}

		const sig = signatureOf(game, view)
		if (sig === lastSignature) sameSignatureCount += 1
		else sameSignatureCount = 0
		lastSignature = sig

		if (sameSignatureCount >= options.stuckThreshold) {
			printContext("[fuzz] stuck:signature", {
				seed: seedCursor,
				totalSteps,
				gameSteps,
				gameCount,
				state: game.state,
				active: game.active,
				prompt: view.prompt,
				actions: view.actions,
				recent
			})
			process.exit(2)
		}

		const choices = buildChoices(view.actions)
		if (choices.length === 0) {
			printContext("[fuzz] stuck:no_actions", {
				seed: seedCursor,
				totalSteps,
				gameSteps,
				gameCount,
				state: game.state,
				active: game.active,
				prompt: view.prompt,
				recent
			})
			process.exit(2)
		}

		const choice = pickChoice(choices, rand)
		const pairKey = `${sig}=>${choice.name}:${choice.arg === undefined ? "" : String(choice.arg)}`
		const pairCount = (pairCounts.get(pairKey) || 0) + 1
		pairCounts.set(pairKey, pairCount)
		if (pairCount >= options.stuckThreshold) {
			printContext("[fuzz] stuck:repeat_pair", {
				seed: seedCursor,
				totalSteps,
				gameSteps,
				gameCount,
				state: game.state,
				active: game.active,
				prompt: view.prompt,
				choice,
				repeat: pairCount,
				recent
			})
			process.exit(2)
		}

		recent.push({
			step: totalSteps + 1,
			state: game.state,
			active: game.active,
			action: choice.name,
			arg: choice.arg
		})
		if (recent.length > 40) recent.shift()

		try {
			game = rules.action(game, role, choice.name, choice.arg)
		} catch (error) {
			printContext("[fuzz] crash:action", {
				seed: seedCursor,
				totalSteps: totalSteps + 1,
				gameSteps: gameSteps + 1,
				gameCount,
				state: game.state,
				active: game.active,
				role,
				choice,
				error: error && error.stack ? error.stack : String(error),
				recent
			})
			process.exit(1)
		}

		totalSteps += 1
		gameSteps += 1
		if (totalSteps % options.echoEvery === 0) {
			printContext("[fuzz] progress", {
				totalSteps,
				gameCount,
				seed: seedCursor,
				gameSteps,
				state: game.state,
				active: game.active
			})
		}
	}
}

run()
