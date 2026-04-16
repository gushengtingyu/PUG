const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const turnStates = require("../modules/states/states_turn.js")

const { AP, ELIMINATED } = Engine.constants

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(name) {
	let piece = Engine.game_utils.find_piece(AP, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

function getTurnFuncs(game) {
	turnStates.set_globals(game)
	return turnStates.register({}, Engine, {
		log: () => {},
		find_space: Engine.game_utils.find_space,
		AP: Engine.constants.AP,
		CP: Engine.constants.CP
	})
}

test("Kitchener 的英转俄只允许 1 点，并支持 BR+RU 混付且 BR 优先", () => {
	let game = setupGame(2026041605, "Historical")
	let piece = findPiece("RU DIV #13")

	game.events = { kitchener: 1 }
	game.br_to_ru_rp_used = false
	game.br_to_ru_rp_spent = 0
	game.rp_ap = { a: 0, br: 1, fr: 0, ru: 2, in: 0, it: 0 }
	game.pieces[piece] = ELIMINATED

	expect(Engine.replacement.can_afford_replacement(game, piece, 2)).toBe(true)

	Engine.replacement.spend_replacement_points(game, piece, 2)

	expect(game.rp_ap.br).toBe(0)
	expect(game.rp_ap.ru).toBe(1)
	expect(game.br_to_ru_rp_used).toBe(true)
	expect(game.br_to_ru_rp_spent).toBe(1)
})

test("Kitchener 不能把 2 点 BR 一次性整包当成 2 点 RU 用", () => {
	let game = setupGame(2026041606, "Historical")
	let piece = findPiece("RU DIV #13")

	game.events = { kitchener: 1 }
	game.br_to_ru_rp_used = false
	game.br_to_ru_rp_spent = 0
	game.rp_ap = { a: 0, br: 2, fr: 0, ru: 0, in: 0, it: 0 }
	game.pieces[piece] = ELIMINATED

	expect(Engine.replacement.can_afford_replacement(game, piece, 2)).toBe(false)
})

test("Asquith 生效时，俄军补员会优先消耗可转换的 BR RP", () => {
	let game = setupGame(2026041607, "Historical")
	let piece = findPiece("RU DIV #13")

	game.events = { asquith_coalition: true }
	game.br_to_ru_rp_used = false
	game.br_to_ru_rp_spent = 0
	game.rp_ap = { a: 0, br: 2, fr: 0, ru: 1, in: 0, it: 0 }
	game.pieces[piece] = ELIMINATED

	expect(Engine.replacement.can_afford_replacement(game, piece, 2)).toBe(true)

	Engine.replacement.spend_replacement_points(game, piece, 2)

	expect(game.rp_ap.br).toBe(0)
	expect(game.rp_ap.ru).toBe(1)
	expect(game.br_to_ru_rp_used).toBe(false)
	expect(game.br_to_ru_rp_spent).toBe(0)
})

test("革命后只有真正俄国控制君士坦丁堡，才允许英转俄", () => {
	let game = setupGame(2026041608, "Historical")
	let piece = findPiece("RU DIV #13")
	let constantinople = findSpace("CONSTANTINOPLE")

	game.events = { kitchener: 1, russian_revolution: 1 }
	game.br_to_ru_rp_used = false
	game.br_to_ru_rp_spent = 0
	game.rp_ap = { a: 0, br: 1, fr: 0, ru: 0, in: 0, it: 0 }
	game.pieces[piece] = ELIMINATED
	Engine.set_control(game, constantinople, AP)

	expect(Engine.replacement.can_afford_replacement(game, piece, 1)).toBe(false)

	game.ru_control_markers = [constantinople]

	expect(Engine.replacement.can_afford_replacement(game, piece, 1)).toBe(true)
})

test("俄国革命的开始判定只会被俄国控制的君士坦丁堡阻止", () => {
	let constantinople = findSpace("CONSTANTINOPLE")

	let apGame = setupGame(2026041609, "Historical")
	apGame.events = { parvus_to_berlin: 5 }
	apGame.russian_vp = 4
	apGame.turn = 9
	Engine.set_control(apGame, constantinople, AP)
	getTurnFuncs(apGame).check_russian_revolution_step()
	expect(apGame.events.russian_revolution).toBe(1)

	let ruGame = setupGame(2026041610, "Historical")
	ruGame.events = { parvus_to_berlin: 5 }
	ruGame.russian_vp = 4
	ruGame.turn = 9
	Engine.set_control(ruGame, constantinople, AP)
	ruGame.ru_control_markers = [constantinople]
	getTurnFuncs(ruGame).check_russian_revolution_step()
	expect(ruGame.events.russian_revolution).toBeUndefined()
})
