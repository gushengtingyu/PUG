const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

function resetForAttackProbe(game) {
	clearBoard(game)
	game.active = CP
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.attacked = []
	game.attacked_spaces = []
}

function getAttackTargets(game, pieces) {
	return Engine.combat.get_legal_attackable_spaces(
		game,
		pieces,
		CP,
		() => Engine.game_utils.get_season(game),
		(s, faction) => Engine.map.is_rail_connected_to_supply(game, s, faction)
	)
}

test("tribes may coordinate an attack with a regular unit of any friendly nationality", () => {
	let game = setupGame(2026053101, "Historical", { no_supply_warnings: true })
	let qom = findSpace("Qum")
	let kazvin = findSpace("Kazvin")
	let teheran = findSpace("TEHERAN")
	let turkish = findPiece(CP, "TU DIV #1")
	let jangali = findPiece(CP, "Jangali")
	let defender = findPiece(AP, "BR DIV #1")

	resetForAttackProbe(game)
	game.pieces[turkish] = qom
	game.pieces[jangali] = kazvin
	game.pieces[defender] = teheran

	expect(Engine.game_utils.is_tribe(jangali)).toBe(true)
	expect(getAttackTargets(game, [turkish, jangali])).toContain(teheran)
})

test("irregulars may coordinate an attack with a regular unit of any friendly nationality", () => {
	let game = setupGame(2026053102, "Historical", { no_supply_warnings: true })
	let afghanistan = findSpace("Afghanistan")
	let baluchistan = findSpace("Baluchistan")
	let india = findSpace("INDIA")
	let turkish = findPiece(CP, "TU DIV #1")
	let afghan = findPiece(CP, "Afghan Uprising #1")
	let defender = findPiece(AP, "BR DIV #1")

	resetForAttackProbe(game)
	game.events.afghan_alliance = true
	game.pieces[turkish] = baluchistan
	game.pieces[afghan] = afghanistan
	game.pieces[defender] = india

	expect(Engine.game_utils.is_irregular(afghan)).toBe(true)
	expect(getAttackTargets(game, [turkish, afghan])).toContain(india)
})

test("nationless units do not block a valid multinational covering stack", () => {
	let game = setupGame(2026053103, "Historical", { no_supply_warnings: true })
	let qom = findSpace("Qum")
	let kazvin = findSpace("Kazvin")
	let afghanistan = findSpace("Afghanistan")
	let german = findPiece(CP, "GE DIV #1")
	let turkish = findPiece(CP, "TU DIV #1")
	let jangali = findPiece(CP, "Jangali")
	let afghan = findPiece(CP, "Afghan Uprising #1")

	resetForAttackProbe(game)
	game.pieces[german] = qom
	game.pieces[turkish] = qom
	game.pieces[jangali] = kazvin
	game.pieces[afghan] = afghanistan

	expect(Engine.combat.is_invalid_multinational_attack(game, [german, turkish, jangali])).toBe(false)
	expect(Engine.combat.is_invalid_multinational_attack(game, [german, turkish, afghan])).toBe(false)
})

test("regular units from uncovered nationalities remain invalid across separate origins", () => {
	let game = setupGame(2026053104, "Historical", { no_supply_warnings: true })
	let qom = findSpace("Qum")
	let kazvin = findSpace("Kazvin")
	let german = findPiece(CP, "GE DIV #1")
	let turkish = findPiece(CP, "TU DIV #1")

	resetForAttackProbe(game)
	game.pieces[german] = qom
	game.pieces[turkish] = kazvin

	expect(Engine.combat.is_invalid_multinational_attack(game, [german, turkish])).toBe(true)
})
