const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP } = Engine.constants
const CP_ROLE = rules.roles[1]

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(predicate, label) {
	let piece = Engine.data.pieces.findIndex((info, idx) => idx > 0 && info && predicate(info, idx))
	if (piece < 0) throw new Error(`Could not find piece: ${label}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`Could not find space: ${name}`)
	return space
}

function getSerbianCandidate(excluded = []) {
	return findPiece(
		(info, idx) =>
			info.nation === "sb" &&
			(info.piece_class === "LCU" || info.piece_class === "SCU") &&
			info.type !== "hq" &&
			!excluded.includes(idx),
		"Serbian candidate"
	)
}

function isolateSerbianChoices(game, onMapPiece, reservePiece) {
	let eliminatedBox = rules.get_eliminated_box(AP)
	for (let p = 1; p < Engine.data.pieces.length; p++) {
		let info = Engine.data.pieces[p]
		if (!info || info.nation !== "sb") continue
		if (p === onMapPiece || p === reservePiece) continue
		game.pieces[p] = eliminatedBox
	}
}

test("APIS can target Serbian LCU on map and Serbian SCU in reserve, then removes the selected unit", () => {
	let game = setupGame(2026042305)
	let event = Engine.events.get_event_by_id(91)
	let belgrade = findSpace("BELGRADE")
	let apReserve = findSpace("AP Reserve")
	let removedBox = rules.get_removed_box(AP)
	let eliminatedBox = rules.get_eliminated_box(AP)
	let serbianLcu = getSerbianCandidate()
	let serbianScu = getSerbianCandidate([serbianLcu])

	isolateSerbianChoices(game, serbianLcu, serbianScu)
	game.pieces[serbianLcu] = belgrade
	game.pieces[serbianScu] = apReserve

	event.handler(game)

	let view = rules.view(game, CP_ROLE)
	let legalPieces = view.actions.piece || []

	expect(legalPieces).toEqual(expect.arrayContaining([serbianLcu, serbianScu]))
	expect(legalPieces).toHaveLength(2)

	game = rules.action(game, CP_ROLE, "piece", serbianLcu)

	expect(game.pieces[serbianLcu]).toBe(removedBox)
	expect(game.pieces[serbianLcu]).not.toBe(eliminatedBox)
	expect(game.pieces[serbianScu]).toBe(apReserve)
})
