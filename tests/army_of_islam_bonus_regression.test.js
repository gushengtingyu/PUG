const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName: findPiece, clearBoard } = require("./helpers.js")

test("Army of Islam earns one bonus TU RP when winning with TU-A units in a tribal circle", () => {
	let game = setupGame(304, "Historical", { no_supply_warnings: true })
	let kermanshah = findSpace("Kermanshah")
	let armyOfIslam = findPiece("TU Army Islam HQ")
	let tuaDiv = findPiece("TU-A DIV #16")
	let logs = []

	clearBoard(game)
	game.rp_cp = { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 }
	game.tu_rp_limit = 20

	expect(
		Engine.combat.award_army_of_islam_combat_win_bonus(game, armyOfIslam, [armyOfIslam, tuaDiv], kermanshah, (msg) =>
			logs.push(msg)
		)
	).toBe(true)

	expect(game.rp_cp.tu).toBe(1)
	expect(game.tu_rp_bonus).toBe(1)
	expect(game.tu_rp_limit).toBe(20)
	expect(logs[0]).toContain("土耳其奖励 RP +1")
})

test("Army of Islam bonus is not duplicated by a later advance in the same combat", () => {
	let game = setupGame(305, "Historical", { no_supply_warnings: true })
	let kermanshah = findSpace("Kermanshah")
	let armyOfIslam = findPiece("TU Army Islam HQ")
	let tuDiv = findPiece("TU DIV #8")

	clearBoard(game)
	game.rp_cp = { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 }
	game.pieces[armyOfIslam] = kermanshah
	game.pieces[tuDiv] = kermanshah

	expect(
		Engine.combat.award_army_of_islam_combat_win_bonus(game, armyOfIslam, [armyOfIslam, tuDiv], kermanshah, () => {})
	).toBe(true)
	expect(Engine.combat.award_army_of_islam_advance_bonus(game, kermanshah, Engine.constants.CP, () => {})).toBe(false)

	expect(game.rp_cp.tu).toBe(1)
})

test("Army of Islam does not earn the tribal-circle bonus without a TU or TU-A stack unit", () => {
	let game = setupGame(306, "Historical", { no_supply_warnings: true })
	let kermanshah = findSpace("Kermanshah")
	let armyOfIslam = findPiece("TU Army Islam HQ")
	let geDiv = findPiece("GE DIV #1")

	clearBoard(game)
	game.rp_cp = { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 }

	expect(
		Engine.combat.award_army_of_islam_combat_win_bonus(game, armyOfIslam, [armyOfIslam, geDiv], kermanshah, () => {})
	).toBe(false)
	expect(game.rp_cp.tu).toBe(0)
})
