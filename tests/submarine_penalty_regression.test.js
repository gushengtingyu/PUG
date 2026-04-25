const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

const AP = rules.AP

function findSpace(name) {
	let s = data.spaces.findIndex((info, idx) => idx > 0 && info && info.name === name)
	if (s < 0) throw new Error(`Missing space: ${name}`)
	return s
}

function findPiece(name) {
	let p = data.pieces.findIndex((info, idx) => idx > 0 && info && info.name === name)
	if (p < 0) throw new Error(`Missing piece: ${name}`)
	return p
}

function createSubmarineGame() {
	let game = rules.setup(1, "Historical", { seed: 17 })
	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	game.control = []
	game.events = {}
	game.beachheads = []
	game.active = AP
	return game
}

test("German Subs applies the long-term +1 OP/+1 SR penalty to AP spaces tracing solely through the East Med or Aegean, including Gallipoli beachheads", () => {
	let game = createSubmarineGame()
	let lemnos = findSpace("Lemnos")
	let cyprus = findSpace("Cyprus")
	let gabaTepe = findSpace("Gaba Tepe")
	let apReserve = findSpace("AP Reserve")
	let brIX = findPiece("BR IX Corps")
	let brVIII = findPiece("BR VIII Corps")
	let brXVI = findPiece("BR XVI Corps")
	let anzAnzac = findPiece("ANZ ANZAC")

	game.pieces[brIX] = lemnos
	game.pieces[brVIII] = lemnos
	game.pieces[brXVI] = cyprus
	game.pieces[anzAnzac] = gabaTepe

	game.control[lemnos] = AP
	game.control[cyprus] = AP
	game.control[gabaTepe] = AP
	game.beachheads = [gabaTepe]
	game.events["german_subs"] = true

	expect(Engine.map.get_activation_cost_pair(game, lemnos)).toEqual({ move: 2, attack: 2 })
	expect(Engine.map.get_activation_cost_pair(game, gabaTepe)).toEqual({ move: 2, attack: 2 })
	expect(Engine.map.get_sr_cost(game, brIX, lemnos, apReserve, AP)).toBe(5)
	expect(Engine.map.get_activation_cost_pair(game, cyprus)).toEqual({ move: 2, attack: 2 })
	expect(Engine.map.get_sr_cost(game, brXVI, cyprus, apReserve, AP)).toBe(5)
})

test("Unrestricted Submarine Warfare applies the +1 OP/+1 SR penalty only to East Mediterranean AP spaces", () => {
	let game = createSubmarineGame()
	let lemnos = findSpace("Lemnos")
	let cyprus = findSpace("Cyprus")
	let apReserve = findSpace("AP Reserve")
	let brIX = findPiece("BR IX Corps")
	let brVIII = findPiece("BR VIII Corps")
	let brXVI = findPiece("BR XVI Corps")
	let brXX = findPiece("BR XX Corps")

	game.pieces[brIX] = lemnos
	game.pieces[brVIII] = lemnos
	game.pieces[brXVI] = cyprus
	game.pieces[brXX] = cyprus

	game.control[lemnos] = AP
	game.control[cyprus] = AP
	game.events["unrestricted_submarine_warfare"] = true

	expect(Engine.map.get_activation_cost_pair(game, cyprus)).toEqual({ move: 2, attack: 2 })
	expect(Engine.map.get_sr_cost(game, brXVI, cyprus, apReserve, AP)).toBe(5)

	expect(Engine.map.get_activation_cost_pair(game, lemnos)).toEqual({ move: 1, attack: 1 })
	expect(Engine.map.get_sr_cost(game, brIX, lemnos, apReserve, AP)).toBe(4)
})

test("East Mediterranean AP spaces pay +2 OP/+2 SR once both German Subs and Unrestricted Submarine Warfare are active", () => {
	let game = createSubmarineGame()
	let cyprus = findSpace("Cyprus")
	let apReserve = findSpace("AP Reserve")
	let brXVI = findPiece("BR XVI Corps")
	let brXX = findPiece("BR XX Corps")

	game.pieces[brXVI] = cyprus
	game.pieces[brXX] = cyprus
	game.control[cyprus] = AP
	game.events["german_subs"] = true
	game.events["unrestricted_submarine_warfare"] = true

	expect(Engine.map.get_activation_cost_pair(game, cyprus)).toEqual({ move: 3, attack: 3 })
	expect(Engine.map.get_sr_cost(game, brXVI, cyprus, apReserve, AP)).toBe(6)
})
