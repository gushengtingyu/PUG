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
			s.type !== "generated_gap" &&
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

function findCardByName(name) {
	let id = data.cards.findIndex((c) => c && (c.name === name || c.event === name))
	if (id < 0) throw new Error(`未找到卡牌: ${name}`)
	return id
}

describe("土耳其撤退与战斗系统回归测试 (精简版)", () => {
	test("防守方全灭时不进入土耳其撤退", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.post_roll_cc_done = true
		game.pieces[cpTuScu] = ELIMINATED
		game.battle_result = createBattleResult(apPiece, cpTuScu, { turkish_retreat_units: [cpTuScu] })
		Engine.combat.end_battle_sequence(game, () => { })
		expect(game.state).toBe("attack")
	})

	test("存活单位进入土耳其撤退", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.post_roll_cc_done = true
		game.battle_result = createBattleResult(apPiece, cpTuScu)
		Engine.combat.end_battle_sequence(game, () => { })
		expect(game.state).toBe("turkish_retreat")
		expect(game.turkish_retreat_mandatory).toContain(cpTuScu)
	})

	test("土耳其撤退结束后进入挺进", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.pieces[cpTuScu] = ELIMINATED
		game.attack.defender_losses = 3
		game.attack.defender_losses_absorbed = 3
		game.turkish_retreat_mandatory = []
		game.battle_result = createBattleResult(apPiece, cpTuScu, { no_advance: false })
		Engine.combat.finish_turkish_retreat(game, () => { })
		expect(game.state).toBe("advance")
	})

	test("空队列 done 动作处理", () => {
		let { game, cpTuScu, targetSpace } = createMinimalBattleGame()
		game.state = "turkish_retreat"
		game.active = CP
		game.turkish_retreat_space = targetSpace
		game.turkish_retreat_mandatory = []
		game.battle_result = createBattleResult(game.attack.pieces[0], cpTuScu, { no_advance: false })
		rules.action(game, "Central Powers", "done")
		expect(["advance", "end_operations", "attack"]).toContain(game.state)
	})

	test("英俄突袭挺进逻辑", () => {
		let apPieces = findPieceIds((p) => p.faction === AP && p.nation === "in" && p.piece_class === "SCU", 3)
		let { game, cpTuScu } = createMinimalBattleGame()
		let basra = data.spaces.findIndex((s) => s && s.name === "Basra")
		game.events.russo_british_assault = true
		game.state = "advance"
		game.active = AP
		game.advance_space = basra
		game.advance_limit = 3
		game.advance_pieces = apPieces.slice()
		game.attack.space = basra
		game.battle_result = createBattleResult(apPieces[0], cpTuScu, { no_advance: false })

		for (let p of apPieces) rules.action(game, "Allied Powers", "piece", p)
		expect(game.advance_count).toBe(3)
		rules.action(game, "Allied Powers", "end_advance")
		expect(game.state).not.toBe("advance")
	})

	test("战后战斗卡保留确认", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		game.active = CP
		game.cc_retained = { ap: [5], cp: [] }
		game.post_roll_cc_done = true
		game.reduced = [cpTuScu]
		game.attack.reserves_to_front_damaged_pieces = [cpTuScu]
		game.battle_result = createBattleResult(apPiece, cpTuScu, { no_advance: true, turkish_retreat: false })
		game.hand_cp = [59]

		Engine.combat.end_battle_sequence(game, (msg) => { game.log = game.log || []; game.log.push(msg) })
		expect(game.state).toBe("post_battle_cc_cp")
		rules.action(game, "Central Powers", "done")
		expect(game.state).not.toBe("post_battle_cc_cp")
	})

	test("重建单位卡牌逻辑", () => {
		let { game, apPiece, cpTuScu, targetSpace } = createMinimalBattleGame()
		let cpTuLcu = findPieceId((p) => p.faction === CP && p.nation === "tu" && p.piece_class === "LCU")
		game.state = "post_battle_cc_cp"
		game.active = CP
		game.pieces[cpTuScu] = ELIMINATED
		game.pieces[cpTuLcu] = ELIMINATED
		game.hand_cp = [59]
		game.rp_cp = { tu: 2 }
		game.attack.reserves_to_front_damaged_pieces = [cpTuScu, cpTuLcu]
		game.post_battle_cc_resume = { kind: "advance", advance_space: targetSpace }
		game.battle_result = createBattleResult(apPiece, cpTuScu, { no_advance: false })

		rules.action(game, "Central Powers", "play_cc", 59)
		rules.action(game, "Central Powers", "piece", cpTuScu)
		rules.action(game, "Central Powers", "piece", cpTuLcu)
		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("post_battle_cc_cp")
		rules.action(game, "Central Powers", "done")
		expect(game.state).toBe("advance")
	})

	test("无恶劣天气战斗时背包计谋进入标准窗口", () => {
		let { game } = createMinimalBattleGame()
		let card = findCardByName("HAVERSACK RUSE CC")
		let apBrLcu = findPieceId((p) => p.faction === AP && p.nation === "br" && p.piece_class === "LCU" && p.type !== "hq")
		let plainTarget = data.spaces.findIndex(
			(s) =>
				s &&
				s.terrain !== "mountain" &&
				s.terrain !== "swamp" &&
				s.terrain !== "desert" &&
				Array.isArray(s.connections) &&
				s.connections.length > 0
		)
		let plainFrom = data.spaces[plainTarget].connections[0]
		game.events.allenby = true
		game.hand_ap = [card]
		game.pieces[apBrLcu] = plainFrom
		game.attack.space = plainTarget
		game.attack.pieces = [apBrLcu]
		game.active = AP
		game.state = "pre_weather_cc_attacker"
		expect(Engine.combat.can_battle_trigger_severe_weather(game)).toBe(false)
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(false)
		game.state = "play_cc_attacker"
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(true)
	})

	test("有恶劣天气战斗时背包计谋进入天气前窗口", () => {
		let { game } = createMinimalBattleGame()
		let card = findCardByName("HAVERSACK RUSE CC")
		let apBrLcu = findPieceId((p) => p.faction === AP && p.nation === "br" && p.piece_class === "LCU" && p.type !== "hq")
		let desertTarget = data.spaces.findIndex((s) => s && s.terrain === "desert" && Array.isArray(s.connections) && s.connections.length > 0)
		let desertFrom = data.spaces[desertTarget].connections[0]
		game.turn = 4
		game.events.allenby = true
		game.hand_ap = [card]
		game.pieces[apBrLcu] = desertFrom
		game.attack.space = desertTarget
		game.attack.pieces = [apBrLcu]
		game.active = AP
		game.state = "pre_weather_cc_attacker"
		expect(Engine.combat.can_battle_trigger_severe_weather(game)).toBe(true)
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(true)
		game.state = "play_cc_attacker"
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(false)
	})

	test("巴尔干厌战第十回合开始可打出", () => {
		let { game, targetSpace } = createMinimalBattleGame()
		let card = findCardByName("WAR WEARY BALKANS CC")
		let buPiece = findPieceId((p) => p.faction === CP && p.nation === "bu" && p.type !== "hq")
		let apBrLcu = findPieceId((p) => p.faction === AP && p.nation === "br" && p.piece_class === "LCU" && p.type !== "hq")
		let sbOrBuSpace = data.spaces.findIndex((s) => s && (s.nation === "sb" || s.nation === "bu"))
		game.turn = 10
		game.state = "play_cc_attacker"
		game.active = AP
		game.hand_ap = [card]
		game.control[sbOrBuSpace] = AP
		game.pieces[buPiece] = targetSpace
		game.attack.initial_defenders = [buPiece]
		game.pieces[apBrLcu] = game.attack.from[0]
		game.attack.pieces = [apBrLcu]
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(true)
	})

	test("无恶劣天气战斗时帕夏一号进入标准窗口", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		let card = findCardByName("PASHA 1 CC")
		let cpGeLcu = findPieceId((p) => p.faction === CP && p.nation === "ge" && p.piece_class === "LCU" && p.type !== "hq")
		let plainTarget = data.spaces.findIndex(
			(s) =>
				s &&
				s.terrain !== "mountain" &&
				s.terrain !== "swamp" &&
				s.terrain !== "desert" &&
				Array.isArray(s.connections) &&
				s.connections.length > 0
		)
		let plainFrom = data.spaces[plainTarget].connections[0]
		game.hand_cp = [card]
		game.active = CP
		game.state = "pre_weather_cc_attacker"
		game.attack.attacker = CP
		game.attack.defender = AP
		game.attack.space = plainTarget
		game.attack.pieces = [cpGeLcu]
		game.attack.from = [plainFrom]
		game.attack.initial_defenders = [apPiece]
		game.pieces[cpGeLcu] = plainFrom
		game.pieces[apPiece] = plainTarget
		game.pieces[cpTuScu] = ELIMINATED
		expect(Engine.combat.can_battle_trigger_severe_weather(game)).toBe(false)
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(false)
		game.state = "play_cc_attacker"
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(true)
	})

	test("有恶劣天气战斗时帕夏一号进入天气前窗口", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		let card = findCardByName("PASHA 1 CC")
		let cpGeLcu = findPieceId((p) => p.faction === CP && p.nation === "ge" && p.piece_class === "LCU" && p.type !== "hq")
		let desertTarget = data.spaces.findIndex((s) => s && s.terrain === "desert" && Array.isArray(s.connections) && s.connections.length > 0)
		let desertFrom = data.spaces[desertTarget].connections[0]
		game.turn = 4
		game.hand_cp = [card]
		game.active = CP
		game.state = "pre_weather_cc_attacker"
		game.attack.attacker = CP
		game.attack.defender = AP
		game.attack.space = desertTarget
		game.attack.pieces = [cpGeLcu]
		game.attack.from = [desertFrom]
		game.attack.initial_defenders = [apPiece]
		game.pieces[cpGeLcu] = desertFrom
		game.pieces[apPiece] = desertTarget
		game.pieces[cpTuScu] = ELIMINATED
		expect(Engine.combat.can_battle_trigger_severe_weather(game)).toBe(true)
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(true)
		game.state = "play_cc_attacker"
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(false)
	})

	test("伊斯兰军先放置HQ再返回标准窗口", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		let card = findCardByName("ARMY OF ISLAM CC")
		let cpTuLcu = findPieceId((p) => p.faction === CP && p.nation === "tu" && p.piece_class === "LCU" && p.type !== "hq")
		let hq = findPieceId((p) => p.faction === CP && p.name === "TU Army Islam HQ")
		let originSpace = data.spaces.findIndex(
			(s) =>
				s &&
				Array.isArray(s.connections) &&
				s.connections.length > 0 &&
				(s.area === "caucasus" ||
					s.area === "russia" ||
					s.area === "azerbaijan" ||
					(s.area === "persia" && s.faction === "neutral"))
		)
		let targetSpace = data.spaces[originSpace].connections[0]
		game.events.pan_turkism = true
		game.jihad = 6
		game.hand_cp = [card]
		game.active = CP
		game.state = "play_cc_attacker"
		game.attack.attacker = CP
		game.attack.defender = AP
		game.attack.space = targetSpace
		game.attack.pieces = [cpTuLcu]
		game.attack.from = [originSpace]
		game.attack.initial_defenders = [apPiece]
		game.pieces[cpTuLcu] = originSpace
		game.pieces[apPiece] = targetSpace
		game.pieces[cpTuScu] = ELIMINATED
		game.pieces[hq] = ELIMINATED
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(true)
		expect(Engine.combat_cards.get_army_of_islam_space_options(game)).toContain(originSpace)
		rules.action(game, "Central Powers", "play_cc", card)
		expect(game.state).toBe("army_of_islam_place_hq")
		rules.action(game, "Central Powers", "space", originSpace)
		expect(game.pieces[hq]).toBe(originSpace)
		expect(game.state).toBe("play_cc_attacker")
	})

	test("贾法尔帕夏在标准窗口只提供后撤选项", () => {
		let { game } = createMinimalBattleGame()
		let card = findCardByName("JAFAR PASHA CC")
		game.active = CP
		game.state = "play_cc_defender"
		game.hand_cp = [card]
		rules.action(game, "Central Powers", "play_cc", card)
		expect(game.state).toBe("choose_jafar_pasha")
		let view = rules.view(game, game.active)
		expect(Object.prototype.hasOwnProperty.call(view.actions, "retreat")).toBe(true)
		expect(Object.prototype.hasOwnProperty.call(view.actions, "reroll")).toBe(false)
	})

	test("贾法尔帕夏在掷骰后窗口只提供重掷选项", () => {
		let { game } = createMinimalBattleGame()
		let card = findCardByName("JAFAR PASHA CC")
		game.active = CP
		game.state = "post_roll_cc_defender"
		game.hand_cp = [card]
		rules.action(game, "Central Powers", "play_cc", card)
		expect(game.state).toBe("choose_jafar_pasha")
		let view = rules.view(game, game.active)
		expect(Object.prototype.hasOwnProperty.call(view.actions, "retreat")).toBe(false)
		expect(Object.prototype.hasOwnProperty.call(view.actions, "reroll")).toBe(true)
	})

	test("贾法尔帕夏标准窗口使用后不会错误留在同盟国保留区", () => {
		let { game } = createMinimalBattleGame()
		let card = findCardByName("JAFAR PASHA CC")
		game.active = CP
		game.state = "play_cc_defender"
		game.hand_cp = [card]
		rules.action(game, "Central Powers", "play_cc", card)
		rules.action(game, "Central Powers", "retreat")
		expect(game.hand_cp).not.toContain(card)
		expect(game.cc_retained.cp).not.toContain(card)
		expect(game.discard_cp.includes(card) || game.cc_retained.ap.includes(card)).toBe(true)
		if (game.cc_retained.ap.includes(card)) {
			expect(game.cc_retained_after_use.ap[card]).toBe("remove")
		}
	})

	test("淡水短缺与混乱指令不再附带攻击方额外惩罚", () => {
		let { game, apPiece, cpTuScu } = createMinimalBattleGame()
		let waterShortage = findCardByName("WATER SHORTAGE CC")
		let confusedOrders = findCardByName("CONFUSED ORDERS CC")
		expect(Engine.combat_cards.get_combat_card_penalty(waterShortage, "attacker", game, [apPiece], [cpTuScu])).toBe(0)
		expect(Engine.combat_cards.get_combat_card_penalty(confusedOrders, "attacker", game, [apPiece], [cpTuScu])).toBe(0)
	})

	test("缴获沙皇军火仅在推进夺取俄国 VP 后可打出", () => {
		let { game, apPiece } = createMinimalBattleGame()
		let card = findCardByName("CZAR'S ARMORIES CC")
		let cpTuLcu = findPieceId((p) => p.faction === CP && p.nation === "tu" && p.piece_class === "LCU" && p.type !== "hq")
		let originSpace = data.spaces[game.attack.space].connections[0]
		game.active = CP
		game.state = "post_advance_cc_cp"
		game.hand_cp = [card]
		game.attack.attacker = CP
		game.attack.defender = AP
		game.attack.pieces = [cpTuLcu]
		game.attack.from = [originSpace]
		game.attack.initial_defenders = [apPiece]
		game.events.russian_revolution = 1
		game.pieces[cpTuLcu] = originSpace
		game.pieces[apPiece] = game.attack.space
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(false)
		game.captured_russian_vp_in_advance = true
		expect(Engine.combat_cards.can_play_combat_card(game, card)).toBe(true)
	})

	test("仅进攻方土军被消灭时仍可打出前线预备役并原地重建", () => {
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
			active: CP,
			state: "battle",
			hand_ap: [],
			hand_cp: [59],
			discard_ap: [],
			discard_cp: [],
			removed_ap: [],
			removed_cp: [],
			cc_retained: { ap: [], cp: [] },
			cc_retained_after_use: { ap: {}, cp: {} },
			combat_cards: { attacker: [], defender: [] },
			rp_cp: { tu: 0, a: 0, ge: 0 },
			attack: {
				space: targetSpace,
				pieces: [],
				attacker: CP,
				defender: AP,
				from: [fromSpace],
				initial_defenders: [apPiece],
				reserves_to_front_damaged_pieces: [cpTuScu],
				attacker_losses: 1,
				attacker_losses_absorbed: 1,
				defender_losses: 0,
				defender_losses_absorbed: 0
			},
			battle_result: {
				cancelled: false,
				attacker_losses: 1,
				defender_losses: 0,
				retreat_needed: false,
				retreating_faction: null,
				retreating_units: [],
				retreat_can_cancel: false,
				retreat_distance: 1,
				no_advance: true,
				turkish_retreat: false,
				turkish_retreat_units: [],
				turkish_retreat_optional_units: [],
				attackers: [cpTuScu],
				defenders: [apPiece]
			}
		}
		game.pieces[apPiece] = targetSpace
		game.pieces[cpTuScu] = ELIMINATED
		game.post_roll_cc_done = true

		Engine.combat.end_battle_sequence(game, () => { })
		expect(game.state).toBe("post_battle_cc_cp")

		rules.action(game, "Central Powers", "play_cc", 59)
		rules.action(game, "Central Powers", "piece", cpTuScu)

		expect(game.pieces[cpTuScu]).toBe(targetSpace)
		expect(game.reduced).toContain(cpTuScu)
	})

	test("日志简洁化验证", () => {
		let { game } = createMinimalBattleGame()
		let logs = []
		game.turkish_retreat = true
		Engine.combat.resolve_battle(game, (msg) => logs.push(msg))
		expect(logs.some(l => typeof l === "string" && l.includes("Terrain Shift"))).toBe(false)
		expect(logs).toContain("土耳其撤退：防守方损失-1")
	})

	test("撤退格数限制验证", () => {
		let { game, cpTuScu, apPiece } = createMinimalBattleGame()
		game.turkish_retreat = true
		game.post_roll_cc_done = true
		game.battle_result = createBattleResult(apPiece, cpTuScu, {
			retreat_needed: true,
			retreating_units: [cpTuScu],
			retreat_distance: 2,
			turkish_retreat: false
		})
		Engine.combat.end_battle_sequence(game, () => { })
		expect(game.state).toBe("retreat")
		expect(game.retreat_distance).toBe(1)
	})

	test("阵营归一化与打卡限制", () => {
		let { game } = createMinimalBattleGame()
		game.active = CP
		game.attack = { attacker_faction: AP, defender: CP }
		Engine.combat.start_attack_sequence(game)
		expect(game.attack.attacker).toBe(AP)

		let desertSpace = data.spaces.findIndex(s => s && s.terrain === "desert")
		game.state = "play_cc_defender"
		game.attack.space = desertSpace
		game.attack.attacker = AP
		game.attack.defender = CP
		expect(Engine.combat_cards.can_play_sandstorms(game)).toBe(true)
	})
})
