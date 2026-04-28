const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findPiece, findSpace, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const CP_ROLE = rules.roles[1]

function createSenussiAttackGame() {
	let game = setupGame(2026042804, "Historical", { no_supply_warnings: true })
	let senussi = findPiece(CP, "Senussi #1")
	let defender = findPiece(AP, "BR DIV #1")
	let bahariya = findSpace("Bahariya Oasis")
	let faiyum = findSpace("Faiyum")

	clearBoard(game)
	game.pieces[senussi] = bahariya
	game.pieces[defender] = faiyum
	game.active = CP
	game.state = "activate_spaces"
	game.ops = 1
	game.card_ops = 1
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = {}
	game.attacked = []
	game.retreated = []
	delete game.attack
	delete game.attack_eligibility_cache

	return { game, senussi, bahariya, faiyum }
}

test("Senussi tribes can activate and attack across s-only connections", () => {
	let { game, senussi, bahariya, faiyum } = createSenussiAttackGame()

	let activationView = rules.view(game, CP_ROLE)
	expect(activationView.actions.activate_attack || []).toContain(bahariya)

	rules.action(game, CP_ROLE, "activate_attack", bahariya)
	expect(game.state).toBe("attack")

	let attackView = rules.view(game, CP_ROLE)
	expect(attackView.actions.piece || []).toContain(senussi)

	rules.action(game, CP_ROLE, "piece", senussi)
	let targetView = rules.view(game, CP_ROLE)
	expect(targetView.actions.space || []).toContain(faiyum)
})
