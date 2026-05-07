"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const turnStates = require("../modules/states/states_turn.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function getTurnFuncs(game) {
	turnStates.set_globals(game)
	return turnStates.register({}, Engine, {
		log: () => {},
		log_h1: () => {},
		get_pieces_in_space: Engine.map.get_pieces_in_space,
		find_space: Engine.game_utils.find_space,
		other_faction: Engine.utils.other_faction,
		set_control: Engine.set_control,
		check_supply: () => {},
		eliminate_piece: () => {},
		roll_die: () => 1,
		MO_NONE: Engine.mo.MO_NONE,
		PHASE_SEQUENCE: {},
		AP,
		CP
	})
}

function prepareBritishNoAttackActivation() {
	let game = setupGame(2026050712, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	const brDiv = findPiece(AP, "BR DIV #1")
	const tuDiv = findPiece(CP, "TU DIV #8")
	const abadan = findSpace("Abadan")
	const basra = findSpace("Basra")

	game.pieces[brDiv] = abadan
	game.pieces[tuDiv] = basra
	Engine.set_control(game, abadan, AP)
	Engine.set_control(game, basra, CP)

	game.active = AP
	game.state = "activate_spaces"
	game.ops = 3
	game.card_ops = 3
	game.vp = 10
	game.mo_ap = Engine.mo.MO_BRITISH_NO_ATTACK
	game.mo_ap_fulfilled = true
	game.mo_cp = Engine.mo.MO_NONE
	game.mo_cp_fulfilled = true
	game.br_attack_penalty_paid = false
	game.british_mandate_violated = false
	game.activated = { move: [], attack: [], attack_egypt: [] }
	game.activation_cost = {}
	game.region_activations = { move: {}, attack: {} }
	game.moved = []
	game.attacked = []
	game.attacked_spaces = []
	game.retreated = []
	game.oos = []
	game.oos_spaces = []

	return { game, abadan }
}

test("British No Attack VP penalty is not charged again during attrition", () => {
	let { game, abadan } = prepareBritishNoAttackActivation()

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.activate_attack || []).not.toContain(abadan)
	expect(view.actions.activate_attack_with_br || []).toContain(abadan)

	game = rules.action(game, AP_ROLE, "activate_attack_with_br", abadan)
	expect(game.vp).toBe(11)
	expect(game.br_attack_penalty_paid).toBe(true)
	expect(game.british_mandate_violated).toBe(true)

	const vp_after_activation = game.vp
	getTurnFuncs(game).start_attrition_phase()
	expect(game.vp).toBe(vp_after_activation)
})
