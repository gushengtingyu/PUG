const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findCpPiece: findPiece, clearBoard } = require("./helpers.js")
const { CP } = Engine.constants

test("2 TU SCU + 1 TUA SCU can combine into TU LCU", () => {
	let game = setupGame(2026050901)
	let constantinople = findSpace("Constantinople")

	clearBoard(game)
	game.pieces[findPiece("TU DIV #1")] = constantinople
	game.pieces[findPiece("TU DIV #2")] = constantinople
	game.pieces[findPiece("TU-A DIV #1")] = constantinople
	game.moved = []

	let tuCorps = findPiece("TU I Corps")
	game.pieces[tuCorps] = 0

	let scu_ids = [findPiece("TU DIV #1"), findPiece("TU DIV #2"), findPiece("TU-A DIV #1")]
	let result = Engine.game_utils.get_combination_options_for_lcu(game, tuCorps, scu_ids, constantinople)

	expect(result).not.toBeNull()
	expect(result.type).toBe("full")
	expect(result.pieces).toHaveLength(3)
})

test("2 TU SCU + 1 TUA SCU can combine into TUA LCU", () => {
	let game = setupGame(2026050903)
	let constantinople = findSpace("Constantinople")

	clearBoard(game)
	game.pieces[findPiece("TU DIV #1")] = constantinople
	game.pieces[findPiece("TU DIV #2")] = constantinople
	game.pieces[findPiece("TU-A DIV #1")] = constantinople
	game.moved = []

	let tuaCorps = findPiece("TU-A VI Corps")
	game.pieces[tuaCorps] = 0

	let scu_ids = [findPiece("TU DIV #1"), findPiece("TU DIV #2"), findPiece("TU-A DIV #1")]
	let result = Engine.game_utils.get_combination_options_for_lcu(game, tuaCorps, scu_ids, constantinople)

	expect(result).not.toBeNull()
	expect(result.type).toBe("full")
	expect(result.pieces).toHaveLength(3)
})

test("2 TUA SCU + 1 TU SCU cannot combine into TU LCU", () => {
	let game = setupGame(2026050902)
	let constantinople = findSpace("Constantinople")

	clearBoard(game)
	game.pieces[findPiece("TU-A DIV #1")] = constantinople
	game.pieces[findPiece("TU-A DIV #2")] = constantinople
	game.pieces[findPiece("TU DIV #1")] = constantinople
	game.moved = []

	let tuCorps = findPiece("TU I Corps")
	game.pieces[tuCorps] = 0

	let scu_ids = [findPiece("TU-A DIV #1"), findPiece("TU-A DIV #2"), findPiece("TU DIV #1")]
	let result = Engine.game_utils.get_combination_options_for_lcu(game, tuCorps, scu_ids, constantinople)

	expect(result).toBeNull()
})
