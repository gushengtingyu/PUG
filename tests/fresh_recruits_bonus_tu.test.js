const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findPiece } = require("./helpers.js")

const { CP } = Engine.constants

test("CP 2号牌的新兵征募只使用事件给的额外 TU 补员，不会动用 GE 或 RP 条上的 TU", () => {
	let game = setupGame(20260416011, "Historical")
	let event = Engine.events.get_event_by_id(57)
	let piece = findPiece(CP, "TU I Corps")

	game.active = CP
	game.rp_cp = { a: 0, ge: 1, tu: 3 }
	game.reduced = [piece]

	event.handler(game)

	expect(game.rp_cp.ge).toBe(1)
	expect(game.rp_cp.tu).toBe(3)
	expect(game.state).toBe("event_fresh_recruits")

	let view = rules.view(game, game.active)
	expect(view.actions.piece).toContain(piece)

	rules.action(game, "Central Powers", "piece", piece)

	expect(game.rp_cp.ge).toBe(1)
	expect(game.rp_cp.tu).toBe(3)
	expect(game.reduced).not.toContain(piece)

	rules.action(game, "Central Powers", "done")

	expect(game.rp_cp.ge).toBe(1)
	expect(game.rp_cp.tu).toBe(3)
	expect(game.fresh_recruits_bonus_tu).toBeUndefined()
})
