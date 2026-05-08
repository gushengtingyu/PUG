const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, findCpPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function createDisruptedSupplyGame() {
	let game = setupGame(2026042701)
	clearBoard(game)
	game.active = AP
	game.events = {}
	game.mo_ap = "NONE"
	game.moved = []
	game.sr_moved = []
	return game
}

function prepareActivationState(game, faction, ops = 5) {
	game.active = faction
	game.state = "activate_spaces"
	game.ops = ops
	game.activated = { move: [], attack: [] }
	game.moved = []
	game.attacked = []
	game.retreated = []
	game.activation_cost = {}
}

test("Disrupted Supply adds +1 OPS, +1 SR, and doubles RP repair cost", () => {
	let game = createDisruptedSupplyGame()
	let tiflis = findSpace("TIFLIS")
	let ruDiv = findApPiece("RU DIV #1")
	let kurds = findCpPiece("Kurds #1")

	game.pieces[ruDiv] = tiflis
	game.pieces[kurds] = tiflis
	Engine.utils.set_add(game.reduced, ruDiv)
	game.rp_ap = { a: 10, br: 10, ru: 10 }

	expect(Engine.map.get_supply_status(game, tiflis, AP, ruDiv)).toBe("DISRUPTED")
	expect(Engine.map.get_activation_cost_pair(game, tiflis)).toEqual({ move: 2, attack: 2 })
	expect(Engine.map.get_sr_cost(game, ruDiv, tiflis, findSpace("AP Reserve"), AP)).toBe(2)
	expect(Engine.map.get_replacement_cost(game, ruDiv)).toBe(1)
})

test("Irregulars and tribes do not disrupt supply when accompanied by a same-side regular combat unit", () => {
	let game = createDisruptedSupplyGame()
	let tiflis = findSpace("TIFLIS")
	let ruDiv = findApPiece("RU DIV #1")
	let kurds = findCpPiece("Kurds #1")
	let turkishDivision = findCpPiece("TU DIV #1")

	game.pieces[ruDiv] = tiflis
	game.pieces[kurds] = tiflis

	expect(Engine.map.is_disrupted_by_enemy(game, tiflis, AP)).toBe(true)
	expect(Engine.map.create_supply_context(game).disrupted[AP][tiflis]).toBe(1)
	expect(Engine.map.get_supply_status(game, tiflis, AP, ruDiv)).toBe("DISRUPTED")

	game.pieces[turkishDivision] = tiflis

	expect(Engine.map.is_disrupted_by_enemy(game, tiflis, AP)).toBe(false)
	expect(Engine.map.create_supply_context(game).disrupted[AP][tiflis]).toBe(0)
	expect(Engine.map.get_supply_status(game, tiflis, AP, ruDiv)).toBe("FULL")
})

test("Limited and Disrupted Supply coexist and apply both rule sets", () => {
	let game = createDisruptedSupplyGame()
	let bolgrad = findSpace("Bolgrad")
	let braila = findSpace("Braila")
	let brDiv1 = findApPiece("BR DIV #1")
	let brDiv2 = findApPiece("BR DIV #2")
	let kurds = findCpPiece("Kurds #1")
	let turkishDivision = findCpPiece("TU DIV #1")

	game.pieces[brDiv1] = bolgrad
	game.pieces[brDiv2] = bolgrad
	game.pieces[kurds] = bolgrad
	game.pieces[turkishDivision] = braila
	Engine.utils.set_add(game.reduced, brDiv1)
	game.rp_ap = { a: 10, br: 10, ru: 10 }
	prepareActivationState(game, AP)

	expect(Engine.map.get_supply_status(game, bolgrad, AP, brDiv1)).toBe("LIMITED_DISRUPTED")
	expect(Engine.map.get_activation_cost_pair(game, bolgrad).move).toBe(2)

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.activate_move || []).toContain(bolgrad)
	expect(view.actions.activate_attack || []).not.toContain(bolgrad)

	expect(
		Engine.combat.can_activate_piece_in_space_to_attack(
			game,
			brDiv1,
			bolgrad,
			AP,
			() => Engine.game_utils.get_season(game),
			rules.is_rail_connected_to_supply
		)
	).toBe(false)
	expect(Engine.map.can_sr_piece(game, brDiv1, AP)).toBe(false)
	expect(Engine.game_utils.can_combine_in_space(game, bolgrad, AP)).toBe(false)
	expect(Engine.map.can_afford_replacement(game, brDiv1, Engine.map.get_replacement_cost(game, brDiv1))).toBe(false)

	Engine.map.check_supply(game)
	expect(game.oos || []).not.toContain(brDiv1)
	expect(game.disrupted_supply || []).toContain(brDiv1)
	expect(game.oos_spaces || []).not.toContain(bolgrad)
})

test("Afghanistan limited source preserves disrupted trace information", () => {
	let game = createDisruptedSupplyGame()
	let afghanistan = findSpace("Afghanistan")
	let tuDiv = findCpPiece("TU DIV #8")
	let armenianUprising = findApPiece("Armenian Uprising")

	game.active = CP
	game.pieces[armenianUprising] = afghanistan
	Engine.sync_region_control(game, afghanistan)
	expect(game.region_disruption[afghanistan]).toBe(AP)

	game.pieces[tuDiv] = afghanistan
	Engine.sync_region_control(game, afghanistan)

	expect(Engine.map.is_disrupted_by_enemy(game, afghanistan, CP)).toBe(true)
	expect(Engine.map.get_supply_status(game, afghanistan, CP, tuDiv)).toBe("LIMITED_DISRUPTED")
})

test("Placing NW Frontier into AP-occupied India does not disrupt the region", () => {
	let game = setupGame(2026050801)
	let india = findSpace("INDIA")
	let nwFrontier = findCpPiece("NW Frontier")
	let apPieces = rules.get_pieces_in_space(game, india).filter((p) => Engine.game_utils.get_piece_effective_faction(game, p) === AP)
	let apUnit = apPieces[0]

	expect(Engine.map.get_space_controller(game, india)).toBe(AP)
	expect(apPieces.length).toBeGreaterThan(0)

	game.pieces[nwFrontier] = india
	Engine.sync_region_control(game, india)

	expect(game.region_disruption[india]).toBeUndefined()
	expect(Engine.map.is_disrupted_by_enemy(game, india, AP)).toBe(false)
	expect(Engine.map.create_supply_context(game).disrupted[AP][india]).toBe(0)
	expect(Engine.map.get_supply_status(game, india, AP, apUnit)).toBe("FULL")
})
