const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const data = require("../data.js")

const { setupGame, findCpPiece, findSpace } = require("./helpers.js")

const { CP } = Engine.constants
const eventStates = Engine.event_states.states

function createResultStub() {
	return {
		actions: {},
		prompt(value) {
			this.promptText = value
		},
		piece(p) {
			if (!this.actions.piece) this.actions.piece = []
			this.actions.piece.push(p)
		},
		space(s) {
			if (!this.actions.space) this.actions.space = []
			this.actions.space.push(s)
		},
		action(name) {
			this.actions[name] = 1
		},
		who() {},
		where() {}
	}
}

function prepareEnverFalkenhaynState(game, event = {}) {
	game.active = CP
	game.state = "event_enver_falkenhayn_sr"
	game.event_ctx = {
		key: "enver_falkenhayn_summit",
		data: {
			sr_points: 8,
			moved: [],
			...event
		}
	}
	return game.event_ctx.data
}

function getTurkishLcuIds() {
	const ids = []
	for (let p = 1; p < data.pieces.length; p++) {
		const info = data.pieces[p]
		if (info && info.nation === "tu" && info.piece_class === "LCU") {
			ids.push(p)
		}
	}
	return ids
}

test("Enver-Falkenhayn Summit SR prompt does not call a missing rules helper", () => {
	let game = setupGame(2026042702, "Historical", { no_supply_warnings: true })

	prepareEnverFalkenhaynState(game)

	let res = createResultStub()
	eventStates.event_enver_falkenhayn_sr.prompt({ game, res, rules })

	expect(res.actions).toBeTruthy()
})

test("Enver-Falkenhayn Summit allows a TU-A LCU to satisfy the Galicia requirement", () => {
	let game = setupGame(2026042703, "Historical", { no_supply_warnings: true })
	let hermannstadt = findSpace("Hermannstadt")
	let galicia = findSpace("Galicia")
	let tuaLcu = findCpPiece("TU-A VI Corps")
	let event = prepareEnverFalkenhaynState(game, {
		moved: getTurkishLcuIds()
	})

	game.pieces[tuaLcu] = hermannstadt
	game.sr_piece = tuaLcu

	let res = createResultStub()
	eventStates.event_enver_falkenhayn_sr.prompt({ game, res, rules })

	expect(event.galicia_lcu_moved).toBeFalsy()
	expect(res.actions.space).toContain(galicia)
})

test("Enver-Falkenhayn Summit does not allow a second TU-A LCU into Galicia", () => {
	let game = setupGame(2026042704, "Historical", { no_supply_warnings: true })
	let hermannstadt = findSpace("Hermannstadt")
	let galicia = findSpace("Galicia")
	let tuaLcu = findCpPiece("TU-A VI Corps")
	prepareEnverFalkenhaynState(game, {
		galicia_lcu_moved: true
	})

	game.pieces[tuaLcu] = hermannstadt
	game.sr_piece = tuaLcu

	let res = createResultStub()
	eventStates.event_enver_falkenhayn_sr.prompt({ game, res, rules })

	expect(res.actions.space || []).not.toContain(galicia)
})

test("Enver-Falkenhayn Summit prompt avoids repeated global SR destination scans", () => {
	let game = setupGame(2026042705, "Historical", { no_supply_warnings: true })
	prepareEnverFalkenhaynState(game)
	let calls = 0
	const original = Engine.map.get_sr_destinations
	Engine.map.get_sr_destinations = function (...args) {
		calls += 1
		return original.apply(this, args)
	}

	try {
		let res = createResultStub()
		eventStates.event_enver_falkenhayn_sr.prompt({ game, res, rules })
		expect(res.actions).toBeTruthy()
		expect(calls).toBeLessThan(100)
	} finally {
		Engine.map.get_sr_destinations = original
	}
})
