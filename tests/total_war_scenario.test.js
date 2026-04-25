const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

const { COMMITMENT_TOTAL } = Engine.constants

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`找不到单位 ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地区 ${name}`)
	return space
}

test("TOTAL WAR剧本从第6回合开始且只保留全面战争牌", () => {
	let game = rules.setup(2026042301, "TOTAL WAR", { seven_hand_size: false, no_supply_warnings: true })
	let apCards = [...game.hand_ap, ...game.deck_ap]
	let cpCards = [...game.hand_cp, ...game.deck_cp]

	expect(game.turn).toBe(6)
	expect(game.vp).toBe(9)
	expect(game.war_status_ap).toBe(14)
	expect(game.war_status_cp).toBe(14)
	expect(game.combined_war).toBe(28)
	expect(game.jihad).toBe(8)
	expect(game.war_commitment_ap).toBe(COMMITMENT_TOTAL)
	expect(game.war_commitment_cp).toBe(COMMITMENT_TOTAL)
	expect(game.hand_ap).toHaveLength(8)
	expect(game.hand_cp).toHaveLength(8)
	expect(apCards.every((id) => data.cards[id].commitment === COMMITMENT_TOTAL)).toBe(true)
	expect(cpCards.every((id) => data.cards[id].commitment === COMMITMENT_TOTAL)).toBe(true)
	expect(game.removed_ap).toHaveLength(34)
	expect(game.removed_cp).toHaveLength(34)
	expect(game.removed_ap.every((id) => data.cards[id].commitment !== COMMITMENT_TOTAL)).toBe(true)
	expect(game.removed_cp.every((id) => data.cards[id].commitment !== COMMITMENT_TOTAL)).toBe(true)

	expect(game.events["arab_revolt"]).toBe(true)
	expect(game.events["pan_turkism"]).toBe(true)
	expect(game.events["german_subs"]).toBe(true)
	expect(game.events["parvus_to_berlin"]).toBe(5)
	expect(game.events["russian_revolution_timer"]).toBe(9)
	expect(game.events["bulgaria"]).toBe(true)
	expect(game.events["romania"]).toBe(true)
	expect(game.entry_bu).toBe(true)
	expect(game.entry_ro).toBe(true)
	expect(game.pieces[findPiece("cp", "BU 3 Army")]).toBe(findSpace("Rustchuk"))
	expect(game.pieces[findPiece("ap", "RO 1 Army")]).toBe(findSpace("Craiova"))
	expect(game.pieces[findPiece("cp", "Combined BU/AH Div")]).toBe(findSpace("SOFIA"))
	expect(game.pieces[findPiece("ap", "RU Danube Army")]).toBe(findSpace("Odessa"))
	expect(game.pieces[findPiece("cp", "GE Schmettow")]).toBe(findSpace("Galicia"))
})
