"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findCpPiece, clearBoard } = require("./helpers.js")

const { CP } = Engine.constants
const CP_ROLE = rules.roles[1]

function setupCpMove(game, piece, from) {
	game.active = CP
	game.state = "move_stack"
	game.ops = 1
	game.card_ops = 1
	game.activated = { move: [from], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = { move: 0, attack: 0 }
	game.attacked = []
	game.retreated = []
	game.moved = []
	game.move = {
		initial: from,
		current: from,
		spaces_moved: 0,
		pieces: [piece],
		touched_spaces: [from]
	}
}

test("CP moving into own-controlled Baghdad does not add Jihad from a legacy empty owner snapshot", () => {
	let game = setupGame(2026050701, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let baghdad = findSpace("Baghdad")
	let ctesiphon = findSpace("Ctesiphon")
	let unit = findCpPiece("TU-A DIV #10")

	game.pieces[unit] = ctesiphon
	game.jihad = 0
	game.jihad_city_effective_owner[baghdad] = 0
	setupCpMove(game, unit, ctesiphon)

	game = rules.action(game, CP_ROLE, "space", baghdad)

	expect(game.pieces[unit]).toBe(baghdad)
	expect(Engine.map.get_space_controller(game, baghdad)).toBe(CP)
	expect(game.jihad).toBe(0)
	expect(game.jihad_city_effective_owner[baghdad]).toBe(CP)
	expect(game.state).not.toBe("jihad_placement")
})

test("CP leaving own-controlled Baghdad does not add Jihad from a legacy empty owner snapshot", () => {
	let game = setupGame(2026050702, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let baghdad = findSpace("Baghdad")
	let ctesiphon = findSpace("Ctesiphon")
	let unit = findCpPiece("TU-A DIV #10")

	game.pieces[unit] = baghdad
	game.jihad = 0
	game.jihad_city_effective_owner[baghdad] = 0
	setupCpMove(game, unit, baghdad)

	game = rules.action(game, CP_ROLE, "space", ctesiphon)

	expect(game.pieces[unit]).toBe(ctesiphon)
	expect(Engine.map.get_space_controller(game, baghdad)).toBe(CP)
	expect(game.jihad).toBe(0)
	expect(game.jihad_city_effective_owner[baghdad]).toBe(CP)
	expect(game.state).not.toBe("jihad_placement")
})

test("CP recapturing AP-controlled Baghdad still adds Jihad with a legacy empty owner snapshot", () => {
	let game = setupGame(2026050703, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let baghdad = findSpace("Baghdad")
	let ctesiphon = findSpace("Ctesiphon")
	let unit = findCpPiece("TU-A DIV #10")

	game.control[baghdad] = Engine.constants.AP
	game.pieces[unit] = ctesiphon
	game.jihad = 0
	game.jihad_city_effective_owner[baghdad] = 0
	setupCpMove(game, unit, ctesiphon)

	game = rules.action(game, CP_ROLE, "space", baghdad)

	expect(game.pieces[unit]).toBe(baghdad)
	expect(Engine.map.get_space_controller(game, baghdad)).toBe(CP)
	expect(game.jihad).toBe(1)
	expect(game.jihad_city_effective_owner[baghdad]).toBe(CP)
	expect(game.state).toBe("jihad_placement")
})
