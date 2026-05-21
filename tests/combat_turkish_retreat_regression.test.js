const rules = require("../rules.js")

const { findSpace, findPieceByName: findPiece } = require("./helpers.js")

const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]
const AP = rules.AP
const CP = rules.CP

test("retreat cannot choose fully stacked destination and SCU retreat failure is permanent elimination", () => {
	let game = rules.setup(1, "Historical", { seed: 42 })
	let athens = findSpace("ATHENS")
	let lamia = findSpace("Lamia")
	let apPermanentlyEliminatedBox = findSpace("AP Permanently Eliminated Box")
	let retreatingPiece = findPiece("GR DIV #1")

	// Fill Lamia to stacking limit (3 counted AP units).
	game.pieces[findPiece("RU DIV #10")] = lamia
	game.pieces[findPiece("RU DIV #9")] = lamia
	game.pieces[findPiece("SB DIV #5")] = lamia

	// Enter retreat selection state for the AP piece in Athens.
	game.active = AP
	game.state = "retreat"
	game.attack = { space: athens, attacker: rules.CP, defender: AP, pieces: [] }
	game.retreat_pieces = [retreatingPiece]
	game.retreat_space = athens
	game.retreat_from = athens
	game.retreat_distance = 1
	game.retreat_steps_left = { [retreatingPiece]: 1 }
	game.selected_piece = retreatingPiece
	game.retreated = []

	let view = rules.view(game, AP_ROLE)
	expect((view.actions.space || []).includes(lamia)).toBe(false)
	expect(view.actions.eliminate_retreating).toBe(1)

	rules.action(game, AP_ROLE, "eliminate_retreating")
	expect(game.pieces[retreatingPiece]).toBe(apPermanentlyEliminatedBox)
})

test("replacement SCU retreat failure permanently eliminates the original LCU too", () => {
	let game = rules.setup(1, "Historical", { seed: 42 })
	let athens = findSpace("ATHENS")
	let lamia = findSpace("Lamia")
	let apEliminatedBox = findSpace("AP Eliminated")
	let apPermanentlyEliminatedBox = findSpace("AP Permanently Eliminated Box")
	let replacedLcu = findPiece("RU I Caucasian")
	let replacementScu = findPiece("RU DIV #1")

	game.pieces[findPiece("RU DIV #10")] = lamia
	game.pieces[findPiece("RU DIV #9")] = lamia
	game.pieces[findPiece("SB DIV #5")] = lamia
	game.pieces[replacedLcu] = apEliminatedBox
	game.pieces[replacementScu] = athens

	game.active = AP
	game.state = "retreat"
	game.attack = {
		space: athens,
		attacker: rules.CP,
		defender: AP,
		pieces: [replacementScu],
		lcu_replacement_map: { [replacedLcu]: replacementScu }
	}
	game.retreat_pieces = [replacementScu]
	game.retreat_space = athens
	game.retreat_from = athens
	game.retreat_distance = 1
	game.retreat_steps_left = { [replacementScu]: 1 }
	game.selected_piece = replacementScu
	game.retreated = []

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.eliminate_retreating).toBe(1)

	rules.action(game, AP_ROLE, "eliminate_retreating")
	expect(game.pieces[replacementScu]).toBe(apPermanentlyEliminatedBox)
	expect(game.pieces[replacedLcu]).toBe(apPermanentlyEliminatedBox)
})

test("Turkish Withdrawal SCU retreat failure is permanent elimination", () => {
	let game = rules.setup(1, "Historical", { seed: 42 })
	let athens = findSpace("ATHENS")
	let lamia = findSpace("Lamia")
	let cpPermanentlyEliminatedBox = findSpace("CP Permanently Eliminated Box")
	let retreatingPiece = findPiece("TU DIV #1")

	game.pieces[findPiece("TU DIV #2")] = lamia
	game.pieces[findPiece("TU DIV #3")] = lamia
	game.pieces[findPiece("TU DIV #4")] = lamia
	game.pieces[retreatingPiece] = athens

	game.active = CP
	game.state = "turkish_retreat"
	game.attack = { space: athens, attacker: AP, defender: CP, pieces: [] }
	game.battle_result = { turkish_retreat: true, no_advance: false }
	game.turkish_retreat_pending = true
	game.turkish_retreat_space = athens
	game.turkish_retreat_mandatory = [retreatingPiece]
	game.turkish_retreat_optional = []
	game.retreat_steps_left = { [retreatingPiece]: 1 }
	game.selected_piece = retreatingPiece
	game.retreated = []

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.eliminate_retreating).toBe(1)

	rules.action(game, CP_ROLE, "eliminate_retreating")
	expect(game.pieces[retreatingPiece]).toBe(cpPermanentlyEliminatedBox)
})
