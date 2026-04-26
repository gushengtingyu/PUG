const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findCpPiece: findPiece } = require("./helpers.js")

const { CP } = Engine.constants

test("s-labeled connections are restricted to Senussi units, not all tribes", () => {
	let game = setupGame(2026042601)
	let faiyum = findSpace("Faiyum")
	let cairo = findSpace("CAIRO")
	let khartoum = findSpace("Khartoum")
	let senussi1 = findPiece("Senussi #1")
	let senussi2 = findPiece("Senussi #2")
	let qashqai = findPiece("Qashqai")
	let turkishCorps = findPiece("TU I Corps")

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
	expect(Engine.map.get_piece_connected_spaces_for_rule(game, faiyum, senussi1, "attack")).toContain(cairo)
	expect(Engine.map.get_piece_connected_spaces_for_rule(game, faiyum, qashqai, "attack")).not.toContain(cairo)
	expect(Engine.map.get_piece_connected_spaces_for_rule(game, faiyum, turkishCorps, "attack")).not.toContain(cairo)
})
