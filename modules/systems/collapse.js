"use strict"

module.exports = function (Engine) {
	const { data } = Engine
	const { AP, CP } = Engine.constants
	const ROMANIA_COLLAPSE_EVENT_KEY = "romania_collapse"

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
		"RO 1 Army",
		"RO 2 Army",
		"RO 3 Army",
		"RO Cavalry",
		"RO DIV #1",
		"RO DIV #2",
		"RO DIV #3",
		"RO DIV #4",
		"RO DIV #5",
		"RO DIV #6",
		"GE 9 Army",
		"GE Falkenhayn HQ",
		"GE Hvy Arty",
		"Combined BU/AH Div",
		"AH 1 Army",
		"AH 7 Army",
		"AH DIV #1",
		"AH DIV #2",
		"AH DIV #3"
	])
	const {
		find_space,
		eliminate_piece,
		find_piece_by_name,
		is_not_on_map,
		is_in_reserve,
		is_lcu,
		is_scu,
		get_piece_nation
	} = Engine.game_utils

	const { is_controlled_by, get_pieces_in_space } = Engine.map

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
	}

	function is_bulgarian_entry_piece(info) {
		if (!info) return false
		if (BULGARIAN_ENTRY_UNIT_NAMES.has(info.name)) return true
		return !!info.bulgarian_entry
	}

	function is_romanian_entry_piece(info) {
		if (!info) return false
		if (ROMANIAN_ENTRY_UNIT_NAMES.has(info.name)) return true
		return !!info.romanian_entry
	}

	function get_bulgaria_entry_plan() {
		return BULGARIA_ENTRY_PLAN
	}

	function get_bulgarian_entry_ah_divisions() {
		return BULGARIA_ENTRY_PLAN.cp.ah_division_pool
	}

	function is_romania_uncollapsed(game) {
		return !!(game.events["romania"] && !game.events[ROMANIA_COLLAPSE_EVENT_KEY])
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

	function apply_bulgarian_collapse(game, log) {
		if (game.events && game.events["bulgarian_collapse"]) return false
		if (!game.events["bulgaria"]) return false

		let sofia = find_space("SOFIA")
		if (sofia >= 0 && is_controlled_by(game, sofia, AP)) {
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
				for (let p = 0; p < data.pieces.length; p++) {
					if (get_piece_nation(p) === "ge" && is_scu(p) && is_in_reserve(game, p)) {
						game.pieces[p] = s
						log(`德布第11集团军被 ${Engine.game_utils.piece_name(p)} 替换。`)
						break
					}
				}
			}

			game.active = CP
			game.state = "event_bulgarian_collapse_sr"
			return true
		}
		return false
	}

	function apply_serbian_collapse(game, log) {
		if (game.events && game.events["serbian_collapse"]) return false
		if (!game.events["bulgaria"]) return false

		let belgrade = find_space("BELGRADE")
		let skopje = find_space("Skopje")
		let auto_collapse = false

		if (
			belgrade >= 0 &&
			skopje >= 0 &&
			is_controlled_by(game, belgrade, CP) &&
			is_controlled_by(game, skopje, CP)
		) {
			let has_sb_lcu_in_serbia = false
			for (let s = 1; s < data.spaces.length; s++) {
				if (data.spaces[s] && data.spaces[s].nation === "sb") {
					let pieces = get_pieces_in_space(game, s)
					for (let p of pieces) {
						if (get_piece_nation(p) === "sb" && is_lcu(p)) {
							has_sb_lcu_in_serbia = true
							break
						}
					}
				}
				if (has_sb_lcu_in_serbia) break
			}
			auto_collapse = !has_sb_lcu_in_serbia
		}

		if (!auto_collapse) return false

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
			game.event_ctx = { count: 2 }
		} else {
			game.state = "event_serbian_collapse_sr"
		}

		return true
	}

	function apply_romanian_collapse(game, log) {
		if (game.events && game.events[ROMANIA_COLLAPSE_EVENT_KEY]) return false
		if (!game.events["romania"]) return false

		let bucharest = find_space("Bucharest")
		let ploesti = find_space("Ploesti")
		let constanta = find_space("Constanta")
		let auto_collapse = false

		if (
			bucharest >= 0 &&
			is_controlled_by(game, bucharest, CP) &&
			ploesti >= 0 &&
			is_controlled_by(game, ploesti, CP) &&
			constanta >= 0 &&
			is_controlled_by(game, constanta, CP)
		) {
			auto_collapse = true
		}

		if (!auto_collapse && are_all_ro_lcus_eliminated(game) && !has_ru_lcu_in_romania(game)) {
			auto_collapse = true
		}

		if (!auto_collapse) return false

		game.events[ROMANIA_COLLAPSE_EVENT_KEY] = game.turn
		log("罗马尼亚崩溃。")

		for (let p = 0; p < data.pieces.length; p++) {
			if (get_piece_nation(p) === "ro") {
				eliminate_piece(game, p, log, true)
			}
		}

		let ge_cav = find_piece_by_name(CP, "GE Schmettow")
		if (ge_cav >= 0) eliminate_piece(game, ge_cav, log, true)

		let choice_available = !!game.events["bulgaria"] && !game.events["serbian_collapse"]
		for (let p = 0; p < data.pieces.length; p++) {
			let info = data.pieces[p]
			if (!is_romanian_entry_piece(info)) continue
			if (info.nation === "ah" && choice_available) continue
			eliminate_piece(game, p, log, true)
		}

		game.active = CP
		if (choice_available) {
			game.state = "event_romanian_collapse_choice"
			game.event_ctx = { count: 3 }
		} else {
			game.state = "event_romanian_collapse_sr"
		}

		return true
	}

	function handle_national_collapse(game, log) {
		if (apply_bulgarian_collapse(game, log)) return true
		if (apply_serbian_collapse(game, log)) return true
		return apply_romanian_collapse(game, log);
	}

	validate_entry_rules()

	exports.handle_national_collapse = handle_national_collapse
	exports.get_bulgaria_entry_plan = get_bulgaria_entry_plan
	exports.get_bulgarian_entry_ah_divisions = get_bulgarian_entry_ah_divisions
	exports.is_bulgarian_entry_piece = is_bulgarian_entry_piece
	exports.is_romanian_entry_piece = is_romanian_entry_piece
	exports.is_romania_uncollapsed = is_romania_uncollapsed

	return exports
}
