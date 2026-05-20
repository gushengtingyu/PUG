const fs = require("node:fs")
const path = require("node:path")

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]
const CATASTROPHIC_ATTACK = Engine.combat.CC_CP_CATASTROPHIC_ATTACK

function createPostRollCatastrophicAttackGame(attackerLosses = 2, defenderLosses = 1) {
	const game = setupGame(260521, "Historical", { no_supply_warnings: true })
	const origin = findSpace("Baghdad")
	const target = findSpace("Ctesiphon")
	const attacker = findPieceByName("BR IX Corps")
	const defender = findPieceByName("TU DIV #8")

	clearBoard(game)
	game.pieces[attacker] = origin
	game.pieces[defender] = target
	game.control[origin] = AP
	game.control[target] = CP
	game.active = CP
	game.state = "post_roll_cc_defender"
	game.events = {}
	game.reduced = []
	game.retreated = []
	game.attacked = []
	game.cc_retained = { ap: [], cp: [] }
	game.cc_retained_after_use = { ap: {}, cp: {} }
	game.action_state = {}
	game.combat_cards = { attacker: [], defender: [] }
	game.combat_cards_effected = []
	game.hand_cp = [CATASTROPHIC_ATTACK]
	game.discard_cp = []
	game.removed_cp = []
	game.attack = {
		space: target,
		pieces: [attacker],
		attacker: AP,
		defender: CP,
		origin_by_piece: { [attacker]: origin },
		initial_attackers: [attacker],
		initial_defenders: [defender]
	}
	game.battle_result = {
		attacker_losses: attackerLosses,
		defender_losses: defenderLosses,
		retreat_needed: false,
		retreating_faction: null,
		retreating_units: [],
		retreat_can_cancel: false,
		retreat_distance: 1,
		no_advance: false,
		catastrophic_attack: false,
		turkish_retreat: false,
		turkish_retreat_units: [],
		turkish_retreat_optional_units: [],
		turkish_retreat_defender_retreats: false,
		attackers: [attacker],
		defenders: [defender],
		advance_with_reduced: false
	}

	return { game, origin }
}

test("Catastrophic Attack applies after being played in the post-roll defender window", () => {
	const { game, origin } = createPostRollCatastrophicAttackGame()

	expect(rules.view(game, CP_ROLE).actions.play_cc || []).toContain(CATASTROPHIC_ATTACK)

	let next = rules.action(game, CP_ROLE, "play_cc", CATASTROPHIC_ATTACK)
	next = rules.action(next, CP_ROLE, "confirm")

	expect(next.battle_result.catastrophic_attack).toBe(true)
	expect(next.state).toBe("catastrophic_attack_choose_stack")
	expect(next.catastrophic_attack.options.map((option) => option.origin)).toContain(origin)
})

test("Catastrophic Attack is not playable unless the AP attackers lost the combat", () => {
	const { game } = createPostRollCatastrophicAttackGame(1, 2)

	expect(rules.view(game, CP_ROLE).actions.play_cc || []).not.toContain(CATASTROPHIC_ATTACK)
})

test("Catastrophic Attack advance cannot stop in the retreating AP stack space", () => {
	const game = setupGame(260522, "Historical", { no_supply_warnings: true })
	const retreatSpace = findSpace("Museyib")
	const defender = findPieceByName("TU DIV #8")
	const retreatingAp = findPieceByName("BR IX Corps")

	clearBoard(game)
	game.pieces[defender] = retreatSpace
	game.pieces[retreatingAp] = retreatSpace
	game.control[retreatSpace] = AP
	game.active = CP
	game.state = "catastrophic_attack_advance"
	game.selected_piece = defender
	game.retreated = [retreatingAp]
	game.catastrophic_attack = {
		defender_space: findSpace("Ctesiphon"),
		origin: findSpace("Baghdad"),
		retreat_space: retreatSpace,
		retreat_stack: [retreatingAp],
		retreat_stack_oos: true,
		advance_candidates: [defender],
		advance_remaining: { [defender]: 2 },
		advanced_pieces: [defender]
	}

	const view = rules.view(game, CP_ROLE)

	expect(view.actions.end_advance).toBeUndefined()
	expect(view.actions.space || []).not.toEqual([])
	expect(view.actions.space || []).not.toContain(retreatSpace)
})

function createCatastrophicAttackOverstackGame(createdActionRound) {
	const game = setupGame(260523, "Historical", { no_supply_warnings: true })
	const space = findSpace("Baghdad")
	const pieces = [
		findPieceByName("BR DIV #1"),
		findPieceByName("BR DIV #2"),
		findPieceByName("BR DIV #3"),
		findPieceByName("BR DIV #4")
	]

	clearBoard(game)
	for (let p of pieces) game.pieces[p] = space
	game.control[space] = AP
	game.active = AP
	game.state = "end_operations"
	game.events = {}
	game.action_round = 2
	game.catastrophic_attack_overstacks = [
		{
			space,
			faction: AP,
			created_turn: game.turn,
			created_action_round: createdActionRound
		}
	]

	return { game, space, pieces }
}

test("Catastrophic Attack temporary AP overstack is not penalized at the same AP action end", () => {
	const { game } = createCatastrophicAttackOverstackGame(2)

	const next = rules.action(game, AP_ROLE, "end_action")

	expect(next.state).not.toBe("catastrophic_attack_overstack_pe")
	expect(next.catastrophic_attack_overstacks).toHaveLength(1)
})

test("Catastrophic Attack AP overstack is permanently eliminated if unresolved at the next AP action end", () => {
	const { game, space, pieces } = createCatastrophicAttackOverstackGame(1)

	let next = rules.action(game, AP_ROLE, "end_action")

	expect(next.state).toBe("catastrophic_attack_overstack_pe")
	expect(rules.view(next, AP_ROLE).actions.piece || []).toEqual(expect.arrayContaining(pieces))

	next = rules.action(next, AP_ROLE, "piece", pieces[0])

	expect(Engine.game_utils.is_permanently_eliminated(next, pieces[0])).toBe(true)
	expect(Engine.map.get_stack_count(rules.get_pieces_in_space(next, space))).toBe(3)
	expect(next.state).not.toBe("catastrophic_attack_overstack_pe")
})

function createCatastrophicAttackSupplyExceptionGame(createdTurn = null) {
	const game = setupGame(260524, "Historical", { no_supply_warnings: true })
	const ctesiphon = findSpace("Ctesiphon")
	const baghdad = findSpace("Baghdad")
	const retreatingAp = findPieceByName("BR DIV #1")

	clearBoard(game)
	game.pieces[retreatingAp] = baghdad
	game.control[ctesiphon] = CP
	game.control[baghdad] = CP
	game.catastrophic_attack_supply_exceptions = [
		{
			space: baghdad,
			retreat_stack: [retreatingAp],
			created_turn: createdTurn ?? game.turn
		}
	]

	return { game, ctesiphon, baghdad, retreatingAp }
}

test("Catastrophic Attack supply exception lets CP trace only through the forced OOS AP retreat stack this turn", () => {
	const { game, ctesiphon, baghdad, retreatingAp } = createCatastrophicAttackSupplyExceptionGame()

	delete game.catastrophic_attack_supply_exceptions
	expect(Engine.map.get_supply_status(game, baghdad, AP, retreatingAp)).toBe("OOS")
	expect(Engine.map.get_supply_trace_status_to_source(game, ctesiphon, CP, baghdad)).toBe("OOS")

	game.catastrophic_attack_supply_exceptions = [
		{
			space: baghdad,
			retreat_stack: [retreatingAp],
			created_turn: game.turn
		}
	]
	expect(Engine.map.get_supply_trace_status_to_source(game, ctesiphon, CP, baghdad)).toBe("FULL")
})

test("Catastrophic Attack supply exception does not apply to other AP stacks or later turns", () => {
	const { game, ctesiphon, baghdad, retreatingAp } = createCatastrophicAttackSupplyExceptionGame()
	const otherAp = findPieceByName("BR DIV #2")

	game.pieces[retreatingAp] = 0
	game.pieces[otherAp] = baghdad
	expect(Engine.map.get_supply_trace_status_to_source(game, ctesiphon, CP, baghdad)).toBe("OOS")

	game.catastrophic_attack_supply_exceptions = [
		{
			space: baghdad,
			retreat_stack: [otherAp],
			created_turn: game.turn - 1
		}
	]
	expect(Engine.map.get_supply_trace_status_to_source(game, ctesiphon, CP, baghdad)).toBe("OOS")
})

test("Catastrophic Attack OOS retreat stack marker is exposed only while the forced AP stack is OOS", () => {
	const { game, baghdad } = createCatastrophicAttackSupplyExceptionGame()

	let view = rules.view(game, AP_ROLE)
	expect(view.catastrophic_attack_oos_markers).toContain(baghdad)

	game.control[baghdad] = AP
	game.beachheads = [baghdad]
	game.supply_dirty = true
	view = rules.view(game, AP_ROLE)

	expect(view.catastrophic_attack_oos_markers).not.toContain(baghdad)
})

test("frontend renders Catastrophic Attack OOS markers with MBESG.png", () => {
	const playSource = fs.readFileSync(path.join(__dirname, "..", "play.js"), "utf8")
	const imagesCss = fs.readFileSync(path.join(__dirname, "..", "images.css"), "utf8")

	expect(playSource).toContain("catastrophic_attack_oos_markers")
	expect(playSource).toContain("build_catastrophic_attack_oos_marker")
	expect(imagesCss).toContain(".marker.catastrophic_attack_oos")
	expect(imagesCss).toContain("background-image: url(pieces/MBESG.png)")
})
