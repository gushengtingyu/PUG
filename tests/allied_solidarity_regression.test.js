const Engine = require("../modules/engine.js")
const { setupGame, findSpace, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

function optionNames(game, unit) {
	return Engine.events.get_allied_solidarity_space_options(game, unit).map((s) => Engine.data.spaces[s].name)
}

test("Allied Solidarity allows RU 2/4 Special to enter at AP-controlled Odessa", () => {
	let game = setupGame(2026052101, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	Engine.set_control(game, findSpace("Odessa"), AP)

	expect(optionNames(game, "RU 2/4 Special")).toContain("Odessa")
	expect(optionNames(game, "IT DIV")).not.toContain("Odessa")
	expect(optionNames(game, "GR National Defense")).not.toContain("Odessa")
})

test("Allied Solidarity does not allow RU 2/4 Special to enter enemy-controlled Odessa", () => {
	let game = setupGame(2026052102, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	Engine.set_control(game, findSpace("Odessa"), CP)

	expect(optionNames(game, "RU 2/4 Special")).not.toContain("Odessa")
})
