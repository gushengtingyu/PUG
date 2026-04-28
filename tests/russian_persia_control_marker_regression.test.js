const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearSpace } = require("./helpers.js")

const { AP } = Engine.constants
const AP_ROLE = rules.roles[0]

test("Russian occupation of non-VP Persia renders AP control, not Russian VP marker", () => {
	let game = setupGame(2026042801)
	let kazvin = findSpace("Kazvin")
	let ruPiece = findPiece(AP, "RU Persian coss")
	let vpBefore = game.vp
	let russianVpBefore = game.russian_vp

	clearSpace(game, kazvin)
	game.events.secret_treaty = true
	game.pieces[ruPiece] = kazvin

	Engine.set_control(game, kazvin, AP)

	let view = rules.view(game, AP_ROLE)
	expect(Engine.map.get_space_controller(game, kazvin)).toBe(AP)
	expect(view.control[kazvin]).toBe(AP)
	expect(view.ru_control_markers || []).not.toContain(kazvin)
	expect(game.russian_vp).toBe(russianVpBefore)
	expect(game.vp).toBe(vpBefore)
})

test("placing a Russian unit in non-VP Persia records AP control for the frontend", () => {
	let game = setupGame(2026042802)
	let kazvin = findSpace("Kazvin")
	let ruPiece = findPiece(AP, "RU/PE Police North")
	let vpBefore = game.vp
	let russianVpBefore = game.russian_vp

	clearSpace(game, kazvin)
	game.pieces[ruPiece] = 0
	game.events.secret_treaty = true
	game.events.neutral_persia_first_entry_penalty = AP

	Engine.events.reinforce(game, "RU/PE Police North", AP, kazvin)

	let view = rules.view(game, AP_ROLE)
	expect(game.pieces[ruPiece]).toBe(kazvin)
	expect(Engine.map.get_space_controller(game, kazvin)).toBe(AP)
	expect(view.control[kazvin]).toBe(AP)
	expect(view.ru_control_markers || []).not.toContain(kazvin)
	expect(game.russian_vp).toBe(russianVpBefore)
	expect(game.vp).toBe(vpBefore)
})
