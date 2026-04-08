"use strict"

module.exports = function (Engine) {
	const { data } = Engine
	const exports = {}

	const { is_controlled_by } = Engine.map
	const {
		is_besieged,
		can_trace_supply_to_source,
		get_pieces_in_space,
		is_base_supply_source,
		get_supply_sources_from_data,
		get_ru_supply_sources,
		get_tribe_type,
		get_connected_spaces,
		get_piece_effective_faction
	} = Engine.map
	const { set_has, other_faction } = Engine.utils
	const { can_stack_end_in_space } = Engine.map
	const {
		is_galicia,
		is_central_asia,
		is_india,
		is_baluchistan,
		is_afghanistan,
		is_persia,
		is_aegean_east_med_port,
		get_area,
		is_hejaz,
		is_russia,
		is_caucasus
	} = Engine.map
	const { AP, CP } = Engine.constants
	const {
		find_space,
		find_capital,
		is_eliminated,
		is_in_reserve,
		is_not_on_map,
		get_tribe_key_space,
		get_piece_nations_for_rule,
		is_irregular,
		is_tribe
	} = Engine.game_utils

	function is_spers_rifles_unit(info) {
		return !!(info && info.name && info.name.includes("SPers Rifles"))
	}

	function is_br_indian_garrison_unit(info) {
		return !!(info && info.name && info.name.includes("IN Garrison"))
	}

	function is_br_persian_cordon_unit(info) {
		return !!(info && info.name && info.name.includes("Persian Cordon"))
	}

	function is_dunsterforce_unit(info) {
		return !!(info && info.name === "BR Dunsterforce")
	}

	function can_rebuild_regular_unit_in_space(game, s, faction) {
		if (is_besieged(game, s)) return false
		for (let p of get_pieces_in_space(game, s)) {
			if (get_piece_effective_faction(game, p) === other_faction(faction)) return false
		}
		return true
	}

	function can_rebuild_in_reserve_box(p) {
		let info = data.pieces[p]
		if (!info || info.piece_class !== "SCU" || info.type !== "regular") return false
		if (is_spers_rifles_unit(info)) return false
		if (is_br_indian_garrison_unit(info)) return false
		if (is_br_persian_cordon_unit(info)) return false
		return true
	}

	function get_replacement_cost(game, p) {
		let info = data.pieces[p]
		if (!info) return 0

		// Rule 22.1.7: Symbols (Dot and Triangle)
		// Dot units can never be replaced
		if (info.symbol === "dot") return 0

		// Rule 16.2.2: HQs can never be repaired/replaced with RPs
		if (info.type === "hq") return 0

		let eliminated = is_eliminated(game, p)

		if (eliminated && is_spers_rifles_unit(info)) return 0

		// Triangle units: only so long as they remain on the map
		if (info.symbol === "triangle" && eliminated) return 0

		// Rule 22.1.8: Turkish Triangle units after War Weariness
		if (
			info.symbol === "triangle" &&
			(info.nation === "tu" || info.nation === "tua") &&
			game.events["turkish_war_weariness"]
		) {
			return 0
		}

		if (eliminated) {
			return info.piece_class === "LCU" ? 2 : 1
		} else if (set_has(game.reduced, p)) {
			return info.piece_class === "LCU" ? 1 : 0.5
		}
		return 0
	}

	function can_use_any_friendly_rp(p) {
		return is_irregular(p) || is_tribe(p)
	}

	function get_rebel_type(info) {
		// 判断是否为叛军单位 (Rule 22.2.2 / 22.1.3 叛军RP支持)
		if (info.nation !== "Re") return null
		if (info.name.includes("CAsia")) return "ca"
		if (info.name.includes("Afghan")) return "af"
		if (info.name.includes("Egypt")) return "eg"
		if (info.name.includes("Indian") || info.name.includes("Mutiny")) return "in"
		return null
	}

	function has_any_cp_rp(game, cost) {
		// 检查 CP 是否有任何可用的 RP (用于修复 CP 部落和不规则单位)
		let rps = game.rp_cp
		if (rps.a >= cost) return true
		if (rps.tu >= cost) return true
		if (rps.ge >= cost) return true
		return false
	}

	function spend_any_cp_rp(game, cost) {
		// 消费 CP 任意一种 RP
		let rps = game.rp_cp
		if (rps.a >= cost) {
			rps.a -= cost
			return true
		}
		if (rps.tu >= cost) {
			rps.tu -= cost
			return true
		}
		if (rps.ge >= cost) {
			rps.ge -= cost
			return true
		}
		return false
	}

	function has_enemy_regular_pieces(game, s, faction) {
		let enemy = faction === AP ? CP : AP
		for (let p of get_pieces_in_space(game, s)) {
			if (get_piece_effective_faction(game, p) !== enemy) continue
			if (data.pieces[p].type === "regular") return true
		}
		return false
	}

	function has_friendly_pieces(game, s, faction) {
		for (let p of get_pieces_in_space(game, s)) {
			if (get_piece_effective_faction(game, p) === faction) return true
		}
		return false
	}

	function is_disrupted_by_enemy(game, s, faction) {
		let enemy = faction === AP ? CP : AP
		for (let p of get_pieces_in_space(game, s)) {
			if (get_piece_effective_faction(game, p) !== enemy) continue
			let info = data.pieces[p]
			if (info.type === "irregular" || info.type === "tribe" || info.nation === "Re") return true
		}
		return false
	}

	function can_trace_supply_to_unoccupied_ap_port(game, start, target) {
		if (start <= 0 || target <= 0) return false
		let visited = new Set([start])
		let queue = [start]
		while (queue.length > 0) {
			let current = queue.shift()
			let neighbors = get_connected_spaces(game, current, undefined, CP)
			for (let next of neighbors) {
				if (next === target) return true
				if (visited.has(next)) continue
				if (has_enemy_regular_pieces(game, next, CP) && !is_besieged(game, next)) continue
				if (data.spaces[next].nation === "neutral") continue
				let friendly = is_controlled_by(game, next, CP)
				let besieged = is_besieged(game, next)
				let friendly_pieces = has_friendly_pieces(game, next, CP)
				let disrupted = is_disrupted_by_enemy(game, next, CP)
				if (!friendly && !besieged && !friendly_pieces && !disrupted) continue
				visited.add(next)
				queue.push(next)
			}
		}
		return false
	}

	function can_trace_tribe_replacement_supply(game, p) {
		// Rule 22.1.3: 部落 (Tribes) 重建补给限制
		// 只能当 CP 玩家可以从部落颜色对应的任意空间追踪补给线到以下三种之一：
		// 1) CP 补给源, 2) 友方港口(任何海域), 3) 未被占领的 AP 控制的港口(任何海域)
		if (!is_tribe(p)) return false
		let tribe_type = get_tribe_type(p)
		let tribal_spaces = []
		for (let s = 1; s < data.spaces.length; s++) {
			if (data.spaces[s].tribal_activity_grid === tribe_type) {
				tribal_spaces.push(s)
			}
		}
		if (tribal_spaces.length === 0) return false

		let sources = get_supply_sources_from_data(game, CP)
		let friendly_ports = []
		let ap_ports = []
		for (let s = 1; s < data.spaces.length; s++) {
			if (!data.spaces[s].port) continue
			if (is_controlled_by(game, s, CP)) {
				friendly_ports.push(s)
			} else if (is_controlled_by(game, s, AP) && get_pieces_in_space(game, s).length === 0) {
				ap_ports.push(s)
			}
		}

		let all_cp_sources = sources.concat(friendly_ports)

		for (let start of tribal_spaces) {
			if (can_trace_supply_to_source(game, start, CP, all_cp_sources)) return true
			for (let port of ap_ports) {
				if (can_trace_supply_to_unoccupied_ap_port(game, start, port)) return true
			}
		}

		return false
	}

	function can_trace_supply_to_sofia(game, p) {
		let sofia = find_space("SOFIA")
		if (sofia < 0) return false
		if (!is_controlled_by(game, sofia, CP)) return false
		if (is_besieged(game, sofia)) return false
		if (is_not_on_map(game, p)) return true
		let s = game.pieces[p]
		if (s <= 0) return false
		return can_trace_supply_to_source(game, s, data.pieces[p].faction, sofia)
	}

	function can_trace_supply_to_turkey(game, p) {
		let s = game.pieces[p]
		if (s <= 0) return false
		let faction = data.pieces[p].faction
		let sources = []
		for (let i = 1; i < data.spaces.length; i++) {
			if (is_base_supply_source(game, i, faction)) {
				let area = Engine.map.get_area(i)
				if (area === "anatolia" || area === "syria_palestine" || area === "mesopotamia") {
					sources.push(i)
				}
			}
		}
		return can_trace_supply_to_source(game, s, faction, sources)
	}

	function can_trace_supply_to_galicia(game, p) {
		let s = game.pieces[p]
		let info = data.pieces[p]
		let faction = info.faction
		let nation = info.nation

		// Rule 22.2.3: Rebuilding units tracing supply to Galicia
		if (s <= 0) {
			if (nation === "ge" || nation === "ah") {
				// Rebuilt in Galicia, so always traces supply
				return true
			}
			if (nation === "bu") {
				// Trace from Sofia to Galicia
				let sofia = find_space("SOFIA")
				if (sofia >= 0 && is_controlled_by(game, sofia, CP)) {
					for (let i = 1; i < data.spaces.length; i++) {
						if (is_galicia(i) && is_controlled_by(game, i, faction) && !is_besieged(game, i)) {
							if (can_trace_supply_to_source(game, sofia, faction, i)) return true
						}
					}
				}
				return false
			}
			return false
		}

		for (let i = 1; i < data.spaces.length; i++) {
			if (is_galicia(i) && is_controlled_by(game, i, faction) && !is_besieged(game, i)) {
				if (can_trace_supply_to_source(game, s, faction, i)) return true
			}
		}
		return false
	}

	function can_trace_supply_to_british_source(game, p) {
		let s = game.pieces[p]
		if (s <= 0) return false
		let sources = []
		for (let i = 1; i < data.spaces.length; i++) {
			if (is_base_supply_source(game, i, AP, "br", true)) {
				sources.push(i)
			}
		}
		return can_trace_supply_to_source(game, s, AP, sources)
	}

	function can_trace_supply_to_russian_source(game, p) {
		let s = game.pieces[p]
		if (s <= 0) return false
		let sources = get_ru_supply_sources(game, true)
		return can_trace_supply_to_source(game, s, AP, sources)
	}

	function is_capital_enemy_controlled(game, nation) {
		// Rule 22.1.5: SB and GR units are not affected by this restriction.
		if (nation === "sb" || nation === "gr") return false

		// Rule 22.1.5: British/Russian capitals are off-map, thus never enemy-controlled.
		if (["ru", "br", "in", "anz"].includes(nation)) return false

		let capital = find_capital(nation)
		if (capital >= 0) {
			let owner_faction = data.spaces[capital].faction === "ap" ? AP : CP
			return is_controlled_by(game, capital, other_faction(owner_faction))
		}

		return false
	}

	function can_convert_ge_to_tu_unlimited(game) {
		if (game.no_ge_to_tu_rp_conversion) return false
		// Rule 22.3.2: Once Bulgaria becomes a CP ally AND a supply line can be traced overland by rail from Constantinople to Galicia
		if (!game.events || !game.events["bulgaria"]) return false

		let constantinople = find_space("CONSTANTINOPLE")
		if (constantinople < 0) return false
		if (!is_controlled_by(game, constantinople, CP)) return false

		// Trace rail supply to any Galicia space
		for (let s = 1; s < data.spaces.length; s++) {
			if (is_galicia(s) && is_controlled_by(game, s, CP)) {
				// Use is_connected_by_rail from map.js
				if (Engine.map.is_connected_by_rail(game, constantinople, CP, [s])) return true
			}
		}

		return false
	}

	function can_use_ge_rp_for_tu(game, cost) {
		if (game.no_ge_to_tu_rp_conversion) return false
		if (can_convert_ge_to_tu_unlimited(game)) return true
		return game.ge_to_tu_rp_used + cost <= 1
	}

	function can_use_replacement_supply_as_nation(game, p, s, nation) {
		if (is_central_asia(s) || is_afghanistan(s)) {
			if (can_trace_supply_to_source(game, s, CP, s)) {
				let sources = []
				for (let i = 1; i < data.spaces.length; i++) {
					if (is_base_supply_source(game, i, CP) && !is_central_asia(i) && !is_afghanistan(i)) {
						sources.push(i)
					}
				}
				if (!can_trace_supply_to_source(game, s, CP, sources)) return false
			}
		}

		if (nation === "ge" || nation === "ah") {
			if (can_trace_supply_to_sofia(game, p) || can_trace_supply_to_turkey(game, p)) {
				if (!can_trace_supply_to_galicia(game, p)) return false
			}
		}
		if (nation === "tu" || nation === "tua") {
			if (can_trace_supply_to_sofia(game, p) || can_trace_supply_to_galicia(game, p)) {
				if (!can_trace_supply_to_turkey(game, p)) return false
			}
		}
		if (nation === "bu") {
			if (can_trace_supply_to_galicia(game, p) || can_trace_supply_to_turkey(game, p)) {
				if (!can_trace_supply_to_sofia(game, p)) return false
			}
		}
		if (nation === "ru") {
			if (can_trace_supply_to_british_source(game, p)) {
				if (!can_trace_supply_to_russian_source(game, p)) return false
			}
		}
		if (["br", "in", "anz"].includes(nation)) {
			if (can_trace_supply_to_russian_source(game, p)) {
				if (!can_trace_supply_to_british_source(game, p)) return false
			}
		}

		return true
	}

	function is_replacement_nation_eligible(game, p, nation) {
		let info = data.pieces[p]
		if (!info) return false
		if (game.events && game.events["turkish_war_weariness"] && (nation === "tu" || nation === "tua") && info.symbol === "triangle") {
			return false
		}
		if (is_capital_enemy_controlled(game, nation) && nation !== "sb" && nation !== "gr") return false
		if (!is_not_on_map(game, p)) {
			let s = game.pieces[p]
			if (s > 0 && !can_use_replacement_supply_as_nation(game, p, s, nation)) return false
		}
		return true
	}

	function can_convert_br_to_ru(game, cost, rps) {
		if (game.events && game.events["russian_revolution"] >= 1) return false
		if (rps.br < cost) return false
		if (game.events && game.events["asquith_coalition"]) return true
		if (game.events && game.events["kitchener"] && !game.br_to_ru_rp_used) return true
		return false
	}

	function can_afford_ap_replacement_as_nation(game, p, nation, cost, rps) {
		if (nation === "br" && rps.br >= cost) return true
		if (nation === "ru") {
			if (rps.ru >= cost) return true
			if (can_convert_br_to_ru(game, cost, rps)) return true
		}
		if (nation === "in" && rps.in >= cost) return true
		if (["anz", "ar", "gr"].includes(nation)) return rps.br >= cost || rps.a >= cost
		if (["fr", "ro", "sb", "pe", "arm", "geo", "it"].includes(nation)) return rps.a >= cost
		return rps.a >= cost
	}

	function can_afford_cp_replacement_as_nation(game, p, nation, cost, rps) {
		if (nation === "ge" && rps.ge >= cost) return true
		if (nation === "tu" || nation === "tua") {
			if (rps.tu >= cost) return true
			if (rps.ge >= cost && can_use_ge_rp_for_tu(game, cost)) return true
		}
		if (nation === "ah") {
			if (rps.a >= cost) return true
			if (rps.ge >= cost && can_trace_supply_to_galicia(game, p)) return true
		}
		if (nation === "bu") {
			if (rps.a >= cost) return true
			if (rps.ge >= cost && can_trace_supply_to_galicia(game, p)) return true
		}
		if (nation === "gr") return rps.a >= cost || rps.ge >= cost
		return rps.a >= cost
	}

	function spend_ap_replacement_as_nation(game, nation, cost, rps) {
		if (nation === "br" && rps.br >= cost) {
			rps.br -= cost
			return true
		}
		if (nation === "ru") {
			if (rps.ru >= cost) {
				rps.ru -= cost
				return true
			}
			if (game.events && game.events["asquith_coalition"] && can_convert_br_to_ru(game, cost, rps)) {
				rps.br -= cost
				return true
			}
			if (game.events && game.events["kitchener"] && can_convert_br_to_ru(game, cost, rps)) {
				rps.br -= cost
				game.br_to_ru_rp_used = true
				return true
			}
		}
		if (nation === "in" && rps.in >= cost) {
			rps.in -= cost
			return true
		}
		if (["anz", "ar", "gr"].includes(nation)) {
			if (rps.br >= cost) {
				rps.br -= cost
				return true
			}
			if (rps.a >= cost) {
				rps.a -= cost
				return true
			}
			return false
		}
		if (["fr", "ro", "sb", "pe", "arm", "geo", "it"].includes(nation)) {
			if (rps.a >= cost) {
				rps.a -= cost
				return true
			}
			return false
		}
		if (rps.a >= cost) {
			rps.a -= cost
			return true
		}
		return false
	}

	function spend_cp_replacement_as_nation(game, p, nation, cost, rps) {
		if (nation === "ge" && rps.ge >= cost) {
			rps.ge -= cost
			return true
		}
		if (nation === "tu" || nation === "tua") {
			if (rps.tu >= cost) {
				rps.tu -= cost
				return true
			}
			if (rps.ge >= cost && can_use_ge_rp_for_tu(game, cost)) {
				rps.ge -= cost
				if (!can_convert_ge_to_tu_unlimited(game)) game.ge_to_tu_rp_used += cost
				return true
			}
			return false
		}
		if (nation === "ah") {
			if (rps.a >= cost) {
				rps.a -= cost
				return true
			}
			if (rps.ge >= cost && can_trace_supply_to_galicia(game, p)) {
				rps.ge -= cost
				return true
			}
			return false
		}
		if (nation === "bu") {
			if (rps.a >= cost) {
				rps.a -= cost
				return true
			}
			if (rps.ge >= cost && can_trace_supply_to_galicia(game, p)) {
				rps.ge -= cost
				return true
			}
			return false
		}
		if (nation === "gr") {
			if (rps.a >= cost) {
				rps.a -= cost
				return true
			}
			if (rps.ge >= cost) {
				rps.ge -= cost
				return true
			}
			return false
		}
		if (rps.a >= cost) {
			rps.a -= cost
			return true
		}
		return false
	}

	function can_afford_replacement(game, p, cost) {
		let info = data.pieces[p]
		let faction = info.faction
		let rps = faction === AP ? game.rp_ap : game.rp_cp
		let nations = get_piece_nations_for_rule(game, p)

		// Rebel units can use their own automatic RP
		let rebel_type = get_rebel_type(info)
		if (rebel_type && game.rp_rebel && game.rp_rebel[rebel_type] >= cost) {
			return true
		}

		if (faction === CP && can_use_any_friendly_rp(p) && has_any_cp_rp(game, cost)) {
			return true
		}

		let valid_nations = nations.filter((nation) => is_replacement_nation_eligible(game, p, nation))
		if (valid_nations.length === 0) return false

		if (faction === AP) {
			return valid_nations.some((nation) => can_afford_ap_replacement_as_nation(game, p, nation, cost, rps))
		} else {
			return valid_nations.some((nation) => can_afford_cp_replacement_as_nation(game, p, nation, cost, rps))
		}
	}

	function spend_replacement_points(game, p, cost) {
		let info = data.pieces[p]
		let faction = info.faction
		let rps = faction === AP ? game.rp_ap : game.rp_cp
		let nations = get_piece_nations_for_rule(game, p)

		let rebel_type = get_rebel_type(info)
		if (rebel_type && game.rp_rebel && game.rp_rebel[rebel_type] >= cost) {
			game.rp_rebel[rebel_type] -= cost
			return
		}

		if (faction === CP && can_use_any_friendly_rp(p) && spend_any_cp_rp(game, cost)) {
			return
		}

		let valid_nations = nations.filter((nation) => is_replacement_nation_eligible(game, p, nation))

		if (faction === AP) {
			for (let nation of valid_nations) {
				if (spend_ap_replacement_as_nation(game, nation, cost, rps)) return
			}
		} else {
			for (let nation of valid_nations) {
				if (spend_cp_replacement_as_nation(game, p, nation, cost, rps)) return
			}
		}
	}

	function get_valid_rebuild_spaces(game, p, faction) {
		let info = data.pieces[p]
		if (is_tribe(p)) {
			let key = get_tribe_key_space(p)
			if (key >= 0 && can_trace_tribe_replacement_supply(game, p)) {
				return [key]
			}
			return []
		}

		let valid = []
		let nation = info.nation
		let nation_capital = find_capital(nation)

		// Rule 22.2.2: Restrictions on Placement
		// 限制重建单位的放置位置
		for (let s = 1; s < data.spaces.length; s++) {
			let space = data.spaces[s]
			let name = space.name
			let can_rebuild = false

			let rebel_type = get_rebel_type(info)
			if (rebel_type) {
				// Rule 22.2.2: Jihad Revolt units placement
				if (rebel_type === "eg") {
					let area = Engine.map.get_area(s)
					if (area === "egypt" || area === "sudan_and_darfur") {
						let ap_pieces = get_pieces_in_space(game, s).filter(p => data.pieces[p].faction === AP)
						if (ap_pieces.length === 0) can_rebuild = true
					}
				} else {
					let area = Engine.map.get_area(s)
					if (rebel_type === "af" && area === "afghanistan") can_rebuild = true
					if (rebel_type === "in" && area === "india") can_rebuild = true
					if (rebel_type === "ca" && area === "central_asia") can_rebuild = true
				}
			} else if (is_br_indian_garrison_unit(info)) {
				if (is_india(s) && can_rebuild_regular_unit_in_space(game, s, faction)) can_rebuild = true
			} else if (is_br_persian_cordon_unit(info)) {
				if (
					(is_persia(s) || is_india(s) || is_baluchistan(s) || name === "Baluchistan") &&
					can_rebuild_regular_unit_in_space(game, s, faction)
				)
					can_rebuild = true
			} else if (nation === "tu" || nation === "tua") {
				// Rule 22.2.2: TU/TUA units follow Ottoman reinforcement rules (7.7.2)
				if (is_controlled_by(game, s, CP) && !is_besieged(game, s)) {
					if (nation === "tu" && (s === nation_capital || name === "Kayseri" || name === "Erzincan"))
						can_rebuild = true
					if (nation === "tua" && (name === "Baghdad" || name === "Damascus")) can_rebuild = true
				}
			} else if (nation === "ge" || nation === "ah") {
				// Rule 22.2.2: GE and AH units may be rebuilt only in Galicia.
				if (is_galicia(s) && is_controlled_by(game, s, CP) && !is_besieged(game, s)) can_rebuild = true
			} else if (nation === "ru") {
				// Rule 22.2.2: RU LCUs may be rebuilt only on AP-controlled RU Supply Sources (including Trabzon)
				if (is_controlled_by(game, s, AP) && !is_besieged(game, s)) {
					if (Engine.map.is_base_supply_source(game, s, AP, "ru")) can_rebuild = true
					if (name === "Trabzon") can_rebuild = true
				}
			} else if (nation === "br" || nation === "in" || nation === "anz") {
				// Rule 22.2.2: BR, IN, and ANZ LCUs may be rebuilt only at AP-controlled BR Supply Sources or ports in E.Med, Aegean, or Persian Gulf.
				if (is_controlled_by(game, s, AP) && !is_besieged(game, s)) {
					// Rule 13.3.2: 德国潜艇地中海猎袭期间，不能在特定港口增援/重建
					if (Engine.events.is_german_subs_blocked_port(game, s)) {
						can_rebuild = false
					} else {
						if (Engine.map.is_base_supply_source(game, s, AP, "br", true)) can_rebuild = true
						if (Engine.map.is_aegean_east_med_port(s)) can_rebuild = true
						if (Engine.map.get_area(s) === "mesopotamia" && data.spaces[s].port) can_rebuild = true // Persian Gulf ports
					}
				}
			} else if (nation === "fr" || nation === "it") {
				// Rule 22.2.2: FR and IT units may be rebuilt at any AP-controlled port on the Aegean or E. Mediterranean.
				if (is_controlled_by(game, s, AP) && !is_besieged(game, s) && Engine.map.is_aegean_east_med_port(s)) {
					// Rule 13.3.2: 德国潜艇地中海猎袭期间，不能在特定港口增援/重建
					if (!Engine.events.is_german_subs_blocked_port(game, s)) {
						can_rebuild = true
					}
				}
			} else if (nation === "ro") {
				// Rule 22.2.2: RO units in Bucharest prior to Romanian Collapse.
				if (s === nation_capital && is_controlled_by(game, s, AP) && !game.events["romanian_collapse"])
					can_rebuild = true
			} else if (nation === "bu") {
				// Rule 22.2.2: BU units may be rebuilt only in CP-controlled Sofia.
				if (s === nation_capital && is_controlled_by(game, s, CP)) can_rebuild = true
			} else if (nation === "gr") {
				// Rule 22.2.2: GR units in any vacant or friendly-controlled space in Greece.
				// Exception: The GR-BR CND unit is rebuilt at Lemnos or any AP-controlled port in Greece.
				if (info.name && info.name.includes("CND")) {
					// Rule 13.3.2: 德国潜艇地中海猎袭期间，不能在特定港口增援/重建
					if (!Engine.events.is_german_subs_blocked_port(game, s)) {
						if (name === "Lemnos") can_rebuild = true
						if (
							is_aegean_east_med_port(s) &&
							data.spaces[s].nation === "gr" &&
							is_controlled_by(game, s, AP) &&
							!is_besieged(game, s)
						)
							can_rebuild = true
					}
				} else {
					if (data.spaces[s].nation === "gr" && !is_besieged(game, s)) {
						// Rule 13.3.2: 德国潜艇地中海猎袭期间，不能在特定港口增援/重建
						if (data.spaces[s].port && Engine.events.is_german_subs_blocked_port(game, s)) {
							can_rebuild = false
						} else {
							if (get_pieces_in_space(game, s).length === 0 || is_controlled_by(game, s, faction))
								can_rebuild = true
						}
					}
				}
			} else if (nation === "sb") {
				// Rule 19.4.4 & 22.2.2: SB units are governed by 19.4, according to whether or not Serbia has collapsed.
				// After Serbian Collapse, SB units may not be rebuilt until The Serbs Return event is played.

				// Rule 13.3.2: 德国潜艇地中海猎袭期间，不能在特定港口增援/重建
				let blocked = Engine.events.is_german_subs_blocked_port(game, s)

				if (game.events && game.events["serbian_collapse"]) {
					if (game.events["the_serbs_return"]) {
						let belgrade = find_space("BELGRADE")
						if (is_controlled_by(game, belgrade, AP)) {
							// Rule 19.4.4: After Belgrade is recaptured, SB units may again be built in Belgrade and Nis.
							if (
								!blocked &&
								(name === "Lemnos" ||
									(name === "Salonika" && is_controlled_by(game, s, AP) && !is_besieged(game, s)))
							)
								can_rebuild = true
							if (
								(name === "BELGRADE" || name === "Nis") &&
								is_controlled_by(game, s, AP) &&
								!is_besieged(game, s)
							)
								can_rebuild = true
						} else {
							// Rule 19.4.4: (only in AP-controlled Salonika or Lemnos, until Belgrade is recaptured)
							if (
								!blocked &&
								(name === "Lemnos" ||
									(name === "Salonika" && is_controlled_by(game, s, AP) && !is_besieged(game, s)))
							)
								can_rebuild = true
						}
					} else {
						// Rule 19.4.4: SB units may not be rebuilt until The Serbs Return event is played.
						can_rebuild = false
					}
				} else {
					// Rule 19.4.4: Prior to Serbian Collapse
					// 22.1.5: SB units may still be built at Lemnos or AP-controlled Salonika if Belgrade and Nis are enemy-controlled.
					if (
						!blocked &&
						(name === "Lemnos" ||
							(name === "Salonika" && is_controlled_by(game, s, AP) && !is_besieged(game, s)))
					)
						can_rebuild = true
					if (
						(name === "BELGRADE" || name === "Nis") &&
						is_controlled_by(game, s, AP) &&
						!is_besieged(game, s)
					)
						can_rebuild = true
				}
			} else if (nation === "ar") {
				// Rule 22.2.2: Arab Revolt Irregular Units in Hejaz (even if CP), Aqaba, or Jiddah (if AP).
				// ANA (Arab Northern Army) in any AP-controlled port in Syria/Palestine.
				if (info.name && info.name.includes("ANA")) {
					// Rule 13.3.2: 德国潜艇地中海猎袭期间，不能在特定港口增援/重建
					if (!Engine.events.is_german_subs_blocked_port(game, s)) {
						if (
							get_area(s) === "syria_palestine" &&
							data.spaces[s].port &&
							is_controlled_by(game, s, AP) &&
							!is_besieged(game, s)
						)
							can_rebuild = true
					}
				} else {
					if (is_hejaz(s) && !is_besieged(game, s)) can_rebuild = true
					if (
						(name === "Aqaba" || name === "Jiddah") &&
						is_controlled_by(game, s, AP) &&
						!is_besieged(game, s)
					)
						can_rebuild = true
				}
			} else if (nation === "geo" || nation === "arm") {
				// Rule 22.2.2: GEO and ARM in any AP controlled space in Russia or Caucasia.
				if ((is_russia(s) || is_caucasus(s)) && is_controlled_by(game, s, AP) && !is_besieged(game, s))
					can_rebuild = true
			} else if (nation === "pe") {
				// Rule 22.1.3: Irregular Units rebuilt in their Supply Area.
				if (
					is_irregular(p) &&
					Engine.map.is_persia(s) &&
					is_controlled_by(game, s, AP) &&
					!is_besieged(game, s)
				)
					can_rebuild = true
			}

			if (
				!can_rebuild &&
				is_dunsterforce_unit(info) &&
				name === "Baghdad" &&
				is_controlled_by(game, s, AP) &&
				can_rebuild_regular_unit_in_space(game, s, faction)
			) {
				can_rebuild = true
			}

			if (can_rebuild && can_stack_end_in_space(game, s, [p])) {
				valid.push(s)
			}
		}

		return valid
	}

	Object.assign(exports, {
		is_eliminated,
		is_in_reserve,
		get_replacement_cost,
		can_afford_replacement,
		spend_replacement_points,
		get_valid_rebuild_spaces,
		can_rebuild_in_reserve_box,
		get_tribe_key_space,
	})

	exports.get_replacement_cost = get_replacement_cost
	exports.can_afford_replacement = can_afford_replacement
	exports.spend_replacement_points = spend_replacement_points
	exports.can_rebuild_in_reserve_box = can_rebuild_in_reserve_box
	exports.can_trace_supply_to_galicia = can_trace_supply_to_galicia
	exports.can_trace_supply_to_turkey = can_trace_supply_to_turkey
	exports.can_trace_supply_to_sofia = can_trace_supply_to_sofia
	exports.can_trace_supply_to_british_source = can_trace_supply_to_british_source
	exports.can_trace_supply_to_russian_source = can_trace_supply_to_russian_source

	return exports
}
