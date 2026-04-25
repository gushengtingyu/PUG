const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP } = Engine.constants

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`Cannot find piece: ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`Cannot find space: ${name}`)
	return space
}

function clearBoard(game) {
	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	game.moved = []
	game.sr_moved = []
}

function setupGermanStack(game, pieces) {
	let source = findSpace("Adrianople")
	let target = findSpace("Catalca")
	clearBoard(game)
	for (let p of pieces) game.pieces[p] = source
	game.control[source] = CP
	game.control[target] = CP
	game.active = CP
	return { source, target }
}

test("HQ and Heavy Artillery cannot end Movement without a friendly Combat Unit", () => {
	let game = setupGame(2026042501)
	let hq = findPiece(CP, "GE Mackenson HQ")
	let heavy = findPiece(CP, "GE Hvy Arty")
	let combat = findPiece(CP, "German 11th Army")
	let { target } = setupGermanStack(game, [])

	expect(Engine.map.get_stack_end_block_reason(game, target, [hq])).toMatch(/HQ\/Heavy Artillery/)
	expect(Engine.map.get_stack_end_block_reason(game, target, [heavy])).toMatch(/HQ\/Heavy Artillery/)
	expect(Engine.map.get_stack_end_block_reason(game, target, [hq, heavy])).toMatch(/HQ\/Heavy Artillery/)
	expect(Engine.map.get_stack_end_block_reason(game, target, [hq, combat])).toBe(null)

	game.pieces[combat] = target
	expect(Engine.map.get_stack_end_block_reason(game, target, [hq])).toBe(null)

	game.pieces[combat] = 0
	game.pieces[hq] = target
	expect(Engine.map.get_move_end_space_block_reason(game, target, CP)).toMatch(/HQ\/Heavy Artillery/)
	expect(Engine.map.check_rule_violations(game)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				space: target,
				rule: "Rule 16.1: HQ/Heavy Artillery must stack with a friendly Combat Unit"
			})
		])
	)

	let region = findSpace("Galicia")
	game.pieces[hq] = region
	game.control[region] = CP
	game.events.bulgaria = 1
	expect(Engine.map.check_rule_violations(game)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				space: region,
				rule: "Rule 16.1: HQ/Heavy Artillery must stack with a friendly Combat Unit"
			})
		])
	)
})

test("Movement cannot leave an HQ or Heavy Artillery behind without a Combat Unit", () => {
	let game = setupGame(2026042502)
	let hq = findPiece(CP, "GE Mackenson HQ")
	let combat = findPiece(CP, "German 11th Army")
	let secondCombat = findPiece(CP, "GE IV R Corps")
	let { source, target } = setupGermanStack(game, [hq, combat])

	game.move = { initial: source, current: source, spaces_moved: 0, pieces: [combat], touched_spaces: [source] }

	expect(Engine.map.can_stack_move_to(game, target, CP)).toBe(false)
	expect(Engine.map.get_piece_move_block_reason(game, combat, target, CP)).toMatch(/cannot be left/)

	game.pieces[secondCombat] = source
	expect(Engine.map.can_stack_move_to(game, target, CP)).toBe(true)
})

test("HQ and Heavy Artillery need a moving Combat Unit to enter enemy-controlled spaces", () => {
	let game = setupGame(2026042503)
	let hq = findPiece(CP, "GE Mackenson HQ")
	let combat = findPiece(CP, "German 11th Army")
	let { source, target } = setupGermanStack(game, [hq, combat])
	game.control[target] = AP

	game.move = { initial: source, current: source, spaces_moved: 0, pieces: [hq], touched_spaces: [source] }
	expect(Engine.map.can_stack_move_to(game, target, CP)).toBe(false)
	expect(Engine.map.get_piece_move_block_reason(game, hq, target, CP)).toMatch(/enemy-controlled/)

	game.move.pieces = [hq, combat]
	expect(Engine.map.can_stack_move_to(game, target, CP)).toBe(true)
})

test("Strategic Redeployment still allows HQs and land Heavy Artillery", () => {
	let game = setupGame(2026042504)
	let hq = findPiece(CP, "GE Mackenson HQ")
	let heavy = findPiece(CP, "GE Hvy Arty")
	let source = findSpace("Adrianople")
	let reserve = findSpace("CP Reserve")

	clearBoard(game)
	game.pieces[hq] = source
	game.pieces[heavy] = source
	game.control[source] = CP
	game.active = CP

	expect(Engine.map.can_sr_piece(game, hq, CP)).toBe(true)
	expect(Engine.map.can_sr_to_space(game, hq, reserve, CP)).toBe(true)
	expect(Engine.map.get_sr_destinations(game, hq, CP)).toContain(reserve)

	expect(Engine.map.can_sr_piece(game, heavy, CP)).toBe(true)
	expect(Engine.map.can_sr_to_space(game, heavy, reserve, CP)).toBe(true)
})
