const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { AP, CP } = Engine.constants

test("MO 攻击上下文不会把目标格中的保加利亚/罗马尼亚中立单位算作防守方", () => {
	let game = setupGame(2026041703, "Historical")
	let vidin = findSpace("Vidin")
	let geArmy = findPiece(CP, "German 11th Army")
	let buArmy = findPiece(CP, "BU 1 Army")
	let roArmy = findPiece(AP, "RO 1 Army")

	game.pieces[buArmy] = vidin
	game.pieces[roArmy] = vidin
	game.attack = {
		attacker: CP,
		defender: AP,
		pieces: [geArmy],
		space: vidin
	}

	expect(Engine.game_utils.get_piece_effective_faction(game, buArmy)).toBe("neutral")
	expect(Engine.game_utils.get_piece_effective_faction(game, roArmy)).toBe("neutral")

	let ctx = Engine.mo.create_attack_context(game)

	expect(ctx.attacker).toBe(CP)
	expect(ctx.space).toBe(vidin)
	expect(ctx.defender_pieces).toEqual([])

	game.mo_cp = Engine.mo.MO_RUSSIA
	Engine.mo.check_mo_on_attack_declared(game)
	expect(game.mo_cp_fulfilled).toBe(false)
})
