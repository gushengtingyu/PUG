"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, clearBoard } = require("./helpers.js")

const { AP } = Engine.constants
const AP_ROLE = rules.roles[0]

function setupApMove(game, pieces, from) {
	game.active = AP
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
		pieces: pieces.slice(),
		touched_spaces: [from]
	}
}

test("Arab Revolt SCUs can move from Mecca into Medina to besiege the non-Gallipoli fort", () => {
	let game = setupGame(2026050901, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let mecca = findSpace("Mecca")
	let medina = findSpace("Medina")
	let jiddah = findSpace("Jiddah")
	let arabs = ["Arab faisal Revolt", "Arab Revolt #1", "Arab Revolt #2"].map(findApPiece)

	for (let p of arabs) game.pieces[p] = mecca
	setupApMove(game, arabs, mecca)

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space || []).toEqual(expect.arrayContaining([medina, jiddah]))

	game = rules.action(game, AP_ROLE, "space", medina)

	for (let p of arabs) expect(game.pieces[p]).toBe(medina)
	expect(Engine.map.is_besieged(game, medina)).toBe(true)
})

test("ANA may move across A/T paths but not Arab-only A paths", () => {
	let game = setupGame(2026052101, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let mecca = findSpace("Mecca")
	let medina = findSpace("Medina")
	let jiddah = findSpace("Jiddah")
	let bair = findSpace("Bair")
	let ana = findApPiece("BR ANA Arab")

	game.pieces[ana] = mecca

	let moveNeighbors = Engine.map.get_piece_connected_spaces_for_rule(game, mecca, ana, "move")
	expect(moveNeighbors).toEqual(expect.arrayContaining([medina, jiddah]))
	expect(moveNeighbors).not.toContain(bair)
})

test("enemy fort entry extra movement cost applies only on the Gallipoli map", () => {
	let game = setupGame(2026050902, "Historical", { no_supply_warnings: true })
	let medina = findSpace("Medina")
	let seddulBahr = findSpace("Seddul Bahr")

	expect(Engine.map.get_enemy_fort_entry_extra_cost(game, medina, AP)).toBe(0)
	expect(Engine.map.get_enemy_fort_entry_extra_cost(game, seddulBahr, AP)).toBe(1)
})
