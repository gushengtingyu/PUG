const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

const AP_ROLE = rules.roles[0]

function assert(condition, message) {
	if (!condition) {
		throw new Error(message)
	}
}

function findSpace(name) {
	return data.spaces.findIndex((space) => space && space.name === name)
}

function clearSpace(game, space) {
	let eliminated = rules.get_eliminated_box(rules.AP)
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

function pieceCost(p) {
	return Engine.game_utils.is_lcu(p) ? 3 : 1
}

function isBlueVerdunCandidate(p) {
	let piece = data.pieces[p]
	if (!piece || piece.faction !== "ap" || piece.type === "hq") return false
	if (piece.nation !== "br" && piece.nation !== "anz" && piece.nation !== "in") return false
	let badge = Engine.game_utils.get_piece_badge(p)
	if (badge !== "blue") return false
	if (badge === "cavalry" || badge === "camel" || badge === "armored") return false
	return true
}

function findVerdunSubset(target) {
	let need = Math.ceil(target / 2)
	let candidates = []
	for (let p = 1; p < data.pieces.length; p++) {
		if (isBlueVerdunCandidate(p)) candidates.push(p)
	}

	let best = null
	function search(index, picked, total, br) {
		if (total >= target && br >= need) {
			if (!best || picked.length < best.length) best = picked.slice()
			return
		}
		if (index >= candidates.length) return
		if (best && picked.length >= best.length) return

		let p = candidates[index]
		let cost = pieceCost(p)
		let isBr = data.pieces[p].nation === "br" ? cost : 0

		picked.push(p)
		search(index + 1, picked, total + cost, br + isBr)
		picked.pop()

		search(index + 1, picked, total, br)
	}

	search(0, [], 0, 0)
	assert(best && best.length > 0, `Expected to find a Verdun subset for target ${target}.`)
	return best
}

function prepareVerdunEvent(game) {
	game.active = rules.AP
	game.events = game.events || {}
	game.events.verdun = true
	game.state = "event_verdun_remove"
	delete game.event_ctx
}

function placePiecesForVerdun(game, pieces) {
	let portSaid = findSpace("Port Said")
	assert(portSaid > 0, "Expected to find Port Said.")
	clearSpace(game, portSaid)
	for (let p of pieces) {
		game.pieces[p] = portSaid
	}
	return portSaid
}

function movePieceToRemovedBox(game, p, removedBox) {
	let view = rules.view(game, AP_ROLE)
	let selectable = (view.actions && view.actions.piece) || []
	assert(selectable.includes(p), `Expected piece ${p} to be selectable for Verdun.`)

	game = rules.action(game, AP_ROLE, "piece", p)
	assert(game.pieces[p] === removedBox, "Expected Verdun-selected unit to move to the removed box.")
	return game
}

function test_verdun_partial_resolution_uses_removed_box_and_confirm_only() {
	console.log("Running: test_verdun_partial_resolution_uses_removed_box_and_confirm_only")
	let game = rules.setup(201, "Historical", { seed: 42 })
	ensureCommonState(game)
	prepareVerdunEvent(game)

	let selected = findVerdunSubset(2)
	let removedBox = rules.get_removed_box(rules.AP)
	let peBox = rules.get_permanently_eliminated_box(rules.AP)
	placePiecesForVerdun(game, selected)

	let initialVp = game.vp
	let initialView = rules.view(game, AP_ROLE)
	assert(initialView.actions && initialView.actions.confirm, "Expected Verdun prompt to offer confirm.")
	assert(!initialView.actions.vp, "Expected Verdun prompt to remove the vp action.")
	assert(!initialView.actions.negate_one, "Expected Verdun prompt to remove partial-removal actions.")
	assert(!initialView.actions.negate_all, "Expected Verdun prompt to remove full-removal actions.")
	assert(!initialView.actions.done, "Expected Verdun prompt to resolve with confirm instead of done.")

	for (let p of selected) {
		game = movePieceToRemovedBox(game, p, removedBox)
	}

	for (let p of selected) {
		assert(game.pieces[p] === removedBox, "Expected selected Verdun units to stay in the removed box before confirmation.")
		assert(game.pieces[p] !== peBox, "Expected Verdun units not to enter the permanently eliminated box.")
	}

	game = rules.action(game, AP_ROLE, "confirm")
	assert(game.vp === initialVp + 1, "Expected Verdun partial removal to reduce the award to +1 VP.")
	assert(game.state === "confirm_event", "Expected Verdun to finish after confirmation.")
	for (let p of selected) {
		assert(game.pieces[p] === removedBox, "Expected Verdun-removed units to remain in the removed box after resolution.")
	}
}

function test_verdun_full_resolution_auto_calculates_zero_vp() {
	console.log("Running: test_verdun_full_resolution_auto_calculates_zero_vp")
	let game = rules.setup(202, "Historical", { seed: 42 })
	ensureCommonState(game)
	prepareVerdunEvent(game)

	let selected = findVerdunSubset(4)
	let removedBox = rules.get_removed_box(rules.AP)
	placePiecesForVerdun(game, selected)

	let initialVp = game.vp
	for (let p of selected) {
		game = movePieceToRemovedBox(game, p, removedBox)
	}

	game = rules.action(game, AP_ROLE, "confirm")
	assert(game.vp === initialVp, "Expected Verdun full removal to cancel the entire VP award.")
	assert(game.state === "confirm_event", "Expected Verdun full removal to finish after confirmation.")
}

try {
	test_verdun_partial_resolution_uses_removed_box_and_confirm_only()
	test_verdun_full_resolution_auto_calculates_zero_vp()
	console.log("Verdun regression tests completed.")
} catch (e) {
	console.error("Verdun regression test failed:", e)
	process.exit(1)
}
