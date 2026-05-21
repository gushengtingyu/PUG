const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPiece, findPieceByName, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

test("entrenching a besieged enemy fort creates a besieger-owned trench", () => {
	let game = setupGame(2026051901, "Historical", { no_supply_warnings: true })
	let erzurum = findSpace("Erzurum")
	let brCorps = findPiece(AP, "BR IX Corps")

	clearBoard(game)
	game.pieces[brCorps] = erzurum
	game.control[erzurum] = CP
	game.trenches = []
	game.trenches_2 = []
	game.trench_owner = []

	expect(Engine.map.is_besieged(game, erzurum)).toBe(true)
	expect(Engine.game_utils.can_entrench_in_space(game, erzurum, AP)).toBe(true)

	Engine.game_utils.place_trench(game, erzurum, AP)

	expect(Engine.game_utils.has_trench(game, erzurum)).toBe(1)
	expect(Engine.game_utils.get_trench_owner(game, erzurum)).toBe(AP)
	expect(Engine.game_utils.is_enemy_trench(game, erzurum, CP)).toBe(true)
})

test("enemy entry removes a besieger-owned level 1 trench in a fort space", () => {
	let game = setupGame(2026051902, "Historical", { no_supply_warnings: true })
	let erzurum = findSpace("Erzurum")

	game.trenches = []
	game.trenches_2 = []
	game.trench_owner = []
	Engine.game_utils.place_trench(game, erzurum, AP)

	let result = Engine.game_utils.enter_trench(game, erzurum, CP)

	expect(result.action).toBe("removed")
	expect(Engine.game_utils.has_trench(game, erzurum)).toBe(0)
	expect(Engine.game_utils.get_trench_owner(game, erzurum)).toBe(null)
})

test("ordinary enemy entry into Doiran degrades the level 2 trench and changes ownership", () => {
	let game = setupGame(2026051903, "Historical", { no_supply_warnings: true })
	let doiran = findSpace("Doiran")

	expect(Engine.game_utils.has_trench(game, doiran)).toBe(2)
	expect(Engine.game_utils.get_trench_owner(game, doiran)).toBe(AP)

	let result = Engine.game_utils.enter_trench(game, doiran, CP)

	expect(result.action).toBe("degraded")
	expect(Engine.game_utils.has_trench(game, doiran)).toBe(1)
	expect(game.trenches).toContain(doiran)
	expect(game.trenches_2).not.toContain(doiran)
	expect(Engine.game_utils.get_trench_owner(game, doiran)).toBe(CP)
})

test("out of supply attrition degrades a level 2 trench to enemy-owned level 1", () => {
	let game = setupGame(2026051904, "Historical", { no_supply_warnings: true })
	let doiran = findSpace("Doiran")

	let result = Engine.game_utils.apply_trench_attrition(game, doiran)

	expect(result.action).toBe("degraded")
	expect(Engine.game_utils.has_trench(game, doiran)).toBe(1)
	expect(Engine.game_utils.get_trench_owner(game, doiran)).toBe(CP)
})

test("combat odds only apply trench shifts for the defender-owned trench", () => {
	let game = setupGame(2026051905, "Historical", { no_supply_warnings: true })
	let oltu = findSpace("Oltu")
	let bayburt = findSpace("Bayburt")
	let attacker = findPieceByName("RU DIV #3")
	let defender = findPieceByName("TU DIV #8")

	clearBoard(game)
	game.pieces[attacker] = oltu
	game.pieces[defender] = bayburt
	game.active = AP
	game.attack = {
		space: bayburt,
		pieces: [attacker],
		attacker: AP,
		defender: CP
	}
	game.trenches = []
	game.trenches_2 = []
	game.trench_owner = []

	let noTrenchOdds = Engine.combat.fmt_attack_odds(game)

	Engine.game_utils.place_trench(game, bayburt, AP)
	let attackerOwnedOdds = Engine.combat.fmt_attack_odds(game)

	Engine.game_utils.set_trench_owner(game, bayburt, CP)
	let defenderOwnedOdds = Engine.combat.fmt_attack_odds(game)

	expect(attackerOwnedOdds).toBe(noTrenchOdds)
	expect(defenderOwnedOdds).not.toBe(noTrenchOdds)
})
