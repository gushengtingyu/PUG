const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

test("未建立 marker 的 beachhead 不会进入断补翻控制链路", () => {
	let game = setupGame(2026042101)
	let suvlaBay = findSpace("Suvla Bay")

	expect(Engine.map.is_beachhead_space(game, suvlaBay)).toBe(false)
	expect(Engine.map.get_space_controller(game, suvlaBay)).toBe(AP)

	Engine.map.check_supply(game)

	expect(game.oos_spaces || []).not.toContain(suvlaBay)
	expect(Engine.map.get_space_controller(game, suvlaBay)).toBe(AP)
})

test("运行时不能把 beachhead 写成 CP 控制", () => {
	let game = setupGame(2026042102)
	let suvlaBay = findSpace("Suvla Bay")
	let toAdana = findSpace("To Adana")

	Engine.set_control(game, suvlaBay, CP)
	Engine.set_control(game, toAdana, CP)

	expect(Engine.map.get_space_controller(game, suvlaBay)).toBe(AP)
	expect(Engine.map.get_space_controller(game, toAdana)).toBe("neutral")
	expect(game.control[suvlaBay]).toBe(AP)
	expect(game.control[toAdana]).toBe("neutral")
})

test("旧坏档里的 beachhead CP 控制会在加载归一化时被清洗", () => {
	let game = setupGame(2026042103)
	let suvlaBay = findSpace("Suvla Bay")
	let toAdana = findSpace("To Adana")

	game.control[suvlaBay] = CP
	game.control[toAdana] = CP

	Engine.setup.normalize_game(game)

	expect(game.control[suvlaBay]).toBe(AP)
	expect(game.control[toAdana]).toBe("neutral")
	expect(Engine.map.get_space_controller(game, suvlaBay)).toBe(AP)
	expect(Engine.map.get_space_controller(game, toAdana)).toBe("neutral")
})

test("Beirut 滩头上的 AP SCU 在 attack 阶段可以选择进攻 Beirut", () => {
	let game = setupGame(2026042104)
	let toBeirut = findSpace("To Beirut")
	let beirut = findSpace("Beirut")
	let cyprus = findSpace("Cyprus")
	let attacker = Engine.data.pieces.findIndex((piece) => piece && piece.faction === AP && piece.lf === 1)
	let defender = Engine.data.pieces.findIndex((piece) => piece && piece.faction === CP && piece.lf === 1)

	game.active = AP
	game.state = "attack"
	game.events.egyptian_coup = true
	game.control[cyprus] = AP
	game.beachheads = [toBeirut]
	game.activated = { move: [], attack: [toBeirut] }
	game.region_activations = { move: {}, attack: {} }
	game.attacked = []
	game.retreated = []
	delete game.attack
	delete game.attack_eligibility_cache

	game.pieces[attacker] = toBeirut
	game.pieces[defender] = beirut

	let attackView = rules.view(game, AP_ROLE)
	expect(attackView.actions.piece || []).toContain(attacker)

	game = rules.action(game, AP_ROLE, "piece", attacker)
	let targetView = rules.view(game, AP_ROLE)
	expect(targetView.actions.space || []).toContain(beirut)
})

test("Besika Bay 的 beachhead 单位可以激活并进攻 Kum Kale 空堡", () => {
	let game = setupGame(2026042205)
	let besikaBay = findSpace("Besika Bay")
	let kumKale = findSpace("Kum Kale")
	let attacker = Engine.game_utils.find_piece(AP, "BR DIV #4")

	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === besikaBay || game.pieces[p] === kumKale) game.pieces[p] = 0
	}

	rules.set_add(game.beachheads, besikaBay)
	game.pieces[attacker] = besikaBay
	game.active = AP
	game.state = "activate_spaces"
	game.ops = 1
	game.card_ops = 1
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = { move: 0, attack: 0 }
	game.attacked = []
	game.retreated = []

	let activationView = rules.view(game, AP_ROLE)
	expect(activationView.actions.activate_attack || []).toContain(besikaBay)

	expect(rules.get_attackable_spaces([attacker])).toContain(kumKale)
})

test("Gallipoli build-up 完成后将滩头保留在预备而不是立即上图", () => {
	let game = setupGame(2026042206)
	let lemnos = findSpace("Lemnos")
	let besikaBay = findSpace("Besika Bay")

	game.active = AP
	game.state = "event_gallipoli_invasion_flip"
	game.event_ctx = {
		key: "gallipoli_invasion",
		data: {
			beachheads_to_place: 2,
			allowed_beachhead_area: "gallipoli",
			allowed_beachhead_island_base: lemnos,
			invasion_island_base: lemnos,
			flip_lcu_if_scu: true
		}
	}

	game = rules.action(game, AP_ROLE, "done")

	expect(game.beachheads || []).not.toContain(besikaBay)
	expect(game.unplaced_beachheads).toBe(2)
	expect(game.pending_ap_invasions).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				key: "gallipoli_invasion",
				count: 2,
				allowed_beachhead_area: "gallipoli",
				allowed_beachhead_island_base: lemnos,
				invasion_island_base: lemnos
			})
		])
	)
})

test("Pending invasion 只能在匹配的岛屿基地和海滩创建滩头，并在登陆时消耗预备标记", () => {
	let game = setupGame(2026042207)
	let lemnos = findSpace("Lemnos")
	let besikaBay = findSpace("Besika Bay")
	let toBeirut = findSpace("To Beirut")
	let attacker = Engine.game_utils.find_piece(AP, "BR DIV #4")

	game.pieces[attacker] = lemnos
	game.pending_ap_invasions = [
		{
			key: "gallipoli_invasion",
			count: 1,
			allowed_beachhead_area: "gallipoli",
			allowed_beachhead_island_base: lemnos,
			invasion_island_base: lemnos
		}
	]
	game.unplaced_beachheads = 1
	game.move = { spaces_moved: 0, pieces: [attacker] }

	expect(Engine.map.can_ap_initiate_invasion_to_beachhead(game, lemnos, besikaBay, AP)).toBe(true)
	expect(Engine.map.can_ap_initiate_invasion_to_beachhead(game, lemnos, toBeirut, AP)).toBe(false)
	expect(Engine.events.consume_pending_ap_invasion(game, lemnos, besikaBay)).toBe(true)
	expect(game.unplaced_beachheads).toBe(0)
	expect(game.pending_ap_invasions || []).toHaveLength(0)
})

test("Salonika build-up 完成后会把滩头约束保存到预备队列", () => {
	let game = setupGame(2026042208)
	let lemnos = findSpace("Lemnos")

	game.active = AP
	game.state = "event_salonika_invasion_sr"
	game.event_ctx = {
		key: "salonika_invasion",
		data: {
			beachheads_to_place: 1,
			invasion_island_base: lemnos,
			allow_sr_to_island: 0
		}
	}

	game = rules.action(game, AP_ROLE, "done")

	expect(game.unplaced_beachheads).toBe(1)
	expect(game.pending_ap_invasions).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				key: "salonika_invasion",
				count: 1,
				invasion_island_base: lemnos
			})
		])
	)
})
