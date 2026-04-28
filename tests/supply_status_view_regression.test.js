"use strict"

const fs = require("node:fs")
const path = require("node:path")

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, findCpPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function createSupplyStatusViewGame() {
	let game = setupGame(2026042803)
	clearBoard(game)
	game.active = AP
	game.events = {}
	game.mo_ap = "NONE"
	game.moved = []
	game.sr_moved = []
	game.supply_dirty = true
	return game
}

test("rules.view exposes supply visuals while keeping five-state status internal", () => {
	let game = createSupplyStatusViewGame()
	let tiflis = findSpace("TIFLIS")
	let bolgrad = findSpace("Bolgrad")
	let braila = findSpace("Braila")
	let afghanistan = findSpace("Afghanistan")
	let ruDisrupted = findApPiece("RU DIV #1")
	let brLimitedDisrupted = findApPiece("BR DIV #1")
	let tuLimited = findCpPiece("TU DIV #8")
	let kurdsTiflis = findCpPiece("Kurds #1")
	let kurdsBolgrad = findCpPiece("Kurds #2")
	let turkishDivision = findCpPiece("TU DIV #1")

	game.pieces[ruDisrupted] = tiflis
	game.pieces[brLimitedDisrupted] = bolgrad
	game.pieces[tuLimited] = afghanistan
	game.pieces[kurdsTiflis] = tiflis
	game.pieces[kurdsBolgrad] = bolgrad
	game.pieces[turkishDivision] = braila

	let view = rules.view(game, AP_ROLE)

	expect(game.supply_status[tuLimited]).toBe("LIMITED")
	expect(game.supply_status[ruDisrupted]).toBe("DISRUPTED")
	expect(game.supply_status[brLimitedDisrupted]).toBe("LIMITED_DISRUPTED")
	expect(view.supply_status).toBeUndefined()
	expect(view.limited_supply).toEqual(expect.arrayContaining([tuLimited, brLimitedDisrupted]))
	expect(view.disrupted_supply).toEqual(expect.arrayContaining([ruDisrupted, brLimitedDisrupted]))
})

test("supply overlay treats disrupted traced spaces as supplied", () => {
	let game = createSupplyStatusViewGame()
	let tiflis = findSpace("TIFLIS")
	let ruDisrupted = findApPiece("RU DIV #1")
	let kurds = findCpPiece("Kurds #1")

	game.pieces[ruDisrupted] = tiflis
	game.pieces[kurds] = tiflis

	expect(Engine.map.get_supply_status(game, tiflis, AP, ruDisrupted)).toBe("DISRUPTED")

	let supply = rules.query(game, AP_ROLE, "ap_supply")
	let shownAsSupplied = !!(
		(supply.western && supply.western[tiflis] > 0) ||
		(supply.eastern && supply.eastern[tiflis] > 0)
	)
	expect(shownAsSupplied).toBe(true)
})

test("OOS units are not exposed as disrupted or limited supply", () => {
	let game = createSupplyStatusViewGame()
	let kronstadt = findSpace("Kronstadt")
	let brOos = findApPiece("BR DIV #1")

	game.pieces[brOos] = kronstadt

	let view = rules.view(game, AP_ROLE)

	expect(game.supply_status[brOos]).toBe("OOS")
	expect(view.supply_status).toBeUndefined()
	expect(view.oos).toContain(brOos)
	expect(view.limited_supply).not.toContain(brOos)
	expect(view.disrupted_supply).not.toContain(brOos)
})

test("play.js renders OOS marker and limited/disrupted supply visuals", () => {
	let playSource = fs.readFileSync(path.join(__dirname, "..", "play.js"), "utf8")
	let playCss = fs.readFileSync(path.join(__dirname, "..", "play.css"), "utf8")
	let imagesCss = fs.readFileSync(path.join(__dirname, "..", "images.css"), "utf8")
	let colorsCss = fs.readFileSync(path.join(__dirname, "..", "colors.css"), "utf8")

	expect(playSource).toContain('el.classList.toggle("limited_supply", is_limited_supply)')
	expect(playSource).toContain('el.classList.toggle("disrupted_supply", is_disrupted_supply)')
	expect(playSource).not.toContain('el.classList.toggle("oos"')
	expect(playSource).not.toContain('el.classList.remove("oos"')
	expect(playSource).toContain("const is_limited_supply = !is_oos &&")
	expect(playSource).toContain("const is_disrupted_supply = !is_oos &&")
	expect(playSource).toContain("stack_parts.top_markers.push(build_oos_marker(s))")
	expect(playSource).toContain("stack_parts.top_markers.push(build_limited_supply_marker(s))")
	expect(playCss).not.toContain(".piece.oos")
	expect(playCss).toContain(".piece.disrupted_supply {")
	expect(playCss).toContain("filter: brightness(70%) sepia(100%) hue-rotate(-50deg) saturate(200%)")
	expect(playCss).not.toContain(".piece.disrupted_supply::after")
	expect(playCss).not.toContain("rgba(151, 91, 214")
	expect(imagesCss).toContain("background-image: url(pieces/oos.png)")
	expect(imagesCss).toContain("background-image: url(pieces/LimSupply.png)")
	expect(colorsCss).not.toContain(".unit.oos")
	expect(colorsCss).not.toContain(".marker.cp.oos")
})
