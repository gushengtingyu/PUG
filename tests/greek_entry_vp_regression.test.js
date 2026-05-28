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

test("Greek entry preserves the Doiran level 2 trench intact", () => {
	let cpGame = setupGame(2026052803, "Historical")
	let apGame = setupGame(2026052804, "Historical")
	let doiran = findSpace("Doiran")

	Engine.neutral.trigger_greece_entry(cpGame, null, CP, "test")
	Engine.neutral.trigger_greece_entry(apGame, null, AP, "test")

	expect(Engine.game_utils.has_trench(cpGame, doiran)).toBe(2)
	expect(Engine.game_utils.get_trench_owner(cpGame, doiran)).toBe(CP)

	expect(Engine.game_utils.has_trench(apGame, doiran)).toBe(2)
	expect(Engine.game_utils.get_trench_owner(apGame, doiran)).toBe(AP)
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

test("Greek units use CP casualty boxes after Constantine brings Greece into the CP", () => {
	let game = setupGame(2026051806, "Historical")
	let greekEliminated = findPiece(AP, "GR DIV #1")
	let greekRemoved = findPiece(AP, "GR DIV #2")
	let greekPermanentlyEliminated = findPiece(AP, "GR DIV #3")

	Engine.neutral.set_greece_faction(game, CP)

	Engine.game_utils.eliminate_piece(game, greekEliminated, null)
	Engine.game_utils.remove_piece_from_game(game, greekRemoved, null)
	Engine.game_utils.eliminate_piece(game, greekPermanentlyEliminated, null, true)

	expect(Engine.game_utils.get_piece_effective_faction(game, greekEliminated)).toBe(CP)

	expect(game.pieces[greekEliminated]).toBe(Engine.game_utils.get_eliminated_box(CP))
	expect(Engine.game_utils.is_eliminated(game, greekEliminated)).toBe(true)
	expect(Engine.game_utils.get_pieces_in_eliminated(game, CP)).toContain(greekEliminated)
	expect(Engine.game_utils.get_pieces_in_eliminated(game, AP)).not.toContain(greekEliminated)

	expect(game.pieces[greekRemoved]).toBe(Engine.game_utils.get_removed_box(CP))
	expect(Engine.game_utils.is_removed_only(game, greekRemoved)).toBe(true)
	expect(Engine.game_utils.get_pieces_in_removed(game, CP)).toContain(greekRemoved)
	expect(Engine.game_utils.get_pieces_in_removed(game, AP)).not.toContain(greekRemoved)

	expect(game.pieces[greekPermanentlyEliminated]).toBe(Engine.game_utils.get_permanently_eliminated_box(CP))
	expect(Engine.game_utils.is_permanently_eliminated(game, greekPermanentlyEliminated)).toBe(true)
	expect(Engine.game_utils.get_pieces_in_removed(game, CP)).toContain(greekPermanentlyEliminated)
	expect(Engine.game_utils.get_pieces_in_removed(game, AP)).not.toContain(greekPermanentlyEliminated)
})
