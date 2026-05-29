const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findCpPiece, clearBoard } = require("./helpers.js")

const { CP } = Engine.constants
const CP_ROLE = rules.roles[1]

function setupEgyptRevoltGame(spaceName) {
	const game = setupGame(26053011, "Historical", { no_supply_warnings: true })
	const unit = findCpPiece("TU-A DIV #10")

	clearBoard(game)
	game.seed = 6
	game.active = CP
	game.state = "jihad_rebellion_check"
	game.jihad = 11
	game.events = {
		pan_turkism: true,
		liberate_suez_active: true
	}
	game.pieces[unit] = findSpace(spaceName)

	return { game, unit }
}

test("CP regular units on the Suez Canal count as in Egypt for Jihad revolt ratings", () => {
	for (let spaceName of ["Port Said", "Ismailia", "Suez"]) {
		const { game } = setupEgyptRevoltGame(spaceName)
		expect(Engine.jihad.has_cp_regular_in_country(game, "Egypt")).toBe(true)
	}
})

test("CP regular units in Sinai do not count as in Egypt for Jihad revolt ratings", () => {
	const { game } = setupEgyptRevoltGame("Romani")
	expect(Engine.jihad.has_cp_regular_in_country(game, "Egypt")).toBe(false)
})

test("Egypt revolt uses the 12 target when a CP regular is on the Suez Canal", () => {
	let { game } = setupEgyptRevoltGame("Port Said")

	game = rules.action(game, CP_ROLE, "rebel_egypt")

	expect(game.jihad_revolt_egypt).toBe(true)
	expect(game.events.egyptian_rebellion).toBe(true)
	expect(game.jihad).toBe(13)
	expect(game.state).toBe("place_egyptian_rebellion")
})
