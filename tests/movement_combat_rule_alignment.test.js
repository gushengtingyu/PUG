const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function resetForRuleProbe(game, active = CP) {
	clearBoard(game)
	game.active = active
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.moved = []
	game.attacked = []
	game.retreated = []
	game.combat_cards = { attacker: [], defender: [] }
}

function getAttackTargets(game, pieces, faction = game.active) {
	return Engine.combat.get_legal_attackable_spaces(
		game,
		pieces,
		faction,
		() => Engine.game_utils.get_season(game),
		(s, side) => Engine.map.is_rail_connected_to_supply(game, s, side)
	)
}

test("Bulgarian units may not voluntarily enter Turkey from Bulgaria", () => {
	let game = setupGame(2026051201)
	let buDiv = findPiece(CP, "BU DIV #1")
	let philippopoli = findSpace("Philippopoli")
	let adrianople = findSpace("Adrianople")

	resetForRuleProbe(game, CP)
	game.events.bulgaria = true
	game.pieces[buDiv] = philippopoli
	game.control[philippopoli] = CP
	game.control[adrianople] = CP
	game.move = {
		initial: philippopoli,
		current: philippopoli,
		spaces_moved: 0,
		pieces: [buDiv],
		touched_spaces: [philippopoli],
		faction: CP
	}

	expect(Engine.map.can_enter_area(game, buDiv, adrianople)).toBe(false)
	expect(Engine.map.can_piece_move_to(game, buDiv, adrianople, CP)).toBe(false)
	expect(Engine.map.can_enter_area(game, buDiv, adrianople, { retreat: true })).toBe(true)
})

test("LCUs attacking out of desert must use a supplied rail edge", () => {
	let game = setupGame(2026051202)
	let samarra = findSpace("Samarra")
	let tikrit = findSpace("Tikrit")
	let baghdad = findSpace("Baghdad")
	let tuCorps = findPiece(CP, "TU III Corps")
	let ruDiv = findPiece(AP, "RU DIV #1")

	resetForRuleProbe(game, CP)
	game.pieces[tuCorps] = samarra
	game.pieces[ruDiv] = tikrit
	game.control[samarra] = CP
	game.control[baghdad] = CP
	game.control[tikrit] = AP

	let targets = Engine.combat.get_attackable_spaces(
		game,
		[tuCorps],
		CP,
		() => Engine.game_utils.get_season(game),
		(s, faction) => Engine.map.is_rail_connected_to_supply(game, s, faction)
	)
	expect(targets).not.toContain(tikrit)
})

test("incomplete Berlin-Baghdad railroad is a normal attack connection before the event", () => {
	let game = setupGame(2026052101)
	let eregli = findSpace("Eregli")
	let adana = findSpace("Adana")
	let tuDiv = findPiece(CP, "TU DIV #1")
	let brDiv = findPiece(AP, "BR DIV #1")

	resetForRuleProbe(game, CP)
	delete game.events.berlin_baghdad
	game.pieces[tuDiv] = eregli
	game.pieces[brDiv] = adana
	Engine.set_control(game, eregli, CP)
	Engine.set_control(game, adana, AP)

	expect(Engine.map.get_rail_connections(game, eregli, CP)).not.toContain(adana)
	expect(Engine.map.get_piece_connected_spaces_for_rule(game, eregli, tuDiv, "attack")).toContain(adana)
	expect(getAttackTargets(game, [tuDiv], CP)).toContain(adana)
})

test("colored railroads allow attacks but not movement or advance for restricted units", () => {
	let game = setupGame(2026051206, "Historical", { no_supply_warnings: true })
	let belgrade = findSpace("BELGRADE")
	let galicia = findSpace("Galicia")
	let sbArmy = findPiece(AP, "SB 1 Army")
	let geDiv = findPiece(CP, "GE DIV #1")

	resetForRuleProbe(game, AP)
	game.pieces[sbArmy] = belgrade
	game.pieces[geDiv] = galicia
	Engine.set_control(game, belgrade, AP)
	Engine.set_control(game, galicia, CP)
	game.activated.attack = [belgrade]

	expect(Engine.map.get_piece_connected_spaces_for_rule(game, belgrade, sbArmy, "move")).not.toContain(galicia)
	expect(Engine.map.get_piece_connected_spaces_for_rule(game, belgrade, sbArmy, "attack")).toContain(galicia)
	expect(getAttackTargets(game, [sbArmy], AP)).toContain(galicia)

	game.pieces[geDiv] = 0
	game.attack = {
		pieces: [sbArmy],
		space: galicia,
		attacker: AP,
		defender: CP
	}

	expect(Engine.combat.get_valid_advance_spaces(game, sbArmy, galicia)).toEqual([])
})

test("authorized units can advance across their colored railroads", () => {
	let game = setupGame(2026051207, "Historical", { no_supply_warnings: true })
	let belgrade = findSpace("BELGRADE")
	let galicia = findSpace("Galicia")
	let geDiv = findPiece(CP, "GE DIV #1")
	let brDiv = findPiece(AP, "BR DIV #1")

	resetForRuleProbe(game, CP)
	game.pieces[geDiv] = belgrade
	game.pieces[brDiv] = galicia
	Engine.set_control(game, belgrade, CP)
	Engine.set_control(game, galicia, AP)
	game.activated.attack = [belgrade]

	expect(Engine.map.get_piece_connected_spaces_for_rule(game, belgrade, geDiv, "move")).toContain(galicia)
	expect(getAttackTargets(game, [geDiv], CP)).toContain(galicia)

	game.pieces[brDiv] = 0
	game.attack = {
		pieces: [geDiv],
		space: galicia,
		attacker: CP,
		defender: AP
	}

	expect(Engine.combat.get_valid_advance_spaces(game, geDiv, galicia)).toEqual([galicia])
})

test("Flank attack is allowed against a defended fort without trench or prohibited terrain", () => {
	let game = setupGame(2026051203)
	let adrianople = findSpace("Adrianople")
	let philippopoli = findSpace("Philippopoli")
	let xanthi = findSpace("Xanthi")
	let brCorps = findPiece(AP, "BR IX Corps")
	let brCorps2 = findPiece(AP, "BR VIII Corps")
	let tuDiv = findPiece(CP, "TU DIV #8")

	resetForRuleProbe(game, AP)
	game.pieces[brCorps] = philippopoli
	game.pieces[brCorps2] = xanthi
	game.pieces[tuDiv] = adrianople
	game.control[philippopoli] = AP
	game.control[xanthi] = AP
	game.control[adrianople] = CP
	game.trenches = []
	game.attack = {
		pieces: [brCorps, brCorps2],
		space: adrianople,
		attacker: AP,
		defender: CP
	}

	expect(Engine.combat.has_undestroyed_fort(game, adrianople, CP)).toBe(true)
	expect(Engine.combat.check_can_flank(game)).toBe(true)
})

test("Retreat may enter an enemy-occupied Region", () => {
	let game = setupGame(2026051204)
	let shiraz = findSpace("Shiraz")
	let meshed = findSpace("Meshed")
	let brCordon = findPiece(AP, "BR Persian Cordon #1")
	let kurds = findPiece(CP, "Kurds #1")

	resetForRuleProbe(game, AP)
	game.events.secret_treaty = true
	game.pieces[brCordon] = shiraz
	game.pieces[kurds] = meshed
	game.control[shiraz] = AP
	game.control[meshed] = CP

	expect(Engine.map.is_region(game, meshed)).toBe(true)
	expect(Engine.map.contains_enemy_pieces(game, meshed, AP)).toBe(true)
	expect(Engine.combat.get_valid_retreat_spaces(game, brCordon, [], 1)).toContain(meshed)
})

test("Region combat asks defender to choose one legal defense stack", () => {
	let game = setupGame(2026051205)
	let shiraz = findSpace("Shiraz")
	let isfahan = findSpace("Isfahan")
	let attacker = findPiece(CP, "TU DIV #8")
	let defenders = [
		findPiece(AP, "BR DIV #1"),
		findPiece(AP, "BR DIV #2"),
		findPiece(AP, "BR DIV #3"),
		findPiece(AP, "BR DIV #4")
	]

	resetForRuleProbe(game, CP)
	game.events.secret_treaty = true
	game.state = "confirm_attack"
	game.pieces[attacker] = isfahan
	for (let p of defenders) game.pieces[p] = shiraz
	game.control[isfahan] = CP
	game.control[shiraz] = AP
	game.attack = {
		pieces: [attacker],
		space: shiraz,
		attacker: CP,
		defender: AP
	}

	rules.action(game, CP_ROLE, "confirm")

	expect(game.state).toBe("choose_region_defender_stack")
	expect(game.active).toBe(AP)
	let view = rules.view(game, AP_ROLE)
	for (let p of defenders) expect(view.actions.piece || []).toContain(p)
	expect(view.actions.confirm).toBeUndefined()

	for (let p of defenders.slice(0, 3)) rules.action(game, AP_ROLE, "piece", p)
	view = rules.view(game, AP_ROLE)
	expect(view.actions.confirm).toBeTruthy()

	rules.action(game, AP_ROLE, "confirm")
	expect(game.attack.region_defenders.sort((a, b) => a - b)).toEqual(defenders.slice(0, 3).sort((a, b) => a - b))
	expect(game.attack.initial_defenders.sort((a, b) => a - b)).toEqual(defenders.slice(0, 3).sort((a, b) => a - b))
})
