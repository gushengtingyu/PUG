const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findPieceByName, clearBoard } = require("./helpers.js")

const CP = Engine.constants.CP
const CP_ROLE = rules.roles[1]

function findCardByEvent(eventName) {
	const card = data.cards.findIndex((info, idx) => idx > 0 && info && info.event === eventName)
	if (card < 0) throw new Error(`Missing card: ${eventName}`)
	return card
}

function createCzarsArmoriesGame() {
	const game = setupGame(26051701, "Historical", { no_supply_warnings: true })
	const kars = findSpace("Kars")
	const erzincan = findSpace("Erzincan")
	const russian = findPieceByName("RU DIV #3")
	const reducedTurkish = findPieceByName("TU DIV #8")
	const eliminatedLcu = findPieceByName("TU XI Corps")
	const card = findCardByEvent("CZAR'S ARMORIES CC")

	clearBoard(game)
	game.pieces[russian] = kars
	game.pieces[reducedTurkish] = kars
	game.pieces[eliminatedLcu] = Engine.game_utils.get_eliminated_box(CP)
	game.control[kars] = CP
	game.control[erzincan] = CP
	game.active = CP
	game.state = "post_advance_cc_cp"
	game.events = { russian_revolution: 1 }
	game.captured_russian_vp_in_advance = true
	game.attack = { space: kars, pieces: [reducedTurkish], attacker: CP, defender: Engine.constants.AP }
	game.hand_cp = [card]
	game.combat_cards = { attacker: [], defender: [] }
	game.combat_cards_effected = []
	game.cc_retained = { ap: [], cp: [] }
	game.cc_retained_after_use = { ap: {}, cp: {} }
	game.action_state = {}
	game.reduced = [reducedTurkish]
	game.rp_cp.tu = 0
	game.tu_rp_limit = 20
	game.events.royal_navy_blockade = true

	return { game, card, reducedTurkish, eliminatedLcu, erzincan }
}

test("Czar's Armories opens immediate RP instead of recording TU RP", () => {
	const { game, card } = createCzarsArmoriesGame()

	expect(rules.view(game, CP_ROLE).actions.play_cc).toContain(card)

	rules.action(game, CP_ROLE, "play_cc", card)
	expect(game.state).toBe("confirm_cc")
	rules.action(game, CP_ROLE, "confirm")

	expect(game.state).toBe("event_czars_armories")
	expect(game.czars_armories_rp).toMatchObject({ bonus: 4, spent: 0, return_state: "post_advance_cc_cp" })
	expect(game.rp_cp.tu).toBe(0)
	expect(game.tu_rp_limit).toBe(20)
})

test("Czar's Armories can flip reduced Turkish units in the affected areas", () => {
	const { game, card, reducedTurkish } = createCzarsArmoriesGame()

	rules.action(game, CP_ROLE, "play_cc", card)
	rules.action(game, CP_ROLE, "confirm")

	expect(rules.view(game, CP_ROLE).actions.piece).toContain(reducedTurkish)
	rules.action(game, CP_ROLE, "piece", reducedTurkish)

	expect(Engine.game_utils.is_piece_reduced(game, reducedTurkish)).toBe(false)
	expect(game.czars_armories_rp.spent).toBeGreaterThan(0)
	expect(game.rp_cp.tu).toBe(0)
	expect(game.tu_rp_limit).toBe(20)
})

test("Czar's Armories can rebuild eliminated Turkish LCUs with its own budget", () => {
	const { game, card, eliminatedLcu, erzincan } = createCzarsArmoriesGame()

	rules.action(game, CP_ROLE, "play_cc", card)
	rules.action(game, CP_ROLE, "confirm")

	expect(rules.view(game, CP_ROLE).actions.piece).toContain(eliminatedLcu)
	rules.action(game, CP_ROLE, "piece", eliminatedLcu)
	expect(game.state).toBe("event_czars_armories_rebuild")
	expect(rules.view(game, CP_ROLE).actions.space).toContain(erzincan)

	rules.action(game, CP_ROLE, "space", erzincan)

	expect(game.pieces[eliminatedLcu]).toBe(erzincan)
	expect(Engine.game_utils.is_piece_reduced(game, eliminatedLcu)).toBe(true)
	expect(game.czars_armories_rp.spent).toBe(1)
	expect(game.rp_cp.tu).toBe(0)
	expect(game.tu_rp_limit).toBe(20)

	rules.action(game, CP_ROLE, "done")
	expect(game.state).toBe("post_advance_cc_cp")
})

test("Czar's Armories cannot be played by CP as the defender", () => {
	const { game, card } = createCzarsArmoriesGame()

	game.attack.attacker = Engine.constants.AP
	game.attack.defender = CP

	expect(rules.view(game, CP_ROLE).actions?.play_cc || []).not.toContain(card)
	expect(Engine.combat_cards.can_play_czars_armories(game)).toBe(false)
})

test("Czar's Armories trigger requires a VP space in Russia, not Azerbaijan", () => {
	const game = setupGame(26051702, "Historical", { no_supply_warnings: true })
	const tabriz = findSpace("Tabriz")
	const baku = findSpace("Baku")
	const turkish = findPieceByName("TU DIV #8")

	clearBoard(game)
	game.active = CP
	game.state = "advance"
	game.events = { russian_revolution: 1 }
	game.attack = { space: tabriz, pieces: [turkish], attacker: CP, defender: Engine.constants.AP }
	game.advance_pieces = [turkish]
	game.advance_space = tabriz
	game.pieces[turkish] = findSpace("Ardebil")
	game.control[tabriz] = Engine.constants.AP

	expect(Engine.map.is_russian_vp_space(game, tabriz)).toBe(true)
	expect(Engine.combat_cards.is_czars_armories_trigger_space(tabriz)).toBe(false)

	rules.action(game, CP_ROLE, "piece", turkish)
	expect(game.captured_russian_vp_in_advance).toBeUndefined()

	game.state = "advance"
	game.attack = { space: baku, pieces: [turkish], attacker: CP, defender: Engine.constants.AP }
	game.advance_pieces = [turkish]
	game.advance_space = baku
	game.pieces[turkish] = findSpace("Batum")
	game.control[baku] = Engine.constants.AP

	expect(Engine.combat_cards.is_czars_armories_trigger_space(baku)).toBe(true)

	rules.action(game, CP_ROLE, "piece", turkish)
	expect(game.captured_russian_vp_in_advance).toBe(true)
})

test("Czar's Armories trigger requires a regular unit to occupy the Russia VP space", () => {
	const game = setupGame(26051703, "Historical", { no_supply_warnings: true })
	const baku = findSpace("Baku")
	const hq = findPieceByName("TU Enver HQ")

	clearBoard(game)
	game.active = CP
	game.state = "advance"
	game.events = { russian_revolution: 1 }
	game.attack = { space: baku, pieces: [hq], attacker: CP, defender: Engine.constants.AP }
	game.advance_pieces = [hq]
	game.advance_space = baku
	game.pieces[hq] = findSpace("Batum")
	game.control[baku] = Engine.constants.AP

	expect(Engine.game_utils.is_regular(hq)).toBe(false)
	expect(Engine.combat_cards.is_czars_armories_trigger_space(baku)).toBe(true)

	rules.action(game, CP_ROLE, "piece", hq)

	expect(Engine.map.is_controlled_by(game, baku, CP)).toBe(false)
	expect(game.captured_russian_vp_in_advance).toBeUndefined()
})

test("Czar's Armories can trigger when a regular unit advances into an undestroyed Russia VP fort", () => {
	const game = setupGame(26051704, "Historical", { no_supply_warnings: true })
	const kars = findSpace("Kars")
	const turkish = findPieceByName("TU DIV #8")

	clearBoard(game)
	game.active = CP
	game.state = "advance"
	game.events = { russian_revolution: 1 }
	game.forts = { destroyed: [] }
	game.attack = { space: kars, pieces: [turkish], attacker: CP, defender: Engine.constants.AP }
	game.advance_pieces = [turkish]
	game.advance_space = kars
	game.pieces[turkish] = findSpace("Oltu")
	game.control[kars] = Engine.constants.AP

	expect(Engine.game_utils.is_regular(turkish)).toBe(true)
	expect(Engine.combat.has_undestroyed_fort(game, kars, Engine.constants.AP)).toBe(true)
	expect(Engine.combat_cards.is_czars_armories_trigger_space(kars)).toBe(true)

	rules.action(game, CP_ROLE, "piece", turkish)

	expect(Engine.map.is_controlled_by(game, kars, CP)).toBe(false)
	expect(game.captured_russian_vp_in_advance).toBe(true)
})
