const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { CP } = Engine.constants
const CP_ROLE = rules.roles[1]

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

function setupGaliciaPieces(game) {
	let galicia = findSpace("Galicia")
	let gePieces = [
		findPiece(CP, "German 11th Army"),
		findPiece(CP, "GE IV R Corps"),
		findPiece(CP, "GE Hvy Arty")
	]
	let ahPieces = [findPiece(CP, "AH VIII Corps"), findPiece(CP, "AH XXII R Corps"), findPiece(CP, "AH DIV #4")]
	let geHq = findPiece(CP, "GE Mackenson HQ")
	for (let p of [...gePieces, ...ahPieces, geHq]) {
		game.pieces[p] = galicia
	}
	return { galicia, gePieces, ahPieces, geHq }
}

test("大区可以按 3 单位堆叠花 1 OPS 激活移动，且不会连带同区其他单位", () => {
	let game = setupGame(2026041908, "Historical")
	let { galicia, gePieces, ahPieces } = setupGaliciaPieces(game)

	game.events.bulgaria = 1
	game.active = CP
	game.state = "activate_spaces"
	game.ops = 1
	game.card_ops = 2
	game.activated = { move: [], attack: [] }
	game.activation_cost = {}
	game.region_activations = { move: {}, attack: {} }
	game.moved = []
	game.attacked = []
	game.retreated = []

	let activationView = rules.view(game, CP_ROLE)
	expect(activationView.actions.activate_move || []).toContain(galicia)

	rules.action(game, CP_ROLE, "activate_move", galicia)
	expect(game.state).toBe("activate_region_stack")

	for (let p of gePieces) {
		rules.action(game, CP_ROLE, "piece", p)
	}

	let stackView = rules.view(game, CP_ROLE)
	expect(stackView.actions.confirm).toBe(1)

	rules.action(game, CP_ROLE, "confirm")

	expect(game.ops).toBe(0)
	expect(game.state).toBe("choose_move_space")
	expect(game.region_activations.move[galicia][0].pieces).toEqual(gePieces.slice().sort((a, b) => a - b))

	let moveView = rules.view(game, CP_ROLE)
	for (let p of gePieces) expect(moveView.actions.piece || []).toContain(p)
	for (let p of ahPieces) expect(moveView.actions.piece || []).not.toContain(p)
})

test("大区内分别激活的 GE 与 AH 堆叠不会被视为同一来源参加联合进攻", () => {
	let game = setupGame(2026041909, "Historical")
	let { galicia, gePieces, ahPieces } = setupGaliciaPieces(game)

	game.events.bulgaria = 1
	game.region_activations = {
		move: {},
		attack: {
			[galicia]: [
				{ pieces: gePieces.slice().sort((a, b) => a - b), cost: 1 },
				{ pieces: ahPieces.slice().sort((a, b) => a - b), cost: 1 }
			]
		}
	}

	expect(Engine.combat.is_invalid_multinational_attack(game, [gePieces[0], ahPieces[0]])).toBe(true)

	game.region_activations.attack[galicia] = [{ pieces: [gePieces[0], ahPieces[0]].sort((a, b) => a - b), cost: 1 }]

	expect(Engine.combat.is_invalid_multinational_attack(game, [gePieces[0], ahPieces[0]])).toBe(false)
})

test("大区取消激活只回退最后一次追加的堆叠", () => {
	let game = setupGame(2026042210, "Historical")
	let { galicia, gePieces, ahPieces } = setupGaliciaPieces(game)

	game.events.bulgaria = 1
	game.active = CP
	game.state = "activate_spaces"
	game.ops = 3
	game.card_ops = 3
	game.activated = { move: [], attack: [] }
	game.activation_cost = {}
	game.region_activations = { move: {}, attack: {} }
	game.moved = []
	game.attacked = []
	game.retreated = []

	rules.action(game, CP_ROLE, "activate_move", galicia)
	for (let p of gePieces) rules.action(game, CP_ROLE, "piece", p)
	rules.action(game, CP_ROLE, "confirm")

	rules.action(game, CP_ROLE, "activate_move", galicia)
	for (let p of ahPieces) rules.action(game, CP_ROLE, "piece", p)
	rules.action(game, CP_ROLE, "confirm")

	expect(game.ops).toBe(1)
	expect(game.region_activations.move[galicia]).toHaveLength(2)
	expect(game.activation_cost[galicia]).toBe(2)

	rules.action(game, CP_ROLE, "deactivate", galicia)

	expect(game.ops).toBe(2)
	expect(game.region_activations.move[galicia]).toHaveLength(1)
	expect(game.region_activations.move[galicia][0].pieces).toEqual(gePieces.slice().sort((a, b) => a - b))
	expect(game.activation_cost[galicia]).toBe(1)

	rules.action(game, CP_ROLE, "deactivate", galicia)

	expect(game.ops).toBe(3)
	expect(game.region_activations.move[galicia]).toBeUndefined()
	expect(game.activation_cost[galicia]).toBeUndefined()
})

test("旧局里没有顺序号的大区激活，追加后取消会先回退新堆叠", () => {
	let game = setupGame(2026042211, "Historical")
	let { galicia, gePieces, ahPieces } = setupGaliciaPieces(game)

	game.events.bulgaria = 1
	game.active = CP
	game.state = "activate_spaces"
	game.ops = 2
	game.card_ops = 2
	game.activated = { move: [], attack: [] }
	game.activation_cost = { [galicia]: 1 }
	game.region_activations = {
		move: {
			[galicia]: [{ pieces: gePieces.slice().sort((a, b) => a - b), cost: 1 }]
		},
		attack: {}
	}
	game.moved = []
	game.attacked = []
	game.retreated = []

	rules.action(game, CP_ROLE, "activate_move", galicia)
	for (let p of ahPieces) rules.action(game, CP_ROLE, "piece", p)
	rules.action(game, CP_ROLE, "confirm")

	expect(game.region_activations.move[galicia]).toHaveLength(2)

	rules.action(game, CP_ROLE, "deactivate", galicia)

	expect(game.ops).toBe(2)
	expect(game.region_activations.move[galicia]).toHaveLength(1)
	expect(game.region_activations.move[galicia][0].pieces).toEqual(gePieces.slice().sort((a, b) => a - b))
})
