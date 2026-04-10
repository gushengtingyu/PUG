const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const fuzz = require("./runtime_fuzz_loop.js")
const { AP, CP, ELIMINATED } = Engine.constants

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece_by_name(faction, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
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
		let beachhead = findSpace("To Adana")

		expect(game.turn).toBe(3)
		expect(game.scenario_max_turn).toBe(17)
		expect(game.jihad).toBe(4)
		expect(game.control[cyprus] ?? AP).toBe(AP)
		expect(Engine.map.is_controlled_by(game, cyprus, AP)).toBe(true)
		expect(Engine.map.is_controlled_by(game, beachhead, AP)).toBe(true)
		expect(game.events["churchill_prevails"]).toBe(true)
		expect(game.events["kitchener_conversion"]).toBe(true)
		expect(game.events["liberate_suez_active"]).toBe(true)
		expect(game.events["indian_mutiny"]).toBeTruthy()
	})

	test("历史剧本中的塞浦路斯中立覆盖会被地图控制权判定正确识别", () => {
		let game = setupGame(202604081, "Historical")
		let cyprus = findSpace("Cyprus")
		let beachhead = findSpace("To Adana")

		expect(game.control[cyprus]).toBe("neutral")
		expect(game.control[beachhead]).toBe("neutral")
		expect(Engine.map.get_space_controller(game, cyprus)).toBe("neutral")
		expect(Engine.map.get_space_controller(game, beachhead)).toBe("neutral")
		expect(Engine.map.is_controlled_by(game, cyprus, AP)).toBe(false)
		expect(Engine.map.is_controlled_by(game, cyprus, CP)).toBe(false)
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

	test("行动阶段重复生成视图时会复用事件可打出判定缓存", () => {
		let game = setupGame(20260412, "Historical")
		let event = Engine.events.get_event_by_id(1)
		let originalCanPlay = event.can_play
		let canPlayCount = 0

		event.can_play = function (state) {
			canPlayCount += 1
			return originalCanPlay.call(this, state)
		}

		try {
			game.active = "ap"
			game.state = "play_card"
			game.hand_ap = [1]
			game.hand_cp = []

			let view1 = rules.view(game, game.active)
			let view2 = rules.view(game, game.active)

			expect(view1.actions).toBeTruthy()
			expect(view2.actions).toBeTruthy()
			expect(canPlayCount).toBe(1)
		} finally {
			event.can_play = originalCanPlay
		}
	})

	test("黄色事件会直接进入行动点流程而不经过额外确认态", () => {
		let game = setupGame(20260413, "Historical")
		let lawrenceCard = Engine.data.cards[18]
		let lawrenceOps = Engine.data.cards[18].ops

		game.active = "ap"
		game.state = "play_card"
		game.hand_ap = [18]
		game.hand_cp = []
		game.events = game.events || {}

		let next = rules.action(game, "Allied Powers", "play_event", 18)

		expect(next.state).toBe("activate_spaces")
		expect(next.ops).toBe(lawrenceOps)
		expect(next.card_ops).toBe(lawrenceOps)
		expect(next.event_ops_card).toBeUndefined()
		expect(next.events["lawrence"]).toBe(true)
		expect(next.hand_ap).not.toContain(18)
		if (lawrenceCard.remove) expect(next.removed_ap).toContain(18)
		else expect(next.discard_ap).toContain(18)
	})

	test("俄军替换点可按事件规则改用英军 RP 支付", () => {
		let game = setupGame(20260414, "Historical")
		let piece = findPiece(AP, "RU DIV #13")

		game.events = { kitchener: true }
		game.br_to_ru_rp_used = false
		game.rp_ap = { a: 0, br: 1, fr: 0, ru: 0, in: 0, it: 0 }
		game.pieces[piece] = ELIMINATED

		expect(Engine.replacement.can_afford_replacement(game, piece, 1)).toBe(true)

		Engine.replacement.spend_replacement_points(game, piece, 1)

		expect(game.rp_ap.br).toBe(0)
		expect(game.br_to_ru_rp_used).toBe(true)
	})

	test("ANZ 替换点优先消耗英军 RP，再回退到 A 池", () => {
		let game = setupGame(20260415, "Historical")
		let piece = findPiece(AP, "ANZ Elite DIV")

		game.rp_ap = { a: 1, br: 1, fr: 0, ru: 0, in: 0, it: 0 }
		game.pieces[piece] = ELIMINATED

		Engine.replacement.spend_replacement_points(game, piece, 1)

		expect(game.rp_ap.br).toBe(0)
		expect(game.rp_ap.a).toBe(1)
	})

	test("土军替换点可改用德军 RP 并累计受限转换额度", () => {
		let game = setupGame(20260416, "Historical")
		let piece = findPiece(CP, "TU Cavalry #5")

		game.events = {}
		game.ge_to_tu_rp_used = 0
		game.rp_cp = { a: 0, ge: 1, tu: 0 }
		game.pieces[piece] = ELIMINATED

		expect(Engine.replacement.can_afford_replacement(game, piece, 1)).toBe(true)

		Engine.replacement.spend_replacement_points(game, piece, 1)

		expect(game.rp_cp.ge).toBe(0)
		expect(game.ge_to_tu_rp_used).toBe(1)
	})

	test("索菲亚替换补给判定对离图保加利亚单位保持兼容", () => {
		let game = setupGame(20260417, "Historical")
		let piece = findPiece(CP, "BU 4 Army")
		let sofia = findSpace("SOFIA")

		game.control[sofia] = CP
		game.pieces[piece] = ELIMINATED

		expect(Engine.replacement.can_trace_supply_to_sofia(game, piece)).toBe(true)
	})

	test("罗马尼亚单位崩溃前可在敖德萨重建", () => {
		let game = setupGame(20260418, "Historical")
		let piece = findPiece(AP, "RO DIV #1")
		let odessa = findSpace("Odessa")

		game.events = { romania: true }
		game.pieces[piece] = ELIMINATED
		game.control[odessa] = AP

		expect(Engine.replacement.get_valid_rebuild_spaces(game, piece, AP)).toContain(odessa)
	})

	test("入侵事件选择岛屿基地后，后续单位只能继续放在同一岛屿基地", () => {
		let game = setupGame(20260419, "Historical")
		let firstUnit = findPiece(AP, "FR DIV #1")
		let secondUnit = findPiece(AP, "FR DIV #2")

		game.pieces[firstUnit] = 0
		game.pieces[secondUnit] = 0
		game.active = AP
		game.state = "event_invasion_place_units_island"
		game.event_ctx = {
			key: "test_invasion",
			data: {
				reinf_to_place: ["FR DIV #1", "FR DIV #2"]
			}
		}

		let initialView = rules.view(game, game.active)
		let availableBases = initialView.actions.space
		expect(Array.isArray(availableBases)).toBe(true)
		expect(availableBases.length).toBeGreaterThanOrEqual(2)

		let [chosenBase, otherBase] = availableBases
		expect(chosenBase).not.toBe(otherBase)

		rules.action(game, "Allied Powers", "space", chosenBase)

		expect(game.event_ctx.data.invasion_island_base).toBe(chosenBase)
		expect(game.pieces[firstUnit]).toBe(chosenBase)

		let followupView = rules.view(game, game.active)
		expect(followupView.actions.space).toContain(chosenBase)
		expect(followupView.actions.space).not.toContain(otherBase)

		rules.action(game, "Allied Powers", "space", otherBase)
		expect(game.pieces[secondUnit]).toBe(0)

		rules.action(game, "Allied Powers", "space", chosenBase)
		expect(game.pieces[secondUnit]).toBe(chosenBase)
	})

	test("加利波里入侵在不满足正式入侵条件时仍可作为增援事件打出", () => {
		let game = setupGame(2026041901, "Historical")
		let event = Engine.events.get_event_by_id(30)

		delete game.events["churchill_prevails"]

		expect(event.can_play(game)).toBe(true)

		game.active = AP
		game.state = "event_gallipoli_invasion_choice"
		game.event_ctx = {
			key: "gallipoli_invasion",
			data: {}
		}

		let view = rules.view(game, game.active)

		expect(view.actions.invasion).toBeUndefined()
		expect(view.actions.reinforcement).toBeTruthy()
	})

	test("加利波里与萨洛尼卡入侵会先获得未放置滩头并转入岛屿基地集结", () => {
		let gallipoli = setupGame(2026041902, "Historical")
		let salonika = setupGame(2026041903, "Historical")

		gallipoli.active = AP
		gallipoli.state = "event_gallipoli_invasion_choice"
		gallipoli.event_ctx = {
			key: "gallipoli_invasion",
			data: {}
		}

		rules.action(gallipoli, "Allied Powers", "invasion")

		expect(gallipoli.unplaced_beachheads).toBe(2)
		expect(gallipoli.state).toBe("event_invasion_place_units_island")
		expect(gallipoli.event_ctx.data.reinf_to_place).toEqual([
			"BR VIII Corps",
			"ANZ ANZAC",
			"FR DIV #1",
			"FR DIV #2",
			"BR DIV #1"
		])

		salonika.active = AP
		salonika.state = "event_salonika_invasion_choice"
		salonika.event_ctx = {
			key: "salonika_invasion",
			data: {}
		}

		rules.action(salonika, "Allied Powers", "invasion")

		expect(salonika.unplaced_beachheads).toBe(1)
		expect(salonika.state).toBe("event_invasion_place_units_island")
		expect(salonika.event_ctx.data.reinf_to_place).toEqual(["BR XVI Corps", "BR XII Corps", "FR DIV #1", "FR DIV #2"])
	})

	test("加利波里入侵可用预备军中的对应 SCU 将减员军团翻正", () => {
		let game = setupGame(2026041904, "Historical")
		let lemnos = findSpace("Lemnos")
		let reserveBox = Engine.game_utils.get_reserve_box(AP)
		let lcu = findPiece(AP, "BR VIII Corps")
		let scu = findPiece(AP, "BR DIV #1")

		game.active = AP
		game.state = "event_gallipoli_invasion_flip"
		game.event_ctx = {
			key: "gallipoli_invasion",
			data: {
				flip_lcu_if_scu: true,
				invasion_island_base: lemnos
			}
		}
		game.pieces[lcu] = lemnos
		game.pieces[scu] = reserveBox
		game.reduced = [lcu]

		rules.action(game, "Allied Powers", "piece", lcu)

		expect(Engine.game_utils.is_piece_reduced(game, lcu)).toBe(false)
	})

	test("加利波里入侵可先将地图上的对应 SCU 战略调整回预备军再翻正", () => {
		let game = setupGame(2026041905, "Historical")
		let lemnos = findSpace("Lemnos")
		let alexandria = findSpace("Alexandria")
		let reserveBox = Engine.game_utils.get_reserve_box(AP)
		let lcu = findPiece(AP, "ANZ ANZAC")
		let scu = findPiece(AP, "ANZ Elite DIV")

		for (let p = 1; p < Engine.data.pieces.length; p++) {
			let info = Engine.data.pieces[p]
			if (info && info.faction === AP && info.piece_class === "SCU" && Engine.game_utils.is_in_reserve(game, p)) {
				game.pieces[p] = alexandria
			}
		}

		game.active = AP
		game.state = "event_gallipoli_invasion_flip"
		game.event_ctx = {
			key: "gallipoli_invasion",
			data: {
				flip_lcu_if_scu: true,
				invasion_island_base: lemnos
			}
		}
		game.pieces[lcu] = lemnos
		game.pieces[scu] = alexandria
		game.reduced = [lcu]
		game.sr_moved = []

		let initialView = rules.view(game, game.active)
		expect(initialView.actions.piece).toContain(scu)

		rules.action(game, "Allied Powers", "piece", scu)

		expect(game.pieces[scu]).toBe(reserveBox)
		expect(game.sr_moved).toContain(scu)

		rules.action(game, "Allied Powers", "piece", lcu)

		expect(Engine.game_utils.is_piece_reduced(game, lcu)).toBe(false)
	})

	test("滩头在补给与海上战略调整判定中按港口处理", () => {
		let game = setupGame(20260420, "Historical")
		let beachhead = Engine.data.spaces.findIndex((space) => space && space.beach_for === "Cyprus")
		let sourcePort = findSpace("Alexandria")
		let movingPiece = findPiece(AP, "BR DIV #2")
		let beachheadPiece = findPiece(AP, "BR DIV #3")

		expect(beachhead).toBeGreaterThan(0)

		game.beachheads = [beachhead]
		game.pieces[movingPiece] = sourcePort
		game.pieces[beachheadPiece] = beachhead
		game.control[sourcePort] = AP

		expect(Engine.map.can_trace_supply_to_ap_port(game, beachhead, AP, true)).toBe(true)
		expect(Engine.map.can_sr_to_space(game, movingPiece, beachhead, AP)).toBe(true)
	})

	test("从滩头撤回岛屿基地的移动会在岛屿基地强制停止", () => {
		let game = setupGame(20260421, "Historical")
		let lemnos = findSpace("Lemnos")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Lemnos" && space.connections.includes(lemnos)
		)
		let piece = findPiece(AP, "BR DIV #1")

		expect(beachhead).toBeGreaterThan(0)

		game.active = AP
		game.state = "move_stack"
		game.beachheads = [beachhead]
		game.pieces[piece] = beachhead
		game.move = {
			initial: beachhead,
			current: beachhead,
			spaces_moved: 0,
			pieces: [piece],
			touched_spaces: [beachhead]
		}

		rules.action(game, "Allied Powers", "space", lemnos)

		expect(game.pieces[piece]).toBe(lemnos)
		expect(game.move).toBeUndefined()
	})

	test("撤退到岛屿基地时会将整次撤退视为完成", () => {
		let game = setupGame(20260422, "Historical")
		let lemnos = findSpace("Lemnos")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Lemnos" && space.connections.includes(lemnos)
		)
		let piece = findPiece(AP, "BR DIV #2")

		expect(beachhead).toBeGreaterThan(0)

		game.beachheads = [beachhead]
		game.pieces[piece] = beachhead

		let valid = Engine.combat.get_valid_retreat_spaces(game, piece, [], 2, true)

		expect(valid).toContain(lemnos)
	})

	test("没有预备滩头时不能直接进入潜在滩头空间", () => {
		let game = setupGame(20260423, "Historical")
		let lemnos = findSpace("Lemnos")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Lemnos" && space.connections.includes(lemnos)
		)
		let piece = findPiece(AP, "BR DIV #3")

		expect(beachhead).toBeGreaterThan(0)

		game.pieces[piece] = lemnos
		game.move = {
			initial: lemnos,
			current: lemnos,
			spaces_moved: 0,
			pieces: [piece],
			touched_spaces: [lemnos]
		}

		expect(Engine.map.can_piece_move_to(game, piece, beachhead, AP)).toBe(false)
	})

	test("从岛屿基地发起入侵时会消耗预备滩头并在滩头停下", () => {
		let game = setupGame(20260424, "Historical")
		let lemnos = findSpace("Lemnos")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Lemnos" && space.connections.includes(lemnos)
		)
		let piece = findPiece(AP, "BR DIV #3")

		expect(beachhead).toBeGreaterThan(0)

		game.active = AP
		game.state = "move_stack"
		game.unplaced_beachheads = 1
		game.pieces[piece] = lemnos
		game.move = {
			initial: lemnos,
			current: lemnos,
			spaces_moved: 0,
			pieces: [piece],
			touched_spaces: [lemnos]
		}

		rules.action(game, "Allied Powers", "space", beachhead)

		expect(game.pieces[piece]).toBe(beachhead)
		expect(Engine.map.is_beachhead_space(game, beachhead)).toBe(true)
		expect(game.unplaced_beachheads).toBe(0)
		expect(game.move).toBeUndefined()
	})

	test("安全撤离会把单位撤回岛屿基地但保留滩头标记", () => {
		let game = setupGame(20260425, "Historical")
		let lemnos = findSpace("Lemnos")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Lemnos" && space.connections.includes(lemnos)
		)
		let piece = findPiece(AP, "BR DIV #1")

		expect(beachhead).toBeGreaterThan(0)

		game.active = AP
		game.state = "play_card"
		game.hand_ap = []
		game.hand_cp = []
		game.beachheads = [beachhead]
		game.pieces[piece] = beachhead
		let originalIsInSupply = Engine.map.is_in_supply
		let originalTrace = Engine.map.can_trace_piece_supply_to_sources

		Engine.map.is_in_supply = function (state, space, faction, p) {
			if (p === piece && faction === AP) return Engine.map.is_beachhead_space(state, beachhead)
			return originalIsInSupply.call(this, state, space, faction, p)
		}
		Engine.map.can_trace_piece_supply_to_sources = function (state, p, sources, options) {
			if (p === piece) {
				let sourceList = Array.isArray(sources) ? sources : [sources]
				return sourceList.includes(beachhead)
			}
			return originalTrace.call(this, state, p, sources, options)
		}

		try {
			rules.action(game, "Allied Powers", "safe_withdraw", beachhead)

			expect(game.pieces[piece]).toBe(lemnos)
			expect(Engine.map.is_beachhead_space(game, beachhead)).toBe(true)
		} finally {
			Engine.map.is_in_supply = originalIsInSupply
			Engine.map.can_trace_piece_supply_to_sources = originalTrace
		}
	})

	test("火线下撤离会移除非巴尔干滩头并提高圣战等级", () => {
		let game = setupGame(20260426, "Historical")
		let bahrain = findSpace("Bahrain")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Bahrain" && space.connections.includes(bahrain)
		)
		let adjacentMainland = Engine.data.spaces[beachhead].connections.find((s) => s !== bahrain)
		let apPiece = findPiece(AP, "BR DIV #2")
		let cpPiece = findPiece(CP, "TU I Corps")
		let jihadBefore = game.jihad

		expect(beachhead).toBeGreaterThan(0)
		expect(adjacentMainland).toBeGreaterThan(0)

		game.active = AP
		game.state = "play_card"
		game.hand_ap = []
		game.hand_cp = []
		game.beachheads = [beachhead]
		game.pieces[apPiece] = beachhead
		game.pieces[cpPiece] = adjacentMainland
		let originalIsInSupply = Engine.map.is_in_supply
		let originalTrace = Engine.map.can_trace_piece_supply_to_sources

		Engine.map.is_in_supply = function (state, space, faction, p) {
			if (p === apPiece && faction === AP) return Engine.map.is_beachhead_space(state, beachhead)
			return originalIsInSupply.call(this, state, space, faction, p)
		}
		Engine.map.can_trace_piece_supply_to_sources = function (state, p, sources, options) {
			if (p === apPiece) {
				let sourceList = Array.isArray(sources) ? sources : [sources]
				return sourceList.includes(beachhead)
			}
			return originalTrace.call(this, state, p, sources, options)
		}

		try {
			rules.action(game, "Allied Powers", "withdraw_under_fire", beachhead)

			expect(game.pieces[apPiece]).toBe(bahrain)
			expect(Engine.map.is_beachhead_space(game, beachhead)).toBe(false)
			expect(game.jihad).toBe(jihadBefore + 1)
		} finally {
			Engine.map.is_in_supply = originalIsInSupply
			Engine.map.can_trace_piece_supply_to_sources = originalTrace
		}
	})

	test("移除空滩头需要二次确认", () => {
		let game = setupGame(20260427, "Historical")
		let lemnos = findSpace("Lemnos")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Lemnos" && space.connections.includes(lemnos)
		)

		expect(beachhead).toBeGreaterThan(0)

		game.active = AP
		game.state = "play_card"
		game.hand_ap = []
		game.hand_cp = []
		game.beachheads = [beachhead]

		// 1. 发起移除
		rules.action(game, "Allied Powers", "remove_beachhead", beachhead)

		// 应该进入确认状态，且滩头尚未移除
		expect(game.state).toBe("confirm_remove_beachhead")
		expect(game.remove_beachhead_space).toBe(beachhead)
		expect(Engine.map.is_beachhead_space(game, beachhead)).toBe(true)

		// 2. 确认移除
		rules.action(game, "Allied Powers", "confirm")

		// 应该回到 play_card 状态，且滩头已移除
		expect(game.state).toBe("play_card")
		expect(Engine.map.is_beachhead_space(game, beachhead)).toBe(false)
		expect(game.remove_beachhead_space).toBeUndefined()
	})

	test("取消移除空滩头会返回原状态", () => {
		let game = setupGame(20260428, "Historical")
		let lemnos = findSpace("Lemnos")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Lemnos" && space.connections.includes(lemnos)
		)

		game.active = AP
		game.state = "play_card"
		game.hand_ap = []
		game.hand_cp = []
		game.beachheads = [beachhead]

		// 1. 发起移除
		rules.action(game, "Allied Powers", "remove_beachhead", beachhead)
		expect(game.state).toBe("confirm_remove_beachhead")

		// 2. 取消移除
		rules.action(game, "Allied Powers", "cancel")

		// 应该回到 play_card 状态，且滩头依然存在
		expect(game.state).toBe("play_card")
		expect(Engine.map.is_beachhead_space(game, beachhead)).toBe(true)
		expect(game.remove_beachhead_space).toBeUndefined()
	})
})
