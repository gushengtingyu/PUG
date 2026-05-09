const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const AP = rules.AP
const CP = rules.CP

function createMaudeCombat({ attackerCards = [], defenderCards = [], trench = false } = {}) {
	let game = setupGame(777, "Historical", { seed: 42, no_supply_warnings: true })
	let source = findSpace("Baghdad")
	let target = findSpace("Ctesiphon")
	let british = findPieceByName("BR DIV #4")
	let indian = findPieceByName("IN 15th DIV")
	let maude = findPieceByName("BR Maude HQ")
	let turkish = findPieceByName("TU DIV #8")

	clearBoard(game)
	for (let p of [british, indian, maude]) game.pieces[p] = source
	game.pieces[turkish] = target
	game.control[source] = AP
	game.control[target] = CP
	game.active = AP
	game.reduced = []
	game.retreated = []
	game.events = {}
	game.trenches = trench ? [target] : []
	game.trenches_2 = []
	game.attack = {
		space: target,
		pieces: [british, indian, maude],
		attacker: AP,
		defender: CP
	}
	game.combat_cards = {
		attacker: attackerCards,
		defender: defenderCards
	}

	return game
}

function resolveShifts(game) {
	let result = Engine.combat.resolve_battle(game, () => {})
	return { attacker: result.att_shifts, defender: result.def_shifts }
}

test("I Order You to Die supplies virtual trench shifts when not cancelled", () => {
	let game = createMaudeCombat({
		defenderCards: [Engine.combat.CC_CP_I_ORDER_YOU_TO_DIE]
	})

	expect(resolveShifts(game)).toEqual({ attacker: -1, defender: 1 })
})

test("Maude cancels I Order You to Die virtual trench effects at a non-VP space", () => {
	let game = createMaudeCombat({
		attackerCards: [Engine.combat.CC_AP_MAUDE],
		defenderCards: [Engine.combat.CC_CP_I_ORDER_YOU_TO_DIE]
	})

	expect(resolveShifts(game)).toEqual({ attacker: 0, defender: 0 })
})

test("Maude also cancels I Order You to Die upgrading an existing trench", () => {
	let game = createMaudeCombat({
		attackerCards: [Engine.combat.CC_AP_MAUDE],
		defenderCards: [Engine.combat.CC_CP_I_ORDER_YOU_TO_DIE],
		trench: true
	})

	expect(resolveShifts(game)).toEqual({ attacker: 0, defender: 0 })
})
