"use strict"

const assert = require("node:assert/strict")
const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP, ELIMINATED } = Engine.constants

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`Unknown space: ${name}`)
	return space
}

function findPiece(name) {
	let piece = Engine.game_utils.find_piece(AP, name)
	if (piece < 0) throw new Error(`Unknown AP piece: ${name}`)
	return piece
}

function clearBoard(game) {
	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	game.reduced = []
}

function rebuildNames(game, piece) {
	return Engine.map.get_valid_rebuild_spaces(game, piece, AP).map((s) => Engine.data.spaces[s].name)
}

function assertSameMembers(actual, expected, label) {
	assert.deepEqual([...actual].sort(), [...expected].sort(), label)
}

function setupCollapsedSerbia() {
	let game = rules.setup(2026052105, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.bulgaria = true
	game.events.serbian_collapse = game.turn
	game.state = "rp_phase"
	game.active = AP
	game.rp_ap = { a: 4, br: 0, ru: 0, in: 0 }

	Engine.set_control(game, findSpace("Lemnos"), AP)
	Engine.set_control(game, findSpace("Salonika"), AP)
	Engine.set_control(game, findSpace("BELGRADE"), CP)
	Engine.set_control(game, findSpace("Nis"), CP)

	return game
}

function run() {
	let sbDiv = findPiece("SB DIV #1")
	let sbArmy = findPiece("SB 1 Army")

	let beforeReturn = setupCollapsedSerbia()
	beforeReturn.pieces[sbDiv] = ELIMINATED
	beforeReturn.pieces[sbArmy] = ELIMINATED

	assertSameMembers(rebuildNames(beforeReturn, sbDiv), [], "collapsed SB SCU has no map rebuilds before return")
	assertSameMembers(rebuildNames(beforeReturn, sbArmy), [], "collapsed SB LCU has no map rebuilds before return")
	assert.equal(Engine.map.can_afford_replacement(beforeReturn, sbDiv, 0.5), false)
	assert.equal(Engine.map.can_afford_replacement(beforeReturn, sbArmy, 1), false)

	let view = rules.view(beforeReturn, rules.roles[0])
	assert.ok(!(view.actions.piece || []).includes(sbDiv), "collapsed SB SCU cannot be selected before return")
	assert.ok(!(view.actions.piece || []).includes(sbArmy), "collapsed SB LCU cannot be selected for rebuild")

	let afterReturn = setupCollapsedSerbia()
	afterReturn.events.the_serbs_return = afterReturn.turn
	afterReturn.pieces[sbDiv] = ELIMINATED
	afterReturn.pieces[sbArmy] = ELIMINATED

	assertSameMembers(rebuildNames(afterReturn, sbDiv), ["Salonika", "Lemnos"], "SB SCU returns through Aegean ports")
	assertSameMembers(rebuildNames(afterReturn, sbArmy), ["Salonika", "Lemnos"], "SB LCU returns through Aegean ports")

	Engine.set_control(afterReturn, findSpace("BELGRADE"), AP)
	Engine.set_control(afterReturn, findSpace("Nis"), AP)
	assertSameMembers(
		rebuildNames(afterReturn, sbDiv),
		["BELGRADE", "Nis", "Salonika", "Lemnos"],
		"recaptured Belgrade reopens Serbian cities for SB SCUs"
	)
	assertSameMembers(
		rebuildNames(afterReturn, sbArmy),
		["BELGRADE", "Nis", "Salonika", "Lemnos"],
		"recaptured Belgrade reopens Serbian cities for SB LCUs"
	)

	let reducedOnMap = setupCollapsedSerbia()
	reducedOnMap.pieces[sbDiv] = findSpace("Lemnos")
	reducedOnMap.reduced = [sbDiv]
	assert.equal(Engine.map.can_afford_replacement(reducedOnMap, sbDiv, 0.5), false)
	assert.ok(!(rules.view(reducedOnMap, rules.roles[0]).actions.piece || []).includes(sbDiv))

	console.log("Serbian replacement simulation passed")
}

run()
