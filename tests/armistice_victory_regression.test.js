const fs = require("node:fs")

const Engine = require("../modules/engine.js")
const turnStates = require("../modules/states/states_turn.js")

const { setupGame, findSpace, findApPiece, findCpPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

function getTurnFuncs(game) {
	turnStates.set_globals(game)
	return turnStates.register({}, Engine, {
		log: () => {},
		log_h1: () => {},
		get_pieces_in_space: Engine.map.get_pieces_in_space,
		find_space: Engine.game_utils.find_space,
		get_connected_spaces: Engine.map.get_connected_spaces,
		is_controlled_by: Engine.map.is_controlled_by,
		is_gallipoli: Engine.map.is_gallipoli,
		pieces_count_as_any_nation_for_rule: Engine.game_utils.pieces_count_as_any_nation_for_rule,
		get_season: Engine.game_utils.get_season,
		goto_game_over: (result, victory) => {
			game.state = "game_over"
			game.result = result
			game.victory = victory
		},
		MO_NONE: Engine.mo.MO_NONE,
		AP,
		CP
	})
}

function setArmisticeBaseline(game) {
	clearBoard(game)
	game.jihad = 4
	game.control[findSpace("Ploesti")] = "neutral"
	game.control[findSpace("Baku")] = AP
	game.control[findSpace("Mosul")] = CP
	game.control[findSpace("Ahwaz")] = AP
	game.control[findSpace("Kirkuk")] = CP
	game.control[findSpace("Bahrain")] = AP
}

test("armistice oil adjustment uses only PAC oil fields and counts neutral Ploesti for CP", () => {
	let game = setupGame(2026052403, "Historical", { no_supply_warnings: true })
	setArmisticeBaseline(game)

	let turn = getTurnFuncs(game)

	expect(turn.calculate_protocol_victory_adjustments()).toBe(0)
})

test("armistice adjustment counts TU-A units at Suez and in India", () => {
	let game = setupGame(2026052404, "Historical", { no_supply_warnings: true })
	setArmisticeBaseline(game)

	game.pieces[findCpPiece("TU-A VI Corps")] = findSpace("Suez")
	game.pieces[findCpPiece("TU-A DIV #1")] = findSpace("INDIA")

	let turn = getTurnFuncs(game)

	expect(turn.calculate_protocol_victory_adjustments()).toBe(2)
})

test("armistice Constantinople adjustment does not also count the Bosphorus Forts", () => {
	let game = setupGame(2026052405, "Historical", { no_supply_warnings: true })
	setArmisticeBaseline(game)

	let british = findApPiece("BR IX Corps")
	game.pieces[british] = findSpace("The Bosphorus Forts")

	let turn = getTurnFuncs(game)

	expect(turn.calculate_protocol_victory_adjustments()).toBe(0)

	game.pieces[british] = findSpace("CONSTANTINOPLE")

	expect(turn.calculate_protocol_victory_adjustments()).toBe(-1)
})

test("automatic victory takes precedence over protocol victory", () => {
	let game = setupGame(2026052406, "Historical", { no_supply_warnings: true })
	setArmisticeBaseline(game)
	game.protocol_victory = true
	game.vp = 20

	let turn = getTurnFuncs(game)

	expect(turn.check_victory_conditions()).toBe(true)
	expect(game.victory).toBe("同盟国自动胜利 (VP 20+)")
})

test("turn 1 war status still checks automatic victory before the early skip", () => {
	let game = setupGame(2026052407, "Historical", { no_supply_warnings: true })
	setArmisticeBaseline(game)
	game.turn = 1
	game.vp = 20
	game.mo_ap = Engine.mo.MO_NONE
	game.mo_cp = Engine.mo.MO_NONE
	game.mo_ap_fulfilled = true
	game.mo_cp_fulfilled = true

	let turn = getTurnFuncs(game)
	turn.start_war_status_phase()

	expect(game.state).toBe("game_over")
	expect(game.victory).toBe("同盟国自动胜利 (VP 20+)")
})

test("armistice scheduling is capped to the scenario final turn", () => {
	let source = fs.readFileSync("rules.js", "utf8")

	expect(source).toContain("let final_turn = game.scenario_max_turn || 17")
	expect(source).toContain("Math.min(final_turn, game.turn + turns)")
	expect(source).not.toContain("Math.min(20, game.turn + turns)")
})
