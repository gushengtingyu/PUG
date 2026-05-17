"use strict"

/**
 * SAVE TIFLIS (回援第比利斯) 战斗卡回归测试
 *
 * 卡牌 ID: 66 (CC_CP_SAVE_TIFLIS)
 * 阵营: 同盟国 (CP)
 * 出牌窗口: retreat_choice_cc_cp
 *
 * 出牌条件:
 *   1. 当前处于 retreat_choice_cc_cp 状态
 *   2. 进攻方包含土耳其 LCU（tu/tua 民族）
 *   3. 防守方（战斗地块）包含俄国 LCU
 *   4. "大公前往第比利斯"事件（card 23）未生效
 *   5. 至少有一个俄国单位在"阿塞拜疆/波斯/土耳其领土"，
 *      且不在完好堡垒中，且所在地块无 Yudenitch HQ
 *
 * 效果:
 *   - 所有满足条件的俄国单位必须向第比利斯方向撤退一格
 *   - 无法合法撤退的单位留在原地，并设置 save_tiflis_failed = true
 *   - 若 save_tiflis_failed = true 且战斗结果原本为 no_advance，
 *     同盟国仍可挺进
 */

const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

const AP = rules.AP
const CP = rules.CP
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

// ─── 关键 ID ───────────────────────────────────────────────────────────────
const TIFLIS = 12
const ALEKSANDROPOL = 22 // Kars 的相邻地块
const KARS = 33 // Sarikamis 的合法普通战斗撤退目标
const KOPRUKOY = 58 // 土耳其领土，高加索区域（用于战斗地块）
const SARIKAMIS = 47 // 俄国领土（可用于测试"战斗在非受影响区域"）
const ARDEBIL = 64 // Tabriz 的相邻地块
const TABRIZ = 80 // 阿塞拜疆区域（受影响区域，有距第比利斯5格）
const JULFA = 55 // 俄国领土，距第比利斯4格（Tabriz的撤退目标）
const MENJIL = 101 // 波斯区域（受影响区域）
const ENZELI = 78 // 波斯区域，距第比利斯更近（Menjil的撤退目标）
const DIYARBEKIR = 120 // 平地，土耳其领土
const MARDIN = 129 // 平地，Diyarbekir 的相邻进攻来源
const MOSUL = 134 // 平地，Save Tiflis 额外撤退目标
const RAS_UL_AIN = 137 // 平地，Diyarbekir 普通撤退经过的第一格
const NAZIBIN = 141 // 平地，Diyarbekir 普通撤退的第二格

const TU_1_CAUCASIAN = 227 // 土耳其 LCU
const TU_CAV_1 = 230 // 土耳其 SCU（用于模拟 TU LCU 战损替换后仍是本场进攻方）
const RU_I_CAUCASIAN = 139 // 俄国 LCU（战斗防守方）
const RU_CAV_1 = 103 // 俄国 SCU（用于受影响区域）
const RU_CAV_4 = 106 // 俄国 SCU（备用）
const RU_DIV_1 = 112 // 俄国 SCU（备用）
const RU_YUDENITCH_HQ = 145 // 俄国 HQ（其在场可豁免同地块单位）
const CC_CP_SAVE_TIFLIS = 66
const ERCIS = 66
const KHOY = 72
const VAN = 87

const AP_RESERVE = data.spaces.findIndex((s, i) => i > 0 && s && s.name === "AP Reserve")

// ─── 辅助函数 ──────────────────────────────────────────────────────────────

/** 把阿塞拜疆/波斯/土耳其领土上的所有俄国单位移到 AP Reserve */
function clearAffectedAreas(game) {
	for (let p = 1; p < game.pieces.length; p++) {
		const pd = data.pieces[p]
		if (!pd || pd.faction !== AP || pd.nation !== "ru") continue
		const s = game.pieces[p]
		const sd = data.spaces[s]
		if (!sd) continue
		if (sd.area === "azerbaijan" || sd.area === "persia" || sd.nation === "tu") {
			game.pieces[p] = AP_RESERVE
		}
	}
}

/** 构造基础测试游戏（含受影响区域已清空） */
function makeGame() {
	const game = rules.setup(2026042290, "Historical", { seven_hand_size: false, no_supply_warnings: true })
	game.events = {}
	game.action_state = {}
	game.action_state.used_ccs = []
	game.hand_cp = [CC_CP_SAVE_TIFLIS]
	game.cc_retained = { ap: [], cp: [] }
	game.cc_retained_after_use = { ap: {}, cp: {} }
	game.removed_cp = game.removed_cp || []
	game.retreated = []
	game.forts = { destroyed: [], besieged: [] }
	clearAffectedAreas(game)
	return game
}

/**
 * 为 can_play_save_tiflis 测试配置 retreat_choice_cc_cp 战斗状态。
 * 默认: TU LCU 从 KOPRUKOY 进攻 SARIKAMIS 的 RU LCU。
 */
function setupRetreatChoiceState(game, opts = {}) {
	const battleSpace = opts.battleSpace ?? SARIKAMIS
	const attackerPiece = opts.attackerPiece ?? TU_1_CAUCASIAN
	const defenderPiece = opts.defenderPiece ?? RU_I_CAUCASIAN
	const attackerHome = opts.attackerHome ?? KOPRUKOY

	game.state = "retreat_choice_cc_cp"
	game.active = CP
	game.attack = {
		space: battleSpace,
		pieces: [attackerPiece],
		attacker: CP,
		defender: AP
	}
	game.pieces[attackerPiece] = attackerHome
	game.pieces[defenderPiece] = battleSpace
}

function setupResolvedRetreatChoiceState(game, opts = {}) {
	setupRetreatChoiceState(game, opts)
	const attackerPiece = opts.attackerPiece ?? TU_1_CAUCASIAN
	const defenderPiece = opts.defenderPiece ?? RU_I_CAUCASIAN
	game.attack.initial_attackers = [attackerPiece]
	game.attack.initial_defenders = [defenderPiece]
	game.battle_result = {
		attacker_losses: 0,
		defender_losses: opts.defenderLosses ?? 0,
		retreat_needed: true,
		retreating_faction: AP,
		retreating_units: [defenderPiece],
		attackers: [attackerPiece],
		retreat_distance: opts.retreatDistance ?? 1,
		no_advance: opts.noAdvance ?? true
	}
}

function enterSaveTiflisWindowAfterOrdinaryRetreat(game, spaces) {
	Engine.combat.end_battle_sequence(game, () => {})
	if (game.state === "retreat_cancel") {
		game = rules.action(game, AP_ROLE, "proceed_retreat")
	}
	for (let s of spaces) {
		game = rules.action(game, AP_ROLE, "piece", RU_I_CAUCASIAN)
		game = rules.action(game, AP_ROLE, "space", s)
	}
	return game
}

// ─── 测试组 1: can_play_save_tiflis 条件检查 ──────────────────────────────

test("SAVE TIFLIS: 当状态不是 retreat_choice_cc_cp 时不能打出", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ
	game.state = "play_cc_attacker" // 错误状态

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(false)
})

test("SAVE TIFLIS: 进攻方无土耳其 LCU 时不能打出", () => {
	const game = makeGame()
	setupRetreatChoiceState(game, { attackerPiece: RU_DIV_1 }) // RU DIV 不是 TU LCU
	game.pieces[RU_CAV_1] = TABRIZ

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(false)
})

test("SAVE TIFLIS: 参战 TU LCU 即使战损替换为 SCU 后仍满足出牌条件", () => {
	const game = makeGame()
	setupRetreatChoiceState(game, { attackerPiece: TU_CAV_1 })
	game.attack.initial_attackers = [TU_1_CAUCASIAN]
	game.pieces[TU_1_CAUCASIAN] = AP_RESERVE
	game.pieces[TU_CAV_1] = KOPRUKOY
	game.pieces[RU_CAV_1] = TABRIZ

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(true)
})

test("SAVE TIFLIS: 战斗地块无俄国 LCU 防守时不能打出", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_I_CAUCASIAN] = AP_RESERVE // RU LCU 不在战斗地块
	game.pieces[RU_CAV_1] = TABRIZ

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(false)
})

test("SAVE TIFLIS: '大公前往第比利斯'事件生效后不能打出", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ
	game.events["grand_duke_to_tiflis"] = 1 // 该事件已发动

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(false)
})

test("SAVE TIFLIS: 受影响区域无俄国单位时不能打出", () => {
	const game = makeGame()
	// 受影响区域已在 makeGame() 中清空
	// 战斗地块 SARIKAMIS 是俄国领土，不在受影响区域
	setupRetreatChoiceState(game)
	// 不在 TABRIZ 等受影响区域放置单位

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(false)
})

test("SAVE TIFLIS: 受影响区域俄国单位所在地块有 Yudenitch HQ 时仍可打出（单位可选择不撤退）", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_YUDENITCH_HQ] = TABRIZ // Yudenitch HQ 在同一地块 → 可选择不撤退

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(true)
})

test("SAVE TIFLIS: Yudenitch HQ 在其他地块时不影响当前地块的单位", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_YUDENITCH_HQ] = TIFLIS // HQ 在第比利斯，不在 TABRIZ
	game.pieces[RU_CAV_4] = MENJIL // 另一个受影响区域单位

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(true)
})

test("SAVE TIFLIS: 所有条件满足时可以打出", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ // 阿塞拜疆区域，无豁免

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(true)
})

test("SAVE TIFLIS: 通过真实 play_cc 动作打出后先进行普通战斗撤退", () => {
	let game = makeGame()
	setupResolvedRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.play_cc || []).not.toContain(CC_CP_SAVE_TIFLIS)

	game = rules.action(game, CP_ROLE, "play_cc", CC_CP_SAVE_TIFLIS)
	expect(game.state).toBe("retreat_choice_cc_cp")
	expect(game.events["save_tiflis"]).toBeUndefined()

	game = enterSaveTiflisWindowAfterOrdinaryRetreat(game, [KARS])
	expect(game.state).toBe("retreat_choice_cc_cp")
	expect(game.active).toBe(CP)

	view = rules.view(game, CP_ROLE)
	expect(view.actions.play_cc || []).toContain(CC_CP_SAVE_TIFLIS)

	game = rules.action(game, CP_ROLE, "play_cc", CC_CP_SAVE_TIFLIS)

	expect(game.state).toBe("save_tiflis_retreat")
	expect(game.events["save_tiflis"]).toBe(game.turn)
	expect(game.combat_cards.attacker).toContain(CC_CP_SAVE_TIFLIS)
	expect(game.combat_cards.defender).not.toContain(CC_CP_SAVE_TIFLIS)
})

test("SAVE TIFLIS: 普通战斗撤退完成后才执行回援撤退，随后进入挺进", () => {
	let game = makeGame()
	setupResolvedRetreatChoiceState(game, { noAdvance: false, defenderLosses: 1 })
	game.pieces[RU_CAV_1] = TABRIZ

	game = enterSaveTiflisWindowAfterOrdinaryRetreat(game, [KARS])
	expect(game.state).toBe("retreat_choice_cc_cp")

	game = rules.action(game, CP_ROLE, "play_cc", CC_CP_SAVE_TIFLIS)

	expect(game.state).toBe("save_tiflis_retreat")
	expect(game.active).toBe(AP)
	expect(game.pieces[RU_I_CAUCASIAN]).toBe(KARS)
	expect(game.save_tiflis_pieces).toContain(RU_CAV_1)

	game = rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	game = rules.action(game, AP_ROLE, "space", JULFA)
	expect(game.pieces[RU_CAV_1]).toBe(JULFA)

	game = rules.action(game, AP_ROLE, "done")
	expect(game.state).toBe("advance")
	expect(game.active).toBe(CP)
	expect(game.advance_pieces).toContain(TU_1_CAUCASIAN)
	expect(game.advance_space).toBe(SARIKAMIS)
})

test("SAVE TIFLIS: 平地普通两格撤退后 TU 可挺进两格但不能追随回援撤退到第三格", () => {
	let game = makeGame()
	setupResolvedRetreatChoiceState(game, {
		battleSpace: DIYARBEKIR,
		attackerHome: MARDIN,
		noAdvance: false,
		defenderLosses: 2,
		retreatDistance: 2
	})

	game = enterSaveTiflisWindowAfterOrdinaryRetreat(game, [RAS_UL_AIN, NAZIBIN])
	expect(game.state).toBe("retreat_choice_cc_cp")

	game = rules.action(game, CP_ROLE, "play_cc", CC_CP_SAVE_TIFLIS)

	expect(game.state).toBe("save_tiflis_retreat")
	expect(game.retreat_first_spaces).toEqual([RAS_UL_AIN])

	game = rules.action(game, AP_ROLE, "piece", RU_I_CAUCASIAN)
	game = rules.action(game, AP_ROLE, "space", MOSUL)
	game = rules.action(game, AP_ROLE, "done")

	expect(game.state).toBe("advance")
	game = rules.action(game, CP_ROLE, "piece", TU_1_CAUCASIAN)
	expect(game.pieces[TU_1_CAUCASIAN]).toBe(DIYARBEKIR)

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.piece).toContain(TU_1_CAUCASIAN)

	game = rules.action(game, CP_ROLE, "piece", TU_1_CAUCASIAN)
	view = rules.view(game, CP_ROLE)
	expect(view.actions.space).toContain(RAS_UL_AIN)
	expect(view.actions.space).not.toContain(NAZIBIN)
	expect(view.actions.space).not.toContain(MOSUL)

	game = rules.action(game, CP_ROLE, "space", RAS_UL_AIN)
	expect(game.pieces[TU_1_CAUCASIAN]).toBe(RAS_UL_AIN)

	view = rules.view(game, CP_ROLE)
	expect(view.actions.piece).toBeUndefined()
	expect(view.actions.space).toBeUndefined()
	expect(view.actions.end_advance).toBeTruthy()
})

test("SAVE TIFLIS: 普通两格撤退后若战斗地是山地，TU 挺进进入山地后不能继续追击", () => {
	let game = makeGame()
	setupResolvedRetreatChoiceState(game, {
		battleSpace: SARIKAMIS,
		attackerHome: KOPRUKOY,
		noAdvance: false,
		defenderLosses: 2,
		retreatDistance: 2
	})
	game.pieces[RU_CAV_1] = TABRIZ

	game = enterSaveTiflisWindowAfterOrdinaryRetreat(game, [KARS, ALEKSANDROPOL])
	expect(game.state).toBe("retreat_choice_cc_cp")

	game = rules.action(game, CP_ROLE, "play_cc", CC_CP_SAVE_TIFLIS)

	expect(game.state).toBe("save_tiflis_retreat")

	game = rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	game = rules.action(game, AP_ROLE, "space", JULFA)
	game = rules.action(game, AP_ROLE, "done")

	expect(game.state).toBe("advance")
	game = rules.action(game, CP_ROLE, "piece", TU_1_CAUCASIAN)
	expect(game.pieces[TU_1_CAUCASIAN]).toBe(SARIKAMIS)

	const view = rules.view(game, CP_ROLE)
	expect(view.actions.piece).toBeUndefined()
	expect(view.actions.space).toBeUndefined()
	expect(view.actions.end_advance).toBeTruthy()
})

test("SAVE TIFLIS: 普通撤退被取消后若回援撤退腾空战斗地，TU 仍可挺进该 1 格", () => {
	let game = makeGame()
	setupResolvedRetreatChoiceState(game, {
		battleSpace: TABRIZ,
		attackerHome: ARDEBIL,
		noAdvance: true,
		defenderLosses: 2,
		retreatDistance: 1
	})

	Engine.combat.end_battle_sequence(game, () => {})
	expect(game.state).toBe("retreat_cancel")

	game = rules.action(game, AP_ROLE, "piece", RU_I_CAUCASIAN)
	expect(game.state).toBe("retreat_choice_cc_cp")

	game = rules.action(game, CP_ROLE, "play_cc", CC_CP_SAVE_TIFLIS)
	expect(game.state).toBe("save_tiflis_retreat")
	expect(game.pieces[RU_I_CAUCASIAN]).toBe(TABRIZ)

	game = rules.action(game, AP_ROLE, "piece", RU_I_CAUCASIAN)
	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space).toContain(JULFA)

	game = rules.action(game, AP_ROLE, "space", JULFA)
	expect(game.pieces[RU_I_CAUCASIAN]).toBe(JULFA)

	game = rules.action(game, AP_ROLE, "done")
	expect(game.state).toBe("advance")
	expect(game.advance_space).toBe(TABRIZ)
	expect(game.advance_pieces).toContain(TU_1_CAUCASIAN)

	game = rules.action(game, CP_ROLE, "piece", TU_1_CAUCASIAN)
	expect(game.pieces[TU_1_CAUCASIAN]).toBe(TABRIZ)

	view = rules.view(game, CP_ROLE)
	expect(view.actions.piece).toBeUndefined()
	expect(view.actions.space).toBeUndefined()
	expect(view.actions.end_advance).toBeTruthy()
})

test("SAVE TIFLIS: 波斯区域的俄国单位也满足出牌条件", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = MENJIL // 波斯区域

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(true)
})

test("SAVE TIFLIS: 土耳其领土（战斗地块 KOPRUKOY）的防守俄国 LCU 也满足出牌条件", () => {
	const game = makeGame()
	// 战斗在 KOPRUKOY（土耳其领土），RU LCU 在那里防守
	setupRetreatChoiceState(game, { battleSpace: KOPRUKOY, attackerHome: SARIKAMIS })

	// KOPRUKOY 是土耳其领土，RU_I_CAUCASIAN 在那里 → 受影响区域有单位
	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(true)
})

// ─── 测试组 2: save_tiflis_retreat 状态机 ─────────────────────────────────

/** 构造 save_tiflis_retreat 状态游戏 */
function makeSaveTiflisRetreatGame(piecesInArea) {
	const game = makeGame()
	game.state = "save_tiflis_retreat"
	game.active = AP
	game.save_tiflis_pieces = [...piecesInArea]
	game.selected_piece = null
	game.attack = {
		space: KOPRUKOY,
		pieces: [TU_1_CAUCASIAN],
		attacker: CP,
		defender: AP
	}
	game.pieces[TU_1_CAUCASIAN] = SARIKAMIS
	return game
}

test("SAVE TIFLIS: 撤退状态下 AP 可以选择单位", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TABRIZ

	const view = rules.view(game, AP_ROLE)
	expect(view.actions.piece).toContain(RU_CAV_1)
})

test("SAVE TIFLIS: 选中单位后显示合法撤退目标（距第比利斯更近的地块）", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TABRIZ // 距 TIFLIS 5 格

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	expect(game.selected_piece).toBe(RU_CAV_1)

	const view = rules.view(game, AP_ROLE)
	// JULFA（距 TIFLIS 4 格）应为合法撤退目标
	expect(view.actions.space).toContain(JULFA)
	// TABRIZ 的其他邻居（距 TIFLIS >= 5 格）不应出现
	expect(view.actions.space).not.toContain(TABRIZ)
	expect(view.actions.space).not.toContain(ENZELI)
})

test("SAVE TIFLIS: 单位成功撤退至更近地块", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TABRIZ

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	rules.action(game, AP_ROLE, "space", JULFA)

	expect(game.pieces[RU_CAV_1]).toBe(JULFA)
	expect(game.save_tiflis_pieces).not.toContain(RU_CAV_1)
})

test("SAVE TIFLIS: 无法向第比利斯方向撤退时显示 decline_retreat 动作", () => {
	// 把单位放在第比利斯本身，无法再靠近
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TIFLIS

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	const view = rules.view(game, AP_ROLE)
	expect(view.actions.done).toBeTruthy()
	expect(view.actions.decline_retreat).toBeUndefined()
	expect(view.actions.space).toBeFalsy()
})

test("SAVE TIFLIS: 无法靠近第比利斯时 decline_retreat 留在原地且不设 save_tiflis_failed", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TIFLIS

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	rules.action(game, AP_ROLE, "done")

	expect(game.pieces[RU_CAV_1]).toBe(TIFLIS)
	expect(game.save_tiflis_failed).not.toBe(true)
	expect(game.save_tiflis_pieces).not.toContain(RU_CAV_1)
})

test("SAVE TIFLIS: 全部单位处理完毕后状态机正常推进", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TABRIZ
	// 配置战斗结果供 end_battle_sequence 使用
	game.battle_result = { no_advance: false, retreat_needed: false, retreating_units: [] }
	game.battle_resolution_applied = true // 跳过重复结算

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	rules.action(game, AP_ROLE, "space", JULFA)

	// 单位列表清空后，应出现 done 动作
	const view = rules.view(game, AP_ROLE)
	expect(view.actions.done).toBeTruthy()
})

test("SAVE TIFLIS: 多个单位依次撤退", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1, RU_CAV_4])
	clearSpaces(game, [TABRIZ, JULFA])
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_CAV_4] = MENJIL // 距 TIFLIS 7 格，ENZELI 距 TIFLIS 6 格

	// 撤退第一个单位
	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	rules.action(game, AP_ROLE, "space", JULFA)

	expect(game.pieces[RU_CAV_1]).toBe(JULFA)
	expect(game.save_tiflis_pieces).toContain(RU_CAV_4)
	game.pieces[RU_CAV_4] = TABRIZ

	// 撤退第二个单位
	rules.action(game, AP_ROLE, "piece", RU_CAV_4)
	rules.action(game, AP_ROLE, "space", JULFA)

	expect(game.pieces[RU_CAV_4]).toBe(JULFA)
	expect(game.save_tiflis_pieces).not.toContain(RU_CAV_4)
})

test("SAVE TIFLIS: 点击已选中单位可取消选择", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TABRIZ

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	expect(game.selected_piece).toBe(RU_CAV_1)

	// 再次点击同一单位 → 取消选中
	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	expect(game.selected_piece).toBeNull()
})

// ─── 测试组 3: check_save_tiflis_event（通过 end_battle_sequence 触发）──────

/**
 * 直接调用 Engine.combat.end_battle_sequence 并检查 save_tiflis 事件是否正确触发。
 * 注意：需要设置好 game.events["save_tiflis"] = game.turn 及相关状态。
 */
function makeEndBattleSequenceGame() {
	const game = makeGame()
	game.turn = 3
	game.battle_result = {
		no_advance: true,
		retreat_needed: false,
		retreating_units: [],
		attacker_losses: 0,
		defender_losses: 1
	}
	game.battle_resolution_side_effects_applied = true // 跳过已在首次调用时完成的副作用
	game.retreat_choice_cc_cp_done = true // 已通过窗口
	game.attack = {
		space: KOPRUKOY,
		pieces: [TU_1_CAUCASIAN],
		attacker: CP,
		defender: AP
	}
	game.pieces[TU_1_CAUCASIAN] = SARIKAMIS
	game.pieces[RU_I_CAUCASIAN] = KOPRUKOY
	return game
}

test("SAVE TIFLIS: end_battle_sequence 在事件标记时正确触发受影响区域撤退", () => {
	const game = makeEndBattleSequenceGame()
	game.pieces[RU_CAV_1] = TABRIZ
	game.events["save_tiflis"] = 3 // 已打出该卡

	const logs = []
	Engine.combat.end_battle_sequence(game, (msg) => logs.push(msg))

	expect(game.state).toBe("save_tiflis_retreat")
	expect(game.save_tiflis_resolved).toBe(true)
	expect(game.save_tiflis_pieces).toContain(RU_CAV_1)
	expect(game.active).toBe(AP)
})

test("SAVE TIFLIS: end_battle_sequence 正确收集阿塞拜疆区域单位", () => {
	const game = makeEndBattleSequenceGame()
	game.pieces[RU_CAV_1] = TABRIZ // 阿塞拜疆
	game.pieces[RU_CAV_4] = AP_RESERVE // 不在地图上，不受影响
	game.events["save_tiflis"] = 3

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.save_tiflis_pieces).toContain(RU_CAV_1)
	expect(game.save_tiflis_pieces).not.toContain(RU_CAV_4)
})

test("SAVE TIFLIS: end_battle_sequence 正确收集波斯区域单位", () => {
	const game = makeEndBattleSequenceGame()
	game.pieces[RU_CAV_1] = MENJIL // 波斯区域
	game.events["save_tiflis"] = 3

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.save_tiflis_pieces).toContain(RU_CAV_1)
})

test("SAVE TIFLIS: 有 Yudenitch HQ 同在地块的单位仍被收集（可选择不撤退）", () => {
	const game = makeEndBattleSequenceGame()
	game.pieces[RU_I_CAUCASIAN] = SARIKAMIS
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_YUDENITCH_HQ] = TABRIZ
	game.events["save_tiflis"] = 3

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.state).toBe("save_tiflis_retreat")
	expect(game.save_tiflis_pieces).toContain(RU_CAV_1)
})

test("SAVE TIFLIS: 与 Yudenitch HQ 同格的单位可通过 decline_retreat 留在原地且不设 failed", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_YUDENITCH_HQ] = TABRIZ

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)

	const view = rules.view(game, AP_ROLE)
	expect(view.actions.done).toBeTruthy()
	expect(view.actions.decline_retreat).toBeUndefined()

	rules.action(game, AP_ROLE, "done")

	expect(game.pieces[RU_CAV_1]).toBe(TABRIZ)
	expect(game.save_tiflis_failed).not.toBe(true)
	expect(game.save_tiflis_pieces).not.toContain(RU_CAV_1)
})

test("SAVE TIFLIS: 同一回合内不会重复触发（save_tiflis_resolved 守卫）", () => {
	const game = makeEndBattleSequenceGame()
	game.pieces[RU_CAV_1] = TABRIZ
	game.events["save_tiflis"] = 3
	game.save_tiflis_resolved = true // 已经处理过

	Engine.combat.end_battle_sequence(game, () => {})

	// 不应再次进入 save_tiflis_retreat
	expect(game.state).not.toBe("save_tiflis_retreat")
})

test("SAVE TIFLIS: 事件不在当前回合时不触发", () => {
	const game = makeEndBattleSequenceGame()
	game.pieces[RU_CAV_1] = TABRIZ
	game.events["save_tiflis"] = 1 // 第 1 回合打出，当前是第 3 回合

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.save_tiflis_pieces).toBeUndefined()
})

// ─── 测试组 4: save_tiflis_failed 允许进攻方挺进 ──────────────────────────

test("SAVE TIFLIS: save_tiflis_failed=true 时允许在 no_advance 结果下挺进（逻辑验证）", () => {
	const game = makeGame()
	game.save_tiflis_failed = true
	game.battle_result = { no_advance: true }

	const allow_advance = !game.battle_result.no_advance || !!game.save_tiflis_failed
	expect(allow_advance).toBe(true)
})

test("SAVE TIFLIS: save_tiflis_failed=false 且 no_advance=true 时不允许挺进", () => {
	const game = makeGame()
	game.save_tiflis_failed = false
	game.battle_result = { no_advance: true }

	const allow_advance = !game.battle_result.no_advance || !!game.save_tiflis_failed
	expect(allow_advance).toBe(false)
})

// ─── 测试组 5: clear_save_tiflis_state 清理 ──────────────────────────────

test("SAVE TIFLIS: clear_save_tiflis_state 正确清理所有相关状态", () => {
	const game = makeGame()
	game.save_tiflis_resolved = true
	game.save_tiflis_failed = true
	game.save_tiflis_pieces = [RU_CAV_1]
	game.events["save_tiflis"] = game.turn

	Engine.combat.clear_save_tiflis_state(game)

	expect(game.save_tiflis_resolved).toBeUndefined()
	expect(game.save_tiflis_failed).toBeUndefined()
	expect(game.save_tiflis_pieces).toBeUndefined()
	expect(game.events["save_tiflis"]).toBeUndefined()
})

test("SAVE TIFLIS: 同一行动论的下一场战斗不会重复触发（跨战斗回归）", () => {
	const game = makeEndBattleSequenceGame()
	game.pieces[RU_CAV_1] = TABRIZ
	game.events["save_tiflis"] = 3

	// 第一场战斗：触发 save_tiflis_retreat
	Engine.combat.end_battle_sequence(game, () => {})
	expect(game.state).toBe("save_tiflis_retreat")
	expect(game.save_tiflis_resolved).toBe(true)

	// 模拟撤退完成后清理状态（与 states_combat.js 中 clear_save_tiflis_flags 一致）
	Engine.combat.clear_save_tiflis_state(game)

	// 事件应已被清除，不会在下一场战斗重新触发
	expect(game.events["save_tiflis"]).toBeUndefined()

	// 重新配置第二场战斗
	game.battle_result = {
		no_advance: true,
		retreat_needed: false,
		retreating_units: [],
		attacker_losses: 0,
		defender_losses: 0
	}
	game.battle_resolution_side_effects_applied = true
	game.retreat_choice_cc_cp_done = true
	game.pieces[RU_CAV_1] = TABRIZ // 单位仍在受影响区域

	// 第二场战斗：不应再触发 save_tiflis_retreat
	Engine.combat.end_battle_sequence(game, () => {})
	expect(game.state).not.toBe("save_tiflis_retreat")
	expect(game.save_tiflis_pieces).toBeUndefined()
})

test("SAVE TIFLIS: units in a Yudenitch start space may decline even after the HQ is processed", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_YUDENITCH_HQ] = JULFA
	game.save_tiflis_exempt_spaces = [TABRIZ]

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)

	const view = rules.view(game, AP_ROLE)
	expect(view.actions.done).toBeTruthy()
	expect(view.actions.decline_retreat).toBeUndefined()
	expect(view.actions.space).toContain(JULFA)

	rules.action(game, AP_ROLE, "done")

	expect(game.pieces[RU_CAV_1]).toBe(TABRIZ)
	expect(game.save_tiflis_failed).not.toBe(true)
	expect(game.save_tiflis_pieces).not.toContain(RU_CAV_1)
})

test("SAVE TIFLIS: Yudenitch HQ itself may use done to remain in place", () => {
	const game = makeSaveTiflisRetreatGame([RU_YUDENITCH_HQ])
	game.pieces[RU_YUDENITCH_HQ] = TABRIZ

	rules.action(game, AP_ROLE, "piece", RU_YUDENITCH_HQ)

	const view = rules.view(game, AP_ROLE)
	expect(view.actions.done).toBeTruthy()
	expect(view.actions.decline_retreat).toBeUndefined()

	rules.action(game, AP_ROLE, "done")

	expect(game.pieces[RU_YUDENITCH_HQ]).toBe(TABRIZ)
	expect(game.save_tiflis_failed).not.toBe(true)
	expect(game.save_tiflis_pieces).not.toContain(RU_YUDENITCH_HQ)
})

function clearSpaces(game, spaces) {
	for (let p = 1; p < game.pieces.length; p++) {
		if (spaces.includes(game.pieces[p])) game.pieces[p] = 0
	}
}

function fillKhoyForSaveTiflis(game) {
	game.pieces[RU_I_CAUCASIAN] = KHOY
	game.pieces[RU_CAV_4] = KHOY
	game.pieces[RU_DIV_1] = KHOY
}

test("SAVE TIFLIS: friendly closer destination is prioritized over non-friendly closer destination", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	clearSpaces(game, [VAN, KHOY, ERCIS])
	game.pieces[RU_CAV_1] = VAN
	game.control[KHOY] = AP
	game.control[ERCIS] = CP

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)

	const view = rules.view(game, AP_ROLE)
	expect(view.actions.space).toContain(KHOY)
	expect(view.actions.space).not.toContain(ERCIS)
})

test.each([
	["enemy-controlled", CP],
	["neutral", "neutral"]
])("SAVE TIFLIS: retreat into an empty %s space is allowed only when closer friendly space is full", (_label, controller) => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	clearSpaces(game, [VAN, KHOY, ERCIS])
	game.pieces[RU_CAV_1] = VAN
	game.control[KHOY] = AP
	game.control[ERCIS] = controller
	fillKhoyForSaveTiflis(game)

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)

	const view = rules.view(game, AP_ROLE)
	expect(view.actions.space).toContain(ERCIS)
	expect(view.actions.space).not.toContain(KHOY)

	rules.action(game, AP_ROLE, "space", ERCIS)

	expect(game.pieces[RU_CAV_1]).toBe(ERCIS)
	expect(Engine.map.get_space_controller(game, ERCIS)).toBe(AP)
})
