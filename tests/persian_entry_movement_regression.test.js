const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { CP } = Engine.constants

test("Persian Push lets a regular unit escort heavy artillery into the first neutral Persia space", () => {
	let game = setupGame(2026050701)
	let source = findSpace("Suleymaniye")
	let target = findSpace("Sehneh")
	let regular = findPiece(CP, "TU-A DIV #4")
	let heavy = findPiece(CP, "GE Hvy Arty")

	game.events.persian_push = true
	game.pieces[regular] = source
	game.pieces[heavy] = source
	game.move = {
		initial: source,
		current: source,
		pieces: [regular, heavy],
		spaces_moved: 0,
		touched_spaces: []
	}

	expect(Engine.map.can_piece_move_to(game, regular, target, CP)).toBe(true)
	expect(Engine.map.can_piece_move_to(game, heavy, target, CP)).toBe(true)
	expect(Engine.map.can_stack_move_to(game, target, CP)).toBe(true)
	expect(Engine.map.get_space_controller(game, target)).toBe("neutral")
})
