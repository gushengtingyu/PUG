const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const AP = Engine.constants.AP
const CP = Engine.constants.CP
const CP_ROLE = rules.roles[1]

function createReservesToFrontState({ initiallyReduced, currentState }) {
	const game = setupGame(260507, "Historical", { no_supply_warnings: true })
	const origin = findSpace("Oltu")
	const target = findSpace("Bayburt")
	const attacker = findPieceByName("RU DIV #3")
	const turkish = findPieceByName("TU DIV #8")

	clearBoard(game)
	game.pieces[attacker] = origin
	game.pieces[turkish] = currentState === "eliminated" ? Engine.game_utils.get_eliminated_box(CP) : target
	game.control[origin] = AP
	game.control[target] = CP
	game.active = CP
	game.state = "event_reserves_to_front"
	game.events = {}
	game.reduced = currentState === "reduced" ? [turkish] : []
	game.rp_cp.tu = 2
	game.attack = {
		space: target,
		pieces: [attacker],
		attacker: AP,
		defender: CP,
		initial_attackers: [attacker],
		initial_defenders: [turkish],
		reserves_to_front_damaged_pieces: [turkish],
		reserves_to_front_initial_reduced_pieces: initiallyReduced ? [turkish] : []
	}
	game.battle_result = {
		attacker_losses: 0,
		defender_losses: 1,
		turkish_retreat: false,
		retreating_units: []
	}
	game.reserves_to_front_pieces = Engine.combat_cards.get_reserves_to_front_piece_pool(game)

	return { game, turkish, target }
}

test("Reserves to the Front cannot refill a unit that began the battle reduced", () => {
	const { game, turkish, target } = createReservesToFrontState({
		initiallyReduced: true,
		currentState: "eliminated"
	})

	expect(game.reserves_to_front_pieces).toContain(turkish)
	expect(Engine.combat_cards.get_reserves_to_front_piece_cost(game, turkish)).toBe(0.5)

	rules.action(game, CP_ROLE, "piece", turkish)

	expect(game.pieces[turkish]).toBe(target)
	expect(Engine.game_utils.is_piece_reduced(game, turkish)).toBe(true)
	expect(game.reserves_to_front_spent).toBe(0.5)
	expect(Engine.combat_cards.get_reserves_to_front_piece_cost(game, turkish)).toBe(0)
	expect((rules.view(game, CP_ROLE).actions.piece || [])).not.toContain(turkish)

	rules.action(game, CP_ROLE, "piece", turkish)

	expect(Engine.game_utils.is_piece_reduced(game, turkish)).toBe(true)
	expect(game.reserves_to_front_spent).toBe(0.5)
})

test("Reserves to the Front can refill a unit reduced by the current battle", () => {
	const { game, turkish } = createReservesToFrontState({
		initiallyReduced: false,
		currentState: "reduced"
	})

	expect(game.reserves_to_front_pieces).toContain(turkish)
	expect(Engine.combat_cards.get_reserves_to_front_piece_cost(game, turkish)).toBe(0.5)

	rules.action(game, CP_ROLE, "piece", turkish)

	expect(Engine.game_utils.is_piece_reduced(game, turkish)).toBe(false)
	expect(game.reserves_to_front_spent).toBe(0.5)
	expect(Engine.combat_cards.get_reserves_to_front_piece_cost(game, turkish)).toBe(0)
})

test("Reserves to the Front rebuilds an eliminated Turkish attacker in its attack origin", () => {
	const game = setupGame(260509, "Historical", { no_supply_warnings: true })
	const origin = findSpace("Bayburt")
	const target = findSpace("Oltu")
	const turkish = findPieceByName("TU DIV #8")
	const defender = findPieceByName("RU DIV #3")

	clearBoard(game)
	game.pieces[turkish] = Engine.game_utils.get_eliminated_box(CP)
	game.pieces[defender] = target
	game.control[origin] = CP
	game.control[target] = AP
	game.active = CP
	game.state = "event_reserves_to_front"
	game.events = {}
	game.reduced = []
	game.rp_cp.tu = 2
	game.attack = {
		space: target,
		pieces: [],
		origin_by_piece: { [turkish]: origin },
		attacker: CP,
		defender: AP,
		initial_attackers: [turkish],
		initial_defenders: [defender],
		reserves_to_front_damaged_pieces: [turkish],
		reserves_to_front_initial_reduced_pieces: []
	}
	game.battle_result = {
		attackers: [turkish],
		defenders: [defender],
		attacker_losses: 1,
		defender_losses: 0,
		turkish_retreat: false,
		retreating_units: []
	}
	game.reserves_to_front_pieces = Engine.combat_cards.get_reserves_to_front_piece_pool(game)

	expect(game.reserves_to_front_pieces).toContain(turkish)

	rules.action(game, CP_ROLE, "piece", turkish)

	expect(game.pieces[turkish]).toBe(origin)
	expect(game.pieces[turkish]).not.toBe(target)
	expect(Engine.game_utils.is_piece_reduced(game, turkish)).toBe(true)
})

test("combat start snapshots initially reduced units for Reserves to the Front", () => {
	const game = setupGame(260508, "Historical", { no_supply_warnings: true })
	const origin = findSpace("Oltu")
	const target = findSpace("Bayburt")
	const attacker = findPieceByName("RU DIV #3")
	const defender = findPieceByName("TU DIV #8")

	clearBoard(game)
	game.pieces[attacker] = origin
	game.pieces[defender] = target
	game.control[origin] = AP
	game.control[target] = CP
	game.active = AP
	game.reduced = [defender]
	game.retreated = []
	game.attack = {
		space: target,
		pieces: [attacker],
		attacker: AP,
		defender: CP
	}

	Engine.combat.start_attack_sequence(game, () => {})

	expect(game.attack.reserves_to_front_initial_reduced_pieces).toContain(defender)
})
