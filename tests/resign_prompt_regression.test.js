const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame } = require("./helpers.js")

const { CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

test("resigned games show the victory message as the prompt", () => {
	let game = setupGame(2026042701)

	game = rules.resign(game, AP_ROLE)

	expect(game.state).toBe("game_over")
	expect(game.active).toBe("None")
	expect(game.result).toBe(CP)
	expect(game.victory).toBe("Allied Powers resigned.")

	for (let role of [AP_ROLE, CP_ROLE, "Observer"]) {
		let view = rules.view(game, role)
		expect(view.prompt).toBe(game.victory)
	}
})

test("server-finished resignation states show the victory message as the prompt", () => {
	let game = setupGame(2026042702)

	game.state = "game_over"
	game.active = "None"
	game.result = AP_ROLE
	game.victory = "Central Powers resigned."
	game.log.push("")
	game.log.push(game.victory)

	for (let role of [AP_ROLE, CP_ROLE, "Observer"]) {
		let view = rules.view(game, role)
		expect(view.prompt).toBe(game.victory)
	}
})
