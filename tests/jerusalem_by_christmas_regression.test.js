const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

test("Jerusalem by Christmas places persistent MJXMAS markers", () => {
	let game = setupGame(2026042701, "Historical", { no_supply_warnings: true })
	let jerusalem = findSpace("Jerusalem")
	let event_turn = game.turn

	expect(Engine.map.is_controlled_by(game, jerusalem, CP)).toBe(true)

	game.active = AP
	game.state = "event_jerusalem_by_christmas_select_space"
	game.event_ctx = { key: "jerusalem_by_christmas", data: {} }

	let selection_view = rules.view(game, AP_ROLE)
	expect(selection_view.actions.space || []).toContain(jerusalem)

	game = rules.action(game, AP_ROLE, "space", jerusalem)

	expect(game.events.jerusalem_by_christmas).toEqual({
		target_space: jerusalem,
		turn: event_turn + 2
	})
	expect(game.event_ctx).toBeUndefined()

	let view = rules.view(game, AP_ROLE)
	expect(view.jerusalem_by_christmas_markers).toContain(jerusalem)
	expect(view.events.jerusalem_by_christmas.turn).toBe(event_turn + 2)
	expect(view.hidden_reinforcement_markers).toContain("J By C token")
})

test("Jerusalem by Christmas settlement removes MJXMAS markers", () => {
	let game = setupGame(2026042702, "Historical", { no_supply_warnings: true })
	let jerusalem = findSpace("Jerusalem")
	let original_vp = game.vp

	game.events.jerusalem_by_christmas = {
		target_space: jerusalem,
		turn: game.turn + 1
	}

	let armed_view = rules.view(game, AP_ROLE)
	expect(armed_view.jerusalem_by_christmas_markers).toContain(jerusalem)

	game.state = "draw_cards_phase"
	game.active = CP
	game.hand_cp = []
	game.deck_cp = []
	game.discarded_ccs = []

	game = rules.action(game, CP_ROLE, "done")

	expect(game.events.jerusalem_by_christmas).toBeUndefined()
	expect(game.vp).toBe(original_vp + 1)

	let resolved_view = rules.view(game, AP_ROLE)
	expect(resolved_view.jerusalem_by_christmas_markers).toEqual([])
	expect(resolved_view.hidden_reinforcement_markers).not.toContain("J By C token")
})
