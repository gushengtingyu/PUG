const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findCpPiece: findPiece, clearBoard } = require("./helpers.js")
const { CP } = Engine.constants

function setupCpActivation(seed) {
	let game = setupGame(seed)
	game.active = CP
	game.moved = []
	return game
}

test("AH+GE in same space as Falkenhayn should cost 1 OP", () => {
	let game = setupCpActivation(2026050910)
	let constantinople = findSpace("Constantinople")

	game.pieces[findPiece("GE Falkenhayn HQ")] = constantinople
	game.pieces[findPiece("AH DIV #1")] = constantinople
	game.pieces[findPiece("GE DIV #1")] = constantinople

	let costs = Engine.map.get_activation_cost_pair(game, constantinople)
	expect(costs.move).toBe(1)
	expect(costs.attack).toBe(1)
})

test("AH+GE adjacent to Falkenhayn should cost 1 OP", () => {
	let game = setupCpActivation(2026050911)
	let constantinople = findSpace("Constantinople")
	let catalca = findSpace("Catalca")

	game.pieces[findPiece("GE Falkenhayn HQ")] = constantinople
	game.pieces[findPiece("AH DIV #1")] = catalca
	game.pieces[findPiece("GE DIV #1")] = catalca

	let costs = Engine.map.get_activation_cost_pair(game, catalca)
	expect(costs.move).toBe(1)
	expect(costs.attack).toBe(1)
})

test("AH+GE in Galicia adjacent to Falkenhayn in Belgrade should cost 1 OP", () => {
	let game = setupCpActivation(2026050913)
	let belgrade = findSpace("Belgrade")
	let galicia = findSpace("Galicia")

	clearBoard(game)
	game.pieces[findPiece("GE Falkenhayn HQ")] = belgrade
	game.pieces[findPiece("AH DIV #1")] = galicia
	game.pieces[findPiece("GE DIV #1")] = galicia

	let costs = Engine.map.get_activation_cost_pair(game, galicia)
	expect(costs.move).toBe(1)
	expect(costs.attack).toBe(1)
})

test("AH+GE without Falkenhayn nearby should cost 2 OP", () => {
	let game = setupCpActivation(2026050912)
	let catalca = findSpace("Catalca")

	game.pieces[findPiece("AH DIV #1")] = catalca
	game.pieces[findPiece("GE DIV #1")] = catalca

	let costs = Engine.map.get_activation_cost_pair(game, catalca)
	expect(costs.move).toBe(2)
	expect(costs.attack).toBe(2)
})

test("a lone Yildrim division still costs 1 OP to activate", () => {
	let game = setupCpActivation(2026052801)
	let constantinople = findSpace("Constantinople")

	clearBoard(game)
	game.pieces[findPiece("GE Yildrim #1")] = constantinople

	let costs = Engine.map.get_activation_cost_pair(game, constantinople)
	expect(costs.move).toBe(1)
	expect(costs.attack).toBe(1)
})

test("Yildrim division does not increase activation cost for another nationality", () => {
	let game = setupCpActivation(2026052802)
	let constantinople = findSpace("Constantinople")

	clearBoard(game)
	game.pieces[findPiece("GE Yildrim #1")] = constantinople
	game.pieces[findPiece("TU DIV #1")] = constantinople

	let costs = Engine.map.get_activation_cost_pair(game, constantinople)
	expect(costs.move).toBe(1)
	expect(costs.attack).toBe(1)
})
