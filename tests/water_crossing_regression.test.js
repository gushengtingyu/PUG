const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, findCpPiece } = require("./helpers.js")

const { AP, CP } = Engine.constants

function getConnections(game, from, piece, mode) {
	return Engine.map.get_piece_connected_spaces_for_rule(game, from, piece, mode)
}

test("crossing values do not make CP-limited connections one-way", () => {
	let game = setupGame(2026042901)
	let belgrade = findSpace("BELGRADE")
	let galicia = findSpace("Galicia")
	let cpPiece = findCpPiece("GE Alpenkorps")
	let apPiece = findApPiece("RU DIV #3")

	expect(getConnections(game, belgrade, cpPiece, "attack")).toContain(galicia)
	expect(getConnections(game, galicia, cpPiece, "attack")).toContain(belgrade)

	expect(getConnections(game, belgrade, apPiece, "attack")).not.toContain(galicia)
	expect(getConnections(game, galicia, apPiece, "attack")).not.toContain(belgrade)
})

test("crossing-only river edges remain bidirectional for movement and attack", () => {
	let game = setupGame(2026042902)
	let kut = findSpace("Kut")
	let theHai = findSpace("The Hai")
	let cpPiece = findCpPiece("TU DIV #1")

	expect(getConnections(game, kut, cpPiece, "move")).toContain(theHai)
	expect(getConnections(game, theHai, cpPiece, "move")).toContain(kut)
	expect(getConnections(game, kut, cpPiece, "attack")).toContain(theHai)
	expect(getConnections(game, theHai, cpPiece, "attack")).toContain(kut)
})

test("numbered strait restrictions still come from numeric flags", () => {
	let game = setupGame(2026042903)
	let rodosto = findSpace("Rodosto")
	let constantinople = findSpace("CONSTANTINOPLE")
	let bandirma = findSpace("Bandirma")
	let bosphorus = findSpace("The Bosphorus Forts")
	let cpPiece = findCpPiece("TU DIV #1")

	game.control = game.control || []
	game.control[rodosto] = CP
	game.control[constantinople] = CP
	game.control[bosphorus] = CP
	game.control[bandirma] = AP

	expect(getConnections(game, rodosto, cpPiece, "attack")).not.toContain(bandirma)
	expect(getConnections(game, constantinople, cpPiece, "attack")).toContain(bandirma)
})
