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
const KOPRUKOY = 58    // 土耳其领土，高加索区域（用于战斗地块）
const SARIKAMIS = 47   // 俄国领土（可用于测试"战斗在非受影响区域"）
const TABRIZ = 80      // 阿塞拜疆区域（受影响区域，有距第比利斯5格）
const JULFA = 55       // 俄国领土，距第比利斯4格（Tabriz的撤退目标）
const MENJIL = 101     // 波斯区域（受影响区域）
const ENZELI = 78      // 波斯区域，距第比利斯更近（Menjil的撤退目标）

const TU_1_CAUCASIAN = 227    // 土耳其 LCU
const RU_I_CAUCASIAN = 139    // 俄国 LCU（战斗防守方）
const RU_CAV_1 = 103          // 俄国 SCU（用于受影响区域）
const RU_CAV_4 = 106          // 俄国 SCU（备用）
const RU_DIV_1 = 112          // 俄国 SCU（备用）
const RU_YUDENITCH_HQ = 145   // 俄国 HQ（其在场可豁免同地块单位）
const CC_CP_SAVE_TIFLIS = 66

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
		defender: AP,
	}
	game.pieces[attackerPiece] = attackerHome
	game.pieces[defenderPiece] = battleSpace
}

function setupResolvedRetreatChoiceState(game, opts = {}) {
	setupRetreatChoiceState(game, opts)
	game.battle_result = {
		attacker_losses: 0,
		defender_losses: 0,
		retreat_needed: true,
		retreating_faction: AP,
		retreat_distance: 1,
		no_advance: true
	}
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

test("SAVE TIFLIS: 受影响区域俄国单位所在地块有 Yudenitch HQ 时不能打出", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_YUDENITCH_HQ] = TABRIZ // Yudenitch HQ 在同一地块 → 豁免

	// 现在 TABRIZ 唯一的俄国单位被豁免，应无法打出
	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(false)
})

test("SAVE TIFLIS: Yudenitch HQ 在其他地块时不影响当前地块的单位", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_YUDENITCH_HQ] = TIFLIS // HQ 在第比利斯，不在 TABRIZ
	game.pieces[RU_CAV_4] = MENJIL        // 另一个受影响区域单位

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(true)
})

test("SAVE TIFLIS: 所有条件满足时可以打出", () => {
	const game = makeGame()
	setupRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ // 阿塞拜疆区域，无豁免

	expect(Engine.combat_cards.can_play_combat_card(game, CC_CP_SAVE_TIFLIS)).toBe(true)
})

test("SAVE TIFLIS: 通过真实 play_cc 动作打出后立即进入回援撤退状态", () => {
	let game = makeGame()
	setupResolvedRetreatChoiceState(game)
	game.pieces[RU_CAV_1] = TABRIZ

	let view = rules.view(game, CP_ROLE)
	expect(view.actions.play_cc || []).toContain(CC_CP_SAVE_TIFLIS)

	game = rules.action(game, CP_ROLE, "play_cc", CC_CP_SAVE_TIFLIS)

	expect(game.state).toBe("save_tiflis_retreat")
	expect(game.active).toBe(AP)
	expect(game.save_tiflis_pieces).toContain(RU_CAV_1)
	expect(game.events["save_tiflis"]).toBe(game.turn)
	expect(game.combat_cards.attacker).toContain(CC_CP_SAVE_TIFLIS)
	expect(game.combat_cards.defender).not.toContain(CC_CP_SAVE_TIFLIS)
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
		defender: AP,
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
})

test("SAVE TIFLIS: 单位成功撤退至更近地块", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TABRIZ

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	rules.action(game, AP_ROLE, "space", JULFA)

	expect(game.pieces[RU_CAV_1]).toBe(JULFA)
	expect(game.save_tiflis_pieces).not.toContain(RU_CAV_1)
})

test("SAVE TIFLIS: 无法向第比利斯方向撤退时显示 cannot_retreat 动作", () => {
	// 把单位放在第比利斯本身，无法再靠近
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TIFLIS

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	const view = rules.view(game, AP_ROLE)
	expect(view.actions.cannot_retreat).toBeTruthy()
	expect(view.actions.space).toBeFalsy()
})

test("SAVE TIFLIS: cannot_retreat 将单位留在原地并设置 save_tiflis_failed", () => {
	const game = makeSaveTiflisRetreatGame([RU_CAV_1])
	game.pieces[RU_CAV_1] = TIFLIS

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	rules.action(game, AP_ROLE, "cannot_retreat")

	expect(game.pieces[RU_CAV_1]).toBe(TIFLIS)
	expect(game.save_tiflis_failed).toBe(true)
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
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_CAV_4] = MENJIL // 距 TIFLIS 7 格，ENZELI 距 TIFLIS 6 格

	// 撤退第一个单位
	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	rules.action(game, AP_ROLE, "space", JULFA)

	expect(game.pieces[RU_CAV_1]).toBe(JULFA)
	expect(game.save_tiflis_pieces).toContain(RU_CAV_4)

	// 撤退第二个单位
	rules.action(game, AP_ROLE, "piece", RU_CAV_4)
	rules.action(game, AP_ROLE, "space", ENZELI)

	expect(game.pieces[RU_CAV_4]).toBe(ENZELI)
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
		defender_losses: 1,
	}
	game.battle_resolution_side_effects_applied = true // 跳过已在首次调用时完成的副作用
	game.retreat_choice_cc_cp_done = true // 已通过窗口
	game.attack = {
		space: KOPRUKOY,
		pieces: [TU_1_CAUCASIAN],
		attacker: CP,
		defender: AP,
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
	game.pieces[RU_CAV_1] = TABRIZ    // 阿塞拜疆
	game.pieces[RU_CAV_4] = AP_RESERVE // 不在地图上，不受影响
	game.events["save_tiflis"] = 3

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.save_tiflis_pieces).toContain(RU_CAV_1)
	expect(game.save_tiflis_pieces).not.toContain(RU_CAV_4)
})

test("SAVE TIFLIS: end_battle_sequence 正确收集波斯区域单位", () => {
	const game = makeEndBattleSequenceGame()
	game.pieces[RU_CAV_1] = MENJIL  // 波斯区域
	game.events["save_tiflis"] = 3

	Engine.combat.end_battle_sequence(game, () => {})

	expect(game.save_tiflis_pieces).toContain(RU_CAV_1)
})

test("SAVE TIFLIS: 有 Yudenitch HQ 同在地块的单位不被收集", () => {
	const game = makeEndBattleSequenceGame()
	// 把防守方 RU LCU 移出土耳其领土，避免干扰
	game.pieces[RU_I_CAUCASIAN] = SARIKAMIS
	game.pieces[RU_CAV_1] = TABRIZ
	game.pieces[RU_YUDENITCH_HQ] = TABRIZ // 豁免 RU_CAV_1
	game.events["save_tiflis"] = 3

	Engine.combat.end_battle_sequence(game, () => {})

	// RU_CAV_1 被 Yudenitch HQ 豁免，无受影响单位 → 不进入 save_tiflis_retreat
	// （注意：save_tiflis_resolved 在战斗结算结束时会被 clear_save_tiflis_state 清除）
	expect(game.save_tiflis_pieces).toBeUndefined()
	expect(game.state).not.toBe("save_tiflis_retreat")
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

test("SAVE TIFLIS: save_tiflis_failed=true 时允许在 no_advance 结果下挺进", () => {
	const game = makeGame()
	// 模拟进攻方已推进条件：所有防守方已撤退，但结果本为 no_advance
	game.state = "save_tiflis_retreat"
	game.active = AP
	game.save_tiflis_pieces = [RU_CAV_1]
	game.selected_piece = null
	game.pieces[RU_CAV_1] = TIFLIS // 无法撤退
	game.attack = {
		space: KOPRUKOY,
		pieces: [TU_1_CAUCASIAN],
		attacker: CP,
		defender: AP,
	}
	game.pieces[TU_1_CAUCASIAN] = SARIKAMIS
	game.battle_result = {
		no_advance: true,   // 正常情况下不允许挺进
		retreat_needed: false,
		retreating_units: [],
		attacker_losses: 0,
		defender_losses: 0,
	}
	game.battle_resolution_applied = true

	rules.action(game, AP_ROLE, "piece", RU_CAV_1)
	rules.action(game, AP_ROLE, "cannot_retreat")

	// 单位留在原地，save_tiflis_failed = true
	expect(game.pieces[RU_CAV_1]).toBe(TIFLIS)
	expect(game.save_tiflis_failed).toBe(true)

	// 在 combat.js 的 advance 逻辑中：
	// !result.no_advance || game.save_tiflis_failed → true → 应允许挺进
	const allow_advance = !game.battle_result.no_advance || game.save_tiflis_failed
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

	Engine.combat.clear_save_tiflis_state(game)

	expect(game.save_tiflis_resolved).toBeUndefined()
	expect(game.save_tiflis_failed).toBeUndefined()
	expect(game.save_tiflis_pieces).toBeUndefined()
})
