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

	return { game, indian, ahwaz }
}

function createSummerSwampAttack() {
	let game = setupGame(202)
	let abadan = findSpace("Abadan")
	let basra = findSpace("Basra")
	let british = findPiece("BR IX Corps")

	clearBoard(game)
	game.turn = 4
	game.action_round = 1
	game.active = rules.AP
	game.events = {}
	game.reduced = []
	game.pieces[british] = abadan
	game.attack = {
		space: basra,
		pieces: [british],
		attacker: rules.AP,
		defender: rules.CP
	}

	return { game, british, abadan }
}

function createSummerDesertAttack() {
	let game = setupGame(204)
	let ahwaz = findSpace("Ahwaz")
	let shuster = findSpace("Shuster")
	let anzDesertCorps = findPiece("ANZ Desert Corps")
	let turkish = findPiece("TU DIV #8")

	clearBoard(game)
	game.turn = 4
	game.action_round = 1
	game.active = rules.AP
	game.events = {}
	game.reduced = []
	game.pieces[anzDesertCorps] = ahwaz
	game.pieces[turkish] = shuster
	game.attack = {
		space: shuster,
		pieces: [anzDesertCorps],
		attacker: rules.AP,
		defender: rules.CP
	}

	return { game, anzDesertCorps }
}

test("severe weather reduces full-strength regular attackers and logs the check", () => {
	let { game, indian, ahwaz } = createIndianSummerWeatherAttack()
	let logs = []

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, indian)).toBe(true)
	expect(logs.length).toBe(1)
	expect(logs[0]).toMatch(new RegExp(`^恶劣天气 \\(s${ahwaz}\\): 掷骰=\\d, 行动轮=1 -> `))
	expect(logs[0]).toContain("被减损")
})

test("Pugnacity and Tenacity prevents severe weather losses for Indian attackers", () => {
	let { game, indian } = createIndianSummerWeatherAttack()
	let logs = []
	game.events["pugnacity_tenacity_no_weather"] = game.turn

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, indian)).toBe(false)
	expect(logs).toEqual([])
})

test("Turn 4 AP attacks into swamp still trigger severe weather", () => {
	let { game, british, abadan } = createSummerSwampAttack()
	let logs = []

	expect(Engine.combat.can_battle_trigger_severe_weather(game, "Summer")).toBe(true)

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, british)).toBe(true)
	expect(logs.length).toBe(1)
	expect(logs[0]).toMatch(new RegExp(`^恶劣天气 \\(s${abadan}\\): 掷骰=\\d, 行动轮=1 -> `))
	expect(logs[0]).toContain(`p${british}`)
})

test("Haversack Ruse terrain ignore prevents severe weather checks", () => {
	let { game, british } = createSummerSwampAttack()
	let logs = []
	game.combat_cards = { attacker: [Engine.combat.CC_AP_HAVERSACK_RUSE], defender: [] }

	expect(Engine.combat.can_battle_trigger_severe_weather(game, "Summer")).toBe(false)

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, british)).toBe(false)
	expect(logs).toEqual([])
})

test("Massed Cavalry Charge desert ignore prevents summer desert weather checks", () => {
	let { game, anzDesertCorps } = createSummerDesertAttack()
	let logs = []
	game.combat_cards = { attacker: [Engine.combat.CC_AP_MASSED_CAVALRY_CHARGE], defender: [] }

	expect(Engine.combat.can_battle_trigger_severe_weather(game, "Summer")).toBe(false)

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, anzDesertCorps)).toBe(false)
	expect(logs).toEqual([])
})

test("Pasha 1 defending CP units do not cancel AP severe weather checks", () => {
	let { game, british } = createSummerSwampAttack()
	let logs = []
	game.combat_cards = { attacker: [], defender: [Engine.combat.CC_CP_PASHA_1] }

	expect(Engine.combat.can_battle_trigger_severe_weather(game, "Summer")).toBe(true)

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, british)).toBe(true)
	expect(logs.length).toBe(1)
	expect(logs[0]).toContain(`p${british}`)
})

test("Pugnacity and Tenacity only exempts Indian attackers in mixed severe weather attacks", () => {
	let { game, indian } = createIndianSummerWeatherAttack()
	let british = findPiece("BR IX Corps")
	let logs = []
	game.pieces[british] = game.pieces[indian]
	game.attack.pieces = [indian, british]
	game.events["pugnacity_tenacity_no_weather"] = game.turn

	expect(Engine.combat.can_battle_trigger_severe_weather(game, "Summer")).toBe(true)

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Summer")

	expect(Engine.game_utils.is_piece_reduced(game, indian)).toBe(false)
	expect(Engine.game_utils.is_piece_reduced(game, british)).toBe(true)
	expect(logs.length).toBe(1)
	expect(logs[0]).toContain(`p${british}`)
	expect(logs[0]).not.toContain(`p${indian}`)
})

test("Russian Winter Offensive only exempts Russian attackers in mixed winter mountain attacks", () => {
	let game = setupGame(203)
	let koprukoy = findSpace("Koprukoy")
	let eleskirt = findSpace("Eleskirt")
	let russian = findPiece("RU I Caucasian")
	let serbian = findPiece("SB 1 Army")
	let logs = []

	clearBoard(game)
	game.turn = 2
	game.action_round = 1
	game.active = rules.AP
	game.events = { russian_winter_offensive: game.turn }
	game.reduced = []
	game.pieces[russian] = koprukoy
	game.pieces[serbian] = koprukoy
	game.attack = {
		space: eleskirt,
		pieces: [russian, serbian],
		attacker: rules.AP,
		defender: rules.CP
	}

	expect(Engine.combat.can_battle_trigger_severe_weather(game, "Winter")).toBe(true)

	Engine.combat.apply_severe_weather(game, (msg) => logs.push(msg), "Winter")

	expect(Engine.game_utils.is_piece_reduced(game, russian)).toBe(false)
	expect(Engine.game_utils.is_piece_reduced(game, serbian)).toBe(true)
	expect(logs.length).toBe(1)
	expect(logs[0]).toContain(`p${serbian}`)
	expect(logs[0]).not.toContain(`p${russian}`)
})
