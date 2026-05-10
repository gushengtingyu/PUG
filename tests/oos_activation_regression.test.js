const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const turnStates = require("../modules/states/states_turn.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function prepareActivationState(game, faction, ops = 5) {
	game.active = faction
	game.state = "activate_spaces"
	game.ops = ops
	game.activated = { move: [], attack: [] }
	game.moved = []
	game.attacked = []
	game.retreated = []
	game.activation_cost = {}
}

function getTurnFuncs(game) {
	turnStates.set_globals(game)
	return turnStates.register({}, Engine, {
		log: () => {},
		log_h1: () => {},
		get_pieces_in_space: Engine.map.get_pieces_in_space,
		find_space: Engine.game_utils.find_space,
		space_name: Engine.game_utils.space_name,
		piece_name: Engine.game_utils.piece_name,
		other_faction: Engine.utils.other_faction,
		set_control: Engine.set_control,
		check_supply: Engine.map.check_supply,
		eliminate_piece: (p, permanent = false) => Engine.game_utils.eliminate_piece(game, p, () => {}, permanent),
		roll_die: () => 1,
		MO_NONE: "NONE",
		PHASE_SEQUENCE: {},
		AP: Engine.constants.AP,
		CP: Engine.constants.CP
	})
}

test("断补单位不能被激活为移动或攻击", () => {
	let game = setupGame(2026041801)
	let ruDiv = findPiece(AP, "RU DIV #1")
	let tuDiv = findPiece(CP, "TU DIV #8")
	let kronstadt = findSpace("Kronstadt")
	let hermannstadt = findSpace("Hermannstadt")

	game.pieces[ruDiv] = kronstadt
	game.pieces[tuDiv] = hermannstadt
	prepareActivationState(game, AP)

	expect(Engine.map.get_supply_status(game, kronstadt, AP, ruDiv)).toBe("OOS")
	expect(
		Engine.combat.can_activate_piece_in_space_to_attack(
			game,
			ruDiv,
			kronstadt,
			AP,
			() => Engine.game_utils.get_season(game),
			rules.is_rail_connected_to_supply
		)
	).toBe(false)

	let view = rules.view(game, AP_ROLE)

	expect(view.actions.activate_move || []).not.toContain(kronstadt)
	expect(view.actions.activate_attack || []).not.toContain(kronstadt)
})

test("有限补给单位仍可为移动激活，但不能为攻击激活", () => {
	let game = setupGame(2026041802)
	let tuDiv = findPiece(CP, "TU DIV #8")
	let ruDiv = findPiece(AP, "RU DIV #1")
	let afghanistan = findSpace("Afghanistan")
	let meshed = findSpace("Meshed")

	game.pieces[tuDiv] = afghanistan
	game.pieces[ruDiv] = meshed
	prepareActivationState(game, CP)

	expect(Engine.map.get_supply_status(game, afghanistan, CP, tuDiv)).toBe("LIMITED")
	expect(
		Engine.combat.can_activate_piece_in_space_to_attack(
			game,
			tuDiv,
			afghanistan,
			CP,
			() => Engine.game_utils.get_season(game),
			rules.is_rail_connected_to_supply
		)
	).toBe(false)

	let view = rules.view(game, CP_ROLE)

	expect(view.actions.activate_move || []).toContain(afghanistan)
	expect(view.actions.activate_attack || []).not.toContain(afghanistan)
})

test("断补来源地即便已被标记为攻击激活，也不会继续保留攻击资格", () => {
	let game = setupGame(2026041803)
	let ruDiv = findPiece(AP, "RU DIV #1")
	let tuDiv = findPiece(CP, "TU DIV #8")
	let kronstadt = findSpace("Kronstadt")
	let hermannstadt = findSpace("Hermannstadt")

	game.pieces[ruDiv] = kronstadt
	game.pieces[tuDiv] = hermannstadt
	game.active = AP
	game.state = "attack"
	game.activated = { move: [], attack: [kronstadt] }
	game.moved = []
	game.attacked = []
	game.retreated = []
	game.attack = { pieces: [], space: -1 }

	let view = rules.view(game, AP_ROLE)

	expect(game.eligible_attackers || []).not.toContain(ruDiv)
	expect(game.activated.attack || []).not.toContain(kronstadt)
	expect(view.actions.piece || []).not.toContain(ruDiv)
})

test("满编 OOS SCU 在 Attrition Phase 直接永久消灭，不会先翻面", () => {
	let game = setupGame(2026042307)
	let turn = getTurnFuncs(game)
	let ruDiv = findPiece(AP, "RU DIV #1")
	let tuDiv = findPiece(CP, "TU DIV #8")
	let kronstadt = findSpace("Kronstadt")
	let hermannstadt = findSpace("Hermannstadt")

	game.pieces[ruDiv] = kronstadt
	game.pieces[tuDiv] = hermannstadt
	game.mo_ap = "NONE"
	game.mo_cp = "NONE"
	game.mo_ap_fulfilled = true
	game.mo_cp_fulfilled = true

	expect(Engine.map.get_supply_status(game, kronstadt, AP, ruDiv)).toBe("OOS")

	turn.start_attrition_phase()

	expect(Engine.game_utils.is_permanently_eliminated(game, ruDiv)).toBe(true)
	expect(game.reduced || []).not.toContain(ruDiv)
})

test("满编 OOS LCU 在 Attrition Phase 直接永久消灭，不会替换出 SCU", () => {
	let game = setupGame(2026042308)
	let turn = getTurnFuncs(game)
	let ruArmy = findPiece(AP, "RU 6 Army")
	let tuDiv = findPiece(CP, "TU DIV #8")
	let kronstadt = findSpace("Kronstadt")
	let hermannstadt = findSpace("Hermannstadt")

	game.pieces[ruArmy] = kronstadt
	game.pieces[tuDiv] = hermannstadt
	game.mo_ap = "NONE"
	game.mo_cp = "NONE"
	game.mo_ap_fulfilled = true
	game.mo_cp_fulfilled = true

	expect(Engine.map.get_supply_status(game, kronstadt, AP, ruArmy)).toBe("OOS")

	turn.start_attrition_phase()

	expect(Engine.game_utils.is_permanently_eliminated(game, ruArmy)).toBe(true)
	expect(Engine.map.get_pieces_in_space(game, kronstadt)).not.toContain(ruArmy)
	expect(
		Engine.map.get_pieces_in_space(game, kronstadt).some((p) => Engine.data.pieces[p].faction === AP)
	).toBe(false)
})

test("部落不会被 check_supply 标记为 OOS", () => {
	let game = setupGame(2026042309)
	let tribe = findPiece(CP, "Bawi")
	let kronstadt = findSpace("Kronstadt")

	game.pieces[tribe] = kronstadt

	expect(Engine.map.get_supply_status(game, kronstadt, CP, tribe)).toBe("FULL")

	Engine.map.check_supply(game)

	expect(game.oos || []).not.toContain(tribe)
	expect(game.disrupted_supply || []).not.toContain(tribe)
})
