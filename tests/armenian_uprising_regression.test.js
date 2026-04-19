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

test("Armenian Uprising event and Van control behavior", () => {
	let game = rules.setup(101, "Historical", { seed: 42 })
	ensureCommonState(game)

	let van = findSpace("Van")
	let armenian = findPieceIndex((piece) => piece.name === "Armenian Uprising")
	let event = Engine.events.get_event_by_id(32)
	expect(van).toBeGreaterThan(0)
	expect(armenian).toBeGreaterThan(0)
	expect(event && typeof event.handler === "function").toBe(true)

	let initialEventVp = game.vp
	event.handler(game)
	expect(game.vp).toBe(initialEventVp - 1)
	expect(game.events["armenian_uprising"]).toBe(true)

	clearSpace(game, van)
	game.pieces[armenian] = van

	let initialVp = game.vp
	let initialRuVp = game.russian_vp
	Engine.sync_neutral_vp_state(game, van)

	expect(game.vp).toBe(initialVp)
	expect(game.russian_vp).toBe(initialRuVp)
	expect((game.partial_cp_control_markers || []).includes(van)).toBe(false)
	expect((game.ru_control_markers || []).includes(van)).toBe(false)

	game.pieces[armenian] = rules.get_eliminated_box(rules.AP)
	Engine.sync_neutral_vp_state(game, van)

	expect(game.vp).toBe(initialVp)
	expect(game.russian_vp).toBe(initialRuVp)
	expect((game.partial_cp_control_markers || []).includes(van)).toBe(false)
	expect((game.ru_control_markers || []).includes(van)).toBe(false)
})

test("No quell uprising shortcut in move phase", () => {
	let game = rules.setup(102, "Historical", { seed: 42 })
	ensureCommonState(game)

	let target = findSpace("Yozgat")
	let cpPiece = findPieceIndex((piece) => piece.faction === "cp" && piece.mf > 0 && piece.type !== "hq")
	expect(target).toBeGreaterThan(0)
	expect(cpPiece).toBeGreaterThan(0)

	clearSpace(game, target)
	game.active = rules.CP
	game.state = "choose_move_action"
	game.where = target
	game.pieces[cpPiece] = target
	game.activated.move = [target]
	game.armenian_uprising_markers = [target]

	let view = rules.view(game, CP_ROLE)
	expect(view.actions && view.actions.quell_uprising).toBeFalsy()
	expect(game.state).toBe("choose_move_action")
})

test("No quell uprising shortcut in attack phase", () => {
	let game = rules.setup(103, "Historical", { seed: 42 })
	ensureCommonState(game)

	let target = findSpace("Sivas")
	let cpPiece = findPieceIndex((piece) => piece.faction === "cp" && piece.type !== "hq")
	expect(target).toBeGreaterThan(0)
	expect(cpPiece).toBeGreaterThan(0)

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
	expect(view.actions && view.actions.quell_uprising).toBeFalsy()
	expect(game.state).toBe("end_operations")
})
