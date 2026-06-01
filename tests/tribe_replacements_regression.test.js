"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { CP, ELIMINATED } = Engine.constants
const CP_ROLE = rules.roles[1]

function setupReplacementState(seed) {
	let game = setupGame(seed, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.state = "rp_phase"
	game.active = CP
	game.rp_cp = { a: 0, ge: 0.5, tu: 0 }
	game.reduced = []
	return game
}

test("CP tribes can rebuild with GERP and return reduced to the Tribal Warfare Key", () => {
	let game = setupReplacementState(2026060101)
	let bawi = findPiece(CP, "Bawi")
	let bawiKey = findSpace("Bawi")

	game.pieces[bawi] = ELIMINATED

	expect(rules.view(game, CP_ROLE).actions.piece || []).toContain(bawi)

	game = rules.action(game, CP_ROLE, "piece", bawi)

	expect(game.state).toBe("rp_rebuild_where")
	expect(game.rp_cp.ge).toBe(0)
	expect(rules.view(game, CP_ROLE).actions.space || []).toContain(bawiKey)

	game = rules.action(game, CP_ROLE, "space", bawiKey)

	expect(game.pieces[bawi]).toBe(bawiKey)
	expect(game.reduced).toContain(bawi)
})

test("CP tribes prefer GERP over TURP when repairing on the Tribal Warfare Key", () => {
	let game = setupReplacementState(2026060102)
	let bawi = findPiece(CP, "Bawi")
	let bawiKey = findSpace("Bawi")

	game.rp_cp = { a: 0.5, ge: 0.5, tu: 0.5 }
	game.pieces[bawi] = bawiKey
	game.reduced = [bawi]

	expect(rules.view(game, CP_ROLE).actions.piece || []).toContain(bawi)

	game = rules.action(game, CP_ROLE, "piece", bawi)

	expect(game.rp_cp).toEqual({ a: 0.5, ge: 0, tu: 0.5 })
	expect(game.reduced).not.toContain(bawi)
})
