"use strict"

const Engine = require("../modules/engine.js")
const { setupGame } = require("./helpers.js")

const { CP } = Engine.constants
const TALAAT_PASHA_REFORMS_CABINET = 96

function prepareTalaatGame() {
	const game = setupGame(2026050704, "Historical", { no_supply_warnings: true })
	game.vp = 9
	game.mo_cp = Engine.mo.MO_TURKEY
	game.mo_cp_fulfilled = false
	game.mo_cp_1 = null
	game.mo_cp_2 = null
	game.mo_cp_1_fulfilled = false
	game.mo_cp_2_fulfilled = false
	return game
}

test("Talaat Pasha immediately cancels the current CP MO and all future CP MO rolls", () => {
	const game = prepareTalaatGame()

	expect(Engine.events.can_play_event(game, TALAAT_PASHA_REFORMS_CABINET)).toBe(true)
	Engine.events.play_event(game, TALAAT_PASHA_REFORMS_CABINET, { log() {} })

	expect(game.events["talaat_pasha"]).toBe(true)
	expect(game.mo_cp_cancelled).toBe(true)
	expect(game.mo_cp).toBe(Engine.mo.MO_NONE)
	expect(game.mo_cp_fulfilled).toBe(true)
	expect(Engine.mo.get_pending_mo_penalty(game, CP)).toBeNull()
})

test("Talaat Pasha also cancels an active Enver mandate for this turn", () => {
	const game = prepareTalaatGame()
	game.mo_cp = Engine.mo.MO_ENVER
	game.mo_cp_1 = Engine.mo.MO_RUSSIA
	game.mo_cp_2 = Engine.mo.MO_TURKEY

	Engine.events.play_event(game, TALAAT_PASHA_REFORMS_CABINET, { log() {} })

	expect(game.mo_cp).toBe(Engine.mo.MO_NONE)
	expect(game.mo_cp_fulfilled).toBe(true)
	expect(game.mo_cp_1_fulfilled).toBe(true)
	expect(game.mo_cp_2_fulfilled).toBe(true)
	expect(Engine.mo.get_pending_mo_penalty(game, CP)).toBeNull()
})
