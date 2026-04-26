const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findPiece } = require("./helpers.js")

const { CP } = Engine.constants
const CP_ROLE = rules.roles[1]

test("圣战上升时不能直接放置消灭盒里的部落单位", () => {
	let game = setupGame(2026041910, "Historical")
	let eliminatedTribe = findPiece(CP, "Bawi")
	let reserveTribe = findPiece(CP, "Bakhtiari")
	let cpEliminated = Engine.game_utils.get_eliminated_box(CP)

	game.pieces[eliminatedTribe] = cpEliminated
	game.state = "jihad_placement"
	game.active = CP
	game.tribes_to_place = 1
	game.selected_piece = null

	let view = rules.view(game, CP_ROLE)

	expect(Engine.game_utils.is_eliminated(game, eliminatedTribe)).toBe(true)
	expect(Engine.game_utils.is_in_reserve(game, eliminatedTribe)).toBe(false)
	expect(view.actions.piece || []).not.toContain(eliminatedTribe)
	expect(view.actions.piece || []).toContain(reserveTribe)
})
