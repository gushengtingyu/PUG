"use strict"

const fs = require("node:fs")
const path = require("node:path")

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, findCpPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const CP_ROLE = rules.roles[1]

test("CP advance into AP-controlled Persian space changes control to CP", () => {
	let game = setupGame(2026050901, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let khanikan = findSpace("Khanikan")
	let karind = findSpace("Karind")
	let kermanshah = findSpace("Kermanshah")
	let turkishDivision = findCpPiece("TU DIV #1")
	let persianCordon = findApPiece("BR Persian Cordon #1")

	game.pieces[turkishDivision] = khanikan
	game.pieces[persianCordon] = kermanshah
	game.control[karind] = AP
	game.active = CP
	game.state = "advance"
	game.attack = {
		space: karind,
		pieces: [turkishDivision],
		attacker: CP,
		defender: AP
	}
	game.advance_space = karind
	game.advance_pieces = [turkishDivision]
	game.advance_count = 0
	game.advance_limit = 3
	game.advance_trench_processed = false
	game.battle_result = {
		retreat_needed: true,
		retreating_faction: AP,
		retreating_units: [persianCordon],
		no_advance: false
	}
	game.retreated = [persianCordon]

	game = rules.action(game, CP_ROLE, "piece", turkishDivision)

	expect(game.pieces[turkishDivision]).toBe(karind)
	expect(Engine.map.get_space_controller(game, karind)).toBe(CP)
	expect(rules.view(game, CP_ROLE).control[karind]).toBe(CP)
})

test("play.js renders AP, CP, and RU control markers through one exclusive slot", () => {
	let playSource = fs.readFileSync(path.join(__dirname, "..", "play.js"), "utf8")

	expect(playSource).toContain('const CONTROL_MARKER_TYPES = new Set(["ap_control", "cp_control", "ru_control"])')
	expect(playSource).toContain("function sync_control_marker(s, type, stack_parts)")
	expect(playSource).toContain("destroy_markers(list, (m) => CONTROL_MARKER_TYPES.has(m.type) && m.type !== type)")
	expect(playSource).toContain("function get_control_marker_type(space, state, s)")
	expect(playSource).toContain("if (markerControl === AP && has_id(state.ru_control_markers, s))")
	expect(playSource).toContain('return "ru_control"')
	expect(playSource).not.toContain('"russian_control"')
})

test("play.js does not render partial control as a full AP/CP control marker", () => {
	let playSource = fs.readFileSync(path.join(__dirname, "..", "play.js"), "utf8")

	let start = playSource.indexOf("function get_control_marker_type(space, state, s)")
	let end = playSource.indexOf("function has_space_special_marker", start)
	let fn = playSource.slice(start, end)

	expect(fn).not.toContain("partial_ap_control_markers")
	expect(fn).not.toContain("partial_cp_control_markers")
})

test("Arab Revolt in Mecca creates partial control without an AP control marker in the view", () => {
	let game = setupGame(2026051701, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let mecca = findSpace("Mecca")
	let arab = findApPiece("Arab Revolt #1")

	game.pieces[arab] = mecca
	game.control[mecca] = null

	Engine.sync_region_control(game, mecca)
	Engine.sync_neutral_vp_state(game, mecca)
	Engine.sync_jihad_city_state(game, mecca)

	let view = rules.view(game, CP_ROLE)

	expect(Engine.map.get_space_controller(game, mecca)).toBe(CP)
	expect(game.region_disruption[mecca]).toBe(AP)
	expect(view.control[mecca]).toBeUndefined()
	expect(view.partial_ap_control_markers || []).not.toContain(mecca)
})
