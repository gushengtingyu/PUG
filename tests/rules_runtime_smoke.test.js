const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const fuzz = require("./runtime_fuzz_loop.js")
const { AP, CP, ELIMINATED } = Engine.constants

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

function clearSpace(game, space) {
	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === space) {
			game.pieces[p] = ELIMINATED
		}
	}
}

function findTemporaryOverstackScenario(game, faction = AP) {
	let groupedPieces = new Map()
	for (let p = 0; p < Engine.data.pieces.length; p++) {
		let piece = Engine.data.pieces[p]
		if (!piece || piece.faction !== faction || piece.mf < 1) continue
		if (!Engine.map.is_stack_counted_piece(p)) continue
		if (piece.type === "tribe") continue
		let key = `${piece.nation}:${piece.mf}`
		if (!groupedPieces.has(key)) groupedPieces.set(key, [])
		groupedPieces.get(key).push(p)
	}

	for (let [key, pieces] of groupedPieces) {
		if (pieces.length < 6) continue
		let [nation, mfText] = key.split(":")
		let mf = Number(mfText)
		let movablePieces = pieces.slice(0, 6)
		let movers = movablePieces.slice(0, 3)
		let resolvers = movablePieces.slice(3, 6)
		let candidateSpaces = Engine.data.spaces
			.map((space, id) => ({ space, id }))
			.filter(
				({ space, id }) =>
					id > 0 &&
					space &&
					!Engine.map.is_unlimited_stack_space(game, id) &&
					space.terrain !== "desert" &&
					space.nation !== "gr"
			)

		for (let { id: b } of candidateSpaces) {
			let neighbors = Engine.map
				.get_connected_spaces(game, b, nation, faction, movers[0])
				.filter(
					(s) =>
						s > 0 &&
						Engine.data.spaces[s] &&
						!Engine.map.is_unlimited_stack_space(game, s) &&
						Engine.data.spaces[s].terrain !== "desert" &&
						Engine.data.spaces[s].nation !== "gr"
				)
			for (let a of neighbors) {
				for (let c of neighbors) {
					if (a === c) continue
					for (let p = 0; p < game.pieces.length; p++) {
						if (game.pieces[p] === a || game.pieces[p] === b || game.pieces[p] === c) {
							game.pieces[p] = ELIMINATED
						}
					}
					for (let p of movers) game.pieces[p] = a
					for (let p of resolvers) game.pieces[p] = b
					Engine.set_control(game, a, faction)
					Engine.set_control(game, b, faction)
					Engine.set_control(game, c, faction)

					let move_cost = Math.max(...movers.map((p) => Engine.map.get_movement_cost(game, p, b)))
					if (move_cost > mf) continue

					game.active = faction
					game.state = "move_stack"
					game.moved = []
					game.activated = { move: [a, b], attack: [] }
					game.move = {
						initial: a,
						current: a,
						spaces_moved: mf - move_cost,
						pieces: movers.slice(),
						touched_spaces: [a]
					}

					if (!Engine.map.can_stack_move_to(game, b, faction)) continue

					game.moved = movers.slice()
					game.move = {
						initial: b,
						current: b,
						spaces_moved: 0,
						pieces: resolvers.slice(),
						touched_spaces: [b]
					}

					if (!resolvers.every((p) => Engine.map.can_piece_move_to(game, p, c, faction))) continue
					if (!Engine.map.can_stack_move_to(game, c, faction)) continue

					let resolver_move_cost = Math.max(...resolvers.map((p) => Engine.map.get_movement_cost(game, p, c)))
					if (resolver_move_cost > mf) continue

					game.moved = []
					game.move = {
						initial: a,
						current: a,
						spaces_moved: mf - move_cost,
						pieces: movers.slice(),
						touched_spaces: [a]
					}

					return { faction, movers, resolvers, a, b, c, mf, move_cost, resolver_move_cost }
				}
			}
		}
	}

	throw new Error("未找到可用于临时超堆叠测试的移动场景")
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

	test("阿拉伯起义放置到麦加后会处于完全补给", () => {
		let game = setupGame(202604131, "Historical")
		let mecca = findSpace("Mecca")
		let event = Engine.events.get_event_by_id(16)
		let unitNames = ["Arab faisal Revolt", "Arab Revolt #1", "Arab Revolt #2"]

		game.events["lawrence"] = true
		game.jihad = 0

		expect(event.can_play(game)).toBe(true)

		event.handler(game)

		for (let name of unitNames) {
			let piece = findPiece(AP, name)
			rules.reinforce(game, name, AP, mecca)
			expect(Engine.map.get_supply_status(game, mecca, AP, piece)).toBe("FULL")
		}
	})

	test("鲁贝尔堡的背叛会由同盟国统一迁移希腊部队并完整接收多里安二级战壕", () => {
		let game = setupGame(202604131, "Historical")
		let event = Engine.events.get_event_by_id(72)
		let salonika = findSpace("Salonika")
		let doiran = findSpace("Doiran")
		let lamia = findSpace("Lamia")
		let athens = findSpace("ATHENS")
		let strumica = findSpace("Strumica")
		let veles = findSpace("Veles")
		let greek1 = findPiece(AP, "GR DIV #1")
		let greek2 = findPiece(AP, "GR DIV #2")
		let greek3 = findPiece(AP, "GR DIV #3")
		let apUnit = findPiece(AP, "BR IX Corps")
		let cpUnit1 = findPiece(CP, "BU DIV #1")
		let cpUnit2 = findPiece(CP, "BU DIV #2")

		game.pieces[apUnit] = salonika
		game.pieces[cpUnit1] = strumica
		game.pieces[cpUnit2] = veles

		expect(event.can_play(game)).toBe(true)
		expect(Engine.neutral.is_greece_neutral(game)).toBe(true)
		expect(Engine.game_utils.has_trench(game, doiran)).toBe(2)

		event.handler(game)

		expect(game.state).toBe("event_rupel_move_greek_units")
		expect(game.active).toBe(CP)
		expect(game.event_ctx).toMatchObject({
			key: "rupel",
			data: {
				greek_units: expect.arrayContaining([greek1, greek2, greek3]),
				destinations: [lamia, athens]
			}
		})

		rules.action(game, "Central Powers", "space", lamia)

		expect(game.pieces[greek1]).toBe(lamia)
		expect(game.pieces[greek2]).toBe(lamia)
		expect(game.pieces[greek3]).toBe(lamia)
		expect(game.pieces[cpUnit1]).toBe(doiran)
		expect(game.pieces[cpUnit2]).toBe(doiran)
		expect(Engine.map.get_space_controller(game, doiran)).toBe(CP)
		expect(Engine.game_utils.has_trench(game, doiran)).toBe(2)
		expect(Engine.neutral.is_greece_neutral(game)).toBe(true)
		expect(game.event_ctx).toBeUndefined()
		expect(game.state).not.toBe("event_rupel_move_greek_units")
	})

	test("德国的波斯密谋会完整放置起义军与三个起义标记，并让波斯起义军在中立波斯继续活动", () => {
		let game = setupGame(202604132, "Historical")
		let event = Engine.events.get_event_by_id(78)
		let baghdad = findSpace("Baghdad")
		let insurgents = findPiece(CP, "PE Uprising")

		Engine.set_control(game, baghdad, CP)
		game.active = CP
		game.state = "play_card"
		game.hand_ap = []
		game.hand_cp = [78]
		game.events = game.events || {}
		delete game.events["persian_push"]
		delete game.events["secret_treaty"]

		expect(event.can_play(game)).toBe(true)

		rules.action(game, "Central Powers", "play_event", 78)
		expect(game.state).toBe("event_german_intrigues_persia_unit")
		expect(game.events["german_intrigue_persia"]).toBe(true)

		let unitView = rules.view(game, CP)
		let candidateUnitSpaces = unitView.actions.space || []
		let unitSpace =
			candidateUnitSpaces.find((s) =>
				(Engine.data.spaces[s].connections || []).some((next) => Engine.data.spaces[next]?.area === "persia")
			) || candidateUnitSpaces[0]

		expect(unitSpace).toBeGreaterThan(0)

		rules.action(game, "Central Powers", "space", unitSpace)
		expect(game.pieces[insurgents]).toBe(unitSpace)
		expect(game.state).toBe("event_german_intrigues_persia_markers")

		let placedMarkers = []
		for (let i = 0; i < 3; i++) {
			let markerView = rules.view(game, CP)
			let markerSpace = (markerView.actions.space || [])[0]
			expect(markerSpace).toBeGreaterThan(0)
			placedMarkers.push(markerSpace)
			rules.action(game, "Central Powers", "space", markerSpace)
		}

		expect(game.persian_uprising_markers).toEqual(placedMarkers)
		expect(game.state).toBe("confirm_event")

		let finalView = rules.view(game, CP)
		expect(finalView.persian_uprising_markers).toEqual(placedMarkers)
		expect(Engine.map.is_disrupted_by_enemy(game, placedMarkers[0], AP)).toBe(true)

		let adjacentPersia = (Engine.data.spaces[unitSpace].connections || []).find(
			(next) => next > 0 && Engine.data.spaces[next] && Engine.data.spaces[next].area === "persia"
		)
		expect(adjacentPersia).toBeGreaterThan(0)
		game.move = {
			initial: unitSpace,
			current: unitSpace,
			spaces_moved: 0,
			pieces: [insurgents],
			touched_spaces: [unitSpace]
		}
		expect(Engine.map.can_piece_move_to(game, insurgents, adjacentPersia, CP)).toBe(true)
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

	test("阿斯奎斯-劳合乔治联合政府提供无限英转俄并允许骑兵师进地图或预备军格", () => {
		let game = setupGame(202604141, "Historical")
		let event = Engine.events.get_event_by_id(33)
		let cavalry = findPiece(AP, "BR Cavalry #2")
		let ruDivision = findPiece(AP, "RU DIV #13")
		let lcuReserve = Engine.game_utils.get_lcu_reserve_box(AP)
		let scuReserve = Engine.game_utils.get_scu_reserve_box(AP)

		event.handler(game)

		expect(game.mo_ap_modifier).toBe(1)
		expect(game.rp_ap.br).toBeGreaterThanOrEqual(2)
		expect(game.events["asquith_coalition"]).toBe(true)
		expect(game.state).toBe("event_place_reinforcements")

		let view = rules.view(game, game.active)
		let spaces = view.actions.space
		let mapSpace = spaces.find((space) => space !== lcuReserve && space !== scuReserve)

		expect(spaces).toContain(scuReserve)
		expect(spaces).not.toContain(lcuReserve)
		expect(mapSpace).toBeTruthy()

		rules.action(game, "Allied Powers", "space", scuReserve)
		expect(game.pieces[cavalry]).toBe(scuReserve)

		game.rp_ap = { a: 0, br: 2, fr: 0, ru: 0, in: 0, it: 0 }
		game.pieces[ruDivision] = ELIMINATED

		expect(Engine.replacement.can_afford_replacement(game, ruDivision, 2)).toBe(true)

		Engine.replacement.spend_replacement_points(game, ruDivision, 2)

		expect(game.rp_ap.br).toBe(0)
		expect(game.br_to_ru_rp_used).not.toBe(true)
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

	test("印度增援会按单位限制地图与预备格入口", () => {
		let game = setupGame(20260419001, "Historical")
		let event = Engine.events.get_event_by_id(26)
		let tigris = findPiece(AP, "IN Tigris Corps")
		let secondCorps = findPiece(AP, "IN 2nd Corps")
		let division = findPiece(AP, "IN DIV #7")
		let lcuReserve = Engine.game_utils.get_lcu_reserve_box(AP)
		let scuReserve = Engine.game_utils.get_scu_reserve_box(AP)

		event.handler(game)

		let firstView = rules.view(game, game.active)
		let firstSpaces = firstView.actions.space
		let firstMapSpace = firstSpaces.find((space) => space !== lcuReserve && space !== scuReserve)

		expect(firstSpaces).not.toContain(lcuReserve)
		expect(firstSpaces).not.toContain(scuReserve)
		expect(firstMapSpace).toBeTruthy()

		rules.action(game, "Allied Powers", "space", firstMapSpace)

		expect(game.pieces[tigris]).toBe(firstMapSpace)

		let secondView = rules.view(game, game.active)
		expect(secondView.actions.space).toEqual([lcuReserve])

		rules.action(game, "Allied Powers", "space", lcuReserve)

		expect(game.pieces[secondCorps]).toBe(lcuReserve)

		let thirdView = rules.view(game, game.active)
		let thirdSpaces = thirdView.actions.space
		let thirdMapSpace = thirdSpaces.find((space) => space !== scuReserve)

		expect(thirdSpaces).toContain(scuReserve)
		expect(thirdSpaces).not.toContain(lcuReserve)
		expect(thirdMapSpace).toBeTruthy()

		rules.action(game, "Allied Powers", "space", scuReserve)

		expect(game.pieces[division]).toBe(scuReserve)
		expect(game.event_ctx).toBeUndefined()
		expect(game.state).not.toBe("event_place_reinforcements")
	})

	test("劳合乔治接管指挥权会先强制沙漠军团进入预备军格，再放置地图增援", () => {
		let game = setupGame(20260419006, "Historical")
		let event = Engine.events.get_event_by_id(55)
		let desertCorps = findPiece(AP, "ANZ Desert Corps")
		let division = findPiece(AP, "BR DIV #7")
		let cavalry = findPiece(AP, "BR Cavalry #4")
		let lcuReserve = Engine.game_utils.get_lcu_reserve_box(AP)
		let scuReserve = Engine.game_utils.get_scu_reserve_box(AP)

		event.handler(game)

		let firstView = rules.view(game, game.active)
		expect(firstView.actions.space).toEqual([lcuReserve])

		rules.action(game, "Allied Powers", "space", lcuReserve)
		expect(game.pieces[desertCorps]).toBe(lcuReserve)

		let secondView = rules.view(game, game.active)
		let secondSpaces = secondView.actions.space
		let secondMapSpace = secondSpaces.find((space) => space !== lcuReserve && space !== scuReserve)

		expect(secondSpaces).not.toContain(lcuReserve)
		expect(secondSpaces).not.toContain(scuReserve)
		expect(secondMapSpace).toBeTruthy()

		rules.action(game, "Allied Powers", "space", secondMapSpace)
		expect(game.pieces[division]).toBe(secondMapSpace)

		let thirdView = rules.view(game, game.active)
		let thirdSpaces = thirdView.actions.space
		let thirdMapSpace = thirdSpaces.find((space) => space !== lcuReserve && space !== scuReserve)

		expect(thirdSpaces).not.toContain(lcuReserve)
		expect(thirdSpaces).not.toContain(scuReserve)
		expect(thirdMapSpace).toBeTruthy()

		rules.action(game, "Allied Powers", "space", thirdMapSpace)
		expect(game.pieces[cavalry]).toBe(thirdMapSpace)
		expect(game.state).not.toBe("event_place_reinforcements")
	})

	test("土耳其增援81会先把军团放入预备军格，再放置地图师级单位", () => {
		let game = setupGame(20260419007, "Historical")
		let event = Engine.events.get_event_by_id(81)
		let lcuReserve = Engine.game_utils.get_lcu_reserve_box(CP)
		let scuReserve = Engine.game_utils.get_scu_reserve_box(CP)
		let reserveUnits = ["TU XIV Corps", "TU XV Corps", "TU XVI Corps", "TU XVII Corps", "TU-A XVIII Corps"]

		event.handler(game)

		for (let unitName of reserveUnits) {
			let view = rules.view(game, game.active)
			expect(view.actions.space).toEqual([lcuReserve])
			rules.action(game, "Central Powers", "space", lcuReserve)
			expect(game.pieces[findPiece(CP, unitName)]).toBe(lcuReserve)
		}

		let mapView = rules.view(game, game.active)
		let mapSpaces = mapView.actions.space
		let mapSpace = mapSpaces.find((space) => space !== lcuReserve && space !== scuReserve)

		expect(mapSpaces).not.toContain(lcuReserve)
		expect(mapSpaces).not.toContain(scuReserve)
		expect(mapSpace).toBeTruthy()
	})

	test("土耳其增援92会先完成地图增援，再进入战壕放置状态", () => {
		let game = setupGame(20260419008, "Historical")
		let event = Engine.events.get_event_by_id(92)
		let lcuReserve = Engine.game_utils.get_lcu_reserve_box(CP)
		let scuReserve = Engine.game_utils.get_scu_reserve_box(CP)

		event.handler(game)
		expect(game.state).toBe("event_place_reinforcements")

		for (let i = 0; i < 4; i++) {
			let view = rules.view(game, game.active)
			let spaces = view.actions.space
			let mapSpace = spaces.find((space) => space !== lcuReserve && space !== scuReserve)

			expect(spaces).not.toContain(lcuReserve)
			expect(spaces).not.toContain(scuReserve)
			expect(mapSpace).toBeTruthy()

			rules.action(game, "Central Powers", "space", mapSpace)
		}

		expect(game.state).toBe("event_turkish_reinf_92_trench")
	})

	test("高加索军队重组会在消灭足额军团后转入地图增援而不是预备军格", () => {
		let game = setupGame(20260419009, "Historical")
		let event = Engine.events.get_event_by_id(107)
		let lcuReserve = Engine.game_utils.get_lcu_reserve_box(CP)
		let scuReserve = Engine.game_utils.get_scu_reserve_box(CP)

		event.handler(game)
		expect(game.state).toBe("event_caucasian_army_reforms_eliminate")

		for (let i = 0; i < 4; i++) {
			let view = rules.view(game, game.active)
			rules.action(game, "Central Powers", "piece", view.actions.piece[0])
		}

		expect(game.state).toBe("event_place_reinforcements")

		let view = rules.view(game, game.active)
		let spaces = view.actions.space
		let mapSpace = spaces.find((space) => space !== lcuReserve && space !== scuReserve)

		expect(spaces).not.toContain(lcuReserve)
		expect(spaces).not.toContain(scuReserve)
		expect(mapSpace).toBeTruthy()
	})

	test("印度增援36会提供四个单位且只能从地图入口进入", () => {
		let game = setupGame(20260419010, "Historical")
		let event = Engine.events.get_event_by_id(36)
		let lcuReserve = Engine.game_utils.get_lcu_reserve_box(AP)
		let scuReserve = Engine.game_utils.get_scu_reserve_box(AP)
		let units = ["IN 17th DIV", "IN 18th DIV", "IN Cavalry #4", "IN Cavalry #5"]

		event.handler(game)
		expect(game.event_ctx.data.reinf_to_place).toEqual(units)

		for (let unitName of units) {
			let view = rules.view(game, game.active)
			let spaces = view.actions.space
			let mapSpace = spaces.find((space) => space !== lcuReserve && space !== scuReserve)

			expect(spaces).not.toContain(lcuReserve)
			expect(spaces).not.toContain(scuReserve)
			expect(mapSpace).toBeTruthy()

			rules.action(game, "Allied Powers", "space", mapSpace)
			expect(game.pieces[findPiece(AP, unitName)]).toBe(mapSpace)
		}

		expect(game.state).not.toBe("event_place_reinforcements")
	})

	test("加里波利入侵在不满足正式入侵条件时仍可作为增援事件打出", () => {
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

	test("入侵事件当增援打出时会进入正常增援放置状态", () => {
		let game = setupGame(202604190101, "Historical")

		game.active = AP
		game.state = "event_gallipoli_invasion_choice"
		game.event_ctx = {
			key: "gallipoli_invasion",
			data: {}
		}

		rules.action(game, "Allied Powers", "reinforcement")

		let view = rules.view(game, game.active)
		expect(game.state).toBe("event_place_reinforcements")
		expect(game.event_ctx.data.reinf_to_place).toEqual([
			"BR VIII Corps",
			"ANZ ANZAC",
			"FR DIV #1",
			"FR DIV #2",
			"BR DIV #1"
		])
		expect(view.prompt).toContain("加里波利入侵（增援）")
		expect(view.actions.space.length).toBeGreaterThan(0)
	})

	test("普通英国增援不能放置到萨洛尼卡", () => {
		let game = setupGame(202604190102, "Historical")
		let salonika = findSpace("Salonika")

		game.control[salonika] = AP

		expect(Engine.reinf_helpers.is_br.check(game, salonika)).toBe(false)
	})

	test("萨洛尼卡入侵会先让法国东方集团军进入标准增援放置交互", () => {
		let game = setupGame(202604190103, "Historical")
		let event = Engine.events.get_event_by_id(34)
		let corpsAssets = findSpace("AP Corps Assets")

		event.handler(game)

		let view = rules.view(game, game.active)
		expect(game.state).toBe("event_place_reinforcements")
		expect(view.prompt).toContain("萨洛尼卡入侵")
		expect(view.actions.space).toContain(corpsAssets)

		rules.action(game, "Allied Powers", "space", corpsAssets)

		expect(game.state).toBe("event_salonika_invasion_choice")
	})

	test("基钦纳入侵从开局预备增援到当作增援打出都会走交互流程", () => {
		let game = setupGame(202604190104, "Historical")
		let event = Engine.events.get_event_by_id(22)
		let reserveBox = Engine.game_utils.get_reserve_box(AP)

		event.handler(game)

		let firstView = rules.view(game, game.active)
		expect(game.state).toBe("event_place_reinforcements")
		expect(firstView.prompt).toContain("基钦纳入侵")
		expect(firstView.actions.space).toContain(reserveBox)

		rules.action(game, "Allied Powers", "space", reserveBox)
		expect(game.state).toBe("event_place_reinforcements")

		rules.action(game, "Allied Powers", "space", reserveBox)
		expect(game.state).toBe("event_kitcheners_invasion_choice")

		rules.action(game, "Allied Powers", "reinforcement")

		let reinforcementView = rules.view(game, game.active)
		expect(game.state).toBe("event_place_reinforcements")
		expect(reinforcementView.prompt).toContain("基钦纳入侵（增援）")
		expect(reinforcementView.actions.space.length).toBeGreaterThan(0)
	})

	test("同一回合打出过一次正式入侵后，后续入侵牌只能作为增援处理", () => {
		let game = setupGame(20260419011, "Historical")

		game.events["ap_invasion_event"] = game.turn
		game.active = AP
		game.state = "event_salonika_invasion_choice"
		game.event_ctx = {
			key: "salonika_invasion",
			data: {}
		}

		let view = rules.view(game, game.active)

		expect(view.actions.invasion).toBeUndefined()
		expect(view.actions.reinforcement).toBeTruthy()
	})

	test("加里波利与萨洛尼卡入侵会先获得未放置滩头并转入岛屿基地集结", () => {
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

		let salonikaView = rules.view(salonika, salonika.active)
		expect(salonikaView.prompt).toContain("萨洛尼卡入侵：")
	})

	test("海上入侵放置滩头时不会再把预备军格当作合法位置", () => {
		let game = setupGame(20260419031, "Historical")
		let reserveBox = Engine.game_utils.get_reserve_box(AP)
		let lemnosBeachheads = Engine.data.spaces
			.map((space, id) => ({ space, id }))
			.filter(({ space, id }) => id > 0 && space && space.beach_for === "Lemnos")
			.map(({ id }) => id)

		expect(lemnosBeachheads.length).toBeGreaterThanOrEqual(3)

		let [existingBeachhead, cpControlledBeachhead, legalBeachhead] = lemnosBeachheads
		game.active = AP
		game.state = "event_invasion_place_beachhead"
		game.beachheads = [existingBeachhead]
		game.control[cpControlledBeachhead] = CP
		game.event_ctx = {
			key: "test_invasion",
			data: {
				beachheads_to_place: 1
			}
		}

		let view = rules.view(game, game.active)
		let spaces = view.actions.space

		expect(spaces).toContain(legalBeachhead)
		expect(spaces).not.toContain(reserveBox)
		expect(spaces).not.toContain(existingBeachhead)
		expect(spaces).not.toContain(cpControlledBeachhead)
	})

	test("亚历山大计划会受到每回合一次入侵限制与无限制潜艇战封锁", () => {
		let event = Engine.events.get_event_by_id(12)
		let blockedByTurn = setupGame(20260419012, "Historical")
		let blockedBySubs = setupGame(20260419013, "Historical")

		blockedByTurn.events["egyptian_coup"] = true
		blockedByTurn.events["ap_invasion_event"] = blockedByTurn.turn

		blockedBySubs.events["egyptian_coup"] = true
		blockedBySubs.events["unrestricted_submarine_warfare"] = true

		expect(event.can_play(blockedByTurn)).toBe(false)
		expect(event.can_play(blockedBySubs)).toBe(false)
	})

	test("亚历山大计划在塞浦路斯没有合法滩头时不能打出", () => {
		let game = setupGame(202604190121, "Historical")
		let event = Engine.events.get_event_by_id(12)
		let cyprusBeachheads = Engine.data.spaces
			.map((space, id) => ({ space, id }))
			.filter(({ space, id }) => id > 0 && space && space.beach_for === "Cyprus")
			.map(({ id }) => id)

		game.events["egyptian_coup"] = true
		for (let s of cyprusBeachheads) {
			game.control[s] = CP
		}

		expect(cyprusBeachheads.length).toBeGreaterThan(0)
		expect(event.can_play(game)).toBe(false)
	})

	test("无限制潜艇战会清空预备军格中的未放置滩头标记", () => {
		let game = setupGame(20260419014, "Historical")
		let event = Engine.events.get_event_by_id(108)

		game.events["german_subs"] = true
		game.turn = 14
		game.unplaced_beachheads = 3

		event.handler(game)

		expect(game.events["unrestricted_submarine_warfare"]).toBe(true)
		expect(game.unplaced_beachheads).toBe(0)
	})

	test("加里波利入侵可用预备军中的对应 SCU 将减员军团翻正", () => {
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

		let initialView = rules.view(game, game.active)
		expect(initialView.actions.piece).toContain(scu)
		expect(initialView.actions.piece).not.toContain(lcu)

		rules.action(game, "Allied Powers", "piece", scu)

		expect(Engine.game_utils.is_piece_reduced(game, lcu)).toBe(false)
		let completeView = rules.view(game, game.active)
		expect(completeView.prompt).toBe("加里波利入侵：完成。")
	})

	test("加里波利入侵可先将地图上的对应 SCU 战略调整回预备军再翻正", () => {
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
		expect(Engine.game_utils.is_piece_reduced(game, lcu)).toBe(false)
		let completeView = rules.view(game, game.active)
		expect(completeView.prompt).toBe("加里波利入侵：完成。")
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

	test("已激活地块允许临时超堆叠停留，但移动阶段结束前必须解消", () => {
		let game = setupGame(202604211, "Historical")
		let { movers, resolvers, b, c } = findTemporaryOverstackScenario(game, AP)

		rules.action(game, "Allied Powers", "space", b)

		for (let p of movers) {
			expect(game.pieces[p]).toBe(b)
			expect(game.moved).toContain(p)
		}
		expect(game.state).toBe("choose_move_space")
		expect(game.activated.move).toContain(b)
		expect(Engine.map.get_move_end_space_block_reason(game, b, AP)).toBe("堆叠超限")

		rules.action(game, "Allied Powers", "done")

		expect(game.state).toBe("choose_move_space")
		expect(game.activated.move).toContain(b)

		rules.action(game, "Allied Powers", "piece", resolvers[0])
		expect(game.state).toBe("choose_pieces_to_move")
		rules.action(game, "Allied Powers", "piece", resolvers[1])
		rules.action(game, "Allied Powers", "piece", resolvers[2])
		rules.action(game, "Allied Powers", "space", c)
		if (game.state === "move_stack") {
			rules.action(game, "Allied Powers", "stop")
		}

		for (let p of resolvers) {
			expect(game.pieces[p]).toBe(c)
			expect(game.moved).toContain(p)
		}
		expect(Engine.map.get_move_end_space_block_reason(game, b, AP)).toBeNull()

		rules.action(game, "Allied Powers", "done")

		expect(game.activated.move).toEqual([])
		expect(game.state).not.toBe("choose_move_space")
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
		expect(valid).toEqual([lemnos])
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

	test("同盟国控制的潜在滩头空间不能被用来建立新滩头", () => {
		let game = setupGame(2026042301, "Historical")
		let lemnos = findSpace("Lemnos")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Lemnos" && space.connections.includes(lemnos)
		)
		let piece = findPiece(AP, "BR DIV #3")

		expect(beachhead).toBeGreaterThan(0)

		game.control[beachhead] = CP
		game.unplaced_beachheads = 1
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

	test("攻击滩头时不视为海峡进攻且按平原列显示战斗比值", () => {
		let game = setupGame(202604241, "Historical")
		let beachhead = Engine.data.spaces.findIndex(
			(space) => space && space.beach_for === "Cyprus" && space.name === "To Adana"
		)
		let cyprus = findSpace("Cyprus")
		let mainland = Engine.data.spaces[beachhead].connections.find((s) => s !== cyprus)
		let cpPiece = findPiece(CP, "TU I Corps")
		let apPiece = findPiece(AP, "BR DIV #1")
		let attack_cf = Engine.combat.get_piece_cf(game, cpPiece)
		let defense_cf = Engine.combat.get_piece_cf(game, apPiece)
		let attacker_table = Engine.data.pieces[cpPiece].piece_class === "LCU" ? "lcu" : "scu"
		let defender_table = Engine.data.pieces[apPiece].piece_class === "LCU" ? "lcu" : "scu"
		let expected_odds = `${Engine.combat.find_fire_column(attacker_table, attack_cf, 0).name} vs ${Engine.combat.find_fire_column(defender_table, defense_cf, 0).name}`

		expect(beachhead).toBeGreaterThan(0)
		expect(mainland).toBeGreaterThan(0)

		game.active = CP
		game.beachheads = [beachhead]
		game.pieces[cpPiece] = mainland
		game.pieces[apPiece] = beachhead
		game.attack = {
			attacker: CP,
			defender: AP,
			space: beachhead,
			pieces: [cpPiece]
		}

		expect(Engine.combat.fmt_attack_odds(game)).toBe(expected_odds)

		let result = Engine.combat.resolve_battle(game)

		expect(result.def_fire_first).toBe(false)
		expect(result.att_shifts).toBe(0)
	})

	test("滩头上的AP部队可以攻击相邻岸上的空CP要塞", () => {
		let game = setupGame(202604242, "Historical")
		let beachhead = findSpace("to Fao")
		let target = findSpace("Fao")
		let piece = findPiece(AP, "BR DIV #1")

		expect(beachhead).toBeGreaterThan(0)
		expect(target).toBeGreaterThan(0)

		game.active = AP
		game.beachheads = [beachhead]
		game.pieces[piece] = beachhead

		for (let p = 0; p < game.pieces.length; p++) {
			if (game.pieces[p] !== target) continue
			if (Engine.game_utils.get_piece_effective_faction(game, p) !== CP) continue
			game.pieces[p] = ELIMINATED
		}

		let targets = Engine.combat.get_attackable_spaces(game, [piece], AP)

		expect(targets).toContain(target)
		expect(
			Engine.combat.can_activate_piece_in_space_to_attack(game, piece, beachhead, AP)
		).toBe(true)

		game.attack = {
			attacker: AP,
			defender: CP,
			space: target,
			pieces: [piece]
		}

		let result = Engine.combat.resolve_battle(game)

		expect(result.def_fire_first).toBe(true)
		expect(result.att_shifts).toBe(-3)
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

	test("尼古拉大公事件只提供 map 定义且满足 AP 堆叠限制的里海港口", () => {
		let game = setupGame(202604281, "Historical")
		let event = Engine.events.get_event_by_id(23)
		let baku = findSpace("Baku")
		let enzeli = findSpace("Enzeli")
		let centralAsia = findSpace("Central Asia")
		let derbent = findSpace("Derbent")
		let petrovsk = findSpace("Petrovsk")
		let ardebil = findSpace("Ardebil")
		let shiraz = findSpace("Shiraz")
		let bushire = findSpace("Bushire")
		let meshed = findSpace("Meshed")
		let blockers = [
			findPiece(AP, "RU Cavalry #1"),
			findPiece(AP, "RU Cavalry #2"),
			findPiece(AP, "RU Cavalry #3"),
			findPiece(AP, "RU Cavalry #4"),
			findPiece(AP, "RU Cavalry #5")
		]

		game.events["secret_treaty"] = true
		for (let space of [baku, enzeli, centralAsia, ardebil, shiraz, bushire, meshed]) {
			clearSpace(game, space)
		}

		game.pieces[blockers[0]] = baku
		game.pieces[blockers[1]] = baku
		game.pieces[blockers[2]] = centralAsia
		game.pieces[blockers[3]] = centralAsia
		game.pieces[blockers[4]] = enzeli

		expect(event.can_play(game)).toBe(true)

		event.handler(game)
		let view = rules.view(game, game.active)

		expect(view.actions.space).toEqual([enzeli])
		expect(view.actions.space).not.toContain(derbent)
		expect(view.actions.space).not.toContain(petrovsk)
	})

	test("尼古拉大公事件中的 CP 后撤允许先退 1 格再决定是否继续后撤", () => {
		let game = setupGame(202604282, "Historical")
		let event = Engine.events.get_event_by_id(23)
		let enzeli = findSpace("Enzeli")
		let astara = findSpace("Astara")
		let ardebil = findSpace("Ardebil")
		let menjil = findSpace("Menjil")
		let cpDiv = findPiece(CP, "TU DIV #1")
		let apScout = findPiece(AP, "RU Cavalry #1")

		game.events["secret_treaty"] = true
		for (let space of [enzeli, astara, ardebil, menjil]) {
			clearSpace(game, space)
		}
		game.pieces[apScout] = enzeli
		game.pieces[cpDiv] = enzeli
		game.control[astara] = CP
		game.control[ardebil] = CP
		game.control[menjil] = CP

		event.handler(game)
		rules.action(game, "Allied Powers", "space", enzeli)

		expect(game.state).toBe("event_grand_duke_to_tiflis_cp_retreat")
		expect(game.active).toBe(CP)

		rules.action(game, "Central Powers", "piece", cpDiv)

		let firstRetreatView = rules.view(game, game.active)
		expect(firstRetreatView.actions.space).toContain(astara)

		rules.action(game, "Central Powers", "space", astara)

		let secondRetreatView = rules.view(game, game.active)
		expect(game.pieces[cpDiv]).toBe(astara)
		expect(secondRetreatView.actions.finish_piece).toBeTruthy()
		expect(secondRetreatView.actions.space).toContain(ardebil)
		expect(secondRetreatView.actions.space).not.toContain(enzeli)

		rules.action(game, "Central Powers", "finish_piece")

		expect(game.pieces[cpDiv]).toBe(astara)
		expect(game.state).toBe("event_grand_duke_to_tiflis_sr")
		expect(game.active).toBe(AP)
	})

})
