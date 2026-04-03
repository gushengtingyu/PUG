const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP, ELIMINATED } = Engine.constants
const { data } = Engine

function findPieceId(predicate) {
	let id = data.pieces.findIndex((p) => p && predicate(p))
	if (id < 0) throw new Error("未找到满足条件的棋子")
	return id
}

function findBattleSpaces() {
	let target = data.spaces.findIndex(
		(s, idx) =>
			idx > 0 &&
			s &&
			Array.isArray(s.connections) &&
			s.connections.length > 0 &&
			s.type !== "Reserve Box" &&
			s.map !== "Reserve Box" &&
			s.type !== "Eliminated"
	)
	if (target < 0) throw new Error("未找到可用于战斗测试的地块")
	return {
		targetSpace: target,
		fromSpace: data.spaces[target].connections[0]
	}
}

function createMinimalBattleGame() {
	let apPiece = findPieceId((p) => p.faction === AP && p.type !== "hq" && p.piece_class === "LCU")
	let cpTuScu = findPieceId(
		(p) =>
			p.faction === CP &&
			(p.nation === "tu" || p.nation === "tua") &&
			p.piece_class === "SCU" &&
			p.type !== "hq"
	)
	let { targetSpace, fromSpace } = findBattleSpaces()
	let game = {
		pieces: new Array(data.pieces.length).fill(ELIMINATED),
		reduced: [],
		retreated: [],
		control: [],
		events: {},
		turn: 1,
		active: AP,
		state: "battle",
		hand_ap: [],
		hand_cp: [],
		discard_ap: [],
		discard_cp: [],
		removed_ap: [],
		removed_cp: [],
		cc_retained: { ap: [], cp: [] },
		cc_retained_after_use: { ap: {}, cp: {} },
		combat_cards: { attacker: [], defender: [] },
		attack: {
			space: targetSpace,
			pieces: [apPiece],
			attacker: AP,
			defender: CP,
			from: [fromSpace],
			initial_defenders: [cpTuScu],
			defender_losses: 0
		}
	}
	game.pieces[apPiece] = fromSpace
	game.pieces[cpTuScu] = targetSpace
	return { game, apPiece, cpTuScu, targetSpace }
}

function createBattleResult(apPiece, cpPiece, overrides = {}) {
	return {
		cancelled: false,
		attacker_losses: 0,
		defender_losses: 0,
		retreat_needed: false,
		retreating_faction: CP,
		retreating_units: [],
		retreat_can_cancel: false,
		retreat_distance: 1,
		no_advance: true,
		turkish_retreat: true,
		turkish_retreat_units: [cpPiece],
		turkish_retreat_optional_units: [],
		attackers: [apPiece],
		defenders: [cpPiece],
		...overrides
	}
}

describe("土耳其撤退回归测试", () => {
	test("防守方全灭时不会进入土耳其撤退选择", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.post_roll_cc_done = true
		game.pieces[cpTuScu] = ELIMINATED
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			turkish_retreat_units: [cpTuScu],
			turkish_retreat_optional_units: [apPiece]
		})

		Engine.combat.end_battle_sequence(game, () => {})

		expect(game.state).toBe("attack")
		expect(game.attack).toBeNull()
		expect(game.turkish_retreat_pending).toBeUndefined()
		expect(game.turkish_retreat_mandatory).toBeUndefined()
		expect(game.turkish_retreat_optional).toBeUndefined()
	})

	test("存在存活单位时进入土耳其撤退且只保留有效单位", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.post_roll_cc_done = true
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			turkish_retreat_units: [cpTuScu],
			turkish_retreat_optional_units: [apPiece]
		})

		Engine.combat.end_battle_sequence(game, () => {})

		expect(game.state).toBe("turkish_retreat")
		expect(game.active).toBe(CP)
		expect(game.turkish_retreat_pending).toBe(true)
		expect(game.turkish_retreat_mandatory).toEqual([cpTuScu])
		expect(game.turkish_retreat_optional).toEqual([])
	})

	test("土耳其撤退结束后防守方全灭时由AP进入挺进", () => {
		let { game, apPiece, cpTuScu, targetSpace } = createMinimalBattleGame()
		game.active = CP
		game.pieces[cpTuScu] = ELIMINATED
		game.attack.defender_losses = 3
		game.attack.defender_losses_absorbed = 3
		game.turkish_retreat_pending = true
		game.turkish_retreat_space = targetSpace
		game.turkish_retreat_mandatory = []
		game.turkish_retreat_optional = []
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			no_advance: false
		})

		Engine.combat.finish_turkish_retreat(game, () => {})

		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(game.advance_pieces).toContain(apPiece)
	})

	test("状态机在残留脏数据下会自动跳过空土耳其撤退选择", () => {
		let game = rules.setup(20260403, "Historical", { seven_hand_size: false, no_supply_warnings: true })
		let apPiece = findPieceId((p) => p.faction === AP && p.type !== "hq" && p.piece_class === "LCU")
		let cpTuScu = findPieceId(
			(p) =>
				p.faction === CP &&
				(p.nation === "tu" || p.nation === "tua") &&
				p.piece_class === "SCU" &&
				p.type !== "hq"
		)
		let { targetSpace, fromSpace } = findBattleSpaces()

		for (let i = 0; i < game.pieces.length; i++) game.pieces[i] = ELIMINATED
		game.pieces[apPiece] = fromSpace
		game.pieces[cpTuScu] = ELIMINATED
		game.retreated = []
		game.reduced = []
		game.active = CP
		game.state = "turkish_retreat"
		game.attack = {
			space: targetSpace,
			pieces: [apPiece],
			attacker: AP,
			defender: CP,
			from: [fromSpace],
			initial_defenders: [cpTuScu],
			defender_losses: 0
		}
		game.battle_result = createBattleResult(apPiece, cpTuScu, { no_advance: true })
		game.turkish_retreat_pending = true
		game.turkish_retreat_space = targetSpace
		game.turkish_retreat_mandatory = [cpTuScu]
		game.turkish_retreat_optional = []

		let view = rules.view(game, "Central Powers")

		expect(game.state).not.toBe("turkish_retreat")
		expect(game.turkish_retreat_pending).toBeUndefined()
		if (typeof view.prompt === "string") {
			expect(view.prompt.includes("土耳其撤退")).toBe(false)
		}
	})

	test("未标记待处理时会通过统一收尾进入正常战斗后续", () => {
		let { game, apPiece, cpTuScu, targetSpace } = createMinimalBattleGame()
		game.active = CP
		game.state = "turkish_retreat"
		game.pieces[cpTuScu] = ELIMINATED
		game.attack.defender_losses = 2
		game.attack.defender_losses_absorbed = 2
		game.turkish_retreat_space = targetSpace
		game.turkish_retreat_mandatory = []
		game.turkish_retreat_optional = []
		game.battle_result = createBattleResult(apPiece, cpTuScu, { no_advance: false })

		rules.view(game, "Central Powers")

		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(game.attack).not.toBeNull()
		expect(game.turkish_retreat_pending).toBeUndefined()
	})

	test("战后CC窗口存在可选卡时不会被回退为attack状态", () => {
		let game = rules.setup(20260403, "Historical", { seven_hand_size: false, no_supply_warnings: true })
		let apPiece = findPieceId((p) => p.faction === AP && p.type !== "hq" && p.piece_class === "LCU")
		let cpTuScu = findPieceId(
			(p) =>
				p.faction === CP &&
				(p.nation === "tu" || p.nation === "tua") &&
				p.piece_class === "SCU" &&
				p.type !== "hq"
		)
		let { targetSpace, fromSpace } = findBattleSpaces()

		for (let i = 0; i < game.pieces.length; i++) game.pieces[i] = ELIMINATED
		game.pieces[apPiece] = fromSpace
		game.pieces[cpTuScu] = ELIMINATED
		game.retreated = []
		game.reduced = []
		game.active = AP
		game.state = "battle"
		game.hand_cp = [59]
		game.cc_retained = { ap: [], cp: [] }
		game.cc_retained_after_use = { ap: {}, cp: {} }
		game.combat_cards = { attacker: [], defender: [] }
		game.attack = {
			space: targetSpace,
			pieces: [apPiece],
			attacker: AP,
			defender: CP,
			from: [fromSpace],
			initial_attackers: [apPiece],
			initial_defenders: [cpTuScu],
			defender_losses: 0
		}
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			no_advance: false,
			turkish_retreat: false,
			turkish_retreat_units: [],
			turkish_retreat_optional_units: []
		})
		game.post_roll_cc_done = true

		Engine.combat.end_battle_sequence(game, () => {})
		let view = rules.view(game, "Central Powers")

		expect(game.state).toBe("post_battle_cc_cp")
		expect(game.active).toBe(CP)
		if (typeof view.prompt === "string") {
			expect(view.prompt.includes("战斗后战斗卡")).toBe(true)
		}
	})
})
