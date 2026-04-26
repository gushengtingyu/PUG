const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPieceByPredicate: findPiece } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function findCardByNumber(num) {
	let card = Engine.data.cards.findIndex((info, idx) => idx > 0 && info && info.num === num)
	if (card < 0) throw new Error(`Could not find card #${num}`)
	return card
}

function setSpaceControl(game, space, faction) {
	if (!game.control) game.control = []
	game.control[space] = faction
}

function restrictAlliedSolidarityPorts(game, allowedSpaces) {
	let allowed = new Set(allowedSpaces)
	for (let s = 1; s < Engine.data.spaces.length; s++) {
		let info = Engine.data.spaces[s]
		if (!info || !info.port) continue
		if (!Engine.map.is_controlled_by(game, s, AP)) continue
		if (allowed.has(s)) continue
		setSpaceControl(game, s, CP)
	}
}

function prepareAlliedSolidarityPlacementState(game, units) {
	game.active = AP
	game.state = "event_allied_solidarity_place"
	game.event_ctx = {
		key: "allied_solidarity",
		data: {
			reinf_to_place: [...units]
		}
	}
}

test("German Subs in the Med blocks Allied Solidarity when only blocked ports remain", () => {
	let game = setupGame(2026042301)
	let alliedSolidarity = findCardByNumber(17)
	let portSaid = findSpace("Port Said")
	let lemnos = findSpace("Lemnos")

	restrictAlliedSolidarityPorts(game, [portSaid, lemnos])
	game.events.german_subs = true
	game.events.german_subs_turn = game.turn

	expect(Engine.events.can_play_event(game, alliedSolidarity)).toBe(false)
})

test("Allied Solidarity does not offer Gallipoli beachheads as Balkan beachheads", () => {
	let game = setupGame(2026042302)
	let suvlaBay = findSpace("Suvla Bay")

	game.beachheads = [suvlaBay]
	prepareAlliedSolidarityPlacementState(game, ["IT DIV"])

	let view = rules.view(game, AP_ROLE)
	let legalSpaces = view.actions.space || []

	expect(legalSpaces).not.toContain(suvlaBay)
})

test("German Subs in the Med also blocks the neutral Salonika placement option", () => {
	let game = setupGame(2026042303)
	let salonika = findSpace("Salonika")

	game.events.german_subs = true
	game.events.german_subs_turn = game.turn
	prepareAlliedSolidarityPlacementState(game, ["GR National Defense"])

	let view = rules.view(game, AP_ROLE)
	let legalSpaces = view.actions.space || []

	expect(legalSpaces).not.toContain(salonika)
})

test("RU 2/4 Special respects the BR/RU stacking restriction, but IT DIV can still use another allowed port", () => {
	let game = setupGame(2026042304)
	let bushire = findSpace("Bushire")
	let alexandria = findSpace("Alexandria")
	let brScu = findPiece(
		(info) => info.faction === AP && info.nation === "br" && info.piece_class === "SCU" && info.type !== "hq",
		"BR SCU"
	)

	restrictAlliedSolidarityPorts(game, [bushire, alexandria])
	game.pieces[brScu] = alexandria

	prepareAlliedSolidarityPlacementState(game, ["RU 2/4 Special"])
	let ruView = rules.view(game, AP_ROLE)
	let ruLegalSpaces = ruView.actions.space || []
	expect(ruLegalSpaces).toContain(bushire)
	expect(ruLegalSpaces).not.toContain(alexandria)

	prepareAlliedSolidarityPlacementState(game, ["IT DIV"])
	let itView = rules.view(game, AP_ROLE)
	let itLegalSpaces = itView.actions.space || []
	expect(itLegalSpaces).toContain(bushire)
	expect(itLegalSpaces).toContain(alexandria)
})
