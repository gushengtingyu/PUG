const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

test("Greek entry through the neutral module scores empty Athens once", () => {
	let cpGame = setupGame(2026051801, "Historical")
	let apGame = setupGame(2026051802, "Historical")
	let athens = findSpace("ATHENS")

	Engine.neutral.trigger_greece_entry(cpGame, null, CP, "test")
	Engine.neutral.trigger_greece_entry(apGame, null, AP, "test")

	expect(Engine.neutral.get_greece_faction(cpGame)).toBe(CP)
	expect(Engine.map.get_space_controller(cpGame, athens)).toBe(CP)
	expect(cpGame.vp).toBe(11)
	expect(cpGame.neutral_vp_first_captor[athens]).toBe(CP)

	expect(Engine.neutral.get_greece_faction(apGame)).toBe(AP)
	expect(Engine.map.get_space_controller(apGame, athens)).toBe(AP)
	expect(apGame.vp).toBe(9)
	expect(apGame.neutral_vp_first_captor[athens]).toBe(AP)
})

test("Greece and Constantine events use Athens control for VP instead of double counting", () => {
	let greeceGame = setupGame(2026051803, "Historical")
	let constantineGame = setupGame(2026051804, "Historical")
	let athens = findSpace("ATHENS")
	let larissa = findSpace("Larissa")
	let geArmy = findPiece(CP, "German 11th Army")

	Engine.events.get_event_by_id(45).handler(greeceGame, {})

	expect(Engine.neutral.get_greece_faction(greeceGame)).toBe(AP)
	expect(Engine.map.get_space_controller(greeceGame, athens)).toBe(AP)
	expect(greeceGame.vp).toBe(9)

	clearBoard(constantineGame)
	constantineGame.pieces[geArmy] = larissa
	Engine.events.get_event_by_id(71).handler(constantineGame, {})

	expect(Engine.neutral.get_greece_faction(constantineGame)).toBe(CP)
	expect(Engine.map.get_space_controller(constantineGame, athens)).toBe(CP)
	expect(constantineGame.vp).toBe(11)
})

test("Constantine counter clears Greece event Athens VP state", () => {
	let game = setupGame(2026051805, "Historical")
	let athens = findSpace("ATHENS")

	Engine.events.get_event_by_id(45).handler(game, {})
	expect(game.vp).toBe(9)
	expect(game.neutral_vp_first_captor[athens]).toBe(AP)

	Engine.events.get_event_by_id(71).handler(game, {})

	expect(Engine.neutral.get_greece_faction(game)).toBe(null)
	expect(Engine.map.get_space_controller(game, athens)).toBe("neutral")
	expect(game.vp).toBe(10)
	expect(game.neutral_vp_first_captor && game.neutral_vp_first_captor[athens]).toBeUndefined()
})
