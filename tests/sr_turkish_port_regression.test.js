const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { CP } = Engine.constants

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

test("Royal Navy Blockade 不会阻止 TU SCU 沿陆路 SR 到土耳其港口", () => {
	let game = setupGame(2026041904, "Historical")
	let piece = findPiece(CP, "TU DIV #8")
	let adana = findSpace("Adana")
	let antalya = findSpace("Antalya")
	let smyrna = findSpace("Smyrna")

	game.events.royal_navy_blockade = true
	game.pieces[piece] = adana
	game.control[adana] = CP
	game.control[antalya] = CP
	game.control[smyrna] = CP

	expect(Engine.map.can_sr_to_space(game, piece, antalya, CP)).toBe(true)
	expect(Engine.map.can_sr_to_space(game, piece, smyrna, CP)).toBe(true)

	let destinations = Engine.map.get_sr_destinations(game, piece, CP)

	expect(destinations).toContain(antalya)
	expect(destinations).toContain(smyrna)
})
