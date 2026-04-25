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

function resetAttackContext(game, faction = CP) {
	game.active = faction
	game.reduced = []
	game.retreated = []
	game.attacked = []
	game.activated = { move: [], attack: [] }
	game.forts = { destroyed: [] }
	if (!game.events) game.events = {}
}

function clearSpaces(game, spaces) {
	for (let p = 0; p < game.pieces.length; p++) {
		if (spaces.includes(game.pieces[p])) game.pieces[p] = 0
	}
}

function canActivateCpAttack(game, p, s) {
	return Engine.combat.can_activate_piece_in_space_to_attack(
		game,
		p,
		s,
		CP,
		() => Engine.game_utils.get_season(game),
		(space, faction) => Engine.map.is_rail_connected_to_supply(game, space, faction)
	)
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

test("CP can activate an attack across a numbered strait into the enemy-controlled target side", () => {
	let game = setupGame(2026042501)
	let gallipoli = findSpace("Gallipoli")
	let chardak = findSpace("Chardak")
	let rodosto = findSpace("Rodosto")
	let bandirma = findSpace("Bandirma")
	let constantinople = findSpace("CONSTANTINOPLE")
	let bosphorusForts = findSpace("The Bosphorus Forts")
	let attacker = findPiece(CP, "TU I Corps")
	let defender = findPiece(AP, "BR IX Corps")

	resetAttackContext(game, CP)
	clearSpaces(game, [gallipoli, chardak])
	game.pieces[attacker] = gallipoli
	game.pieces[defender] = chardak
	game.control[gallipoli] = CP
	game.control[chardak] = AP
	game.control[rodosto] = CP
	game.control[bandirma] = CP
	game.control[constantinople] = CP
	game.control[bosphorusForts] = CP

	expect(Engine.map.can_use_strait(game, gallipoli, chardak, CP)).toBe(true)
	expect(Engine.map.get_piece_connected_spaces_for_rule(game, gallipoli, attacker, "attack")).toContain(chardak)
	expect(canActivateCpAttack(game, attacker, gallipoli)).toBe(true)
})

test("CP can activate an attack into an established beachhead from the mainland side", () => {
	let game = setupGame(2026042502)
	let sariBahr = findSpace("Sari Bahr")
	let gabaTepe = findSpace("Gaba Tepe")
	let attacker = findPiece(CP, "TU I Corps")
	let defender = findPiece(AP, "BR IX Corps")

	resetAttackContext(game, CP)
	clearSpaces(game, [sariBahr, gabaTepe])
	game.pieces[attacker] = sariBahr
	game.pieces[defender] = gabaTepe
	game.control[sariBahr] = CP
	game.control[gabaTepe] = AP
	game.beachheads = [gabaTepe]

	expect(Engine.map.get_piece_connected_spaces_for_rule(game, sariBahr, attacker, "attack")).toContain(gabaTepe)
	expect(canActivateCpAttack(game, attacker, sariBahr)).toBe(true)
})

test("CP attack eligibility treats one-way water crossing lines as adjacent", () => {
	let game = setupGame(2026042503)
	let hilla = findSpace("Hilla")
	let dawaniyeh = findSpace("Dawaniyeh")
	let attacker = findPiece(CP, "TU I Corps")
	let defender = findPiece(AP, "BR IX Corps")

	resetAttackContext(game, CP)
	clearSpaces(game, [hilla, dawaniyeh])
	game.pieces[attacker] = hilla
	game.pieces[defender] = dawaniyeh
	game.control[hilla] = CP
	game.control[dawaniyeh] = AP

	expect(Engine.map.get_piece_connected_spaces_for_rule(game, hilla, attacker, "attack")).toContain(dawaniyeh)
	expect(canActivateCpAttack(game, attacker, hilla)).toBe(true)
})
