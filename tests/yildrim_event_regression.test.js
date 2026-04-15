const rules = require("../rules.js")
const data = require("../data.js")

const CP_ROLE = rules.roles[1]

function assert(condition, message) {
	if (!condition) {
		throw new Error(message)
	}
}

function findPiece(name) {
	return data.pieces.findIndex((p) => p && p.name === name)
}

function prepareYildrimEvent(game) {
	game.active = rules.CP
	game.events = game.events || {}
	game.events.yildrim = true
	game.state = "event_place_reinforcements"
	game.event_ctx = {
		key: "yildrim",
		data: {
			reinf_to_place: ["GE Yildrim #1", "GE Yildrim #2", "GE Yildrim #3"],
			reinf_placement: "map",
			reinf_logic: "is_yildrim_rein",
			reinf_next_state: "event_yildrim_falkenhayn"
		}
	}
}

function findEmptyCpMapSpace(game, forbidden = []) {
	let blocked = new Set(forbidden)
	for (let s = 1; s < data.spaces.length; s++) {
		let space = data.spaces[s]
		if (!space) continue
		if (blocked.has(s)) continue
		if ((space.type || "").includes("Box")) continue
		if (!rules.is_controlled_by(game, s, rules.CP)) continue
		if (rules.get_pieces_in_space(game, s).length > 0) continue
		return s
	}
	return -1
}

function placeYildrimDivisions(game) {
	let chosen = []
	for (let i = 0; i < 3; i++) {
		let view = rules.view(game, CP_ROLE)
		let spaces = (view.actions && view.actions.space) || []
		assert(spaces.length > 0, `Expected reinforcement options for Yildrim step ${i + 1}.`)
		let target = spaces.find((s) => !chosen.includes(s))
		assert(target !== undefined, `Expected a distinct reinforcement space for Yildrim step ${i + 1}.`)
		chosen.push(target)
		game = rules.action(game, CP_ROLE, "space", target)
	}
	return { game, chosen }
}

function test_yildrim_can_move_falkenhayn() {
	console.log("Running: test_yildrim_can_move_falkenhayn")
	let game = rules.setup(1, "Historical", { seed: 42 })
	prepareYildrimEvent(game)

	let initialView = rules.view(game, CP_ROLE)
	let initialSpaces = (initialView.actions && initialView.actions.space) || []
	assert(initialSpaces.length >= 3, "Expected at least three legal Yildrim reinforcement spaces.")

	let falkenhayn = findPiece("GE Falkenhayn HQ")
	let startSpace = findEmptyCpMapSpace(game, initialSpaces)
	assert(startSpace > 0, "Expected an empty CP-controlled map space for Falkenhayn.")
	game.pieces[falkenhayn] = startSpace

	let result = placeYildrimDivisions(game)
	game = result.game
	assert(game.state === "event_yildrim_falkenhayn", "Expected Yildrim to enter the Falkenhayn follow-up state.")

	let moveView = rules.view(game, CP_ROLE)
	let destinations = (moveView.actions && moveView.actions.space) || []
	assert(destinations.length > 0, "Expected Falkenhayn to have at least one legal Yildrim destination.")
	let target = destinations[0]

	game = rules.action(game, CP_ROLE, "space", target)
	assert(game.pieces[falkenhayn] === target, "Expected Falkenhayn HQ to move to the selected Yildrim space.")
	assert(game.state === "confirm_event", "Expected Yildrim to finish after moving Falkenhayn.")
}

function test_yildrim_ends_when_falkenhayn_eliminated() {
	console.log("Running: test_yildrim_ends_when_falkenhayn_eliminated")
	let game = rules.setup(2, "Historical", { seed: 42 })
	prepareYildrimEvent(game)

	let falkenhayn = findPiece("GE Falkenhayn HQ")
	game.pieces[falkenhayn] = rules.get_eliminated_box(rules.CP)

	let result = placeYildrimDivisions(game)
	game = result.game
	assert(game.state === "confirm_event", "Expected Yildrim to end immediately when Falkenhayn is eliminated.")
	assert(!game.event_ctx, "Expected event context to clear when Yildrim auto-finishes.")
}

try {
	test_yildrim_can_move_falkenhayn()
	test_yildrim_ends_when_falkenhayn_eliminated()
	console.log("Yildrim regression tests completed.")
} catch (e) {
	console.error("Yildrim regression test failed:", e)
	process.exit(1)
}
