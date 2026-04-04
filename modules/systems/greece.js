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
		// Rule 19.2.5: AP placing a beachhead at Salonika (and only Salonika) does NOT trigger Greek entry.
		return !(faction === AP && is_salonika_space(space_id));
	}

	function violates_neutral_greece_movement_restriction(game, p, target, faction, total_cost) {
		const { map } = Engine
		if (!is_greece_neutral(game)) return false
		if (is_greek_piece(p)) return false

		// Rule 19.2.3: Both players may enter Greece... so long as they do not enter Athens.
		if (is_athens_space(target)) return true

		// Rule 19.2.3: AP units may move through spaces containing GR units... but may not end a move in a space with Greek units.
		if (faction === AP) {
			if (!has_greek_units_in_space(game, target)) return false
			let mf = map.get_piece_mf(p)
			let remaining = mf - total_cost
			return remaining <= 0
		}

		// Rule 19.2.3: CP units may enter Greece and trace supply through vacant spaces in Greece.
		// They do not have the privilege to move through spaces containing GR units.
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

		// Rule 19.2.3: Both players may enter Greece... so long as they do not enter Athens.
		if (is_athens_space(target)) return false

		// Rule 19.2.3: AP units may not end a move in a space with Greek units.
		if (faction === AP) {
			if (has_greek_units_in_space(game, target)) return false
		}

		// Rule 19.2.3: CP units may enter Greece... through vacant spaces.
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
		// Rule 19.2.5: The CND unit always belongs to the AP Player.
		if (is_greek_cnd(p) && faction === AP) return true
		return is_greek_controlled_by_faction(game, faction)
	}

	function can_attack_piece_for_faction(game, p, faction) {
		if (!is_greek_piece(p)) return false
		// Rule 19.2.5: The CND unit always belongs to the AP Player.
		if (is_greek_cnd(p) && faction === AP) return true
		return is_greek_controlled_by_faction(game, faction)
	}

	function is_neutral_greece_supply_passable(game, s, faction) {
		const { map } = Engine
		if (!is_greece_neutral(game)) return false
		if (data.spaces[s].nation !== "gr") return false
		if (faction === AP) return true // AP can always trace through Greek spaces while neutral
		if (faction === CP) {
			// Rule 19.2.3: CP units may trace supply through vacant spaces in Greece while neutral.
			return map.get_pieces_in_space(game, s).length === 0
		}
		return false
	}

	function check_constantine_entry_conditions(game) {
		const { map } = Engine
		// Condition (1): CP unit at Larissa
		let larissa = find_space("Larissa")
		if (larissa >= 0 && map.get_pieces_in_space(game, larissa).some((p) => data.pieces[p].faction === CP)) {
			return true
		}
		// Condition (2): all non-Greek VP spaces in the Balkans are CP-controlled or neutral.
		let balkan_vp_spaces = []
		for (let s = 1; s < data.spaces.length; s++) {
			let info = data.spaces[s]
			if (info.vp && info.region === "Balkans" && info.nation !== "gr") {
				balkan_vp_spaces.push(s)
			}
		}
		return !!(balkan_vp_spaces.length > 0 && balkan_vp_spaces.every((s) => !map.is_controlled_by(game, s, AP)));
	}

	function trigger_greece_entry(game, target, entering_faction, reason, log_fn) {
		const { map } = Engine
		if (!is_greece_neutral(game)) return false
		let opponent = map.other_faction(entering_faction)
		set_greece_faction(game, opponent)
		game.entry_gr = true

		if (typeof log_fn === "function") {
			log_fn(
				`希腊加入${opponent === AP ? "协约国" : "同盟国"}阵营（${reason}${target ? " " + data.spaces[target].name : ""}）`
			)
		}

		// Rule 19.2.6: Control of all unoccupied spaces in Greece
		for (let s = 1; s < data.spaces.length; s++) {
			if (!data.spaces[s] || data.spaces[s].nation !== "gr") continue
			if (map.get_pieces_in_space(game, s).length === 0 && typeof Engine.set_control === "function") {
				Engine.set_control(game, s, opponent)
			}
		}

		// Rule 19.2.6: Gain control of Athens and record VP if not occupied by enemy
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
		// Rule 19.2.3: Attack on a Greek unit other than the CND...
		return !(attacker_faction === CP && greek_defenders.every((p) => is_greek_cnd(p)));
	}

	function on_beachhead_placed(game, space_id, faction) {
		if (should_trigger_greece_entry_on_beachhead(game, space_id, faction)) {
			trigger_greece_entry(game, space_id, faction, "雅典滩头登陆事件", (msg) => Engine.log(game, msg))
		}
	}

	function check_athens_entry(game, pieces, space_id, faction) {
		if (is_greece_neutral(game) && is_athens_space(space_id)) {
			// Rule 19.2.1: Entry into neutral Athens by any non-Greek unit.
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
		check_attack_trigger
	})

	return exports
}
