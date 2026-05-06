const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const data = require("../data.js")

const { setupGame, findPiece, findSpace } = require("./helpers.js")

const { AP, CP } = Engine.constants
const CP_ROLE = rules.roles[1]

test("圣战上升时不能直接放置消灭盒里的部落单位", () => {
	let game = setupGame(2026041910, "Historical")
	let eliminatedTribe = findPiece(CP, "Bawi")
	let reserveTribe = findPiece(CP, "Bakhtiari")
	let cpEliminated = Engine.game_utils.get_eliminated_box(CP)

	game.pieces[eliminatedTribe] = cpEliminated
	game.state = "jihad_placement"
	game.active = CP
	game.tribes_to_place = 1
	game.selected_piece = null

	let view = rules.view(game, CP_ROLE)

	expect(Engine.game_utils.is_eliminated(game, eliminatedTribe)).toBe(true)
	expect(Engine.game_utils.is_in_reserve(game, eliminatedTribe)).toBe(false)
	expect(view.actions.piece || []).not.toContain(eliminatedTribe)
	expect(view.actions.piece || []).toContain(reserveTribe)
})

test("jihad placement during the first move step resumes the moving stack", () => {
	let game = setupGame(2026050601, "Historical", { no_supply_warnings: true })
	let samarra = findSpace("Samarra")
	let baghdad = findSpace("Baghdad")
	let movingPiece = findPiece(CP, "TU DIV #1")

	game.pieces[movingPiece] = samarra
	game.control[baghdad] = AP
	game.jihad_city_effective_owner = []
	game.jihad_cities_flipped = []
	game.jihad = 2
	game.active = CP
	game.state = "choose_pieces_to_move"
	game.activated = { move: [samarra], attack: [] }
	game.moved = []
	game.attacked = []
	game.move = {
		initial: samarra,
		current: samarra,
		spaces_moved: 0,
		pieces: [movingPiece],
		touched_spaces: [samarra]
	}

	game = rules.action(game, CP_ROLE, "space", baghdad)

	expect(game.state).toBe("jihad_placement")
	expect(game.state_stack[0].state).toBe("move_stack")
	expect(game.move.current).toBe(baghdad)

	let view = rules.view(game, CP_ROLE)
	let tribe = view.actions.piece[0]
	game = rules.action(game, CP_ROLE, "piece", tribe)
	view = rules.view(game, CP_ROLE)
	let tribeSpace = view.actions.space[0]
	game = rules.action(game, CP_ROLE, "space", tribeSpace)

	expect(data.spaces[game.move.current].name).toBe("Baghdad")
	expect(game.state).toBe("move_stack")
	expect(game.state_stack || []).toEqual([])

	view = rules.view(game, CP_ROLE)
	expect(view.prompt).toContain("Baghdad")
	expect(view.prompt).not.toContain("Samarra")
})

test("jihad placement done action during the first move step resumes the moving stack", () => {
	let game = setupGame(2026050602, "Historical", { no_supply_warnings: true })
	let samarra = findSpace("Samarra")
	let baghdad = findSpace("Baghdad")
	let movingPiece = findPiece(CP, "TU DIV #1")
	let cpEliminated = Engine.game_utils.get_eliminated_box(CP)

	for (let p = 0; p < game.pieces.length; p++) {
		if (data.pieces[p] && data.pieces[p].type === "tribe") game.pieces[p] = cpEliminated
	}

	game.pieces[movingPiece] = samarra
	game.control[baghdad] = AP
	game.jihad_city_effective_owner = []
	game.jihad_cities_flipped = []
	game.jihad = 2
	game.active = CP
	game.state = "choose_pieces_to_move"
	game.activated = { move: [samarra], attack: [] }
	game.moved = []
	game.attacked = []
	game.move = {
		initial: samarra,
		current: samarra,
		spaces_moved: 0,
		pieces: [movingPiece],
		touched_spaces: [samarra]
	}

	game = rules.action(game, CP_ROLE, "space", baghdad)

	expect(game.state).toBe("jihad_placement")
	expect(game.state_stack[0].state).toBe("move_stack")

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.done).toBe(1)
	game = rules.action(game, CP_ROLE, "done")

	expect(data.spaces[game.move.current].name).toBe("Baghdad")
	expect(game.state).toBe("move_stack")

	view = rules.view(game, CP_ROLE)
	expect(view.prompt).toContain("Baghdad")
	expect(view.prompt).not.toContain("Samarra")
})
