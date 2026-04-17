const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function assert(condition, message) {
	if (!condition) {
		throw new Error(message)
	}
}

function findSpace(name) {
	return data.spaces.findIndex((space) => space && space.name === name)
}

function findPieceIndex(predicate) {
	return data.pieces.findIndex((piece, index) => index > 0 && piece && predicate(piece))
}

function clearSpace(game, space) {
	let eliminated = rules.get_eliminated_box(rules.CP)
	for (let p of rules.get_pieces_in_space(game, space)) {
		game.pieces[p] = eliminated
	}
}

function ensureCommonState(game) {
	game.moved = game.moved || []
	game.attacked = game.attacked || []
	game.reduced = game.reduced || []
	game.activated = game.activated || { move: [], attack: [] }
}

function test_armenian_event_and_van_control_behavior() {
	console.log("Running: test_armenian_event_and_van_control_behavior")
	let game = rules.setup(101, "Historical", { seed: 42 })
	ensureCommonState(game)

	let van = findSpace("Van")
	let armenian = findPieceIndex((piece) => piece.name === "Armenian Uprising")
	let event = Engine.events.get_event_by_id(32)
	assert(van > 0, "Expected to find Van.")
	assert(armenian > 0, "Expected to find Armenian Uprising piece.")
	assert(event && typeof event.handler === "function", "Expected Armenian Uprising event handler.")

	let initialEventVp = game.vp
	event.handler(game)
	assert(game.vp === initialEventVp - 1, "Expected Armenian Uprising event play to reduce VP by 1.")
	assert(game.events["armenian_uprising"], "Expected Armenian Uprising event flag to be set.")

	clearSpace(game, van)
	game.pieces[armenian] = van

	let initialVp = game.vp
	let initialRuVp = game.russian_vp
	Engine.sync_neutral_vp_state(game, van)

	assert(game.vp === initialVp, "Expected Armenian placement in Van not to change VP by itself.")
	assert(game.russian_vp === initialRuVp, "Expected Armenian placement in Van not to change Russian VP by itself.")
	assert(!(game.partial_cp_control_markers || []).includes(van), "Expected no CP partial-control marker in Van.")
	assert(!(game.ru_control_markers || []).includes(van), "Expected Van not to count as a Russian VP capture.")

	game.pieces[armenian] = rules.get_eliminated_box(rules.AP)
	Engine.sync_neutral_vp_state(game, van)

	assert(game.vp === initialVp, "Expected VP to revert when Armenian Uprising leaves Van.")
	assert(game.russian_vp === initialRuVp, "Expected Russian VP to revert when Armenian Uprising leaves Van.")
	assert(!(game.partial_cp_control_markers || []).includes(van), "Expected CP partial control marker to clear.")
	assert(!(game.ru_control_markers || []).includes(van), "Expected Russian VP marker to clear.")
}

function test_no_quell_uprising_shortcut_in_move_phase() {
	console.log("Running: test_no_quell_uprising_shortcut_in_move_phase")
	let game = rules.setup(102, "Historical", { seed: 42 })
	ensureCommonState(game)

	let target = findSpace("Yozgat")
	let cpPiece = findPieceIndex((piece) => piece.faction === "cp" && piece.mf > 0 && piece.type !== "hq")
	assert(target > 0, "Expected to find Yozgat.")
	assert(cpPiece > 0, "Expected a movable CP piece.")

	clearSpace(game, target)
	game.active = rules.CP
	game.state = "choose_move_action"
	game.where = target
	game.pieces[cpPiece] = target
	game.activated.move = [target]
	game.armenian_uprising_markers = [target]

	let view = rules.view(game, CP_ROLE)
	assert(!(view.actions && view.actions.quell_uprising), "Expected no dedicated quell_uprising move shortcut.")
	assert(game.state === "choose_move_action", "Expected move flow to stay in the normal action menu.")
}

function test_no_quell_uprising_shortcut_in_attack_phase() {
	console.log("Running: test_no_quell_uprising_shortcut_in_attack_phase")
	let game = rules.setup(103, "Historical", { seed: 42 })
	ensureCommonState(game)

	let target = findSpace("Sivas")
	let cpPiece = findPieceIndex((piece) => piece.faction === "cp" && piece.type !== "hq")
	assert(target > 0, "Expected to find Sivas.")
	assert(cpPiece > 0, "Expected a CP piece for combat quelling.")

	clearSpace(game, target)
	game.active = rules.CP
	game.state = "attack"
	game.where = -1
	game.attack = { pieces: [], space: -1 }
	game.eligible_attackers = []
	game.pieces[cpPiece] = target
	game.activated.attack = [target]
	game.armenian_uprising_markers = [target]

	let view = rules.view(game, CP_ROLE)
	assert(!(view.actions && view.actions.quell_uprising), "Expected no dedicated quell_uprising attack shortcut.")
	assert(game.state === "end_operations", "Expected combat flow to end when there are no legal attacks.")
}

try {
	test_armenian_event_and_van_control_behavior()
	test_no_quell_uprising_shortcut_in_move_phase()
	test_no_quell_uprising_shortcut_in_attack_phase()
	console.log("Armenian Uprising regression tests completed.")
} catch (e) {
	console.error("Armenian Uprising regression test failed:", e)
	process.exit(1)
}
