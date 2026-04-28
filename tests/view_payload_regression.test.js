"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace } = require("./helpers.js")

const { CP } = Engine.constants
const AP_ROLE = rules.roles[0]

test("rules.view sends sparse control deltas instead of the full control array", () => {
	const game = setupGame(2026042804)
	const view = rules.view(game, AP_ROLE)

	expect(Array.isArray(view.control)).toBe(false)
	expect(Object.keys(view.control).length).toBeLessThan(20)
	expect(Buffer.byteLength(JSON.stringify(view.control))).toBeLessThan(100)
})

test("rules.view includes only spaces whose control differs from map default", () => {
	const game = setupGame(2026042805)
	const changed = findSpace("TIFLIS")
	const unchanged = findSpace("Baghdad")

	game.control[changed] = CP

	const view = rules.view(game, AP_ROLE)

	expect(view.control[String(changed)]).toBe(CP)
	expect(view.control[String(unchanged)]).toBeUndefined()
})
