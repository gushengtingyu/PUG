const assert = require("node:assert/strict")
const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function findCardByEvent(eventName) {
	let card = data.cards.findIndex((info, idx) => idx > 0 && info && info.event === eventName)
	if (card < 0) throw new Error(`Missing card: ${eventName}`)
	return card
}

function findPieceByName(name) {
	let piece = data.pieces.findIndex((info, idx) => idx > 0 && info && info.name === name)
	if (piece < 0) throw new Error(`Missing piece: ${name}`)
	return piece
}

function findSpaceByName(name) {
	let space = data.spaces.findIndex((info, idx) => idx > 0 && info && info.name === name)
	if (space < 0) throw new Error(`Missing space: ${name}`)
	return space
}

function findSpaceByTerrain(terrain) {
	let space = data.spaces.findIndex((info, idx) => idx > 0 && info && info.terrain === terrain)
	if (space < 0) throw new Error(`Missing ${terrain} space`)
	return space
}

function createBattleGame() {
	let game = rules.setup(101, "Historical", { seed: 42 })
	let oltu = findSpaceByName("Oltu")
	let bayburt = findSpaceByName("Bayburt")
	let ruDiv3 = findPieceByName("RU DIV #3")
	let tuDiv8 = findPieceByName("TU DIV #8")

	game.pieces[ruDiv3] = oltu
	game.pieces[tuDiv8] = bayburt
	game.reduced = []
	game.retreated = []
	game.events = game.events || {}
	game.cc_retained = { ap: [], cp: [] }
	game.cc_retained_after_use = { ap: {}, cp: {} }
	game.action_state = {}
	game.attack = {
		space: bayburt,
		pieces: [ruDiv3],
		attacker: rules.AP,
		defender: rules.CP
	}

	return { game, ruDiv3, tuDiv8, bayburt }
}

function createBesiegedFortAttackGame() {
	let game = rules.setup(102, "Historical", { seed: 42 })
	let kars = findSpaceByName("Kars")
	let sarikamis = findSpaceByName("Sarikamis")
	let oltu = findSpaceByName("Oltu")
	let koprukoy = findSpaceByName("Koprukoy")
	let tuICorps = findPieceByName("TU I Corps")

	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0

	game.pieces[tuICorps] = kars
	game.control = game.control || []
	game.control[kars] = rules.AP
	game.control[sarikamis] = rules.CP
	game.control[oltu] = rules.CP
	game.control[koprukoy] = rules.CP
	game.forts = { destroyed: [] }
	game.reduced = []
	game.retreated = []
	game.events = {}
	game.attacked = []
	game.activated = { attack: [kars] }
	game.region_activations = { attack: {} }
	game.active = rules.CP
	game.state = "attack"
	game.attack = { pieces: [], space: -1 }

	return { game, kars, tuICorps }
}

test("German High Command cannot be reused in same action", () => {
	let { game } = createBattleGame()
	let germanHighCommand = findCardByEvent("GERMAN HIGH COMMAND CC")

	game.active = rules.CP
	game.state = "play_cc_defender"
	game.cc_retained.cp = [germanHighCommand]
	game.cc_retained_after_use.cp[germanHighCommand] = "discard"

	let firstView = rules.view(game, CP_ROLE)
	expect((firstView.actions.play_cc || []).includes(germanHighCommand)).toBe(true)

	rules.action(game, CP_ROLE, "play_cc", germanHighCommand)
	expect((game.action_state.used_ccs || []).includes(germanHighCommand)).toBe(true)

	// Simulate the card being retained after the first battle, then open a second battle in the same action.
	game.cc_retained.cp = [germanHighCommand]
	game.cc_retained_after_use.cp[germanHighCommand] = "discard"
	game.active = rules.CP
	game.state = "play_cc_defender"
	game.combat_cards = { attacker: [], defender: [] }

	let secondView = rules.view(game, CP_ROLE)
	expect((secondView.actions.play_cc || []).includes(germanHighCommand)).toBe(false)

	rules.action(game, CP_ROLE, "play_cc", germanHighCommand)
	expect(game.combat_cards.defender).toEqual([])
})

test("Turkish retreat does not log standard no retreat message", () => {
	let { game, ruDiv3, tuDiv8 } = createBattleGame()
	let logs = []

	game.active = rules.AP
	game.post_roll_cc_done = true
	game.reduced = [ruDiv3]
	game.battle_result = {
		attacker_losses: 1,
		defender_losses: 0,
		retreat_needed: false,
		retreating_faction: null,
		retreating_units: [],
		retreat_can_cancel: false,
		retreat_distance: 1,
		no_advance: false,
		turkish_retreat: true,
		turkish_retreat_units: [tuDiv8],
		turkish_retreat_optional_units: [],
		advance_with_reduced: true
	}

	Engine.combat.end_battle_sequence(game, (msg) => logs.push(msg))

	expect(logs.includes("Attacker has no full-strength units, defenders do not retreat.")).toBe(false)
	expect(game.state).toBe("turkish_retreat")
})

test("Turkish Withdrawal lets different TU units retreat to different legal spaces", () => {
	let game = rules.setup(104, "Historical", { seed: 42 })
	let trabzon = findSpaceByName("Trabzon")
	let rize = findSpaceByName("Rize")
	let giresun = findSpaceByName("Giresun")
	let tuDiv1 = findPieceByName("TU DIV #1")
	let tuDiv2 = findPieceByName("TU DIV #2")

	game.state = "turkish_retreat"
	game.active = rules.CP
	game.attack = {
		space: trabzon,
		pieces: [],
		attacker: rules.AP,
		defender: rules.CP
	}
	game.battle_result = {
		turkish_retreat: true,
		no_advance: false
	}
	game.turkish_retreat_pending = true
	game.turkish_retreat_space = trabzon
	game.turkish_retreat_mandatory = [tuDiv1, tuDiv2]
	game.turkish_retreat_optional = []
	game.retreat_steps_left = {
		[tuDiv1]: 1,
		[tuDiv2]: 1
	}
	game.selected_piece = tuDiv1
	game.retreated = []
	game.pieces[tuDiv1] = trabzon
	game.pieces[tuDiv2] = trabzon

	let firstView = rules.view(game, CP_ROLE)
	expect(firstView.actions.space || []).toContain(rize)
	expect(firstView.actions.space || []).toContain(giresun)

	game = rules.action(game, CP_ROLE, "space", rize)
	game = rules.action(game, CP_ROLE, "piece", tuDiv2)

	let secondView = rules.view(game, CP_ROLE)
	expect(secondView.actions.space || []).toContain(giresun)

	game = rules.action(game, CP_ROLE, "space", giresun)

	expect(game.pieces[tuDiv1]).toBe(rize)
	expect(game.pieces[tuDiv2]).toBe(giresun)
})

test("Cancelled battle returns other ccs to action availability", () => {
	let { game, ruDiv3, tuDiv8 } = createBattleGame()
	let germanHighCommand = findCardByEvent("GERMAN HIGH COMMAND CC")
	let sandstorms = 61
	let desertSpace = findSpaceByTerrain("desert")

	game.active = rules.AP
	game.attack = {
		space: desertSpace,
		pieces: [ruDiv3],
		attacker: rules.AP,
		defender: rules.CP
	}
	game.pieces[tuDiv8] = desertSpace
	game.combat_cards = { attacker: [], defender: [germanHighCommand, sandstorms] }
	game.combat_cards_effected = [sandstorms]
	game.hand_cp = []
	game.discard_cp = [germanHighCommand, sandstorms]
	game.removed_cp = []
	game.action_state = { used_ccs: [germanHighCommand, sandstorms] }

	let outcome = Engine.combat.resolve_battle_sequence(game, { log: () => {} })

	expect(outcome).toBe("end")
	expect(game.battle_result.cancelled).toBe(true)
	expect(game.hand_cp.includes(germanHighCommand)).toBe(true)
	expect(game.discard_cp.includes(germanHighCommand)).toBe(false)
	expect(game.discard_cp.includes(sandstorms)).toBe(true)
	expect((game.action_state.used_ccs || []).includes(germanHighCommand)).toBe(false)
	expect((game.action_state.used_ccs || []).includes(sandstorms)).toBe(true)
})

test("unit inside besieged enemy fort can target the fort in its own space", () => {
	let { game, kars, tuICorps } = createBesiegedFortAttackGame()

	let initialView = rules.view(game, CP_ROLE)
	expect(initialView.actions.piece || []).toContain(tuICorps)

	rules.action(game, CP_ROLE, "piece", tuICorps)

	let targetView = rules.view(game, CP_ROLE)
	expect(targetView.actions.space || []).toContain(kars)
})

test("same-space fort attack does not open an advance step", () => {
	let { game, kars, tuICorps } = createBesiegedFortAttackGame()

	game.attack = {
		space: kars,
		pieces: [tuICorps],
		attacker: rules.CP,
		defender: rules.AP
	}
	game.post_battle_cc_done = true
	game.battle_resolution_applied = true
	game.battle_result = {
		attackers: [tuICorps],
		attacker_losses: 0,
		defender_losses: 0,
		retreat_needed: false,
		no_advance: false,
		advance_with_reduced: false
	}

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.state).not.toBe("advance")
	expect(game.advance_pieces).toBeUndefined()
})
