"use strict"

const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, clearBoard, findSpace, findApPiece, findCpPiece } = require("./helpers.js")

const { CP } = Engine.constants
const CP_ROLE = rules.roles[1]
const ENVER_TO_CONSTANTINOPLE = 58

function prepareSameTargetEnverGame() {
	const game = setupGame(2026050701, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.active = CP
	game.mo_cp = Engine.mo.MO_ENVER
	game.mo_cp_1 = Engine.mo.MO_RUSSIA
	game.mo_cp_2 = Engine.mo.MO_RUSSIA
	game.mo_cp_fulfilled = false
	game.mo_cp_1_fulfilled = false
	game.mo_cp_2_fulfilled = false

	const attacker = findCpPiece("TU DIV #1")
	const defender = findApPiece("RU DIV #1")
	const space = findSpace("Erzurum")
	game.attack = { space, pieces: [attacker] }

	return { game, attacker, defender, space }
}

function fulfillCurrentAttack(game, attacker, defender) {
	Engine.mo.check_mo_fulfillment(game, { attackers: [attacker], defenders: [defender] }, () => {})
}

function loadCpMoMarkerHelper() {
	const source = fs.readFileSync(path.join(__dirname, "..", "play.js"), "utf8")
	const start = source.indexOf("const MO_AP_SPACE")
	const end = source.indexOf("let ap_mo_marker", start)
	if (start < 0 || end < 0) throw new Error("Could not find MO marker helpers in play.js")

	const context = {}
	vm.createContext(context)
	vm.runInContext(
		`${source.slice(start, end)}
		globalThis.get_cp_mo_marker_layout_keys = get_cp_mo_marker_layout_keys`,
		context
	)
	return context.get_cp_mo_marker_layout_keys
}

test("same-target Enver offensives fulfill the ordinary second MO first", () => {
	const { game, attacker, defender, space } = prepareSameTargetEnverGame()

	fulfillCurrentAttack(game, attacker, defender)

	expect(game.mo_cp_2_fulfilled).toBe(true)
	expect(game.mo_cp_1_fulfilled).toBe(false)
	expect(game.mo_cp_fulfilled).toBe(false)

	fulfillCurrentAttack(game, attacker, defender)
	expect(game.mo_cp_1_fulfilled).toBe(false)

	game.attack = { space, pieces: [attacker] }
	fulfillCurrentAttack(game, attacker, defender)

	expect(game.mo_cp_1_fulfilled).toBe(true)
	expect(game.mo_cp_2_fulfilled).toBe(true)
	expect(game.mo_cp_fulfilled).toBe(true)
})

test("Enver to Constantinople can only cancel the first Enver-marked MO", () => {
	const game = setupGame(2026050702, "Historical", { no_supply_warnings: true })
	game.mo_cp = Engine.mo.MO_ENVER
	game.mo_cp_1 = Engine.mo.MO_RUSSIA
	game.mo_cp_2 = Engine.mo.MO_TURKEY
	game.mo_cp_fulfilled = false
	game.mo_cp_1_fulfilled = false
	game.mo_cp_2_fulfilled = false
	game.hand_ap = []

	expect(Engine.events.can_play_event(game, ENVER_TO_CONSTANTINOPLE)).toBe(true)
	Engine.events.play_event(game, ENVER_TO_CONSTANTINOPLE, { log() {} })

	expect(game.mo_cp_1_fulfilled).toBe(true)
	expect(game.mo_cp_2_fulfilled).toBe(false)
	expect(game.mo_cp_fulfilled).toBe(false)

	expect(Engine.events.can_play_event(game, ENVER_TO_CONSTANTINOPLE)).toBe(false)
	Engine.events.play_event(game, ENVER_TO_CONSTANTINOPLE, { log() {} })

	expect(game.mo_cp_2_fulfilled).toBe(false)
	expect(game.mo_cp_fulfilled).toBe(false)
})

test("view exposes Enver sub-MO state for marker rendering", () => {
	const game = setupGame(2026050703, "Historical", { no_supply_warnings: true })
	game.state = "play_card"
	game.active = CP
	game.mo_cp = Engine.mo.MO_ENVER
	game.mo_cp_1 = Engine.mo.MO_BRITISH
	game.mo_cp_2 = Engine.mo.MO_TURKEY
	game.mo_cp_fulfilled = false
	game.mo_cp_1_fulfilled = false
	game.mo_cp_2_fulfilled = true

	const view = rules.view(game, CP_ROLE)

	expect(view.mo_cp_1).toBe(Engine.mo.MO_BRITISH)
	expect(view.mo_cp_2).toBe(Engine.mo.MO_TURKEY)
	expect(view.mo_cp_1_fulfilled).toBe(false)
	expect(view.mo_cp_2_fulfilled).toBe(true)
})

test("front-end Enver marker logic keeps MEnver separate from the ordinary CP MO marker", () => {
	const getKeys = loadCpMoMarkerHelper()
	const imagesCss = fs.readFileSync(path.join(__dirname, "..", "images.css"), "utf8")

	expect(imagesCss).toContain("pieces/MEnver.png")
	expect(getKeys({ mo_cp: "turkey", mo_cp_fulfilled: false })).toEqual({
		regular: "CP MO TU",
		enver: "CP MO Enver"
	})
	expect(getKeys({ mo_cp: "turkey", mo_cp_fulfilled: true })).toEqual({
		regular: "CP MO None",
		enver: "CP MO Enver"
	})
	expect(
		getKeys({
			mo_cp: "enver",
			mo_cp_1: "russia",
			mo_cp_2: "russia",
			mo_cp_1_fulfilled: false,
			mo_cp_2_fulfilled: false
		})
	).toEqual({ regular: "CP MO RU", enver: "CP MO RU" })
	expect(
		getKeys({
			mo_cp: "enver",
			mo_cp_1: "russia",
			mo_cp_2: "russia",
			mo_cp_1_fulfilled: true,
			mo_cp_2_fulfilled: false
		})
	).toEqual({ regular: "CP MO RU", enver: "CP MO Enver" })
	expect(
		getKeys({
			mo_cp: "enver",
			mo_cp_1: "russia",
			mo_cp_2: "russia",
			mo_cp_1_fulfilled: false,
			mo_cp_2_fulfilled: true
		})
	).toEqual({ regular: "CP MO None", enver: "CP MO RU" })
})
