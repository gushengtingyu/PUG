"use strict"

const Engine = require("../modules/engine.js")
const rules = require("../rules.js")
const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function resetForMove(game, faction, from, pieces) {
	game.active = faction
	game.state = "move_stack"
	game.activated = { move: [from], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.moved = []
	game.attacked = []
	game.retreated = []
	game.combat_cards = { attacker: [], defender: [] }
	game.move = {
		initial: from,
		current: from,
		spaces_moved: 0,
		pieces,
		touched_spaces: [from],
		faction
	}
}

test("movement may enter an enemy-occupied Region but not an enemy-occupied ordinary space", () => {
	let game = setupGame(2026052401, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let shiraz = findSpace("Shiraz")
	let bushire = findSpace("Bushire")
	let brCordon = findPiece(AP, "BR Persian Cordon #1")
	let tangistani = findPiece(CP, "Tangistani")

	game.events.secret_treaty = true
	game.pieces[brCordon] = shiraz
	game.pieces[tangistani] = bushire
	Engine.set_control(game, shiraz, AP)
	Engine.set_control(game, bushire, CP)
	resetForMove(game, AP, shiraz, [brCordon])

	expect(Engine.map.is_region(game, bushire)).toBe(true)
	expect(Engine.map.contains_enemy_pieces(game, bushire, AP)).toBe(true)
	expect(Engine.map.get_piece_move_block_reason(game, brCordon, bushire, AP)).toBe(null)
	expect(Engine.map.can_piece_move_to(game, brCordon, bushire, AP)).toBe(true)
	expect(Engine.map.can_stack_move_to(game, bushire, AP)).toBe(true)
	expect(rules.view(game, AP_ROLE).actions.space || []).toContain(bushire)

	game = rules.action(game, AP_ROLE, "space", bushire)
	expect(game.pieces[brCordon]).toBe(bushire)
	expect(Engine.map.is_controlled_by(game, bushire, CP)).toBe(true)

	let basra = findSpace("Basra")
	let qurna = findSpace("Qurna")
	let brDiv = findPiece(AP, "BR DIV #1")
	let tuDiv = findPiece(CP, "TU DIV #8")

	clearBoard(game)
	game.pieces[brDiv] = basra
	game.pieces[tuDiv] = qurna
	Engine.set_control(game, basra, AP)
	Engine.set_control(game, qurna, AP)
	resetForMove(game, AP, basra, [brDiv])

	expect(Engine.map.is_region(game, qurna)).toBe(false)
	expect(Engine.map.contains_enemy_pieces(game, qurna, AP)).toBe(true)
	expect(Engine.map.can_piece_move_to(game, brDiv, qurna, AP)).toBe(false)
	expect(Engine.map.can_stack_move_to(game, qurna, AP)).toBe(false)
	expect(rules.view(game, AP_ROLE).actions.space || []).not.toContain(qurna)
})

test("CP movement may enter AP-occupied Eastern Persia from TEHERAN after Persia opens", () => {
	let game = setupGame(2026052402, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let teheran = findSpace("TEHERAN")
	let meshed = findSpace("Meshed")
	let tuDiv = findPiece(CP, "TU DIV #1")
	let brCordon = findPiece(AP, "BR Persian Cordon #1")

	game.events.persian_push = true
	game.pieces[tuDiv] = teheran
	game.pieces[brCordon] = meshed
	Engine.set_control(game, meshed, AP)
	for (let name of ["TEHERAN", "Qum", "Sultanabad", "Burujird", "Hamadan", "Kermanshah", "Karind", "Khanikan", "Baghdad"]) {
		Engine.set_control(game, findSpace(name), CP)
	}
	resetForMove(game, CP, teheran, [tuDiv])

	expect(Engine.map.get_supply_status(game, teheran, CP, tuDiv)).not.toBe("OOS")
	expect(Engine.map.is_region(game, meshed)).toBe(true)
	expect(Engine.map.contains_enemy_pieces(game, meshed, CP)).toBe(true)
	expect(Engine.map.get_piece_move_block_reason(game, tuDiv, meshed, CP)).toBe(null)
	expect(Engine.map.can_piece_move_to(game, tuDiv, meshed, CP)).toBe(true)
	expect(Engine.map.can_stack_move_to(game, meshed, CP)).toBe(true)
	expect(rules.view(game, CP_ROLE).actions.space || []).toContain(meshed)

	game = rules.action(game, CP_ROLE, "space", meshed)
	expect(game.pieces[tuDiv]).toBe(meshed)
	expect(Engine.map.is_controlled_by(game, meshed, AP)).toBe(true)
})

test("BR Persian Cordon cannot enter Neutral Persia or Azerbaijan before the Russian Revolution", () => {
	let game = setupGame(2026052501, "Historical", { no_supply_warnings: true })
	let brCordon = findPiece(AP, "BR Persian Cordon #1")
	let meshed = findSpace("Meshed")
	let hamadan = findSpace("Hamadan")
	let tabriz = findSpace("Tabriz")
	let ahwaz = findSpace("Ahwaz")

	game.events.secret_treaty = true

	expect(Engine.map.is_persian_region(meshed)).toBe(true)
	expect(Engine.map.is_neutral_persia_space(hamadan)).toBe(true)
	expect(Engine.map.is_azerbaijan(tabriz)).toBe(true)
	expect(Engine.map.is_arabistan(ahwaz)).toBe(true)

	expect(Engine.map.can_enter_area(game, brCordon, meshed)).toBe(true)
	expect(Engine.map.can_enter_area(game, brCordon, ahwaz)).toBe(true)
	expect(Engine.map.can_enter_area(game, brCordon, hamadan)).toBe(false)
	expect(Engine.map.can_enter_area(game, brCordon, tabriz)).toBe(false)

	game.events.russian_revolution = 1
	expect(Engine.map.can_enter_area(game, brCordon, hamadan)).toBe(true)
	expect(Engine.map.can_enter_area(game, brCordon, tabriz)).toBe(true)
})

test("SR may leave an enemy-controlled contested Region after contested-region supply projection", () => {
	let game = setupGame(2026052403, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	game.events.secret_treaty = true
	let ruDiv = findPiece(AP, "RU DIV #1")
	let police = findPiece(AP, "RU/PE Police North")
	let kurds = findPiece(CP, "Kurds #1")
	let teheran = findSpace("TEHERAN")
	let meshed = findSpace("Meshed")

	game.pieces[ruDiv] = meshed
	game.pieces[police] = meshed
	game.pieces[kurds] = meshed
	Engine.set_control(game, teheran, AP)
	Engine.set_control(game, meshed, CP)

	expect(Engine.map.get_supply_status(game, meshed, AP, ruDiv, true)).not.toBe("OOS")
	expect(Engine.map.get_supply_status(game, teheran, AP, ruDiv, true)).not.toBe("OOS")
	expect(Engine.map.has_sr_path(game, ruDiv, meshed, teheran, AP, false)).toBe(true)
	expect(Engine.map.can_sr_to_space(game, ruDiv, teheran, AP)).toBe(true)
})
