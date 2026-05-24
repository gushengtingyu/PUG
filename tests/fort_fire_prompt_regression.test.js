const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const AP = Engine.constants.AP
const CP = Engine.constants.CP
const CP_ROLE = rules.roles[1]

function setupEmptyKarsAttack(seed = 260524) {
	const game = setupGame(seed, "Historical", { no_supply_warnings: true })
	const kars = findSpace("Kars")
	const sarikamis = findSpace("Sarikamis")
	const attacker = findPieceByName("TU DIV #1")

	clearBoard(game)
	game.control[kars] = AP
	game.control[sarikamis] = CP
	game.forts = { destroyed: [], besieged: [kars], owner: {} }
	game.pieces[attacker] = sarikamis
	game.attack = {
		space: kars,
		pieces: [attacker],
		attacker: CP,
		defender: AP
	}

	return { game, kars }
}

test("confirm attack prompt includes intact empty fort fire", () => {
	const { game } = setupEmptyKarsAttack()
	game.active = CP
	game.state = "confirm_attack"

	const view = rules.view(game, CP_ROLE)

	expect(view.prompt).toBe("确认攻击: 2 (SCU) vs 3 (SCU)")
})

test("attack odds use the attack defender when active side has drifted", () => {
	const { game } = setupEmptyKarsAttack()
	game.active = AP

	expect(Engine.combat.fmt_attack_odds(game)).toBe("2 (SCU) vs 3 (SCU)")
})
