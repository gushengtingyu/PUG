const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const AP = Engine.constants.AP
const CP = Engine.constants.CP
const CP_ROLE = rules.roles[1]

function createVariableLossAttackersState(attackerLosses = 4) {
	const game = setupGame(260508, "Historical", { no_supply_warnings: true })
	const origin = findSpace("Oltu")
	const target = findSpace("Bayburt")
	const stankeBey = findPieceByName("TU Stanke Bey")
	const corps = findPieceByName("TU III Corps")
	const defender = findPieceByName("RU DIV #3")

	clearBoard(game)
	game.pieces[stankeBey] = origin
	game.pieces[corps] = origin
	game.pieces[defender] = target
	game.control[origin] = CP
	game.control[target] = AP
	game.active = CP
	game.state = "apply_attacker_losses"
	game.reduced = []
	game.retreated = []
	game.attack = {
		space: target,
		pieces: [stankeBey, corps],
		attacker: CP,
		defender: AP,
		origin_by_piece: {
			[stankeBey]: origin,
			[corps]: origin
		},
		piece_lf: {
			[stankeBey]: 4
		},
		attacker_losses: attackerLosses,
		attacker_losses_absorbed: 0,
		defender_losses: 0,
		defender_losses_absorbed: 0
	}
	game.battle_result = {
		attackers: [stankeBey, corps],
		defenders: [defender],
		attacker_losses: attackerLosses,
		defender_losses: 0,
		retreating_units: []
	}

	return { game, stankeBey, corps }
}

test("? LF attackers must allocate the first possible loss to other units in the same space", () => {
	const { game, stankeBey, corps } = createVariableLossAttackersState()

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.piece).toContain(corps)
	expect(view.actions.piece || []).not.toContain(stankeBey)
	expect(view.actions.done).toBeUndefined()

	rules.action(game, CP_ROLE, "piece", corps)

	expect(Engine.game_utils.is_piece_reduced(game, corps)).toBe(true)
	expect(Engine.game_utils.is_piece_reduced(game, stankeBey)).toBe(false)
	expect(game.attack.attacker_losses_absorbed).toBe(3)

	view = rules.view(game, CP_ROLE)
	expect(view.actions.piece || []).toEqual([])
	expect(view.actions.done).toBe(1)
})

test("? LF attackers become eligible after another same-space unit takes a loss", () => {
	const { game, stankeBey, corps } = createVariableLossAttackersState(7)

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.piece).toEqual([corps])

	rules.action(game, CP_ROLE, "piece", corps)

	view = rules.view(game, CP_ROLE)
	expect(view.actions.piece).toContain(stankeBey)
	expect(view.actions.done).toBeUndefined()
})
