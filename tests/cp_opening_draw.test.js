const rules = require("../rules.js")
const data = require("../data.js")

test("CP 开局自选 4 点牌后仍可能从剩余手牌摸到其他 4 点牌", () => {
	let game = rules.setup(1, "Historical", { seven_hand_size: true })
	let candidates = game.deck_cp.filter((c) => {
		let card = data.cards[c]
		return card && card.faction === "cp" && card.commitment === "mobilization" && Number(card.ops) === 4
	})

	expect(game.state).toBe("cp_opening_mobilization_pick")
	expect(game.hand_cp).toHaveLength(0)
	expect(candidates.length).toBeGreaterThan(0)

	game = rules.action(game, "Central Powers", "card", candidates[0])

	let hand_ops4 = game.hand_cp.filter((c) => data.cards[c] && data.cards[c].faction === "cp" && Number(data.cards[c].ops) === 4)
	expect(game.hand_cp).toHaveLength(7)
	expect(game.hand_cp).toContain(candidates[0])
	expect(hand_ops4.length).toBeGreaterThan(1)
})
