"use strict"

const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP, ELIMINATED } = Engine.constants

function placeUnitAtControlledSpace(game, piece, space, faction) {
	Engine.set_control(game, space, faction)
	game.pieces[piece] = space
}

function rebuildSpaceNames(game, piece, faction = AP) {
	return Engine.replacement.get_valid_rebuild_spaces(game, piece, faction).map((s) => Engine.data.spaces[s].name)
}

test("AP-controlled ports provide full operational supply without becoming unrestricted rebuild ports", () => {
	let game = setupGame(2026050701, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let brDiv = findPiece(AP, "BR DIV #1")
	for (let name of ["Smyrna", "Aqaba", "Jiddah"]) {
		let space = findSpace(name)
		placeUnitAtControlledSpace(game, brDiv, space, AP)

		expect(Engine.map.get_supply_status(game, space, AP, brDiv)).toBe("FULL")
		Engine.map.check_supply(game)
		expect(game.limited_supply || []).not.toContain(brDiv)
		expect(game.oos || []).not.toContain(brDiv)
	}

	let brCorps = findPiece(AP, "BR IX Corps")
	game.pieces[brCorps] = ELIMINATED
	let rebuilds = rebuildSpaceNames(game, brCorps)
	expect(rebuilds).toContain("Smyrna")
	expect(rebuilds).not.toContain("Aqaba")
	expect(rebuilds).not.toContain("Jiddah")
})

test("British-family AP units use captured AP ports for full supply", () => {
	let game = setupGame(2026050702, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let smyrna = findSpace("Smyrna")
	Engine.set_control(game, smyrna, AP)

	for (let unit of ["BR DIV #1", "IN DIV #1", "ANZ Elite DIV", "FR DIV #1", "IT DIV"]) {
		let piece = findPiece(AP, unit)
		game.pieces[piece] = smyrna
		expect(Engine.map.get_supply_status(game, smyrna, AP, piece)).toBe("FULL")
	}
})

test("special Russian Allied units can use British naval supply, but ordinary Russian units cannot", () => {
	let game = setupGame(2026050703, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let smyrna = findSpace("Smyrna")
	let lemnos = findSpace("Lemnos")
	Engine.set_control(game, smyrna, AP)
	Engine.set_control(game, lemnos, AP)

	let special = findPiece(AP, "RU 2/4 Special")
	let yugo = findPiece(AP, "RU/SB Yugo Infantry")
	let regular = findPiece(AP, "RU DIV #1")

	game.pieces[special] = smyrna
	game.pieces[yugo] = lemnos
	game.pieces[regular] = smyrna

	expect(Engine.map.get_supply_status(game, smyrna, AP, special)).toBe("FULL")
	expect(Engine.map.get_supply_status(game, lemnos, AP, yugo)).toBe("FULL")
	expect(Engine.map.get_supply_status(game, smyrna, AP, regular)).toBe("LIMITED")
})

test("CP units tracing solely to non-home full sources are limited supply", () => {
	let game = setupGame(2026050704, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.bulgaria = true

	let geDiv = findPiece(CP, "GE DIV #1")
	let tuDiv = findPiece(CP, "TU DIV #1")
	let buDiv = findPiece(CP, "BU DIV #1")
	let constantinople = findSpace("CONSTANTINOPLE")
	let galicia = findSpace("Galicia")
	let sofia = findSpace("SOFIA")

	placeUnitAtControlledSpace(game, geDiv, constantinople, CP)
	expect(Engine.map.get_supply_status(game, constantinople, CP, geDiv)).toBe("LIMITED")

	game.pieces[geDiv] = galicia
	expect(Engine.map.get_supply_status(game, galicia, CP, geDiv)).toBe("FULL")

	placeUnitAtControlledSpace(game, tuDiv, galicia, CP)
	expect(Engine.map.get_supply_status(game, galicia, CP, tuDiv)).toBe("LIMITED")

	game.pieces[tuDiv] = constantinople
	expect(Engine.map.get_supply_status(game, constantinople, CP, tuDiv)).toBe("FULL")

	placeUnitAtControlledSpace(game, buDiv, constantinople, CP)
	expect(Engine.map.get_supply_status(game, constantinople, CP, buDiv)).toBe("LIMITED")

	placeUnitAtControlledSpace(game, buDiv, sofia, CP)
	expect(Engine.map.get_supply_status(game, sofia, CP, buDiv)).toBe("FULL")
})

test("Afghan Alliance supplies non-Afghan CP units but still blocks their SR and RPs", () => {
	let game = setupGame(2026050705, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.afghan_alliance = true
	game.events.bulgaria = true
	game.rp_cp = { a: 10, ge: 10, tu: 10 }

	let afghanistan = findSpace("Afghanistan")
	let tuDiv = findPiece(CP, "TU DIV #1")
	placeUnitAtControlledSpace(game, tuDiv, afghanistan, CP)

	expect(Engine.map.get_supply_status(game, afghanistan, CP, tuDiv)).toBe("FULL")
	expect(Engine.map.can_sr_piece(game, tuDiv, CP)).toBe(false)
	expect(Engine.replacement.can_afford_replacement(game, tuDiv, 1)).toBe(false)
})

test("ANA uses Hejaz supply and rebuilds only at AP-controlled Syria/Palestine ports", () => {
	let game = setupGame(2026050706, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let ana = findPiece(AP, "BR ANA Arab")
	let mecca = findSpace("Mecca")
	game.pieces[ana] = mecca
	expect(Engine.map.get_supply_status(game, mecca, AP, ana)).toBe("FULL")

	for (let name of ["Aqaba", "Jiddah", "Haifa", "Smyrna", "Fao", "Kuwait"]) {
		Engine.set_control(game, findSpace(name), AP)
	}
	game.pieces[ana] = ELIMINATED

	let rebuilds = rebuildSpaceNames(game, ana)
	expect(rebuilds).toEqual(expect.arrayContaining(["Aqaba", "Jiddah", "Haifa"]))
	expect(rebuilds).not.toContain("Smyrna")
	expect(rebuilds).not.toContain("Fao")
	expect(rebuilds).not.toContain("Kuwait")
})
