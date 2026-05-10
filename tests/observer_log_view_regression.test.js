"use strict"

const rules = require("../rules.js")
const { setupGame } = require("./helpers.js")

test("observer view receives the game log without an action set", () => {
	const game = setupGame(2026051001)
	game.active = "cp"
	game.log = ["first visible log entry", "second visible log entry"]

	const view = rules.view(game, "Observer")

	expect(view.log).toEqual(game.log)
	expect(view.actions).toBeNull()
	expect(view.hand).toEqual([])
})
