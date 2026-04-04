"use strict"

module.exports = function (Engine) {
	const { data, constants, utils, game_utils } = Engine
	const exports = {}

	const {
		AP,
		CP,
		RESERVE,
		ELIMINATED,
		REMOVED,
		REINFORCEMENTS,
		COMMITMENT_MOBILIZATION,
		COMMITMENT_LIMITED,
		COMMITMENT_TOTAL
	} = constants
	const { set_add, set_delete, set_has, other_faction } = utils
	const {
		get_piece_effective_faction,
		is_lcu,
		is_scu,
		is_tribe,
		is_irregular,
		is_hq,
		is_in_reserve,
		get_piece_nations_for_rule,
		get_piece_nation_groups_for_rule,
		piece_counts_as_nation_for_rule,
		can_piece_be_activated
	} =
		game_utils
	const {
		is_greece_neutral,
		is_neutral_greece_supply_passable,
		is_athens_space,
		violates_neutral_greece_movement_restriction,
		is_greek_piece,
		has_greek_units_in_space,
		can_move_piece_for_faction
	} = Engine.greece

	// --- Unit/Space Helpers ---

	function get_pieces_in_space(game, s) {
		let list = []
		for (let p = 0; p < game.pieces.length; p++) {
			if (game.pieces[p] === s) list.push(p)
		}
		return list
	}

	function for_each_piece_in_space(game, s, fn) {
		for (let p = 0; p < game.pieces.length; p++) {
			if (game.pieces[p] === s) fn(p)
		}
	}

	function contains_enemy_pieces(game, s, faction) {
		if (faction === undefined) faction = game.active
		let enemy = other_faction(faction)
		let found = false
		for_each_piece_in_space(game, s, (p) => {
			if (get_piece_effective_faction(game, p) === enemy) found = true
		})
		return found
	}

	function get_piece_connected_spaces_for_rule(game, from, p, mode = "move") {
		let info = data.pieces[p]
		if (!info) return []
		let nations = get_piece_nations_for_rule(game, p)
		if (nations.length === 0) nations = [info.nation]
		let connected = new Set()
		for (let nation of nations) {
			for (let s of get_connected_spaces(game, from, nation, info.faction, p, mode)) {
				connected.add(s)
			}
		}
		return [...connected]
	}

	// --- Naval Access Logic ---
	function get_movement_cost(game, p, to) {
		let from = game.pieces[p]

		// Rule 9.2.4: Crossing green connection (Trans-Regional Path) costs ALL MP.
		if (is_green_connection(from, to)) {
			// Rule 9.2.4: Dunsterforce Exception.
			let name = data.pieces[p].name || ""
			let counter = data.pieces[p].counter || ""
			if (name.includes("Dunsterforce") || counter.includes("Dunsterforce")) return 4

			// Rule 9.2.4: Entire movement allowance.
			return data.pieces[p].mf || 0
		}

		// Rule 9.6.2: Gallipoli Map Movement.
		if (is_gallipoli(from) && is_gallipoli(to)) {
			if (game.move && game.move.gallipoli_internal_paid) {
				return 0
			}
			return 1
		}

		return 1 // Standard cost
	}

	function is_naval_access_space(game_or_space, maybe_space) {
		let game = maybe_space === undefined ? null : game_or_space
		let s = maybe_space === undefined ? game_or_space : maybe_space
		let space = data.spaces[s]
		if (!space) return false
		return !!space.port || is_gallipoli(s) || (game ? is_beachhead_space(game, s) : false)
	}

	const AEGEAN_EAST_MED_PORTS = new Set([
		"ATHENS",
		"Salonika",
		"Lemnos",
		"Smyrna",
		"Mugla",
		"Antalya",
		"Mersin",
		"Adana",
		"Alexandretta",
		"Beirut",
		"Haifa",
		"Jaffa",
		"Gaza",
		"Port Said",
		"Alexandria",
		"Mersa Matruh",
		"Sollum",
		"Cyprus"
	])

	const BLACK_SEA_PORTS = new Set([
		"Odessa",
		"Constanta",
		"Varna",
		"Burgas",
		"The Bosphorus Forts",
		"Eregli (Black Sea)",
		"Inebolu",
		"Samsun",
		"Giresun",
		"Trabzon",
		"Rize",
		"Batum",
		"Poti"
	])

	const CASPIAN_SEA_PORTS = new Set(["Baku", "Central Asia", "Enzeli"])

	function is_aegean_east_med_port(s) {
		let space = data.spaces[s]
		if (!space) return false
		if (AEGEAN_EAST_MED_PORTS.has(space.name)) return true
		return space.area === "gallipoli";
	}

	function is_black_sea_port(game_or_space, maybe_space) {
		let game = maybe_space === undefined ? null : game_or_space
		let s = maybe_space === undefined ? game_or_space : maybe_space
		let space = data.spaces[s]
		if (!space) return false
		if (!space.port && !(game && is_beachhead_space(game, s))) return false
		return BLACK_SEA_PORTS.has(space.name)
	}

	function is_caspian_sea_port(game_or_space, maybe_space) {
		let game = maybe_space === undefined ? null : game_or_space
		let s = maybe_space === undefined ? game_or_space : maybe_space
		let space = data.spaces[s]
		if (!space) return false
		if (!space.port && !(game && is_beachhead_space(game, s))) return false
		return CASPIAN_SEA_PORTS.has(space.name)
	}

	// --- Region Logic ---

	function is_island_base(game, s) {
		const CYPRUS = 183
		if (s <= 0 || !data.spaces[s]) return false
		if (s === CYPRUS) return !!(game && game.events && game.events["egyptian_coup"])
		return !!data.spaces[s].island_base
	}

	function is_region(game, s) {
		if (s === undefined) {
			s = game
			game = undefined
		}
		if (s === undefined || s === null || !data.spaces[s]) return false
		return !!data.spaces[s].region || is_island_base(game, s)
	}

	/**
	 * 获取 CSV 中定义的大区 (Macro-region / Theatre)
	 * 例如: Persia (East/West/South/), India, Afghanistan, Central Asia
	 */
	function get_region(space) {
		if (!data.spaces[space]) return null
		return data.spaces[space].region || null
	}

	/**
	 * 获取游戏规则定义的区域 (Functional Area / Sub-region)
	 * 例如: balkans, egypt, sinai, gallipoli, anatolia, caucasus, azerbaijan, georgia, india, russia
	 */
	function get_area(space) {
		let s = data.spaces[space]
		if (!s) return null
		return s.area || null
	}

	function is_balkans(s) {
		return get_area(s) === "balkans"
	}
	function is_egypt(s) {
		return get_area(s) === "egypt"
	}
	function is_anatolia(s) {
		return get_area(s) === "anatolia"
	}
	function is_caucasus(s) {
		return get_area(s) === "caucasus"
	}
	function is_georgia(s) {
		return get_area(s) === "georgia"
	}
	function is_galicia(s) {
		return get_region(s) === "Galicia"
	}
	function is_gallipoli(s) {
		return get_area(s) === "gallipoli"
	}
	function is_india(s) {
		return get_area(s) === "india"
	}
	function is_russia(s) {
		return get_area(s) === "russia"
	}

	function is_baluchistan(s) {
		return get_region(s) === "Baluchistan"
	}

	function is_afghanistan(s) {
		return get_region(s) === "Afghanistan"
	}

	function is_central_asia(s) {
		return get_region(s) === "Central Asia"
	}

	function is_sudan_and_darfur(s) {
		return get_region(s) === "Sudan and Darfur"
	}

	function is_persia(s) {
		let region = get_region(s)
		if (region && region.includes("Persia")) return true
		let area = get_area(s)
		return area === "persia"
	}

	function is_azerbaijan(s) {
		return get_area(s) === "azerbaijan"
	}
	function is_arabistan(s) {
		return get_area(s) === "arabistan"
	}

	function is_sinai(s) {
		return get_area(s) === "sinai"
	}

	function is_suez_canal_space(s) {
		let space = data.spaces[s]
		if (!space) return false
		return ["Port Said", "Ismailia", "Suez"].includes(space.name)
	}

	function is_hejaz(s) {
		return get_region(s) === "Hejaz"
	}

	function is_mesopotamia(s) {
		return get_area(s) === "mesopotamia"
	}
	function is_syria_palestine(s) {
		return get_area(s) === "syria_palestine"
	}

	const RESTRICTED_AREAS = new Set(["mesopotamia", "persia", "syria_palestine", "azerbaijan", "arabistan"])

	function get_restricted_area(s) {
		if (!data.spaces[s]) return null
		const area = get_area(s)
		if (area === "sinai") return "syria_palestine"
		if (RESTRICTED_AREAS.has(area)) return area
		if (is_persia(s)) return "persia"
		return null
	}

	function is_prohibited_to_non_indian_units(space) {
		// Rule 20.2.3 & Glossary: India Entry Restrictions.
		// Rule 9.8.3: Restricted Area LCU Limit (1/2/3 based on War Commitment).
		return is_india(space)
	}

	// --- Control Logic ---

	function is_controlled_by(game, s, faction) {
		// Check dynamic control
		if (game.control && game.control[s]) {
			return game.control[s] === faction
		}

		// Fallback to static faction definition from data
		return data.spaces[s].faction === faction
	}

	function has_undestroyed_fort(game, s, faction) {
		if (s === undefined || s === null || !data.spaces[s]) return false
		if (data.spaces[s].fort && data.spaces[s].fort > 0) {
			if (data.spaces[s].nation === "tu" || data.spaces[s].nation === "tua") {
				if (faction === CP && !set_has(game.forts.destroyed, s)) return true
			} else {
				let owner = data.spaces[s].faction
				if (game.control && game.control[s]) owner = game.control[s]
				if (owner === faction && !set_has(game.forts.destroyed, s)) return true
			}
		}
		return false
	}

	function destroy_fort(game, s) {
		if (!game.forts) game.forts = { destroyed: [] }
		if (!game.forts.destroyed) game.forts.destroyed = []
		if (!set_has(game.forts.destroyed, s)) {
			set_add(game.forts.destroyed, s)
		}
	}

	// --- Connection Logic ---

	function get_connection_type(a, b) {
		if (!data.spaces[a] || !data.spaces[a].connection_types) return null
		return data.spaces[a].connection_types[b] || null
	}

	function get_connection_strait(a, b) {
		if (!data.spaces[a] || !data.spaces[a].connection_straits) return null
		let n = data.spaces[a].connection_straits[b]
		if (n === undefined || n === null) return null
		return Number(n)
	}

	function get_crossing_type(a, b) {
		if (!data.spaces[a] || !data.spaces[a].crossings) return null
		return data.spaces[a].crossings[b] || null
	}

	function is_strait_connection(a, b) {
		return get_connection_type(a, b) === "strait"
	}

	let strait_edges = null
	let strait_numbers = null
	let bosphorus_forts_space = null

	function init_strait_edges() {
		if (strait_edges) return
		strait_edges = {}
		strait_numbers = []
		for (let i = 1; i < data.spaces.length; i++) {
			let map = data.spaces[i].connection_straits
			if (!map) continue
			for (let k in map) {
				let n = Number(map[k])
				if (!n) continue
				let a = i
				let b = Number(k)
				if (Number.isNaN(b) || a > b) continue // Store only once
				if (!strait_edges[n]) strait_edges[n] = []
				strait_edges[n].push([a, b])
				if (!strait_numbers.includes(n)) strait_numbers.push(n)
			}
		}
		strait_numbers.sort((a, b) => a - b)
	}

	function faction_controls_strait(game, num, faction) {
		init_strait_edges()
		let edges = strait_edges[num] || []
		if (edges.length === 0) return false

		// Check if faction controls both sides of ANY edge in this strait group
		for (let [a, b] of edges) {
			if (is_controlled_by(game, a, faction) && is_controlled_by(game, b, faction)) return true
		}
		return false
	}

	function can_use_strait(game, a, b, faction) {
		// Rule 9.4.6: Straits and Ferry Lanes.
		let num = get_connection_strait(a, b)
		if (!num) {
			// For un-numbered straits (like Cyprus), just check control of both sides (9.4.6)
			return is_controlled_by(game, a, faction) && is_controlled_by(game, b, faction)
		}

		// Must control the strait being crossed
		if (!faction_controls_strait(game, num, faction)) return false

		// Sequential check for AP (opening the straits from Med to Black Sea)
		if (faction === AP) {
			init_strait_edges()
			for (let n of strait_numbers) {
				if (n < num && !faction_controls_strait(game, n, faction)) return false
			}
			return true
		}
		// Sequential check for CP (opening from Black Sea to Med?)
		if (faction === CP) {
			init_strait_edges()
			for (let n of strait_numbers) {
				if (n > num && !faction_controls_strait(game, n, faction)) return false
			}
			if (num === 5) {
				let bosphorus = get_bosphorus_forts_space_id()
				if (bosphorus < 0 || !is_controlled_by(game, bosphorus, faction)) return false
			}
			return true
		}
		return true
	}

	function get_bosphorus_forts_space_id() {
		if (bosphorus_forts_space === null) {
			bosphorus_forts_space = find_space_by_name("The Bosphorus Forts")
		}
		return bosphorus_forts_space
	}

	function get_tribe_type(p) {
		if (p < 0 || !data.pieces[p]) return null
		let name = data.pieces[p].name || ""
		if (name.startsWith("Kurds")) return "Kurds"
		if (name.startsWith("Senussi")) return "Senussi"
		if (name.startsWith("Marsh")) return "Marsh"
		if (name === "NW Frontier") return "NW Frontier"
		if (name === "Tangistani") return "Tangistani"
		if (name === "Bawi") return "Bawi"
		if (name === "Bakhtiari") return "Bakhtiari"
		if (name === "Jangali") return "Jangali"
		if (name === "Sinjabi") return "Sinjabi"
		if (name === "Qashqai") return "Qashqai"
		if (name === "Laz") return "Laz"
		return name
	}

	function is_space_in_tribal_range(p, s) {
		if (p === undefined || p < 0 || !data.pieces[p]) return true
		if (
			!is_tribe(p) &&
			!(data.pieces[p].name && data.pieces[p].name.startsWith("CAsia Uprising"))
		)
			return true

		let tribe_type = get_tribe_type(p)
		if (!tribe_type) return true

		// Rule 17.1.4: Tribe Movement Range (one full move away from its tribal boxes).
		let mf = get_piece_mf(p)

		let visited = new Set()
		let queue = []

		// Initial queue: all activity grid spaces
		for (let start_s = 1; start_s < data.spaces.length; start_s++) {
			if (data.spaces[start_s].tribal_activity_grid === tribe_type) {
				if (start_s === s) return true
				queue.push([start_s, 0])
				visited.add(start_s)
			}
		}

		if (mf === 0) return false

		while (queue.length > 0) {
			let [curr, dist] = queue.shift()
			if (dist >= mf) continue

			let conns = data.spaces[curr].connections || []
			for (let next of conns) {
				if (is_caspian_green_connection(curr, next)) continue
				if (next === s) return true
				if (!visited.has(next)) {
					visited.add(next)
					queue.push([next, dist + 1])
				}
			}
		}
		return false
	}

	function get_connected_spaces(game, s, nation, faction, p, mode = "move") {
		if (!data.spaces[s]) return []
		let conns = data.spaces[s].connections || []

		if (mode === "supply") {
			// Supply can be traced across any valid connection, regardless of unit movement restrictions
			if (data.spaces[s].connection_types) {
				conns = Object.keys(data.spaces[s].connection_types).map(Number)
			}
		} else if (nation && data.spaces[s].limited_connections && data.spaces[s].limited_connections[nation]) {
			conns = data.spaces[s].limited_connections[nation]
		}

		conns = conns.filter((next) => connection_allowed(game, s, next, mode, faction))

		if (p !== undefined && is_lcu(p) && mode === "move") {
			// Rule 180: Desert LCU entry restriction
			let is_s_desert = data.spaces[s].terrain === "desert"
			let rail_conns = null
			conns = conns.filter((next) => {
				let is_next_desert = data.spaces[next].terrain === "desert"
				if (is_s_desert || is_next_desert) {
					if (!rail_conns) rail_conns = get_rail_connections(game, s, faction)
					if (!rail_conns.includes(next)) return false
					// Check if the connection itself is supplied via rail to a supply source
					if (!is_rail_connected_to_supply(game, next, faction)) return false
				}
				return true
			})
		}

		if (faction) {
			conns = conns.filter((next) => !is_strait_connection(s, next) || can_use_strait(game, s, next, faction))
		}

		if (
			p !== undefined && p >= 0 && data.pieces[p] &&
			(is_tribe(p) || (data.pieces[p].name && data.pieces[p].name.startsWith("CAsia Uprising")))
		) {
			// Rule 17.1.4 & 9.2.4: Tribes cannot move/attack/trace across Caspian green lines
			conns = conns.filter((next) => !is_caspian_green_connection(s, next))

			// Rule 17.1.4: Tribe Movement Range (within one full move of activity grid).
			conns = conns.filter((next) => is_space_in_tribal_range(p, next))
		}
		return conns
	}

	function get_distance(a, b) {
		if (a === b) return 0
		let visited = new Set()
		let queue = [[a, 0]]
		visited.add(a)
		while (queue.length > 0) {
			let [curr, dist] = queue.shift()
			let conns = data.spaces[curr].connections || []
			for (let next of conns) {
				if (next === b) return dist + 1
				if (!visited.has(next)) {
					visited.add(next)
					queue.push([next, dist + 1])
				}
			}
		}
		return 999
	}

	function is_beachhead_space(game, s) {
		if (!game.beachheads) return false
		return set_has(game.beachheads, s)
	}

	function is_russian_vp_space(game, s) {
		if (game.warm_water_port_vp === s) return true
		if (!data.spaces[s].vp) return false
		if (data.spaces[s].nation === "ru") return true
		return is_azerbaijan(s);
	}

	function get_connection_flags(a, b) {
		if (!data.spaces[a] || !data.spaces[a].connection_flags) return []
		let flags = data.spaces[a].connection_flags[b]
		return Array.isArray(flags) ? flags : []
	}

	function get_event_flag(flag, mode) {
		if (flag.startsWith("event_")) return flag.substring(6)
		if (flag.startsWith("event:")) return flag.substring(6)
		if (flag.startsWith("rail_when_event:")) return mode === "rail" ? flag.substring(16) : null
		return null
	}

	function has_active_event(game, events, faction) {
		if (!game.events) return false
		for (let evt of events) {
			let val = game.events[evt]
			if (val === true) return true
			if (typeof val === "number" && game.turn >= val) {
				// Rule 21.2.1: Sinai Railroad (Sinai) is AP only
				if (evt === "xinai" && faction === CP) continue
				return true
			}
		}
		return false
	}

	function is_connection_active(game, type, flags, mode, faction) {
		let events = flags.map((flag) => get_event_flag(flag, mode)).filter(Boolean)
		if (type === "conditional_rail") {
			// Rule: For conditional rails (usually roads upgraded to rail via event),
			// normal movement and supply are allowed even if the rail isn't active,
			// UNLESS it's a virtual connection that doesn't exist yet.
			if (mode !== "rail" && !flags.includes("virtual")) return true

			if (events.length === 0) return false
			return has_active_event(game, events, faction)
		}
		if (events.length === 0) return true
		return has_active_event(game, events, faction)
	}

	function connection_allows_mode(type, flags, mode) {
		let modeFlags = flags.filter((f) => f.startsWith("mode:")).map((f) => f.substring(5))
		if (modeFlags.length > 0) return modeFlags.includes(mode)
		if (mode === "move") {
			if (flags.includes("rail_only") || flags.includes("virtual") || flags.includes("supply_only")) return false
		}
		if (mode === "rail") {
			if (flags.includes("move_only")) return false
			// Rule 9.2.4: Trans-Regional Paths (Green Connections) may not be crossed by units performing SR.
			if (type === "green") return false
		}
		if (mode === "supply") {
			if (flags.includes("move_only")) return false
		}
		return true
	}

	let debug_log = () => {}
	function set_debug_log(fn) {
		debug_log = fn
	}

	function connection_allowed(game, a, b, mode, faction) {
		let type = get_connection_type(a, b) || ""
		let flags = get_connection_flags(a, b)
		if (!is_connection_active(game, type, flags, mode, faction)) {
			return false
		}
		return connection_allows_mode(type, flags, mode)
	}

	function is_green_connection(a, b) {
		return get_connection_type(a, b) === "green"
	}

	function is_caspian_green_connection(a, b) {
		if (!is_green_connection(a, b)) return false
		return get_connection_flags(a, b).includes("caspian")
	}

	function get_rail_connections(game, s, faction) {
		let list = []
		let all_connections = data.spaces[s].connections || []
		let railSet = new Set(data.spaces[s].rail_connections || [])
		for (let next of all_connections) {
			let type = get_connection_type(s, next) || ""
			let flags = get_connection_flags(s, next)
			let hasRailFlag = flags.some(
				(flag) => flag.startsWith("rail_when_event:") || flag === "rail_only" || flag === "virtual"
			)
			let isCandidate = railSet.has(next) || type === "conditional_rail" || hasRailFlag
			if (!isCandidate) continue
			if (!connection_allowed(game, s, next, "rail", faction)) continue
			list.push(next)
		}
		return list
	}

	// --- MOVEMENT ---

	function can_move_piece_by_faction(game, p, faction) {
		if (data.pieces[p].faction === faction) return true
		return !!can_move_piece_for_faction(game, p, faction);
	}

	function get_greek_move_restriction_reason(game, p, target, faction) {
		if (!is_greek_piece(p)) return null
		if (!can_move_piece_for_faction(game, p, faction)) {
			return "希腊中立：希腊部队不可移动"
		}
		if (
			faction === CP &&
			is_greece_neutral(game) &&
			game.events &&
			game.events["rupel"] &&
			is_athens_space(target)
		) {
			return "希腊中立：鲁贝尔事件期间希腊部队不能进入雅典"
		}
		return null
	}

	function violates_neutral_greece_end_move_rule(game, p, target, faction, total_cost) {
		return violates_neutral_greece_movement_restriction(game, p, target, faction, total_cost)
	}

	const LCU_LIMITS = {
		[AP]: {
			[COMMITMENT_MOBILIZATION]: 1,
			[COMMITMENT_LIMITED]: 2,
			[COMMITMENT_TOTAL]: 3
		},
		[CP]: {
			[COMMITMENT_MOBILIZATION]: 1,
			[COMMITMENT_LIMITED]: 2,
			[COMMITMENT_TOTAL]: 2 // Base CP limit is 2
		}
	}

	function get_lcu_limit_for(game, faction) {
		let commitment = faction === AP ? game.war_commitment_ap : game.war_commitment_cp
		let limit = LCU_LIMITS[faction][commitment] || 1

		// Special Event Modifiers
		if (faction === CP && commitment === COMMITMENT_TOTAL) {
			if (game.events && game.events.berlin_baghdad) {
				// Rule 9.8.3: Berlin-Baghdad Railroad increases CP LCU limit in restricted areas to 3.
				limit = 3
			}
		}

		return limit
	}

	function count_lcu_in_area(game, area, faction) {
		let count = 0
		for (let p = 1; p < data.pieces.length; p++) {
			if (is_lcu(p) && data.pieces[p].faction === faction) {
				let s = game.pieces[p]
				if (s >= 0 && get_area(s) === area) {
					count++
				}
			}
		}
		return count
	}

	function can_enter_region(game, p, s) {
		const { events } = Engine

		if (is_island_base(game, s) && data.pieces[p].faction === CP) return false

		// Rule 20.1.3: Balkan-Only Units restriction.
		if (data.pieces[p].region_limit === "B") {
			if (data.spaces[s].area !== "balkans") return false
		}

		let region = get_region(s)
		let area = get_area(s)
		let restricted_area = get_restricted_area(s)
		let space_info = data.spaces[s]

		if (space_info && space_info.faction === "neutral") {
			let nation = space_info.nation
			if (nation === "gr") {
				// Rule 19.2.3: Both players may enter Greece... so long as they do not enter Athens.
				if (is_athens_space(s) && Engine.greece.is_greece_neutral(game)) return false
				// Rule 19.2.3: CP units do not have the privilege to move through spaces containing GR units.
				if (
					data.pieces[p].faction === CP &&
					Engine.greece.is_greece_neutral(game) &&
					Engine.greece.has_greek_units_in_space(game, s)
				)
					return false
			} else {
				if (nation === "ro") {
					// Rule 19.5.1: Romanian Entry.
					if (!game.events || !game.events["romania"]) return false
				} else if (nation === "bu") {
					// Rule 19.3.1: Bulgarian Entry.
					if (!game.events || !game.events["bulgaria"]) return false
				} else if (nation === "sb") {
					// Rule 19.4.1: Serbian Entry via Bulgaria event.
					if (!game.events || !game.events["bulgaria"]) return false
				} else if (nation === "pe") {
					// Rule 19.6.1: Persian Neutrality.
					if (!events.is_persia_open(game)) return false
				} else if (nation === "af") {
					// Rule 19.7.1: Afghanistan Entry (CP SCUs only).
					// Rule 18.2.5: Both players’ units may now enter Afghanistan if Afghan Alliance is active.
					if (game.events && game.events["afghan_alliance"]) return true
					let piece = data.pieces[p]
					if (!piece || piece.faction !== CP || piece.piece_class !== "SCU") return false
				} else {
					return false
				}
			}
		}

		if (!region && !restricted_area) return true

		if (is_prohibited_to_non_indian_units(s)) {
			if (!piece_counts_as_nation_for_rule(game, p, "in")) return false
		}

		// Rule 19.6.1: Persian Neutrality / Secret Treaty.
		if (area === "persia") {
			if (!events.is_persia_open(game)) return false
		}

		if (is_lcu(p)) {
			if (data.spaces[s].terrain === "desert") {
				// Rule 9.3: Desert Movement Restrictions for LCUs.
				let faction = data.pieces[p].faction
				let sources = get_supply_sources_from_data(game, faction)
				if (!is_connected_by_rail(game, s, faction, sources)) {
					return false
				}
			}

			if (data.spaces[s].terrain === "swamp") {
				let nations = get_piece_nations_for_rule(game, p)
				if (nations.length > 0 && nations.every((nation) => nation === "tu" || nation === "tua" || nation === "bu")) return false
			}

			if (restricted_area) {
				// Rule 9.8.3: Restricted Area LCU Limit.
				let faction = data.pieces[p].faction
				let limit = get_lcu_limit_for(game, faction)

				let current_s = game.pieces[p]
				let current_area = get_restricted_area(current_s)
				if (current_area === restricted_area) return true

				let count = count_lcu_in_area(game, restricted_area, faction)
				if (count >= limit) return false
			}
		}

		return true
	}

	function is_unlimited_stack_space(game, s) {
		const CYPRUS = 183
		if (s <= 0 || !data.spaces[s]) return false
		if (s === CYPRUS) return !!(game.events && game.events["egyptian_coup"])
		return is_island_base(game, s) || !!data.spaces[s].region || data.spaces[s].map === "Reserve Box"
	}

	function get_stack_special_key(p) {
		let piece = data.pieces[p]
		if (piece.type === "hq") return "hq"
		if (piece.symbol === "Y") return "Y"
		if (piece.symbol === "H") return "H"
		return null
	}

	function get_stack_counted_pieces(pieces) {
		let counted = []
		let has_yildirim = false
		for (let p of pieces) {
			let key = get_stack_special_key(p)
			if (key === "hq" || key === "H") {
				continue
			}
			if (key === "Y") {
				if (!has_yildirim) {
					has_yildirim = true
					continue
				}
			}
			counted.push(p)
		}
		return counted
	}

	function get_stack_count(pieces) {
		return get_stack_counted_pieces(pieces).length
	}

	function is_stack_counted_piece(p) {
		let key = get_stack_special_key(p)
		return key !== "hq" && key !== "H"
	}

	function get_stack_hq_count(pieces) {
		let hqs = 0
		for (let p of pieces) {
			if (get_stack_special_key(p) === "hq") hqs++
		}
		return hqs
	}

	function get_stack_composition_reason(game, pieces) {
		if (has_br_ru_mix(game, pieces)) return "英俄混编"
		if (get_stack_hq_count(pieces) > 1) return "HQ超限"
		return null
	}

	function has_br_ru_mix(game, pieces) {
		let has_br = false
		let ru_count = 0
		let ru_limit = game.events && game.events["russian_revolution"] >= 4 ? 2 : 0
		for (let p of pieces) {
			if (
				piece_counts_as_nation_for_rule(game, p, "br") ||
				piece_counts_as_nation_for_rule(game, p, "in") ||
				piece_counts_as_nation_for_rule(game, p, "anz")
			) {
				has_br = true
			}
			if (piece_counts_as_nation_for_rule(game, p, "ru")) {
				ru_count++
			}
			if (has_br && ru_count > ru_limit) return true
		}
		return false
	}

	function can_move_stack_composition(game, pieces) {
		return get_stack_composition_reason(game, pieces) === null
	}

	function can_stack_end_in_space(game, target, pieces) {
		if (!pieces || pieces.length === 0) return false
		if (pieces.some((p) => p < 0 || !data.pieces[p])) return false
		if (!Engine.greece.can_end_move_in_neutral_greece(game, pieces[0], target, data.pieces[pieces[0]].faction))
			return false

		// Rule 17.1.4: Tribe Movement Range
		for (let p of pieces) {
			if (!is_space_in_tribal_range(p, target)) return false
		}

		if (!can_move_stack_composition(game, pieces)) return false

		let faction = data.pieces[pieces[0]].faction
		for (let p of pieces) {
			if (data.pieces[p].faction !== faction) return false
		}

		let existing = get_pieces_in_space(game, target).filter((p) => data.pieces[p].faction === faction)

		let total = [...pieces, ...existing]
		if (total.some((p) => data.pieces[p].name === "GE GeoProtect") && total.length > 1) return false
		if (get_stack_composition_reason(game, total)) return false

		if (is_unlimited_stack_space(game, target)) return true

		let count = get_stack_count(total)
		return count <= 3
	}

	function get_move_end_space_block_reason(game, s, faction) {
		let friendly = get_pieces_in_space(game, s).filter((p) => get_piece_effective_faction(game, p) === faction)
		if (friendly.length === 0) return null

		// Rule 17.1.4: Tribe Movement Range
		for (let p of friendly) {
			if (!is_space_in_tribal_range(p, s)) return "部落活动范围限制"
		}

		let composition_reason = get_stack_composition_reason(game, friendly)
		if (composition_reason) return composition_reason

		if (is_unlimited_stack_space(game, s) === false) {
			let count = get_stack_count(friendly)
			if (count > 3) return "堆叠超限"
		}

		if (has_undestroyed_fort(game, s, other_faction(faction)) && !can_besiege(game, s, friendly)) {
			return "要塞围攻兵力不足"
		}

		return null
	}

	function get_stack_end_block_reason(game, target, pieces) {
		if (!pieces || pieces.length === 0) return "无移动单位"
		if (!Engine.greece.can_end_move_in_neutral_greece(game, pieces[0], target, data.pieces[pieces[0]].faction))
			return "中立希腊移动限制"

		for (let p of pieces) {
			if (!is_space_in_tribal_range(p, target)) return "部落活动范围限制"
		}

		if (!can_move_stack_composition(game, pieces)) return "堆叠组成限制"

		let faction = data.pieces[pieces[0]].faction
		for (let p of pieces) {
			if (data.pieces[p].faction !== faction) return "混编阵营"
		}

		let existing = get_pieces_in_space(game, target).filter((p) => data.pieces[p].faction === faction)

		let total = [...pieces, ...existing]
		let composition_reason = get_stack_composition_reason(game, total)
		if (composition_reason) return composition_reason

		if (is_unlimited_stack_space(game, target)) return null

		let count = get_stack_count(total)
		if (count > 3) return "堆叠超限"
		return null
	}

	function get_piece_mf(p) {
		return data.pieces[p].mf
	}

	function prune_exhausted_move_stack(game, log_fn) {
		let removed = false
		for (let p of [...game.move.pieces]) {
			if (get_piece_mf(p) <= game.move.spaces_moved) {
				set_delete(game.move.pieces, p)
				set_add(game.moved, p)
				if (log_fn) log_fn(`${data.pieces[p].name} stops moving in ${data.spaces[game.move.current].name}`)
				removed = true
			}
		}
		return removed && game.move.pieces.length === 0
	}

	function has_unmoved_pieces_in_space(game, s, faction) {
		let pieces = get_pieces_in_space(game, s)
		for (let p of pieces) {
			if (can_move_piece_by_faction(game, p, faction) && !set_has(game.moved, p) && get_piece_mf(p) > 0)
				return true
		}
		return false
	}

	function get_piece_move_block_reason(game, p, target, faction) {
		let greek_reason = get_greek_move_restriction_reason(game, p, target, faction)
		if (greek_reason) return greek_reason
		if (contains_enemy_pieces(game, target, faction)) return "目标有敌军"
		if (!can_enter_region(game, p, target)) return "区域限制或LCU数量限制"
		if (
			data.spaces[target].terrain === "desert" &&
			!is_in_supply(game, game.move.initial, data.pieces[p].faction, p)
		)
			return "沙漠进入需要起始补给"

		let s = game.move.current
		let neighbors = get_piece_connected_spaces_for_rule(game, s, p)
		if (!neighbors.includes(target)) return "非相邻连接"

		// Rule 9.2.4: Crossing green connection (Trans-Regional Path)
		if (is_green_connection(s, target)) {
			if (game.move && game.move.spaces_moved > 0) {
				return "绿色连线：只能在激活后未移动时跨越"
			}
			let enemy = other_faction(faction)
			if (is_controlled_by(game, target, enemy) && has_undestroyed_fort(game, target, enemy)) {
				return "绿色连线：不能进入敌方控制且有敌方要塞的格"
			}
			if (is_controlled_by(game, target, enemy) && Engine.game_utils.has_trench(game, target) > 0) {
				return "绿色连线：不能进入敌方壕沟格"
			}
		}

		let cost = get_movement_cost(game, p, target)
		if (
			!is_green_connection(s, target) &&
			has_undestroyed_fort(game, target, faction === AP ? CP : AP) &&
			!is_besieged(game, target)
		) {
			cost += 1
		}

		if (violates_neutral_greece_end_move_rule(game, p, target, faction, game.move.spaces_moved + cost)) {
			return "希腊中立：不能在希腊部队同格结束移动"
		}

		if (get_piece_mf(p) < game.move.spaces_moved + cost)
			return `移动力不足(${get_piece_mf(p)} < ${game.move.spaces_moved + cost})`
		return null
	}

	function is_last_move_for_stack(game, target, faction) {
		if (!game.move || game.move.pieces.length === 0) return true
		for (let p of game.move.pieces) {
			let cost = get_movement_cost(game, p, target)
			if (
				!is_green_connection(game.move.current, target) &&
				has_undestroyed_fort(game, target, faction === AP ? CP : AP) &&
				!is_besieged(game, target)
			) {
				cost += 1
			}
			if (get_piece_mf(p) > game.move.spaces_moved + cost) {
				return false
			}
		}
		return true
	}
	function can_stack_move_to(game, target, faction) {
		if (contains_enemy_pieces(game, target, faction)) return false
		if (game.move.pieces.length === 0) return false
		for (let p of game.move.pieces) {
			if (!can_piece_move_to(game, p, target, faction)) return false
		}
		return !(is_last_move_for_stack(game, target, faction) && !can_stack_end_in_space(game, target, game.move.pieces));
	}

	function can_piece_move_to(game, p, target, faction) {
		if (get_greek_move_restriction_reason(game, p, target, faction)) return false
		if (contains_enemy_pieces(game, target, faction)) return false

		// Rule 19.2.3: CP units may not enter neutral Greece space with Greek units.
		if (faction === CP && is_greece_neutral(game) && data.spaces[target].nation === "gr") {
			if (has_greek_units_in_space(game, target)) return false
		}

		if (!can_enter_region(game, p, target)) return false
		if (data.spaces[target].terrain === "desert") {
			if (!is_in_supply(game, game.move.initial, data.pieces[p].faction, p)) return false
		}
		let s = game.move.current
		let neighbors = get_piece_connected_spaces_for_rule(game, s, p)
		if (!neighbors.includes(target)) return false

		// Rule 9.2.4: Crossing green connection (Trans-Regional Path)
		if (is_green_connection(s, target)) {
			if (game.move && game.move.spaces_moved > 0) {
				return false
			}
			let enemy = other_faction(faction)
			if (
				is_controlled_by(game, target, enemy) &&
				(has_undestroyed_fort(game, target, enemy) || Engine.game_utils.has_trench(game, target) > 0)
			) {
				return false
			}
		}

		let cost = get_movement_cost(game, p, target)
		if (
			!is_green_connection(s, target) &&
			has_undestroyed_fort(game, target, faction === AP ? CP : AP) &&
			!is_besieged(game, target)
		)
			cost += 1
		if (violates_neutral_greece_end_move_rule(game, p, target, faction, game.move.spaces_moved + cost)) return false
		return get_piece_mf(p) >= game.move.spaces_moved + cost;
	}

	function can_besiege(game, s, pieces) {
		const { game_utils } = Engine
		if (!pieces || pieces.length === 0) return false
		if (!pieces.some((p) => !is_tribe(p))) return false // Tribes cannot besiege

		// Rule 15.2.1: 1 LCU or SCUs equal to Fort's strength.
		// Rule 13.3.4: RU Black Sea counts as 3 SCUs.
		if (pieces.some((p) => game_utils.is_lcu(p))) return true

		let scu_count = 0
		for (let p of pieces) {
			if (game_utils.is_scu(p)) {
				if (data.pieces[p].name === "RU Black Sea") {
					scu_count += 3
				} else {
					scu_count += 1
				}
			}
		}

		let fort_level = data.spaces[s].fort || 0
		return scu_count >= fort_level
	}

	// Strategic Redeployment (SR)
	function get_sr_cost(p) {
		return data.pieces[p].piece_class === "LCU" ? 4 : 1
	}

	function is_reserve_space(s) {
		if (s === RESERVE) return true
		if (s <= 0 || !data.spaces[s]) return false
		let name = data.spaces[s].name
		return (
			name === "AP Reserve" || name === "CP Reserve" || name === "AP Corps Assets" || name === "CP Corps Assets"
		)
	}

	function has_sr_path(game, p, from, to, faction, rail_only) {
		if (from === to) return true
		let queue = [from]
		let queue_head = 0
		let visited = new Set([from])

		while (queue_head < queue.length) {
			let current = queue[queue_head++]
			let neighbors
			if (rail_only) {
				let rail_neighbors = get_rail_connections(game, current, faction)
				let nation_neighbors = get_piece_connected_spaces_for_rule(game, current, p)
				let nation_set = new Set(nation_neighbors)
				neighbors = rail_neighbors.filter((n) => nation_set.has(n))
			} else {
				neighbors = get_piece_connected_spaces_for_rule(game, current, p)
			}

			for (let next of neighbors) {
				if (visited.has(next)) continue
				let passable = is_controlled_by(game, next, faction) || is_besieged(game, next)
				if (!passable) continue
				if (next === to) return true
				visited.add(next)
				queue.push(next)
			}
		}

		return false
	}

	function is_same_sr_nationality(a, b) {
		if (a === b) return true
		let be = ["br", "in", "anz"]
		if (be.includes(a) && be.includes(b)) return true
		return (a === "tu" || a === "tua") && (b === "tu" || b === "tua")
	}

	function pieces_share_sr_nationality(game, a, b) {
		let a_nations = get_piece_nations_for_rule(game, a, "sr")
		let b_nations = get_piece_nations_for_rule(game, b, "sr")
		for (let left of a_nations) {
			for (let right of b_nations) {
				if (is_same_sr_nationality(left, right)) return true
			}
		}
		return false
	}

	function is_supply_status_in_supply(status) {
		return status === "FULL" || status === "DISRUPTED" || status === "LIMITED"
	}

	function has_same_nationality_supplied_unit_in_space(
		game,
		p,
		s,
		supply_trace_cache = null,
		supply_context = null,
		source_cache = null,
		status_cache = null
	) {
		let target_faction = data.pieces[p].faction
		for (let q of get_pieces_in_space(game, s)) {
			let info = data.pieces[q]
			if (!info) continue
			if (info.faction !== target_faction) continue
			if (!pieces_share_sr_nationality(game, p, q)) continue
			let status = get_supply_status(
				game,
				s,
				target_faction,
				q,
				false,
				supply_trace_cache,
				supply_context,
				source_cache,
				status_cache
			)
			if (!is_supply_status_in_supply(status) || status === "LIMITED") continue
			return true
		}
		return false
	}

	function can_sr_from_reserve_to_space(game, p, s, faction) {
		let info = data.pieces[p]
		if (info.piece_class === "LCU") return false
		if (!is_controlled_by(game, s, faction) && !contains_friendly_pieces(game, s, faction)) return false
		let status = get_supply_status(game, s, faction, p, true)
		if (!is_supply_status_in_supply(status)) return false
		if (!can_enter_region(game, p, s)) return false
		if (!can_stack_end_in_space(game, s, [p])) return false
		let full_sources = get_full_supply_sources_for_unit(game, p, true)
		if (full_sources.includes(s)) return true
		return has_same_nationality_supplied_unit_in_space(game, p, s)
	}

	function get_faction_reserve_name(faction) {
		return faction === AP ? "AP Reserve" : "CP Reserve"
	}

	function get_faction_reserve_space_id(faction) {
		return find_space_by_name(get_faction_reserve_name(faction))
	}

	function is_sr_destination_blocked_by_events(game, source, dest, faction) {
		let source_space = data.spaces[source]
		let dest_space = data.spaces[dest]
		let is_sea_sr =
			!!source_space &&
			!!dest_space &&
			source !== dest &&
			!!source_space.port &&
			!!dest_space.port
		if (!is_sea_sr) return false

		if (faction === AP && game.events && game.events["german_subs"]) {
			if (is_aegean_east_med_port(dest) || (data.spaces[dest] && data.spaces[dest].area === "gallipoli")) {
				return true
			}
		}
		if (game.events && game.events["royal_navy_blockade"] && faction === CP) {
			let is_source_port = !!data.spaces[source].port
			let is_dest_port = !!data.spaces[dest].port
			if (is_source_port || is_dest_port) {
				let source_black_caspian = is_black_sea_port(game, source) || is_caspian_sea_port(game, source)
				let dest_black_caspian = is_black_sea_port(game, dest) || is_caspian_sea_port(game, dest)
				if ((is_source_port && !source_black_caspian) || (is_dest_port && !dest_black_caspian)) {
					return true
				}
			}
		}
		return false
	}

	function has_sr_sea_port_route(game, p, source, dest, faction) {
		let info = data.pieces[p]
		if (!data.spaces[source].port || !data.spaces[dest].port) return false
		if (info.piece_class === "LCU") return false
		if (info.symbol === "H") return false
		let source_caspian = is_caspian_sea_port(source)
		let dest_caspian = is_caspian_sea_port(dest)
		if (source_caspian || dest_caspian) {
			if (!source_caspian || !dest_caspian) return false
		}
		if (is_sr_destination_blocked_by_events(game, source, dest, faction)) return false
		return true
	}

	function build_sr_path_reachable_spaces(game, p, source, faction) {
		let info = data.pieces[p]
		let nation = info.nation
		let rail_only = info.piece_class === "LCU"
		let visited = new Set([source])
		let queue = [source]
		let queue_head = 0
		while (queue_head < queue.length) {
			let current = queue[queue_head++]
			let neighbors
			if (rail_only) {
				let rail_neighbors = get_rail_connections(game, current, faction)
				let nation_neighbors = get_connected_spaces(game, current, nation, faction, p)
				let nation_set = new Set(nation_neighbors)
				neighbors = rail_neighbors.filter((n) => nation_set.has(n))
			} else {
				neighbors = get_connected_spaces(game, current, nation, faction, p)
			}
			for (let next of neighbors) {
				if (visited.has(next)) continue
				let passable = is_controlled_by(game, next, faction) || is_besieged(game, next)
				if (!passable) continue
				visited.add(next)
				queue.push(next)
			}
		}
		visited.delete(source)
		return visited
	}

	function can_sr_to_non_reserve_space_with_context(
		game,
		p,
		source,
		dest,
		faction,
		supply_trace_cache,
		supply_context,
		source_cache,
		status_cache
	) {
		if (is_caspian_sea_port(source) || is_caspian_sea_port(dest)) {
			return can_sr_to_space(game, p, dest, faction)
		}
		if (is_sr_destination_blocked_by_events(game, source, dest, faction)) return false
		if (game.control[dest] !== faction && !contains_friendly_pieces(game, dest, faction)) return false
		let dest_status = get_supply_status(
			game,
			dest,
			faction,
			p,
			true,
			supply_trace_cache,
			supply_context,
			source_cache,
			status_cache
		)
		if (!is_supply_status_in_supply(dest_status)) return false
		if (!can_enter_region(game, p, dest)) return false
		if (!can_stack_end_in_space(game, dest, [p])) return false
		return true
	}

	function get_sr_destinations(game, p, faction) {
		let source = game.pieces[p]
		if (source !== RESERVE && (source <= 0 || !data.spaces[source])) return []
		if (set_has(game.sr_moved || [], p)) return []
		let info = data.pieces[p]
		if (!info || info.faction !== faction) return []

		let source_reserve = is_reserve_space(source)
		let destinations = new Set()
		let supply_trace_cache = new Map()
		let source_cache = new Map()
		let status_cache = new Map()
		let supply_context = create_supply_context(game)

		if (source_reserve) {
			if (info.piece_class === "LCU") return []
			let full_sources = get_full_supply_sources_for_unit(game, p, true)
			let full_source_flag = build_space_flag_from_sources(full_sources)
			let candidates = new Set()
			for (let s of full_sources) {
				if (s > 0 && data.spaces[s]) candidates.add(s)
			}
			for (let q = 0; q < game.pieces.length; q++) {
				let q_space = game.pieces[q]
				if (q_space <= 0 || !data.spaces[q_space]) continue
				let q_info = data.pieces[q]
				if (!q_info || q_info.faction !== faction) continue
				if (!is_same_sr_nationality(info.nation, q_info.nation)) continue
				let q_status = get_supply_status(
					game,
					q_space,
					faction,
					q,
					false,
					supply_trace_cache,
					supply_context,
					source_cache,
					status_cache
				)
				if (!is_supply_status_in_supply(q_status) || q_status === "LIMITED") continue
				candidates.add(q_space)
			}
			let filtered = []
			for (let s of candidates) {
				if (is_reserve_space(s)) continue
				if (!is_controlled_by(game, s, faction) && !contains_friendly_pieces(game, s, faction)) continue
				let status = get_supply_status(
					game,
					s,
					faction,
					p,
					true,
					supply_trace_cache,
					supply_context,
					source_cache,
					status_cache
				)
				if (!is_supply_status_in_supply(status)) continue
				if (!can_enter_region(game, p, s)) continue
				if (!can_stack_end_in_space(game, s, [p])) continue
				if (full_source_flag[s] !== 1) {
					if (
						!has_same_nationality_supplied_unit_in_space(
							game,
							p,
							s,
							supply_trace_cache,
							supply_context,
							source_cache,
							status_cache
						)
					)
						continue
				}
				if (is_caspian_sea_port(s) && !can_sr_to_space(game, p, s, faction)) continue
				filtered.push(s)
			}
			return filtered
		}

		let source_status = get_supply_status(
			game,
			source,
			faction,
			p,
			true,
			supply_trace_cache,
			supply_context,
			source_cache,
			status_cache
		)

		if (info.piece_class !== "LCU" && source_status !== "LIMITED" && is_supply_status_in_supply(source_status)) {
			let reserve_id = get_faction_reserve_space_id(faction)
			if (reserve_id > 0 && data.spaces[reserve_id]) destinations.add(reserve_id)
		}

		if (can_sr_to_non_reserve_space_with_context(
			game,
			p,
			source,
			source,
			faction,
			supply_trace_cache,
			supply_context,
			source_cache,
			status_cache
		)) {
			destinations.add(source)
		}

		let reachable = build_sr_path_reachable_spaces(game, p, source, faction)
		for (let s of reachable) {
			if (can_sr_to_non_reserve_space_with_context(
				game,
				p,
				source,
				s,
				faction,
				supply_trace_cache,
				supply_context,
				source_cache,
				status_cache
			)) {
				destinations.add(s)
			}
		}

		if (info.piece_class !== "LCU" && info.symbol !== "H" && data.spaces[source].port) {
			for (let s = 1; s < data.spaces.length; s++) {
				if (!data.spaces[s] || !data.spaces[s].port) continue
				if (!has_sr_sea_port_route(game, p, source, s, faction)) continue
				if (can_sr_to_non_reserve_space_with_context(
					game,
					p,
					source,
					s,
					faction,
					supply_trace_cache,
					supply_context,
					source_cache,
					status_cache
				)) {
					destinations.add(s)
				}
			}
		}

		return [...destinations]
	}

	function can_sr_piece(game, p, faction) {
		let info = data.pieces[p]
		if (!info) return false
		if (info.faction !== faction) return false
		if (is_greek_piece(p) && !can_move_piece_for_faction(game, p, faction)) return false
		if (info.mf === 0) return false
		if (info.type === "irregular" || info.type === "tribe" || is_hq(p)) return false
		if (set_has(game.sr_moved || [], p)) return false
		let s = game.pieces[p]
		if (s === RESERVE) {
			// SCUs can SR from reserve, LCUs cannot
			return info.piece_class !== "LCU"
		}
		if (s <= 0 || !data.spaces[s]) return false
		let nations = get_piece_nations_for_rule(game, p)
		if (nations.length === 0) return false
		if (!nations.some((nation) => nation !== "bu" || can_trace_supply_to_sofia(game, p))) return false
		if (is_reserve_space(s)) {
			return info.piece_class !== "LCU"
		}
		let status = get_supply_status(game, s, faction, p, true)
		if (!is_supply_status_in_supply(status)) return false
		return status !== "LIMITED"
	}

	function can_sr_to_space(game, p, s, faction) {
		let source = game.pieces[p]
		if (!is_reserve_space(source) && (source <= 0 || !data.spaces[source])) return false
		if (s <= 0 || !data.spaces[s]) return false
		if (set_has(game.sr_moved || [], p)) return false
		let info = data.pieces[p]
		let source_reserve = is_reserve_space(source)
		let dest_reserve = is_reserve_space(s)

		if (source_reserve && dest_reserve) return false
		if (source_reserve) return can_sr_from_reserve_to_space(game, p, s, faction)

		if (dest_reserve) {
			if (info.piece_class === "LCU") return false
			let reserve_name = get_faction_reserve_name(faction)
			if (data.spaces[s].name !== reserve_name) return false

			let source_status = get_supply_status(game, source, faction, p, true)
			if (!is_supply_status_in_supply(source_status)) return false
			return source_status !== "LIMITED"
		}

		if (game.control[s] !== faction && !contains_friendly_pieces(game, s, faction)) return false

		// Rule 19.2.3: AP units may not end a move in a space with Greek units while neutral.
		if (faction === AP && is_greece_neutral(game) && has_greek_units_in_space(game, s)) return false

		let dest_status = get_supply_status(game, s, faction, p, true)
		if (!is_supply_status_in_supply(dest_status)) return false
		if (!can_enter_region(game, p, s)) return false
		if (!can_stack_end_in_space(game, s, [p])) return false

		let rail_only = info.piece_class === "LCU"
		if (has_sr_path(game, p, source, s, faction, rail_only)) return true

		let sea_sr = source !== s && !!data.spaces[source].port && !!data.spaces[s].port
		if (!sea_sr) return false
		if (is_sr_destination_blocked_by_events(game, source, s, faction)) return false
		if (info.piece_class === "LCU") return false
		if (info.symbol === "H") return false

		// Rule 11.5: Caspian Sea transport restrictions.
		let source_caspian = is_caspian_sea_port(source)
		let dest_caspian = is_caspian_sea_port(s)
		if (source_caspian || dest_caspian) {
			if (!source_caspian || !dest_caspian) return false
		}

		return true
	}

	function contains_friendly_pieces(game, s, faction) {
		let pieces = get_pieces_in_space(game, s)
		return pieces.some((p) => data.pieces[p].faction === faction)
	}

	function find_space_by_name(name) {
		for (let s = 0; s < data.spaces.length; s++) {
			if (data.spaces[s] && data.spaces[s].name === name) return s
		}
		return -1
	}

	function can_trace_supply_to_sofia(game, p) {
		let sofia = find_space_by_name("SOFIA")
		if (sofia < 0) return false
		if (!is_controlled_by(game, sofia, CP)) return false
		if (is_besieged(game, sofia)) return false
		let s = game.pieces[p]
		if (s <= 0) return false
		return can_trace_supply_to_source(game, s, data.pieces[p].faction, sofia)
	}

	// --- SUPPLY ---

	const DESERT = "desert"

	// Internal helper for accessing other modules via the injected Engine

	// Helpers

	function is_disrupting_piece(p) {
		let info = data.pieces[p]
		return info.type === "irregular" || info.type === "tribe" || info.nation === "Re"
	}

	function create_supply_context(game) {
		let space_count = data.spaces.length
		let friendly = {
			[AP]: new Uint8Array(space_count),
			[CP]: new Uint8Array(space_count)
		}
		let enemy = {
			[AP]: new Uint8Array(space_count),
			[CP]: new Uint8Array(space_count)
		}
		let enemy_regular = {
			[AP]: new Uint8Array(space_count),
			[CP]: new Uint8Array(space_count)
		}
		let disrupted = {
			[AP]: new Uint8Array(space_count),
			[CP]: new Uint8Array(space_count)
		}
		let non_tribe = {
			[AP]: new Uint8Array(space_count),
			[CP]: new Uint8Array(space_count)
		}
		let besieged = new Array(space_count)

		for (let p = 0; p < game.pieces.length; p++) {
			let s = game.pieces[p]
			if (s <= 0 || s >= space_count || !data.spaces[s]) continue
			let ef = get_piece_effective_faction(game, p)
			if (ef !== AP && ef !== CP) continue

			friendly[ef][s] = 1
			if (!is_tribe(p)) non_tribe[ef][s] = 1

			let opp = ef === AP ? CP : AP
			enemy[opp][s] = 1

			if ((is_lcu(p) || is_scu(p)) && data.pieces[p].type === "regular") {
				enemy_regular[opp][s] = 1
			}
			if (is_disrupting_piece(p)) {
				disrupted[opp][s] = 1
			}
		}

		return {
			friendly,
			enemy,
			enemy_regular,
			disrupted,
			non_tribe,
			besieged
		}
	}

	function is_besieged_with_context(game, s, supply_context) {
		if (!supply_context) return is_besieged(game, s)
		let memo = supply_context.besieged
		if (memo[s] !== undefined) return memo[s]
		if (game.special_besieged && set_has(game.special_besieged, s)) {
			memo[s] = true
			return true
		}
		if (!data.spaces[s].fort) {
			memo[s] = false
			return false
		}
		if (game.forts && game.forts.destroyed && set_has(game.forts.destroyed, s)) {
			memo[s] = false
			return false
		}
		let fort_owner = data.spaces[s].faction
		if (game.control[s]) fort_owner = game.control[s]
		if (fort_owner === AP) {
			memo[s] = supply_context.non_tribe[CP][s] === 1
			return memo[s]
		}
		if (fort_owner === CP) {
			memo[s] = supply_context.non_tribe[AP][s] === 1
			return memo[s]
		}
		memo[s] = is_besieged(game, s)
		return memo[s]
	}

	function build_space_flag_from_sources(sources) {
		let flag = new Uint8Array(data.spaces.length)
		for (let s of sources) flag[s] = 1
		return flag
	}

	function is_disrupted(game, s, faction) {
		let enemy = faction === AP ? CP : AP
		for (let p = 0; p < game.pieces.length; p++) {
			if (game.pieces[p] === s && get_piece_effective_faction(game, p) === enemy) {
				if (is_disrupting_piece(p)) return true
			}
		}
		// Also check for uprising markers if they are not pieces (but in this project they seem to be pieces)
		return false
	}

	function contains_enemy_regular_pieces_for_faction(game, s, faction) {
		let enemy = faction === AP ? CP : AP
		for (let p = 0; p < game.pieces.length; p++) {
			if (game.pieces[p] === s && get_piece_effective_faction(game, p) === enemy) {
				if (is_lcu(p) || is_scu(p)) {
					// Rule 10.2 & 14.1.7: Only Regular Combat Units block supply
					let info = data.pieces[p]
					if (info.type === "regular") return true
				}
			}
		}
		return false
	}
	function is_besieged(game, s) {
		if (game.special_besieged && set_has(game.special_besieged, s)) return true
		if (!data.spaces[s].fort) return false
		if (game.forts && game.forts.destroyed && set_has(game.forts.destroyed, s)) return false

		// Check if it contains enemy units of the fort owner
		let fort_owner = data.spaces[s].faction
		if (game.control[s]) fort_owner = game.control[s]

		// Check enemy presence
		// Must have at least one valid besieging unit (Regular or Irregular, but NOT Tribe)
		for (let p = 0; p < game.pieces.length; p++) {
			if (game.pieces[p] === s) {
				if (get_piece_effective_faction(game, p) !== fort_owner) {
					// Found an enemy unit. Check if it is a valid besieger.
					if (!is_tribe(p)) return true
				}
			}
		}
		return false
	}

	function get_beachhead_spaces(game, faction) {
		if (faction !== AP) return []
		return game.beachheads || []
	}

	function is_connected_by_rail(game, start, faction, sources, supply_context = null) {
		let source_flag = build_space_flag_from_sources(sources || [])
		let queue = [start]
		let queue_head = 0
		let visited = new Set([start])

		while (queue_head < queue.length) {
			let current = queue[queue_head++]

			if (source_flag[current] === 1) return true
			if (is_base_supply_source(game, current, faction)) return true

			let neighbors = get_rail_connections(game, current, faction)

			for (let next of neighbors) {
				if (visited.has(next)) continue

				let blocked_by_enemy = supply_context
					? supply_context.enemy[faction][next] === 1
					: contains_enemy_pieces(game, next, faction)
				if (blocked_by_enemy && !is_besieged_with_context(game, next, supply_context)) continue
				if (!is_controlled_by(game, next, faction)) continue

				visited.add(next)
				queue.push(next)
			}
		}
		return false
	}

	function get_supplied_spaces(game, sources, faction, p, supply_context = null) {
		// BFS to find all supplied spaces
		let full_supplied = new Set()
		let disrupted_supplied = new Set()
		let queue = []
		let queue_head = 0
		let nation = p !== -1 ? data.pieces[p].nation : undefined
		let context = supply_context || create_supply_context(game)

		// Add all sources
		for (let s of sources) {
			if (is_controlled_by(game, s, faction)) {
				full_supplied.add(s)
				queue.push({ s, disrupted: false })
			}
		}

		while (queue_head < queue.length) {
			let { s: current, disrupted: current_disrupted } = queue[queue_head++]
			let neighbors = get_connected_spaces(game, current, nation, faction, p, "supply")

			for (let next of neighbors) {
				// Blocked by enemy regular units (unless besieged)
				if (context.enemy_regular[faction][next] === 1 && !is_besieged_with_context(game, next, context)) continue

				// Neutral spaces block supply unless they are Greece for AP
				if (data.spaces[next].faction === "neutral" && !is_neutral_greece_supply_passable(game, next, faction))
					continue

				// Rule 14.1.3: Enemy Full Control blocks supply.
				// Partial Control (irregular units/tribes) does not.
				// If enemy controlled and has no pieces, it's Full Control.
				let is_friendly = is_controlled_by(game, next, faction)
				let is_besieged_enemy = is_besieged_with_context(game, next, context)
				let has_friendly_pieces = context.friendly[faction][next] === 1
				let is_disrupted_by_enemy = context.disrupted[faction][next] === 1

				// Rule 14.1.3: Friendly besieged Fort blocks supply trace.
				if (is_friendly && is_besieged_enemy) continue

				// Supply trace pass if: friendly controlled OR contains friendly pieces OR is disrupted (partial control) OR besieged fort
				// Note: "friendly pieces" includes irregulars which provide partial control.
				if (!is_friendly && !is_besieged_enemy && !has_friendly_pieces && !is_disrupted_by_enemy) continue

				let next_disrupted = current_disrupted || is_disrupted_by_enemy

				if (next_disrupted) {
					if (full_supplied.has(next) || disrupted_supplied.has(next)) continue
					disrupted_supplied.add(next)
					queue.push({ s: next, disrupted: true })
				} else {
					if (full_supplied.has(next)) continue
					full_supplied.add(next)
					queue.push({ s: next, disrupted: false })
					// If this was already marked as disrupted, it's now full
					disrupted_supplied.delete(next)
				}
			}
		}
		return { full: full_supplied, disrupted: disrupted_supplied }
	}


	function needs_piece_specific_supply_trace(p) {
		if (p === -1 || p === undefined || p === null) return false
		if (is_tribe(p)) return true
		let name = data.pieces[p] && data.pieces[p].name
		return !!(name && name.startsWith("CAsia Uprising"))
	}

	function get_supplied_spaces_cached(game, cache, sources, faction, p, supply_context = null) {
		if (!cache) return get_supplied_spaces(game, sources, faction, p, supply_context)
		let key = `${faction}|${p}|${sources.join(",")}`
		if (!cache.has(key)) {
			cache.set(key, get_supplied_spaces(game, sources, faction, p, supply_context))
		}
		return cache.get(key)
	}

	let supply_space_ids_cache = null
	// 仅允许“真实地图空间”进入补给计算/显示：
	// 排除 Reserve/Eliminated Box、reinforcement 槽位、UI 坐标点、Unknown 占位点。
	function is_supply_eligible_space(s) {
		let info = data.spaces[s]
		if (!info || s <= 0) return false
		if (info.name === "Unknown") return false
		if (info.type === "reinforcement" || info.type === "ui") return false
		if (info.map === "Reserve Box") return false
		return true
	}

	function get_supply_eligible_space_ids() {
		if (supply_space_ids_cache) return supply_space_ids_cache
		let list = []
		for (let s = 1; s < data.spaces.length; s++) {
			if (is_supply_eligible_space(s)) list.push(s)
		}
		supply_space_ids_cache = list
		return list
	}

// --- Supply Source Helpers ---

	function is_base_supply_source(game, s, faction, nation = null, for_placement_or_sr = false) {
		const { AP, CP } = Engine.constants
		let info = data.spaces[s]
		if (!info) return false
		let name = info.name
		let region = info.region

		if (faction === CP) {
			// ... (保持 CP 逻辑不变)
			if (nation) {
				if (nation === "bu" && name !== "SOFIA") {
					return !!(name === "SOFIA" && game.events && game.events["bulgaria"]);
				}
			}

			if (["Galicia", "SOFIA", "CONSTANTINOPLE", "Kayseri", "Erzincan", "Damascus", "Baghdad"].includes(name)) {
				if (name === "SOFIA") return !!(game.events && game.events["bulgaria"])
				return true
			}

			if (["Medina", "Mecca", "Maan", "Central Asia", "Afghanistan"].includes(name)) {
				return true
			}

			if (info.port && is_controlled_by(game, s, CP)) {
				let blockade = !!(game.events && game.events["royal_navy_blockade"])
				if (!blockade) return true
				if (is_black_sea_port(game, s) || is_caspian_sea_port(game, s)) return true
			}
		}

		if (faction === AP) {
			const CYPRUS = 183
			if (s === CYPRUS && !(game.events && game.events["egyptian_coup"])) return false

			// Russian Supply Sources (14.2.2) (RU)
			if (!nation || nation === "ru" || nation === "ro" || nation === "sb") {
				if (["Odessa", "TIFLIS", "Central Asia", "Petrovsk"].includes(name)) return true
				if (name === "Trabzon" && game.vps && game.vps[s] === "ru") return true
				// Black Sea and Caspian Sea ports are always supply sources for RU (14.1.4)
				if (is_black_sea_port(game, s) || is_caspian_sea_port(game, s)) {
					if (is_controlled_by(game, s, AP)) return true
				}
			}

			// British Supply Sources (14.2.3) (BR)
			if (!nation || ["br", "fr", "it", "in", "anz", "sb", "gr"].includes(nation)) {
				if (region === "Sudan and Darfur" || region === "India" || name === "Bahrain") return true
				// Island Bases (Lemnos, Cyprus)
				if (is_island_base(game, s) && is_controlled_by(game, s, AP)) {
					// Rule 13.3.2: German Subs in the Med blocks island bases from providing supply ONLY for Reinforcement/SR
					return !(for_placement_or_sr && Engine.events.is_german_subs_blocked_port(game, s));
				}
			}

			// Port Supply Sources (14.1.4)
			if (info.port && is_controlled_by(game, s, AP)) {
				// Rule 13.3.2: German Subs in the Med blocks ports from providing supply ONLY for Reinforcement/SR
				if (for_placement_or_sr && Engine.events.is_german_subs_blocked_port(game, s)) return false

				if (is_mediterranean_port(s) || is_persian_gulf_port(s)) {
					return true
				}
			}

			// Special: Arab Northern Army (14.2.7)
			if (nation === "ar" && region === "Hejaz") return true

			// Special: Greece (14.2.6)
			if (info.nation === "gr") {
				if (Engine.greece.is_greece_neutral(game) || Engine.greece.is_greek_controlled_by_faction(game, AP)) {
					if (info.name === "Salonika") return true
					if (nation === "gr") return true
				}
			}
		}

		return false
	}

	function is_mediterranean_port(s) {
		return is_aegean_east_med_port(s)
	}

	function is_persian_gulf_port(s) {
		if (!data.spaces[s] || !data.spaces[s].port) return false
		let name = data.spaces[s].name
		return ["Fao", "Abadan", "Kuwait", "Bahrain"].includes(name)
	}

	function get_supply_sources_from_data(game, faction, for_placement_or_sr = false) {
		let list = []
		for (let s of get_supply_eligible_space_ids()) {
			if (is_base_supply_source(game, s, faction, null, for_placement_or_sr)) {
				list.push(s)
			}
		}
		// Rule 14.1.4: Tracing Supply through Constantinople (Bosphorus/Dardanelles check)
		// This is a trace check, not a "base source" check.
		// But if Constantinople is a source, it's already added.
		return list
	}

	function get_supply_sources_from_data_cached(game, faction, for_placement_or_sr, source_cache) {
		if (!source_cache) return get_supply_sources_from_data(game, faction, for_placement_or_sr)
		let key = `all|${faction}|${for_placement_or_sr ? 1 : 0}`
		if (!source_cache.has(key)) {
			source_cache.set(key, get_supply_sources_from_data(game, faction, for_placement_or_sr))
		}
		return source_cache.get(key)
	}

	function get_ru_supply_sources(game, for_placement_or_sr = false) {
		let ru_sources = []
		for (let s of get_supply_eligible_space_ids()) {
			if (is_base_supply_source(game, s, AP, "ru", for_placement_or_sr)) {
				ru_sources.push(s)
			}
		}
		return ru_sources
	}

	function get_ru_supply_sources_cached(game, for_placement_or_sr, source_cache) {
		if (!source_cache) return get_ru_supply_sources(game, for_placement_or_sr)
		let key = `ru|${for_placement_or_sr ? 1 : 0}`
		if (!source_cache.has(key)) {
			source_cache.set(key, get_ru_supply_sources(game, for_placement_or_sr))
		}
		return source_cache.get(key)
	}

	function get_bu_supply_sources(game, for_placement_or_sr = false) {
		let bu_sources = []
		for (let s of get_supply_eligible_space_ids()) {
			if (is_base_supply_source(game, s, CP, "bu", for_placement_or_sr)) {
				bu_sources.push(s)
			}
		}
		return bu_sources
	}

	function get_gr_supply_sources(game, for_placement_or_sr = false) {
		let gr_sources = []
		for (let s of get_supply_eligible_space_ids()) {
			if (is_base_supply_source(game, s, AP, "gr", for_placement_or_sr)) {
				gr_sources.push(s)
			}
		}
		return gr_sources
	}

	function get_gr_supply_sources_cached(game, for_placement_or_sr, source_cache) {
		if (!source_cache) return get_gr_supply_sources(game, for_placement_or_sr)
		let key = `gr|${for_placement_or_sr ? 1 : 0}`
		if (!source_cache.has(key)) {
			source_cache.set(key, get_gr_supply_sources(game, for_placement_or_sr))
		}
		return source_cache.get(key)
	}

	function get_ap_supply_split_projection(game, supply_trace_cache = null, supply_context = null, source_cache = null) {
		let trace_cache = supply_trace_cache || new Map()
		let context = supply_context || create_supply_context(game)
		let src_cache = source_cache || new Map()
		let ap_sources = get_supply_sources_from_data_cached(game, AP, false, src_cache).concat(get_beachhead_spaces(game, AP))
		let ru_sources = get_ru_supply_sources_cached(game, false, src_cache)
		let gr_sources = get_gr_supply_sources_cached(game, false, src_cache)
		let eastern_sources = ru_sources.concat(gr_sources)
		let ru_source_flag = build_space_flag_from_sources(ru_sources)
		let western_sources = ap_sources.filter((s) => ru_source_flag[s] !== 1)
		let eastern_supply = get_supplied_spaces_cached(game, trace_cache, eastern_sources, AP, -1, context)
		let western_supply = get_supplied_spaces_cached(game, trace_cache, western_sources, AP, -1, context)
		let western = []
		let eastern = []
		for (let s of get_supply_eligible_space_ids()) {
			western[s] = western_supply.full.has(s) ? 1 : 0
			eastern[s] = eastern_supply.full.has(s) ? 1 : 0
		}
		return { western, eastern }
	}

	function can_trace_supply_to_ap_port(game, start, faction, for_placement_or_sr = false) {
		if (start <= 0) return false
		let ports = []
		for (let s of get_supply_eligible_space_ids()) {
			if (data.spaces[s].port && is_controlled_by(game, s, AP)) {
				if (for_placement_or_sr && Engine.events.is_german_subs_blocked_port(game, s)) continue
				ports.push(s)
			}
		}
		return can_trace_supply_to_source(game, start, faction, ports)
	}

	function check_supply_for_faction(
		game,
		faction,
		supply_trace_cache = null,
		supply_context = null,
		source_cache = null,
		status_cache = null
	) {
		let sources = get_supply_sources_from_data_cached(game, faction, false, source_cache)

		// Add Beachheads
		let beachheads = get_beachhead_spaces(game, faction)
		sources = sources.concat(beachheads)

		// Pre-calculate supply for non-tribes
		for (let p = 0; p < game.pieces.length; p++) {
			if (game.pieces[p] <= 0) continue // Off map or eliminated
			if (data.pieces[p].faction !== faction) continue
			if (is_in_reserve(game, p)) continue // Units in reserve do not need supply

			let s = game.pieces[p]

			// Rule 14.2.10: Tribes are permanently supplied within their Movement Range (17.1.4)
			if (is_tribe(p)) {
				let tribe_type = get_tribe_type(p)
				let is_in_range = false
				if (data.spaces[s].tribal_activity_grid === tribe_type) {
					is_in_range = true
				} else {
					// Check if adjacent to any space in its activity grid
					// Use get_connected_spaces with mode="move" to respect Caspian green line restrictions (Rule 17.1.4)
					let conns = get_connected_spaces(game, s, data.pieces[p].nation, faction, p, "move")
					for (let next of conns) {
						if (data.spaces[next].tribal_activity_grid === tribe_type) {
							is_in_range = true
							break
						}
					}
				}

				if (is_in_range) {
					set_delete(game.oos, p)
					set_delete(game.disrupted_supply, p)
					continue
				}
				// If not in range, trace normal supply for tribe
				let supply_info = get_supplied_spaces_cached(game, supply_trace_cache, sources, faction, p, supply_context)
				if (supply_info.full.has(s)) {
					set_delete(game.oos, p)
					set_delete(game.disrupted_supply, p)
				} else if (supply_info.disrupted.has(s)) {
					set_delete(game.oos, p)
					set_add(game.disrupted_supply, p)
				} else {
					set_add(game.oos, p)
					set_delete(game.disrupted_supply, p)
				}
				continue
			}

			let status = get_supply_status(
				game,
				s,
				faction,
				p,
				false,
				supply_trace_cache,
				supply_context,
				source_cache,
				status_cache
			)
			if (status === "OOS") {
				set_add(game.oos, p)
				set_delete(game.disrupted_supply, p)
			} else if (status === "DISRUPTED") {
				set_delete(game.oos, p)
				set_add(game.disrupted_supply, p)
			} else {
				set_delete(game.oos, p)
				set_delete(game.disrupted_supply, p)
			}
		}
	}

	function check_supply(game) {
		game.oos = []
		game.oos_spaces = []
		game.disrupted_supply = []
		let supply_trace_cache = new Map()
		let source_cache = new Map()
		let status_cache = new Map()
		let supply_context = create_supply_context(game)
		check_supply_for_faction(game, AP, supply_trace_cache, supply_context, source_cache, status_cache)
		check_supply_for_faction(game, CP, supply_trace_cache, supply_context, source_cache, status_cache)
		let ap_sources = get_supply_sources_from_data_cached(game, AP, false, source_cache).concat(get_beachhead_spaces(game, AP))
		let cp_sources = get_supply_sources_from_data_cached(game, CP, false, source_cache)
		let ap_supply = get_supplied_spaces_cached(game, supply_trace_cache, ap_sources, AP, -1, supply_context)
		let cp_supply = get_supplied_spaces_cached(game, supply_trace_cache, cp_sources, CP, -1, supply_context)

		// Rule 14.2.10: Cyprus is always in supply if no Egyptian Coup
		if (!(game.events && game.events["egyptian_coup"])) {
			for (let s of get_supply_eligible_space_ids()) {
				let info = data.spaces[s]
				if (info && (info.name === "Cyprus" || info.beach_for === "Cyprus")) {
					ap_supply.full.add(s)
					cp_supply.full.add(s)
				}
			}
		}

		let projection_ap = []
		let projection_cp = []
		game.supply_projection = { ap: projection_ap, cp: projection_cp }
		delete game.supply_projection_ap_split

		// Rule 14.3.3 & 15.4.6: Check all friendly controlled spaces for supply
		for (let s of get_supply_eligible_space_ids()) {
			let info = data.spaces[s]
			projection_ap[s] = ap_supply.full.has(s) ? 1 : 0
			projection_cp[s] = cp_supply.full.has(s) ? 1 : 0

			// Cyprus (Rule 14.2.10) is always in supply if no coup
			if (!(game.events && game.events["egyptian_coup"]) && (info.name === "Cyprus" || info.beach_for === "Cyprus")) {
				continue
			}

			let faction = game.control[s]
			if (faction === AP || faction === CP) {
				let supply_info = faction === AP ? ap_supply : cp_supply
				let status = "OOS"
				if (supply_info.full.has(s)) status = "FULL"
				else if (supply_info.disrupted.has(s)) status = "DISRUPTED"
				if (status === "OOS") {
					// Rule 15.4.6 Exception: Trench markers in an intact Fort space do not suffer attrition.
					let has_fort = has_undestroyed_fort(game, s, faction)
					if (!has_fort) {
						if (
							(game.trenches && set_has(game.trenches, s)) ||
							(game.trenches_2 && set_has(game.trenches_2, s))
						) {
							Engine.game_utils.remove_trench(game, s)
						}
					}
					// Rule 14.3.3: Space becomes enemy controlled during attrition phase
					// We mark it here, and start_attrition_phase will handle the actual control change
					set_add(game.oos_spaces, s)
				}
			}
		}
	}

	function get_supply_status(
		game,
		space,
		faction,
		p = -1,
		for_placement_or_sr = false,
		supply_trace_cache = null,
		supply_context = null,
		source_cache = null,
		status_cache = null
	) {
		let cache_key = null
		if (status_cache) {
			cache_key = `${space}|${faction}|${p}|${for_placement_or_sr ? 1 : 0}`
			if (status_cache.has(cache_key)) return status_cache.get(cache_key)
		}
		function cache_result(result) {
			if (status_cache) status_cache.set(cache_key, result)
			return result
		}
		if (space < 1 || space >= data.spaces.length || !data.spaces[space]) {
			return cache_result("OOS")
		}
		if (p !== -1 && is_in_reserve(game, p)) return cache_result("FULL")
		let nation = p !== -1 ? data.pieces[p].nation : null

		// 1. Special "Always in Supply" rules (Rule 14.2.5 - 14.2.11, Rule 16.1.5)
		let info = data.spaces[space]
		// Rule 14.2.10: Cyprus is always in supply if no Egyptian Coup
		if (
			!(game.events && game.events["egyptian_coup"]) &&
			(info.name === "Cyprus" || info.beach_for === "Cyprus")
		) {
			return cache_result("FULL")
		}

		if (p !== -1) {
			let name = data.pieces[p].name

			if (name === "GE GeoProtect") return cache_result("FULL")

			// Rule 16.1.5: HQs are never out of supply
			if (is_hq(p)) return cache_result("FULL")

			// Event-spawned rebels/uprisings
			if (name.startsWith("Egypt Rebel")) {
				let region = get_region(space)
				if (
					region === "Sudan and Darfur" ||
					data.spaces[space].name === "Khartoum" ||
					[
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
						"Bahariya Oasis"
					].includes(data.spaces[space].name)
				) {
					return cache_result("FULL")
				}
			} else if (name.startsWith("Afghan Uprising")) {
				if (is_afghanistan(space) || data.spaces[space].name === "Afghanistan") return cache_result("FULL")
			} else if (name.startsWith("Indian Mutiny")) {
				if (is_india(space) || data.spaces[space].name === "INDIA") return cache_result("FULL")
			} else if (name.startsWith("CAsia Uprising")) {
				if (is_central_asia(space) || data.spaces[space].name === "Central Asia") return cache_result("FULL")
			}

			// National "Home" supply rules
			if (nation === "sb") {
				if (data.spaces[space].nation === "sb") return cache_result("FULL")
			} else if (nation === "gr" || (faction === AP && Engine.greece.is_greece_neutral(game))) {
				if (data.spaces[space].nation === "gr") return cache_result("FULL")
			} else if (nation === "pe") {
				if (is_persia(space) || is_azerbaijan(space) || is_arabistan(space)) return cache_result("FULL")
			} else if (nation === "geo" || nation === "arm") {
				if (is_caucasus(space) || is_georgia(space)) return cache_result("FULL")
			} else if (nation === "ar") {
				if (is_hejaz(space)) return cache_result("FULL")
			}
		}

		// 2. Rule 14.1.6: Desert Rule (LCU in Desert must be connected via Rail to a Supply Source)
		if (p !== -1 && is_lcu(p) && data.spaces[space].terrain === DESERT) {
			// ANZ Desert Corps (Rule 14.2.11) exception: always in supply in Desert
			if (data.pieces[p].name && data.pieces[p].name.includes("ANZ Desert Corps")) return cache_result("FULL")
			if (is_rail_connected_to_supply(game, space, faction)) return cache_result("FULL")
			return cache_result("OOS")
		}

		// 3. Regular Supply Trace
		// Use nation-specific sources if a piece is provided, otherwise use all faction sources
		let sources
		if (p !== -1) {
			sources = get_full_supply_sources_for_unit(game, p, for_placement_or_sr, source_cache)
		} else {
			sources = get_supply_sources_from_data_cached(game, faction, for_placement_or_sr, source_cache)
			if (faction === AP) {
				sources = sources.concat(get_beachhead_spaces(game, faction))
			}
		}

		let trace_piece = needs_piece_specific_supply_trace(p) ? p : -1
		let supply_info = get_supplied_spaces_cached(game, supply_trace_cache, sources, faction, trace_piece, supply_context)
		if (supply_info.full.has(space)) return cache_result("FULL")
		if (supply_info.disrupted.has(space)) return cache_result("DISRUPTED")

		// 4. Limited Supply Check (Rule 14.2.8 / 14.2.2 / 14.2.3)
		// If not in Full Supply, check if it can trace supply to ANY base source of the faction
		if (p !== -1) {
			let all_faction_sources = get_supply_sources_from_data_cached(game, faction, for_placement_or_sr, source_cache)
			if (faction === AP) all_faction_sources = all_faction_sources.concat(get_beachhead_spaces(game, faction))

			let limited_info = get_supplied_spaces_cached(
				game,
				supply_trace_cache,
				all_faction_sources,
				faction,
				trace_piece,
				supply_context
			)
			if (limited_info.full.has(space)) return cache_result("LIMITED")
			if (limited_info.disrupted.has(space)) return cache_result("DISRUPTED")
		}

		return cache_result("OOS")
	}

	function is_in_supply(game, space, faction, p = -1, for_placement_or_sr = false) {
		let status = get_supply_status(game, space, faction, p, for_placement_or_sr)
		return status === "FULL" || status === "DISRUPTED" || status === "LIMITED"
	}

	function get_full_supply_sources_for_unit(game, p, for_placement_or_sr = false, source_cache = null) {
		let info = data.pieces[p]
		let faction = info.faction
		let nation = info.nation
		let allow_ap_beachhead =
			faction === AP &&
			(!["ru", "ro"].includes(nation) ||
				(info.name && (info.name.includes("2/4 Special") || info.name.includes("Yugo"))))

		let cache_key =
			source_cache && `full|${faction}|${nation}|${for_placement_or_sr ? 1 : 0}|${allow_ap_beachhead ? 1 : 0}`
		if (source_cache && source_cache.has(cache_key)) return source_cache.get(cache_key)
		let full_sources = []

		// Use the base supply source logic with nation context
		for (let s of get_supply_eligible_space_ids()) {
			if (is_base_supply_source(game, s, faction, nation, for_placement_or_sr)) {
				let name = data.spaces[s].name

				// Rule 14.2.1: CP Limited Supply Sources are NOT Full Supply Sources
				// Rule 19.7.3: Afghanistan is Full Source only if allied and CP-controlled
				if (faction === CP) {
					if (["Medina", "Mecca", "Maan", "Central Asia", "Afghanistan"].includes(name)) {
						if (name === "Afghanistan") {
							if (!(game.events && game.events["afghanistan_allied"] && is_controlled_by(game, s, CP))) {
								continue
							}
						} else {
							continue
						}
					}
				}

				// Rule 14.2.2/14.2.3: AP Full Supply Sources depend on nation (handled by is_base_supply_source)
				// But we must ensure that "Limited" sources (like ports for some) are correctly excluded if needed.
				// For AP, usually all base sources for that nation are Full.

				full_sources.push(s)
			}
		}

		// Rule 14.1.4: Beachheads are always Full Supply Sources for AP (except RU/RO)
		let beachheads = get_beachhead_spaces(game, faction)
		if (faction === AP && !["ru", "ro"].includes(nation)) {
			full_sources = full_sources.concat(beachheads)
		} else if (faction === AP && info.name && (info.name.includes("2/4 Special") || info.name.includes("Yugo"))) {
			// Special RU units that can use AP beachheads
			full_sources = full_sources.concat(beachheads)
		}

		if (source_cache) source_cache.set(cache_key, full_sources)
		return full_sources
	}

	function is_in_limited_supply(game, p) {
		let status = get_supply_status(game, game.pieces[p], data.pieces[p].faction, p)
		return status === "LIMITED"
	}

	function can_trace_supply_to_source(game, start, faction, source, supply_context = null) {
		let context = supply_context || create_supply_context(game)
		let sources = Array.isArray(source) ? source : [source]
		let source_flag = build_space_flag_from_sources(sources)
		if (source_flag[start] === 1) return is_controlled_by(game, start, faction)
		let visited = new Set([start])
		let queue = [start]
		let queue_head = 0
		while (queue_head < queue.length) {
			let current = queue[queue_head++]
			let neighbors = get_connected_spaces(game, current, undefined, faction, undefined, "supply")
			for (let next of neighbors) {
				if (visited.has(next)) continue

				// Blocked by enemy regular units (unless besieged)
				if (context.enemy_regular[faction][next] === 1 && !is_besieged_with_context(game, next, context)) continue

				// Neutral spaces block supply unless they are Greece for AP
				if (data.spaces[next].faction === "neutral" && !is_neutral_greece_supply_passable(game, next, faction))
					continue

				let is_friendly = is_controlled_by(game, next, faction)
				let is_besieged_enemy = is_besieged_with_context(game, next, context)
				let has_friendly_pieces = context.friendly[faction][next] === 1
				let is_disrupted_by_enemy = context.disrupted[faction][next] === 1

				// Supply trace pass if: friendly controlled OR contains friendly pieces OR is disrupted (partial control) OR besieged fort
				if (!is_friendly && !is_besieged_enemy && !has_friendly_pieces && !is_disrupted_by_enemy) continue

				if (source_flag[next] === 1) return true
				visited.add(next)
				queue.push(next)
			}
		}
		return false
	}

	function is_rail_connected_to_supply(game, s, faction) {
		let sources = get_supply_sources_from_data(game, faction)
		if (faction === AP) {
			sources = sources.concat(game.beachheads || [])
		}
		return is_connected_by_rail(game, s, faction, sources, create_supply_context(game))
	}

	function check_rule_violations(game) {
		let violations = []
		let pieces_by_space = new Array(data.spaces.length).fill(0).map(() => [])
		for (let p = 0; p < game.pieces.length; p++) {
			let s = game.pieces[p]
			if (s >= 0 && s < data.spaces.length) pieces_by_space[s].push(p)
		}

		// 1. General Stacking Limit (Rule 8.1.1: max 3 counted pieces)
		for (let s = 1; s < data.spaces.length; s++) {
			if (is_unlimited_stack_space(game, s)) continue
			let pieces = pieces_by_space[s]
			let count = get_stack_count(pieces)
			if (count > 3) {
				violations.push({ space: s, rule: "Rule 8.1.1: More than 3 counted combat units in space" })
			}

			let hqs = get_stack_hq_count(pieces)
			if (hqs > 1) violations.push({ space: s, rule: "Rule 8.1.3: Multiple HQs in space" })

			// Rule 8.2.2: No BR/RU mix
			if (has_br_ru_mix(game, pieces)) {
				violations.push({ space: s, rule: "Rule 8.2.2: British and Russian units cannot stack" })
			}
		}

		for (let s = 1; s < data.spaces.length; s++) {
			let fort_owner = null
			if (has_undestroyed_fort(game, s, AP)) fort_owner = AP
			else if (has_undestroyed_fort(game, s, CP)) fort_owner = CP
			if (!fort_owner) continue

			let besiegers = pieces_by_space[s].filter((p) => get_piece_effective_faction(game, p) !== fort_owner)
			if (besiegers.length > 0 && !can_besiege(game, s, besiegers)) {
				violations.push({ space: s, rule: "Rule 15.2.1: Insufficient strength to besiege fort" })
			}
		}

		// 2. Rule 9.8: Restricted Area LCU limits
		const restricted_areas = ["mesopotamia", "persia", "syria_palestine", "afghanistan", "central_asia"]
		for (let area of restricted_areas) {
			let ap_lcus = count_lcu_in_area(game, area, constants.AP)
			let cp_lcus = count_lcu_in_area(game, area, constants.CP)

			let ap_limit = get_lcu_limit_for(game, constants.AP)
			let cp_limit = get_lcu_limit_for(game, constants.CP)

			if (ap_lcus > ap_limit) {
				for (let s = 1; s < data.spaces.length; s++) {
					if (get_area(s) === area) {
						let pieces = pieces_by_space[s]
						if (pieces.some((p) => data.pieces[p].faction === constants.AP && is_lcu(p))) {
							violations.push({
								space: s,
								rule: `Rule 9.8: LCU Limit Exceeded in ${area} (AP: ${ap_lcus}/${ap_limit})`
							})
						}
					}
				}
			}
			if (cp_lcus > cp_limit) {
				for (let s = 1; s < data.spaces.length; s++) {
					if (get_area(s) === area) {
						let pieces = pieces_by_space[s]
						if (pieces.some((p) => data.pieces[p].faction === constants.CP && is_lcu(p))) {
							violations.push({
								space: s,
								rule: `Rule 9.8: LCU Limit Exceeded in ${area} (CP: ${cp_lcus}/${cp_limit})`
							})
						}
					}
				}
			}
		}

		// 3. Rule 180: Desert LCU entry restriction
		// 4. Rule 197: Turkish/Bulgarian LCU cannot enter swamp
		for (let s = 1; s < data.spaces.length; s++) {
			let pieces = pieces_by_space[s]
			for (let p of pieces) {
				if (is_lcu(p)) {
					// Rule 180: Desert LCU must have rail supply
					if (data.spaces[s].terrain === "desert") {
						let faction = data.pieces[p].faction
						let sources = get_supply_sources_from_data(game, faction)
						if (!is_connected_by_rail(game, s, faction, sources)) {
							violations.push({
								space: s,
								rule: "Rule 180: Desert LCU must have rail connection to supply source"
							})
						}
					}
					// Rule 197: Turkish/Bulgarian LCU cannot enter swamp
					if (data.spaces[s].terrain === "swamp") {
						let nations = get_piece_nations_for_rule(game, p)
						if (nations.length > 0 && nations.every((nation) => nation === "tu" || nation === "tua" || nation === "bu")) {
							violations.push({ space: s, rule: "Rule 197: Turkish/Bulgarian LCU cannot enter swamp" })
						}
					}
				}
			}
		}

		return violations
	}

	function is_special_hq(p, name) {
		return data.pieces[p].name.includes(name) && data.pieces[p].type === "hq"
	}

	function is_under_special_hq_command(game, s, faction) {
		for (let p = 0; p < game.pieces.length; p++) {
			if (is_not_on_map(game, p)) continue

			let info = data.pieces[p]
			if (!info || info.faction !== faction) continue

			let loc = game.pieces[p]
			if (!data.spaces[loc]) continue

			if (faction === CP) {
				if (is_special_hq(p, "Falkenhayn") || is_special_hq(p, "Mackenson")) {
					if (loc === s) return true
					// Check adjacency (connected spaces)
					let adj = data.spaces[loc].connections
					if (adj && adj.includes(s)) return true
				}
			} else {
				if (is_special_hq(p, "D'Esperey")) {
					// Desperey needs to be with a French unit
					let pieces_with_desperey = get_pieces_in_space(game, loc)
					let has_fr = pieces_with_desperey.some(
						(p2) => data.pieces[p2] && data.pieces[p2].nation === "fr" && p2 !== p
					)
					if (has_fr) {
						if (loc === s) return true
						let adj = data.spaces[loc].connections
						if (adj && adj.includes(s)) return true
					}
				}
			}
		}
		return false
	}

	function get_activation_nationality_groups(game, p) {
		if (!can_piece_be_activated(p)) return []
		if (is_tribe(p) || is_irregular(p)) return []
		return get_piece_nation_groups_for_rule(game, p, "activation")
	}

	function get_minimum_activation_group_count(game, pieces) {
		let options = []
		let group_ids = new Map()
		for (let p of pieces) {
			let groups = get_activation_nationality_groups(game, p)
			if (groups.length === 0) continue
			let ids = groups.map((group) => {
				if (!group_ids.has(group)) group_ids.set(group, group_ids.size)
				return group_ids.get(group)
			})
			options.push(ids)
		}
		if (options.length === 0) return 0
		let states = new Set([0])
		for (let ids of options) {
			let next = new Set()
			for (let mask of states) {
				for (let id of ids) {
					next.add(mask | (1 << id))
				}
			}
			states = next
		}
		let best = Infinity
		for (let mask of states) {
			let count = 0
			let value = mask
			while (value) {
				value &= value - 1
				count++
			}
			if (count < best) best = count
		}
		return best === Infinity ? 0 : best
	}

	function compute_activation_mode_cost(
		game,
		s,
		active_count,
		has_hq,
		group_count,
		has_pi_penalty,
		special_hq_command
	) {
		if (active_count === 0) return 0
		let base_cost = 1
		if (is_region(game, s)) {
			base_cost = Math.ceil(active_count / 3)
		}
		if (has_hq) {
			if (game.card_ops !== 3 && game.card_ops !== 4) {
				return Infinity
			}
			return base_cost
		}
		if (special_hq_command) {
			return base_cost
		}
		let cost = base_cost
		if (group_count > 1) {
			cost = base_cost + (group_count - 1)
		}
		if (has_pi_penalty) {
			cost += 1
		}
		return cost
	}

	function get_activation_cost_pair(game, s) {
		let pieces = get_pieces_in_space(game, s)
		if (pieces.length === 0) return { move: 0, attack: 0 }

		let faction = game.active
		if (faction === "Allied Powers" || faction === "AP") faction = AP
		if (faction === "Central Powers" || faction === "CP") faction = CP

		// MO_BRITISH_NO_ATTACK logic
		const MO_BRITISH_NO_ATTACK = "british_no_attack"
		let ignore_br_for_attack = faction === AP && game.mo_ap === MO_BRITISH_NO_ATTACK
		let move_pieces = []
		let attack_pieces = []
		let move_has_hq = false
		let attack_has_hq = false
		let has_pi_nation = false

		for (let p of pieces) {
			if (data.pieces[p].faction !== faction) continue
			let nations = get_piece_nations_for_rule(game, p, "activation")
			if (nations.some((nation) => nation === "br" || nation === "in" || nation === "in-g")) {
				has_pi_nation = true
			}

			if (can_piece_be_activated(p)) {
				move_pieces.push(p)
				if (data.pieces[p].type === "hq") move_has_hq = true
			}

			if (!(ignore_br_for_attack && nations.some((nation) => nation === "br"))) {
				if (can_piece_be_activated(p)) {
					attack_pieces.push(p)
					if (data.pieces[p].type === "hq") attack_has_hq = true
				}
			}
		}

		let move_active_count = get_stack_count(move_pieces)
		let attack_active_count = get_stack_count(attack_pieces)
		let move_group_count = get_minimum_activation_group_count(game, move_pieces)
		let attack_group_count = get_minimum_activation_group_count(game, attack_pieces)

		let has_pi_penalty =
			faction === AP &&
			game.events &&
			game.turn !== undefined &&
			game.events["parliamentary_inquiry"] === game.turn &&
			has_pi_nation
		let special_hq_command = is_under_special_hq_command(game, s, faction)
		return {
			move: compute_activation_mode_cost(
				game,
				s,
				move_active_count,
				move_has_hq,
				move_group_count,
				has_pi_penalty,
				special_hq_command
			),
			attack: compute_activation_mode_cost(
				game,
				s,
				attack_active_count,
				attack_has_hq,
				attack_group_count,
				has_pi_penalty,
				special_hq_command
			)
		}
	}

	function get_activation_cost(game, s, activation_type) {
		let costs = get_activation_cost_pair(game, s)
		if (activation_type === "attack") return costs.attack
		return costs.move
	}

	function is_not_on_map(game, p) {
		return Engine.game_utils.is_not_on_map(game, p)
	}

	Object.assign(exports, {
		get_pieces_in_space,
		for_each_piece_in_space,
		contains_enemy_pieces,
		get_piece_effective_faction,
		is_anatolia,
		is_caucasus,
		is_georgia,
		is_gallipoli,
		is_mesopotamia,
		is_egypt,
		is_balkans,
		is_arabistan,
		is_persia,
		is_central_asia,
		is_azerbaijan,
		is_india,
		is_afghanistan,
		is_baluchistan,
		is_sinai,
		is_suez_canal_space,
		is_hejaz,
		is_sudan_and_darfur,
		is_syria_palestine,
		is_galicia,
		is_russia,
		get_area,
		is_controlled_by,
		destroy_fort,
		is_naval_access_space,
		faction_controls_strait,
		get_connection_type,
		get_connection_strait,
		get_crossing_type,
		is_aegean_east_med_port,
		is_black_sea_port,
		is_caspian_sea_port,
		has_undestroyed_fort,
		get_region,
		get_distance,
		is_russian_vp_space,
		get_restricted_area,
		count_lcu_in_area,
		is_lcu,
		is_scu,
		is_tribe,
		is_island_base,
		is_beachhead_space,
		get_tribe_type,
		is_region,
		get_connected_spaces,
		other_faction,
		get_movement_cost,
		set_debug_log,
		get_lcu_limit_for,
		can_enter_region,
		is_unlimited_stack_space,
		get_stack_counted_pieces,
		get_stack_count,
		is_stack_counted_piece,
		can_move_stack_composition,
		can_stack_end_in_space,
		get_stack_end_block_reason,
		get_move_end_space_block_reason,
		get_piece_mf,
		prune_exhausted_move_stack,
		has_unmoved_pieces_in_space,
		get_piece_move_block_reason,
		can_stack_move_to,
		can_piece_move_to,
		can_besiege,
		get_sr_cost,
		can_sr_piece,
		can_sr_to_space,
		get_sr_destinations,
		get_activation_cost,
		get_activation_cost_pair,
		is_reserve_space,
		check_supply,
		is_connected_by_rail,
		is_in_supply,
		is_in_limited_supply,
		is_rail_connected_to_supply,
		is_besieged,
		is_base_supply_source,
		can_trace_supply_to_source,
		can_trace_supply_to_ap_port,
		get_ru_supply_sources,
		get_gr_supply_sources,
		get_supply_sources_from_data,
		get_supply_eligible_space_ids,
		is_supply_eligible_space,
		get_supplied_spaces,
		get_ap_supply_split_projection,
		get_beachhead_spaces,
		get_supply_status,
		is_not_on_map,
		is_space_in_tribal_range,
		check_rule_violations
	})

	return exports
}
