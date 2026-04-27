const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName: findPiece, clearBoard } = require("./helpers.js")

function createIndianSummerWeatherAttack() {
	let game = setupGame(201)
	let ahwaz = findSpace("Ahwaz")
	let basra = findSpace("Basra")
	let indian = findPiece("IN 15th DIV")

	clearBoard(game)
	game.turn = 4
	game.action_round = 1
	game.active = rules.AP
	game.events = {}
	game.reduced = []
	game.pieces[indian] = ahwaz
	game.attack = {
		space: basra,
		pieces: [indian],
		attacker: rules.AP,
		defender: rules.CP
	}

	return { game, indian }
}

test("severe weather reduces full-strength regular attackers and logs the check", () => {
	let { game, indian } = createIndianSummerWeatherAttack()
	let logs = []

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, indian)).toBe(true)
	expect(logs.length).toBe(1)
	expect(logs[0]).toMatch(/^恶劣天气 \(Ahwaz\): 掷骰=\d, 行动轮=1 -> /)
	expect(logs[0]).toContain("被减损")
})

test("Pugnacity and Tenacity prevents severe weather losses for Indian attackers", () => {
	let { game, indian } = createIndianSummerWeatherAttack()
	let logs = []
	game.events["pugnacity_tenacity_no_weather"] = true

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, indian)).toBe(false)
	expect(logs).toEqual([])
})
