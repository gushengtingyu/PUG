const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const fuzz = require("./runtime_fuzz_loop.js")

const { AP, CP, ELIMINATED } = Engine.constants
const { data } = Engine

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
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
})
