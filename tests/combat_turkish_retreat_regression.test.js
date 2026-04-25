const rules = require("../rules.js")
const data = require("../data.js")

const AP_ROLE = rules.roles[0]
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

test("retreat cannot choose fully stacked destination and SCU retreat failure is normal elimination", () => {
	let game = rules.setup(1, "Historical", { seed: 42 })
	let athens = findSpace("ATHENS")
	let lamia = findSpace("Lamia")
	let apEliminatedBox = findSpace("AP Eliminated")
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
	expect(game.pieces[retreatingPiece]).toBe(apEliminatedBox)
})
