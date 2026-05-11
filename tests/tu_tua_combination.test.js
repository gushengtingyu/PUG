const Engine = require("../modules/engine.js")
const rules = require("../rules.js")
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

test("Turkish Reinforcements 81 combination stays limited to event LCUs after clearing selection", () => {
	let game = setupGame(2026051101)
	let constantinople = findSpace("Constantinople")
	let corpsReserve = findSpace("CP Corps Assets")
	let eventLcu = findPiece("TU XIV Corps")
	let otherLcu = findPiece("TU I Corps")
	let scus = [findPiece("TU DIV #1"), findPiece("TU DIV #2"), findPiece("TU DIV #3")]

	clearBoard(game)
	for (let p of scus) game.pieces[p] = constantinople
	game.pieces[eventLcu] = corpsReserve
	game.pieces[otherLcu] = corpsReserve
	game.moved = []
	game.active = CP
	game.state = "combine_lcu"
	game.where = constantinople
	game.event_ctx = { key: "turkish_reinf_81", data: {} }
	game.combine_ctx = {
		selected_scus: [],
		allowed_lcus: [eventLcu],
		event_flag_on_success: { key: "turkish_reinf_81", field: "combine_used" }
	}

	let role = rules.roles[1]
	game = rules.action(game, role, "piece", scus[0])
	game = rules.action(game, role, "clear")

	expect(game.combine_ctx.selected_scus).toEqual([])
	expect(game.combine_ctx.allowed_lcus).toEqual([eventLcu])
	expect(game.combine_ctx.event_flag_on_success).toEqual({ key: "turkish_reinf_81", field: "combine_used" })

	for (let p of scus) game = rules.action(game, role, "piece", p)
	game = rules.action(game, role, "select_lcu")
	expect(game.state).toBe("combine_lcu_select_lcu")

	game = rules.action(game, role, "piece", otherLcu)
	expect(game.state).toBe("combine_lcu_select_lcu")
	expect(game.combine_ctx.lcu_id).toBeUndefined()

	game = rules.action(game, role, "piece", eventLcu)
	expect(game.state).toBe("combine_lcu_dispose_reserve")
	expect(game.combine_ctx.lcu_id).toBe(eventLcu)
})
