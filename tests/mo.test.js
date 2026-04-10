const Engine = require("../modules/engine.js")
const { AP, CP } = Engine.constants

function createGame() {
	return Engine.setup.create_game(1, "Historical", {})
}

function findPiece(faction, name) {
	const piece = Engine.game_utils.find_piece_by_name(faction, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	const space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

describe("MO 规则重构回归", () => {
	test("AP 巴尔干 MO 仍要求英军在巴尔干发动攻击", () => {
		const game = createGame()
		const britishPiece = findPiece(AP, "BR DIV #2")
		const sofia = findSpace("SOFIA")

		const fulfilled = Engine.mo.check_mo_criteria(game, Engine.mo.MO_BALKANS, {
			attacker: AP,
			space: sofia,
			pieces: [britishPiece],
			defender_pieces: []
		})

		expect(fulfilled).toBe(true)
	})

	test("CP 俄国 MO 在俄国革命四阶段后继续被忽略", () => {
		const game = createGame()
		const turkishPiece = findPiece(CP, "TU I Corps")

		game.events.russian_revolution = 4

		const fulfilled = Engine.mo.check_mo_criteria(game, Engine.mo.MO_RUSSIA, {
			attacker: CP,
			space: findSpace("Damascus"),
			pieces: [turkishPiece],
			defender_pieces: []
		})

		expect(fulfilled).toBe(true)
	})

	test("英军禁攻违规只记录一次", () => {
		const game = createGame()
		const logs = []
		const britishPiece = findPiece(AP, "BR DIV #2")

		game.active = AP
		game.mo_ap = Engine.mo.MO_BRITISH_NO_ATTACK
		game.attack = { space: findSpace("SOFIA") }

		const result = { attackers: [britishPiece], defenders: [] }

		Engine.mo.check_mo_fulfillment(game, result, (message) => logs.push(message))
		Engine.mo.check_mo_fulfillment(game, result, (message) => logs.push(message))

		expect(game.british_mandate_violated).toBe(true)
		expect(logs).toEqual(["AP violated British No Attack Mandate! (VP Penalty pending)"])
	})

	test("恩维尔双重相同目标不会被一次攻击同时完成", () => {
		const game = createGame()
		const turkishPiece = findPiece(CP, "TU I Corps")

		game.active = CP
		game.mo_cp = Engine.mo.MO_ENVER
		game.mo_cp_1 = Engine.mo.MO_TURKEY
		game.mo_cp_2 = Engine.mo.MO_TURKEY
		game.attack = { space: findSpace("Damascus") }

		Engine.mo.check_mo_fulfillment(game, { attackers: [turkishPiece], defenders: [] })

		expect(game.mo_cp_1_fulfilled).toBe(true)
		expect(game.mo_cp_2_fulfilled).not.toBe(true)
		expect(game.mo_cp_fulfilled).not.toBe(true)
	})
})
