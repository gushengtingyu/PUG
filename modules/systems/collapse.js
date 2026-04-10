"use strict"

module.exports = function (Engine) {
	const { data } = Engine
	const { AP, CP } = Engine.constants
	const ROMANIA_COLLAPSE_EVENT_KEY = "romania_collapse"
	const COLLAPSE_SR_LIMIT = 2
	const BELGRADE = Engine.game_utils.find_space("BELGRADE")
	const SKOPJE = Engine.game_utils.find_space("Skopje")
	const BUCHAREST = Engine.game_utils.find_space("BUCHAREST")
	const PLOESTI = Engine.game_utils.find_space("Ploesti")
	const CONSTANTA = Engine.game_utils.find_space("Constanta")
	const SOFIA = Engine.game_utils.find_space("SOFIA")

	const BULGARIA_ENTRY_PLAN = Object.freeze({
		cp: Object.freeze({
			fixed_armies: Object.freeze(["BU 1 Army", "BU 2 Army", "BU 3 Army"]),
			bu_division_pool: Object.freeze([
				"BU DIV #1",
				"BU DIV #2",
				"BU DIV #3",
				"BU DIV #4",
				"BU DIV #5",
				"BU DIV #6",
				"BU DIV #7"
			]),
			ge_division_pool: Object.freeze(["GE DIV #1", "GE DIV #2", "GE DIV #3", "GE DIV #4"]),
			ah_division_pool: Object.freeze(["AH DIV #1", "AH DIV #2", "AH DIV #3", "AH DIV #4", "AH DIV #5", "AH DIV #6"]),
			ge_support: Object.freeze(["German 11th Army", "GE Mackenson HQ", "GE Hvy Arty"])
		}),
		ap: Object.freeze({
			armies: Object.freeze(["SB 1 Army", "SB 2 Army", "SB 3 Army"]),
			cavalry: "SB Cavalry",
			divisions: Object.freeze(["SB DIV #1", "SB DIV #2", "SB DIV #3", "SB DIV #4", "SB DIV #5", "SB DIV #6"])
		})
	})
	const ROMANIA_ENTRY_PLAN = Object.freeze({
		ap: Object.freeze({
			ro_units: Object.freeze([
				"RO 1 Army",
				"RO 2 Army",
				"RO 3 Army",
				"RO Cavalry",
				"RO DIV #1",
				"RO DIV #2",
				"RO DIV #3",
				"RO DIV #4",
				"RO DIV #5",
				"RO DIV #6"
			])
		}),
		cp: Object.freeze({
			ge_units: Object.freeze(["GE IX Army", "GE Falkenhayn HQ", "GE Hvy Arty"]),
			ah_units: Object.freeze(["Combined BU/AH Div", "AH DIV #1", "AH DIV #2", "AH DIV #3"])
		})
	})

	const BULGARIAN_ENTRY_UNIT_NAMES = new Set([
		...BULGARIA_ENTRY_PLAN.cp.ah_division_pool,
		...BULGARIA_ENTRY_PLAN.cp.fixed_armies,
		"BU 4 Army",
		...BULGARIA_ENTRY_PLAN.cp.bu_division_pool,
		"Combined BU/AH Div",
		"GE Alpenkorps",
		...BULGARIA_ENTRY_PLAN.cp.ge_division_pool,
		...BULGARIA_ENTRY_PLAN.cp.ge_support,
		"GE IV R Corps",
		"GE Schmettow"
	])
	const ROMANIAN_ENTRY_UNIT_NAMES = new Set([
		...ROMANIA_ENTRY_PLAN.ap.ro_units,
		...ROMANIA_ENTRY_PLAN.cp.ge_units,
		...ROMANIA_ENTRY_PLAN.cp.ah_units
	])
	const ROMANIAN_COLLAPSE_AH_UNIT_NAMES = new Set([...ROMANIA_ENTRY_PLAN.cp.ah_units])
	// 两个崩溃事件的“可选保留/移除”名单并不相同：
	// 塞尔维亚崩溃看保加利亚入场时的 AH 师，罗马尼亚崩溃看罗马尼亚入场时的 AH 单位。
	const COLLAPSE_OPTIONAL_REMOVAL_PLAN = Object.freeze({
		serbia: BULGARIA_ENTRY_PLAN.cp.ah_division_pool,
		romania: ROMANIA_ENTRY_PLAN.cp.ah_units
	})
	const {
		find_space,
		eliminate_piece,
		find_piece_by_name,
		is_not_on_map,
		is_in_reserve,
		is_lcu,
		is_scu,
		is_piece_reduced,
		get_piece_nation,
		get_capacity,
		piece_counts_as_nation_for_rule,
		piece_name
	} = Engine.game_utils

	const { is_controlled_by, get_pieces_in_space, is_balkans } = Engine.map

	const exports = {}

	function validate_entry_rules() {
		const bulgarianUnitSets = [
			BULGARIA_ENTRY_PLAN.cp.fixed_armies,
			BULGARIA_ENTRY_PLAN.cp.bu_division_pool,
			BULGARIA_ENTRY_PLAN.cp.ge_division_pool,
			BULGARIA_ENTRY_PLAN.cp.ah_division_pool,
			BULGARIA_ENTRY_PLAN.cp.ge_support
		]

		for (let units of bulgarianUnitSets) {
			for (let name of units) {
				if (!BULGARIAN_ENTRY_UNIT_NAMES.has(name)) {
					throw new Error(`Invalid Bulgarian entry rules: missing unit ${name}`)
				}
			}
		}

		if (!ROMANIAN_ENTRY_UNIT_NAMES.has("GE IX Army")) {
			throw new Error("Invalid Romanian entry rules: missing unit GE IX Army")
		}
		if (ROMANIAN_ENTRY_UNIT_NAMES.has("GE 9 Army")) {
			throw new Error("Invalid Romanian entry rules: deprecated unit GE 9 Army")
		}

		const pieceNames = new Set()
		for (let info of data.pieces) {
			if (info && info.name) pieceNames.add(info.name)
		}

		const hardcodedUnitNames = new Set([
			...BULGARIAN_ENTRY_UNIT_NAMES,
			...ROMANIAN_ENTRY_UNIT_NAMES,
			...ROMANIAN_COLLAPSE_AH_UNIT_NAMES
		])
		for (let name of hardcodedUnitNames) {
			if (!pieceNames.has(name)) {
				throw new Error(`Invalid collapse rules: unknown hardcoded unit ${name}`)
			}
		}
	}

	function is_bulgarian_entry_piece(info) {
		if (!info) return false
		return BULGARIAN_ENTRY_UNIT_NAMES.has(info.name)
	}

	function is_romanian_entry_piece(info) {
		if (!info) return false
		return ROMANIAN_ENTRY_UNIT_NAMES.has(info.name)
	}

	function get_bulgaria_entry_plan() {
		return BULGARIA_ENTRY_PLAN
	}

	function get_bulgarian_entry_ah_divisions() {
		return BULGARIA_ENTRY_PLAN.cp.ah_division_pool
	}

	function get_collapse_choice_unit_names(nation) {
		return COLLAPSE_OPTIONAL_REMOVAL_PLAN[nation] || []
	}

	function get_romanian_entry_plan() {
		return ROMANIA_ENTRY_PLAN
	}

	function get_collapse_sr_limit() {
		return COLLAPSE_SR_LIMIT
	}

	function has_serbia_collapsed(game) {
		return !!(game && game.events && game.events["serbian_collapse"])
	}

	function has_romania_collapsed(game) {
		return !!(game && game.events && game.events[ROMANIA_COLLAPSE_EVENT_KEY])
	}

	function is_romania_uncollapsed(game) {
		return !!(game && game.events && game.events["romania"] && !has_romania_collapsed(game))
	}

	function ensure_collapse_status(game) {
		if (!game.collapse_status || game.collapse_status.turn !== game.turn) {
			game.collapse_status = {
				turn: game.turn,
				serbia_considered: false,
				romania_considered: false
			}
		}
		return game.collapse_status
	}

	function mark_collapse_considered(game, nation) {
		let status = ensure_collapse_status(game)
		status[`${nation}_considered`] = true
	}

	function has_sb_lcu_in_serbia(game) {
		for (let s = 1; s < data.spaces.length; s++) {
			if (data.spaces[s] && data.spaces[s].nation === "sb") {
				let pieces = get_pieces_in_space(game, s)
				for (let p of pieces) {
					if (get_piece_nation(p) === "sb" && is_lcu(p)) return true
				}
			}
		}
		return false
	}

	function are_all_ro_lcus_eliminated(game) {
		for (let p = 0; p < data.pieces.length; p++) {
			if (get_piece_nation(p) === "ro" && is_lcu(p)) {
				if (!is_not_on_map(game, p)) return false
			}
		}
		return true
	}

	function has_ru_lcu_in_romania(game) {
		for (let s = 1; s < data.spaces.length; s++) {
			if (data.spaces[s] && data.spaces[s].nation === "ro") {
				let pieces = get_pieces_in_space(game, s)
				for (let p of pieces) {
					if (get_piece_nation(p) === "ru" && is_lcu(p)) return true
				}
			}
		}
		return false
	}

	function can_offer_serbian_collapse(game) {
		// 19.4.5：只要贝尔格莱德已被 CP 控制，AP 每个战争状态阶段都可以选择宣布塞尔维亚崩溃。
		if (has_serbia_collapsed(game)) return false
		if (!game.events["bulgaria"]) return false
		return BELGRADE >= 0 && is_controlled_by(game, BELGRADE, CP)
	}

	function should_auto_serbian_collapse(game) {
		// 19.4.5：自动崩溃需要同时满足“贝尔格莱德与斯科普里皆为 CP 控制”且“塞尔维亚境内无 SB LCU”。
		if (has_serbia_collapsed(game)) return false
		if (!game.events["bulgaria"]) return false

		if (
			BELGRADE < 0 ||
			SKOPJE < 0 ||
			!is_controlled_by(game, BELGRADE, CP) ||
			!is_controlled_by(game, SKOPJE, CP)
		) {
			return false
		}

		return !has_sb_lcu_in_serbia(game)
	}

	function can_offer_romanian_collapse(game) {
		// 19.5.5：只要罗马尼亚已经参战且尚未崩溃，AP 就可以在战争状态阶段主动宣布其崩溃。
		if (has_romania_collapsed(game)) return false
		return !!game.events["romania"]
	}

	function should_auto_romanian_collapse(game) {
		// 19.5.5：自动崩溃二选一——三座关键城市全失，或 RO LCU 全灭且罗马尼亚境内没有 RU LCU。
		if (has_romania_collapsed(game)) return false
		if (!game.events["romania"]) return false

		if (
			BUCHAREST >= 0 &&
			is_controlled_by(game, BUCHAREST, CP) &&
			PLOESTI >= 0 &&
			is_controlled_by(game, PLOESTI, CP) &&
			CONSTANTA >= 0 &&
			is_controlled_by(game, CONSTANTA, CP)
		) {
			return true
		}

		return are_all_ro_lcus_eliminated(game) && !has_ru_lcu_in_romania(game)
	}

	function can_piece_attack_after_serbian_collapse(game, p, target) {
		if (!piece_counts_as_nation_for_rule(game, p, "sb")) return true
		if (!has_serbia_collapsed(game)) return true

		let info = data.spaces[target]
		if (!info) return false

		// 19.4.6：塞军在贝尔格莱德收复前只能攻击塞尔维亚/希腊；一旦贝尔格莱德回到 AP 手中，限制扩展为整个巴尔干。
		if (BELGRADE >= 0 && is_controlled_by(game, BELGRADE, AP)) {
			return is_balkans(target)
		}

		return info.nation === "sb" || info.nation === "gr"
	}

	function can_collapse_sr_piece(game, p) {
		if (!data.pieces[p] || data.pieces[p].faction !== CP) return false
		let s = game.pieces[p]
		return s > 0 && is_balkans(s)
	}

	function get_collapse_sr_destination_spaces(game) {
		let list = []
		for (let s = 1; s < data.spaces.length; s++) {
			if (!data.spaces[s] || !is_balkans(s)) continue
			if (!is_controlled_by(game, s, CP)) continue
			if (get_capacity(game, s) <= 0) continue
			list.push(s)
		}
		return list
	}

	function create_collapse_choice_ctx(collapse_nation, choice_limit) {
		// 选择移除阶段结束后，还要无缝衔接“最多 2 个单位免费 SR”的后续步骤。
		return {
			collapse_nation,
			choice_limit,
			move_limit: COLLAPSE_SR_LIMIT,
			data: { removed: [] }
		}
	}

	function create_collapse_sr_ctx() {
		return {
			move_limit: COLLAPSE_SR_LIMIT,
			data: { moved: [] }
		}
	}

	function apply_bulgarian_collapse(game, log) {
		if (game.events && game.events["bulgarian_collapse"]) return "none"
		if (!game.events["bulgaria"]) return "none"

		if (SOFIA >= 0 && is_controlled_by(game, SOFIA, AP)) {
			game.events["bulgarian_collapse"] = game.turn
			log("保加利亚崩溃。")
			game.vp -= 1
			log("CP 失去 1 VP。")

			for (let p = 0; p < data.pieces.length; p++) {
				if (get_piece_nation(p) === "bu") {
					eliminate_piece(game, p, log, true)
				}
			}

			let gebu_xi = find_piece_by_name(CP, "German 11th Army")
			if (gebu_xi >= 0 && !is_not_on_map(game, gebu_xi)) {
				let s = game.pieces[gebu_xi]
				eliminate_piece(game, gebu_xi, log, true)
				// 19.3.5：GE-BU 第 11 集团军移除后，用预备盒中的一支 GE 步兵 SCU 替换（若可用）。
				for (let p = 0; p < data.pieces.length; p++) {
					if (get_piece_nation(p) === "ge" && is_scu(p) && is_in_reserve(game, p)) {
						game.pieces[p] = s
						let name = is_piece_reduced(game, p) ? `(${piece_name(p)})` : piece_name(p)
						log(`德布第11集团军被 ${name} 替换。`)
						break
					}
				}
			}

			return "resolved"
		}
		return "none"
	}

	function apply_serbian_collapse(game, log, options = {}) {
		if (has_serbia_collapsed(game)) return "none"
		if (!game.events["bulgaria"]) return "none"
		if (!options.force && !should_auto_serbian_collapse(game)) return "none"

		mark_collapse_considered(game, "serbia")

		game.events["serbian_collapse"] = game.turn
		log("塞尔维亚崩溃。")

		let no_br_lcu = true
		for (let s = 1; s < data.spaces.length; s++) {
			if (data.spaces[s] && (data.spaces[s].nation === "sb" || data.spaces[s].nation === "gr")) {
				let pieces = get_pieces_in_space(game, s)
				for (let p of pieces) {
					if (get_piece_nation(p) === "br" && is_lcu(p)) {
						no_br_lcu = false
						break
					}
				}
			}
			if (!no_br_lcu) break
		}
		if (no_br_lcu) {
			game.vp += 1
			log("CP 获得 1 VP (塞尔维亚/希腊没有英国 LCU)。")
		}

		for (let p = 0; p < data.pieces.length; p++) {
			if (get_piece_nation(p) === "sb") {
				if (is_lcu(p)) {
					eliminate_piece(game, p, log, true)
				} else if (is_scu(p)) {
					let s = game.pieces[p]
					if (!is_not_on_map(game, p) && !Engine.map.can_trace_supply_to_ap_port(game, s, AP)) {
						eliminate_piece(game, p, log, true)
					}
				}
			}
		}

		const exceptions = ["German 11th Army", "GE Mackenson HQ", "GE Hvy Arty"]
		let romania_uncollapsed = is_romania_uncollapsed(game)
		// 19.4.6：若罗马尼亚已参战且尚未崩溃，GE Alpenkorps 也会保留。
		if (romania_uncollapsed) exceptions.push("GE Alpenkorps")

		let ge_inf_scu_count = 0
		for (let p = 0; p < data.pieces.length; p++) {
			let info = data.pieces[p]
			if (!info) continue

			let is_bulgarian_entry = is_bulgarian_entry_piece(info)
			if (!is_bulgarian_entry) continue

			let is_exception = exceptions.some((e) => info.name.includes(e))
			if (!is_exception && info.nation === "ge" && is_scu(p) && ge_inf_scu_count < 2) {
				is_exception = true
				ge_inf_scu_count++
			}
			// 19.4.6：在罗马尼亚尚未崩溃时，AH 单位不立即自动移除，而是交给后续“选择移除 2 个 AH 师”步骤处理。
			if (info.nation === "ah" && romania_uncollapsed) {
				is_exception = true
			}

			if (!is_exception) {
				eliminate_piece(game, p, log, true)
			}
		}

		game.active = CP
		if (romania_uncollapsed) {
			game.state = "event_serbian_collapse_choice"
			game.event_ctx = create_collapse_choice_ctx("serbia", 2)
		} else {
			game.state = "event_serbian_collapse_sr"
			game.event_ctx = create_collapse_sr_ctx()
		}

		return "interactive"
	}

	function apply_romanian_collapse(game, log, options = {}) {
		if (has_romania_collapsed(game)) return "none"
		if (!game.events["romania"]) return "none"
		if (!options.force && !should_auto_romanian_collapse(game)) return "none"

		mark_collapse_considered(game, "romania")

		game.events[ROMANIA_COLLAPSE_EVENT_KEY] = game.turn
		log("罗马尼亚崩溃。")

		for (let p = 0; p < data.pieces.length; p++) {
			if (get_piece_nation(p) === "ro") {
				eliminate_piece(game, p, log, true)
			}
		}

		let ge_cav = find_piece_by_name(CP, "GE Schmettow")
		if (ge_cav >= 0) eliminate_piece(game, ge_cav, log, true)

		let choice_available = !!game.events["bulgaria"] && !has_serbia_collapsed(game)
		// 19.5.6：若保加利亚已参战且塞尔维亚尚未崩溃，则罗马尼亚崩溃后不是直接清空 AH 入场单位，
		// 而是让 CP 从这些单位中选择 3 个移除。
		for (let p = 0; p < data.pieces.length; p++) {
			let info = data.pieces[p]
			if (!info || !ROMANIAN_COLLAPSE_AH_UNIT_NAMES.has(info.name)) continue
			// 名单里包含 Combined BU/AH Div；虽然数据国别是 bu，但规则上它也属于此处“3 个单位中任选移除”的集合。
			if (choice_available) continue
			eliminate_piece(game, p, log, true)
		}

		game.active = CP
		if (choice_available) {
			game.state = "event_romanian_collapse_choice"
			game.event_ctx = create_collapse_choice_ctx("romania", 3)
		} else {
			game.state = "event_romanian_collapse_sr"
			game.event_ctx = create_collapse_sr_ctx()
		}

		return "interactive"
	}

	function maybe_offer_serbian_collapse(game) {
		let status = ensure_collapse_status(game)
		if (status.serbia_considered || !can_offer_serbian_collapse(game)) return "none"
		game.active = AP
		game.state = "war_status_serbian_collapse_offer"
		return "interactive"
	}

	function maybe_offer_romanian_collapse(game) {
		let status = ensure_collapse_status(game)
		if (status.romania_considered || !can_offer_romanian_collapse(game)) return "none"
		game.active = AP
		game.state = "war_status_romanian_collapse_offer"
		return "interactive"
	}

	function accept_voluntary_collapse(game, nation, log) {
		if (nation === "serbia") return apply_serbian_collapse(game, log, { force: true })
		if (nation === "romania") return apply_romanian_collapse(game, log, { force: true })
		return "none"
	}

	function decline_voluntary_collapse(game, nation) {
		mark_collapse_considered(game, nation)
	}

	function handle_national_collapse(game, log) {
		ensure_collapse_status(game)

		while (true) {
			let result = apply_bulgarian_collapse(game, log)
			if (result === "interactive") return true
			if (result === "resolved") continue

			result = apply_serbian_collapse(game, log)
			if (result === "interactive") return true
			if (result === "resolved") continue

			result = maybe_offer_serbian_collapse(game)
			if (result === "interactive") return true

			result = apply_romanian_collapse(game, log)
			if (result === "interactive") return true
			if (result === "resolved") continue

			result = maybe_offer_romanian_collapse(game)
			if (result === "interactive") return true

			return false
		}
	}

	validate_entry_rules()

	exports.handle_national_collapse = handle_national_collapse
	exports.get_bulgaria_entry_plan = get_bulgaria_entry_plan
	exports.get_bulgarian_entry_ah_divisions = get_bulgarian_entry_ah_divisions
	exports.get_collapse_choice_unit_names = get_collapse_choice_unit_names
	exports.get_romanian_entry_plan = get_romanian_entry_plan
	exports.get_collapse_sr_limit = get_collapse_sr_limit
	exports.is_bulgarian_entry_piece = is_bulgarian_entry_piece
	exports.is_romanian_entry_piece = is_romanian_entry_piece
	exports.has_serbia_collapsed = has_serbia_collapsed
	exports.has_romania_collapsed = has_romania_collapsed
	exports.is_romania_uncollapsed = is_romania_uncollapsed
	exports.ensure_collapse_status = ensure_collapse_status
	exports.accept_voluntary_collapse = accept_voluntary_collapse
	exports.decline_voluntary_collapse = decline_voluntary_collapse
	exports.can_piece_attack_after_serbian_collapse = can_piece_attack_after_serbian_collapse
	exports.can_collapse_sr_piece = can_collapse_sr_piece
	exports.get_collapse_sr_destination_spaces = get_collapse_sr_destination_spaces

	return exports
}
