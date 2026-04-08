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
		const { map } = Engine
		if (!is_greece_neutral(game)) return false
		let opponent = map.other_faction(entering_faction)
		set_greece_faction(game, opponent)
		game.entry_gr = true
		if (typeof log_fn === "function") {
			log_fn(`希腊加入${opponent === AP ? "协约国" : "同盟国"}阵营（${reason}${target ? " " + data.spaces[target].name : ""}）`)
		}
		for (let s = 1; s < data.spaces.length; s++) {
			if (!data.spaces[s] || data.spaces[s].nation !== "gr") continue
			if (map.get_pieces_in_space(game, s).length === 0 && typeof Engine.set_control === "function") {
				Engine.set_control(game, s, opponent)
			}
		}
		let athens = find_space("Athens")
		if (
			athens >= 0 &&
			map.get_pieces_in_space(game, athens).every((p) => data.pieces[p].faction !== entering_faction)
		) {
			if (typeof Engine.set_control === "function") {
				Engine.set_control(game, athens, opponent)
			}
		}
		return true
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

	function apply_control_change(game, s, faction, previous_neutral_vp_owner) {
		if (is_neutral_vp_space(s)) {
			sync_neutral_vp_state(game, s, previous_neutral_vp_owner)
			if (!game.ru_control_markers) game.ru_control_markers = []
			if (faction === AP) {
				let is_ru_capture = false
				let pieces = Engine.map.get_pieces_in_space(game, s)
				for (let p of pieces) {
					let info = data.pieces[p]
					if (is_ru_capture_piece(info)) {
						is_ru_capture = true
						break
					}
				}
				if (is_ru_capture) {
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
		let vp_val = (data.spaces[s] && data.spaces[s].vp) || 0
		if (vp_val <= 0) return
		if (!game.ru_control_markers) game.ru_control_markers = []
		if (faction === AP) {
			game.vp -= vp_val
			Engine.log(game, `AP 获得 ${vp_val} VP (当前VP: ${game.vp})`)
			let is_ru_capture = false
			let pieces = Engine.map.get_pieces_in_space(game, s)
			for (let p of pieces) {
				let info = data.pieces[p]
				if (is_ru_capture_piece(info)) {
					is_ru_capture = true
					break
				}
			}
			if (is_ru_capture) {
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
