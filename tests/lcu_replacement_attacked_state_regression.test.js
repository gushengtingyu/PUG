const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName } = require("./helpers.js")

const AP = Engine.constants.AP
const CP = Engine.constants.CP
const AP_ROLE = rules.roles[0]

function setupReducedLcuAttack(replacementNames) {
	const game = setupGame(240625, "Historical", { no_supply_warnings: true })
	const origin = findSpace("Oltu")
	const target = findSpace("Bayburt")
	const lcu = findPieceByName("RU I Caucasian")
	const defender = findPieceByName("TU DIV #8")
	const replacements = replacementNames.map(findPieceByName)
	const apReserve = Engine.game_utils.get_scu_reserve_box(AP)

	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	game.pieces[lcu] = origin
	game.pieces[defender] = target
	for (let p of replacements) game.pieces[p] = apReserve

	game.control[origin] = AP
	game.control[target] = CP
	game.reduced = [lcu]
	game.moved = []
	game.sr_moved = []
	game.attacked = [lcu]
	game.retreated = []
	game.oos = []
	game.entrenching = []
	game.activated = { move: [], attack: [origin] }
	game.region_activations = { attack: {} }
	game.active = AP
	game.state = "apply_attacker_losses"
	game.attack = {
		space: target,
		pieces: [lcu],
		attacker: AP,
		defender: CP,
		origin_by_piece: { [lcu]: origin },
		attacker_losses: 3,
		attacker_losses_absorbed: 0,
		defender_losses: 0,
		defender_losses_absorbed: 0
	}
	game.battle_result = {
		attackers: [lcu],
		defenders: [defender],
		retreating_units: []
	}
	delete game.attack_eligibility_cache

	return { game, lcu, replacements }
}

function finishBackToAttackPhase(game) {
	game.state = "attack"
	game.attack = null
	game.active = AP
	return rules.view(game, AP_ROLE)
}

test("manual LCU replacement inherits attacked state after cleanup", () => {
	const { game, lcu, replacements } = setupReducedLcuAttack(["RU DIV #1", "RU DIV #2"])
	const selected = replacements[0]

	Engine.game_utils.eliminate_piece(game, lcu, () => {}, false)

	expect(game.state).toBe("choose_lcu_replacement")
	expect(game.attack.replacement.options).toEqual(expect.arrayContaining(replacements))
	expect(game.attacked).not.toContain(lcu)
	expect(game.attack.pieces).not.toContain(lcu)

	rules.action(game, AP_ROLE, "piece", selected)

	expect(game.attacked).toContain(selected)
	expect(game.attack.pieces).toContain(selected)
	expect(game.battle_result.attackers).toContain(selected)
	expect(game.battle_result.attackers).not.toContain(lcu)

	const view = finishBackToAttackPhase(game)
	expect(game.eligible_attackers).not.toContain(selected)
	expect(view.actions.piece || []).not.toContain(selected)
})

test("automatic unique LCU replacement keeps attacked state", () => {
	const { game, lcu, replacements } = setupReducedLcuAttack(["RU DIV #1"])
	const replacement = replacements[0]

	let result = Engine.game_utils.eliminate_piece(game, lcu, () => {}, false)

	expect(result).toBe(replacement)
	expect(game.state).toBe("apply_attacker_losses")
	expect(game.attacked).toContain(replacement)
	expect(game.attack.pieces).toContain(replacement)
	expect(game.battle_result.attackers).toContain(replacement)
	expect(game.battle_result.attackers).not.toContain(lcu)

	const view = finishBackToAttackPhase(game)
	expect(game.eligible_attackers).not.toContain(replacement)
	expect(view.actions.piece || []).not.toContain(replacement)
})
