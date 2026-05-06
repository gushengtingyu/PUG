const rules = require("../rules.js")

const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

test("illegal consecutive SR action does not remove the previous undo point", () => {
	let game = rules.setup(7001, "Historical", {})

	game.active = rules.AP
	game.state = "play_card"
	game.action_round = 2
	game.ap_actions[1] = { type: "sr", card: 1 }
	game.undo = [{ state: "sentinel", log: game.log.length }]

	game = rules.action(game, AP_ROLE, "play_sr", game.hand_ap[0] || 1)

	expect(game.state).toBe("play_card")
	expect(game.undo).toHaveLength(1)
	expect(game.undo[0].state).toBe("sentinel")
})

test("rollback states are compressed and rollback keeps the current random seed", () => {
	let game = rules.setup(7002, "Historical", {})
	game.active = rules.AP
	game.state = "play_card"
	game.action_round = 1
	game.ap_actions[0] = { type: "ops", card: 1 }

	rules.set_game(game)
	rules.save_rollback_point()

	expect(typeof game.rollback_state).toBe("string")
	expect(game.rollback_state.startsWith("deflate:")).toBe(true)
	expect(rules.decompress_rollback_state(game.rollback_state)).toHaveLength(1)

	let saved_seed = game.seed
	game.vp = 17
	game.seed = saved_seed + 12345

	game = rules.action(game, AP_ROLE, "propose_rollback", 0)
	expect(game.state).toBe("review_rollback_proposal")

	game = rules.action(game, CP_ROLE, "accept")
	expect(game.state).toBe("confirm_rollback")
	expect(game.vp).not.toBe(17)
	expect(game.seed).toBe(saved_seed + 12345)
	expect(typeof game.rollback_state).toBe("string")
	expect(rules.decompress_rollback_state(game.rollback_state)).toHaveLength(1)
})

test("rollback cannot be proposed from transient review states", () => {
	let game = rules.setup(7003, "Historical", {})
	game.active = rules.AP
	game.state = "play_card"
	game.action_round = 1
	game.ap_actions[0] = { type: "ops", card: 1 }

	rules.set_game(game)
	rules.save_rollback_point()
	game.state = "review_supply_warnings"

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.propose_rollback).toBeUndefined()

	game = rules.action(game, AP_ROLE, "propose_rollback", 0)
	expect(game.state).toBe("review_supply_warnings")
})
