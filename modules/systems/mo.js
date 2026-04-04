"use strict"

module.exports = function (Engine) {
	const { data, game_utils } = Engine
	const { is_regular, get_piece_nation, is_not_on_map, piece_counts_as_nation_for_rule } = game_utils
	const exports = {}

	const { roll_die } = Engine.utils

	// MO Constants
	const MO_NONE = "none"
	const MO_RUSSIA = "russia"
	const MO_BRITISH = "british"
	const MO_TURKEY = "turkey"
	const MO_ENVER = "enver"
	const MO_MESOPOTAMIA = "mesopotamia"
	const MO_BALKANS = "balkans"
	const MO_EGYPT = "egypt"

	// New Specific Constants
	const MO_BRITISH_MESOPOTAMIA = "british_mesopotamia"
	const MO_BRITISH_EGYPT = "british_egypt"
	const MO_RUSSIA_CAUCASUS = "russia_caucasus"
	const MO_TURKEY_CAUCASUS = "turkey_caucasus"
	const MO_TURKEY_EGYPT = "turkey_egypt"
	const MO_TURKEY_MESOPOTAMIA = "turkey_mesopotamia"

	// Choice Constants
	const MO_AP_CHOICE_5 = "ap_choice_5"
	const MO_BRITISH_NO_ATTACK = "british_no_attack"

	const AP = "ap"
	const CP = "cp"

	const BRITAIN = "br"
	const RUSSIA = "ru"
	const TURKEY = "tu"
	const TURKEY_ARAB = "tua"
	const EGYPT_SUPPLY_NAMES = [
		"Port Said",
		"Ismailia",
		"Suez",
		"CAIRO",
		"Alexandria",
		"Zagazig",
		"Faiyum",
		"Gara",
		"Mersa Matruh",
		"Sidi Barrani",
		"Sollum",
		"Siwa Oasis",
		"Bahariya Oasis",
		"Khartoum"
	]

	function mo_name(mo) {
		switch (mo) {
			case MO_RUSSIA:
				return "俄国 (Russia)"
			case MO_BRITISH:
				return "大英帝国 (British Empire)"
			case MO_TURKEY:
				return "土耳其 (Turkey)"
			case MO_ENVER:
				return "恩维尔 (Enver)"
			case MO_MESOPOTAMIA:
				return "美索不达米亚/波斯 (Mesopotamia/Persia)"
			case MO_BALKANS:
				return "巴尔干 (Balkans)"
			case MO_EGYPT:
				return "埃及 (Egypt)"
			case MO_BRITISH_NO_ATTACK:
				return "英军进攻 (British No Attack)"
			case MO_BRITISH_MESOPOTAMIA:
				return "英军 (美索不达米亚)"
			case MO_BRITISH_EGYPT:
				return "英军 (埃及)"
			case MO_RUSSIA_CAUCASUS:
				return "俄国 (高加索)"
			case MO_TURKEY_CAUCASUS:
				return "土耳其 (高加索)"
			case MO_TURKEY_EGYPT:
				return "土耳其 (埃及)"
			case MO_TURKEY_MESOPOTAMIA:
				return "土耳其 (美索不达米亚)"
			case MO_NONE:
				return "无 (None)"
			default:
				return mo
		}
	}

	function determine_mo_ap(roll) {
		// PUG Rules (2.0):
		// 1-2: Russia
		// 3: British No Attack
		// 4-5: British Empire
		// 6: Mesopotamia/Persia
		// 7: None
		// 8: Balkans
		// 9+: Egypt

		if (roll <= 2) return MO_RUSSIA
		if (roll === 3) return MO_BRITISH_NO_ATTACK
		if (roll <= 5) return MO_BRITISH
		if (roll === 6) return MO_MESOPOTAMIA
		if (roll === 7) return MO_NONE
		if (roll === 8) return MO_BALKANS
		if (roll >= 9) return MO_EGYPT
		return MO_NONE
	}

	function determine_mo_cp(roll) {
		// PUG Rules (2.0):
		// 1-2: Russia
		// 3: British Empire
		// 4-5: Turkey
		// 6: Enver

		if (roll <= 2) return MO_RUSSIA
		if (roll === 3) return MO_BRITISH
		if (roll <= 5) return MO_TURKEY
		if (roll === 6) return MO_ENVER
		return MO_NONE
	}

	function find_spaces_by_name(names) {
		const lookup = new Set((names || []).map((n) => String(n).toLowerCase()))
		const found = []
		for (let s = 1; s < data.spaces.length; s++) {
			if (!data.spaces[s]) continue
			const name = String(data.spaces[s].name || "").toLowerCase()
			if (lookup.has(name)) found.push(s)
		}
		return found
	}

	function is_russian_mo_ignored_for_cp(game) {
		return !!(game && game.events && game.events["russian_revolution"] >= 4)
	}

	function can_trace_supply_by_land_to_egypt(game, p) {
		if (!game || p === undefined || p === null || !data.pieces[p]) return false
		const start = game.pieces[p]
		if (!start || start <= 0) return false
		const trace = Engine.map.can_trace_supply_to_source
		if (typeof trace !== "function") return false
		const egypt_spaces = find_spaces_by_name(EGYPT_SUPPLY_NAMES)
		if (egypt_spaces.length === 0) return false
		return trace(game, start, AP, egypt_spaces)
	}

	/**
	 * Checks if Mandated Offensive criteria are met for a specific attack.
	 * @param {object} game - Game state
	 * @param {string} mo - Mandated Offensive type
	 * @param {string} faction - AP or CP
	 * @param {number} space - Space index
	 * @param {number[]} pieces - Array of attacker piece IDs
	 * @param {number[]} defender_pieces - Array of defender piece IDs
	 * @returns {boolean}
	 */
	function check_mo_criteria(game, mo, faction, space, pieces, defender_pieces) {
		if (!mo || mo === MO_NONE) return true
		if (space === undefined || space === null || space < 0) return false

		// Rule 5.1.3: Attacks by Irregular Units and Tribes alone cannot fulfill an MO.
		const has_regular_attacker = Array.isArray(pieces) && pieces.some(is_regular)
		if (!has_regular_attacker) return false

		const area = Engine.map.get_area(space)

		// Helper to check attacker nationality
		const has_att_nation = (nation) => {
			if (!Array.isArray(pieces)) return false
			return pieces.some((p) => piece_counts_as_nation_for_rule(game, p, nation, "mo"))
		}

		// Helper to check defender nationality
		const has_def_nation = (nation) => {
			if (!Array.isArray(defender_pieces)) return false
			return defender_pieces.some((p) => piece_counts_as_nation_for_rule(game, p, nation, "mo"))
		}

		if (faction === AP) {
			if (mo === MO_RUSSIA) return has_att_nation(RUSSIA)

			if (mo === MO_BRITISH) return has_att_nation(BRITAIN) || has_att_nation("in") || has_att_nation("anz")

			if (mo === MO_MESOPOTAMIA)
				// AP Roll 6: Meso/Persia/East
				return (
					Engine.map.is_mesopotamia(space) ||
					Engine.map.is_persia(space) ||
					Engine.map.is_afghanistan(space) ||
					Engine.map.is_central_asia(space) ||
					Engine.map.is_india(space) ||
					Engine.map.is_baluchistan(space)
				)

			if (mo === MO_EGYPT || mo === MO_BRITISH_EGYPT) {
				if (!Array.isArray(pieces)) return false
				return (
					Engine.map.get_area(space) === "syria_palestine" &&
					pieces.some((p) => piece_counts_as_nation_for_rule(game, p, BRITAIN, "mo") && can_trace_supply_by_land_to_egypt(game, p))
				)
			}

			if (mo === MO_BALKANS)
				// AP Roll 8
				return area === "balkans" && has_att_nation(BRITAIN)

			if (mo === MO_BRITISH_MESOPOTAMIA)
				return (
					(has_att_nation(BRITAIN) || has_att_nation("in") || has_att_nation("anz")) && area === "mesopotamia"
				)

			if (mo === MO_RUSSIA_CAUCASUS) return has_att_nation(RUSSIA) && area === "caucasus"
		}

		if (faction === CP) {
			if (mo === MO_RUSSIA) {
				if (is_russian_mo_ignored_for_cp(game)) return true
				return has_def_nation(RUSSIA)
			}

			if (mo === MO_BRITISH) return has_def_nation(BRITAIN) || has_def_nation("in") || has_def_nation("anz")

			if (mo === MO_TURKEY) return has_att_nation(TURKEY) || has_att_nation(TURKEY_ARAB)

			if (mo === MO_TURKEY_CAUCASUS)
				return (has_att_nation(TURKEY) || has_att_nation(TURKEY_ARAB)) && area === "caucasus"
			if (mo === MO_TURKEY_EGYPT)
				return (has_att_nation(TURKEY) || has_att_nation(TURKEY_ARAB)) && area === "syria_palestine"
			if (mo === MO_TURKEY_MESOPOTAMIA)
				return (has_att_nation(TURKEY) || has_att_nation(TURKEY_ARAB)) && area === "mesopotamia"
		}

		return false
	}

	/**
	 * Checks if any British unit is participating in the attack.
	 * @param {number[]} pieces - Array of piece IDs
	 * @returns {boolean}
	 */
	function check_british_participation(game, pieces) {
		if (!Array.isArray(pieces)) return false
		return pieces.some((p) => piece_counts_as_nation_for_rule(game, p, BRITAIN, "mo"))
	}

	/**
	 * Checks if Mandated Offensive requirements were fulfilled by an attack.
	 * @param {Object} game - Game state
	 * @param {Object} result - Combat result
	 * @param {Function} log - Logging function
	 */
	function check_mo_fulfillment(game, result, log) {
		if (!game || !game.attack || !result) return
		const space = game.attack.space
		const attacker = game.active
		const pieces = result.attackers || []
		const defender_pieces = result.defenders || []

		if (attacker === AP) {
			if (
				game.events["russo_british_assault"] &&
				(game.mo_ap === MO_RUSSIA || game.mo_ap === MO_RUSSIA_CAUCASUS)
			) {
				if (log) log("英俄突袭：不能完成俄国MO")
				return
			}
			if (game.mo_ap === MO_BRITISH_NO_ATTACK) {
				if (check_british_participation(game, pieces)) {
					if (!game.british_mandate_violated) {
						game.british_mandate_violated = true
						if (log) log("AP violated British No Attack Mandate! (VP Penalty pending)")
					}
				}
				return
			}

			if (game.mo_ap_fulfilled) return

			if (game.mo_ap && check_mo_criteria(game, game.mo_ap, AP, space, pieces, defender_pieces)) {
				game.mo_ap_fulfilled = true
				if (log) log(`协约国强制进攻 (${mo_name(game.mo_ap)}) 已完成。`)
			}
		} else {
			if (game.mo_cp_fulfilled) return

			if (game.mo_cp === MO_ENVER) {
				let fulfilled_1_now = false
				if (
					!game.mo_cp_1_fulfilled &&
					game.mo_cp_1 &&
					check_mo_criteria(game, game.mo_cp_1, CP, space, pieces, defender_pieces)
				) {
					game.mo_cp_1_fulfilled = true
					fulfilled_1_now = true
					if (log) log(`同盟国恩维尔攻势 #1 (${mo_name(game.mo_cp_1)}) 已完成。`)
				}
				let can_fulfill_second_in_this_attack = !(fulfilled_1_now && game.mo_cp_1 === game.mo_cp_2)
				if (
					can_fulfill_second_in_this_attack &&
					!game.mo_cp_2_fulfilled &&
					game.mo_cp_2 &&
					check_mo_criteria(game, game.mo_cp_2, CP, space, pieces, defender_pieces)
				) {
					game.mo_cp_2_fulfilled = true
					if (log) log(`同盟国恩维尔攻势 #2 (${mo_name(game.mo_cp_2)}) 已完成。`)
				}
				if (game.mo_cp_1_fulfilled && game.mo_cp_2_fulfilled) {
					game.mo_cp_fulfilled = true
					if (log) log("同盟国恩维尔攻势已全部完成。")
				}
			} else {
				if (game.mo_cp && check_mo_criteria(game, game.mo_cp, CP, space, pieces, defender_pieces)) {
					game.mo_cp_fulfilled = true
					if (log) log(`同盟国强制进攻 (${mo_name(game.mo_cp)}) 已完成。`)
				}
			}
		}
	}

	/**
	 * Resolves the second roll for Enver Mandate.
	 * @param {Object} game
	 * @param {Function} log
	 */
	function resolve_enver_2(game, log) {
		if (!game) return
		const roll = roll_die(6, game)
		if (log) log(`恩维尔第二次掷骰: ${roll}`)
		let second = determine_mo_cp(roll)
		if (second === MO_RUSSIA && is_russian_mo_ignored_for_cp(game)) {
			second = MO_NONE
			if (log) log("恩维尔 #2 俄国攻势在俄国革命第4阶段后被忽略")
		}

		if (second === MO_ENVER) {
			game.active = CP
			game.state = "mo_enver_choose_2"
			if (log) log("恩维尔再次被掷出：同盟国选择第二个攻势目标")
		} else {
			game.mo_cp_2 = second
			if (log) log(`恩维尔 #2 攻势目标为 ${mo_name(game.mo_cp_2)}`)
			end_mo_enver(game)
		}
	}

	function end_mo_enver(game) {
		if (!game) return
		if (game.mo_cp_1 === MO_NONE) game.mo_cp_1_fulfilled = true
		if (game.mo_cp_2 === MO_NONE) game.mo_cp_2_fulfilled = true
		if (game.mo_cp_1_fulfilled && game.mo_cp_2_fulfilled) game.mo_cp_fulfilled = true
		game.active = AP
		delete game.initiative_winner
		game.state = "acknowledge_mo_results"
	}

	function end_mo_choice(game) {
		if (!game) return
		game.active = AP
		delete game.initiative_winner
		game.state = "acknowledge_mo_results"
	}

	function register(global_states) {
		Object.assign(global_states, states)
	}

	const states = {}

	states.mo_enver_choose_1 = {
		prompt(res) {
			res.prompt("恩维尔亲临前线: 选择同盟国的第一次恩维尔攻势目标")
			if (!is_russian_mo_ignored_for_cp(res.game)) res.action("choose_enver_russia")
			res.action("choose_enver_british")
			res.action("choose_enver_turkey")
		},
		choose_enver_russia(game, log) {
			if (is_russian_mo_ignored_for_cp(game)) {
				game.mo_cp_1 = MO_NONE
				log("协约国为恩维尔 #1 选择俄国，在俄国革命第4阶段后被忽略")
			} else {
				game.mo_cp_1 = MO_RUSSIA
				log("协约国为恩维尔 #1 选择俄国")
			}
			resolve_enver_2(game, log)
		},
		choose_enver_british(game, log) {
			game.mo_cp_1 = MO_BRITISH
			log("协约国为恩维尔 #1 选择大英帝国")
			resolve_enver_2(game, log)
		},
		choose_enver_turkey(game, log) {
			game.mo_cp_1 = MO_TURKEY
			log("协约国为恩维尔 #1 选择土耳其")
			resolve_enver_2(game, log)
		}
	}

	states.mo_enver_choose_2 = {
		prompt(res) {
			res.prompt("恩维尔亲临前线: 选择同盟国的第二次恩维尔攻势目标")
			if (!is_russian_mo_ignored_for_cp(res.game)) res.action("choose_enver_russia")
			res.action("choose_enver_british")
			res.action("choose_enver_turkey")
		},
		choose_enver_russia(game, log) {
			if (is_russian_mo_ignored_for_cp(game)) {
				game.mo_cp_2 = MO_NONE
				log("同盟国为恩维尔 #2 选择俄国，在俄国革命第4阶段后被忽略")
			} else {
				game.mo_cp_2 = MO_RUSSIA
				log("同盟国为恩维尔 #2 选择俄国")
			}
			end_mo_enver(game)
		},
		choose_enver_british(game, log) {
			game.mo_cp_2 = MO_BRITISH
			log("同盟国为恩维尔 #2 选择大英帝国")
			end_mo_enver(game)
		},
		choose_enver_turkey(game, log) {
			game.mo_cp_2 = MO_TURKEY
			log("同盟国为恩维尔 #2 选择土耳其")
			end_mo_enver(game)
		}
	}

	states.mo_choice_ap = {
		prompt(res) {
			res.prompt("强制进攻：选择目标")
			res.action("choose_mesopotamia")
			res.action("choose_egypt")
			res.action("choose_russia")
		},
		choose_mesopotamia(game, log) {
			game.mo_ap = MO_BRITISH_MESOPOTAMIA
			log("协约国选择大英帝国 (美索不达米亚)")
			end_mo_choice(game)
		},
		choose_egypt(game, log) {
			game.mo_ap = MO_BRITISH_EGYPT
			log("协约国选择大英帝国 (埃及)")
			end_mo_choice(game)
		},
		choose_russia(game, log) {
			game.mo_ap = MO_RUSSIA_CAUCASUS
			log("协约国选择俄国 (高加索)")
			end_mo_choice(game)
		}
	}

	/**
	 * Checks if an MO is valid based on Rule 5.1.2.
	 * If the nation to be attacked has no units on the map, returns "NONE".
	 * If the affected area contains no enemy units, returns "REROLL".
	 * Otherwise returns "VALID".
	 * @param {object} game
	 * @param {string} faction - AP or CP
	 * @param {string} mo
	 * @returns {"VALID"|"NONE"|"REROLL"}
	 */
	function check_mo_validity(game, faction, mo) {
		if (!mo || mo === MO_NONE) return "VALID"

		const opponent = faction === AP ? CP : AP
		const opponent_pieces = []
		for (let p = 0; p < game.pieces.length; p++) {
			if (data.pieces[p] && data.pieces[p].faction === opponent && !is_not_on_map(game, p)) {
				opponent_pieces.push(p)
			}
		}

		const attacker_pieces = []
		for (let p = 0; p < game.pieces.length; p++) {
			if (data.pieces[p] && data.pieces[p].faction === faction && !is_not_on_map(game, p)) {
				attacker_pieces.push(p)
			}
		}

		// Helper to check if any piece of a nation is on map
		const nation_on_map = (nation) => {
			return opponent_pieces.some((p) => data.pieces[p].nation === nation)
		}

		// Helper to check if any regular piece of a nation is on map for the attacker
		const attacker_nation_on_map = (nation) => {
			return attacker_pieces.some((p) => data.pieces[p].nation === nation && is_regular(p))
		}

		// Helper to check if any opponent piece is in an area
		const opponent_in_area = (area_check) => {
			return opponent_pieces.some((p) => {
				const s = game.pieces[p]
				if (s === undefined || s === null || s < 0) return false
				return area_check(s)
			})
		}

		if (faction === AP) {
			if (mo === MO_RUSSIA || mo === MO_RUSSIA_CAUCASUS) {
				// RU MO: RU unit must be able to attack CP unit.
				if (!attacker_nation_on_map(RUSSIA)) return "NONE"
				if (opponent_pieces.length === 0) return "NONE"
				if (mo === MO_RUSSIA_CAUCASUS) {
					if (!opponent_in_area((s) => Engine.map.get_area(s) === "caucasus")) return "REROLL"
				}
				return "VALID"
			}
			if (
				mo === MO_BRITISH ||
				mo === MO_BRITISH_NO_ATTACK ||
				mo === MO_BRITISH_MESOPOTAMIA ||
				mo === MO_BRITISH_EGYPT
			) {
				if (!attacker_nation_on_map(BRITAIN) && !attacker_nation_on_map("in") && !attacker_nation_on_map("anz"))
					return "NONE"
				if (opponent_pieces.length === 0) return "NONE"
				if (mo === MO_BRITISH_MESOPOTAMIA) {
					if (!opponent_in_area((s) => Engine.map.get_area(s) === "mesopotamia")) return "REROLL"
				}
				if (mo === MO_BRITISH_EGYPT) {
					if (!opponent_in_area((s) => Engine.map.get_area(s) === "syria_palestine")) return "REROLL"
				}
				return "VALID"
			}
			if (mo === MO_MESOPOTAMIA) {
				// AP Choice Roll 6: Meso/Persia/East. Any AP regular unit can attack.
				if (!attacker_pieces.some(is_regular)) return "NONE"
				if (opponent_pieces.length === 0) return "NONE"
				const is_east = (s) =>
					Engine.map.is_mesopotamia(s) ||
					Engine.map.is_persia(s) ||
					Engine.map.is_afghanistan(s) ||
					Engine.map.is_central_asia(s) ||
					Engine.map.is_india(s) ||
					Engine.map.is_baluchistan(s)
				if (!opponent_in_area(is_east)) return "REROLL"
				return "VALID"
			}
			if (mo === MO_BALKANS) {
				// AP Choice Roll 8: British units in Balkans.
				if (!attacker_nation_on_map(BRITAIN)) return "NONE"
				if (opponent_pieces.length === 0) return "NONE"
				if (!opponent_in_area((s) => Engine.map.is_balkans(s))) return "REROLL"
				return "VALID"
			}
			if (mo === MO_EGYPT) {
				// AP Choice Roll 10: British units in Egypt/Palestine.
				if (!attacker_nation_on_map(BRITAIN)) return "NONE"
				if (opponent_pieces.length === 0) return "NONE"
				const is_syria_palestine = (s) => Engine.map.get_area(s) === "syria_palestine"
				if (!opponent_in_area(is_syria_palestine)) return "REROLL"
				return "VALID"
			}
		}

		if (faction === CP) {
			if (mo === MO_RUSSIA) {
				if (is_russian_mo_ignored_for_cp(game)) return "NONE"
				if (!attacker_pieces.some(is_regular)) return "NONE" // CP must have units to attack
				if (!nation_on_map(RUSSIA)) return "NONE"
				return "VALID"
			}
			if (mo === MO_BRITISH) {
				if (!attacker_pieces.some(is_regular)) return "NONE"
				if (!nation_on_map(BRITAIN) && !nation_on_map("in") && !nation_on_map("anz")) return "NONE"
				return "VALID"
			}
			if (
				mo === MO_TURKEY ||
				mo === MO_TURKEY_CAUCASUS ||
				mo === MO_TURKEY_EGYPT ||
				mo === MO_TURKEY_MESOPOTAMIA
			) {
				// TU MO: TU/TU-A attack any AP unit.
				if (!attacker_nation_on_map(TURKEY) && !attacker_nation_on_map(TURKEY_ARAB)) return "NONE"
				if (opponent_pieces.length === 0) return "NONE"
				if (mo === MO_TURKEY_CAUCASUS) {
					if (!opponent_in_area((s) => Engine.map.get_area(s) === "caucasus")) return "REROLL"
				}
				if (mo === MO_TURKEY_EGYPT) {
					if (!opponent_in_area((s) => Engine.map.get_area(s) === "syria_palestine")) return "REROLL"
				}
				if (mo === MO_TURKEY_MESOPOTAMIA) {
					if (!opponent_in_area((s) => Engine.map.get_area(s) === "mesopotamia")) return "REROLL"
				}
				return "VALID"
			}
		}

		return "VALID"
	}

	/**
	 * Updates MO fulfillment status based on Rule 5.1.2 (target area empty).
	 * @param {object} game
	 */
	function update_mo_fulfillment_status(game) {
		if (!game) return

		if (game.mo_ap !== MO_NONE && !game.mo_ap_fulfilled) {
			if (check_mo_validity(game, AP, game.mo_ap) !== "VALID") {
				game.mo_ap_fulfilled = true
			}
		}

		if (game.mo_cp !== MO_NONE && !game.mo_cp_fulfilled) {
			if (game.mo_cp === MO_ENVER) {
				if (!game.mo_cp_1_fulfilled) {
					if (check_mo_validity(game, CP, game.mo_cp_1) !== "VALID") {
						game.mo_cp_1_fulfilled = true
					}
				}
				if (!game.mo_cp_2_fulfilled) {
					if (check_mo_validity(game, CP, game.mo_cp_2) !== "VALID") {
						game.mo_cp_2_fulfilled = true
					}
				}
				if (game.mo_cp_1_fulfilled && game.mo_cp_2_fulfilled) {
					game.mo_cp_fulfilled = true
				}
			} else {
				if (check_mo_validity(game, CP, game.mo_cp) !== "VALID") {
					game.mo_cp_fulfilled = true
				}
			}
		}
	}

	Object.assign(exports, {
		MO_NONE,
		MO_RUSSIA,
		MO_BRITISH,
		MO_TURKEY,
		MO_ENVER,
		MO_MESOPOTAMIA,
		MO_BALKANS,
		MO_EGYPT,
		MO_BRITISH_MESOPOTAMIA,
		MO_BRITISH_EGYPT,
		MO_RUSSIA_CAUCASUS,
		MO_TURKEY_CAUCASUS,
		MO_TURKEY_EGYPT,
		MO_TURKEY_MESOPOTAMIA,
		MO_AP_CHOICE_5,
		MO_BRITISH_NO_ATTACK,
		mo_name,
		determine_mo_ap,
		determine_mo_cp,
		check_mo_criteria,
		check_mo_validity,
		update_mo_fulfillment_status,
		check_mo_fulfillment,
		register,
		states
	})

	return exports
}
