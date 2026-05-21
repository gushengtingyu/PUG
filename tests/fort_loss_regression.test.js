const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const AP = Engine.constants.AP
const CP = Engine.constants.CP
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function setupKarsFortCombat(seed = 260520) {
	const game = setupGame(seed, "Historical", { no_supply_warnings: true })
	const kars = findSpace("Kars")
	const sarikamis = findSpace("Sarikamis")
	const cpDiv1 = findPieceByName("TU DIV #1")
	const cpDiv2 = findPieceByName("TU DIV #2")
	const cpDiv3 = findPieceByName("TU DIV #3")
	const ruDiv3 = findPieceByName("RU DIV #3")

	clearBoard(game)
	game.control[kars] = AP
	game.control[sarikamis] = CP
	game.forts = { destroyed: [], besieged: [], owner: {} }
	game.broken_sieges = []
	game.reduced = []
	game.retreated = []
	game.events = {}
	game.attacked = []
	game.combat_cards = { attacker: [], defender: [] }
	game.cc_retained = { ap: [], cp: [] }
	game.cc_retained_after_use = { ap: {}, cp: {} }

	return { game, kars, sarikamis, cpDiv1, cpDiv2, cpDiv3, ruDiv3 }
}

test("defender loss options expose an empty fort as a space action", () => {
	let { game, kars, cpDiv1, cpDiv2, cpDiv3 } = setupKarsFortCombat()
	for (let p of [cpDiv1, cpDiv2, cpDiv3]) game.pieces[p] = kars
	game.forts.besieged = [kars]
	game.active = AP
	game.state = "apply_defender_losses"
	game.attack = {
		space: kars,
		pieces: [cpDiv1, cpDiv2, cpDiv3],
		attacker: CP,
		defender: AP,
		attacker_losses: 0,
		attacker_losses_absorbed: 0,
		defender_losses: 3,
		defender_losses_absorbed: 0
	}

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space).toEqual([kars])
	expect(view.actions.destroy_fort).toBeUndefined()
	expect(view.actions.piece || []).toEqual([])

	game = rules.action(game, AP_ROLE, "space", kars)

	expect(game.forts.destroyed).toContain(kars)
	expect(game.forts.besieged || []).not.toContain(kars)
	expect(game.attack.defender_losses_absorbed).toBe(3)
	expect(Engine.map.is_controlled_by(game, kars, CP)).toBe(true)
})

test("destroying a fort in a broken siege transfers control to occupying attackers", () => {
	let { game, kars, cpDiv1, cpDiv2 } = setupKarsFortCombat(260521)
	for (let p of [cpDiv1, cpDiv2]) game.pieces[p] = kars
	game.broken_sieges = [kars]
	game.active = AP
	game.state = "apply_defender_losses"
	game.attack = {
		space: kars,
		pieces: [cpDiv1, cpDiv2],
		attacker: CP,
		defender: AP,
		attacker_losses: 0,
		attacker_losses_absorbed: 0,
		defender_losses: 3,
		defender_losses_absorbed: 0
	}

	game = rules.action(game, AP_ROLE, "space", kars)

	expect(game.forts.destroyed).toContain(kars)
	expect(game.broken_sieges || []).not.toContain(kars)
	expect(Engine.map.is_controlled_by(game, kars, CP)).toBe(true)
})

test("defender losses that break a siege clear the marker and remember the broken siege", () => {
	let { game, kars, cpDiv1, cpDiv2, cpDiv3, ruDiv3 } = setupKarsFortCombat(260522)
	for (let p of [cpDiv1, cpDiv2, cpDiv3, ruDiv3]) game.pieces[p] = kars
	game.reduced = [cpDiv1]
	game.forts.besieged = [kars]
	game.active = CP
	game.state = "apply_defender_losses"
	game.attack = {
		space: kars,
		pieces: [ruDiv3],
		attacker: AP,
		defender: CP,
		attacker_losses: 0,
		attacker_losses_absorbed: 0,
		defender_losses: 1,
		defender_losses_absorbed: 0
	}

	expect(Engine.map.is_besieged(game, kars)).toBe(true)
	game = rules.action(game, CP_ROLE, "piece", cpDiv1)
	game = rules.action(game, CP_ROLE, "done")

	expect(Engine.map.is_besieged(game, kars)).toBe(false)
	expect(game.forts.besieged || []).not.toContain(kars)
	expect(game.broken_sieges).toContain(kars)
	expect(
		Engine.map
			.check_rule_violations(game)
			.some((v) => v.space === kars && v.rule.includes("15.2.1"))
	).toBe(false)
})

test("attacker losses can also break an existing siege", () => {
	let { game, kars, cpDiv1, cpDiv2, cpDiv3 } = setupKarsFortCombat(260523)
	for (let p of [cpDiv1, cpDiv2, cpDiv3]) game.pieces[p] = kars
	game.reduced = [cpDiv1]
	game.forts.besieged = [kars]
	game.active = CP
	game.state = "apply_attacker_losses"
	game.attack = {
		space: kars,
		pieces: [cpDiv1, cpDiv2, cpDiv3],
		attacker: CP,
		defender: AP,
		attacker_losses: 1,
		attacker_losses_absorbed: 0,
		defender_losses: 0,
		defender_losses_absorbed: 0
	}

	expect(Engine.map.is_besieged(game, kars)).toBe(true)
	game = rules.action(game, CP_ROLE, "piece", cpDiv1)
	game = rules.action(game, CP_ROLE, "done")

	expect(Engine.map.is_besieged(game, kars)).toBe(false)
	expect(game.forts.besieged || []).not.toContain(kars)
	expect(game.broken_sieges).toContain(kars)
})
