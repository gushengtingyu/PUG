"use strict"

module.exports = function (Engine) {
	const { data, game_utils } = Engine
	const exports = {}
	const { AP, CP } = Engine.constants
	const { find_space } = game_utils

	function normalize_greece_faction(value) {
		if (value === AP || value === CP) return value
		if (value === true) return AP
		if (value === "AP") return AP
		if (value === "CP") return CP
		return null
	}

	function get_greece_faction(game) {
		if (!game || !game.events) return null
		return normalize_greece_faction(game.events["greece"])
	}

	function set_greece_faction(game, faction) {
		if (!game.events) game.events = {}
		let normalized = normalize_greece_faction(faction)
		if (!normalized) return false
		game.events["greece"] = normalized
		return true
	}

	function is_greece_neutral(game) {
		return get_greece_faction(game) === null
	}

	function is_athens_space(s) {
		let info = data.spaces[s]
		if (!info) return false
		return info.name === "Athens" || info.name === "ATHENS"
	}

	function is_salonika_space(s) {
		let info = data.spaces[s]
		if (!info) return false
		return info.name === "Salonika" || info.name === "SALONIKA"
	}

	function should_trigger_greece_entry_on_beachhead(game, space_id, faction) {
		if (!is_greece_neutral(game)) return false
		if (data.spaces[space_id].nation !== "gr") return false
		return !(faction === AP && is_salonika_space(space_id))
	}

	function violates_neutral_greece_movement_restriction(game, p, target, faction, total_cost) {
		const { map } = Engine
		if (!is_greece_neutral(game)) return false
		if (is_greek_piece(p)) return false
		if (is_athens_space(target)) return true
		if (faction === AP) {
			if (!has_greek_units_in_space(game, target)) return false
			let mf = map.get_piece_mf(p)
			let remaining = mf - total_cost
			return remaining <= 0
		}
		if (faction === CP) {
			if (data.spaces[target].nation === "gr") {
				if (has_greek_units_in_space(game, target)) return true
			}
		}
		return false
	}

	function can_end_move_in_neutral_greece(game, p, target, faction) {
		if (!is_greece_neutral(game)) return true
		if (is_greek_piece(p)) return true
		if (is_athens_space(target)) return false
		if (faction === AP) {
			if (has_greek_units_in_space(game, target)) return false
		}
		if (faction === CP) {
			if (data.spaces[target].nation === "gr") {
				if (has_greek_units_in_space(game, target)) return false
			}
		}
		return true
	}

	function is_greek_cnd(p) {
		return data.pieces[p] && data.pieces[p].name === "GR National Defense"
	}

	function is_greek_piece(p) {
		return data.pieces[p] && data.pieces[p].nation === "gr"
	}

	function is_greek_controlled_by_faction(game, faction) {
		return get_greece_faction(game) === faction
	}

	function has_greek_units_in_space(game, s) {
		const { map } = Engine
		return map.get_pieces_in_space(game, s).some((p) => is_greek_piece(p))
	}

	function can_move_piece_for_faction(game, p, faction) {
		if (!is_greek_piece(p)) return false
		if (is_greek_cnd(p) && faction === AP) return true
		return is_greek_controlled_by_faction(game, faction)
	}

	function can_attack_piece_for_faction(game, p, faction) {
		if (!is_greek_piece(p)) return false
		if (is_greek_cnd(p) && faction === AP) return true
		return is_greek_controlled_by_faction(game, faction)
	}

	function is_neutral_greece_supply_passable(game, s, faction) {
		const { map } = Engine
		if (!is_greece_neutral(game)) return false
		if (data.spaces[s].nation !== "gr") return false
		if (faction === AP) return true
		if (faction === CP) {
			return map.get_pieces_in_space(game, s).length === 0
		}
		return false
	}

	function check_constantine_entry_conditions(game) {
		const { map } = Engine
		let larissa = find_space("Larissa")
		if (larissa >= 0 && map.get_pieces_in_space(game, larissa).some((p) => data.pieces[p].faction === CP)) {
			return true
		}
		let balkan_vp_spaces = []
		for (let s = 1; s < data.spaces.length; s++) {
			let info = data.spaces[s]
			if (info.vp && info.region === "Balkans" && info.nation !== "gr") {
				balkan_vp_spaces.push(s)
			}
		}
		return !!(balkan_vp_spaces.length > 0 && balkan_vp_spaces.every((s) => !map.is_controlled_by(game, s, AP)))
	}

	function trigger_greece_entry(game, target, entering_faction, reason, log_fn) {
		if (!is_greece_neutral(game)) return false
		set_greece_faction(game, entering_faction)
		game.entry_gr = true
		if (typeof log_fn === "function") {
			log_fn(
				`希腊加入${entering_faction === AP ? "协约国" : "同盟国"}阵营（${reason}${target ? " " + data.spaces[target].name : ""}）`
			)
		}

		change_neutral_control(game, "gr", entering_faction)

		return true
	}

	function place_entry_units(game, faction, instructions) {
		let { map, game_utils } = Engine
		let log_fn = (msg) => Engine.log(game, msg)
		for (let inst of instructions) {
			let { space, units } = inst
			let space_id = -1
			if (space === "RESERVE") {
				space_id = game_utils.get_reserve_box(faction)
			} else {
				space_id = game_utils.find_space(space)
			}
			if (space_id < 0) continue
			for (let unit_name of units) {
				let p = game_utils.find_piece(faction, unit_name)
				if (p >= 0 && game_utils.is_not_on_map(game, p)) {
					game.pieces[p] = space_id
					log_fn(`部署 ${unit_name} 至 ${space === "RESERVE" ? "预备格" : data.spaces[space_id].name}`)
				}
			}
		}
	}

	function change_neutral_control(game, nation, new_controller) {
		// POG and PUG behavior: The UI renders tokens for controlled spaces
		// However, spaces belonging to a nation joining its DEFAULT faction do not need explicit control tokens.
		// map.js get_default_controller already handles "if bulgaria event -> bu is CP". 
		// We only need to call set_control if the new_controller differs from the default controller AFTER the event,
		// but since the event just fired, the default controller is already the new_controller.
		// Actually, we shouldn't explicitly set control for all spaces because that places physical tokens.
		// We just let get_default_controller do its job.
		// To be safe and clean up any pre-existing enemy control tokens if needed (rare), we could do:
		for (let s = 1; s < data.spaces.length; s++) {
			if (data.spaces[s] && data.spaces[s].nation === nation) {
				if (game.control && game.control[s] !== undefined) {
					// Clear explicit control token so it falls back to the new default
					delete game.control[s]
				}
			}
		}
	}

	function trigger_romania_entry(game) {
		game.events["romania"] = true
		game.entry_ro = true
		change_neutral_control(game, "ro", AP)

		let { game_utils } = Engine
		let get_divs = (nation, count, is_ap = false) => {
			let plan = Engine.collapse.get_romanian_entry_plan()
			let pool = is_ap ? plan.ap[`${nation}_division_pool`] || [] : plan.cp[`${nation}_division_pool`] || []
			if (nation === "ro") pool = ["RO DIV #1", "RO DIV #2", "RO DIV #3", "RO DIV #4", "RO DIV #5", "RO DIV #6"]
			if (nation === "ru") pool = ["RU DIV #1", "RU DIV #2"]
			let selected = []
			for (let name of pool) {
				let p = game_utils.find_piece(is_ap ? AP : CP, name)
				if (p >= 0 && game_utils.is_not_on_map(game, p)) {
					selected.push(name)
					if (selected.length === count) break
				}
			}
			return selected
		}

		let ro_divs = get_divs("ro", 6, true)
		let ru_divs = get_divs("ru", 2, true)
		let ge_divs = get_divs("ge", 2, false)
		let ah_divs = get_divs("ah", 3, false)
		let get_available_entry_units = (faction, names) =>
			names.filter((name) => {
				let p = game_utils.find_piece(faction, name)
				return p >= 0 && game_utils.is_not_on_map(game, p)
			})

		let ro_map_units = get_available_entry_units(AP, ["RO 1 Army", "RO 2 Army", "RO 3 Army", "RO Cavalry"])
		for (let i = 0; i < 4 && ro_divs.length > 0; i++) ro_map_units.push(ro_divs.shift())
		let ro_reserve_units = ro_divs

		let schedule_reinf = (delay, unit_name, space) => {
			if (!game.delayed_reinforcements) game.delayed_reinforcements = []
			let p = game_utils.find_piece(AP, unit_name) // AP because all scheduled are AP (RU, FR)
			if (p < 0) p = game_utils.find_piece(CP, unit_name)
			if (p >= 0 && game_utils.is_not_on_map(game, p)) {
				game.delayed_reinforcements.push({ turn: game.turn + delay, piece: p, space: space })
				Engine.log(game, `预计于回合 ${game.turn + delay} 增援 ${unit_name} 至 ${space}`)
			}
		}

		let ru_placements = []
		if (game.events.russian_revolution_level === undefined || game.events.russian_revolution_level < 1) {
			ru_placements.push({ space: "Constanta", units: ["RU Dobruja"] })
			ru_placements.push({ space: "RESERVE", units: ["RU/SB Yugo Infantry", ...ru_divs] })
			schedule_reinf(1, "RU Danube Army", "ODESSA")
			schedule_reinf(2, "RU 6 Army", "ODESSA")
		}

		schedule_reinf(1, "FR DIV #1", "Lemnos")
		schedule_reinf(1, "FR DIV #2", "Lemnos")

		let ge_placements = [
			{ space: "Galicia", units: ["GE IX Army"] },
			{ space: "RESERVE", units: ge_divs }
		]
		if (!game.events["yildirim"]) ge_placements[0].units.push("GE Falkenhayn HQ")

		// German Mountain Div if not on map
		let ge_mtn = game_utils.find_piece(CP, "GE Alpenkorps")
		if (ge_mtn >= 0 && game_utils.is_not_on_map(game, ge_mtn)) {
			ge_placements[0].units.push("GE Alpenkorps")
		}

		schedule_reinf(1, "GE Schmettow", "Galicia")

		let ah_placements = [
			{ space: "Hermannstadt", units: [ah_divs.shift(), ah_divs.shift()].filter(Boolean) },
			{ space: "Galicia", units: ["AH VI R Corps"] },
			{ space: "RESERVE", units: ah_divs }
		]

		if (ro_reserve_units.length > 0) {
			place_entry_units(game, AP, [{ space: "RESERVE", units: ro_reserve_units }])
		}
		if (ru_placements.length > 0) place_entry_units(game, AP, ru_placements)
		place_entry_units(game, CP, ge_placements)
		place_entry_units(game, CP, ah_placements)

		if (!game.events["bulgaria"]) {
			place_entry_units(game, CP, [{ space: "RESERVE", units: ["Combined BU/AH Div"] }])
		}

		return {
			ro_map_units
		}
	}

	function trigger_bulgaria_entry(game) {
		if (!game.events) game.events = {}
		game.events["bulgaria"] = true
		game.entry_bu = true
		game.entry_sb = true
		change_neutral_control(game, "bu", CP)
		change_neutral_control(game, "sb", AP)

		let { game_utils } = Engine
		let get_divs = (nation, count) => {
			let pool = Engine.collapse.get_bulgaria_entry_plan()[nation === "sb" ? "ap" : "cp"][`${nation}_division_pool`] || Engine.collapse.get_bulgaria_entry_plan().ap.divisions
			let selected = []
			for (let name of pool) {
				let p = game_utils.find_piece(nation === "sb" ? AP : CP, name)
				if (p >= 0 && game_utils.is_not_on_map(game, p)) {
					selected.push(name)
					if (selected.length === count) break
				}
			}
			return selected
		}

		let bu_divs = get_divs("bu", 7)
		let ge_divs = get_divs("ge", 2)
		let ah_divs = get_divs("ah", 2)
		let sb_divs = get_divs("sb", 6)

		let bu_placements = [
			{ space: "Vidin", units: ["BU 1 Army", bu_divs.shift()].filter(Boolean) },
			{ space: "SOFIA", units: ["BU 2 Army", bu_divs.shift()].filter(Boolean) },
			{ space: "Xanthi", units: [bu_divs.shift()].filter(Boolean) },
			{ space: "Strumica", units: [bu_divs.shift()].filter(Boolean) },
			{ space: "Varna", units: [bu_divs.shift()].filter(Boolean) },
			{ space: "RESERVE", units: bu_divs } // The rest to reserve
		]

		let ge_placements = [
			{ space: "Galicia", units: ["GE IV R Corps", "German 11th Army", "GE Hvy Arty", "GE Mackenson HQ"] },
			{ space: "Vidin", units: ["GE Alpenkorps"] },
			{ space: "RESERVE", units: ge_divs }
		]

		let ah_placements = [
			{ space: "Galicia", units: ["AH VIII Corps", "AH XXII R Corps", ah_divs.shift()].filter(Boolean) },
			{ space: "RESERVE", units: ah_divs }
		]

		let sb_placements = [
			{ space: "BELGRADE", units: ["SB 1 Army", "SB 3 Army", sb_divs.shift()].filter(Boolean) },
			{ space: "Nis", units: ["SB 2 Army", "SB Cavalry", sb_divs.shift()].filter(Boolean) },
			{ space: "Veles", units: [sb_divs.shift(), sb_divs.shift()].filter(Boolean) },
			{ space: "RESERVE", units: sb_divs }
		]

		place_entry_units(game, CP, bu_placements)
		place_entry_units(game, CP, ge_placements)
		place_entry_units(game, CP, ah_placements)
		place_entry_units(game, AP, sb_placements)
	}

	function should_trigger_greece_entry_on_attack(game, target, attacker_faction) {
		const { map } = Engine
		if (!is_greece_neutral(game)) return false
		let greek_defenders = map.get_pieces_in_space(game, target).filter((p) => data.pieces[p].nation === "gr")
		if (greek_defenders.length === 0) return false
		return !(attacker_faction === CP && greek_defenders.every((p) => is_greek_cnd(p)))
	}

	function on_beachhead_placed(game, space_id, faction) {
		if (should_trigger_greece_entry_on_beachhead(game, space_id, faction)) {
			trigger_greece_entry(game, space_id, faction, "雅典滩头登陆事件", (msg) => Engine.log(game, msg))
		}
	}

	function check_athens_entry(game, pieces, space_id, faction) {
		if (is_greece_neutral(game) && is_athens_space(space_id)) {
			let non_greek = pieces.some((p) => !is_greek_piece(p))
			if (non_greek) {
				trigger_greece_entry(game, space_id, faction, "进入雅典事件", (msg) => Engine.log(game, msg))
			}
		}
	}

	function check_attack_trigger(game, target, attacker_faction) {
		if (should_trigger_greece_entry_on_attack(game, target, attacker_faction)) {
			trigger_greece_entry(game, target, attacker_faction, "攻击中立希腊单位事件", (msg) => Engine.log(game, msg))
		}
	}

	function is_neutral_vp_space(s) {
		let info = data.spaces[s]
		return !!(info && info.faction === "neutral" && info.vp > 0)
	}

	function check_persia_entry_vp_penalty(game, s, entered_pieces) {
		if (!game || !Array.isArray(entered_pieces) || entered_pieces.length === 0) return
		if (!game.events) game.events = {}
		let in_revolution = game.events["russian_revolution"] >= 1
		let space = data.spaces[s] || {}
		if (!game.events["russian_british_sphere_penalty"]) {
			let has_russian_entry = entered_pieces.some((p) => Engine.game_utils.piece_counts_as_nation_for_rule(game, p, "ru"))
			if (Engine.map.is_arabistan(s) && has_russian_entry) {
				game.events["russian_british_sphere_penalty"] = true
				game.vp += 1
				Engine.log(game, "帝国间的猜忌：俄国部队首次进入阿拉伯斯坦，CP +1 VP。")
			}
		}
		if (!game.events["ap_russian_sphere_penalty"] && !in_revolution) {
			let has_ap_entry = entered_pieces.some((p) =>
				["br", "fr", "in", "it", "anz"].some((nation) => Engine.game_utils.piece_counts_as_nation_for_rule(game, p, nation))
			)
			let region = String(space.region || "").toLowerCase()
			let in_three_persian_regions =
				region === "east persia" || region === "central persia" || region === "south persia"
			let is_neutral_persia_outside_three = Engine.map.is_persia(s) && space.nation === "pe" && !in_three_persian_regions
			if ((Engine.map.is_azerbaijan(s) || is_neutral_persia_outside_three) && has_ap_entry) {
				game.events["ap_russian_sphere_penalty"] = true
				game.vp += 1
				Engine.log(game, "俄国势力范围受侵犯：协约军首次进入阿塞拜疆或中立波斯非三大区，CP +1 VP。")
			}
		}
	}

	function get_neutral_vp_partial_owner(game, s) {
		if (!is_neutral_vp_space(s)) return 0
		let has_ap_regular = false
		let has_cp_regular = false
		let has_ap_partial = false
		let has_cp_partial = false
		for (let p of Engine.map.get_pieces_in_space(game, s)) {
			let info = data.pieces[p]
			if (!info || info.type === "hq") continue
			let faction = Engine.game_utils.get_piece_effective_faction(game, p)
			if (Engine.game_utils.is_regular(p)) {
				if (faction === AP) has_ap_regular = true
				else if (faction === CP) has_cp_regular = true
				continue
			}
			if (Engine.game_utils.is_irregular(p) || Engine.game_utils.is_tribe(p)) {
				if (faction === AP) has_ap_partial = true
				else if (faction === CP) has_cp_partial = true
			}
		}
		if (has_ap_regular && !has_cp_regular) return AP
		if (has_cp_regular && !has_ap_regular) return CP
		if (has_ap_partial && !has_cp_partial) return AP
		if (has_cp_partial && !has_ap_partial) return CP
		return (game.control && game.control[s]) || 0
	}

	function sync_neutral_vp_state(game, s, previous_override) {
		if (!is_neutral_vp_space(s)) return
		if (!game.neutral_vp_partial_control) game.neutral_vp_partial_control = []
		let vp_val = (data.spaces[s] && data.spaces[s].vp) || 0
		let previous =
			previous_override !== undefined ? previous_override || 0 : game.neutral_vp_partial_control[s] || 0
		let next = get_neutral_vp_partial_owner(game, s) || 0
		if (previous === next) {
			game.neutral_vp_partial_control[s] = next
			return
		}
		if (previous === AP) game.vp += vp_val
		else if (previous === CP) game.vp -= vp_val
		if (next === AP) game.vp -= vp_val
		else if (next === CP) game.vp += vp_val
		game.neutral_vp_partial_control[s] = next
	}

	function is_ru_capture_piece(info) {
		if (!info) return false
		return info.nation === "ru" || info.name.startsWith("Armenian") || info.name.startsWith("RU/PE")
	}

	function get_effective_vp_value(game, s) {
		let space = data.spaces[s]
		if (!space) return 0
		if (space.vp > 0) return space.vp
		if (game.warm_water_port_vp === s) return 1
		return 0
	}

	function qualifies_for_ru_vp_capture(game, s) {
		let pieces = Engine.map.get_pieces_in_space(game, s)
		let has_ru_capture_piece = false
		for (let p of pieces) {
			if (is_ru_capture_piece(data.pieces[p])) {
				has_ru_capture_piece = true
				break
			}
		}
		if (!has_ru_capture_piece) return false
		let ru_sources = Engine.map.get_ru_supply_sources(game, false)
		if (!ru_sources.length) return false
		return Engine.map.can_trace_supply_to_source(game, s, AP, ru_sources)
	}

	function apply_control_change(game, s, faction, previous_neutral_vp_owner) {
		if (is_neutral_vp_space(s)) {
			sync_neutral_vp_state(game, s, previous_neutral_vp_owner)
			if (!game.ru_control_markers) game.ru_control_markers = []
			if (faction === AP) {
				if (qualifies_for_ru_vp_capture(game, s)) {
					game.russian_vp += 1
					if (!game.ru_control_markers.includes(s)) game.ru_control_markers.push(s)
					Engine.log(game, `俄国部队占领VP点，俄国VP +1 (当前: ${game.russian_vp})`)
				}
			} else if (faction === CP) {
				let is_ru_vp = Engine.map.is_russian_vp_space(game, s)
				let was_ru_controlled = game.ru_control_markers.includes(s)
				if (was_ru_controlled) {
					game.ru_control_markers = game.ru_control_markers.filter((x) => x !== s)
				}
				if (is_ru_vp || was_ru_controlled) {
					game.russian_vp -= 1
					Engine.log(game, `同盟国占领俄国VP点，俄国VP -1 (当前: ${game.russian_vp})`)
				}
			}
			return
		}
		let vp_val = get_effective_vp_value(game, s)
		if (vp_val <= 0) return
		if (!game.ru_control_markers) game.ru_control_markers = []
		if (faction === AP) {
			game.vp -= vp_val
			Engine.log(game, `AP 获得 ${vp_val} VP (当前VP: ${game.vp})`)
			if (qualifies_for_ru_vp_capture(game, s)) {
				game.russian_vp += 1
				if (!game.ru_control_markers.includes(s)) game.ru_control_markers.push(s)
				Engine.log(game, `俄国部队占领VP点，俄国VP +1 (当前: ${game.russian_vp})`)
			}
		} else if (faction === CP) {
			game.vp += vp_val
			Engine.log(game, `CP 获得 ${vp_val} VP (当前VP: ${game.vp})`)
			let is_ru_vp = Engine.map.is_russian_vp_space(game, s)
			let was_ru_controlled = game.ru_control_markers.includes(s)
			if (was_ru_controlled) {
				game.ru_control_markers = game.ru_control_markers.filter((x) => x !== s)
			}
			if (is_ru_vp || was_ru_controlled) {
				game.russian_vp -= 1
				Engine.log(game, `同盟国占领俄国VP点，俄国VP -1 (当前: ${game.russian_vp})`)
			}
		}
	}

	Object.assign(exports, {
		normalize_greece_faction,
		get_greece_faction,
		set_greece_faction,
		is_greece_neutral,
		is_athens_space,
		is_salonika_space,
		should_trigger_greece_entry_on_beachhead,
		violates_neutral_greece_movement_restriction,
		is_greek_cnd,
		is_greek_piece,
		is_greek_controlled_by_faction,
		has_greek_units_in_space,
		can_move_piece_for_faction,
		can_attack_piece_for_faction,
		is_neutral_greece_supply_passable,
		can_end_move_in_neutral_greece,
		check_constantine_entry_conditions,
		trigger_greece_entry,
		trigger_bulgaria_entry,
		trigger_romania_entry,
		place_entry_units,
		should_trigger_greece_entry_on_attack,
		on_beachhead_placed,
		check_athens_entry,
		check_attack_trigger,
		is_neutral_vp_space,
		check_persia_entry_vp_penalty,
		get_neutral_vp_partial_owner,
		sync_neutral_vp_state,
		apply_control_change
	})

	return exports
}
