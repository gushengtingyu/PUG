const Engine = require("../modules/engine.js")
const { setupGame, findSpace, clearBoard } = require("./helpers.js")

test("eliminating a piece whose id matches an activated space does not remove the attack marker", () => {
	const game = setupGame(26053001, "Historical", { no_supply_warnings: true })
	const fao = findSpace("Fao")
	const pieceWithFaoId = fao
	const origin = findSpace("Koprukoy")

	expect(Engine.data.pieces[pieceWithFaoId]).toBeTruthy()

	clearBoard(game)
	game.pieces[pieceWithFaoId] = origin
	game.activated = { move: [], attack: [fao], attack_egypt: [] }
	game.attacked = []
	game.reduced = []

	Engine.game_utils.eliminate_piece(game, pieceWithFaoId, () => {})

	expect(game.activated.attack).toContain(fao)
})
