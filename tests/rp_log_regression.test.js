"use strict"

const Engine = require("../modules/engine.js")
const rules = require("../rules.js")
const data = require("../data.js")

const { AP } = Engine.constants
const AP_ROLE = rules.roles[0]

test("playing a replacement card logs the RP point breakdown", () => {
	let card = data.cards.findIndex(
		(info, idx) => idx > 0 && info && info.faction === AP && info.rp_br && info.rp_ru && info.rp_in
	)
	expect(card).toBeGreaterThan(0)

	let game = rules.setup(2026060106, "Historical", { seed: 42, no_supply_warnings: true })
	game.active = AP
	game.state = "play_card"
	game.hand_ap = [card]
	game.ap_actions = []
	game.cp_actions = []

	game = rules.action(game, AP_ROLE, "play_rps", card)

	expect(game.log).toContain(`c${card} -- 补员 (BR 1, RU 2, IN 1)`)
})
