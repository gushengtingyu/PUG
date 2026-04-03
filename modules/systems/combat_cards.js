"use strict"

module.exports = function (Engine) {
	const { data } = Engine
	const { AP, CP } = Engine.constants
	const { set_has } = Engine.utils
	const { map, game_utils } = Engine
	const {
		is_lcu,
		is_scu,
		is_tribe,
		is_regular,
		is_removed,
		is_eliminated,
		is_not_on_map,
		get_piece_nation,
		get_piece_type,
		space_name,
		piece_name,
		get_piece_effective_faction
	} = game_utils

	function has_attack(game) {
		return !!game.attack
	}

	function get_active_faction(game) {
		return game.active
	}

	function get_space_pieces(game, s) {
		return map.get_pieces_in_space(game, s)
	}

	function is_sinai_space(name) {
		const sinai_spaces = [
			"Romani",
			"Bir el Abd",
			"El Arish",
			"Rafa",
			"Magdhaba",
			"Bir Gifgafa",
			"Bir Hasana",
			"Nekhl",
			"Suez",
			"Aqaba"
		]
		return sinai_spaces.includes(name)
	}

	function is_middle_east_area(s) {
		let area = map.get_area(s)
		return [
			"egypt",
			"sinai",
			"syria_palestine",
			"mesopotamia",
			"arabia",
			"arabistan",
			"persia",
			"anatolia"
		].includes(area)
	}

	function has_nation_on_side_in_battle(game, nations, faction) {
		if (!has_attack(game)) return false
		let attackers = game.attack.pieces || []
		let attacker_faction = game.attack.attacker
		if (attacker_faction === undefined || attacker_faction === null) {
			attacker_faction = attackers.length > 0 ? get_piece_effective_faction(game, attackers[0]) : null
		}
		let pieces = []
		if (attacker_faction !== null && faction === attacker_faction) {
			pieces = attackers
		} else {
			pieces = get_space_pieces(game, game.attack.space).filter(
				(p) => get_piece_effective_faction(game, p) === faction
			)
		}
		return pieces.some((p) => {
			let p_faction = get_piece_effective_faction(game, p)
			let p_nation = get_piece_nation(p)
			return p_faction === faction && nations.includes(p_nation)
		})
	}

	function has_nation_in_battle(game, nations) {
		if (!has_attack(game)) return false
		let attackers = game.attack.pieces
		let defenders = get_space_pieces(game, game.attack.space)
		let all = attackers.concat(defenders)
		return all.some((p) => nations.includes(get_piece_nation(p)))
	}

	function get_battle_piece_pool(game) {
		if (!has_attack(game)) return []
		let seen = new Set()
		let pool = []
		let groups = [
			game.attack.initial_attackers || [],
			game.attack.pieces || [],
			game.attack.initial_defenders || [],
			get_space_pieces(game, game.attack.space)
		]
		for (let group of groups) {
			for (let p of group) {
				if (seen.has(p)) continue
				if (Array.isArray(game.retreated) && set_has(game.retreated, p)) continue
				seen.add(p)
				pool.push(p)
			}
		}
		return pool
	}

	function has_damaged_or_eliminated_battle_piece(game, nations) {
		return get_battle_piece_pool(game).some((p) => {
			if (!nations.includes(get_piece_nation(p))) return false
			let info = data.pieces[p]
			let removed_by_reserves_exception =
				is_removed(game, p) && info && (info.symbol === "dot" || info.symbol === "triangle")
			return set_has(game.reduced, p) || is_eliminated(game, p) || removed_by_reserves_exception
		})
	}

	function can_play_no_prisoners(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		let attackers = game.attack.pieces
		let has_ap_arab_attacker = attackers.some(
			(p) => data.pieces[p].faction === AP && data.pieces[p].nation === "ar"
		)
		let has_cp_tribe_attacker = attackers.some(
			(p) => data.pieces[p].faction === CP && data.pieces[p].type === "tribe"
		)
		return has_ap_arab_attacker || has_cp_tribe_attacker
	}

	function can_play_shore_bombardment(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		const shore_spaces = [
			"Antalya",
			"Adana",
			"Alexandretta",
			"Beirut",
			"Haifa",
			"Jaffa",
			"Port Said",
			"Alexandria",
			"Mersa Matruh",
			"Sollum",
			"Ismailia",
			"Suez",
			"Aqaba",
			"Jiddah",
			"Bahrain",
			"Abadan",
			"Fao",
			"Kuwait"
		]

		let target_name = data.spaces[game.attack.space].name
		if (shore_spaces.includes(target_name)) return true

		for (let p of game.attack.pieces) {
			let s = game.pieces[p]
			if (shore_spaces.includes(data.spaces[s].name)) return true
		}

		return false
	}

	function can_play_armenian_druzhiny(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		let space = game.attack.space
		if (map.is_balkans(space)) return false
		return has_nation_on_side_in_battle(game, ["ru", "arm"], AP)
	}

	function can_play_pugnacity(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		return has_nation_on_side_in_battle(game, ["in"], AP)
	}

	function can_play_gurkhas(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		return has_nation_on_side_in_battle(game, ["br", "in"], AP)
	}

	function can_play_maude(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		return has_nation_on_side_in_battle(game, ["br"], AP) && has_nation_on_side_in_battle(game, ["in"], AP)
	}

	function can_play_armored_cars(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		let terrain = data.spaces[game.attack.space].terrain
		return terrain !== "mountain" && terrain !== "swamp"
	}

	function is_desert_or_swamp_battle(game) {
		if (!has_attack(game)) return false
		let is_ds = (s) => {
			let t = data.spaces[s].terrain
			return t === "desert" || t === "swamp"
		}
		if (is_ds(game.attack.space)) return true
		return game.attack.pieces.some((p) => is_ds(game.pieces[p]))
	}

	function can_play_sandstorms(game) {
		return is_desert_or_swamp_battle(game)
	}

	function can_play_surprise(game) {
		if (!has_attack(game)) return false
		if (game.events && game.events["royal_flying_corps_permanent"]) return false

		// Surprise is defender only
		let is_active_attacker = game.attack.pieces.some((p) => get_piece_effective_faction(game, p) === game.active)
		if (is_active_attacker) return false

		if (game.active !== CP) return false

		let area = map.get_area(game.attack.space)
		return ["mesopotamia", "syria_palestine", "sinai"].includes(area)
	}

	function can_play_water_shortage(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		if (game.state !== "post_roll_cc_defender") return false
		return is_middle_east_area(game.attack.space)
	}

	function can_play_confused_orders(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		return game.state === "post_roll_cc_defender"
	}

	function can_play_reserves_to_front(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		if (game.state !== "post_battle_cc_cp") return false
		return has_damaged_or_eliminated_battle_piece(game, ["tu", "tua"])
	}

	function can_play_war_weary_balkans(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		if (get_active_faction(game) !== AP) return false
		if (game.turn < 15) return false // Rule: Cannot be played before Winter 1917 (Turn 15)

		let count = 0
		for (let s = 1; s < data.spaces.length; s++) {
			if (data.spaces[s].nation === "sb" || data.spaces[s].nation === "bu") {
				if (map.is_controlled_by(game, s, AP)) {
					count++
				}
			}
		}
		if (count < 1) return false // Rule: AP must control at least 1 space in Serbia or Bulgaria

		let defenders = get_space_pieces(game, game.attack.space)
		return defenders.some((p) => data.pieces[p].nation === "bu")
	}

	function can_play_fliegerabteilung(game) {
		return !(game.events && game.events["royal_flying_corps_permanent"])
	}

	function can_play_royal_flying_corps(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		if (get_active_faction(game) !== AP) return false
		return has_nation_on_side_in_battle(game, ["br", "in", "anz"], AP)
	}

	function can_play_tanks(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		if (get_active_faction(game) !== AP) return false
		let s = game.attack.space
		let area = map.get_area(s)
		let name = data.spaces[s].name
		let terrain = data.spaces[s].terrain
		let is_sinai = is_sinai_space(name)
		let is_valid_area = area === "egypt" || area === "syria_palestine" || is_sinai
		let is_valid_terrain = terrain === "clear" || terrain === "desert"
		let has_br = game.attack.pieces.some((p) => data.pieces[p].nation === "br")
		return is_valid_area && is_valid_terrain && has_br
	}

	function can_play_massed_cavalry_charge(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		if (get_active_faction(game) !== AP) return false
		return game.attack.pieces.some((p) => data.pieces[p].counter === "ANZ Desert Corps")
	}

	function can_play_push_to_the_breaking_point(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		if (get_active_faction(game) !== AP) return false
		return !!(game.events && game.events["allenby"])
	}

	function can_play_haversack_ruse(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		if (get_active_faction(game) !== AP) return false
		if (!(game.events && game.events["allenby"])) return false
		return game.attack.pieces.some((p) => data.pieces[p].nation === "br" && map.is_lcu(p))
	}

	function can_play_march_and_countermarch(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== AP) return false
		if (!(game.events && game.events["allenby"])) return false

		for (let p = 0; p < data.pieces.length; p++) {
			if (!data.pieces[p]) continue
			if (data.pieces[p].nation !== "br") continue
			if (set_has(game.attacked, p)) continue
			if (game_utils.is_not_on_map(game, p)) continue

			let dist = map.get_distance(game.pieces[p], game.attack.space)
			if (dist >= 1 && dist <= 2) return true
		}
		return false
	}

	function can_play_jihad_offensive(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		if ((game.jihad || 0) < 8) return false
		return game.attack.pieces.some((p) => ["tu", "tua"].includes(data.pieces[p].nation))
	}

	function can_play_german_high_command(game) {
		if (!has_attack(game)) return false
		if (game.state !== "play_cc_attacker" && game.state !== "play_cc_defender") return false
		if (get_active_faction(game) !== CP) return false
		return true
	}

	function can_play_save_tiflis(game) {
		if (!has_attack(game)) return false
		if (game.state !== "retreat_choice_cc_cp") return false

		// Turkish LCU must be the attacker
		let has_tu_lcu_attacker = game.attack.pieces.some((p) => {
			let p_data = data.pieces[p]
			return p_data.nation === "tu" && game_utils.is_lcu(p)
		})
		if (!has_tu_lcu_attacker) return false

		// Russian LCU must be the defender
		let defenders = get_space_pieces(game, game.attack.space).filter((p) => data.pieces[p].faction === AP)
		let has_ru_lcu_defender = defenders.some((p) => {
			let p_data = data.pieces[p]
			return p_data.nation === "ru" && game_utils.is_lcu(p)
		})
		if (!has_ru_lcu_defender) return false

		// Cannot be played after "Grand Duke Nikolai to Tiflis" (Card 23)
		if (game.events && game.events["grand_duke_to_tiflis"]) return false

		// At least one Russian unit in Azerbaijan, Persia, or Turkey
		// Excluding units in intact forts or with Yudenitch HQ
		let has_ru_in_affected_area = false
		for (let p = 0; p < game.pieces.length; p++) {
			let piece_data = data.pieces[p]
			if (piece_data.faction !== AP || piece_data.nation !== "ru") continue
			if (game_utils.is_not_on_map(game, p)) continue

			let space_id = game.pieces[p]
			let space_data = data.spaces[space_id]

			// Affected area: Azerbaijan, Persia, or Turkey (nation: tu)
			let is_in_area =
				space_data.area === "azerbaijan" || space_data.area === "persia" || space_data.nation === "tu"
			if (!is_in_area) continue

			// Exempt: Intact fort
			if (map.has_undestroyed_fort(game, space_id, AP)) continue

			// Exempt: Yudenitch HQ in space
			let pieces_in_space = get_space_pieces(game, space_id)
			let has_yudenitch = pieces_in_space.some((p2) => data.pieces[p2].name === "RU Yudenitch HQ")
			if (has_yudenitch) continue

			has_ru_in_affected_area = true
			break
		}

		return has_ru_in_affected_area;
	}

	function can_play_catastrophic_attack(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		return !map.is_beachhead_space(game, game.attack.space)
	}

	function can_play_i_order_you_to_die(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		let defenders = get_space_pieces(game, game.attack.space).filter(
			(p) => game_utils.get_piece_effective_faction(game, p) === CP
		)
		if (defenders.length === 0) return false
		return defenders.every((p) => ["tu", "tua"].includes(data.pieces[p].nation))
	}

	function can_play_pasha_1(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		return has_nation_on_side_in_battle(game, ["ge"], CP)
	}

	function can_play_czars_armories(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		if (game.state !== "post_advance_cc_cp") return false
		if (!game.events || !(game.events["russian_revolution"] >= 1)) return false
		if (!game.captured_russian_vp_in_advance) return false
		return has_nation_in_battle(game, ["tu", "tua"])
	}

	function can_play_jafar_pasha(game) {
		if (!has_attack(game)) return false
		return get_active_faction(game) === CP
	}

	function can_play_army_of_islam(game) {
		if (!has_attack(game)) return false
		if (get_active_faction(game) !== CP) return false
		if (!(game.events && game.events["pan_turkism"])) return false
		if ((game.jihad || 0) < 6) return false
		let s = game.attack.space
		let area = map.get_area(s)
		if (!["caucasus", "russia", "azerbaijan", "persia"].includes(area)) return false
		return game.attack.pieces.some((p) => ["tu", "tua"].includes(data.pieces[p].nation))
	}

	Object.assign(exports, {
		get_battle_piece_pool,
		is_middle_east_area,
		is_desert_or_swamp_battle,
		can_play_no_prisoners,
		can_play_shore_bombardment,
		can_play_armenian_druzhiny,
		can_play_pugnacity,
		can_play_gurkhas,
		can_play_maude,
		can_play_armored_cars,
		can_play_sandstorms,
		can_play_surprise,
		can_play_water_shortage,
		can_play_confused_orders,
		can_play_reserves_to_front,
		can_play_war_weary_balkans,
		can_play_fliegerabteilung,
		can_play_royal_flying_corps,
		can_play_tanks,
		can_play_massed_cavalry_charge,
		can_play_push_to_the_breaking_point,
		can_play_haversack_ruse,
		can_play_march_and_countermarch,
		can_play_jihad_offensive,
		can_play_german_high_command,
		can_play_save_tiflis,
		can_play_catastrophic_attack,
		can_play_i_order_you_to_die,
		can_play_pasha_1,
		can_play_czars_armories,
		can_play_jafar_pasha,
		can_play_army_of_islam
	})

	return exports
}
