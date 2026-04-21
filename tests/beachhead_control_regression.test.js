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
