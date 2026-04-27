const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, findCpPiece, clearBoard } = require("./helpers.js")

const { AP } = Engine.constants

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

test("Disrupted Supply adds +1 OPS to activate a space and +1 SR to redeploy out of it", () => {
	let game = createDisruptedSupplyGame()
	let tiflis = findSpace("TIFLIS")
	let apReserve = findSpace("AP Reserve")
	let brCorps = findApPiece("BR IX Corps")
	let kurds = findCpPiece("Kurds #1")

	game.pieces[brCorps] = tiflis
	game.pieces[kurds] = tiflis

	expect(Engine.map.get_supply_status(game, tiflis, AP, brCorps)).toBe("DISRUPTED")
	expect(Engine.map.get_activation_cost_pair(game, tiflis)).toEqual({ move: 2, attack: 2 })
	expect(Engine.map.get_sr_cost(game, brCorps, tiflis, apReserve, AP)).toBe(5)
})

test("Reduced units in Disrupted Supply pay double RP to repair", () => {
	let game = createDisruptedSupplyGame()
	let tiflis = findSpace("TIFLIS")
	let brCorps = findApPiece("BR IX Corps")
	let kurds = findCpPiece("Kurds #1")

	game.pieces[brCorps] = tiflis
	game.pieces[kurds] = tiflis
	Engine.utils.set_add(game.reduced, brCorps)

	expect(Engine.map.get_supply_status(game, tiflis, AP, brCorps)).toBe("DISRUPTED")
	expect(Engine.replacement.get_replacement_cost(game, brCorps)).toBe(2)
})

test("Irregulars and tribes do not disrupt supply when accompanied by a same-side regular combat unit", () => {
	let game = createDisruptedSupplyGame()
	let tiflis = findSpace("TIFLIS")
	let brCorps = findApPiece("BR IX Corps")
	let kurds = findCpPiece("Kurds #1")
	let turkishDivision = findCpPiece("TU DIV #1")

	game.pieces[brCorps] = tiflis
	game.pieces[kurds] = tiflis

	expect(Engine.map.is_disrupted_by_enemy(game, tiflis, AP)).toBe(true)
	expect(Engine.map.create_supply_context(game).disrupted[AP][tiflis]).toBe(1)

	game.pieces[turkishDivision] = tiflis

	expect(Engine.map.is_disrupted_by_enemy(game, tiflis, AP)).toBe(false)
	expect(Engine.map.create_supply_context(game).disrupted[AP][tiflis]).toBe(0)
})
