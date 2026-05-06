const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { AP } = Engine.constants

function setupRuSrGame() {
	let game = setupGame(2026050301, "Historical")
	let odessa = findSpace("Odessa")
	let petrovsk = findSpace("Petrovsk")
	let central_asia = findSpace("Central Asia")
	game.control[odessa] = AP
	game.control[petrovsk] = AP
	game.control[central_asia] = AP
	return { game, odessa, petrovsk, central_asia }
}

test("Rule 11.4: RU SCU 可以从 Odessa SR 到 Petrovsk", () => {
	let { game, odessa, petrovsk } = setupRuSrGame()
	let piece = findPiece(AP, "RU Black Sea")
	game.pieces[piece] = odessa

	let destinations = Engine.map.get_sr_destinations(game, piece, AP)
	expect(destinations).toContain(petrovsk)
})

test("Rule 11.4: RU SCU 可以从 Odessa SR 到 Central Asia", () => {
	let { game, odessa, central_asia } = setupRuSrGame()
	let piece = findPiece(AP, "RU Black Sea")
	game.pieces[piece] = odessa

	let destinations = Engine.map.get_sr_destinations(game, piece, AP)
	expect(destinations).toContain(central_asia)
})

test("Rule 11.4: RU SCU 可以从 Petrovsk SR 到 Odessa", () => {
	let { game, odessa, petrovsk } = setupRuSrGame()
	let piece = findPiece(AP, "RU Black Sea")
	game.pieces[piece] = petrovsk

	let destinations = Engine.map.get_sr_destinations(game, piece, AP)
	expect(destinations).toContain(odessa)
})

test("Rule 11.4: 非 RU 单位不能通过虚拟连接 SR 到 Petrovsk 或 Central Asia", () => {
	let { game, odessa, petrovsk, central_asia } = setupRuSrGame()
	let piece = findPiece(AP, "BR Cavalry #1")
	game.pieces[piece] = odessa

	let destinations = Engine.map.get_sr_destinations(game, piece, AP)
	expect(destinations).not.toContain(petrovsk)
	expect(destinations).not.toContain(central_asia)
})

test("Rule 11.4: RU 单位 move 连接不包含 Petrovsk（无地图连接）", () => {
	let { game, odessa, petrovsk } = setupRuSrGame()
	let piece = findPiece(AP, "RU Black Sea")
	game.pieces[piece] = odessa

	let moveNeighbors = Engine.map.get_connected_spaces(game, odessa, "ru", AP, piece, "move")
	expect(moveNeighbors).not.toContain(petrovsk)
})

test("Rule 11.4: RU 单位 move 连接不包含 Central Asia（无地图连接）", () => {
	let { game, odessa, central_asia } = setupRuSrGame()
	let piece = findPiece(AP, "RU Black Sea")
	game.pieces[piece] = odessa

	let moveNeighbors = Engine.map.get_connected_spaces(game, odessa, "ru", AP, piece, "move")
	expect(moveNeighbors).not.toContain(central_asia)
})

test("Rule 11.4: RU SCU 从 Derbent 可以 SR 到 Odessa（经由 Petrovsk 虚拟连接）", () => {
	let { game, odessa, petrovsk } = setupRuSrGame()
	let derbent = findSpace("Derbent")
	game.control[derbent] = AP
	let piece = findPiece(AP, "RU Black Sea")
	game.pieces[piece] = derbent

	let destinations = Engine.map.get_sr_destinations(game, piece, AP)
	expect(destinations).toContain(petrovsk)
	expect(destinations).toContain(odessa)
})

test("Rule 11.4: RU SCU 从 Derbent 可以 SR 到 Bolgrad（经由 Petrovsk → Odessa 虚拟连接 → Bolgrad 铁路）", () => {
	let { game } = setupRuSrGame()
	let derbent = findSpace("Derbent")
	let bolgrad = findSpace("Bolgrad")
	game.control[derbent] = AP
	game.control[bolgrad] = AP
	let piece = findPiece(AP, "RU Black Sea")
	game.pieces[piece] = derbent

	let destinations = Engine.map.get_sr_destinations(game, piece, AP)
	expect(destinations).toContain(bolgrad)
})
