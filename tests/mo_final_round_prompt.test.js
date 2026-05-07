"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function setupActionPromptGame(faction) {
	let game = setupGame(2026050711, "Historical", { no_supply_warnings: true })
	game.state = "play_card"
	game.active = faction
	game.action_round = 6
	game.hand_ap = []
	game.hand_cp = []
	game.events = game.events || {}
	return game
}

test("第六行动轮 AP 未完成 MO 时提示最后一轮强制进攻警告", () => {
	let game = setupActionPromptGame(AP)
	game.mo_ap = Engine.mo.MO_RUSSIA
	game.mo_ap_fulfilled = false

	let view = rules.view(game, AP_ROLE)
	expect(view.prompt).toContain("最后一轮")
	expect(view.prompt).toContain(Engine.mo.mo_name(Engine.mo.MO_RUSSIA))
	expect(view.prompt).toContain("VP +1")
})

test("第六行动轮已完成 MO 时不显示最后一轮警告", () => {
	let game = setupActionPromptGame(AP)
	game.mo_ap = Engine.mo.MO_RUSSIA
	game.mo_ap_fulfilled = true

	let view = rules.view(game, AP_ROLE)
	expect(view.prompt).not.toContain("最后一轮")
})

test("第六行动轮 CP 恩维尔 MO 只提示尚未完成的攻势", () => {
	let game = setupActionPromptGame(CP)
	game.mo_cp = Engine.mo.MO_ENVER
	game.mo_cp_fulfilled = false
	game.mo_cp_1 = Engine.mo.MO_RUSSIA
	game.mo_cp_1_fulfilled = true
	game.mo_cp_2 = Engine.mo.MO_TURKEY
	game.mo_cp_2_fulfilled = false

	let view = rules.view(game, CP_ROLE)
	expect(view.prompt).toContain("最后一轮")
	expect(view.prompt).toContain("#2")
	expect(view.prompt).toContain(Engine.mo.mo_name(Engine.mo.MO_TURKEY))
	expect(view.prompt).toContain("VP -1")
	expect(view.prompt).not.toContain("#1")
})
