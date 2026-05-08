const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function eliminateToBox(game, p) {
	game.pieces[p] = Engine.game_utils.get_eliminated_box(dataFaction(p))
}

function dataFaction(p) {
	return Engine.data.pieces[p].faction
}

test("SR eligibility rejects eliminated units while preserving reserve SCU SR", () => {
	let game = setupGame(2026050702, "Historical")
	let brDiv = findPiece(AP, "BR DIV #4")

	eliminateToBox(game, brDiv)

	expect(Engine.game_utils.is_eliminated(game, brDiv)).toBe(true)
	expect(Engine.map.can_sr_piece(game, brDiv, AP)).toBe(false)
	expect(Engine.map.get_sr_destinations(game, brDiv, AP)).toEqual([])

	game.pieces[brDiv] = Engine.game_utils.get_scu_reserve_box(AP)

	expect(Engine.game_utils.is_in_reserve(game, brDiv)).toBe(true)
	expect(Engine.map.can_sr_piece(game, brDiv, AP)).toBe(true)
})

test("Balkan collapse SR cannot select neutral entry-display units", () => {
	let game = setupGame(2026050703, "Historical")
	let geAlpen = findPiece(CP, "GE Alpenkorps")

	game.active = CP
	game.state = "event_serbian_collapse_sr"
	game.event_ctx = {
		move_limit: 2,
		data: { moved: [] }
	}

	expect(Engine.game_utils.get_piece_effective_faction(game, geAlpen)).toBe("neutral")
	expect(Engine.collapse.can_collapse_sr_piece(game, geAlpen)).toBe(false)

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.piece || []).not.toContain(geAlpen)

	game = rules.action(game, CP_ROLE, "piece", geAlpen)
	expect(game.sr_piece).toBeUndefined()
})

test("Project Alexandria cannot SR an eliminated AP SCU", () => {
	let game = setupGame(2026050704, "Historical")
	let brDiv = findPiece(AP, "BR DIV #4")
	let toHaifa = findSpace("To Haifa")

	eliminateToBox(game, brDiv)
	game.active = AP
	game.state = "event_project_alexandria_sr"
	game.event_ctx = {
		key: "project_alexandria",
		data: { event_port: toHaifa }
	}

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.piece || []).not.toContain(brDiv)

	game = rules.action(game, AP_ROLE, "piece", brDiv)
	expect(Engine.game_utils.is_eliminated(game, brDiv)).toBe(true)
	expect(game.event_ctx.data.count || 0).toBe(0)
})

test("Gallipoli invasion flip cannot use an eliminated SCU as the reserve-enabling SR", () => {
	let game = setupGame(2026050705, "Historical")
	let lemnos = findSpace("Lemnos")
	let brViii = findPiece(AP, "BR VIII Corps")
	let brDiv = findPiece(AP, "BR DIV #4")

	game.pieces[brViii] = lemnos
	rules.set_add(game.reduced, brViii)
	eliminateToBox(game, brDiv)
	game.active = AP
	game.state = "event_gallipoli_invasion_flip"
	game.event_ctx = {
		key: "gallipoli_invasion",
		data: { invasion_island_base: lemnos }
	}

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.piece || []).not.toContain(brDiv)

	game = rules.action(game, AP_ROLE, "piece", brDiv)
	expect(Engine.game_utils.is_eliminated(game, brDiv)).toBe(true)
	expect(Engine.game_utils.is_piece_reduced(game, brViii)).toBe(true)
})

test("Salonika invasion cannot SR an eliminated AP SCU", () => {
	let game = setupGame(2026050706, "Historical")
	let lemnos = findSpace("Lemnos")
	let brDiv = findPiece(AP, "BR DIV #4")

	eliminateToBox(game, brDiv)
	game.active = AP
	game.state = "event_salonika_invasion_sr"
	game.event_ctx = {
		key: "salonika_invasion",
		data: {
			invasion_island_base: lemnos,
			allow_sr_to_island: 3
		}
	}

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.piece || []).not.toContain(brDiv)

	game = rules.action(game, AP_ROLE, "piece", brDiv)
	expect(Engine.game_utils.is_eliminated(game, brDiv)).toBe(true)
	expect(game.event_ctx.data.allow_sr_to_island).toBe(3)
})

test("Salonika invasion can SR a legal AP SCU from reserve to the island base", () => {
	let game = setupGame(2026050801, "Historical")
	let lemnos = findSpace("Lemnos")
	let brDiv = findPiece(AP, "BR DIV #4")

	game.pieces[brDiv] = Engine.game_utils.get_scu_reserve_box(AP)
	game.active = AP
	game.state = "event_salonika_invasion_sr"
	game.event_ctx = {
		key: "salonika_invasion",
		data: {
			invasion_island_base: lemnos,
			allow_sr_to_island: 3
		}
	}

	expect(Engine.game_utils.is_in_reserve(game, brDiv)).toBe(true)
	expect(Engine.map.can_sr_to_space(game, brDiv, lemnos, AP)).toBe(true)

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.piece || []).toContain(brDiv)

	game = rules.action(game, AP_ROLE, "piece", brDiv)
	expect(game.pieces[brDiv]).toBe(lemnos)
	expect(game.sr_moved || []).toContain(brDiv)
	expect(game.event_ctx.data.allow_sr_to_island).toBe(2)
})
