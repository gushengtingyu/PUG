const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { CP } = Engine.constants

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`Missing space: ${name}`)
	return space
}

function findPiece(name) {
	let piece = Engine.game_utils.find_piece(CP, name)
	if (piece < 0) throw new Error(`Missing piece: ${name}`)
	return piece
}

test("s-labeled connections are restricted to Senussi units, not all tribes", () => {
	let game = setupGame(2026042601)
	let faiyum = findSpace("Faiyum")
	let cairo = findSpace("CAIRO")
	let khartoum = findSpace("Khartoum")
	let senussi1 = findPiece("Senussi #1")
	let senussi2 = findPiece("Senussi #2")
	let qashqai = findPiece("Qashqai")

	expect(Engine.data.spaces[faiyum].limited_connections.senussi).toEqual(
		expect.arrayContaining([cairo, khartoum])
	)
	expect(Engine.data.spaces[faiyum].limited_connections.tr || []).not.toContain(cairo)
	expect(Engine.data.spaces[faiyum].limited_connections.tr || []).not.toContain(khartoum)

	expect(Engine.map.get_connected_spaces(game, faiyum, "senussi", CP)).toEqual(
		expect.arrayContaining([cairo, khartoum])
	)
	expect(Engine.map.get_connected_spaces(game, faiyum, "tr", CP)).not.toContain(cairo)
	expect(Engine.map.get_connected_spaces(game, faiyum, "tr", CP)).not.toContain(khartoum)

	expect(Engine.map.get_piece_connected_spaces_for_rule(game, faiyum, senussi1)).toContain(cairo)
	expect(Engine.map.get_piece_connected_spaces_for_rule(game, faiyum, senussi2)).toContain(cairo)
	expect(Engine.map.get_piece_connected_spaces_for_rule(game, faiyum, qashqai)).not.toContain(cairo)
})
