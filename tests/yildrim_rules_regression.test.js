const rules = require("../rules.js")
const data = require("../data.js")

const CP_ROLE = rules.roles[1]

function assert(condition, message) {
	if (!condition) throw new Error(message)
}

function findPieceBy(predicate, message) {
	let piece = data.pieces.findIndex((info, idx) => idx > 0 && info && predicate(info))
	assert(piece >= 0, message)
	return piece
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

function getYildrimPieces() {
	return [
		findPieceBy((info) => info.name === "GE Yildrim #1", "Missing GE Yildrim #1"),
		findPieceBy((info) => info.name === "GE Yildrim #2", "Missing GE Yildrim #2"),
		findPieceBy((info) => info.name === "GE Yildrim #3", "Missing GE Yildrim #3")
	]
}

function getTurkishCombatUnit() {
	return findPieceBy(
		(info) =>
			(info.nation === "tu" || info.nation === "tua") &&
			info.type !== "hq" &&
			info.type !== "tribe" &&
			info.symbol !== "H",
		"Missing Turkish combat unit for activation test."
	)
}

function test_second_yildrim_can_stack_normally() {
	console.log("Running: test_second_yildrim_can_stack_normally")
	let game = rules.setup(11, "Historical", { seed: 42 })
	let [y1, y2] = getYildrimPieces()
	let target = findEmptyCpMapSpace(game)
	let start = findEmptyCpMapSpace(game, [target])
	assert(target > 0 && start > 0, "Expected two empty CP map spaces.")

	game.pieces[y1] = target
	game.pieces[y2] = start

	assert(rules.can_stack_end_in_space(game, target, [y2]), "Expected a second Yildrim to stack with the first one.")

	game.pieces[y2] = target
	assert(rules.get_stack_count(rules.get_pieces_in_space(game, target)) === 1, "Expected one of two Yildrims to be free for stacking.")
}

function test_only_first_yildrim_is_free_for_activation() {
	console.log("Running: test_only_first_yildrim_is_free_for_activation")
	let game = rules.setup(12, "Historical", { seed: 42 })
	let [y1, y2] = getYildrimPieces()
	let turkish = getTurkishCombatUnit()
	let target = findEmptyCpMapSpace(game)
	assert(target > 0, "Expected an empty CP map space for activation test.")

	game.active = rules.CP
	game.pieces[turkish] = target
	game.pieces[y1] = target

	assert(rules.get_activation_cost(target, "move") === 1, "Expected the first Yildrim to be free for activation.")

	game.pieces[y2] = target
	assert(rules.get_activation_cost(target, "move") === 2, "Expected an additional Yildrim to count as a German nationality for activation.")
}

function test_falkenhayn_can_move_to_double_yildrim_stack() {
	console.log("Running: test_falkenhayn_can_move_to_double_yildrim_stack")
	let game = rules.setup(13, "Historical", { seed: 42 })
	let [y1, y2] = getYildrimPieces()
	let falkenhayn = findPieceBy((info) => info.name === "GE Falkenhayn HQ", "Missing GE Falkenhayn HQ")
	let target = findEmptyCpMapSpace(game)
	let start = findEmptyCpMapSpace(game, [target])
	assert(target > 0 && start > 0, "Expected two empty CP map spaces for Falkenhayn event test.")

	game.active = rules.CP
	game.events = game.events || {}
	game.events.yildrim = true
	game.state = "event_yildrim_falkenhayn"
	game.event_ctx = { key: "yildrim", data: {} }
	game.pieces[y1] = target
	game.pieces[y2] = target
	game.pieces[falkenhayn] = start

	let view = rules.view(game, CP_ROLE)
	let destinations = (view.actions && view.actions.space) || []
	assert(destinations.includes(target), "Expected Falkenhayn to be allowed to move into a space containing two Yildrim divisions.")
}

try {
	test_second_yildrim_can_stack_normally()
	test_only_first_yildrim_is_free_for_activation()
	test_falkenhayn_can_move_to_double_yildrim_stack()
	console.log("Yildrim rules regression tests completed.")
} catch (e) {
	console.error("Yildrim rules regression test failed:", e)
	process.exit(1)
}
