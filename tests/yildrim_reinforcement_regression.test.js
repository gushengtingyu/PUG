const Engine = require("../modules/engine.js")
const { setupGame, findSpace, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const YILDRIM = 100

function setAsiaControl(game, faction) {
	if (!game.control) game.control = []
	for (let s = 1; s < Engine.data.spaces.length; s++) {
		let space = Engine.data.spaces[s]
		if (space && space.map === "asia") game.control[s] = faction
	}
}

test("Yildrim reinforcement can use a CP-controlled land path without rail to Galicia", () => {
	let game = setupGame(2026060101, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	setAsiaControl(game, CP)

	let galicia = findSpace("Galicia")
	let erzincan = findSpace("Erzincan")

	expect(Engine.map.is_connected_by_rail(game, erzincan, CP, [galicia], null, true)).toBe(false)
	expect(Engine.reinf_helpers.is_yildrim_rein.check(game, erzincan)).toBe(true)
	expect(Engine.events.can_play_event(game, YILDRIM)).toBe(true)
})

test("Yildrim reinforcement cannot use a Turkish supply source without a CP-controlled path to Galicia", () => {
	let game = setupGame(2026060102, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	setAsiaControl(game, AP)

	let galicia = findSpace("Galicia")
	let erzincan = findSpace("Erzincan")
	game.control[galicia] = CP
	game.control[erzincan] = CP

	expect(Engine.reinf_helpers.is_yildrim_rein.check(game, erzincan)).toBe(false)
	expect(Engine.events.can_play_event(game, YILDRIM)).toBe(false)
})

test("Yildrim reinforcement prompt describes CP-controlled path instead of rail", () => {
	let desc = Engine.reinf_helpers.is_yildrim_rein.desc

	expect(desc).toContain("同盟国控制地块")
	expect(desc).not.toContain("铁路")
})
