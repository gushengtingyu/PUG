const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP } = Engine.constants

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`Missing space: ${name}`)
	return space
}

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`Missing piece: ${name}`)
	return piece
}

test("water crossing second fire reuses the original die roll", () => {
	let game = setupGame(2026042310)
	let cyprus = findSpace("Cyprus")
	let toHaifa = findSpace("To Haifa")
	let haifa = findSpace("Haifa")
	let attacker = findPiece(AP, "BR DIV #4")
	let defender = findPiece(CP, "TU DIV #8")

	for (let p = 0; p < game.pieces.length; p++) {
		if ([cyprus, toHaifa, haifa].includes(game.pieces[p])) game.pieces[p] = 0
	}

	game.events.egyptian_coup = true
	game.control[cyprus] = AP
	game.beachheads = [toHaifa]
	game.reduced = []
	game.retreated = []
	game.action_state = {}
	game.attack = {
		space: haifa,
		pieces: [attacker],
		attacker: AP,
		defender: CP
	}
	game.active = AP
	game.pieces[attacker] = toHaifa
	game.pieces[defender] = haifa

	Engine.combat.resolve_battle_sequence(game, { log: () => {} })

	expect(game.attack.second_fire).toBe("attacker")
	expect(game.battle_result.def_fire_first).toBe(true)
	expect(game.battle_result.att_roll).toBeGreaterThanOrEqual(1)
	expect(game.battle_result.att_roll).toBeLessThanOrEqual(6)

	let seedAfterInitialFire = game.seed
	Engine.combat.apply_losses(game, [attacker], game.attack.attacker_losses)
	game.attack.attacker_losses_absorbed = game.attack.attacker_losses

	Engine.combat.resolve_second_fire(game, () => {})

	expect(game.seed).toBe(seedAfterInitialFire)
})
