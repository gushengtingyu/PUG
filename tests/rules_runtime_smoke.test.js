const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const fuzz = require("./runtime_fuzz_loop.js")

const { AP, CP, ELIMINATED } = Engine.constants
const { data } = Engine

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
}

function setupGameWithMatchingCard(cardPredicate) {
	for (let seed of [12345, 22345, 32345, 42345, 52345, 62345, 72345, 82345, 92345]) {
		let game = setupGame(seed)
		let player = currentPlayer(game)
		let hand = game.active === AP ? game.hand_ap : game.hand_cp
		let card = hand.find((c) => cardPredicate(data.cards[c], c, game))
		if (card !== undefined) {
			return { game, player, card }
		}
	}
	throw new Error("未找到满足条件的手牌")
}

function findPieceId(predicate) {
	let id = data.pieces.findIndex((p) => p && predicate(p))
	if (id < 0) throw new Error("未找到满足条件的棋子")
	return id
}

function findPieceIds(predicate, count) {
	let ids = []
	for (let p = 0; p < data.pieces.length; p++) {
		if (data.pieces[p] && predicate(data.pieces[p], p)) ids.push(p)
		if (ids.length === count) return ids
	}
	throw new Error("未找到足够数量的棋子")
}

function findTestSpace() {
	let s = data.spaces.findIndex(
		(space, idx) =>
			idx > 0 &&
			space &&
			space.type !== "Reserve Box" &&
			space.map !== "Reserve Box" &&
			!space.region &&
			!space.island_base
	)
	if (s < 0) throw new Error("未找到可用测试地块")
	return s
}

function findSpaceByPredicate(predicate) {
	let s = data.spaces.findIndex((space, idx) => idx > 0 && space && predicate(space, idx))
	if (s < 0) throw new Error("未找到满足条件的测试地块")
	return s
}

function findTestSpaces(count) {
	let spaces = []
	for (let s = 1; s < data.spaces.length; s++) {
		let space = data.spaces[s]
		if (!space || space.type === "Reserve Box" || space.map === "Reserve Box" || space.region || space.island_base) {
			continue
		}
		spaces.push(s)
		if (spaces.length === count) return spaces
	}
	throw new Error("未找到足够数量的测试地块")
}

function findEmptyEntrenchSpace(game) {
	for (let s = 1; s < data.spaces.length; s++) {
		let space = data.spaces[s]
		if (!space || space.type === "Reserve Box" || space.map === "Reserve Box" || space.region || space.island_base) {
			continue
		}
		if (space.terrain !== "clear" && space.terrain !== "forest") continue
		if (Engine.map.is_beachhead_space && Engine.map.is_beachhead_space(game, s)) continue
		if (Engine.map.get_pieces_in_space(game, s).length === 0) return s
	}
	throw new Error("未找到可用于掘壕测试的空地块")
}

function createMinimalGame(overrides = {}) {
	return {
		turn: 8,
		active: CP,
		vp: 0,
		events: {},
		pieces: new Array(data.pieces.length).fill(ELIMINATED),
		control: [],
		moved: [],
		attacked: [],
		reduced: [],
		retreated: [],
		forts: { destroyed: [] },
		...overrides
	}
}

function findBorderFromSerbiaOrGreece() {
	for (let from = 1; from < data.spaces.length; from++) {
		let info = data.spaces[from]
		if (!info || info.region || info.island_base) continue
		if (info.nation !== "sb" && info.nation !== "gr") continue
		if (!Array.isArray(info.connections)) continue
		for (let to of info.connections) {
			let target = data.spaces[to]
			if (!target || target.region || target.island_base) continue
			if (target.nation === "sb" || target.nation === "gr") continue
			return [from, to]
		}
	}
	throw new Error("未找到塞尔维亚/希腊对外相邻地块")
}

function findBalkanBorderFromSerbiaOrGreece() {
	for (let from = 1; from < data.spaces.length; from++) {
		let info = data.spaces[from]
		if (!info || info.region || info.island_base) continue
		if (info.nation !== "sb" && info.nation !== "gr") continue
		if (!Array.isArray(info.connections)) continue
		for (let to of info.connections) {
			let target = data.spaces[to]
			if (!target || target.region || target.island_base) continue
			if (target.nation === "sb" || target.nation === "gr") continue
			if (target.area !== "balkans") continue
			return [from, to]
		}
	}
	throw new Error("未找到塞尔维亚/希腊通向巴尔干其他国家的相邻地块")
}

function findBorderIntoGreece() {
	for (let from = 1; from < data.spaces.length; from++) {
		let info = data.spaces[from]
		if (!info || info.region || info.island_base) continue
		if (!Array.isArray(info.connections)) continue
		if (info.nation === "gr") continue
		for (let to of info.connections) {
			let target = data.spaces[to]
			if (!target || target.region || target.island_base) continue
			if (target.nation !== "gr") continue
			return [from, to]
		}
	}
	throw new Error("未找到通向希腊的相邻地块")
}

function findTwoOriginsForOneTarget() {
	for (let target = 1; target < data.spaces.length; target++) {
		let targetInfo = data.spaces[target]
		if (!targetInfo || targetInfo.region || targetInfo.island_base) continue
		let origins = []
		for (let s = 1; s < data.spaces.length; s++) {
			let info = data.spaces[s]
			if (!info || info.region || info.island_base || !Array.isArray(info.connections)) continue
			if (info.connections.includes(target)) origins.push(s)
			if (origins.length >= 2) return [origins[0], origins[1], target]
		}
	}
	throw new Error("未找到可用于协同进攻的测试地块")
}

function expectRetreatedInvariant(game) {
	if (game.retreated === undefined) return
	expect(Array.isArray(game.retreated)).toBe(true)
	expect(new Set(game.retreated).size).toBe(game.retreated.length)
}

function currentPlayer(game) {
	return game.active === AP ? "Allied Powers" : "Central Powers"
}

function findCombinationPlan(faction, type) {
	let reserve = Engine.game_utils.get_lcu_reserve_box(faction)
	let candidateScus = []
	for (let p = 1; p < data.pieces.length; p++) {
		let info = data.pieces[p]
		if (info && info.piece_class === "SCU" && info.faction === faction) {
			candidateScus.push(p)
		}
	}
	let game = createMinimalGame({ active: faction })
	for (let lcu = 1; lcu < data.pieces.length; lcu++) {
		let info = data.pieces[lcu]
		if (!info || info.piece_class !== "LCU" || info.faction !== faction) continue
		game.pieces[lcu] = reserve
		if (type === "full") {
			let option = Engine.game_utils.get_combination_options_for_lcu(game, lcu, candidateScus.slice())
			if (option && option.type === "full") {
				return { lcu, scus: option.pieces }
			}
		} else {
			for (let i = 0; i < candidateScus.length; i++) {
				for (let j = i + 1; j < candidateScus.length; j++) {
					let option = Engine.game_utils.get_combination_options_for_lcu(game, lcu, [
						candidateScus[i],
						candidateScus[j]
					])
					if (option && option.type === "reduced") {
						return { lcu, scus: option.pieces }
					}
				}
			}
		}
		game.pieces[lcu] = ELIMINATED
	}
	throw new Error(`未找到 ${faction} 的 ${type} 组合方案`)
}

function findLegalCombineSpace(faction, lcu, scus) {
	let game = createMinimalGame({ active: faction })
	game.pieces[lcu] = Engine.game_utils.get_lcu_reserve_box(faction)
	for (let space = 1; space < data.spaces.length; space++) {
		let info = data.spaces[space]
		if (!info || info.region || info.island_base || info.type === "Reserve Box" || info.map === "Reserve Box") {
			continue
		}
		for (let scu of scus) game.pieces[scu] = space
		let option = Engine.game_utils.get_combination_options_for_lcu(game, lcu, scus.slice(), space)
		if (option && option.pieces.length === scus.length && Engine.game_utils.can_combine_in_space(game, space, faction)) {
			return space
		}
	}
	throw new Error(`未找到 ${faction} 的合法组合地块`)
}

function createCombineDisposeGame(faction, type) {
	let plan = findCombinationPlan(faction, type)
	let space = findLegalCombineSpace(faction, plan.lcu, plan.scus)
	let game = createMinimalGame({
		turn: 8,
		active: faction,
		action_round: 1,
		player_order: [faction, faction === AP ? CP : AP],
		hand_ap: [],
		hand_cp: [],
		state: "combine_lcu_dispose_reserve",
		where: space,
		activated: { move: [space], combine: [space], attack: [] },
		eligible_attackers: [],
		combine_ctx: {
			selected_scus: plan.scus.slice(),
			lcu_id: plan.lcu,
			type,
			pending_scus: plan.scus.slice()
		},
		log: []
	})
	game.pieces[plan.lcu] = Engine.game_utils.get_lcu_reserve_box(faction)
	for (let scu of plan.scus) game.pieces[scu] = space
	return { game, plan, space }
}

function getSelectableActionNames(view) {
	return Object.keys(view.actions || {}).filter((name) => {
		if (name === "undo") return false
		let value = view.actions[name]
		if (Array.isArray(value)) return value.length > 0
		return value === 1
	})
}

function pickAction(view, salt) {
	let names = getSelectableActionNames(view)
	if (names.length === 0) return null
	let name = names[salt % names.length]
	let value = view.actions[name]
	if (Array.isArray(value)) {
		return {
			name,
			arg: value[salt % value.length]
		}
	}
	return { name }
}

describe("运行时烟雾测试", () => {
	test("卡牌名称辅助函数在引擎层统一提供", () => {
		expect(Engine.card_name(1)).toBe("c1")
		expect(Engine.card_name(-1)).toBe("Unknown Card -1")
		expect(Engine.card_names([1, -1])).toEqual(["c1", "Unknown Card -1"])
	})

	test("英国厌战会放置同盟国自动胜利标记并记录回合", () => {
		let game = {
			turn: 8,
			combined_war: 28,
			vp: 12,
			events: {},
			log: []
		}
		Engine.events.events_by_id[110].handler(game, {
			log: (msg) => game.log.push(msg)
		})
		expect(game.events["british_war_weariness"]).toBe(8)
		expect(game.cp_auto_victory_marker).toBe(19)
		expect(game.log.some((x) => x.includes("同盟国自动胜利标记设为 19"))).toBe(true)
	})

	test("相关事件会推动同盟国自动胜利标记前移", () => {
		let game = {
			turn: 10,
			combined_war: 34,
			vp: 14,
			events: { british_war_weariness: 8, kaiserschlacht: true },
			log: [],
			mo_ap_modifier: 0
		}
		Engine.events.set_cp_auto_victory_marker(game, 19, {
			log: (msg) => game.log.push(msg)
		})
		Engine.events.events_by_id[90].handler(game, {
			log: (msg) => game.log.push(msg)
		})
		expect(game.vp).toBe(12)
		expect(game.cp_auto_victory_marker).toBe(18)
		Engine.events.events_by_id[103].handler(game, {
			log: (msg) => game.log.push(msg)
		})
		expect(game.mo_ap_modifier).toBe(-2)
		expect(game.cp_auto_victory_marker).toBe(17)
		expect(game.state).toBe("event_robertson_choice")
	})

	test("使用 OPS 卡时日志采用卡牌前置格式", () => {
		let game = setupGame(12345)
		game.state = "play_card"
		game.log = []
		let player = currentPlayer(game)
		let hand = game.active === AP ? game.hand_ap : game.hand_cp
		let card = hand.find((c) => data.cards[c] && data.cards[c].ops)

		expect(card).toBeDefined()

		game = rules.action(game, player, "play_ops", card)
		expect(game.log).toContain(`${Engine.card_name(card)} -- 行动点 (${data.cards[card].ops})`)
		expect(game.log.some((line) => line.includes("打出") && line.includes("行动点"))).toBe(false)
	})

	test("单点 OPS 时日志采用自动行动格式", () => {
		let game = setupGame(12345)
		game.state = "play_card"
		game.log = []
		let player = currentPlayer(game)

		game = rules.action(game, player, "single_op")
		expect(game.log).toContain("自动行动 (1)")
	})

	test("SR 卡日志采用 POG 风格标题", () => {
		let { game, player, card } = setupGameWithMatchingCard((info) => info && info.sr)
		game.state = "play_card"
		game.log = []

		game = rules.action(game, player, "play_sr", card)
		expect(game.log).toContain(`${Engine.card_name(card)} -- Strategic Redeployment (${data.cards[card].sr})`)
		expect(game.log.some((line) => line.includes("打出") && line.includes("SR"))).toBe(false)
	})

	test("RP 卡日志采用 POG 风格标题", () => {
		let { game, player, card } = setupGameWithMatchingCard(
			(info) => info && (info.rp_a || info.rp_ah || info.rp_br || info.rp_ru || info.rp_ge || info.rp_tu || info.rp_in)
		)
		game.state = "play_card"
		game.log = []

		game = rules.action(game, player, "play_rps", card)
		expect(game.log).toContain(`${Engine.card_name(card)} -- Replacement Points`)
		expect(game.log.some((line) => line.includes("用于补员"))).toBe(false)
	})

	test("事件卡日志采用 POG 风格标题", () => {
		let game = setupGame(12345)
		game.active = AP
		game.state = "play_card"
		game.log = []
		let player = currentPlayer(game)
		let card = 14

		game = rules.action(game, player, "play_event", card)
		expect(game.log).toContain(`${Engine.card_name(card)} -- Event`)
		expect(game.log.some((line) => line.includes("打出事件"))).toBe(false)
	})

	test("OPS 激活完成后按 MOVE ATTACK COMBINE 分组记录地区", () => {
		let [moveSpace, combineSpace, attackSpace] = findTestSpaces(3)
		let game = setupGame(12345)
		game.state = "activate_spaces"
		game.log = []
		game.ops = 0
		game.active = AP
		game.activated = {
			move: [moveSpace, combineSpace],
			attack: [attackSpace],
			combine: [combineSpace]
		}
		game.activation_cost = {
			[moveSpace]: 1,
			[combineSpace]: 2,
			[attackSpace]: 3
		}
		game.moved = []
		game.attacked = []
		game.retreated = []

		game = rules.action(game, "Allied Powers", "done")

		expect(game.log).toEqual([
			"MOVE",
			`>${data.spaces[moveSpace].name}`,
			"ATTACK",
			`>${data.spaces[attackSpace].name} (3 OPS)`,
			"COMBINE",
			`>${data.spaces[combineSpace].name} (2 OPS)`
		])
		expect(game.log.some((line) => line.includes("activated for"))).toBe(false)
	})

	test("移动激活地块点击空间后会进入掘壕操作菜单", () => {
		let entrencher = findPieceId((p) => p.faction === AP && p.piece_class === "SCU" && p.type === "regular")
		let game = setupGame(12345)
		let space = findEmptyEntrenchSpace(game)

		game.active = AP
		game.state = "choose_move_space"
		game.where = -1
		game.log = []
		game.moved = []
		game.entrenching = []
		game.entrench_attempts = []
		game.activated = {
			move: [space],
			attack: [],
			combine: []
		}
		game.pieces[entrencher] = space
		game.trenches = (game.trenches || []).filter((x) => x !== space)
		game.trenches_2 = (game.trenches_2 || []).filter((x) => x !== space)
		Engine.set_control(game, space, AP)

		expect(Engine.game_utils.can_combine_in_space(game, space, AP)).toBe(false)
		expect(Engine.game_utils.can_entrench_in_space(game, space, AP)).toBe(true)

		game = rules.action(game, "Allied Powers", "space", space)
		expect(game.state).toBe("choose_move_action")
		expect(game.where).toBe(space)

		let view = rules.view(game, "Allied Powers")
		expect(view.actions.entrench).toBe(1)

		game = rules.action(game, "Allied Powers", "entrench")
		expect(game.state).toBe("entrench")

		view = rules.view(game, "Allied Powers")
		expect(view.actions.piece).toContain(entrencher)
	})

	test("战争状态阶段会判定同盟国自动胜利标记达成", () => {
		const turnStates = require("../modules/states/states_turn.js")
		let states = {}
		let funcs = turnStates.register(states, Engine, {
			AP: Engine.constants.AP,
			CP: Engine.constants.CP
		})
		let game = {
			protocol_victory: false,
			vp: 17,
			cp_auto_victory_marker: 16
		}
		turnStates.set_globals(game)
		let over = funcs.check_victory_conditions()
		expect(over).toBe(true)
		expect(game.state).toBe("game_over")
		expect(game.result).toBe(Engine.constants.CP)
		expect(game.victory).toBe("CP Automatic Victory (Marker 16)")
	})

	test("视图会暴露同盟国自动胜利标记数值", () => {
		let game = setupGame(12345)
		game.cp_auto_victory_marker = 19
		let view = rules.view(game, "Central Powers")
		expect(view.cp_auto_victory_marker).toBe(19)
	})

	test("默里接管指挥权会把西奈铁路完成时间设为四回合后", () => {
		let game = {
			turn: 6,
			events: {},
			log: []
		}
		Engine.events.events_by_id[19].handler(game, {
			log: (msg) => game.log.push(msg)
		})
		expect(game.events["xinai"]).toBe(10)
		expect(game.active).toBe(AP)
		expect(game.state).toBe("event_place_reinforcements")
		expect(game.log.some((x) => x.includes("西奈铁路将在第10回合完成"))).toBe(true)
	})

	test("视图会把西奈铁路 token 从增援板移到当前回合后第四回合的回合轨道", () => {
		let game = setupGame(12345)
		game.turn = 6
		Engine.events.events_by_id[19].handler(game, {
			log: (msg) => game.log.push(msg)
		})
		let view = rules.view(game, "Allied Powers")
		expect(view.turn).toBe(6)
		expect(view.events["xinai"]).toBe(10)
		expect(view.hidden_reinforcement_markers).toContain("SINAI RAILROAD")
	})

	test("14号事件会把 BR RPs TO RU token 切换为 Kitchener 图片并隐藏原增援板 token", () => {
		let game = setupGame(12345)
		Engine.events.events_by_id[14].handler(game, {})
		let view = rules.view(game, "Allied Powers")
		expect(view.ui_tokens["BR RPs TO RU"]).toBe("MKitch.png")
		expect(view.hidden_reinforcement_markers).toContain("Kitch.token")
	})

	test("33号事件会把 BR RPs TO RU token 切换为 Lloyd George 图片并覆盖 14号事件图片", () => {
		let game = setupGame(12345)
		Engine.events.events_by_id[14].handler(game, {})
		Engine.events.events_by_id[33].handler(game, {})
		let view = rules.view(game, "Allied Powers")
		expect(view.ui_tokens["BR RPs TO RU"]).toBe("MLG.png")
		expect(view.hidden_reinforcement_markers).toContain("Kitch.token")
	})

	test("西奈铁路未完成前不能从预备军格SR进埃尔阿里什，完成后可以，且CP始终不能用该铁路", () => {
		const brScus = findPieceIds(
			(piece) => piece && piece.faction === AP && piece.piece_class === "SCU" && piece.nation === "br" && piece.type === "regular",
			2
		)
		let [reservePiece, desertPiece] = brScus
		let game = {
			turn: 6,
			events: {},
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			control: [],
			forts: { destroyed: [] }
		}

		game.pieces[reservePiece] = Engine.constants.RESERVE
		game.pieces[desertPiece] = 251
		game.control[251] = AP
		game.control[254] = AP
		game.control[262] = AP

		expect(Engine.map.can_sr_to_space(game, reservePiece, 251, AP)).toBe(false)

		game.events["xinai"] = game.turn

		expect(Engine.map.can_sr_to_space(game, reservePiece, 251, AP)).toBe(true)
	})

	test("空中支援标记会按首次打出CC的时机切换", () => {
		let game = setupGame(12345)
		let view = rules.view(game, "Central Powers")
		expect(view.ui_tokens["CP Air Superiority"]).toBeUndefined()
		expect(view.ui_tokens["AP Air Superiority"]).toBeUndefined()
		game.events["fliegerabteilung"] = game.turn
		view = rules.view(game, "Central Powers")
		expect(view.ui_tokens["CP Air Superiority"]).toBe("MCPAirS.png")
		expect(view.ui_tokens["AP Air Superiority"]).toBeUndefined()
		game.events["royal_flying_corps_permanent"] = true
		view = rules.view(game, "Allied Powers")
		expect(view.ui_tokens["AP Air Superiority"]).toBe("MAPAirS.png")
		expect(view.ui_tokens["CP Air Superiority"]).toBeUndefined()
	})

	test("皇家空军生效后飞行分队CC不可再打出", () => {
		let game = setupGame(12345)
		expect(Engine.combat_cards.can_play_fliegerabteilung(game)).toBe(true)
		game.events["royal_flying_corps_permanent"] = true
		expect(Engine.combat_cards.can_play_fliegerabteilung(game)).toBe(false)
	})

	test("初始化时会创建 retreated 数组", () => {
		let game = setupGame(12345)
		expectRetreatedInvariant(game)
	})

	test("开局先进入同盟国动员4点牌选牌阶段", () => {
		let game = setupGame(12345)
		expect(game.state).toBe("cp_opening_mobilization_pick")
		expect(game.active).not.toBe(AP)
		let candidates = game.deck_cp.filter((c) => {
			let card = Engine.data.cards[c]
			return (
				card &&
				card.faction === Engine.constants.CP &&
				card.commitment === Engine.constants.COMMITMENT_MOBILIZATION &&
				Number(card.ops) === 4
			)
		})
		expect(candidates.length).toBeGreaterThan(0)
		let view = rules.view(game, "Central Powers")
		expect(Array.isArray(view.actions.card)).toBe(true)
		expect(new Set(view.actions.card)).toEqual(new Set(candidates))
	})

	test("同盟国开局选牌后进入AP确认强制进攻", () => {
		let game = setupGame(12345)
		let choose = game.deck_cp.find((c) => {
			let card = Engine.data.cards[c]
			return (
				card &&
				card.faction === Engine.constants.CP &&
				card.commitment === Engine.constants.COMMITMENT_MOBILIZATION &&
				Number(card.ops) === 4
			)
		})
		let oldHand = game.hand_cp.length
		let oldDeck = game.deck_cp.length
		game = rules.action(game, "Central Powers", "card", choose)
		expect(game.hand_cp.includes(choose)).toBe(true)
		expect(game.hand_cp.length).toBe(oldHand + 1)
		expect(game.deck_cp.includes(choose)).toBe(false)
		expect(game.deck_cp.length).toBe(oldDeck - 1)
		expect(game.cp_opening_mobilization_pick_done).toBe(true)
		expect(game.state).toBe("acknowledge_mo_results")
		expect(game.active).toBe(AP)
	})

	test("retreated 单位不会回到战斗单位池", () => {
		const { data } = Engine
		const apPiece = data.pieces.findIndex((p) => p && p.faction === "ap" && p.type !== "hq")
		const cpPiece = data.pieces.findIndex((p) => p && p.faction === "cp" && p.type !== "hq")
		let game = {
			pieces: [],
			attack: {
				space: 1,
				pieces: [apPiece],
				initial_defenders: [cpPiece]
			},
			retreated: [cpPiece]
		}
		game.pieces[apPiece] = 2
		game.pieces[cpPiece] = 1
		let pool = Engine.combat_cards.get_battle_piece_pool(game)
		expect(pool).toContain(apPiece)
		expect(pool).not.toContain(cpPiece)
	})

	test("存在已退却防守方时优先进入摧毁流程", () => {
		const { data } = Engine
		const cpPiece = data.pieces.findIndex((p) => p && p.faction === "cp" && p.type !== "hq")
		let game = {
			pieces: [],
			attack: {
				space: 1,
				defender_losses: 1,
				defender: "cp",
				attacker: "ap"
			},
			retreated: [cpPiece]
		}
		game.pieces[cpPiece] = 1
		expect(Engine.combat.get_defender_losses_state(game)).toBe("eliminate_retreated_units")
		game.retreated = []
		expect(Engine.combat.get_defender_losses_state(game)).toBe("apply_defender_losses")
	})

	test("泡测参数解析支持多种子与分局步数限制", () => {
		let options = fuzz.parseArgs([
			"--seed=12345",
			"--seed-step=7",
			"--games=4",
			"--max-steps=900",
			"--max-steps-per-game=150",
			"--echo-every=0",
			"--stuck-threshold=4",
			"--quiet"
		])
		expect(options.seed).toBe(12345)
		expect(options.seedStep).toBe(7)
		expect(options.games).toBe(4)
		expect(options.maxSteps).toBe(900)
		expect(options.maxStepsPerGame).toBe(150)
		expect(options.echoEvery).toBe(1)
		expect(options.stuckThreshold).toBe(10)
		expect(options.quiet).toBe(true)
	})

	test("泡测运行支持多种子和分局步数预算", () => {
		let result = fuzz.run({
			seed: 12345,
			seedStep: 11,
			games: 3,
			maxStepsPerGame: 60,
			maxSteps: 240,
			echoEvery: 1000,
			stuckThreshold: 80,
			quiet: true
		})
		expect(result.exitCode).toBe(0)
		expect(result.reason).toBe("games_completed")
		expect(result.summary.completedGames).toBe(3)
		expect(result.summary.totalSteps).toBe(180)
		expect(result.summary.seedsVisited).toEqual([12345, 12356, 12367])
		expect(result.summary.completionReasons).toEqual([
			"max_steps_per_game",
			"max_steps_per_game",
			"max_steps_per_game"
		])
		expect(result.summary.statesSeen.length).toBeGreaterThan(0)
	})

	test("泡测会把活跃方无可选动作视为状态机异常", () => {
		let originalSetup = rules.setup
		let originalView = rules.view
		let originalAction = rules.action

		rules.setup = (seed, scenario, options) => ({
			seed,
			scenario,
			options,
			state: "idle_state",
			active: "ap",
			turn: 1,
			action_round: 1,
			pieces: [],
			control: []
		})
		rules.view = (game, role) => ({
			actions: { undo: 1 },
			active: role,
			turn: game.turn,
			prompt: null
		})
		rules.action = () => {
			throw new Error("no action should be dispatched when only undo remains")
		}

		try {
			let result = fuzz.run({
				seed: 12345,
				seedStep: 7,
				games: 2,
				echoEvery: 1000,
				stuckThreshold: 50,
				quiet: true
			})
			expect(result.exitCode).toBe(2)
			expect(result.reason).toBe("active_no_selectable_actions")
			expect(result.summary.noActionEvents).toEqual([
				{ state: "idle_state", active: "ap", viewActive: "ap", prompt: null }
			])
		} finally {
			rules.setup = originalSetup
			rules.view = originalView
			rules.action = originalAction
		}
	})

	test("泡测会把活跃方看到等待提示视为异常", () => {
		let originalSetup = rules.setup
		let originalView = rules.view

		rules.setup = (seed, scenario, options) => ({
			seed,
			scenario,
			options,
			state: "idle_state",
			active: "ap",
			turn: 1,
			action_round: 1,
			pieces: [],
			control: []
		})
		rules.view = (game, role) => ({
			actions: { done: 1 },
			active: role,
			turn: game.turn,
			prompt: "等待 Allied Powers行动"
		})

		try {
			let result = fuzz.run({
				seed: 12345,
				echoEvery: 1000,
				stuckThreshold: 50,
				quiet: true
			})
			expect(result.exitCode).toBe(1)
			expect(result.reason).toBe("crash_view")
			expect(String(result.summary.error)).toContain("waiting prompt")
		} finally {
			rules.setup = originalSetup
			rules.view = originalView
		}
	})

	test("泡测会在 view 自动把行动权切给对手后重新读取新活跃方视图", () => {
		let originalSetup = rules.setup
		let originalView = rules.view
		let originalAction = rules.action
		let seenApRpView = false

		rules.setup = (seed, scenario, options) => ({
			seed,
			scenario,
			options,
			state: "transition_state",
			active: "cp",
			turn: 1,
			action_round: 1,
			pieces: [],
			control: []
		})
		rules.view = (game, role) => {
			if (game.state === "transition_state" && role === "cp") {
				game.state = "rp_phase"
				game.active = "ap"
				return {
					actions: {},
					active: game.active,
					turn: game.turn,
					prompt: "等待 Allied Powers行动"
				}
			}

			if (game.state === "rp_phase" && role === "ap") {
				seenApRpView = true
				return {
					actions: { done: 1 },
					active: "ap",
					turn: game.turn,
					prompt: "AP 补员阶段: 无可用RP"
				}
			}

			return {
				actions: { done: 1 },
				active: game.active,
				turn: game.turn,
				prompt: null
			}
		}
		rules.action = (game, role, action) => {
			expect(role).toBe("ap")
			expect(action).toBe("done")
			game.state = "game_over"
			return game
		}

		try {
			let result = fuzz.run({
				seed: 12345,
				games: 1,
				echoEvery: 1000,
				stuckThreshold: 50,
				quiet: true
			})
			expect(seenApRpView).toBe(true)
			expect(result.exitCode).toBe(0)
			expect(result.reason).toBe("games_completed")
			expect(result.summary.completedGames).toBe(1)
		} finally {
			rules.setup = originalSetup
			rules.view = originalView
			rules.action = originalAction
		}
	})

	test("补员阶段会规范化旧存档 active faction，避免双方互等", () => {
		let cpView = rules.view(
			{
				state: "rp_phase",
				active: "CP",
				turn: 1,
				action_round: 1,
				pieces: [],
				control: [],
				options: { no_supply_warnings: true },
				rp_cp: { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 },
				rp_rebel: { ca: 0, af: 0, eg: 0, in: 0 }
			},
			"Central Powers"
		)
		expect(cpView.active).toBe(CP)
		expect(cpView.prompt).toContain("CP 补员阶段")
		expect(cpView.actions.done).toBe(1)

		let apView = rules.view(
			{
				state: "rp_phase",
				active: "CP",
				turn: 1,
				action_round: 1,
				pieces: [],
				control: [],
				options: { no_supply_warnings: true },
				rp_cp: { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 },
				rp_rebel: { ca: 0, af: 0, eg: 0, in: 0 }
			},
			"Allied Powers"
		)
		expect(String(apView.prompt)).toContain("等待")
	})

	test("CP 在行动轮会把可事件手牌暴露给前端高亮", () => {
		let game = setupGame(12345)
		game.state = "play_card"
		game.active = CP

		let player = currentPlayer(game)
		let view = rules.view(game, player)
		let expected = game.hand_cp.filter((c) => {
			let info = data.cards[c]
			return info && info.event && !info.cc && Engine.events.can_play_event(game, c)
		})

		expect(new Set(view.actions.play_event || [])).toEqual(new Set(expected))
	})

	test.each([12345, 22345, 32345, 42345, 52345, 62345, 72345, 82345, 92345, 102345, 112345, 122345])("历史剧本随机步进 seed=%i", (seed) => {
		let game = setupGame(seed)
		expectRetreatedInvariant(game)

		for (let step = 0; step < 180; step++) {
			let player = currentPlayer(game)
			let view

			expect(() => {
				view = rules.view(game, player)
			}).not.toThrow()

			expect(view).toBeTruthy()
			expect(view.prompt === null || typeof view.prompt === "string").toBe(true)

			if (game.state === "game_over") break

			let choice = pickAction(view, seed + step * 17)
			if (!choice) break

			expect(() => {
				game = rules.action(game, player, choice.name, choice.arg)
			}).not.toThrow()

			expect(game).toBeTruthy()
			expect(game.state).toBeTruthy()
			expectRetreatedInvariant(game)
		}
	})
})

describe("堆叠规则回归测试", () => {
	test("首个耶尔德里姆免费且容量计算与堆叠计数一致", () => {
		let space = findTestSpace()
		let regulars = findPieceIds(
			(p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq" && p.symbol !== "Y" && p.symbol !== "H",
			2
		)
		let yildirim = findPieceIds((p) => p.faction === CP && p.symbol === "Y", 2)
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: [],
			control: [],
			log: []
		}
		for (let p of [...regulars, ...yildirim]) game.pieces[p] = space

		expect(Engine.map.get_stack_count([...regulars, ...yildirim])).toBe(3)
		expect(Engine.game_utils.get_capacity(game, space)).toBe(0)

		game.pieces[yildirim[1]] = ELIMINATED
		expect(Engine.map.get_stack_count([...regulars, yildirim[0]])).toBe(2)
		expect(Engine.game_utils.get_capacity(game, space)).toBe(1)
	})

	test("英俄混编例外仅在俄国革命后允许两支俄军", () => {
		let british = findPieceId(
			(p) => ["br", "in", "anz"].includes(p.nation) && p.piece_class === "SCU" && p.type !== "hq"
		)
		let yugo = findPieceId((p) => p.name && p.name.includes("RU/SB Yugo"))
		let russian = findPieceIds(
			(p) => p.nation === "ru" && p.piece_class === "SCU" && !(p.name && p.name.includes("RU/SB Yugo")),
			3
		)

		expect(Engine.map.can_move_stack_composition({ events: {} }, [british, yugo])).toBe(false)
		expect(
			Engine.map.can_move_stack_composition({ events: { russian_revolution: 4 } }, [british, yugo, russian[0]])
		).toBe(true)
		expect(
			Engine.map.can_move_stack_composition(
				{ events: { russian_revolution: 4 } },
				[british, yugo, russian[0], russian[1]]
			)
		).toBe(true)
		expect(
			Engine.map.can_move_stack_composition(
				{ events: { russian_revolution: 4 } },
				[british, yugo, russian[0], russian[1], russian[2]]
			)
		).toBe(false)
	})

	test("RU/SB Yugo 不再按英国帝国国籍参与多国协同攻击", () => {
		let [originA, originB, target] = findTwoOriginsForOneTarget()
		let british = findPieceId(
			(p) => ["br", "in", "anz"].includes(p.nation) && p.piece_class === "SCU" && p.type !== "hq"
		)
		let yugo = findPieceId((p) => p.name && p.name.includes("RU/SB Yugo"))
		let enemy = findPieceId((p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq")
		let game = setupGame(12345)

		game.pieces.fill(ELIMINATED)
		game.pieces[british] = originA
		game.pieces[yugo] = originB
		game.pieces[enemy] = target
		game.events = {}
		game.activated = { attack: [originA, originB], move: [] }
		game.attacked = []
		game.retreated = []
		game.attack = { pieces: [], space: -1 }
		game.state = "attack"
		game.active = AP

		game = rules.action(game, "Allied Powers", "piece", british)
		game = rules.action(game, "Allied Powers", "piece", yugo)
		let view = rules.view(game, "Allied Powers")
		expect((view.actions.space || []).includes(target)).toBe(false)
	})

test("进攻阶段会先选择进攻单位，再显示可攻击目标", () => {
		let [originA, originB, target] = findTwoOriginsForOneTarget()
		let [attackerA, attackerB] = findPieceIds(
			(p) => p.nation === "br" && p.piece_class === "SCU" && p.type !== "hq",
			2
		)
		let defender = findPieceId((p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq")
		let game = setupGame(23456)

		game.pieces.fill(ELIMINATED)
		game.pieces[attackerA] = originA
		game.pieces[attackerB] = originB
		game.pieces[defender] = target
		game.events = {}
		game.activated = { attack: [originA, originB], move: [] }
		game.attacked = []
		game.retreated = []
		game.attack = { pieces: [], space: -1 }
		game.state = "attack"
		game.active = AP

		let initialView = rules.view(game, "Allied Powers")
	expect(Array.isArray(initialView.actions.piece)).toBe(true)
	expect(initialView.actions.piece.includes(attackerA)).toBe(true)
	expect(initialView.actions.piece.includes(attackerB)).toBe(true)
	expect(initialView.actions.space).toBeUndefined()

	game = rules.action(game, "Allied Powers", "piece", attackerA)
	let view = rules.view(game, "Allied Powers")

	expect(game.attack.pieces.includes(attackerA)).toBe(true)
	expect(Array.isArray(view.actions.space)).toBe(true)
	expect(view.actions.space.includes(target)).toBe(true)
	expect(view.where).toBe(originA)
	expect(Array.isArray(view.actions.piece)).toBe(true)
	expect(view.actions.piece.includes(attackerB)).toBe(true)
})

test("进攻阶段支持 select_all 一次选中全部可共同攻击的单位", () => {
	let [originA, originB, target] = findTwoOriginsForOneTarget()
	let [attackerA, attackerB] = findPieceIds(
		(p) => p.nation === "br" && p.piece_class === "SCU" && p.type !== "hq",
		2
	)
	let defender = findPieceId((p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq")
	let game = setupGame(23457)

	game.pieces.fill(ELIMINATED)
	game.pieces[attackerA] = originA
	game.pieces[attackerB] = originB
	game.pieces[defender] = target
	game.events = {}
	game.activated = { attack: [originA, originB], move: [] }
	game.attacked = []
	game.retreated = []
	game.attack = { pieces: [], space: -1 }
	game.state = "attack"
	game.active = AP

	let initialView = rules.view(game, "Allied Powers")
	expect(initialView.actions.select_all).toBe(1)

	game = rules.action(game, "Allied Powers", "select_all")
	let view = rules.view(game, "Allied Powers")

	expect(new Set(game.attack.pieces)).toEqual(new Set([attackerA, attackerB]))
	expect((view.actions.space || []).includes(target)).toBe(true)
	})

test("进攻阶段在 attack 上下文尚未初始化时也能执行 select_all", () => {
	let [originA, originB, target] = findTwoOriginsForOneTarget()
	let [attackerA, attackerB] = findPieceIds(
		(p) => p.nation === "br" && p.piece_class === "SCU" && p.type !== "hq",
		2
	)
	let defender = findPieceId((p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq")
	let game = setupGame(23458)

	game.pieces.fill(ELIMINATED)
	game.pieces[attackerA] = originA
	game.pieces[attackerB] = originB
	game.pieces[defender] = target
	game.events = {}
	game.activated = { attack: [originA, originB], move: [] }
	game.attacked = []
	game.retreated = []
	game.attack = null
	game.state = "attack"
	game.active = AP

	game = rules.action(game, "Allied Powers", "select_all")

	expect(game.attack).not.toBeNull()
	expect(new Set(game.attack.pieces)).toEqual(new Set([attackerA, attackerB]))
	expect(game.attack.space).toBe(-1)
})

	test("英俄突袭的俄国部分会复用标准激活流程并进入普通进攻阶段", () => {
		let [originA, originB, target] = findTwoOriginsForOneTarget()
		let [russianA, russianB] = findPieceIds(
			(p) => p.nation === "ru" && p.piece_class === "SCU" && p.type !== "hq",
			2
		)
		let defender = findPieceId((p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq")
		let game = setupGame(34567)

		game.pieces.fill(ELIMINATED)
		game.pieces[russianA] = originA
		game.pieces[russianB] = originB
		game.pieces[defender] = target
		game.events = { russo_british_assault: true }
		game.activated = { attack: [], move: [] }
		game.activation_cost = {}
		game.ops = 0
		game.attacked = []
		game.retreated = []
		game.moved = []
		game.russo_british_russian_activation = true
		game.attack = null
		game.state = "activate_spaces"
		game.active = AP

		let initialView = rules.view(game, "Allied Powers")
		expect((initialView.actions.activate_attack || []).includes(originA)).toBe(true)
		expect((initialView.actions.activate_attack || []).includes(originB)).toBe(true)

		game = rules.action(game, "Allied Powers", "activate_attack", originA)
		game = rules.action(game, "Allied Powers", "activate_attack", originB)

		let selectedView = rules.view(game, "Allied Powers")
		expect(selectedView.actions.done).toBe(1)

		game = rules.action(game, "Allied Powers", "done")

		expect(game.state).toBe("attack")
		expect(new Set(game.activated.attack)).toEqual(new Set([originA, originB]))
		expect(game.activation_cost[originA]).toBe(0)
		expect(game.activation_cost[originB]).toBe(0)

		let attackView = rules.view(game, "Allied Powers")
		expect((attackView.actions.piece || []).includes(russianA)).toBe(true)
		expect((attackView.actions.piece || []).includes(russianB)).toBe(true)
	})

	test("双国籍单位在激活计费时会取最优国籍组", () => {
		let space = findTestSpace()
		let combined = findPieceId((p) => p.name === "Combined BU/AH Div")
		let ah = findPieceId((p) => p.nation === "ah" && p.piece_class === "SCU" && p.type !== "hq")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: [],
			control: [],
			active: CP,
			card_ops: 2,
			turn: 1
		}
		game.pieces[combined] = space
		game.pieces[ah] = space

		let cost = Engine.map.get_activation_cost_pair(game, space)
		expect(cost.move).toBe(1)
		expect(cost.attack).toBe(1)
	})

	test("双国籍单位在沼泽与 SR 限制中可按有利国籍处理", () => {
		let german11 = findPieceId((p) => p.name === "German 11th Army")
		let combined = findPieceId((p) => p.name === "Combined BU/AH Div")
		let bulgarian = findPieceId((p) => p.nation === "bu" && p.piece_class === "SCU" && p.type !== "hq")
		let source = findTestSpace()
		let swamp = findSpaceByPredicate(
			(space) => !space.region && !space.island_base && space.terrain === "swamp" && space.area === "balkans"
		)
		let game = setupGame(12345)

		game.pieces.fill(ELIMINATED)
		game.events = { ...game.events, romania: true, bulgaria: true }
		game.pieces[german11] = source
		expect(Engine.map.can_enter_region(game, german11, swamp)).toBe(true)

		let srSource = -1
		for (let s = 1; s < data.spaces.length; s++) {
			let info = data.spaces[s]
			if (!info || info.region || info.island_base) continue
			game.pieces[combined] = s
			game.pieces[bulgarian] = s
			if (
				Engine.map.can_sr_piece(game, combined, CP) &&
				!Engine.replacement.can_trace_supply_to_sofia(game, combined) &&
				!Engine.map.can_sr_piece(game, bulgarian, CP)
			) {
				srSource = s
				break
			}
		}

		expect(srSource).toBeGreaterThan(0)
	})

	test("German 11th Army 可按保加利亚路径使用 CP Allied RP 重建", () => {
		let german11 = findPieceId((p) => p.name === "German 11th Army")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: [],
			rp_cp: { ge: 0, tu: 0, a: 2 },
			rp_ap: { br: 0, ru: 0, in: 0, a: 0 },
			ge_to_tu_rp_used: 0
		}

		expect(Engine.replacement.can_afford_replacement(game, german11, 2)).toBe(true)
		Engine.replacement.spend_replacement_points(game, german11, 2)
		expect(game.rp_cp.a).toBe(0)
	})

	test("Asquith 联合政府后可用 BR RP 重建 RU 单位", () => {
		let ruArmy = findPieceId((p) => p.nation === "ru" && p.piece_class === "LCU" && p.type !== "hq")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: { asquith_coalition: true },
			reduced: [],
			rp_cp: { ge: 0, tu: 0, a: 0 },
			rp_ap: { br: 2, ru: 0, in: 0, a: 0 },
			br_to_ru_rp_used: false
		}

		expect(Engine.replacement.can_afford_replacement(game, ruArmy, 2)).toBe(true)
		Engine.replacement.spend_replacement_points(game, ruArmy, 2)
		expect(game.rp_ap.br).toBe(0)
	})

	test("俄国革命后不能再用 BR RP 转换重建 RU 单位", () => {
		let ruArmy = findPieceId((p) => p.nation === "ru" && p.piece_class === "LCU" && p.type !== "hq")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: { kitchener: 3, russian_revolution: 1 },
			reduced: [],
			rp_cp: { ge: 0, tu: 0, a: 0 },
			rp_ap: { br: 2, ru: 0, in: 0, a: 0 },
			br_to_ru_rp_used: false
		}

		expect(Engine.replacement.can_afford_replacement(game, ruArmy, 2)).toBe(false)
		Engine.replacement.spend_replacement_points(game, ruArmy, 2)
		expect(game.rp_ap.br).toBe(2)
		expect(game.br_to_ru_rp_used).toBe(false)
	})

	test("CP 卡牌记录的 AH RP 会并入 CP Allied RP", () => {
		let game = {
			active: CP,
			turn: 3,
			events: {},
			rp_cp: { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 },
			rp_ap: { br: 0, ru: 0, in: 0, a: 0 }
		}

		Engine.game_utils.add_rps(game, { rp_ah: 2 }, () => {})
		expect(game.rp_cp.a).toBe(2)
	})

	test("SPers Rifles 被消灭后不能重建且不能进入预备盒", () => {
		let spers = findPieceId((p) => p.name === "BR/PE SPers Rifles")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: []
		}

		expect(Engine.replacement.get_replacement_cost(game, spers)).toBe(0)
		expect(Engine.replacement.can_rebuild_in_reserve_box(spers)).toBe(false)
	})

	test("BR IN Garrison 只能在印度重建且不能进入预备盒", () => {
		let garrison = findPieceId((p) => p.name === "BR IN Garrison #1")
		let indiaSpace = findSpaceByPredicate((space) => !space.region && space.area === "india")
		let baghdad = findSpaceByPredicate((space) => space.name === "Baghdad")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: [],
			control: []
		}
		game.control[indiaSpace] = CP
		game.control[baghdad] = AP

		let rebuildSpaces = Engine.replacement.get_valid_rebuild_spaces(game, garrison, AP)
		expect(rebuildSpaces).toContain(indiaSpace)
		expect(rebuildSpaces).not.toContain(baghdad)
		expect(Engine.replacement.can_rebuild_in_reserve_box(garrison)).toBe(false)
	})

	test("BR Persian Cordon 可在 CP 控制的波斯与俾路支斯坦重建", () => {
		let cordon = findPieceId((p) => p.name === "BR Persian Cordon #1")
		let persiaSpace = findSpaceByPredicate((space) => !space.region && space.area === "persia")
		let baluchistanSpace = findSpaceByPredicate((space) => space.name === "Baluchistan")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: [],
			control: []
		}
		game.control[persiaSpace] = CP
		game.control[baluchistanSpace] = CP

		let rebuildSpaces = Engine.replacement.get_valid_rebuild_spaces(game, cordon, AP)
		expect(rebuildSpaces).toContain(persiaSpace)
		expect(rebuildSpaces).toContain(baluchistanSpace)
		expect(Engine.replacement.can_rebuild_in_reserve_box(cordon)).toBe(false)
	})

	test("BR Dunsterforce 额外允许在 AP 控制的 Baghdad 重建", () => {
		let dunsterforce = findPieceId((p) => p.name === "BR Dunsterforce")
		let baghdad = findSpaceByPredicate((space) => space.name === "Baghdad")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: [],
			control: []
		}
		game.control[baghdad] = AP

		let rebuildSpaces = Engine.replacement.get_valid_rebuild_spaces(game, dunsterforce, AP)
		expect(rebuildSpaces).toContain(baghdad)
		expect(Engine.replacement.can_rebuild_in_reserve_box(dunsterforce)).toBe(true)
	})

	test("RU/SB Yugo 在俄国革命后仍可用于俄国 MO 判定", () => {
		let yugo = findPieceId((p) => p.name && p.name.includes("RU/SB Yugo"))
		let space = findTestSpace()
		let game = {
			events: { russian_revolution: 4 }
		}

		expect(Engine.mo.check_mo_criteria(game, Engine.mo.MO_RUSSIA, AP, space, [yugo], [])).toBe(true)
	})

	test("GE GeoProtect 视为 AP 防御单位并触发专属限制", () => {
		let [originA, originB, target] = findTwoOriginsForOneTarget()
		let tu = findPieceId((p) => p.nation === "tu" && p.piece_class === "SCU" && p.type !== "hq")
		let geUnits = findPieceIds(
			(p) => p.nation === "ge" && p.piece_class === "SCU" && p.type !== "hq" && p.name !== "GE GeoProtect",
			2
		)
		let geoprotect = findPieceId((p) => p.name === "GE GeoProtect")
		let nonBalkanSpace = findSpaceByPredicate(
			(space) => !space.region && !space.island_base && space.area && space.area !== "balkans"
		)
		let removedBox = Engine.game_utils.get_removed_box(CP)
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: [],
			control: [],
			retreated: [],
			active: CP,
			attack: null
		}
		game.pieces[tu] = originA
		game.pieces[geUnits[0]] = originB
		game.pieces[geUnits[1]] = nonBalkanSpace
		game.pieces[geoprotect] = target

		expect(Engine.game_utils.get_piece_effective_faction(game, geoprotect)).toBe(AP)
		expect(Engine.map.is_in_supply(game, target, AP, geoprotect)).toBe(true)
		expect(Engine.game_utils.get_capacity(game, target)).toBe(0)
		expect(Engine.map.can_stack_end_in_space(game, target, [tu])).toBe(false)
		expect(
			Engine.combat.can_activate_piece_in_space_to_attack(game, tu, originA, CP, () => "Summer", () => true)
		).toBe(true)
		expect(
			Engine.combat.can_activate_piece_in_space_to_attack(game, geUnits[0], originB, CP, () => "Summer", () => true)
		).toBe(false)

		game.attack = { pieces: [tu], space: target, attacker: CP, defender: AP }
		Engine.combat.start_attack_sequence(game)

		expect(game.georgian_protectorate_attacked).toBe(true)
		expect(game.no_ge_to_tu_rp_conversion).toBe(true)
		expect(game.pieces[geUnits[1]]).toBe(removedBox)
	})

	test("Bull's Eye 清理不会误移除 HQ 或重炮", () => {
		let space = findTestSpace()
		let reserve = Engine.game_utils.get_scu_reserve_box(CP)
		let regulars = findPieceIds(
			(p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq" && p.symbol !== "Y" && p.symbol !== "H",
			4
		)
		let hq = findPieceId((p) => p.faction === CP && p.type === "hq")
		let heavyArty = findPieceId((p) => p.faction === CP && p.symbol === "H")
		let yildirim = findPieceId((p) => p.faction === CP && p.symbol === "Y")
		let game = {
			pieces: new Array(data.pieces.length).fill(ELIMINATED),
			events: {},
			reduced: [],
			control: [],
			log: []
		}

		for (let p of [...regulars, hq, heavyArty, yildirim]) game.pieces[p] = space

		expect(Engine.map.get_stack_count(Engine.map.get_pieces_in_space(game, space))).toBe(4)

		Engine.events.bulls_eye_cleanup_scus(game)

		expect(game.pieces[hq]).toBe(space)
		expect(game.pieces[heavyArty]).toBe(space)
		expect(game.pieces[yildirim]).toBe(space)
		expect(game.pieces[regulars[3]]).toBe(reserve)
		expect(Engine.map.get_stack_count(Engine.map.get_pieces_in_space(game, space))).toBe(3)
	})

	test("保加利亚崩溃不会再进入额外 SR 状态", () => {
		let sofia = findSpaceByPredicate((space) => String(space.name).toLowerCase() === "sofia")
		let german11 = findPieceId((p) => p.name === "German 11th Army")
		let bulgarianArmy = findPieceId((p) => p.nation === "bu" && p.piece_class === "LCU")
		let geScu = findPieceId((p) => p.nation === "ge" && p.piece_class === "SCU" && p.type !== "hq")
		let reserve = Engine.game_utils.get_scu_reserve_box(CP)
		let game = createMinimalGame({
			events: { bulgaria: true }
		})

		game.control[sofia] = AP
		game.pieces[german11] = sofia
		game.pieces[bulgarianArmy] = sofia
		game.pieces[geScu] = reserve

		expect(Engine.collapse.handle_national_collapse(game, () => {})).toBe(false)
		expect(game.events["bulgarian_collapse"]).toBe(8)
		expect(game.state).not.toBe("event_bulgarian_collapse_sr")
		expect(game.pieces[german11]).toBe(Engine.game_utils.get_removed_box(CP))
		expect(game.pieces[geScu]).toBe(sofia)
	})

	test("塞尔维亚满足条件时会在战争状态阶段给出自愿崩溃选项", () => {
		let belgrade = findSpaceByPredicate((space) => String(space.name).toLowerCase() === "belgrade")
		let sbArmy = findPieceId((p) => p.nation === "sb" && p.piece_class === "LCU")
		let game = createMinimalGame({
			events: { bulgaria: true }
		})

		game.control[belgrade] = CP
		game.pieces[sbArmy] = belgrade

		expect(Engine.collapse.handle_national_collapse(game, () => {})).toBe(true)
		expect(game.state).toBe("war_status_serbian_collapse_offer")
		expect(game.active).toBe(AP)
	})

	test("combat 模块直接执行多国协同攻击限制", () => {
		let [originA, originB, target] = findTwoOriginsForOneTarget()
		let british = findPieceId(
			(p) => ["br", "in", "anz"].includes(p.nation) && p.piece_class === "SCU" && p.type !== "hq"
		)
		let yugo = findPieceId((p) => p.name && p.name.includes("RU/SB Yugo"))
		let enemy = findPieceId((p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq")
		let game = createMinimalGame({
			active: AP,
			events: {}
		})

		game.pieces[british] = originA
		game.pieces[yugo] = originB
		game.pieces[enemy] = target

		expect(
			Engine.combat.get_legal_attackable_spaces(game, [british, yugo], AP, () => "Summer", () => true)
		).toEqual([])
	})

	test("combat.start_attack_sequence 会登记 CP 的希腊锁定目标", () => {
		let [origin, target] = findBorderIntoGreece()
		let attacker = findPieceId((p) => p.faction === CP && p.piece_class === "SCU" && p.type !== "hq")
		let defender = findPieceId((p) => p.faction === AP && p.piece_class === "SCU" && p.type !== "hq")
		let game = createMinimalGame({
			active: CP,
			events: {},
			attack: { pieces: [attacker], space: target }
		})

		game.pieces[attacker] = origin
		game.pieces[defender] = target

		Engine.combat.start_attack_sequence(game)

		expect(game.balkan_attack_targets.cp).toBe(target)
	})

	test("塞尔维亚崩溃后攻击范围会随贝尔格莱德控制权正确变化", () => {
		let [origin, nonGreekTarget] = findBorderFromSerbiaOrGreece()
		let [, balkanTarget] = findBalkanBorderFromSerbiaOrGreece()
		let belgrade = findSpaceByPredicate((space) => String(space.name).toLowerCase() === "belgrade")
		let sbUnit = findPieceId((p) => p.nation === "sb" && p.piece_class === "SCU")
		let cpUnits = findPieceIds((p) => p.faction === CP && p.piece_class === "SCU" && p.nation !== "bu" && p.type !== "hq", 2)
		let game = createMinimalGame({
			active: AP,
			events: { serbian_collapse: 7 }
		})

		game.control[belgrade] = CP
		game.pieces[sbUnit] = origin
		game.pieces[cpUnits[0]] = nonGreekTarget
		game.pieces[cpUnits[1]] = balkanTarget

		expect(
			Engine.collapse.can_piece_attack_after_serbian_collapse(game, sbUnit, nonGreekTarget)
		).toBe(false)
		expect(
			Engine.collapse.can_piece_attack_after_serbian_collapse(game, sbUnit, balkanTarget)
		).toBe(false)
		expect(
			Engine.combat.can_activate_piece_in_space_to_attack(game, sbUnit, origin, AP, () => "Summer", () => true)
		).toBe(false)

		game.control[belgrade] = AP
		expect(
			Engine.collapse.can_piece_attack_after_serbian_collapse(game, sbUnit, nonGreekTarget)
		).toBe(data.spaces[nonGreekTarget].area === "balkans")
		expect(
			Engine.collapse.can_piece_attack_after_serbian_collapse(game, sbUnit, balkanTarget)
		).toBe(true)
		expect(
			Engine.combat.can_activate_piece_in_space_to_attack(game, sbUnit, origin, AP, () => "Summer", () => true)
		).toBe(true)
	})

	test("2 SCU 组合会按规则进入预备区与永久消灭区，且之后可结束行动轮", () => {
		let { game, plan, space } = createCombineDisposeGame(AP, "reduced")
		let role = currentPlayer(game)
		let reserve = Engine.game_utils.get_scu_reserve_box(AP)
		let removed = Engine.game_utils.get_removed_box(AP)

		game = rules.action(game, role, "piece", plan.scus[0])
		expect(game.pieces[plan.scus[0]]).toBe(reserve)
		expect(game.state).toBe("combine_lcu_dispose_removed")

		game = rules.action(game, role, "piece", plan.scus[1])
		expect(game.pieces[plan.scus[1]]).toBe(removed)
		expect(game.pieces[plan.lcu]).toBe(space)
		expect(game.reduced.includes(plan.lcu)).toBe(true)
		expect(game.state).toBe("choose_move_space")

		game = rules.action(game, role, "done")
		expect(game.state).toBe("end_operations")

		let view = rules.view(game, role)
		expect(view.prompt).toBe("操作完成.")
		expect(view.actions.end_action).toBe(1)

		let afterEndAction = rules.action(game, role, "end_action")
		expect(afterEndAction.state).toBe("play_card")
		expect(afterEndAction.active).toBe(CP)
	})

	test("3 SCU 组合会按规则进入预备区、消灭区与永久消灭区", () => {
		let { game, plan, space } = createCombineDisposeGame(AP, "full")
		let role = currentPlayer(game)
		let reserve = Engine.game_utils.get_scu_reserve_box(AP)
		let eliminated = Engine.game_utils.get_eliminated_box(AP)
		let removed = Engine.game_utils.get_removed_box(AP)

		game = rules.action(game, role, "piece", plan.scus[0])
		expect(game.pieces[plan.scus[0]]).toBe(reserve)
		expect(game.state).toBe("combine_lcu_dispose_eliminated")

		game = rules.action(game, role, "piece", plan.scus[1])
		expect(game.pieces[plan.scus[1]]).toBe(eliminated)
		expect(game.state).toBe("combine_lcu_dispose_removed")

		game = rules.action(game, role, "piece", plan.scus[2])
		expect(game.pieces[plan.scus[2]]).toBe(removed)
		expect(game.pieces[plan.lcu]).toBe(space)
		expect(game.reduced.includes(plan.lcu)).toBe(false)
		expect(game.state).toBe("choose_move_space")
	})
})
