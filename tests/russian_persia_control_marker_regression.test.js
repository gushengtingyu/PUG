const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearSpace } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

test("Russian control markers render for Russian-controlled non-VP Persia spaces", () => {
	let game = setupGame(2026042801)
	let kazvin = findSpace("Kazvin")
	let ruPiece = findPiece(AP, "RU Persian coss")
	let vpBefore = game.vp
	let russianVpBefore = game.russian_vp

	clearSpace(game, kazvin)
	game.pieces[ruPiece] = kazvin

	Engine.set_control(game, kazvin, AP)

	let view = rules.view(game, AP_ROLE)
	expect(Engine.map.get_space_controller(game, kazvin)).toBe(AP)
	expect(view.ru_control_markers).toContain(kazvin)
	expect(game.russian_vp).toBe(russianVpBefore)
	expect(game.vp).toBe(vpBefore)
})

test("CP control removes Russian markers from non-VP Persia without Russian VP penalty", () => {
	let game = setupGame(2026042802)
	let kazvin = findSpace("Kazvin")
	let ruPiece = findPiece(AP, "RU Persian coss")

	clearSpace(game, kazvin)
	game.pieces[ruPiece] = kazvin
	Engine.set_control(game, kazvin, AP)
	let russianVpAfterRussianControl = game.russian_vp

	Engine.set_control(game, kazvin, CP)

	expect(game.ru_control_markers || []).not.toContain(kazvin)
	expect(game.russian_vp).toBe(russianVpAfterRussianControl)
})
