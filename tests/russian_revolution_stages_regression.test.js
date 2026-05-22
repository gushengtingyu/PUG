const data = require("../data.js")
const Engine = require("../modules/engine.js")
const turnStates = require("../modules/states/states_turn.js")

const { setupGame, findSpace, findApPiece, findCpPiece, clearBoard } = require("./helpers.js")

const { AP, CP, REINFORCEMENTS } = Engine.constants

function getTurnFuncs(game) {
	turnStates.set_globals(game)
	return turnStates.register({}, Engine, {
		log: () => {},
		find_space: Engine.game_utils.find_space,
		AP,
		CP
	})
}

function findCard(event) {
	let card = data.cards.findIndex((c) => c && c.event === event)
	if (card < 0) throw new Error(`Cannot find card: ${event}`)
	return card
}

test("Russian Revolution Stage 1 adds the Romania VP and bars Gorlice-Tarnow", () => {
	let game = setupGame(2026051201, "Historical", { no_supply_warnings: true })
	game.events = { parvus_to_berlin: 5 }
	game.russian_vp = 4
	game.turn = 9

	let vp = game.vp
	getTurnFuncs(game).check_russian_revolution_step()

	expect(game.events.russian_revolution).toBe(1)
	expect(game.events.romania_barred_by_russian_revolution).toBe(true)
	expect(game.vp).toBe(vp + 2)
	expect(Engine.events.can_play_event(game, findCard("GORLICE-TARNOW"))).toBe(false)
})

test("Russian Revolution Stage 2 reduces RU units and eliminates RU LCUs in Corps Assets", () => {
	let game = setupGame(2026051202, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events = { russian_revolution: 1, romania: true }
	game.reduced = []

	let tiflis = findSpace("TIFLIS")
	let cavalry = findApPiece("RU Cavalry #1")
	let army = findApPiece("RU 6 Army")
	game.pieces[cavalry] = tiflis
	game.pieces[army] = Engine.game_utils.get_lcu_reserve_box(AP)

	Engine.events.apply_russian_revolution_stage_effects(game, 2, { log: () => {} })

	expect(Engine.game_utils.is_piece_reduced(game, cavalry)).toBe(true)
	expect(Engine.game_utils.is_eliminated(game, army)).toBe(true)
})

test("New RU units enter reduced during Stages 2 and 3", () => {
	let game = setupGame(2026051203, "Historical", { no_supply_warnings: true })
	game.events = { russian_revolution: 2 }
	game.reduced = []

	let ruDiv = findApPiece("RU DIV #15")
	let odessa = findSpace("Odessa")
	game.pieces[ruDiv] = REINFORCEMENTS

	expect(Engine.events.reinforce(game, "RU DIV #15", AP, odessa)).toBe(true)
	expect(game.pieces[ruDiv]).toBe(odessa)
	expect(Engine.game_utils.is_piece_reduced(game, ruDiv)).toBe(true)
})

test("Russian Revolution Stage 3 allows only one RU attack during the following turn", () => {
	let game = setupGame(2026051204, "Historical", { no_supply_warnings: true })
	clearBoard(game)

	let oltu = findSpace("Oltu")
	let bayburt = findSpace("Bayburt")
	let ruDiv = findApPiece("RU DIV #1")
	let tuDiv = findCpPiece("TU DIV #8")
	game.pieces[ruDiv] = oltu
	game.pieces[tuDiv] = bayburt
	Engine.set_control(game, oltu, AP)
	Engine.set_control(game, bayburt, CP)
	game.active = AP
	game.turn = 10
	game.events = { russian_revolution: 3 }
	game.russian_revolution_limited_attack_turn = 10
	game.russian_revolution_ru_attack_used = false
	game.attacked_spaces = []
	game.retreated = []

	expect(Engine.combat.get_legal_attackable_spaces(game, [ruDiv], AP, () => "Summer", () => true)).toContain(
		bayburt
	)

	game.attack = { pieces: [ruDiv], space: bayburt, attacker: AP, defender: CP }
	Engine.combat.start_attack_sequence(game, () => {})
	expect(game.russian_revolution_ru_attack_used).toBe(true)
	expect(Engine.combat.get_legal_attackable_spaces(game, [ruDiv], AP, () => "Summer", () => true)).toEqual([])
})

test("Russian Revolution Stage 4 removes RU units, keeps the exceptions, and places new markers", () => {
	let game = setupGame(2026051205, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.events = { russian_revolution: 4, romania: true }
	game.reduced = []
	game.soviet_uprising_markers = []

	let tiflis = findSpace("TIFLIS")
	let sarikamis = findSpace("Sarikamis")
	let galicia = findSpace("Galicia")
	let cavalry = findApPiece("RU Cavalry #1")
	let yugo = findApPiece("RU/SB Yugo Infantry")
	let caucasian = findApPiece("RU I Caucasian")
	let geoProtect = findCpPiece("GE GeoProtect")
	let geIX = findCpPiece("GE IX Army")
	let geDiv = findCpPiece("GE DIV #1")
	let transcas = findCpPiece("Arm Transcas #1")

	game.pieces[cavalry] = tiflis
	game.pieces[yugo] = Engine.game_utils.get_scu_reserve_box(AP)
	game.pieces[caucasian] = sarikamis
	game.pieces[geoProtect] = REINFORCEMENTS
	game.pieces[geIX] = galicia
	game.pieces[geDiv] = Engine.game_utils.get_scu_reserve_box(CP)
	for (let name of [
		"Arm Transcas #1",
		"Arm Transcas #2",
		"Arm Transcas #3",
		"Geo Transcaucasian #1",
		"Geo Transcaucasian #2"
	]) {
		game.pieces[findCpPiece(name)] = REINFORCEMENTS
	}

	Engine.events.apply_russian_revolution_stage_effects(game, 4, { log: () => {} })

	expect(game.russian_revolution_survivor_cavalry).toBe(cavalry)
	expect(Engine.game_utils.is_permanently_eliminated(game, caucasian)).toBe(true)
	expect(Engine.game_utils.is_permanently_eliminated(game, cavalry)).toBe(false)
	expect(Engine.game_utils.is_permanently_eliminated(game, yugo)).toBe(false)
	expect(Engine.game_utils.get_piece_nations_for_rule(game, cavalry)).toEqual(["br"])
	expect(Engine.game_utils.get_piece_nations_for_rule(game, cavalry, "mo")).toContain("ru")
	expect(Engine.game_utils.get_piece_nations_for_rule(game, yugo)).toEqual(["br"])

	expect([findSpace("Batum"), tiflis]).toContain(game.pieces[geoProtect])
	expect(Engine.game_utils.get_piece_effective_faction(game, transcas)).toBe(AP)
	expect(game.pieces[transcas]).toBeGreaterThan(0)
	expect(Engine.map.get_supply_status(game, game.pieces[transcas], AP, transcas)).toBe("FULL")
	expect(Engine.game_utils.is_permanently_eliminated(game, geIX)).toBe(true)
	expect(game.pieces[geDiv]).toBe(galicia)

	let sovietSpaces = ["Baku", "Central Asia", "Enzeli"].map(findSpace)
	expect(game.soviet_uprising_markers.sort((a, b) => a - b)).toEqual(sovietSpaces.sort((a, b) => a - b))
	expect(Engine.map.is_disrupted_by_enemy(game, findSpace("Baku"), AP)).toBe(true)
	expect(Engine.map.is_disrupted_by_enemy(game, findSpace("Baku"), CP)).toBe(true)
})

test("Stage 4 blocks new RU reinforcements and RU reinforcement events", () => {
	let game = setupGame(2026051206, "Historical", { no_supply_warnings: true })
	game.events = { russian_revolution: 4 }

	let ruDiv = findApPiece("RU DIV #15")
	game.pieces[ruDiv] = REINFORCEMENTS

	expect(Engine.events.reinforce(game, "RU DIV #15", AP, findSpace("Odessa"))).toBe(false)
	expect(Engine.events.can_play_event(game, findCard("RUSSIAN REINFORCEMENTS"))).toBe(false)
	expect(Engine.events.can_play_event(game, findCard("SPHERE OF INFLUENCE"))).toBe(false)
})
