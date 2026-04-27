const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, findCpPiece: findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

function placeTurkishDivisionPair(game, space) {
	game.pieces[findPiece("TU DIV #1")] = space
	game.pieces[findPiece("TU DIV #2")] = space
	game.moved = []
}

test("LCUs cannot organize in restricted spaces without an actual rail line", () => {
	let game = setupGame(2026042101)
	let aqaba = findSpace("Aqaba")

	placeTurkishDivisionPair(game, aqaba)

	expect(Engine.map.get_supply_status(game, aqaba, CP, findPiece("TU DIV #1"))).toBe("FULL")
	expect(Engine.map.is_rail_connected_to_supply(game, aqaba, CP)).toBe(false)
	expect(Engine.game_utils.can_combine_in_space(game, aqaba, CP)).toBe(false)
})

test("LCUs cannot enter or organize in desert spaces without an actual rail line", () => {
	let game = setupGame(2026042102)
	let kuwait = findSpace("Kuwait")
	let tuCorps = findPiece("TU III Corps")

	placeTurkishDivisionPair(game, kuwait)

	expect(Engine.map.get_supply_status(game, kuwait, CP, findPiece("TU DIV #1"))).toBe("FULL")
	expect(Engine.map.is_rail_connected_to_supply(game, kuwait, CP)).toBe(false)
	expect(Engine.game_utils.can_combine_in_space(game, kuwait, CP)).toBe(false)
	expect(Engine.map.can_enter_region(game, tuCorps, kuwait)).toBe(false)
})

test("ANZ Desert Corps can move across unfinished Sinai railroad as a normal connection", () => {
	let game = setupGame(2026042105)
	let ismailia = findSpace("Ismailia")
	let romani = findSpace("Romani")
	let anzDesertCorps = findApPiece("ANZ Desert Corps")
	let britishCorps = findApPiece("BR IX Corps")

	clearBoard(game)
	game.events = game.events || {}
	delete game.events.xinai
	game.pieces[anzDesertCorps] = ismailia
	game.pieces[britishCorps] = ismailia
	game.move = {
		initial: ismailia,
		current: ismailia,
		spaces_moved: 0,
		pieces: [anzDesertCorps],
		touched_spaces: [ismailia]
	}

	expect(Engine.map.can_piece_move_to(game, anzDesertCorps, romani, AP)).toBe(true)

	game.move.pieces = [britishCorps]
	expect(Engine.map.can_piece_move_to(game, britishCorps, romani, AP)).toBe(false)
})

test("Rail-connected desert restricted spaces still allow legal LCU organization", () => {
	let game = setupGame(2026042103)
	let tabuk = findSpace("Tabuk")
	let tuCorps = findPiece("TU III Corps")

	placeTurkishDivisionPair(game, tabuk)

	expect(Engine.map.is_rail_connected_to_supply(game, tabuk, CP)).toBe(true)
	expect(Engine.game_utils.can_combine_in_space(game, tabuk, CP)).toBe(true)
	expect(Engine.map.can_enter_region(game, tuCorps, tabuk)).toBe(true)
})

test("Turkish LCUs still cannot organize in swamp spaces", () => {
	let game = setupGame(2026042104)
	let basra = findSpace("Basra")

	placeTurkishDivisionPair(game, basra)

	expect(Engine.map.get_supply_status(game, basra, CP, findPiece("TU DIV #1"))).toBe("FULL")
	expect(Engine.game_utils.can_combine_in_space(game, basra, CP)).toBe(false)
})
