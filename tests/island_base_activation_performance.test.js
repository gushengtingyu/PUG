const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP } = Engine.constants
const AP_ROLE = rules.roles[0]

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: true })
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`Cannot find space ${name}`)
	return space
}

function findPiece(name) {
	let piece = Engine.game_utils.find_piece(AP, name)
	if (piece < 0) throw new Error(`Cannot find piece ${name}`)
	return piece
}

function prepareActivation(game, ops = 5) {
	game.active = AP
	game.state = "activate_spaces"
	game.ops = ops
	game.card_ops = ops
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = {}
	game.moved = []
	game.attacked = []
	game.retreated = []
	Engine.map.check_supply(game)
	game.supply_dirty = false
}

test("island base stack selection does not dirty global supply", () => {
	let game = setupGame(2026042401)
	let lemnos = findSpace("Lemnos")
	let stack = [findPiece("BR DIV #1"), findPiece("BR DIV #2"), findPiece("BR DIV #3")]

	for (let p of stack) game.pieces[p] = lemnos
	prepareActivation(game, 1)

	game = rules.action(game, AP_ROLE, "activate_move", lemnos)
	expect(game.state).toBe("activate_region_stack")
	expect(game.supply_dirty).toBe(false)

	for (let p of stack) {
		game = rules.action(game, AP_ROLE, "piece", p)
		expect(game.supply_dirty).toBe(false)
	}

	game = rules.action(game, AP_ROLE, "confirm")
	expect(game.state).toBe("choose_move_space")
	expect(game.supply_dirty).toBe(false)
	expect(game.region_activations.move[lemnos][0].pieces).toEqual(stack.slice().sort((a, b) => a - b))
})

test("island base movement still dirties global supply", () => {
	let game = setupGame(2026042402)
	let lemnos = findSpace("Lemnos")
	let besikaBay = findSpace("Besika Bay")
	let piece = findPiece("BR DIV #4")

	game.pieces[piece] = lemnos
	game.beachheads = [besikaBay]
	prepareActivation(game, 1)

	game.state = "move_stack"
	game.move = {
		initial: lemnos,
		current: lemnos,
		spaces_moved: 0,
		pieces: [piece],
		touched_spaces: [lemnos]
	}

	game = rules.action(game, AP_ROLE, "space", besikaBay)
	expect(game.pieces[piece]).toBe(besikaBay)
	expect(game.supply_dirty).toBe(true)

	rules.view(game, AP_ROLE)
	expect(game.supply_dirty).toBe(false)
})
