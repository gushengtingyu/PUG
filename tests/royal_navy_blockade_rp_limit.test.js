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

test("Royal Navy Blockade only recovers Max TU RP from unused card-recorded TU RPs", () => {
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
