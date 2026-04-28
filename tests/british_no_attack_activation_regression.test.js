"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function prepareBritishNoAttackActivation() {
	const game = setupGame(2026042806, "Historical")
	clearBoard(game)

	const brDiv = findPiece(AP, "BR DIV #1")
	const tuDiv = findPiece(CP, "TU DIV #8")
	const abadan = findSpace("Abadan")
	const basra = findSpace("Basra")

	game.pieces[brDiv] = abadan
	game.pieces[tuDiv] = basra
	game.active = AP
	game.state = "activate_spaces"
	game.ops = 3
	game.card_ops = 3
	game.mo_ap = "british_no_attack"
	game.br_attack_penalty_paid = false
	game.activated = { move: [], attack: [], attack_egypt: [] }
	game.activation_cost = {}
	game.region_activations = { move: {}, attack: {} }
	game.moved = []
	game.attacked = []
	game.retreated = []

	return { game, abadan }
}

test("BR no-attack MO offers VP-penalty activation without crashing view", () => {
	const { game, abadan } = prepareBritishNoAttackActivation()

	const view = rules.view(game, AP_ROLE)

	expect(view.actions.activate_attack || []).not.toContain(abadan)
	expect(view.actions.activate_attack_with_br || []).toContain(abadan)
})

