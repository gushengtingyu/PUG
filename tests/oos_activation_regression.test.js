const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

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
