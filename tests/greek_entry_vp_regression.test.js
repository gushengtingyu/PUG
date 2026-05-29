const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const CP_ROLE = rules.roles[1]

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

test("CP-allied Greek units can spend CP replacement points and rebuild in Greece", () => {
	let game = setupGame(2026053001, "Historical")
	let greekDiv = findPiece(AP, "GR DIV #1")
	let athens = findSpace("ATHENS")

	Engine.neutral.trigger_greece_entry(game, null, CP, "test")
	clearBoard(game)
	game.pieces[greekDiv] = Engine.game_utils.get_eliminated_box(CP)
	game.reduced = []
	game.rp_ap = { br: 0, ru: 0, in: 0, a: 0 }
	game.rp_cp = { ge: 0.5, tu: 0, a: 0 }
	game.active = CP
	game.state = "rp_phase"

	let cost = Engine.map.get_replacement_cost(game, greekDiv)
	expect(cost).toBe(0.5)
	expect(Engine.map.can_afford_replacement(game, greekDiv, cost)).toBe(true)

	game.rp_cp = { ge: 0, tu: 0, a: 0.5 }
	expect(rules.view(game, CP_ROLE).actions.piece || []).toContain(greekDiv)

	game = rules.action(game, CP_ROLE, "piece", greekDiv)

	expect(game.rp_cp.a).toBe(0)
	expect(game.state).toBe("rp_rebuild_where")
	expect(rules.view(game, CP_ROLE).actions.space || []).toContain(athens)

	game = rules.action(game, CP_ROLE, "space", athens)

	expect(game.pieces[greekDiv]).toBe(athens)
	expect(game.reduced).toContain(greekDiv)
})

test("CP-allied Greek units can SR from the CP reserve box", () => {
	let game = setupGame(2026053002, "Historical")
	let greekDiv = findPiece(AP, "GR DIV #1")
	let athens = findSpace("ATHENS")

	Engine.neutral.trigger_greece_entry(game, null, CP, "test")
	clearBoard(game)
	game.pieces[greekDiv] = Engine.game_utils.get_reserve_box(CP)
	game.active = CP
	game.sr = 1
	game.state = "sr_phase"

	expect(Engine.game_utils.is_in_reserve(game, greekDiv)).toBe(true)
	expect(Engine.game_utils.get_pieces_in_reserve(game, CP)).toContain(greekDiv)
	expect(Engine.game_utils.has_scu_in_reserve(game, "gr")).toBe(true)
	expect(Engine.map.can_use_reserve_sr_for_piece(game, greekDiv, CP)).toBe(true)
	expect(Engine.map.get_sr_destinations(game, greekDiv, CP)).toContain(athens)
	expect(rules.view(game, CP_ROLE).actions.piece || []).toContain(greekDiv)

	game = rules.action(game, CP_ROLE, "piece", greekDiv)
	expect(game.state).toBe("sr_move")
	expect(rules.view(game, CP_ROLE).actions.space || []).toContain(athens)
})

test("CP-allied Greek units stack as CP units", () => {
	let game = setupGame(2026053003, "Historical")
	let greekDiv = findPiece(AP, "GR DIV #1")
	let geDiv = findPiece(CP, "GE DIV #1")
	let athens = findSpace("ATHENS")

	Engine.neutral.trigger_greece_entry(game, null, CP, "test")
	clearBoard(game)
	game.pieces[geDiv] = athens

	expect(Engine.map.can_stack_end_in_space(game, athens, [greekDiv])).toBe(true)
	expect(Engine.map.get_stack_end_block_reason(game, athens, [greekDiv])).toBe(null)
})
