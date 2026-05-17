"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { CP, ELIMINATED } = Engine.constants
const CP_ROLE = rules.roles[1]

function setupEliminatedAh(pool, amount = 1) {
	let game = setupGame(2026051702, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let ahDiv = findPiece(CP, "AH DIV #1")
	game.pieces[ahDiv] = ELIMINATED
	game.active = CP
	game.state = "rp_phase"
	game.rp_cp = { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 }
	game.rp_cp[pool] = amount
	return { game, ahDiv }
}

test.each([
	["ah", "AH"],
	["a", "CP-A"],
	["ge", "GE"]
])("AH eliminated units can rebuild with %s replacement points", (pool) => {
	let { game, ahDiv } = setupEliminatedAh(pool)
	let galicia = findSpace("Galicia")

	let phaseView = rules.view(game, CP_ROLE)
	expect(phaseView.actions.piece || []).toContain(ahDiv)

	game = rules.action(game, CP_ROLE, "piece", ahDiv)

	expect(game.rp_cp[pool]).toBe(0.5)
	expect(game.state).toBe("rp_rebuild_where")
	expect(rules.view(game, CP_ROLE).actions.space || []).toContain(galicia)

	game = rules.action(game, CP_ROLE, "space", galicia)

	expect(game.pieces[ahDiv]).toBe(galicia)
	expect(game.reduced || []).toContain(ahDiv)
})

test("AH eliminated units cannot spend Turkish replacement points", () => {
	let { game, ahDiv } = setupEliminatedAh("tu")

	let phaseView = rules.view(game, CP_ROLE)

	expect(phaseView.actions.piece || []).not.toContain(ahDiv)
	expect(Engine.map.can_afford_replacement(game, ahDiv, 0.5)).toBe(false)
})
