const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const fuzz = require("./runtime_fuzz_loop.js")

const { AP } = Engine.constants

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
}

function expectRetreatedInvariant(game) {
	if (game.retreated === undefined) return
	expect(Array.isArray(game.retreated)).toBe(true)
	expect(new Set(game.retreated).size).toBe(game.retreated.length)
}

function currentPlayer(game) {
	return game.active === AP ? "Allied Powers" : "Central Powers"
}

function getSelectableActionNames(view) {
	return Object.keys(view.actions || {}).filter((name) => {
		if (name === "undo") return false
		let value = view.actions[name]
		if (Array.isArray(value)) return value.length > 0
		return value === 1
	})
}

function pickAction(view, salt) {
	let names = getSelectableActionNames(view)
	if (names.length === 0) return null
	let name = names[salt % names.length]
	let value = view.actions[name]
	if (Array.isArray(value)) {
		return {
			name,
			arg: value[salt % value.length]
		}
	}
	return { name }
}

describe("运行时烟雾测试", () => {
	test("初始化时会创建 retreated 数组", () => {
		let game = setupGame(12345)
		expectRetreatedInvariant(game)
	})

	test("开局先进入同盟国动员4点牌选牌阶段", () => {
		let game = setupGame(12345)
		expect(game.state).toBe("cp_opening_mobilization_pick")
		expect(game.active).not.toBe(AP)
		let candidates = game.deck_cp.filter((c) => {
			let card = Engine.data.cards[c]
			return (
				card &&
				card.faction === Engine.constants.CP &&
				card.commitment === Engine.constants.COMMITMENT_MOBILIZATION &&
				Number(card.ops) === 4
			)
		})
		expect(candidates.length).toBeGreaterThan(0)
		let view = rules.view(game, "Central Powers")
		expect(Array.isArray(view.actions.card)).toBe(true)
		expect(new Set(view.actions.card)).toEqual(new Set(candidates))
	})

	test("同盟国开局选牌后进入AP确认强制进攻", () => {
		let game = setupGame(12345)
		let choose = game.deck_cp.find((c) => {
			let card = Engine.data.cards[c]
			return (
				card &&
				card.faction === Engine.constants.CP &&
				card.commitment === Engine.constants.COMMITMENT_MOBILIZATION &&
				Number(card.ops) === 4
			)
		})
		let oldHand = game.hand_cp.length
		let oldDeck = game.deck_cp.length
		game = rules.action(game, "Central Powers", "card", choose)
		expect(game.hand_cp.includes(choose)).toBe(true)
		expect(game.hand_cp.length).toBe(oldHand + 1)
		expect(game.deck_cp.includes(choose)).toBe(false)
		expect(game.deck_cp.length).toBe(oldDeck - 1)
		expect(game.cp_opening_mobilization_pick_done).toBe(true)
		expect(game.state).toBe("acknowledge_mo_results")
		expect(game.active).toBe(AP)
	})

	test("retreated 单位不会回到战斗单位池", () => {
		const { data } = Engine
		const apPiece = data.pieces.findIndex((p) => p && p.faction === "ap" && p.type !== "hq")
		const cpPiece = data.pieces.findIndex((p) => p && p.faction === "cp" && p.type !== "hq")
		let game = {
			pieces: [],
			attack: {
				space: 1,
				pieces: [apPiece],
				initial_defenders: [cpPiece]
			},
			retreated: [cpPiece]
		}
		game.pieces[apPiece] = 2
		game.pieces[cpPiece] = 1
		let pool = Engine.combat_cards.get_battle_piece_pool(game)
		expect(pool).toContain(apPiece)
		expect(pool).not.toContain(cpPiece)
	})

	test("存在已退却防守方时优先进入摧毁流程", () => {
		const { data } = Engine
		const cpPiece = data.pieces.findIndex((p) => p && p.faction === "cp" && p.type !== "hq")
		let game = {
			pieces: [],
			attack: {
				space: 1,
				defender_losses: 1,
				defender: "cp",
				attacker: "ap"
			},
			retreated: [cpPiece]
		}
		game.pieces[cpPiece] = 1
		expect(Engine.combat.get_defender_losses_state(game)).toBe("eliminate_retreated_units")
		game.retreated = []
		expect(Engine.combat.get_defender_losses_state(game)).toBe("apply_defender_losses")
	})

	test("泡测参数解析支持多种子与分局步数限制", () => {
		let options = fuzz.parseArgs([
			"--seed=12345",
			"--seed-step=7",
			"--games=4",
			"--max-steps=900",
			"--max-steps-per-game=150",
			"--echo-every=0",
			"--stuck-threshold=4",
			"--quiet"
		])
		expect(options.seed).toBe(12345)
		expect(options.seedStep).toBe(7)
		expect(options.games).toBe(4)
		expect(options.maxSteps).toBe(900)
		expect(options.maxStepsPerGame).toBe(150)
		expect(options.echoEvery).toBe(1)
		expect(options.stuckThreshold).toBe(10)
		expect(options.quiet).toBe(true)
	})

	test("泡测运行支持多种子和分局步数预算", () => {
		let result = fuzz.run({
			seed: 12345,
			seedStep: 11,
			games: 3,
			maxStepsPerGame: 60,
			maxSteps: 240,
			echoEvery: 1000,
			stuckThreshold: 80,
			quiet: true
		})
		expect(result.exitCode).toBe(0)
		expect(result.reason).toBe("games_completed")
		expect(result.summary.completedGames).toBe(3)
		expect(result.summary.totalSteps).toBe(180)
		expect(result.summary.seedsVisited).toEqual([12345, 12356, 12367])
		expect(result.summary.completionReasons).toEqual([
			"max_steps_per_game",
			"max_steps_per_game",
			"max_steps_per_game"
		])
		expect(result.summary.statesSeen.length).toBeGreaterThan(0)
	})

	test("泡测会把仅剩 undo 的状态记为 no_selectable_actions", () => {
		let originalSetup = rules.setup
		let originalView = rules.view
		let originalAction = rules.action

		rules.setup = (seed, scenario, options) => ({
			seed,
			scenario,
			options,
			state: "idle_state",
			active: "ap",
			turn: 1,
			action_round: 1,
			pieces: [],
			control: []
		})
		rules.view = (game, role) => ({
			actions: { undo: 1 },
			active: role,
			turn: game.turn,
			prompt: null
		})
		rules.action = () => {
			throw new Error("no action should be dispatched when only undo remains")
		}

		try {
			let result = fuzz.run({
				seed: 12345,
				seedStep: 7,
				games: 2,
				echoEvery: 1000,
				stuckThreshold: 50,
				quiet: true
			})
			expect(result.exitCode).toBe(0)
			expect(result.reason).toBe("games_completed")
			expect(result.summary.completedGames).toBe(2)
			expect(result.summary.completionReasons).toEqual(["no_selectable_actions", "no_selectable_actions"])
			expect(result.summary.noActionEvents).toEqual([
				{ state: "idle_state", active: "ap", prompt: null },
				{ state: "idle_state", active: "ap", prompt: null }
			])
		} finally {
			rules.setup = originalSetup
			rules.view = originalView
			rules.action = originalAction
		}
	})

	test.each([12345, 22345, 32345, 42345, 52345, 62345])("历史剧本随机步进 seed=%i", (seed) => {
		let game = setupGame(seed)
		expectRetreatedInvariant(game)

		for (let step = 0; step < 180; step++) {
			let player = currentPlayer(game)
			let view

			expect(() => {
				view = rules.view(game, player)
			}).not.toThrow()

			expect(view).toBeTruthy()
			expect(view.prompt === null || typeof view.prompt === "string").toBe(true)

			if (game.state === "game_over") break

			let choice = pickAction(view, seed + step * 17)
			if (!choice) break

			expect(() => {
				game = rules.action(game, player, choice.name, choice.arg)
			}).not.toThrow()

			expect(game).toBeTruthy()
			expect(game.state).toBeTruthy()
			expectRetreatedInvariant(game)
		}
	})
})
