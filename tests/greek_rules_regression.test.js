"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearBoard, clearSpace } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function setupMoveStack(game, piece, from, faction) {
	game.active = faction
	game.state = "move_stack"
	game.ops = 1
	game.card_ops = 1
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = { move: 0, attack: 0 }
	game.attacked = []
	game.retreated = []
	game.moved = []
	game.move = {
		initial: from,
		current: from,
		spaces_moved: 0,
		pieces: [piece],
		touched_spaces: [from],
		faction
	}
	game.pieces[piece] = from
}

function onlyConnections(names) {
	let spaces = names.map(findSpace)
	let allowed = new Set()
	for (let i = 1; i < spaces.length; i++) {
		allowed.add(`${spaces[i - 1]}-${spaces[i]}`)
		allowed.add(`${spaces[i]}-${spaces[i - 1]}`)
	}
	return {
		block_connection: (_game, current, next) => !allowed.has(`${current}-${next}`)
	}
}

test("neutral Greek spaces discard stale occupation controls except AP Salonika", () => {
	let game = setupGame(2026060101, "Historical", { no_supply_warnings: true })
	let lamia = findSpace("Lamia")
	let salonika = findSpace("Salonika")

	game.control[lamia] = AP
	game.control[salonika] = AP

	expect(Engine.map.get_space_controller(game, lamia)).toBe("neutral")
	expect(Engine.map.get_space_controller(game, salonika)).toBe(AP)

	Engine.setup.normalize_game(game)

	expect(game.control[lamia]).toBe(null)
	expect(game.control[salonika]).toBe(AP)
	expect(rules.view(game, AP_ROLE).control[lamia]).toBeUndefined()
})

test("AP and CP movement through neutral Greece does not place ordinary control markers", () => {
	let apGame = setupGame(2026060102, "Historical", { no_supply_warnings: true })
	clearBoard(apGame)
	let salonika = findSpace("Salonika")
	let larissa = findSpace("Larissa")
	let lamia = findSpace("Lamia")
	let british = findPiece(AP, "BR DIV #4")

	Engine.neutral.on_beachhead_placed(apGame, salonika, AP)
	setupMoveStack(apGame, british, larissa, AP)

	expect(rules.view(apGame, AP_ROLE).actions.space || []).toContain(lamia)
	apGame = rules.action(apGame, AP_ROLE, "space", lamia)

	expect(Engine.map.get_space_controller(apGame, lamia)).toBe("neutral")
	expect(rules.view(apGame, AP_ROLE).control[lamia]).toBeUndefined()

	let cpGame = setupGame(2026060103, "Historical", { no_supply_warnings: true })
	Engine.neutral.trigger_bulgaria_entry(cpGame)
	clearBoard(cpGame)
	let doiran = findSpace("Doiran")
	let turkish = findPiece(CP, "TU DIV #1")

	setupMoveStack(cpGame, turkish, doiran, CP)

	expect(rules.view(cpGame, CP_ROLE).actions.space || []).toContain(salonika)
	cpGame = rules.action(cpGame, CP_ROLE, "space", salonika)

	expect(Engine.map.get_space_controller(cpGame, salonika)).toBe("neutral")
	expect(rules.view(cpGame, CP_ROLE).control[salonika]).toBeUndefined()
})

test("AP may pass neutral Greek units without stopping, while CP may not enter their space", () => {
	let apGame = setupGame(2026060108, "Historical", { no_supply_warnings: true })
	clearBoard(apGame)
	let salonika = findSpace("Salonika")
	let larissa = findSpace("Larissa")
	let lamia = findSpace("Lamia")
	let british = findPiece(AP, "BR DIV #4")
	let greek = findPiece(AP, "GR DIV #1")

	Engine.neutral.on_beachhead_placed(apGame, salonika, AP)
	apGame.pieces[greek] = larissa
	setupMoveStack(apGame, british, salonika, AP)

	expect(rules.view(apGame, AP_ROLE).actions.space || []).toContain(larissa)
	apGame = rules.action(apGame, AP_ROLE, "space", larissa)

	expect(apGame.move.current).toBe(larissa)
	expect(rules.view(apGame, AP_ROLE).actions.space || []).toContain(lamia)
	expect(rules.view(apGame, AP_ROLE).actions.stop).toBeUndefined()

	let cpGame = setupGame(2026060109, "Historical", { no_supply_warnings: true })
	Engine.neutral.trigger_bulgaria_entry(cpGame)
	clearBoard(cpGame)
	let doiran = findSpace("Doiran")
	let turkish = findPiece(CP, "TU DIV #1")

	cpGame.pieces[greek] = salonika
	setupMoveStack(cpGame, turkish, doiran, CP)

	expect(rules.view(cpGame, CP_ROLE).actions.space || []).not.toContain(salonika)
})

test("neutral Greece supply transit lets CP use vacant spaces while AP may pass Greek units", () => {
	let apGame = setupGame(2026060104, "Historical", { no_supply_warnings: true })
	clearBoard(apGame)
	let salonika = findSpace("Salonika")
	let larissa = findSpace("Larissa")
	let lamia = findSpace("Lamia")
	let greek = findPiece(AP, "GR DIV #1")

	Engine.neutral.on_beachhead_placed(apGame, salonika, AP)
	apGame.pieces[greek] = larissa

	expect(
		Engine.map.get_supply_trace_status_to_source(
			apGame,
			lamia,
			AP,
			salonika,
			Engine.map.create_supply_context(apGame),
			onlyConnections(["Lamia", "Larissa", "Salonika"])
		)
	).toBe("FULL")

	let cpGame = setupGame(2026060105, "Historical", { no_supply_warnings: true })
	Engine.neutral.trigger_bulgaria_entry(cpGame)
	clearBoard(cpGame)
	let sofia = findSpace("SOFIA")

	cpGame.pieces[greek] = salonika
	let cpCorridor = onlyConnections(["Lamia", "Larissa", "Salonika", "Doiran", "Strumica", "SOFIA"])

	expect(
		Engine.map.get_supply_trace_status_to_source(
			cpGame,
			lamia,
			CP,
			sofia,
			Engine.map.create_supply_context(cpGame),
			cpCorridor
		)
	).toBe("OOS")

	clearSpace(cpGame, salonika)

	expect(
		Engine.map.get_supply_trace_status_to_source(
			cpGame,
			lamia,
			CP,
			sofia,
			Engine.map.create_supply_context(cpGame),
			cpCorridor
		)
	).toBe("FULL")
})

test("Greek rebuild into an empty enemy-controlled Greek space captures that space", () => {
	let game = setupGame(2026060106, "Historical", { no_supply_warnings: true })
	let greek = findPiece(AP, "GR DIV #1")
	let lamia = findSpace("Lamia")

	Engine.neutral.trigger_greece_entry(game, null, CP, "test")
	clearBoard(game)
	Engine.set_control(game, lamia, AP)
	game.pieces[greek] = Engine.game_utils.get_eliminated_box(CP)
	game.rp_cp = { ge: 0, tu: 0, a: 0.5 }
	game.active = CP
	game.state = "rp_phase"

	expect(rules.view(game, CP_ROLE).actions.piece || []).toContain(greek)
	game = rules.action(game, CP_ROLE, "piece", greek)

	expect(game.state).toBe("rp_rebuild_where")
	expect(rules.view(game, CP_ROLE).actions.space || []).toContain(lamia)
	game = rules.action(game, CP_ROLE, "space", lamia)

	expect(game.pieces[greek]).toBe(lamia)
	expect(Engine.map.get_space_controller(game, lamia)).toBe(CP)
	expect(rules.view(game, CP_ROLE).control_defaults[lamia]).toBe(CP)
})

test("CP-allied Greek units can move from Athens to remove the To Athens beachhead", () => {
	let game = setupGame(2026060107, "Historical", { no_supply_warnings: true })
	let greek = findPiece(AP, "GR DIV #1")
	let athens = findSpace("ATHENS")
	let toAthens = findSpace("to Athens")

	Engine.neutral.trigger_greece_entry(game, null, CP, "test")
	clearBoard(game)
	game.beachheads = [toAthens]
	setupMoveStack(game, greek, athens, CP)

	expect(rules.view(game, CP_ROLE).actions.space || []).toContain(toAthens)
	game = rules.action(game, CP_ROLE, "space", toAthens)

	expect(game.beachheads || []).not.toContain(toAthens)
	expect(game.pieces[greek]).toBe(athens)
	expect(game.moved).toContain(greek)
})
