const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP, ELIMINATED } = Engine.constants
const { data } = Engine

function findPieceId(predicate) {
	let id = data.pieces.findIndex((p) => p && predicate(p))
	if (id < 0) throw new Error("未找到满足条件的棋子")
	return id
}

function findPieceIds(predicate, count) {
	let ids = []
	for (let i = 0; i < data.pieces.length; i++) {
		if (data.pieces[i] && predicate(data.pieces[i])) {
			ids.push(i)
			if (ids.length === count) break
		}
	}
	if (ids.length < count) throw new Error("未找到足够数量的棋子")
	return ids
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

function findBattleSpacesWithRetreatPath() {
	let target = data.spaces.findIndex(
		(s, idx) =>
			idx > 0 &&
			s &&
			Array.isArray(s.connections) &&
			s.connections.length >= 2 &&
			s.type !== "Reserve Box" &&
			s.map !== "Reserve Box" &&
			s.type !== "Eliminated"
	)
	if (target < 0) throw new Error("未找到可用于撤退测试的地块")
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

	test("状态机在残留脏数据下会显式给出完成动作，而不在 prompt 自动跳过空土耳其撤退", () => {
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

		expect(game.state).toBe("turkish_retreat")
		expect(game.turkish_retreat_pending).toBe(true)
		expect(view.actions.done).toBeTruthy()
		expect(typeof view.prompt).toBe("string")
		expect(view.prompt.includes("土耳其撤退已完成")).toBe(true)
	})

	test("未标记待处理时需要显式完成土耳其撤退收尾，再进入正常战斗后续", () => {
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

		let cpView = rules.view(game, "Central Powers")

		expect(game.state).toBe("turkish_retreat")
		expect(game.active).toBe(CP)
		expect(game.turkish_retreat_pending).toBeUndefined()
		expect(cpView.active).toBe(CP)
		expect(cpView.actions.done).toBeTruthy()
		expect(typeof cpView.prompt).toBe("string")
		expect(cpView.prompt.includes("土耳其撤退已完成")).toBe(true)

		rules.action(game, "Central Powers", "done")

		let apView = rules.view(game, "Allied Powers")
		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(game.attack).not.toBeNull()
		expect(apView.active).toBe(AP)
		expect(typeof apView.prompt).toBe("string")
		expect(apView.prompt.includes("推进至")).toBe(true)
		expect(apView.actions.end_advance).toBeTruthy()
		expect(apView.actions.piece || []).toContain(apPiece)
	})

	test("英俄突袭从 Fao 攻击 Basra 后推进阶段仍可点击本次进攻单位", () => {
		let apPiece = findPieceId((p) => p.faction === AP && p.nation === "in" && p.type !== "hq" && p.mf > 0)
		let cpTuScu = findPieceId(
			(p) =>
				p.faction === CP &&
				(p.nation === "tu" || p.nation === "tua") &&
				p.piece_class === "SCU" &&
				p.type !== "hq"
		)
		let fao = data.spaces.findIndex((s) => s && s.name === "Fao")
		let basra = data.spaces.findIndex((s) => s && s.name === "Basra")
		expect(fao).toBeGreaterThan(0)
		expect(basra).toBeGreaterThan(0)

		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			reduced: [],
			retreated: [],
			control: [],
			events: { russo_british_assault: true },
			turn: 1,
			active: AP,
			state: "advance",
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
				space: basra,
				pieces: [apPiece],
				attacker: AP,
				defender: CP,
				from: [fao],
				initial_defenders: [cpTuScu],
				keep_context: true
			},
			advance_pieces: [apPiece],
			advance_space: basra,
			advance_count: 0,
			advance_limit: 3,
			battle_result: createBattleResult(apPiece, cpTuScu, {
				no_advance: false,
				turkish_retreat: true,
				advance_with_reduced: true
			})
		}
		game.pieces[apPiece] = fao
		game.pieces[cpTuScu] = ELIMINATED

		let apView = rules.view(game, "Allied Powers")

		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(apView.actions.end_advance).toBeTruthy()
		expect(apView.actions.piece || []).toContain(apPiece)
	})

	test("英俄突袭巴士拉推进达到三单位上限后仍等待玩家手动结束挺进", () => {
		let apPieces = findPieceIds(
			(p) => p.faction === AP && p.nation === "in" && p.piece_class === "SCU" && p.type !== "hq",
			3
		)
		let cpTuScu = findPieceId(
			(p) =>
				p.faction === CP &&
				(p.nation === "tu" || p.nation === "tua") &&
				p.piece_class === "SCU" &&
				p.type !== "hq"
		)
		let fao = data.spaces.findIndex((s) => s && s.name === "Fao")
		let basra = data.spaces.findIndex((s) => s && s.name === "Basra")
		expect(apPieces.length).toBe(3)
		expect(fao).toBeGreaterThan(0)
		expect(basra).toBeGreaterThan(0)

		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			reduced: [],
			retreated: [],
			control: [],
			events: { russo_british_assault: true },
			turn: 1,
			active: AP,
			state: "advance",
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
				space: basra,
				pieces: apPieces.slice(),
				attacker: AP,
				defender: CP,
				from: [fao],
				initial_defenders: [cpTuScu],
				keep_context: true
			},
			advance_pieces: apPieces.slice(),
			advance_space: basra,
			advance_count: 0,
			advance_limit: 3,
			battle_result: createBattleResult(apPieces[0], cpTuScu, {
				no_advance: false,
				turkish_retreat: true,
				advance_with_reduced: true,
				attackers: apPieces.slice(),
				defenders: [cpTuScu]
			})
		}
		for (let p of apPieces) game.pieces[p] = fao
		game.pieces[cpTuScu] = ELIMINATED

		for (let p of apPieces) {
			game = rules.action(game, "Allied Powers", "piece", p)
		}

		let apView = rules.view(game, "Allied Powers")
		expect(game.state).toBe("advance")
		expect(game.advance_count).toBe(3)
		expect(game.advance_pieces).toEqual([])
		expect(apView.actions.end_advance).toBeTruthy()
		expect(apView.actions.piece || []).toEqual([])

		game = rules.action(game, "Allied Powers", "end_advance")
		expect(game.state).not.toBe("advance")
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

	test("Reserves to the Front 生效后即使防守方重建留在战场仍进入挺进", () => {
		let { game, apPiece, cpTuScu, targetSpace } = createMinimalBattleGame()
		game.state = "post_battle_cc_cp"
		game.active = CP
		game.hand_cp = [59]
		game.rp_cp = { ge: 0, tu: 0, a: 0 }
		game.rp_ap = { br: 0, ru: 0, in: 0, a: 0 }
		game.pieces[cpTuScu] = targetSpace
		game.reduced = [cpTuScu]
		game.attack.reserves_to_front_damaged_pieces = [cpTuScu]
		game.post_battle_cc_resume = { kind: "advance", advance_space: targetSpace, save_tiflis_failed: false }
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			no_advance: false,
			turkish_retreat: false,
			turkish_retreat_units: [],
			turkish_retreat_optional_units: []
		})

		rules.action(game, "Central Powers", "play_cc", 59)
		expect(game.state).toBe("event_reserves_to_front")
		expect(game.rp_cp.tu).toBe(2)

		rules.action(game, "Central Powers", "piece", cpTuScu)
		expect(game.reduced.includes(cpTuScu)).toBe(false)

		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("post_battle_cc_cp")

		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(game.advance_pieces).toContain(apPiece)
	})

	test("Reserves to the Front 可选择并重建本次战斗刚被消灭的TU/TU-A SCU", () => {
		let { game, apPiece, cpTuScu, targetSpace } = createMinimalBattleGame()
		game.state = "post_battle_cc_cp"
		game.active = CP
		game.hand_cp = [59]
		game.rp_cp = { ge: 0, tu: 0, a: 0 }
		game.rp_ap = { br: 0, ru: 0, in: 0, a: 0 }
		game.pieces[cpTuScu] = ELIMINATED
		game.reduced = []
		game.attack.eliminated_defenders = [cpTuScu]
		game.attack.reserves_to_front_damaged_pieces = [cpTuScu]
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			no_advance: true,
			turkish_retreat: false,
			turkish_retreat_units: [],
			turkish_retreat_optional_units: []
		})

		rules.action(game, "Central Powers", "play_cc", 59)
		expect(game.state).toBe("event_reserves_to_front")

		rules.action(game, "Central Powers", "piece", cpTuScu)
		expect(game.pieces[cpTuScu]).toBe(targetSpace)
		expect(game.reduced.includes(cpTuScu)).toBe(true)
	})

	test("Reserves to the Front 对被消灭LCU仅花1RP并以残编重建，且卡牌不会在战后窗口重复可打", () => {
		let { game, apPiece, targetSpace } = createMinimalBattleGame()
		let cpTuLcu = findPieceId(
			(p) =>
				p.faction === CP &&
				(p.nation === "tu" || p.nation === "tua") &&
				p.piece_class === "LCU" &&
				p.type !== "hq"
		)
		game.state = "post_battle_cc_cp"
		game.active = CP
		game.hand_cp = [59]
		game.rp_cp = { ge: 0, tu: 0, a: 0 }
		game.rp_ap = { br: 0, ru: 0, in: 0, a: 0 }
		game.pieces[cpTuLcu] = ELIMINATED
		game.reduced = []
		game.attack.initial_defenders = [cpTuLcu]
		game.attack.eliminated_defenders = [cpTuLcu]
		game.attack.reserves_to_front_damaged_pieces = [cpTuLcu]
		game.battle_result = createBattleResult(apPiece, cpTuLcu, {
			no_advance: true,
			turkish_retreat: false,
			turkish_retreat_units: [],
			turkish_retreat_optional_units: []
		})

		rules.action(game, "Central Powers", "play_cc", 59)
		expect(game.state).toBe("event_reserves_to_front")
		expect(game.rp_cp.tu).toBe(2)

		rules.action(game, "Central Powers", "piece", cpTuLcu)
		expect(game.pieces[cpTuLcu]).toBe(targetSpace)
		expect(game.reduced.includes(cpTuLcu)).toBe(true)
		expect(game.rp_cp.tu).toBe(1)

		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("post_battle_cc_cp")
		expect(game.rp_cp.tu).toBe(0)

		let view = rules.view(game, "Central Powers")
		expect(view.actions.play_cc || []).not.toContain(59)
	})

	test("Reserves to the Front 不能补员本次战斗未受伤的TU/TU-A部队", () => {
		let { game, cpTuScu } = createMinimalBattleGame()
		game.state = "post_battle_cc_cp"
		game.active = CP
		game.hand_cp = [59]
		game.rp_cp = { ge: 0, tu: 0, a: 0 }
		game.rp_ap = { br: 0, ru: 0, in: 0, a: 0 }
		game.reduced = [cpTuScu]
		game.post_battle_cc_resume = { kind: "finish_attack" }

		let view = rules.view(game, "Central Powers")

		expect(view.actions.play_cc || []).not.toContain(59)
	})

	test("战后CC前移后，前线预备役结算完成会继续进入正常撤退流程", () => {
		let { game, cpTuScu } = createMinimalBattleGame()
		game.state = "battle"
		game.active = AP
		game.hand_cp = [59]
		game.rp_cp = { ge: 0, tu: 0, a: 0 }
		game.rp_ap = { br: 0, ru: 0, in: 0, a: 0 }
		game.reduced = [cpTuScu]
		game.attack.reserves_to_front_damaged_pieces = [cpTuScu]
		game.post_roll_cc_done = true
		game.turkish_retreat = true
		game.battle_result = createBattleResult(game.attack.pieces[0], cpTuScu, {
			retreat_needed: true,
			retreating_faction: CP,
			retreating_units: [cpTuScu],
			retreat_can_cancel: false,
			retreat_distance: 2,
			no_advance: true,
			turkish_retreat: false,
			turkish_retreat_units: [],
			turkish_retreat_optional_units: []
		})

		Engine.combat.end_battle_sequence(game, () => {})
		expect(game.state).toBe("post_battle_cc_cp")
		expect(game.active).toBe(CP)

		rules.action(game, "Central Powers", "play_cc", 59)
		expect(game.state).toBe("event_reserves_to_front")

		rules.action(game, "Central Powers", "piece", cpTuScu)
		expect(game.reduced.includes(cpTuScu)).toBe(false)

		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("post_battle_cc_cp")

		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("retreat")
		expect(game.active).toBe(CP)
		expect(game.retreat_pieces).toEqual([cpTuScu])
		expect(game.retreat_distance).toBe(1)
	})

	test("普通撤退空队列的视图不会在 prompt 中偷偷推进状态", () => {
		let { game, cpTuScu } = createMinimalBattleGame()
		game.active = CP
		game.state = "retreat"
		game.retreat_pieces = []
		game.retreat_space = game.attack.space
		game.retreat_from = game.attack.space
		game.retreat_distance = 1
		game.selected_piece = null
		game.battle_result = createBattleResult(game.attack.pieces[0], cpTuScu, {
			retreat_needed: true,
			retreating_faction: CP,
			retreating_units: []
		})

		let view = rules.view(game, "Central Powers")

		expect(game.state).toBe("retreat")
		expect(game.active).toBe(CP)
		expect(view.actions.done).toBeTruthy()
		expect(view.prompt).toContain("撤退已完成")
	})

	test("土耳其撤退空队列的视图不会在 prompt 中偷偷推进状态", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.active = CP
		game.state = "turkish_retreat"
		game.turkish_retreat_pending = true
		game.turkish_retreat_space = game.attack.space
		game.turkish_retreat_mandatory = []
		game.turkish_retreat_optional = []
		game.selected_piece = null
		game.pieces[cpTuScu] = ELIMINATED
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			turkish_retreat: true,
			turkish_retreat_units: [],
			turkish_retreat_optional_units: []
		})

		let view = rules.view(game, "Central Powers")

		expect(game.state).toBe("turkish_retreat")
		expect(game.active).toBe(CP)
		expect(view.actions.done).toBeTruthy()
		expect(view.prompt).toContain("土耳其撤退已完成")
	})

	test("继续推进无可选单位时视图保留 end_advance，不再在 prompt 中自动收尾", () => {
		let { game, apPiece, targetSpace } = createMinimalBattleGame()
		game.active = AP
		game.state = "advance"
		game.advance_space = targetSpace
		game.advance_pieces = []
		game.advance_follow_mode = true
		game.advance_follow_pieces = [apPiece]
		game.retreat_first_spaces = []
		game.selected_piece = null

		let view = rules.view(game, "Allied Powers")

		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(view.actions.end_advance).toBeTruthy()
		expect(view.prompt).toContain("选择继续推进的单位")
	})

	test("普通撤退最后一步完成后会立即结算推进，不会出现双方互等", () => {
		let apPiece = findPieceId((p) => p.faction === AP && p.nation === "ru" && p.type !== "hq" && p.mf > 0)
		let cpPiece = findPieceId((p) => p.faction === CP && p.nation === "tu" && p.type !== "hq" && p.mf > 0)
		let bayburt = data.spaces.findIndex((s) => s && s.name === "Bayburt")
		let erzurum = data.spaces.findIndex((s) => s && s.name === "Erzurum")
		expect(bayburt).toBeGreaterThan(0)
		expect(erzurum).toBeGreaterThan(0)
		let attackFrom = (data.spaces[bayburt].connections || []).find((s) => s !== erzurum)
		expect(typeof attackFrom).toBe("number")

		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			reduced: [],
			retreated: [],
			control: [],
			options: { no_supply_warnings: true },
			events: { russo_british_assault: true },
			turn: 1,
			active: CP,
			state: "retreat",
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
				space: bayburt,
				pieces: [apPiece],
				attacker: AP,
				defender: CP,
				from: [attackFrom],
				initial_defenders: [cpPiece],
				keep_context: true
			},
			retreat_pieces: [cpPiece],
			retreat_space: bayburt,
			retreat_from: bayburt,
			retreat_distance: 1,
			battle_result: createBattleResult(apPiece, cpPiece, {
				no_advance: false,
				retreat_needed: true,
				retreating_faction: CP,
				retreating_units: [cpPiece],
				turkish_retreat: false,
				advance_with_reduced: true
			})
		}
		game.pieces[apPiece] = attackFrom
		game.pieces[cpPiece] = bayburt

		rules.action(game, "Central Powers", "piece", cpPiece)
		rules.action(game, "Central Powers", "space", erzurum)

		let apView = rules.view(game, "Allied Powers")
		let cpView = rules.view(game, "Central Powers")
		let apActionNames = Object.keys(apView.actions || {}).filter((name) => {
			if (name === "undo") return false
			let value = apView.actions[name]
			return Array.isArray(value) ? value.length > 0 : value === 1
		})

		expect(game.pieces[cpPiece]).toBe(erzurum)
		expect(game.state).not.toBe("retreat")
		expect(game.active).toBe(AP)
		expect(apActionNames.length).toBeGreaterThan(0)
		expect(typeof apView.prompt).toBe("string")
		expect(apView.prompt.includes("等待")).toBe(false)
		expect(typeof cpView.prompt).toBe("string")
		expect(cpView.prompt.includes("等待 Allied Powers")).toBe(true)
	})

	test("土耳其撤退宣言后若战后重建TU/TU-A SCU，仍会进入土耳其撤退并可触发AP挺进", () => {
		let { targetSpace, fromSpace } = findBattleSpacesWithRetreatPath()
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.attack.space = targetSpace
		game.attack.from = [fromSpace]
		game.pieces[apPiece] = fromSpace
		game.state = "battle"
		game.active = AP
		game.hand_cp = [59]
		game.rp_cp = { ge: 0, tu: 0, a: 0 }
		game.rp_ap = { br: 0, ru: 0, in: 0, a: 0 }
		game.post_roll_cc_done = true
		game.turkish_retreat = true
		game.pieces[cpTuScu] = ELIMINATED
		game.attack.initial_defenders = [cpTuScu]
		game.attack.eliminated_defenders = [cpTuScu]
		game.attack.reserves_to_front_damaged_pieces = [cpTuScu]
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			retreat_needed: false,
			retreating_faction: CP,
			retreating_units: [],
			no_advance: false,
			turkish_retreat: true,
			turkish_retreat_units: [cpTuScu],
			turkish_retreat_optional_units: []
		})

		Engine.combat.end_battle_sequence(game, () => {})
		expect(game.state).toBe("post_battle_cc_cp")

		rules.action(game, "Central Powers", "play_cc", 59)
		expect(game.state).toBe("event_reserves_to_front")
		rules.action(game, "Central Powers", "piece", cpTuScu)
		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("post_battle_cc_cp")

		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("turkish_retreat")
		expect(game.active).toBe(CP)

		let view = rules.view(game, "Central Powers")
		expect(view.actions.piece || []).toContain(cpTuScu)
		rules.action(game, "Central Powers", "piece", cpTuScu)
		view = rules.view(game, "Central Powers")
		let retreat_to = (view.actions.space || [])[0]
		if (typeof retreat_to === "number") {
			rules.action(game, "Central Powers", "space", retreat_to)
			expect(game.pieces[cpTuScu]).toBe(retreat_to)
		} else {
			expect(view.actions.eliminate_retreating).toBeTruthy()
			rules.action(game, "Central Powers", "eliminate_retreating")
			expect(game.pieces[cpTuScu]).not.toBe(targetSpace)
		}
		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(game.advance_space).toBe(targetSpace)
	})

	test("英俄突袭中土耳其撤退完成后不会出现双方互等", () => {
		let apPiece = findPieceId((p) => p.faction === AP && p.nation === "in" && p.type !== "hq" && p.mf > 0)
		let cpTuScu = findPieceId(
			(p) =>
				p.faction === CP &&
				(p.nation === "tu" || p.nation === "tua") &&
				p.piece_class === "SCU" &&
				p.type !== "hq"
		)
		let fao = data.spaces.findIndex((s) => s && s.name === "Fao")
		let basra = data.spaces.findIndex((s) => s && s.name === "Basra")
		let qurna = data.spaces.findIndex((s) => s && s.name === "Qurna")
		expect(fao).toBeGreaterThan(0)
		expect(basra).toBeGreaterThan(0)
		expect(qurna).toBeGreaterThan(0)

		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			reduced: [],
			retreated: [],
			control: [],
			events: { russo_british_assault: true },
			options: { no_supply_warnings: true },
			turn: 1,
			active: CP,
			state: "turkish_retreat",
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
				space: basra,
				pieces: [apPiece],
				attacker: AP,
				defender: CP,
				from: [fao],
				initial_defenders: [cpTuScu],
				keep_context: true
			},
			turkish_retreat_pending: true,
			turkish_retreat_space: basra,
			turkish_retreat_mandatory: [cpTuScu],
			turkish_retreat_optional: [],
			battle_result: createBattleResult(apPiece, cpTuScu, {
				no_advance: false,
				turkish_retreat: true,
				advance_with_reduced: true
			})
		}
		game.pieces[apPiece] = fao
		game.pieces[cpTuScu] = basra

		rules.action(game, "Central Powers", "piece", cpTuScu)
		rules.action(game, "Central Powers", "space", qurna)

		let apView = rules.view(game, "Allied Powers")
		let cpView = rules.view(game, "Central Powers")

		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(apView.actions.end_advance).toBeTruthy()
		expect(apView.actions.piece || []).toContain(apPiece)
		expect(typeof cpView.prompt).toBe("string")
		expect(cpView.prompt.includes("等待 Allied Powers")).toBe(true)
	})

	test("已宣告土耳其撤退时战后回到普通撤退也固定为 1 格", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.state = "battle"
		game.active = AP
		game.post_roll_cc_done = true
		game.turkish_retreat = true
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			retreat_needed: true,
			retreating_faction: CP,
			retreating_units: [cpTuScu],
			retreat_can_cancel: false,
			retreat_distance: 2,
			no_advance: true,
			turkish_retreat: false,
			turkish_retreat_units: [],
			turkish_retreat_optional_units: []
		})

		Engine.combat.end_battle_sequence(game, () => {})

		expect(game.state).toBe("retreat")
		expect(game.retreat_distance).toBe(1)
	})

	test("战斗卡窗口不再输出 plays CC 与 done with CC 日志", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.state = "post_battle_cc_cp"
		game.active = CP
		game.log = []
		game.hand_cp = [59]
		game.rp_cp = { ge: 0, tu: 0, a: 0 }
		game.rp_ap = { br: 0, ru: 0, in: 0, a: 0 }
		game.reduced = [cpTuScu]
		game.attack.reserves_to_front_damaged_pieces = [cpTuScu]
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			retreat_needed: false,
			no_advance: true,
			turkish_retreat: false,
			turkish_retreat_units: [],
			turkish_retreat_optional_units: []
		})
		game.post_battle_cc_resume = { kind: "finish_attack" }

		rules.action(game, "Central Powers", "play_cc", 59)
		rules.action(game, "Central Powers", "done")
		rules.action(game, "Central Powers", "done")

		expect(game.log.some((line) => typeof line === "string" && line.includes("plays CC"))).toBe(false)
		expect(game.log.some((line) => typeof line === "string" && line.includes("done with CC"))).toBe(false)
	})

	test("战斗日志不输出细节DRM行且土耳其撤退减伤进入主日志", () => {
		let { game } = createMinimalBattleGame()
		let logs = []
		game.turkish_retreat = true

		Engine.combat.resolve_battle(game, (msg) => logs.push(msg))

		expect(logs.some((line) => typeof line === "string" && line.includes("Cavalry/Camel/Armored Car Advantage"))).toBe(
			false
		)
		expect(logs.some((line) => typeof line === "string" && line.includes("Attacker Card"))).toBe(false)
		expect(logs.some((line) => typeof line === "string" && line.includes("Terrain Shift"))).toBe(false)
		expect(logs.some((line) => line === "土耳其撤退：防守方损失-1")).toBe(true)
	})

	test("英俄突袭进入俄军激活前会清理上一场突袭残留的战斗卡上下文", () => {
		let game = rules.setup(20260403, "Historical", { seven_hand_size: false, no_supply_warnings: true })
		let apPiece = findPieceId((p) => p.faction === AP && p.type !== "hq" && p.piece_class === "LCU")

		game.active = AP
		game.attack = { pieces: [apPiece], space: 1, keep_context: true }
		game.attacked = [apPiece]
		game.moved = [apPiece]
		game.combat_cards = { attacker: [4], defender: [61] }
		game.combat_cards_effected = [61]
		game.battle_result = { cancelled: true }
		game.post_roll_cc_done = true
		game.post_battle_cc_resume = { kind: "finish_attack" }

		Engine.event_states.begin_russo_british_russian_activation(game)

		expect(game.state).toBe("activate_spaces")
		expect(game.russo_british_russian_activation).toBe(true)
		expect(game.attack).toBeNull()
		expect(game.combat_cards).toBeUndefined()
		expect(game.combat_cards_effected).toBeUndefined()
		expect(game.battle_result).toBeUndefined()
		expect(game.post_roll_cc_done).toBeUndefined()
		expect(game.post_battle_cc_resume).toBeUndefined()
		expect(game.attacked.includes(apPiece)).toBe(false)
		expect(game.moved.includes(apPiece)).toBe(false)
	})

	test("攻击方使用 attacker_faction 兼容字段时会在战斗开始归一化，避免重入后阵营漂移", () => {
		let { game } = createMinimalBattleGame()
		game.active = CP
		game.attack.attacker = undefined
		game.attack.defender = undefined
		game.attack.attacker_faction = AP

		Engine.combat.start_attack_sequence(game)
		expect(game.attack.attacker).toBe(AP)
		expect(game.attack.defender).toBe(CP)
	})

	test("土耳其撤退收尾时即使attack.attacker缺失也会按进攻单位阵营进入AP挺进", () => {
		let { game, apPiece, cpTuScu, targetSpace } = createMinimalBattleGame()
		game.active = CP
		game.attack.attacker = undefined
		game.attack.defender = undefined
		game.attack.pieces = [apPiece]
		game.pieces[cpTuScu] = targetSpace
		game.turkish_retreat_pending = true
		game.turkish_retreat_space = targetSpace
		game.turkish_retreat_mandatory = [cpTuScu]
		game.turkish_retreat_optional = []
		game.selected_piece = cpTuScu
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			no_advance: false
		})

		let retreat_to = (data.spaces[targetSpace].connections || [])[0]
		expect(typeof retreat_to).toBe("number")
		game.pieces[cpTuScu] = retreat_to
		game.turkish_retreat_mandatory = []
		game.selected_piece = null

		Engine.combat.finish_turkish_retreat(game, () => {})
		expect(game.state).toBe("advance")
		expect(game.active).toBe(AP)
		expect(game.attack.attacker).toBe(AP)
		expect(game.attack.defender).toBe(CP)
	})
})
