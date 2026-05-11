"use strict"

const rules = require("../rules.js")
const { setupGame } = require("./helpers.js")

test("rollback keeps log entries before the restored checkpoint", () => {
	const game = setupGame(2026051101, "Historical")
	game.active = "ap"
	game.log = ["setup", "checkpoint"]

	rules.set_game(game)
	rules.save_rollback_point()

	game.log.push("after checkpoint", "discarded by rollback")

	let restored = rules.action(game, rules.roles[0], "propose_rollback", 0)
	restored = rules.action(restored, rules.roles[1], "accept")

	expect(restored.log).toEqual(["setup", "checkpoint"])
})
