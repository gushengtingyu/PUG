const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { findSpace, findPieceByName: findPiece } = require("./helpers.js")

const AP_ROLE = rules.roles[0]
const AP = rules.AP
const CP = rules.CP

function createBlackSeaGame() {
	let game = rules.setup(1, "Historical", { seed: 42 })
	let odessa = findSpace("Odessa")
	let trabzon = findSpace("Trabzon")
	let erzurum = findSpace("Erzurum")
	let apReserve = findSpace("AP Reserve")
	let ruBlackSea = findPiece("RU Black Sea")
	let ruDiv3 = findPiece("RU DIV #3")

	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0

	game.pieces[ruBlackSea] = odessa
	game.pieces[ruDiv3] = apReserve
	game.control = []
	game.control[odessa] = AP
	game.control[trabzon] = CP
	game.forts = { destroyed: [] }
	game.events = { black_sea_marines_active: true }
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = {}
	game.moved = []
	game.attacked = []
	game.retreated = []
	game.ops = 1
	game.active = AP
	game.state = "activate_spaces"

	return { game, odessa, trabzon, erzurum, apReserve, ruBlackSea, ruDiv3 }
}

function executeBlackSeaInvasion(game, source, target, piece) {
	let activationView = rules.view(game, AP_ROLE)
	expect(activationView.actions.activate_attack || []).toContain(source)

	rules.action(game, AP_ROLE, "activate_attack", source)
	if (game.state === "activate_region_stack") {
		let regionView = rules.view(game, AP_ROLE)
		expect(regionView.actions.piece || []).toContain(piece)
		rules.action(game, AP_ROLE, "piece", piece)
		regionView = rules.view(game, AP_ROLE)
		expect(regionView.actions.confirm).toBeTruthy()
		rules.action(game, AP_ROLE, "confirm")
	}
	expect(game.state).toBe("attack")

	let attackView = rules.view(game, AP_ROLE)
	expect(attackView.actions.piece || []).toContain(piece)

	rules.action(game, AP_ROLE, "piece", piece)
	let targetView = rules.view(game, AP_ROLE)
	expect(targetView.actions.space || []).toContain(target)

	rules.action(game, AP_ROLE, "space", target)
	expect(game.state).toBe("confirm_attack")

	rules.action(game, AP_ROLE, "confirm")
}

test("RU Black Sea can launch its one-time amphibious invasion from a Black Sea port", () => {
	let { game, odessa, trabzon, ruBlackSea } = createBlackSeaGame()

	executeBlackSeaInvasion(game, odessa, trabzon, ruBlackSea)

	expect(["attack", "end_operations"]).toContain(game.state)
	expect(game.attack).toBeNull()
	expect(game.pieces[ruBlackSea]).toBe(trabzon)
	expect(game.attacked).toContain(ruBlackSea)
	expect(game.events.black_sea_marines_used).toBe(true)
	expect(game.events.black_sea_marines_active).toBeUndefined()
	expect(game.events.black_sea_marines_fort).toBe(trabzon)
	expect(Engine.map.is_besieged(game, trabzon)).toBe(true)
	expect(Engine.map.is_controlled_by(game, trabzon, CP)).toBe(true)
})

test("RU Black Sea counts as 3 SCUs only on its amphibious assault fort and enables RU SR there", () => {
	let { game, odessa, trabzon, erzurum, ruBlackSea, ruDiv3 } = createBlackSeaGame()

	executeBlackSeaInvasion(game, odessa, trabzon, ruBlackSea)

	expect(Engine.map.can_besiege(game, trabzon, [ruBlackSea])).toBe(true)
	expect(Engine.map.can_besiege(game, erzurum, [ruBlackSea])).toBe(false)
	expect(Engine.map.is_base_supply_source(game, trabzon, AP, "ru")).toBe(true)
	expect(Engine.map.get_supply_status(game, trabzon, AP, ruBlackSea)).toBe("FULL")
	expect(Engine.map.get_supply_trace_status_to_source(game, trabzon, AP, trabzon)).toBe("FULL")
	expect(Engine.map.get_sr_destinations(game, ruDiv3, AP)).toContain(trabzon)
	expect(Engine.map.get_sr_destinations(game, ruBlackSea, AP)).toContain(odessa)
	expect(Engine.combat.get_valid_retreat_spaces(game, ruBlackSea, [], 1)).toContain(odessa)

	game.pieces[ruDiv3] = trabzon
	expect(Engine.map.get_supply_status(game, trabzon, AP, ruDiv3)).toBe("FULL")
})

test("RU Black Sea amphibious invasion cannot be used a second time", () => {
	let { game, odessa, trabzon, ruBlackSea } = createBlackSeaGame()

	executeBlackSeaInvasion(game, odessa, trabzon, ruBlackSea)

	game.pieces[ruBlackSea] = odessa
	game.attacked = []
	game.activated = { move: [], attack: [] }
	game.activation_cost = {}
	game.moved = []
	game.ops = 1
	game.active = AP
	game.state = "activate_spaces"
	delete game.events.black_sea_marines_fort

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.activate_attack || []).not.toContain(odessa)
})
