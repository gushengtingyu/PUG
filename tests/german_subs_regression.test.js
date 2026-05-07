const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPieceByPredicate: findPiece } = require("./helpers.js")

const { AP, CP, ELIMINATED } = Engine.constants

function createNavalSupportBattle(seed) {
	let game = setupGame(seed)
	let attacker = findPiece(
		(info) => info.faction === AP && info.nation === "br" && info.piece_class === "LCU" && info.type !== "hq",
		"BR LCU"
	)
	let defender = findPiece(
		(info) => info.faction === CP && info.piece_class === "SCU" && info.type !== "hq",
		"CP SCU"
	)
	let damascus = findSpace("Damascus")
	let beirut = findSpace("Beirut")

	game.pieces[attacker] = damascus
	game.pieces[defender] = beirut
	game.active = AP
	game.retreated = []
	game.reduced = []
	game.cc_retained = { ap: [], cp: [] }
	game.cc_retained_after_use = { ap: {}, cp: {} }
	game.action_state = {}
	game.attack = {
		attacker: AP,
		defender: CP,
		pieces: [attacker],
		space: beirut
	}

	return game
}

test("German Subs in the Med 只会在打出当回合封锁 AP 港口增援", () => {
	let game = setupGame(2026042201)
	let portSaid = findSpace("Port Said")
	let lemnos = findSpace("Lemnos")

	expect(Engine.reinf_helpers.is_br.check(game, portSaid)).toBe(true)
	expect(Engine.reinf_helpers.is_br.check(game, lemnos)).toBe(true)

	game.events.german_subs = true
	game.events.german_subs_turn = game.turn

	expect(Engine.reinf_helpers.is_br.check(game, portSaid)).toBe(false)
	expect(Engine.reinf_helpers.is_br.check(game, lemnos)).toBe(false)

	game.events.german_subs_turn = game.turn - 1

	expect(Engine.reinf_helpers.is_br.check(game, portSaid)).toBe(true)
	expect(Engine.reinf_helpers.is_br.check(game, lemnos)).toBe(true)
})

test("German Subs in the Med 不会阻止 AP 海上 SR 进入爱琴海或东地中海", () => {
	let game = setupGame(2026042202)
	let brScu = findPiece(
		(info) => info.faction === AP && info.nation === "br" && info.piece_class === "SCU" && info.type !== "hq",
		"BR SCU"
	)
	let portSaid = findSpace("Port Said")
	let lemnos = findSpace("Lemnos")

	game.pieces[brScu] = portSaid

	expect(Engine.map.can_sr_to_space(game, brScu, lemnos, AP)).toBe(true)

	game.events.german_subs = true
	game.events.german_subs_turn = game.turn

	expect(Engine.map.can_sr_to_space(game, brScu, lemnos, AP)).toBe(true)
})

test("German Subs in the Med 不会阻止 AP 在正常补员阶段于 Port Said 重建 BR LCU", () => {
	let game = setupGame(2026042203)
	let brLcu = findPiece(
		(info) => info.faction === AP && info.nation === "br" && info.piece_class === "LCU" && info.type !== "hq",
		"BR LCU"
	)
	let portSaid = findSpace("Port Said")

	game.pieces[brLcu] = ELIMINATED
	game.events.german_subs = true
	game.events.german_subs_turn = game.turn

	let validSpaces = Engine.map.get_valid_rebuild_spaces(game, brLcu, AP)
	expect(validSpaces).toContain(portSaid)
})

test("German Subs in the Med 不会取消 AP 的 Naval Support DRM", () => {
	let baselineGame = createNavalSupportBattle(2026042204)
	let germanSubsGame = createNavalSupportBattle(2026042204)

	germanSubsGame.events.german_subs = true
	germanSubsGame.events.german_subs_turn = germanSubsGame.turn

	let baselineResult = Engine.combat.resolve_battle(baselineGame)
	let germanSubsResult = Engine.combat.resolve_battle(germanSubsGame)

	expect(baselineResult.att_drm).toBe(1)
	expect(germanSubsResult.att_drm).toBe(baselineResult.att_drm)
})
