"use strict"

const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

function setupJangaliBoundaryGame() {
	let game = setupGame(2026051201, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let jangali = findPiece(CP, "Jangali")
	let brDiv = findPiece(AP, "BR DIV #1")
	let kazvin = findSpace("Kazvin")
	let teheran = findSpace("TEHERAN")
	let sultanBulak = findSpace("Sultan Bulak")

	game.pieces[jangali] = kazvin
	game.pieces[brDiv] = teheran
	Engine.set_control(game, kazvin, CP)
	Engine.set_control(game, teheran, AP)
	Engine.set_control(game, sultanBulak, AP)

	game.active = CP
	game.events = game.events || {}
	game.activated = { move: [kazvin], attack: [kazvin], attack_egypt: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = {}
	game.attacked = []
	game.attacked_spaces = []
	game.retreated = []
	game.moved = []

	return { game, jangali, brDiv, kazvin, teheran, sultanBulak }
}

function attackTargets(game, pieces) {
	return Engine.combat.get_legal_attackable_spaces(
		game,
		pieces,
		CP,
		() => Engine.game_utils.get_season(game),
		(s, faction) => Engine.map.is_rail_connected_to_supply(game, s, faction)
	)
}

test("tribes may attack one space beyond their activity range but may not move beyond it", () => {
	let { game, jangali, kazvin, teheran, sultanBulak } = setupJangaliBoundaryGame()

	expect(Engine.map.is_space_in_tribal_range(jangali, kazvin)).toBe(true)
	expect(Engine.map.is_space_in_tribal_range(jangali, teheran)).toBe(false)

	let move_neighbors = Engine.map.get_piece_connected_spaces_for_rule(game, kazvin, jangali, "move")
	expect(move_neighbors).not.toContain(teheran)
	expect(move_neighbors).not.toContain(sultanBulak)

	expect(attackTargets(game, [jangali])).toContain(teheran)
})

test("tribes that win a boundary attack cannot advance outside their activity range", () => {
	let { game, jangali, brDiv, teheran } = setupJangaliBoundaryGame()

	game.pieces[brDiv] = 0
	game.attack = {
		space: teheran,
		pieces: [jangali],
		attacker: CP,
		defender: AP
	}

	expect(Engine.map.can_stack_end_in_space(game, teheran, [jangali])).toBe(false)
	expect(Engine.combat.get_valid_advance_spaces(game, jangali, teheran)).toEqual([])
})

test("a full-strength tribe that cannot advance does not force surviving defenders to retreat", () => {
	let { game, jangali, brDiv, kazvin, teheran } = setupJangaliBoundaryGame()

	game.attack = {
		space: teheran,
		pieces: [jangali],
		origin_by_piece: { [jangali]: kazvin },
		attacker: CP,
		defender: AP
	}
	game.combat_cards = { attacker: [], defender: [] }
	game.post_roll_cc_done = true
	game.post_battle_cc_done = true
	game.retreat_choice_cc_cp_done = true
	game.battle_result = {
		attacker_losses: 0,
		defender_losses: 1,
		retreat_needed: true,
		retreating_faction: AP,
		retreating_units: [brDiv],
		retreat_can_cancel: false,
		retreat_distance: 1,
		no_advance: false,
		attackers: [jangali],
		defenders: [brDiv],
		advance_with_reduced: false
	}

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.state).toBe("attack")
	expect(game.retreat_pieces).toBeUndefined()
	expect(game.pieces[brDiv]).toBe(teheran)
	expect(Engine.combat.get_valid_advance_spaces(game, jangali, teheran)).toEqual([])
})
