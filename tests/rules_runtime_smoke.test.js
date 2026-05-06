const rules = require("../rules.js")

test("Activation flow", () => {
	const game = rules.setup(1, "Historical", { seed: 42 })
	expect(game.state).toBeTruthy()
})
