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

	expect(Engine.map.can_enter_region(game, buDiv, adrianople)).toBe(false)
	expect(Engine.map.can_piece_move_to(game, buDiv, adrianople, CP)).toBe(false)
	expect(Engine.map.can_enter_region(game, buDiv, adrianople, { retreat: true })).toBe(true)
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
