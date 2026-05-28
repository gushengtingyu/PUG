"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP, ELIMINATED } = Engine.constants
const AP_ROLE = rules.roles[0]

function setupReplacementState(seed = 2026052104) {
	let game = setupGame(seed, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.bulgaria = true
	game.events.serbian_collapse = true
	game.state = "rp_phase"
	game.active = AP
	game.rp_ap = { a: 2, br: 0, ru: 0, in: 0 }
	game.reduced = []

	for (let name of ["Lemnos", "Salonika"]) {
		Engine.set_control(game, findSpace(name), AP)
	}
	for (let name of ["BELGRADE", "Nis"]) {
		Engine.set_control(game, findSpace(name), CP)
	}

	return game
}

function rebuildSpaceNames(game, piece) {
	return Engine.map.get_valid_rebuild_spaces(game, piece, AP).map((s) => Engine.data.spaces[s].name)
}

function startSerbsReturnAtFirstDivision(game) {
	Engine.events.get_event_by_id(24).handler(game, {})
	let apCorps = Engine.game_utils.get_lcu_reserve_box(AP)
	for (let i = 0; i < 3; i++) {
		game = rules.action(game, AP_ROLE, "space", apCorps)
	}
	return game
}

test("collapsed Serbian SCUs can be rebuilt only into reserve before The Serbs Return", () => {
	let game = setupReplacementState()
	let sbDiv = findPiece(AP, "SB DIV #1")
	let sbArmy = findPiece(AP, "SB 1 Army")
	let apReserve = Engine.game_utils.get_scu_reserve_box(AP)

	game.pieces[sbDiv] = ELIMINATED
	game.pieces[sbArmy] = ELIMINATED

	expect(rebuildSpaceNames(game, sbDiv)).toEqual([])
	expect(rebuildSpaceNames(game, sbArmy)).toEqual([])
	expect(Engine.map.can_afford_replacement(game, sbDiv, 0.5)).toBe(true)
	expect(Engine.map.can_afford_replacement(game, sbArmy, 1)).toBe(false)

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.piece || []).toContain(sbDiv)
	expect(view.actions.piece || []).not.toContain(sbArmy)

	game = rules.action(game, AP_ROLE, "piece", sbDiv)
	view = rules.view(game, AP_ROLE)

	expect(view.actions.space || []).toEqual([apReserve])

	game = rules.action(game, AP_ROLE, "space", apReserve)

	expect(game.pieces[sbDiv]).toBe(apReserve)
	expect(game.reduced).toContain(sbDiv)
	expect(game.rp_ap.a).toBe(1.5)
})

test("collapsed Serbian reduced SCUs on the map can still receive replacements before The Serbs Return", () => {
	let game = setupReplacementState()
	let sbDiv = findPiece(AP, "SB DIV #1")
	let lemnos = findSpace("Lemnos")

	game.pieces[sbDiv] = lemnos
	game.reduced = [sbDiv]
	game.rp_ap = { a: 0.5, br: 0, ru: 0, in: 0 }

	expect(Engine.map.can_afford_replacement(game, sbDiv, 0.5)).toBe(true)
	expect(rules.view(game, AP_ROLE).actions.piece || []).toContain(sbDiv)

	game = rules.action(game, AP_ROLE, "piece", sbDiv)

	expect(game.pieces[sbDiv]).toBe(lemnos)
	expect(game.reduced).not.toContain(sbDiv)
	expect(game.rp_ap.a).toBe(0)
})

test("The Serbs Return reopens SB SCU map rebuilds but not eliminated SB LCUs", () => {
	let game = setupReplacementState()
	let sbDiv = findPiece(AP, "SB DIV #1")
	let sbArmy = findPiece(AP, "SB 1 Army")
	let apReserve = Engine.game_utils.get_scu_reserve_box(AP)
	let belgrade = findSpace("BELGRADE")
	let nis = findSpace("Nis")

	game.events.the_serbs_return = game.turn
	game.pieces[sbDiv] = ELIMINATED
	game.pieces[sbArmy] = ELIMINATED

	expect(rebuildSpaceNames(game, sbDiv)).toEqual(expect.arrayContaining(["Salonika", "Lemnos"]))
	expect(rebuildSpaceNames(game, sbDiv)).not.toEqual(expect.arrayContaining(["BELGRADE", "Nis"]))
	expect(rebuildSpaceNames(game, sbArmy)).toEqual([])
	expect(Engine.map.can_afford_replacement(game, sbArmy, 1)).toBe(false)

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.piece || []).toContain(sbDiv)
	expect(view.actions.piece || []).not.toContain(sbArmy)

	game = rules.action(game, AP_ROLE, "piece", sbDiv)
	expect(rules.view(game, AP_ROLE).actions.space || []).toEqual(
		expect.arrayContaining([findSpace("Salonika"), findSpace("Lemnos"), apReserve])
	)

	game.state = "rp_phase"
	delete game.rebuild_piece
	Engine.set_control(game, belgrade, AP)
	Engine.set_control(game, nis, AP)

	expect(rebuildSpaceNames(game, sbDiv)).toEqual(expect.arrayContaining(["BELGRADE", "Nis", "Salonika", "Lemnos"]))
	expect(rebuildSpaceNames(game, sbArmy)).toEqual([])
})

test("The Serbs Return can place an SB SCU that was already in reserve", () => {
	let game = setupReplacementState()
	let sbDiv = findPiece(AP, "SB DIV #1")
	let apReserve = Engine.game_utils.get_scu_reserve_box(AP)
	let lemnos = findSpace("Lemnos")

	game.pieces[sbDiv] = apReserve
	game.reduced = [sbDiv]

	game = startSerbsReturnAtFirstDivision(game)

	expect(game.event_ctx.data.reinf_to_place[0]).toBe("SB DIV #1")
	expect(rules.view(game, AP_ROLE).actions.space || []).toContain(lemnos)

	game = rules.action(game, AP_ROLE, "space", lemnos)

	expect(game.pieces[sbDiv]).toBe(lemnos)
	expect(game.reduced).not.toContain(sbDiv)
})

test("The Serbs Return can place an eliminated SB SCU", () => {
	let game = setupReplacementState()
	let sbDiv = findPiece(AP, "SB DIV #1")
	let salonika = findSpace("Salonika")

	game.pieces[sbDiv] = Engine.game_utils.get_eliminated_box(AP)

	game = startSerbsReturnAtFirstDivision(game)

	expect(game.event_ctx.data.reinf_to_place[0]).toBe("SB DIV #1")
	expect(rules.view(game, AP_ROLE).actions.space || []).toContain(salonika)

	game = rules.action(game, AP_ROLE, "space", salonika)

	expect(game.pieces[sbDiv]).toBe(salonika)
})
