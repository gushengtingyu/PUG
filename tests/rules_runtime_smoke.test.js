const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const fuzz = require("./runtime_fuzz_loop.js")

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

describe("运行时烟雾测试", () => {
	test("剧本可以完成初始化并生成当前视图", () => {
		let historical = setupGame(20260409, "Historical")
		let limitedWar = setupGame(20260408, "LIMITED WAR")

		for (let game of [historical, limitedWar]) {
			let view = rules.view(game, game.active)
			expect(game.state).toBeTruthy()
			expect(game.active).toBeTruthy()
			expect(view.active).toBe(game.active)
			expect(typeof view.prompt).toBe("string")
			expect(view.actions).toBeTruthy()
		}
	})

	test("LIMITED WAR 剧本初始圣战等级为 4，且相关前置事件已预置", () => {
		let game = setupGame(20260408, "LIMITED WAR")
		let cyprus = Engine.game_utils.find_space("Cyprus")

		expect(game.turn).toBe(3)
		expect(game.scenario_max_turn).toBe(17)
		expect(game.jihad).toBe(4)
		expect(game.control[cyprus]).toBe("ap")
		expect(game.events["churchill_prevails"]).toBe(true)
		expect(game.events["kitchener_conversion"]).toBe(true)
		expect(game.events["liberate_suez_active"]).toBe(true)
		expect(game.events["indian_mutiny"]).toBeTruthy()
	})

	test("运行时 fuzz 框架可以完成一次短流程抽样", () => {
		let result = fuzz.run({
			seed: 20260409,
			seedStep: 1,
			scenario: "Historical",
			games: 1,
			maxSteps: 40,
			maxDuration: 0,
			echoEvery: 1000,
			stuckThreshold: 120,
			quiet: true
		})

		expect(result.exitCode).toBe(0)
		expect(result.reason).toBe("max_steps")
		expect(result.summary.completedGames).toBe(0)
		expect(result.summary.totalSteps).toBeGreaterThan(0)
	})

	test("PARVUS TO BERLIN 始终在固定回合放置革命相关标记", () => {
		let game = setupGame(20260410, "LIMITED WAR")
		let event = Engine.events.get_event_by_id(89)

		game.turn = 10
		game.russian_vp = 3
		event.handler(game)

		let view = rules.view(game, game.active)

		expect(game.events["parvus_to_berlin"]).toBe(5)
		expect(game.events["russian_revolution_timer"]).toBe(9)
		expect(game.god_save_the_tsar).toBe(8)
		expect(view.parvus_to_berlin).toBe(5)
		expect(view.russian_revolution_timer).toBe(9)
		expect(view.long_live_czar).toBe(8)
	})

	test("不冻港会绑定动态 VP 港口并推迟上帝保佑沙皇标记", () => {
		let game = setupGame(20260411, "LIMITED WAR")
		let event = Engine.events.get_event_by_id(89)
		let warmWaterPort = ["Mugla", "Antalya", "Mersin", "Adana", "Alexandretta", "Beirut", "Haifa", "Jaffa", "Fao", "Kuwait", "Smyrna"]
			.map((name) => Engine.game_utils.find_space(name))
			.find((space) => space >= 0 && !Engine.data.spaces[space].vp)

		expect(warmWaterPort).toBeTruthy()

		game.turn = 6
		game.russian_vp = 2
		game.vp = 0
		game.control[warmWaterPort] = "ap"

		event.handler(game)
		Engine.events.apply_warm_water_port_effect(game, warmWaterPort)

		let view = rules.view(game, game.active)

		expect(game.warm_water_port_vp).toBe(warmWaterPort)
		expect(game.god_save_the_tsar).toBe(9)
		expect(view.long_live_czar).toBe(9)

		Engine.set_control(game, warmWaterPort, "cp")

		expect(game.vp).toBe(1)
		expect(game.russian_vp).toBe(1)
	})
})
