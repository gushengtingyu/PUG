"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP, ELIMINATED } = Engine.constants
const AP_ROLE = rules.roles[0]

function legalSpaceNames(game) {
	return (rules.view(game, AP_ROLE).actions.space || []).map((s) => Engine.data.spaces[s].name)
}

function rebuildSpaceNames(game, piece, faction = AP) {
	return Engine.map.get_valid_rebuild_spaces(game, piece, faction).map((s) => Engine.data.spaces[s].name)
}

function setBeachheads(game, names) {
	game.beachheads = []
	for (let name of names) Engine.utils.set_add(game.beachheads, findSpace(name))
}

test("British Empire reinforcements treat established beachheads as AP-controlled ports", () => {
	let noMarker = setupGame(2026050701, "Historical", { no_supply_warnings: true })
	Engine.events.get_event_by_id(2).handler(noMarker, null)
	expect(legalSpaceNames(noMarker)).not.toContain("Besika Bay")

	let game = setupGame(2026050702, "Historical", { no_supply_warnings: true })
	setBeachheads(game, ["Besika Bay"])
	Engine.events.get_event_by_id(2).handler(game, null)
	expect(legalSpaceNames(game)).toContain("Besika Bay")
})

test("German Subs blocks E. Mediterranean and Aegean beachhead ports for Allied reinforcements", () => {
	let game = setupGame(2026050703, "Historical", { no_supply_warnings: true })
	setBeachheads(game, ["Besika Bay"])
	game.events.german_subs = true
	game.events.german_subs_turn = game.turn

	Engine.events.get_event_by_id(2).handler(game, null)

	expect(legalSpaceNames(game)).not.toContain("Besika Bay")
})

test("British Empire LCU rebuilds can use established beachhead ports in the allowed seas", () => {
	let game = setupGame(2026050704, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.egyptian_coup = true
	game.control[findSpace("Cyprus")] = AP
	setBeachheads(game, ["Besika Bay", "To Haifa", "to Fao"])

	let brCorps = findPiece(AP, "BR IX Corps")
	game.pieces[brCorps] = ELIMINATED
	let rebuilds = rebuildSpaceNames(game, brCorps)

	expect(rebuilds).toEqual(expect.arrayContaining(["Besika Bay", "To Haifa", "to Fao"]))
	expect(rebuilds).not.toContain("Suvla Bay")
})

test("British Empire SCUs and FR/IT units rebuild through established beachhead ports where their port rule allows it", () => {
	let game = setupGame(2026050705, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	setBeachheads(game, ["Besika Bay", "to Fao"])

	let brDiv = findPiece(AP, "BR DIV #1")
	let frDiv = findPiece(AP, "FR DIV #1")
	game.pieces[brDiv] = ELIMINATED
	game.pieces[frDiv] = ELIMINATED

	expect(rebuildSpaceNames(game, brDiv)).toEqual(expect.arrayContaining(["Besika Bay", "to Fao"]))
	expect(rebuildSpaceNames(game, frDiv)).toContain("Besika Bay")
	expect(rebuildSpaceNames(game, frDiv)).not.toContain("to Fao")
})

test("reinforcement overflow adjacent spaces exclude enemy-occupied spaces", () => {
	let game = setupGame(2026050706, "Historical", { no_supply_warnings: true })
	let tiflis = findSpace("TIFLIS")
	let neighbors = Engine.map.get_connected_spaces(game, tiflis)
	let cpUnits = ["TU DIV #1", "TU DIV #2", "TU DIV #3"]

	for (let i = 0; i < neighbors.length; i++) {
		let p = findPiece(CP, cpUnits[i])
		game.pieces[p] = neighbors[i]
		Engine.set_control(game, neighbors[i], CP)
	}

	Engine.events.get_event_by_id(10).handler(game, null)
	let spaces = legalSpaceNames(game)

	for (let s of neighbors) {
		expect(spaces).not.toContain(Engine.data.spaces[s].name)
	}
})

test("reinforcement overflow adjacent spaces exclude unestablished potential beachheads", () => {
	let game = setupGame(2026050801, "Historical", { no_supply_warnings: true })
	let haifa = findSpace("Haifa")
	let toHaifa = findSpace("To Haifa")
	let fillerUnits = ["BR DIV #1", "BR DIV #2", "BR DIV #3"]

	game.control[haifa] = AP
	for (let name of fillerUnits) {
		let p = findPiece(AP, name)
		game.pieces[p] = haifa
	}

	Engine.events.get_event_by_id(2).handler(game, null)

	expect(game.beachheads || []).not.toContain(toHaifa)
	expect(legalSpaceNames(game)).not.toContain("To Haifa")
})
