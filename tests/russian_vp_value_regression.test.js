"use strict"

const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findApPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

function withRuSupplyTrace(callback) {
	const getRuSupplySources = Engine.map.get_ru_supply_sources
	const canTraceSupplyToSource = Engine.map.can_trace_supply_to_source
	Engine.map.get_ru_supply_sources = () => [findSpace("TIFLIS")]
	Engine.map.can_trace_supply_to_source = () => true
	try {
		callback()
	} finally {
		Engine.map.get_ru_supply_sources = getRuSupplySources
		Engine.map.can_trace_supply_to_source = canTraceSupplyToSource
	}
}

test("Russian capture of a 2 VP space adds 2 Russian VP", () => {
	let game = setupGame(2026052401, "Historical")
	clearBoard(game)

	let baghdad = findSpace("Baghdad")
	let russianUnit = findApPiece("RU V Caucasian")

	game.pieces[russianUnit] = baghdad
	game.russian_vp = 0
	game.ru_control_markers = []

	withRuSupplyTrace(() => {
		Engine.set_control(game, baghdad, AP)
	})

	expect(game.russian_vp).toBe(2)
	expect(game.ru_control_markers).toContain(baghdad)
})

test("CP recapture of a 2 VP Russian VP space removes 2 Russian VP", () => {
	let game = setupGame(2026052402, "Historical")
	clearBoard(game)

	let baghdad = findSpace("Baghdad")

	game.control[baghdad] = AP
	game.russian_vp = 2
	game.ru_control_markers = [baghdad]

	Engine.set_control(game, baghdad, CP)

	expect(game.russian_vp).toBe(0)
	expect(game.ru_control_markers).not.toContain(baghdad)
})
