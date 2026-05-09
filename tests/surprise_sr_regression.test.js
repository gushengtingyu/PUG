"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const CP_ROLE = rules.roles[1]
const { AP, CP } = Engine.constants

test("Surprise SR prompt can evaluate overland SR paths", () => {
	let game = setupGame(2026050901, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let source = findSpace("Erzincan")
	let target = findSpace("Erzurum")
	let piece = findPiece(CP, "TU DIV #8")

	game.active = CP
	game.state = "surprise_sr"
	game.attack = { space: target, pieces: [], attacker: AP, defender: CP }
	game.surprise = { remaining: 2, space: target }
	game.pieces[piece] = source
	game.control[source] = CP
	game.control[target] = CP

	expect(typeof Engine.map.has_sr_path).toBe("function")
	let view = rules.view(game, CP_ROLE)
	expect(view.actions.piece || []).toContain(piece)
})
