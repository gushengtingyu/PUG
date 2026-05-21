const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { AP, CP } = Engine.constants

const CP_ROLE = rules.roles[1]
const RUPEL_CARD = 72

function prepareRupelGame(seed) {
	let game = setupGame(seed, "Historical")
	let salonika = findSpace("Salonika")
	let brDiv = findPiece(AP, "BR DIV #1")

	game.pieces[brDiv] = salonika
	game.active = CP
	game.state = "play_card"
	if (!game.hand_cp.includes(RUPEL_CARD)) game.hand_cp.push(RUPEL_CARD)

	return game
}

test("Treachery at Fort Rupel moving Greek units to Athens does not bring Greece into the war", () => {
	let game = prepareRupelGame(2026050801)
	let athens = findSpace("ATHENS")

	expect(Engine.events.get_event_by_id(RUPEL_CARD).can_play(game)).toBe(true)

	game = rules.action(game, CP_ROLE, "play_event", RUPEL_CARD)

	expect(game.state).toBe("event_rupel_move_greek_units")
	expect(rules.view(game, CP_ROLE).actions.space || []).toContain(athens)

	game = rules.action(game, CP_ROLE, "space", athens)

	expect(Engine.neutral.get_greece_faction(game)).toBe(null)
	expect(Engine.neutral.is_greece_neutral(game)).toBe(true)
	expect(game.state).toBe("event_rupel_advance_cp_units")

	game = rules.action(game, CP_ROLE, "done")

	expect(game.state).toBe("confirm_event")
	expect(Engine.neutral.get_greece_faction(game)).toBe(null)
	expect(Engine.neutral.is_greece_neutral(game)).toBe(true)
})

test("Treachery at Fort Rupel suppresses Greek entry triggers while the event is resolving", () => {
	let game = prepareRupelGame(2026050803)
	let athens = findSpace("ATHENS")
	let logs = []

	game = rules.action(game, CP_ROLE, "play_event", RUPEL_CARD)

	expect(game.event_ctx.key).toBe("rupel")
	expect(Engine.neutral.trigger_greece_entry(game, athens, AP, "Rupel neutrality exemption", (msg) => logs.push(msg))).toBe(false)
	expect(logs).toEqual([])
	expect(Engine.neutral.get_greece_faction(game)).toBe(null)
	expect(Engine.neutral.is_greece_neutral(game)).toBe(true)
})

test("Treachery at Fort Rupel lets CP units adjacent to Doiran or Ft. Rupel choose an adjacent target", () => {
	let game = prepareRupelGame(2026050802)
	let lamia = findSpace("Lamia")
	let doiran = findSpace("Doiran")
	let ftRupel = findSpace("Ft. Rupel")
	let strumica = findSpace("Strumica")
	let veles = findSpace("Veles")
	let xanthi = findSpace("Xanthi")
	let strumicaUnit = findPiece(CP, "TU DIV #1")
	let velesUnit = findPiece(CP, "TU DIV #2")
	let xanthiUnit = findPiece(CP, "TU DIV #3")

	game.pieces[strumicaUnit] = strumica
	game.pieces[velesUnit] = veles
	game.pieces[xanthiUnit] = xanthi

	expect(game.trenches_2).toContain(doiran)

	game = rules.action(game, CP_ROLE, "play_event", RUPEL_CARD)
	game = rules.action(game, CP_ROLE, "space", lamia)

	expect(game.state).toBe("event_rupel_advance_cp_units")

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.piece || []).toEqual(expect.arrayContaining([strumicaUnit, velesUnit, xanthiUnit]))

	game = rules.action(game, CP_ROLE, "piece", xanthiUnit)
	view = rules.view(game, CP_ROLE)
	expect(view.actions.space || []).toContain(ftRupel)
	expect(view.actions.space || []).not.toContain(doiran)

	game = rules.action(game, CP_ROLE, "cancel")
	game = rules.action(game, CP_ROLE, "piece", strumicaUnit)
	view = rules.view(game, CP_ROLE)
	expect(view.actions.space || []).toEqual(expect.arrayContaining([doiran, ftRupel]))

	game = rules.action(game, CP_ROLE, "space", ftRupel)

	expect(game.pieces[strumicaUnit]).toBe(ftRupel)
	expect(Engine.map.get_space_controller(game, ftRupel)).toBe(CP)
	expect(game.forts.destroyed || []).not.toContain(ftRupel)
	expect(Engine.map.get_fort_owner(game, ftRupel)).toBe(CP)
	expect(Engine.map.has_undestroyed_fort(game, ftRupel, CP)).toBe(true)
	expect(Engine.map.has_undestroyed_fort(game, ftRupel, AP)).toBe(false)

	game = rules.action(game, CP_ROLE, "piece", velesUnit)
	view = rules.view(game, CP_ROLE)
	expect(view.actions.space || []).toContain(doiran)
	expect(view.actions.space || []).not.toContain(ftRupel)

	game = rules.action(game, CP_ROLE, "space", doiran)

	expect(game.pieces[velesUnit]).toBe(doiran)
	expect(Engine.map.get_space_controller(game, doiran)).toBe(CP)
	expect(game.trenches_2).toContain(doiran)
	expect(Engine.game_utils.has_trench(game, doiran)).toBe(2)
	expect(Engine.game_utils.get_trench_owner(game, doiran)).toBe(CP)
})
