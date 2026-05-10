const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

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

function createSpecialUnitDrmGame(active, attackers, defenders) {
	let game = rules.setup(103, "Historical", { seed: 42, no_supply_warnings: true })
	let oltu = findSpaceByName("Oltu")
	let bayburt = findSpaceByName("Bayburt")

	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	for (let p of attackers) game.pieces[p] = oltu
	for (let p of defenders) game.pieces[p] = bayburt

	game.control[oltu] = active
	game.control[bayburt] = active === rules.AP ? rules.CP : rules.AP
	game.reduced = []
	game.retreated = []
	game.events = {}
	game.attacked = []
	game.active = active
	game.attack = {
		space: bayburt,
		pieces: attackers,
		attacker: active,
		defender: active === rules.AP ? rules.CP : rules.AP
	}
	game.combat_cards = { attacker: [], defender: [] }

	return game
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

function createBesiegedFortMaintenanceGame(attackerNames) {
	let game = rules.setup(105, "Historical", { seed: 42 })
	let kars = findSpaceByName("Kars")
	let sarikamis = findSpaceByName("Sarikamis")
	let attackers = attackerNames.map(findPieceByName)
	let ruDiv3 = findPieceByName("RU DIV #3")

	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	for (let p of attackers) game.pieces[p] = kars
	game.pieces[ruDiv3] = sarikamis

	game.control = game.control || []
	game.control[kars] = rules.CP
	game.control[sarikamis] = rules.AP
	game.forts = { destroyed: [] }
	game.reduced = []
	game.retreated = []
	game.events = {}
	game.attacked = []
	game.active = rules.CP

	return { game, kars, sarikamis, attackers }
}

test("cavalry camel armored DRM log names the first matching unit badge", () => {
	let anzCamel = findPieceByName("ANZ Imp Camel")
	let anzCavalry = findPieceByName("ANZ Cavalry #1")
	let tuDiv8 = findPieceByName("TU DIV #8")
	let logs = []
	let game = createSpecialUnitDrmGame(rules.AP, [anzCamel, anzCavalry], [tuDiv8])

	Engine.combat.resolve_battle_sequence(game, { log: (msg) => logs.push(msg) })

	expect(logs).toContain("  骆驼兵: 进攻方 +1 DRM")
	expect(logs.join("\n")).not.toContain("骑兵/骆驼兵/装甲旅")
})

test("cavalry camel armored DRM log names armored defenders", () => {
	let tuDiv8 = findPieceByName("TU DIV #8")
	let brDunsterforce = findPieceByName("BR Dunsterforce")
	let logs = []
	let game = createSpecialUnitDrmGame(rules.CP, [tuDiv8], [brDunsterforce])

	Engine.combat.resolve_battle_sequence(game, { log: (msg) => logs.push(msg) })

	expect(logs).toContain("  装甲旅: 防守方 +1 DRM")
	expect(logs.join("\n")).not.toContain("骑兵/骆驼兵/装甲旅")
})

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

test("full-strength attacking HQ does not let reduced combat units force a defender retreat", () => {
	let { game, ruDiv3, tuDiv8, bayburt } = createBattleGame()
	let oltu = findSpaceByName("Oltu")
	let yudenitch = findPieceByName("RU Yudenitch HQ")

	game.active = rules.AP
	game.post_roll_cc_done = true
	game.post_battle_cc_done = true
	game.pieces[yudenitch] = oltu
	game.reduced = [ruDiv3]
	game.attack.pieces = [ruDiv3, yudenitch]
	game.attack.origin_by_piece = { [ruDiv3]: oltu, [yudenitch]: oltu }
	game.battle_result = {
		attacker_losses: 1,
		defender_losses: 2,
		retreat_needed: true,
		retreating_faction: rules.CP,
		retreating_units: [tuDiv8],
		retreat_can_cancel: false,
		retreat_distance: 1,
		no_advance: false,
		attackers: [ruDiv3, yudenitch],
		advance_with_reduced: false
	}

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.state).toBe("attack")
	expect(game.pieces[tuDiv8]).toBe(bayburt)
	expect(game.retreat_pieces).toBeUndefined()
	expect(game.advance_pieces).toBeUndefined()
})

test("post-battle retreat refresh ignores full-strength HQ when attacking combat units are reduced", () => {
	let { game, ruDiv3, tuDiv8 } = createBattleGame()
	let oltu = findSpaceByName("Oltu")
	let yudenitch = findPieceByName("RU Yudenitch HQ")

	game.active = rules.AP
	game.pieces[yudenitch] = oltu
	game.reduced = [ruDiv3]
	game.attack.pieces = [ruDiv3, yudenitch]
	game.attack.origin_by_piece = { [ruDiv3]: oltu, [yudenitch]: oltu }
	game.battle_result = {
		attacker_losses: 1,
		defender_losses: 2,
		retreat_needed: true,
		retreating_faction: rules.CP,
		retreating_units: [tuDiv8],
		retreat_can_cancel: true,
		retreat_distance: 1,
		no_advance: false,
		attackers: [ruDiv3, yudenitch],
		advance_with_reduced: false
	}

	Engine.combat.refresh_post_battle_defender_retreat(game)

	expect(game.battle_result.retreat_needed).toBe(false)
	expect(game.battle_result.retreating_units).toEqual([])
	expect(game.battle_result.retreat_can_cancel).toBe(false)
})

test("HQ can accompany an eligible advancing combat unit but cannot anchor advance alone", () => {
	let { game, ruDiv3 } = createBattleGame()
	let oltu = findSpaceByName("Oltu")
	let yudenitch = findPieceByName("RU Yudenitch HQ")

	game.active = rules.AP
	game.pieces[yudenitch] = oltu
	game.attack.pieces = [ruDiv3]
	game.attack.origin_by_piece = { [ruDiv3]: oltu }
	game.reduced = [yudenitch]

	let advance = Engine.combat.get_advance_pieces(game, {
		attackers: [ruDiv3],
		advance_with_reduced: false
	})
	expect(advance).toEqual(expect.arrayContaining([ruDiv3, yudenitch]))

	game.reduced = [ruDiv3]
	game.attack.pieces = [ruDiv3, yudenitch]
	game.attack.origin_by_piece = { [ruDiv3]: oltu, [yudenitch]: oltu }
	advance = Engine.combat.get_advance_pieces(game, {
		attackers: [ruDiv3, yudenitch],
		advance_with_reduced: false
	})
	expect(advance).toEqual([])
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

test("besieged fort attack uses fort owner instead of current control marker", () => {
	let { game, kars, tuICorps } = createBesiegedFortAttackGame()
	game.control[kars] = rules.CP

	expect(Engine.map.is_controlled_by(game, kars, rules.CP)).toBe(true)
	expect(Engine.map.has_undestroyed_fort(game, kars, rules.AP)).toBe(true)
	expect(Engine.map.is_besieged(game, kars)).toBe(true)
	expect(Engine.combat.can_piece_attack_current_fort(game, tuICorps, rules.CP)).toBe(true)

	let initialView = rules.view(game, CP_ROLE)
	expect(initialView.actions.piece || []).toContain(tuICorps)

	rules.action(game, CP_ROLE, "piece", tuICorps)

	let targetView = rules.view(game, CP_ROLE)
	expect(targetView.actions.space || []).toContain(kars)
})

test("besieging SCU cannot attack out if remaining units cannot maintain the siege", () => {
	let { game, kars, sarikamis, attackers } = createBesiegedFortMaintenanceGame([
		"TU DIV #1",
		"TU DIV #2",
		"TU DIV #3"
	])
	let selected = [attackers[0]]
	let remaining = attackers.slice(1)

	expect(Engine.map.is_besieged(game, kars)).toBe(true)
	expect(Engine.map.can_besiege(game, kars, remaining)).toBe(false)

	let targets = Engine.combat.get_legal_attackable_spaces(game, selected, rules.CP, () => "winter", () => true)
	expect(targets).toContain(kars)
	expect(targets).not.toContain(sarikamis)
})

test("besieging unit may attack out if remaining units still maintain the siege", () => {
	let { game, kars, sarikamis, attackers } = createBesiegedFortMaintenanceGame(["TU DIV #1", "TU I Corps"])
	let selected = [attackers[0]]
	let remaining = [attackers[1]]

	expect(Engine.map.is_besieged(game, kars)).toBe(true)
	expect(Engine.map.can_besiege(game, kars, remaining)).toBe(true)

	let targets = Engine.combat.get_legal_attackable_spaces(game, selected, rules.CP, () => "winter", () => true)
	expect(targets).toContain(kars)
	expect(targets).toContain(sarikamis)
})

test("besieging units cannot move out if remaining units cannot maintain the siege", () => {
	let { game, kars, sarikamis, attackers } = createBesiegedFortMaintenanceGame([
		"TU DIV #1",
		"TU DIV #2",
		"TU DIV #3"
	])
	let ruDiv3 = findPieceByName("RU DIV #3")
	game.pieces[ruDiv3] = 0
	game.control[sarikamis] = rules.CP
	game.moved = []
	game.move = {
		initial: kars,
		current: kars,
		pieces: [attackers[0]],
		spaces_moved: 0,
		touched_spaces: []
	}

	expect(Engine.map.is_besieged(game, kars)).toBe(true)
	expect(Engine.map.can_stack_move_to(game, sarikamis, rules.CP)).toBe(false)
	expect(Engine.map.get_piece_move_block_reason(game, attackers[0], sarikamis, rules.CP)).toContain("围攻兵力不足")

	game.move.pieces = attackers.slice()
	expect(Engine.map.can_stack_move_to(game, sarikamis, rules.CP)).toBe(true)
})

test("besieging unit cannot SR out if remaining units cannot maintain the siege", () => {
	let { game, kars, attackers } = createBesiegedFortMaintenanceGame(["TU DIV #1", "TU DIV #2", "TU DIV #3"])
	let ruDiv3 = findPieceByName("RU DIV #3")
	let route = ["Sarikamis", "Oltu", "Koprukoy", "Erzurum"].map(findSpaceByName)
	for (let s of route) game.control[s] = rules.CP
	game.pieces[ruDiv3] = 0
	game.sr_moved = []

	expect(Engine.map.is_besieged(game, kars)).toBe(true)
	expect(Engine.map.get_supply_status(game, kars, rules.CP, attackers[0], true)).toBe("FULL")
	expect(Engine.map.can_sr_piece(game, attackers[0], rules.CP)).toBe(false)
})

test("below-minimum units and tribes do not keep an enemy fort besieged", () => {
	let { game, kars } = createBesiegedFortMaintenanceGame(["TU DIV #1", "TU DIV #2"])
	let bakhtiari = findPieceByName("Bakhtiari")
	let logs = []
	game.seed = 1
	game.pieces[bakhtiari] = kars

	expect(Engine.map.can_besiege(game, kars, Engine.map.get_pieces_in_space(game, kars))).toBe(false)
	expect(Engine.map.is_besieged(game, kars)).toBe(false)

	Engine.combat.resolve_siege(game, kars, (msg) => logs.push(msg))

	expect(logs).toEqual([])
	expect(game.forts.destroyed || []).not.toContain(kars)
})

test("HQ and Heavy Artillery do not count toward besieging an enemy fort", () => {
	let { game, kars } = createBesiegedFortMaintenanceGame(["TU DIV #1", "TU DIV #2"])
	let mackensen = findPieceByName("GE Mackenson HQ")
	let heavyArtillery = findPieceByName("GE Hvy Arty")

	game.pieces[mackensen] = kars
	game.pieces[heavyArtillery] = kars

	expect(Engine.map.can_besiege(game, kars, Engine.map.get_pieces_in_space(game, kars))).toBe(false)
	expect(Engine.map.is_besieged(game, kars)).toBe(false)
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
