const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { AP, CP } = Engine.constants
const PENALTY_EVENT = "neutral_persia_first_entry_penalty"

test("first AP entry into neutral Persia costs AP 1 VP once", () => {
	let game = setupGame(2026042803)
	let astara = findSpace("Astara")
	let kazvin = findSpace("Kazvin")
	let ruPiece = findPiece(AP, "RU Persian coss")
	let initialVp = game.vp

	Engine.check_persia_entry_vp_penalty(game, astara, [ruPiece])
	Engine.check_persia_entry_vp_penalty(game, kazvin, [ruPiece])

	expect(game.events[PENALTY_EVENT]).toBe(AP)
	expect(game.vp).toBe(initialVp + 1)
})

test("first CP entry into neutral Persia costs CP 1 VP once", () => {
	let game = setupGame(2026042804)
	let astara = findSpace("Astara")
	let kazvin = findSpace("Kazvin")
	let tuPiece = findPiece(CP, "TU-A DIV #10")
	let initialVp = game.vp

	Engine.check_persia_entry_vp_penalty(game, astara, [tuPiece])
	Engine.check_persia_entry_vp_penalty(game, kazvin, [tuPiece])

	expect(game.events[PENALTY_EVENT]).toBe(CP)
	expect(game.vp).toBe(initialVp - 1)
})

test("entry into non-neutral Persia does not trigger neutral Persia first-entry penalty", () => {
	let game = setupGame(2026042805)
	let meshed = findSpace("Meshed")
	let ruPiece = findPiece(AP, "RU Persian coss")
	let initialVp = game.vp

	Engine.check_persia_entry_vp_penalty(game, meshed, [ruPiece])

	expect(game.events[PENALTY_EVENT]).toBeUndefined()
	expect(game.vp).toBe(initialVp)
})
