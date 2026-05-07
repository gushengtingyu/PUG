"use strict"

module.exports = function (Engine) {
	const { data } = Engine
	const exports = {}

	const { is_controlled_by, is_russia_controlled_space } = Engine.map
	const {
		is_besieged,
		can_trace_supply_to_source,
		can_trace_piece_supply_to_space,
		can_trace_piece_supply_to_sources,
		get_pieces_in_space,
		is_base_supply_source,
		get_supply_sources_from_data,
		get_ru_supply_sources,
		get_tribe_type,
		get_connected_spaces,
		get_piece_effective_faction,
		is_connected_by_rail,
		has_friendly_pieces,
		is_disrupted_by_enemy,
		contains_enemy_pieces,
		is_port,
		get_tribal_spaces,
		is_limited_supply_status,
		is_disrupted_supply_status,
		is_cp_non_afghan_unit_tracing_only_to_afghanistan
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
		is_persian_region,
		is_egypt,
		is_sudan_and_darfur,
		is_aegean_east_med_port_or_beachhead,
		is_persian_gulf_port_or_beachhead,
		is_ap_controlled_port_or_beachhead,
		is_black_sea_port,
		is_caspian_sea_port,
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
		is_tribe,
		is_stanke_bey_unit,
		is_spers_rifles_unit
	} = Engine.game_utils
	const SOFIA = find_space("SOFIA")
	const CONSTANTINOPLE = find_space("CONSTANTINOPLE")
	const TRABZON = find_space("Trabzon")
	const BAGHDAD = find_space("Baghdad")
	const AQABA = find_space("Aqaba")
	const JIDDAH = find_space("Jiddah")
	const LEMNOS = find_space("Lemnos")
	const GALICIA_SPACE_IDS = []
	for (let s = 1; s < data.spaces.length; s++) {
		if (is_galicia(s)) GALICIA_SPACE_IDS.push(s)
	}
	const OTTOMAN_REPLACEMENT_SUPPLY_SOURCE_NAMES = new Set([
		"CONSTANTINOPLE",
		"Kayseri",
		"Erzincan",
		"Damascus",
		"Baghdad"
	])
	const AP_FALLBACK_REPLACEMENT_NATIONS = new Set(["fr", "ro", "sb", "pe", "arm", "geo", "it"])
	const AP_SHARED_BRITISH_REPLACEMENT_NATIONS = new Set(["anz", "ar", "gr"])
	const CP_GALICIA_SHARED_REPLACEMENT_NATIONS = new Set(["ah", "bu"])

	function is_br_indian_garrison_unit(info) {
		return !!(info && info.name && info.name.includes("IN Garrison"))
	}

	function is_br_persian_cordon_unit(info) {
		return !!(info && info.name && info.name.includes("Persian Cordon"))
	}

	function is_dunsterforce_unit(info) {
		return !!(info && info.name === "BR Dunsterforce")
	}

	function is_ana_unit(info) {
		return !!(info && info.name === "BR ANA Arab")
	}

	function is_special_ru_allied_rebuild_unit(info) {
		return !!(info && info.name && (info.name.includes("2/4 Special") || info.name.includes("Yugo")))
	}

	function is_british_empire_scu_rebuild_port(game, s) {
		if (!is_ap_controlled_port_or_beachhead(game, s) || is_besieged(game, s)) return false
		if (s === AQABA || s === JIDDAH) return false
		if (is_black_sea_port(game, s) || is_caspian_sea_port(game, s)) return false
		return true
	}

	function is_special_ru_allied_rebuild_space(game, s) {
		if (s === LEMNOS) return is_controlled_by(game, s, AP) && !is_besieged(game, s)
		let space = data.spaces[s]
		return !!(space && space.nation === "gr" && is_port(s) && is_controlled_by(game, s, AP) && !is_besieged(game, s))
	}

	function has_serbia_collapsed(game) {
		return !!(Engine.collapse && Engine.collapse.has_serbia_collapsed && Engine.collapse.has_serbia_collapsed(game))
	}

	function can_rebuild_regular_unit_in_space(game, s, faction) {
		if (is_besieged(game, s)) return false
		return !contains_enemy_pieces(game, s, faction)
	}

	function is_ru_lcu_rebuild_space(game, s) {
		if (!is_controlled_by(game, s, AP) || is_besieged(game, s)) return false

		let name = data.spaces[s] && data.spaces[s].name
		if (["Odessa", "TIFLIS", "Central Asia", "Petrovsk"].includes(name)) return true
		return s === TRABZON && !!(game.vps && game.vps[s] === "ru")
	}

	function can_rebuild_in_reserve_box(p) {
		let info = data.pieces[p]
		if (!info || info.piece_class !== "SCU" || info.type !== "regular") return false
		if (is_spers_rifles_unit(p)) return false
		if (is_br_indian_garrison_unit(info)) return false
		return !is_br_persian_cordon_unit(info)
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
		if (is_stanke_bey_unit(p)) return 0

		if (eliminated && is_spers_rifles_unit(p)) return 0

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

		// 消灭单位重建时一律以残血状态返回 (Reserve Box 或地图)，
		// 花费与"残血→满血"相同：LCU 1 RP / SCU 0.5 RP。
		// 若玩家想要满血，需要再次点击该(现已残血)单位，以同等费用翻面。
		if (eliminated) {
			return info.piece_class === "LCU" ? 1 : 0.5
		} else if (set_has(game.reduced, p)) {
			let cost = info.piece_class === "LCU" ? 1 : 0.5
			return is_repairing_in_disrupted_supply(game, p) ? cost * 2 : cost
		}
		return 0
	}

	function is_repairing_in_disrupted_supply(game, p) {
		let s = game.pieces[p]
		if (!(s > 0) || s >= data.spaces.length || !data.spaces[s]) return false
		if (!Engine.map || typeof Engine.map.get_supply_status !== "function") return false
		let faction = get_piece_effective_faction(game, p)
		if (faction !== AP && faction !== CP) faction = data.pieces[p].faction
		let status = Engine.map.get_supply_status(game, s, faction, p, false)
		return !is_limited_supply_status(status) && is_disrupted_supply_status(status)
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
		// 检查 CP 是否有任何可用的 RP
		let rps = game.rp_cp
		if (rps.a >= cost) return true
		if (rps.tu >= cost) return true
		return rps.ge >= cost
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
		let tribal_spaces = get_tribal_spaces(tribe_type)
		if (tribal_spaces.length === 0) return false

		let sources = get_supply_sources_from_data(game, CP)
		let friendly_ports = []
		let ap_ports = []
		for (let s = 1; s < data.spaces.length; s++) {
			if (!is_port(s)) continue
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

	function get_turkish_replacement_supply_sources(game, faction) {
		let sources = []
		for (let i = 1; i < data.spaces.length; i++) {
			let info = data.spaces[i]
			if (!info || !OTTOMAN_REPLACEMENT_SUPPLY_SOURCE_NAMES.has(info.name)) continue
			if (!is_controlled_by(game, i, faction) || is_besieged(game, i)) continue
			sources.push(i)
		}
		return sources
	}

	function get_galicia_replacement_supply_sources(game, faction) {
		let sources = []
		for (let s of GALICIA_SPACE_IDS) {
			if (!is_controlled_by(game, s, faction) || is_besieged(game, s)) continue
			sources.push(s)
		}
		return sources
	}

	function get_british_replacement_supply_sources(game) {
		let sources = []
		for (let i = 1; i < data.spaces.length; i++) {
			if (is_base_supply_source(game, i, AP, "br", true)) sources.push(i)
			else if (is_port(i) && is_controlled_by(game, i, AP)) sources.push(i)
		}
		return sources
	}

	function can_trace_supply_to_sofia(game, p) {
		return can_trace_piece_supply_to_space(game, p, SOFIA, {
			faction: CP,
			require_unbesieged: true,
			allow_off_map: true
		})
	}

	function can_trace_supply_to_turkey(game, p) {
		let info = data.pieces[p]
		if (!info) return false
		return can_trace_piece_supply_to_sources(game, p, get_turkish_replacement_supply_sources(game, info.faction), {
			faction: info.faction
		})
	}

	function can_trace_supply_to_galicia(game, p) {
		let info = data.pieces[p]
		if (!info) return false
		if (is_not_on_map(game, p)) {
			if (info.nation === "ge" || info.nation === "ah") return true
			if (info.nation === "bu") {
				if (SOFIA < 0 || !is_controlled_by(game, SOFIA, CP) || is_besieged(game, SOFIA)) return false
				return can_trace_supply_to_source(
					game,
					SOFIA,
					info.faction,
					get_galicia_replacement_supply_sources(game, info.faction)
				)
			}
			return false
		}
		return can_trace_piece_supply_to_sources(game, p, get_galicia_replacement_supply_sources(game, info.faction), {
			faction: info.faction
		})
	}

	function can_trace_supply_to_british_source(game, p) {
		return can_trace_piece_supply_to_sources(game, p, get_british_replacement_supply_sources(game), { faction: AP })
	}

	function can_trace_supply_to_russian_source(game, p) {
		return can_trace_piece_supply_to_sources(game, p, get_ru_supply_sources(game, true), { faction: AP })
	}

	function is_capital_restricted(game, nation) {
		// Rule 22.1.5: SB and GR units are not affected by this restriction.
		if (nation === "sb" || nation === "gr") return false

		// Rule 22.1.5: British/Russian capitals are off-map, thus never enemy-controlled or besieged.
		if (["ru", "br", "in", "anz"].includes(nation)) return false

		let capital = find_capital(nation)
		if (capital >= 0) {
			let owner_faction = data.spaces[capital].faction === "ap" ? AP : CP
			let enemy = other_faction(owner_faction)
			// Rule 22.1.5: currently enemy-controlled or besieged
			return is_controlled_by(game, capital, enemy) || is_besieged(game, capital)
		}

		return false
	}

	function can_convert_ge_to_tu_unlimited(game) {
		if (game.no_ge_to_tu_rp_conversion) return false
		if (!game.events || !game.events["bulgaria"]) return false

		if (CONSTANTINOPLE < 0) return false
		if (!is_controlled_by(game, CONSTANTINOPLE, CP)) return false

		for (let s of GALICIA_SPACE_IDS) {
			if (is_controlled_by(game, s, CP) && is_connected_by_rail(game, CONSTANTINOPLE, CP, [s], null, true))
				return true
		}

		return false
	}

	function can_use_ge_rp_for_tu(game, cost) {
		if (game.no_ge_to_tu_rp_conversion) return false
		if (can_convert_ge_to_tu_unlimited(game)) return true
		return game.ge_to_tu_rp_used + cost <= 1
	}

	function get_ge_to_tu_conversion_budget(game, rps) {
		if (game.no_ge_to_tu_rp_conversion) return 0
		let ge_available = Number(rps.ge || 0)
		if (ge_available <= 0) return 0
		if (can_convert_ge_to_tu_unlimited(game)) return ge_available
		let remaining = Math.max(0, 1 - Number(game.ge_to_tu_rp_used || 0))
		return Math.min(ge_available, remaining)
	}

	function get_turkish_replacement_payment_plan(game, cost, rps) {
		let remaining = Number(cost || 0)
		let ge_spend = Math.min(get_ge_to_tu_conversion_budget(game, rps), remaining)
		remaining -= ge_spend

		let tu_spend = Math.min(Number(rps.tu || 0), remaining)
		remaining -= tu_spend

		if (remaining > 1e-9) return null
		return { ge: ge_spend, tu: tu_spend }
	}

	const REPLACEMENT_SUPPLY_REQUIREMENTS = {
		ge: { any: ["sofia", "turkey"], require: "galicia" },
		ah: { any: ["sofia", "turkey"], require: "galicia" },
		tu: { any: ["sofia", "galicia"], require: "turkey" },
		tua: { any: ["sofia", "galicia"], require: "turkey" },
		bu: { any: ["galicia", "turkey"], require: "sofia" },
		ru: { any: ["british"], require: "russian" },
		br: { any: ["russian"], require: "british" },
		in: { any: ["russian"], require: "british" },
		anz: { any: ["russian"], require: "british" }
	}

	function can_trace_replacement_supply_group(game, p, key) {
		if (key === "sofia") return can_trace_supply_to_sofia(game, p)
		if (key === "galicia") return can_trace_supply_to_galicia(game, p)
		if (key === "turkey") return can_trace_supply_to_turkey(game, p)
		if (key === "british") return can_trace_supply_to_british_source(game, p)
		if (key === "russian") return can_trace_supply_to_russian_source(game, p)
		return false
	}

	function can_use_replacement_supply_as_nation(game, p, s, nation) {
		if (is_cp_non_afghan_unit_tracing_only_to_afghanistan(game, p)) return false

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

		let requirement = REPLACEMENT_SUPPLY_REQUIREMENTS[nation]
		if (requirement) {
			let trace_cache = new Map()
			let can_trace = (key) => {
				if (!trace_cache.has(key)) trace_cache.set(key, can_trace_replacement_supply_group(game, p, key))
				return trace_cache.get(key)
			}
			if (requirement.any.some(can_trace) && !can_trace(requirement.require)) {
				return false
			}
		}

		return true
	}

	function create_replacement_payment_option(pool, options = {}) {
		return {
			pool,
			can_use: options.can_use || (() => true),
			on_spend: options.on_spend || (() => {})
		}
	}

	function can_use_br_to_ru_during_revolution(game) {
		if (!(game.events && game.events["russian_revolution"] >= 1)) return true
		if (CONSTANTINOPLE < 0) return false
		return is_russia_controlled_space(game, CONSTANTINOPLE)
	}

	function get_br_to_ru_conversion_spent(game) {
		let spent = Number(game.br_to_ru_rp_spent || 0)
		if (!Number.isFinite(spent)) spent = 0
		if (spent <= 0 && game.br_to_ru_rp_used === true) return 1
		return spent
	}

	function get_br_to_ru_conversion_budget(game, rps) {
		if (game.events && game.events["gorlice_tarnow"] === game.turn) return 0
		if (!can_use_br_to_ru_during_revolution(game)) return 0
		let br_available = Number(rps.br || 0)
		if (br_available <= 0) return 0
		if (game.events && game.events["asquith_coalition"]) return br_available
		if (game.events && game.events["kitchener"]) {
			let remaining = Math.max(0, 1 - get_br_to_ru_conversion_spent(game))
			return Math.min(br_available, remaining)
		}
		return 0
	}

	function can_convert_br_to_ru(game, cost, rps) {
		return get_br_to_ru_conversion_budget(game, rps) >= cost
	}

	function get_russian_replacement_payment_plan(game, cost, rps) {
		let remaining = Number(cost || 0)
		let br_spend = Math.min(get_br_to_ru_conversion_budget(game, rps), remaining)
		remaining -= br_spend

		let ru_spend = Math.min(Number(rps.ru || 0), remaining)
		remaining -= ru_spend

		if (remaining > 1e-9) return null
		return { br: br_spend, ru: ru_spend }
	}

	const AP_REPLACEMENT_PAYMENT_OPTIONS = {
		br: [create_replacement_payment_option("br")],
		ru: [
			create_replacement_payment_option("ru"),
			create_replacement_payment_option("br", {
				can_use: ({ game, cost, rps }) => can_convert_br_to_ru(game, cost, rps),
				on_spend: ({ game }) => {
					if (!(game.events && game.events["asquith_coalition"]) && game.events && game.events["kitchener"]) {
						game.br_to_ru_rp_used = true
					}
				}
			})
		],
		in: [create_replacement_payment_option("in")]
	}

	const CP_REPLACEMENT_PAYMENT_OPTIONS = {
		ge: [create_replacement_payment_option("ge")],
		tu: [
			create_replacement_payment_option("tu"),
			create_replacement_payment_option("ge", {
				can_use: ({ game, cost }) => can_use_ge_rp_for_tu(game, cost),
				on_spend: ({ game, cost }) => {
					if (!can_convert_ge_to_tu_unlimited(game)) game.ge_to_tu_rp_used += cost
				}
			})
		],
		tua: [
			create_replacement_payment_option("tu"),
			create_replacement_payment_option("ge", {
				can_use: ({ game, cost }) => can_use_ge_rp_for_tu(game, cost),
				on_spend: ({ game, cost }) => {
					if (!can_convert_ge_to_tu_unlimited(game)) game.ge_to_tu_rp_used += cost
				}
			})
		],
		gr: [create_replacement_payment_option("a"), create_replacement_payment_option("ge")]
	}

	function get_replacement_payment_options(game, p, nation, faction) {
		if (faction === AP) {
			if (AP_REPLACEMENT_PAYMENT_OPTIONS[nation]) return AP_REPLACEMENT_PAYMENT_OPTIONS[nation]
			if (AP_SHARED_BRITISH_REPLACEMENT_NATIONS.has(nation)) {
				return [create_replacement_payment_option("br"), create_replacement_payment_option("a")]
			}
			if (AP_FALLBACK_REPLACEMENT_NATIONS.has(nation)) return [create_replacement_payment_option("a")]
			return [create_replacement_payment_option("a")]
		}

		if (CP_REPLACEMENT_PAYMENT_OPTIONS[nation]) return CP_REPLACEMENT_PAYMENT_OPTIONS[nation]
		if (CP_GALICIA_SHARED_REPLACEMENT_NATIONS.has(nation)) {
			return [
				create_replacement_payment_option("a"),
				create_replacement_payment_option("ge", {
					can_use: ({ game, p }) => can_trace_supply_to_galicia(game, p)
				})
			]
		}
		return [create_replacement_payment_option("a")]
	}

	function can_use_replacement_payment_option(option, context) {
		let amount = context.rps[option.pool] || 0
		if (amount < context.cost) return false
		return option.can_use(context)
	}

	function can_afford_replacement_as_nation(game, p, nation, cost, rps, faction) {
		if (nation === "ru") {
			return !!get_russian_replacement_payment_plan(game, cost, rps)
		}
		if (nation === "tu" || nation === "tua") {
			return !!get_turkish_replacement_payment_plan(game, cost, rps)
		}
		let options = get_replacement_payment_options(game, p, nation, faction)
		let context = { game, p, nation, cost, rps, faction }
		return options.some((option) => can_use_replacement_payment_option(option, context))
	}

	function spend_replacement_as_nation(game, p, nation, cost, rps, faction) {
		if (nation === "ru") {
			let plan = get_russian_replacement_payment_plan(game, cost, rps)
			if (!plan) return false
			if (plan.br > 0) {
				rps.br -= plan.br
				if (!(game.events && game.events["asquith_coalition"]) && game.events && game.events["kitchener"]) {
					game.br_to_ru_rp_used = true
					game.br_to_ru_rp_spent = (game.br_to_ru_rp_spent || 0) + plan.br
				}
			}
			if (plan.ru > 0) {
				rps.ru -= plan.ru
			}
			return true
		}
		if (nation === "tu" || nation === "tua") {
			let plan = get_turkish_replacement_payment_plan(game, cost, rps)
			if (!plan) return false
			if (plan.ge > 0) {
				rps.ge -= plan.ge
				if (!can_convert_ge_to_tu_unlimited(game)) game.ge_to_tu_rp_used += plan.ge
			}
			if (plan.tu > 0) {
				rps.tu -= plan.tu
			}
			return true
		}
		let options = get_replacement_payment_options(game, p, nation, faction)
		let context = { game, p, nation, cost, rps, faction }
		for (let option of options) {
			if (!can_use_replacement_payment_option(option, context)) continue
			rps[option.pool] -= cost
			option.on_spend(context)
			return true
		}
		return false
	}

	function is_replacement_nation_eligible(game, p, nation, force = false) {
		let info = data.pieces[p]
		if (!info) return false
		if (
			!force &&
			game.events &&
			game.events["turkish_war_weariness"] &&
			(nation === "tu" || nation === "tua") &&
			info.symbol === "triangle"
		) {
			return false
		}
		if (nation === "sb" && has_serbia_collapsed(game) && (!game.events || !game.events["the_serbs_return"])) {
			return false
		}
		if (game.events && game.events["arab_desertion"] && nation === "tua") {
			return false
		}
		if (is_capital_restricted(game, nation)) return false
		if (!is_not_on_map(game, p)) {
			let s = game.pieces[p]
			if (s > 0 && !can_use_replacement_supply_as_nation(game, p, s, nation)) return false
		}
		return true
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

		return valid_nations.some((nation) => can_afford_replacement_as_nation(game, p, nation, cost, rps, faction))
	}

	function spend_replacement_points(game, p, cost, force = false) {
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

		let valid_nations = nations.filter((nation) => is_replacement_nation_eligible(game, p, nation, force))
		for (let nation of valid_nations) {
			if (spend_replacement_as_nation(game, p, nation, cost, rps, faction)) return
		}
	}

	function get_valid_rebuild_spaces(game, p, faction) {
		let info = data.pieces[p]
		if (is_stanke_bey_unit(p)) return []
		if (is_spers_rifles_unit(p)) return []
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
					if (is_egypt(s) || is_sudan_and_darfur(s)) {
						let ap_pieces = get_pieces_in_space(game, s).filter((p) => data.pieces[p].faction === AP)
						if (ap_pieces.length === 0) can_rebuild = true
					}
				} else {
					if (rebel_type === "af" && is_afghanistan(s)) can_rebuild = true
					if (rebel_type === "in" && is_india(s)) can_rebuild = true
					if (rebel_type === "ca" && is_central_asia(s)) can_rebuild = true
				}
			} else if (is_br_indian_garrison_unit(info)) {
				if (is_india(s) && can_rebuild_regular_unit_in_space(game, s, faction)) can_rebuild = true
			} else if (is_br_persian_cordon_unit(info)) {
				if (
					(is_persian_region(s) || is_india(s) || is_baluchistan(s) || name === "Baluchistan") &&
					can_rebuild_regular_unit_in_space(game, s, faction)
				)
					can_rebuild = true
			} else if (is_ana_unit(info)) {
				// Rule 22.2.2: ANA rebuilds only at AP-controlled ports in Syria/Palestine.
				if (
					get_area(s) === "syria_palestine" &&
					is_port(s) &&
					is_controlled_by(game, s, AP) &&
					!is_besieged(game, s)
				) {
					can_rebuild = true
				}
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
				// Rule 7.7.6 / 22.2.1: the special RU Allied SCUs can rebuild at Lemnos or AP-controlled Greek ports.
				if (info.piece_class === "SCU" && is_special_ru_allied_rebuild_unit(info)) {
					if (is_special_ru_allied_rebuild_space(game, s)) can_rebuild = true
				}
				// Rule 22.2.2: RU units rebuild on named RU Supply Sources, plus Russian-controlled Trabzon.
				if (is_ru_lcu_rebuild_space(game, s)) can_rebuild = true
			} else if (nation === "br" || nation === "in" || nation === "anz") {
				if (info.piece_class === "SCU") {
					// Rule 22.2.1 / 7.7.5: BR, IN, and ANZ SCUs rebuild like reinforcements.
					if (
						is_base_supply_source(game, s, AP, "br", true) &&
						can_rebuild_regular_unit_in_space(game, s, faction)
					)
						can_rebuild = true
					if (is_british_empire_scu_rebuild_port(game, s)) can_rebuild = true
				} else if (is_controlled_by(game, s, AP) && !is_besieged(game, s)) {
					// Rule 22.2.2: BR, IN, and ANZ LCUs may be rebuilt only at AP-controlled BR Supply Sources or ports in E.Med, Aegean, or Persian Gulf.
					if (is_base_supply_source(game, s, AP, "br", true)) can_rebuild = true
					if (is_aegean_east_med_port_or_beachhead(game, s)) can_rebuild = true
					if (is_persian_gulf_port_or_beachhead(game, s)) can_rebuild = true
				}
			} else if (nation === "fr" || nation === "it") {
				// Rule 22.2.2: FR and IT units may be rebuilt at any AP-controlled port on the Aegean or E. Mediterranean.
				if (
					is_controlled_by(game, s, AP) &&
					!is_besieged(game, s) &&
					is_aegean_east_med_port_or_beachhead(game, s)
				) {
					can_rebuild = true
				}
			} else if (Engine.neutral && typeof Engine.neutral.can_rebuild_balkan_unit_in_space === "function") {
				let neutral_override = Engine.neutral.can_rebuild_balkan_unit_in_space(game, p, s, faction)
				if (neutral_override !== undefined) can_rebuild = neutral_override
			} else if (nation === "ar") {
				// Rule 22.2.2: Arab Revolt Irregular Units in Hejaz (even if CP), Aqaba, or Jiddah (if AP).
				if (is_hejaz(s) && !is_besieged(game, s)) can_rebuild = true
				if ((s === AQABA || s === JIDDAH) && is_controlled_by(game, s, AP) && !is_besieged(game, s))
					can_rebuild = true
			} else if (nation === "geo" || nation === "arm") {
				// Rule 22.2.2: GEO and ARM in any AP controlled space in Russia or Caucasia.
				if ((is_russia(s) || is_caucasus(s)) && is_controlled_by(game, s, AP) && !is_besieged(game, s))
					can_rebuild = true
			} else if (nation === "pe") {
				// Rule 22.1.3: Irregular Units rebuilt in their Supply Area.
				if (is_irregular(p) && is_persia(s) && is_controlled_by(game, s, AP) && !is_besieged(game, s))
					can_rebuild = true
			}

			if (
				!can_rebuild &&
				is_dunsterforce_unit(info) &&
				s === BAGHDAD &&
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
		can_trace_supply_to_galicia,
		can_trace_supply_to_turkey,
		can_trace_supply_to_sofia,
		can_trace_supply_to_british_source,
		can_trace_supply_to_russian_source,
		is_capital_restricted,
		is_replacement_nation_eligible
	})

	return exports
}
