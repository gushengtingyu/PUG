const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame } = require("./helpers.js")

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

test("Enver-Falkenhayn Summit SR prompt does not call a missing rules helper", () => {
	let game = setupGame(2026042702, "Historical", { no_supply_warnings: true })

	game.active = CP
	game.state = "event_enver_falkenhayn_sr"
	game.event_ctx = {
		key: "enver_falkenhayn_summit",
		data: {
			sr_points: 8,
			moved: []
		}
	}

	let res = createResultStub()
	eventStates.event_enver_falkenhayn_sr.prompt({ game, res, rules })

	expect(res.actions).toBeTruthy()
})
