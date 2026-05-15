const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame } = require("./helpers.js")

const CP = Engine.constants.CP
const CP_ROLE = rules.roles[1]

function finishCpReplacementPhase(game) {
	game.active = CP
	game.state = "rp_phase"
	rules.action(game, CP_ROLE, "done")
}

test("Royal Navy Blockade recovers Max TU RP from unused card-recorded TU RPs", () => {
	const game = setupGame(26051201, "Historical", { no_supply_warnings: true })
	game.active = CP
	game.events.royal_navy_blockade = true
	game.tu_rp_limit = 20
	game.rp_cp.tu = 0

	Engine.game_utils.add_rps(game, { rp_tu: 3 }, () => {})
	game.rp_cp.tu += 2

	expect(game.tu_rp_limit).toBe(17)
	expect(game.rp_cp.tu).toBe(5)

	finishCpReplacementPhase(game)

	expect(game.tu_rp_limit).toBe(20)
	expect(game.rp_cp.tu).toBe(0)
})

test("Royal Navy Blockade does not recover Max TU RP from unused bonus TU RPs alone", () => {
	const game = setupGame(26051202, "Historical", { no_supply_warnings: true })
	game.active = CP
	game.events.royal_navy_blockade = true
	game.tu_rp_limit = 20
	game.rp_cp.tu = 2

	finishCpReplacementPhase(game)

	expect(game.tu_rp_limit).toBe(20)
	expect(game.rp_cp.tu).toBe(0)
})

test("GE-converted RPs contribute to recovery pool and increase Max TU RP", () => {
	const game = setupGame(26051205, "Historical", { no_supply_warnings: true })
	game.active = CP
	game.events.royal_navy_blockade = true
	game.tu_rp_limit = 23
	game.rp_cp.tu = 0

	Engine.game_utils.add_rps(game, { rp_tu: 3 }, () => {})
	game.rp_cp.tu += 2

	expect(game.tu_rp_limit).toBe(20)
	expect(game.rp_cp.tu).toBe(5)

	game.tu_rp_ge_converted = 2

	finishCpReplacementPhase(game)

	expect(game.tu_rp_limit).toBe(25)
	expect(game.rp_cp.tu).toBe(0)
})

test("GE-converted RPs push TU max RP above the initial limit", () => {
	const game = setupGame(26051206, "Historical", { no_supply_warnings: true })
	game.active = CP
	game.events.royal_navy_blockade = true
	game.tu_rp_limit = 22
	game.rp_cp.tu = 0

	Engine.game_utils.add_rps(game, { rp_tu: 3 }, () => {})
	game.rp_cp.tu += 3

	expect(game.tu_rp_limit).toBe(19)
	expect(game.rp_cp.tu).toBe(6)

	game.tu_rp_ge_converted = 3

	finishCpReplacementPhase(game)

	expect(game.tu_rp_limit).toBe(25)
	expect(game.rp_cp.tu).toBe(0)
})

test("TU max RP can exceed 25 when GE-converted RPs combine with unused card RPs", () => {
	const game = setupGame(26051207, "Historical", { no_supply_warnings: true })
	game.active = CP
	game.events.royal_navy_blockade = true
	game.tu_rp_limit = 25
	game.rp_cp.tu = 0

	Engine.game_utils.add_rps(game, { rp_tu: 3 }, () => {})
	game.rp_cp.tu += 4

	expect(game.tu_rp_limit).toBe(22)
	expect(game.rp_cp.tu).toBe(7)

	game.tu_rp_ge_converted = 4

	finishCpReplacementPhase(game)

	expect(game.tu_rp_limit).toBe(29)
	expect(game.rp_cp.tu).toBe(0)
})
