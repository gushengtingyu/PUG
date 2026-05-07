const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName, findSpaceByPredicate } = require("./helpers.js")

const AP = Engine.constants.AP
const CP = Engine.constants.CP
const AP_ROLE = rules.roles[0]

function setupRepeatedTargetGame() {
	const game = setupGame(260507, "Historical", { no_supply_warnings: true })
	const oltu = findSpace("Oltu")
	const bayburt = findSpace("Bayburt")
	const ruDiv1 = findPieceByName("RU DIV #1")
	const ruDiv2 = findPieceByName("RU DIV #2")
	const tuDiv8 = findPieceByName("TU DIV #8")

	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	game.pieces[ruDiv1] = oltu
	game.pieces[ruDiv2] = oltu
	game.pieces[tuDiv8] = bayburt
	game.control[oltu] = AP
	game.control[bayburt] = CP
	game.reduced = []
	game.retreated = []
	game.attacked = [ruDiv1]
	game.attacked_spaces = [bayburt]
	game.moved = []
	game.oos = []
	game.activated = { move: [], attack: [oltu], attack_egypt: [] }
	game.region_activations = { attack: {} }
	game.active = AP
	game.state = "attack"
	game.attack = { pieces: [], space: -1 }
	delete game.attack_eligibility_cache

	return { game, ruDiv2, bayburt }
}

test("a space already attacked this action round cannot be selected as a target again", () => {
	let { game, ruDiv2, bayburt } = setupRepeatedTargetGame()

	let initialView = rules.view(game, AP_ROLE)
	expect(initialView.actions.piece || []).toContain(ruDiv2)

	game = rules.action(game, AP_ROLE, "piece", ruDiv2)

	let targetView = rules.view(game, AP_ROLE)
	expect(targetView.actions.space || []).not.toContain(bayburt)
})

test("starting an attack records the target space for this action round", () => {
	let { game, ruDiv2, bayburt } = setupRepeatedTargetGame()
	game.attacked = []
	game.attacked_spaces = []
	game.attack = {
		space: bayburt,
		pieces: [ruDiv2],
		attacker: AP,
		defender: CP
	}

	Engine.combat.start_attack_sequence(game, () => {})

	expect(game.attacked_spaces).toContain(bayburt)
})

test("a CC-cancelled battle clears the target space attacked marker", () => {
	let game = setupGame(260508, "Historical", { no_supply_warnings: true })
	let origin = findSpace("Oltu")
	let desert = findSpaceByPredicate((space) => space.terrain === "desert", "desert")
	let ruDiv3 = findPieceByName("RU DIV #3")
	let tuDiv8 = findPieceByName("TU DIV #8")
	let sandstorms = Engine.combat.CC_CP_SANDSTORMS

	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	game.pieces[ruDiv3] = origin
	game.pieces[tuDiv8] = desert
	game.control[origin] = AP
	game.control[desert] = CP
	game.reduced = []
	game.retreated = []
	game.attacked = []
	game.attacked_spaces = [desert]
	game.active = AP
	game.attack = {
		space: desert,
		pieces: [ruDiv3],
		attacker: AP,
		defender: CP
	}
	game.combat_cards = { attacker: [], defender: [sandstorms] }
	game.combat_cards_effected = [sandstorms]
	game.hand_cp = []
	game.discard_cp = [sandstorms]
	game.removed_cp = []
	game.action_state = { used_ccs: [sandstorms] }

	let outcome = Engine.combat.resolve_battle_sequence(game, { log: () => {} })

	expect(outcome).toBe("end")
	expect(game.battle_result.cancelled).toBe(true)
	expect(game.attacked_spaces).not.toContain(desert)
	expect(game.attacked).toContain(ruDiv3)
})
