"use strict"

const Engine = require("../modules/engine.js")
const rules = require("../rules.js")
const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP, REINFORCEMENTS } = Engine.constants
const CP_ROLE = rules.roles[1]

function control(game, name, faction) {
	Engine.set_control(game, findSpace(name), faction)
}

function place(game, faction, pieceName, spaceName) {
	let p = findPiece(faction, pieceName)
	game.pieces[p] = findSpace(spaceName)
	return p
}

function tribeKey(game, faction, pieceName) {
	let p = findPiece(faction, pieceName)
	game.pieces[p] = Engine.game_utils.get_tribe_key_space(p)
	return p
}

function ruleViolationsFor(game, spaceName, ruleText) {
	let s = findSpace(spaceName)
	return Engine.map.check_rule_violations(game).filter((v) => v.space === s && v.rule.includes(ruleText))
}

test("Jihad placement cannot put a Tribe in an enemy-occupied ordinary space", () => {
	let game = setupGame(2026051903, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	place(game, AP, "BR DIV #1", "Qurna")
	control(game, "Qurna", AP)
	let marsh = tribeKey(game, CP, "Marsh #1")

	game.active = CP
	game.state = "jihad_placement"
	game.tribes_to_place = 1
	game = rules.action(game, CP_ROLE, "piece", marsh)

	let spaces = rules.view(game, CP_ROLE).actions.space || []
	expect(Engine.map.is_region(game, findSpace("Qurna"))).toBe(false)
	expect(spaces).not.toContain(findSpace("Qurna"))
})

test("Jihad placement still allows opposing units to coexist in a Region", () => {
	let game = setupGame(2026051904, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	place(game, AP, "BR Persian Cordon #1", "Bushire")
	control(game, "Bushire", AP)
	let tangistani = tribeKey(game, CP, "Tangistani")

	game.active = CP
	game.state = "jihad_placement"
	game.tribes_to_place = 1
	game = rules.action(game, CP_ROLE, "piece", tangistani)

	let spaces = rules.view(game, CP_ROLE).actions.space || []
	expect(Engine.map.is_region(game, findSpace("Bushire"))).toBe(true)
	expect(spaces).toContain(findSpace("Bushire"))
})

test("AP rebuild placement excludes friendly-controlled ordinary spaces occupied by enemy Tribes", () => {
	let game = setupGame(2026051905, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	place(game, CP, "Senussi #1", "Sollum")
	control(game, "Sollum", AP)
	let brDiv = findPiece(AP, "BR DIV #1")
	game.pieces[brDiv] = Engine.game_utils.get_eliminated_box(AP)

	expect(Engine.map.contains_enemy_pieces(game, findSpace("Sollum"), AP)).toBe(true)
	expect(Engine.map.get_valid_rebuild_spaces(game, brDiv, AP)).not.toContain(findSpace("Sollum"))
})

test("Suez delayed SR arrivals exclude ordinary ports occupied by enemy Tribes", () => {
	let game = setupGame(2026051906, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	place(game, CP, "Senussi #1", "Sollum")
	control(game, "Sollum", AP)
	control(game, "Port Said", AP)
	let brDiv = findPiece(AP, "BR DIV #1")
	game.pieces[brDiv] = REINFORCEMENTS

	let ports = Engine.map.get_suez_delayed_sr_arrival_ports(game, {
		piece: brDiv,
		arrival_zone: "aegean_east_med"
	})

	expect(ports).not.toContain(findSpace("Sollum"))
	expect(ports).toContain(findSpace("Port Said"))
})

test("Rule checker reports opposing units in ordinary spaces but permits contested Regions", () => {
	let ordinary = setupGame(2026051907, "Historical", { no_supply_warnings: true })
	clearBoard(ordinary)
	place(ordinary, AP, "BR DIV #1", "Sollum")
	place(ordinary, CP, "Senussi #1", "Sollum")

	expect(ruleViolationsFor(ordinary, "Sollum", "Rule 8.5")).toHaveLength(1)

	let region = setupGame(2026051908, "Historical", { no_supply_warnings: true })
	clearBoard(region)
	place(region, AP, "BR Persian Cordon #1", "Bushire")
	place(region, CP, "Tangistani", "Bushire")

	expect(Engine.map.is_region(region, findSpace("Bushire"))).toBe(true)
	expect(ruleViolationsFor(region, "Bushire", "Rule 8.5")).toHaveLength(0)
})
