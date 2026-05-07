"use strict"

const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP, ELIMINATED } = Engine.constants

function placeUnitAtControlledSpace(game, piece, space, faction) {
	Engine.set_control(game, space, faction)
	game.pieces[piece] = space
}

function rebuildSpaceNames(game, piece, faction = AP) {
	return Engine.map.get_valid_rebuild_spaces(game, piece, faction).map((s) => Engine.data.spaces[s].name)
}

test("AP-controlled ports provide full operational supply without becoming unrestricted LCU rebuild ports", () => {
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

test("Aegean and East Med rebuild ports exclude Gallipoli spaces and non-port entries", () => {
	let game = setupGame(2026050707, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	for (let name of ["Bulair", "Gaba Tepe", "Cape Helles", "Besika Bay", "Gaza", "Mersin"]) {
		Engine.set_control(game, findSpace(name), AP)
	}

	for (let unit of ["BR IX Corps", "FR DIV #1", "IT DIV"]) {
		let piece = findPiece(AP, unit)
		game.pieces[piece] = ELIMINATED
		let rebuilds = rebuildSpaceNames(game, piece)
		expect(rebuilds).not.toEqual(expect.arrayContaining(["Bulair", "Gaba Tepe", "Cape Helles", "Besika Bay"]))
		expect(rebuilds).not.toContain("Gaza")
		expect(rebuilds).not.toContain("Mersin")
	}
})

test("BR Persian Cordon rebuilds only in Persian regions, India, or Baluchistan", () => {
	let game = setupGame(2026050708, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let cordon = findPiece(AP, "BR Persian Cordon #1")
	game.pieces[cordon] = ELIMINATED
	let rebuilds = rebuildSpaceNames(game, cordon)

	expect(rebuilds).toEqual(expect.arrayContaining(["Meshed", "Shiraz", "Bushire", "INDIA", "Baluchistan"]))
	expect(rebuilds).not.toContain("TEHERAN")
	expect(rebuilds).not.toContain("Hamadan")
	expect(rebuilds).not.toContain("Enzeli")
})

test("Greek units outside Greece can use AP-controlled Athens as a supply source", () => {
	let game = setupGame(2026050709, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.greece = AP
	game.events.bulgaria = true

	let greek = findPiece(AP, "GR DIV #1")
	let monastir = findSpace("Monastir")
	let salonika = findSpace("Salonika")
	for (let name of ["Monastir", "Prespa", "Trikkala", "Lamia", "ATHENS"]) {
		Engine.set_control(game, findSpace(name), AP)
	}
	Engine.set_control(game, salonika, CP)
	game.pieces[greek] = monastir

	expect(Engine.map.get_supply_status(game, monastir, AP, greek)).toBe("FULL")
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

test("ordinary Russian sea ports are not full supply unless backed by a true Russian source on that sea", () => {
	let game = setupGame(2026050710, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let ruDiv = findPiece(AP, "RU DIV #1")
	let baku = findSpace("Baku")
	for (let name of ["Odessa", "TIFLIS", "Central Asia", "Petrovsk"]) {
		Engine.set_control(game, findSpace(name), CP)
	}
	Engine.set_control(game, baku, AP)
	game.pieces[ruDiv] = baku

	expect(Engine.map.get_supply_status(game, baku, AP, ruDiv)).not.toBe("FULL")

	Engine.set_control(game, findSpace("Central Asia"), AP)
	expect(Engine.map.get_supply_status(game, baku, AP, ruDiv)).toBe("FULL")
})

test("BR LCU Persian Gulf rebuild uses the same Basra-Fao gate as the port helper", () => {
	let game = setupGame(2026050711, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let brCorps = findPiece(AP, "BR IX Corps")
	let basra = findSpace("Basra")
	let fao = findSpace("Fao")
	game.pieces[brCorps] = ELIMINATED
	Engine.set_control(game, basra, AP)
	Engine.set_control(game, fao, CP)

	expect(rebuildSpaceNames(game, brCorps)).not.toContain("Basra")

	Engine.set_control(game, fao, AP)
	expect(rebuildSpaceNames(game, brCorps)).toContain("Basra")
})

test("BR, IN, and ANZ SCUs can rebuild to AP ports except Aqaba, Jiddah, Black Sea, and Caspian ports", () => {
	let game = setupGame(2026050712, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	for (let name of ["Smyrna", "Aqaba", "Jiddah", "Baku", "Poti"]) {
		Engine.set_control(game, findSpace(name), AP)
	}

	for (let unit of ["BR DIV #1", "IN DIV #1", "ANZ Elite DIV"]) {
		let piece = findPiece(AP, unit)
		game.pieces[piece] = ELIMINATED
		let rebuilds = rebuildSpaceNames(game, piece)
		expect(rebuilds).toContain("Smyrna")
		expect(rebuilds).not.toContain("Aqaba")
		expect(rebuilds).not.toContain("Jiddah")
		expect(rebuilds).not.toContain("Baku")
		expect(rebuilds).not.toContain("Poti")
	}
})

test("special Russian Allied SCUs can rebuild at Lemnos or AP-controlled Greek ports", () => {
	let game = setupGame(2026050713, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.greece = AP

	for (let name of ["Lemnos", "Salonika", "ATHENS", "Smyrna"]) {
		Engine.set_control(game, findSpace(name), AP)
	}

	for (let unit of ["RU 2/4 Special", "RU/SB Yugo Infantry"]) {
		let piece = findPiece(AP, unit)
		game.pieces[piece] = ELIMINATED
		let rebuilds = rebuildSpaceNames(game, piece)
		expect(rebuilds).toEqual(expect.arrayContaining(["Lemnos", "Salonika", "ATHENS"]))
		expect(rebuilds).not.toContain("Smyrna")
	}
})

test("CP replacement supply uses named Ottoman sources, not generic CP ports or limited sources", () => {
	let game = setupGame(2026050714, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.bulgaria = true
	game.rp_cp = { a: 10, ge: 10, tu: 10 }

	let geDiv = findPiece(CP, "GE DIV #1")
	let tuDiv = findPiece(CP, "TU DIV #1")
	let haifa = findSpace("Haifa")
	let erzincan = findSpace("Erzincan")
	let galicia = findSpace("Galicia")

	placeUnitAtControlledSpace(game, geDiv, haifa, CP)
	expect(Engine.map.get_supply_status(game, haifa, CP, geDiv)).toBe("LIMITED")
	expect(Engine.map.can_afford_replacement(game, geDiv, 0.5)).toBe(false)

	placeUnitAtControlledSpace(game, tuDiv, galicia, CP)
	expect(Engine.map.can_afford_replacement(game, tuDiv, 0.5)).toBe(false)

	placeUnitAtControlledSpace(game, geDiv, erzincan, CP)
	expect(Engine.map.can_afford_replacement(game, geDiv, 0.5)).toBe(false)
})

test("Serbian units use AP supply sources after collapse without widening rebuild locations", () => {
	let game = setupGame(2026050715, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events.bulgaria = true
	game.events.serbian_collapse = true

	let sbDiv = findPiece(AP, "SB DIV #1")
	let smyrna = findSpace("Smyrna")
	Engine.set_control(game, smyrna, AP)
	game.pieces[sbDiv] = smyrna
	expect(Engine.map.get_supply_status(game, smyrna, AP, sbDiv)).toBe("FULL")

	game.pieces[sbDiv] = ELIMINATED
	let rebuilds = rebuildSpaceNames(game, sbDiv)
	expect(rebuilds).not.toContain("Smyrna")
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
	expect(Engine.map.can_afford_replacement(game, tuDiv, 1)).toBe(false)
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
