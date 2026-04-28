const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame } = require("./helpers.js")

const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

test("Berlin-Baghdad Railroad places the BB.RR map marker and removes the reinforcement marker", () => {
	let game = setupGame(2026042801, "Historical", { no_supply_warnings: true })
	let event = Engine.events.get_event_by_id(104)

	let before = rules.view(game, AP_ROLE)
	expect(before.ui_tokens["BB.RR"]).toBeUndefined()
	expect(before.hidden_reinforcement_markers).not.toContain("BB.RR token")

	event.handler(game, { log: () => {} })

	let view = rules.view(game, CP_ROLE)
	expect(game.events.berlin_baghdad).toBe(1)
	expect(view.ui_tokens["BB.RR"]).toBe("MBBRR.png")
	expect(view.hidden_reinforcement_markers).toContain("BB.RR token")
})
