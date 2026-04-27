const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece, clearSpace } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function prepareBritish35State(game) {
	Engine.events.get_event_by_id(35).handler(game, null)
}

function setEmptyControl(game, space, faction) {
	clearSpace(game, space)
	game.control[space] = faction
}

function legalSpaces(game) {
	let view = rules.view(game, AP_ROLE)
	return view.actions.space || []
}

test("British Reinforcements 35 lets Dunsterforce use AP-controlled Persia, AP-controlled Baghdad, or AP Reserve", () => {
	let game = setupGame(2026042701)
	let apReserve = Engine.game_utils.get_scu_reserve_box(AP)
	let baghdad = findSpace("Baghdad")
	let bushire = findSpace("Bushire")
	let shiraz = findSpace("Shiraz")
	let isfahan = findSpace("Isfahan")

	setEmptyControl(game, baghdad, AP)
	setEmptyControl(game, bushire, AP)
	setEmptyControl(game, shiraz, AP)
	setEmptyControl(game, isfahan, AP)
	prepareBritish35State(game)

	let spaces = legalSpaces(game)

	expect(spaces).toContain(baghdad)
	expect(spaces).toContain(apReserve)
	expect(spaces).toContain(bushire)
	expect(spaces).toContain(shiraz)
	expect(spaces).toContain(isfahan)

	setEmptyControl(game, baghdad, CP)
	spaces = legalSpaces(game)

	expect(spaces).not.toContain(baghdad)
	expect(spaces).toContain(apReserve)
	expect(spaces).toContain(bushire)
	expect(spaces).toContain(shiraz)
	expect(spaces).toContain(isfahan)
})

test("British Reinforcements 35 lets South Persia Rifles use AP-controlled Persia or AP Reserve, not Baghdad", () => {
	let game = setupGame(2026042702)
	let apReserve = Engine.game_utils.get_scu_reserve_box(AP)
	let baghdad = findSpace("Baghdad")
	let bushire = findSpace("Bushire")
	let shiraz = findSpace("Shiraz")
	let isfahan = findSpace("Isfahan")
	let dunsterforce = findPiece(AP, "BR Dunsterforce")

	setEmptyControl(game, baghdad, AP)
	setEmptyControl(game, bushire, AP)
	setEmptyControl(game, shiraz, AP)
	setEmptyControl(game, isfahan, AP)
	prepareBritish35State(game)

	game = rules.action(game, AP_ROLE, "space", apReserve)

	expect(game.pieces[dunsterforce]).toBe(apReserve)
	expect(game.event_ctx.data.reinf_to_place).toEqual(["BR/PE SPers Rifles"])

	let spaces = legalSpaces(game)

	expect(spaces).toContain(apReserve)
	expect(spaces).toContain(bushire)
	expect(spaces).toContain(shiraz)
	expect(spaces).toContain(isfahan)
	expect(spaces).not.toContain(baghdad)
})
