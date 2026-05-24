"use strict"

const rules = require("../rules.js")
const { setupGame } = require("./helpers.js")

test("snapshot views preserve numeric log cursor for replay panel", () => {
	const game = setupGame(1)
	game.log.push("first entry", "second entry", "third entry")
	const log_length = game.log.length

	const snapshot = JSON.parse(JSON.stringify(game))
	snapshot.log = log_length

	const view = rules.view(snapshot, "Observer")

	expect(view.log).toBe(log_length)
	expect(view.state).toBe(snapshot.state)
	expect(snapshot.log).toBe(log_length)
})

test("live views keep log as an array", () => {
	const game = setupGame(2)
	game.log.push("live entry")

	const view = rules.view(game, "Observer")

	expect(Array.isArray(view.log)).toBe(true)
	expect(view.state).toBe(game.state)
	expect(view.log).toBe(game.log)
	expect(view.log.at(-1)).toBe("live entry")
})
