const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

const { AP } = Engine.constants
const AP_ROLE = rules.roles[0]
const WARM_WATER_PORT = 40

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`Space not found: ${name}`)
	return space
}

function findPiece(name) {
	let piece = data.pieces.findIndex((info) => info && info.name === name)
	if (piece < 0) throw new Error(`Piece not found: ${name}`)
	return piece
}

function clearPieces(game) {
	for (let p = 1; p < data.pieces.length; p++) {
		if (data.pieces[p]) game.pieces[p] = 0
	}
}

function makeAllSpacesApControlled(game) {
	for (let s = 1; s < data.spaces.length; s++) {
		if (data.spaces[s]) game.control[s] = AP
	}
}

function markAllSpacesRussianControlled(game) {
	game.ru_control_markers = []
	for (let s = 1; s < data.spaces.length; s++) {
		if (data.spaces[s]) game.ru_control_markers.push(s)
	}
}

function setupWarmWaterPortHarness() {
	let game = rules.setup(2026042601, "Historical", { no_supply_warnings: true })
	game.active = AP
	game.state = "play_card"
	game.action_round = 1
	game.hand_ap = [WARM_WATER_PORT]
	clearPieces(game)
	return game
}

test("Warm Water Port requires a Russian unit occupying the candidate port", () => {
	let game = setupWarmWaterPortHarness()
	makeAllSpacesApControlled(game)
	markAllSpacesRussianControlled(game)

	expect(Engine.events.get_warm_water_port_options(game)).toEqual([])
	expect(Engine.events.can_play_event(game, WARM_WATER_PORT)).toBe(false)
})

test("Warm Water Port requires a land Russian-control trace back to Petrovsk", () => {
	let game = setupWarmWaterPortHarness()
	let fao = findSpace("Fao")
	let ruDiv = findPiece("RU DIV #1")

	makeAllSpacesApControlled(game)
	game.pieces[ruDiv] = fao

	expect(Engine.events.is_warm_water_port_option(game, fao)).toBe(false)
	expect(Engine.events.can_play_event(game, WARM_WATER_PORT)).toBe(false)
})

test("Warm Water Port ignores listed spaces that are not ports in map data", () => {
	let game = setupWarmWaterPortHarness()
	let mersin = findSpace("Mersin")
	let ruDiv = findPiece("RU DIV #1")

	makeAllSpacesApControlled(game)
	markAllSpacesRussianControlled(game)
	game.pieces[ruDiv] = mersin

	expect(data.spaces[mersin].port || 0).toBe(0)
	expect(Engine.events.is_warm_water_port_option(game, mersin)).toBe(false)
	expect(Engine.events.can_play_event(game, WARM_WATER_PORT)).toBe(false)
})

test("Warm Water Port requires a Russian control marker for VP candidate ports", () => {
	let game = setupWarmWaterPortHarness()
	let smyrna = findSpace("Smyrna")
	let ruDiv = findPiece("RU DIV #1")

	makeAllSpacesApControlled(game)
	markAllSpacesRussianControlled(game)
	game.ru_control_markers = game.ru_control_markers.filter((s) => s !== smyrna)
	game.pieces[ruDiv] = smyrna

	expect(data.spaces[smyrna].vp).toBeGreaterThan(0)
	expect(Engine.events.is_warm_water_port_option(game, smyrna)).toBe(false)
	expect(Engine.events.can_play_event(game, WARM_WATER_PORT)).toBe(false)

	game.ru_control_markers.push(smyrna)

	expect(Engine.events.is_warm_water_port_option(game, smyrna)).toBe(true)
	expect(Engine.events.get_warm_water_port_options(game)).toEqual([smyrna])
})

test("Warm Water Port with one legal port applies and advances to event confirmation", () => {
	let game = setupWarmWaterPortHarness()
	let fao = findSpace("Fao")
	let ruDiv = findPiece("RU DIV #1")

	makeAllSpacesApControlled(game)
	markAllSpacesRussianControlled(game)
	game.hand_ap = [WARM_WATER_PORT, 41]
	game.pieces[ruDiv] = fao

	expect(Engine.events.get_warm_water_port_options(game)).toEqual([fao])

	game = rules.action(game, AP_ROLE, "play_event", WARM_WATER_PORT)

	expect(game.state).toBe("confirm_event")
	expect(game.warm_water_port).toBe(fao)
	expect(game.warm_water_port_vp).toBe(fao)
	expect(game.events["warm_water_port"]).toBe(true)
	expect(game.warm_water_port_options).toBeUndefined()
	expect(rules.view(game, AP_ROLE).actions.play_event).toBeUndefined()
})

test("Warm Water Port with multiple legal ports prompts once and then advances to event confirmation", () => {
	let game = setupWarmWaterPortHarness()
	let fao = findSpace("Fao")
	let kuwait = findSpace("Kuwait")
	let ruDiv1 = findPiece("RU DIV #1")
	let ruDiv2 = findPiece("RU DIV #2")

	makeAllSpacesApControlled(game)
	markAllSpacesRussianControlled(game)
	game.pieces[ruDiv1] = fao
	game.pieces[ruDiv2] = kuwait

	game = rules.action(game, AP_ROLE, "play_event", WARM_WATER_PORT)

	expect(game.state).toBe("event_warm_water_port")
	expect(game.warm_water_port_options).toEqual([fao, kuwait])

	game = rules.action(game, AP_ROLE, "space", kuwait)

	expect(game.state).toBe("confirm_event")
	expect(game.warm_water_port).toBe(kuwait)
	expect(game.events["warm_water_port"]).toBe(true)
	expect(game.warm_water_port_options).toBeUndefined()
})

test("Warm Water Port prompt rejects spaces outside the legal option list", () => {
	let game = setupWarmWaterPortHarness()
	let fao = findSpace("Fao")
	let kuwait = findSpace("Kuwait")
	let smyrna = findSpace("Smyrna")
	let ruDiv1 = findPiece("RU DIV #1")
	let ruDiv2 = findPiece("RU DIV #2")

	makeAllSpacesApControlled(game)
	markAllSpacesRussianControlled(game)
	game.pieces[ruDiv1] = fao
	game.pieces[ruDiv2] = kuwait

	game = rules.action(game, AP_ROLE, "play_event", WARM_WATER_PORT)
	game = rules.action(game, AP_ROLE, "space", smyrna)

	expect(game.state).toBe("event_warm_water_port")
	expect(game.warm_water_port).toBeUndefined()
	expect(game.events["warm_water_port"]).toBeUndefined()
	expect(game.warm_water_port_options).toEqual([fao, kuwait])
})
