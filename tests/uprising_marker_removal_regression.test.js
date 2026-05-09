const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, findCpPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function prepareActivationState(game, faction, ops = 2) {
	game.active = faction
	game.state = "activate_spaces"
	game.ops = ops
	game.activated = { move: [], attack: [] }
	game.moved = []
	game.attacked = []
	game.retreated = []
	game.activation_cost = {}
}

test("Movement activation can remove a Persian Uprising marker with a 0 MF unit", () => {
	let game = setupGame(2026050907, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let tiflis = findSpace("TIFLIS")
	let garrison = findApPiece("BR IN Garrison #1")
	let brDiv = findApPiece("BR DIV #1")

	game.pieces[garrison] = tiflis
	game.pieces[brDiv] = tiflis
	game.persian_uprising_markers = [tiflis]
	prepareActivationState(game, AP)

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.activate_move).toContain(tiflis)
	expect(view.actions.activate_attack || []).not.toContain(tiflis)

	game = rules.action(game, AP_ROLE, "activate_move", tiflis)
	expect(game.ops).toBe(0)
	expect(game.activation_cost[tiflis]).toBe(2)

	game = rules.action(game, AP_ROLE, "piece", garrison)
	view = rules.view(game, AP_ROLE)
	expect(view.actions.remove_uprising_marker).toBe(1)

	game = rules.action(game, AP_ROLE, "remove_uprising_marker")

	expect(game.persian_uprising_markers).not.toContain(tiflis)
	expect(game.moved).toContain(garrison)
	expect(game.attacked).not.toContain(garrison)

	view = rules.view(game, AP_ROLE)
	expect(view.actions.piece).not.toContain(garrison)
	expect(view.actions.piece).toContain(brDiv)
})

test("Movement activation can remove an Armenian Uprising marker", () => {
	let game = setupGame(2026050908, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let van = findSpace("Van")
	let turkishDiv = findCpPiece("TU DIV #1")

	game.pieces[turkishDiv] = van
	game.armenian_uprising_markers = [van]
	prepareActivationState(game, CP)

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.activate_move).toContain(van)

	game = rules.action(game, CP_ROLE, "activate_move", van)
	expect(game.ops).toBe(0)
	expect(game.activation_cost[van]).toBe(2)

	game = rules.action(game, CP_ROLE, "piece", turkishDiv)
	view = rules.view(game, CP_ROLE)
	expect(view.actions.remove_uprising_marker).toBe(1)
	game = rules.action(game, CP_ROLE, "remove_uprising_marker")

	expect(game.armenian_uprising_markers).not.toContain(van)
	expect(game.moved).toContain(turkishDiv)
	expect(game.attacked).not.toContain(turkishDiv)
})

test("Combat activation can remove an Armenian Uprising marker without moving the unit", () => {
	let game = setupGame(2026050909, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let van = findSpace("Van")
	let ercis = findSpace("Ercis")
	let turkishDiv = findCpPiece("TU DIV #1")
	let otherTurkishDiv = findCpPiece("TU DIV #2")
	let russianDiv = findApPiece("RU DIV #1")

	game.pieces[turkishDiv] = van
	game.pieces[otherTurkishDiv] = van
	game.pieces[russianDiv] = ercis
	game.armenian_uprising_markers = [van]
	prepareActivationState(game, CP)

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.activate_attack).toContain(van)

	game = rules.action(game, CP_ROLE, "activate_attack", van)
	game = rules.action(game, CP_ROLE, "done")
	expect(game.state).toBe("attack")

	game = rules.action(game, CP_ROLE, "piece", turkishDiv)
	view = rules.view(game, CP_ROLE)
	expect(view.actions.space).toContain(ercis)
	expect(view.actions.remove_uprising_marker).toBe(1)

	game = rules.action(game, CP_ROLE, "remove_uprising_marker")

	expect(game.armenian_uprising_markers).not.toContain(van)
	expect(game.attacked).toContain(turkishDiv)
	expect(game.moved).not.toContain(turkishDiv)

	view = rules.view(game, CP_ROLE)
	expect(view.actions.piece).not.toContain(turkishDiv)
	expect(view.actions.piece).toContain(otherTurkishDiv)
})
