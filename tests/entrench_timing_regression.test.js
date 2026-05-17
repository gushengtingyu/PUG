const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const AP = Engine.constants.AP
const AP_ROLE = rules.roles[0]

function setupPendingEntrenchGame({ extraMovableUnit = false } = {}) {
	const game = setupGame(2026051706, "Historical", { no_supply_warnings: true })
	const space = findSpace("Tiflis")
	const unit = findPieceByName("RU I Caucasian")
	const extraUnit = findPieceByName("RU DIV #1")

	clearBoard(game)
	game.pieces[unit] = space
	if (extraMovableUnit) game.pieces[extraUnit] = space
	game.control[space] = AP
	game.trenches = []
	game.trenches_2 = []
	game.moved = []
	game.entrenching = []
	game.entrench_attempts = []
	game.activated = { move: [space], attack: [] }
	game.activation_cost = []
	game.attacked = []
	game.oos = []
	game.active = AP
	game.state = "entrench"
	game.where = space

	return { game, space, unit }
}

test("entrench declaration records the attempt without rolling or placing a trench", () => {
	let { game, space, unit } = setupPendingEntrenchGame({ extraMovableUnit: true })
	const seedBefore = game.seed

	game = rules.action(game, AP_ROLE, "piece", unit)
	game = rules.action(game, AP_ROLE, "confirm")

	expect(game.state).toBe("choose_move_space")
	expect(game.seed).toBe(seedBefore)
	expect(game.trenches).not.toContain(space)
	expect(game.entrench_attempts).toContain(space)
	expect(game.entrenching).toContain(unit)
	expect(game.moved).toContain(unit)
})

test("pending entrench rolls resolve after movement before attacks", () => {
	let { game, space, unit } = setupPendingEntrenchGame()

	game = rules.action(game, AP_ROLE, "piece", unit)
	game = rules.action(game, AP_ROLE, "confirm")
	if (game.state === "choose_move_space") game = rules.action(game, AP_ROLE, "done")

	expect(game.state).toBe("entrench_roll")
	expect(game.trenches).not.toContain(space)

	const seedBeforeRoll = game.seed
	game = rules.action(game, AP_ROLE, "space", space)

	expect(game.seed).not.toBe(seedBeforeRoll)
	expect(game.entrenching).not.toContain(unit)
	expect(["attack", "end_operations"]).toContain(game.state)
})
