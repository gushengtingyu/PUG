const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function createMenjilPostRollLossGame() {
	const game = setupGame(260525, "Historical", { no_supply_warnings: true })
	const enzeli = findSpace("Enzeli")
	const menjil = findSpace("Menjil")
	const attackers = [
		findPieceByName("RU Baratov HQ"),
		findPieceByName("RU Cavalry #6"),
		findPieceByName("RU Cavalry #8"),
		findPieceByName("RU DIV #14")
	]
	const jangali = findPieceByName("Jangali")

	clearBoard(game)
	for (let p of attackers) game.pieces[p] = enzeli
	game.pieces[jangali] = menjil
	game.control[enzeli] = AP
	game.control[menjil] = CP

	game.active = CP
	game.state = "post_roll_cc_defender"
	game.events = {}
	game.reduced = [jangali]
	game.retreated = []
	game.attacked = []
	game.hand_cp = []
	game.discard_cp = []
	game.removed_cp = []
	game.cc_retained = { ap: [], cp: [] }
	game.cc_retained_after_use = { ap: {}, cp: {} }
	game.action_state = {}
	game.combat_cards = { attacker: [], defender: [Engine.combat.CC_CP_JAFAR_PASHA] }
	game.combat_cards_effected = [Engine.combat.CC_CP_JAFAR_PASHA]
	game.attack = {
		space: menjil,
		pieces: attackers,
		attacker: AP,
		defender: CP,
		origin_by_piece: Object.fromEntries(attackers.map((p) => [p, enzeli])),
		initial_attackers: attackers.slice(),
		initial_defenders: [jangali],
		defender_losses: 3,
		defender_losses_absorbed: 3,
		attacker_losses: 1,
		attacker_losses_absorbed: 0
	}
	game.battle_result = {
		attacker_losses: 1,
		defender_losses: 3,
		retreat_needed: true,
		retreating_faction: CP,
		retreating_units: [jangali],
		retreat_can_cancel: false,
		retreat_distance: 1,
		no_advance: false,
		catastrophic_attack: false,
		turkish_retreat: false,
		turkish_retreat_units: [],
		turkish_retreat_optional_units: [],
		turkish_retreat_defender_retreats: false,
		attackers: attackers.slice(),
		defenders: [jangali],
		advance_with_reduced: false
	}

	return { game, attackers }
}

test("Jafar Pasha post-roll reroll applies newly introduced attacker losses before retreat", () => {
	const { game, attackers } = createMenjilPostRollLossGame()

	const next = rules.action(game, CP_ROLE, "done")

	expect(next.state).toBe("apply_attacker_losses")
	expect(next.active).toBe(AP)
	expect(next.attack.attacker_losses).toBe(1)
	expect(next.attack.attacker_losses_absorbed).toBe(0)
	expect(rules.view(next, AP_ROLE).actions.piece || []).toContain(attackers[3])
})
