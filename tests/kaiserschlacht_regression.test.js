const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function findPieces(predicate, label) {
	let pieces = []
	for (let p = 1; p < Engine.data.pieces.length; p++) {
		let info = Engine.data.pieces[p]
		if (info && predicate(info, p)) pieces.push(p)
	}
	if (pieces.length === 0) throw new Error(`Could not find piece: ${label}`)
	return pieces
}

function moveToApReserve(game, pieces) {
	let reserve = Engine.game_utils.get_reserve_box(AP)
	for (let p of pieces) {
		game.pieces[p] = reserve
	}
}

test("Kaiserschlacht allows over-removal after reaching the 0 VP threshold", () => {
	let game = setupGame(2026042305)
	let event = Engine.events.get_event_by_id(105)
	let brElites = findPieces(
		(info, p) =>
			info.faction === AP &&
			info.nation === "br" &&
			info.piece_class === "SCU" &&
			Engine.game_utils.get_piece_badge(p) === "blue",
		"BR elite SCUs"
	).slice(0, 2)
	let brRegular = findPieces(
		(info, p) =>
			info.faction === AP &&
			info.nation === "br" &&
			info.piece_class === "SCU" &&
			Engine.game_utils.get_piece_badge(p) === "infantry",
		"BR regular SCU"
	)[0]
	let inRegular = findPieces(
		(info, p) =>
			info.faction === AP &&
			info.nation === "in" &&
			info.piece_class === "SCU" &&
			Engine.game_utils.get_piece_badge(p) === "infantry",
		"IN regular SCU"
	)[0]

	moveToApReserve(game, [...brElites, brRegular, inRegular])

	let initialVp = game.vp
	event.handler(game)

	let initialView = rules.view(game, AP_ROLE)
	expect(initialView.actions.piece).toEqual(expect.arrayContaining([...brElites, brRegular, inRegular]))

	for (let p of [...brElites, brRegular]) {
		rules.action(game, AP_ROLE, "piece", p)
	}

	let thresholdView = rules.view(game, AP_ROLE)
	expect(thresholdView.actions.piece).toContain(inRegular)

	rules.action(game, AP_ROLE, "piece", inRegular)
	rules.action(game, AP_ROLE, "confirm")

	expect(game.vp).toBe(initialVp)
	expect(Engine.game_utils.is_removed(game, inRegular)).toBe(true)
})

test("Verdun allows over-removal after reaching the 0 VP threshold", () => {
	let game = setupGame(2026042308)
	let event = Engine.events.get_event_by_id(87)
	let brElites = findPieces(
		(info, p) =>
			info.faction === AP &&
			info.nation === "br" &&
			info.piece_class === "SCU" &&
			Engine.game_utils.get_piece_badge(p) === "blue",
		"BR elite SCUs"
	).slice(0, 2)
	let brRegular = findPieces(
		(info, p) =>
			info.faction === AP &&
			info.nation === "br" &&
			info.piece_class === "SCU" &&
			Engine.game_utils.get_piece_badge(p) === "infantry",
		"BR regular SCU"
	)[0]
	let inRegulars = findPieces(
		(info, p) =>
			info.faction === AP &&
			info.nation === "in" &&
			info.piece_class === "SCU" &&
			Engine.game_utils.get_piece_badge(p) === "infantry",
		"IN regular SCUs"
	).slice(0, 2)

	moveToApReserve(game, [...brElites, brRegular, ...inRegulars])

	let initialVp = game.vp
	event.handler(game)

	for (let p of [...brElites, brRegular, inRegulars[0]]) {
		rules.action(game, AP_ROLE, "piece", p)
	}

	let thresholdView = rules.view(game, AP_ROLE)
	expect(thresholdView.actions.piece).toContain(inRegulars[1])

	rules.action(game, AP_ROLE, "piece", inRegulars[1])
	rules.action(game, AP_ROLE, "confirm")

	expect(game.vp).toBe(initialVp)
	expect(Engine.game_utils.is_removed(game, inRegulars[1])).toBe(true)
})

test("Verdun does not block GE RP, but Kaiserschlacht does", () => {
	let verdunGame = setupGame(2026042306)
	let verdunEvent = Engine.events.get_event_by_id(87)

	verdunGame.active = CP
	verdunGame.rp_cp.ge = 1
	verdunEvent.handler(verdunGame)
	verdunGame.active = CP
	Engine.game_utils.add_rps(verdunGame, { rp_ge: 2 }, () => {})
	expect(verdunGame.rp_cp.ge).toBe(3)

	let kaiserschlachtGame = setupGame(2026042307)
	let kaiserschlachtEvent = Engine.events.get_event_by_id(105)

	kaiserschlachtGame.active = CP
	kaiserschlachtGame.rp_cp.ge = 1
	kaiserschlachtEvent.handler(kaiserschlachtGame)
	expect(kaiserschlachtGame.rp_cp.ge).toBe(0)

	kaiserschlachtGame.active = CP
	Engine.game_utils.add_rps(kaiserschlachtGame, { rp_ge: 2 }, () => {})
	expect(kaiserschlachtGame.rp_cp.ge).toBe(0)
})
