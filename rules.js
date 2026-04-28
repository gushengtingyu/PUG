"use strict"

let game, view, res

const Engine = require("./modules/engine.js")
const activation_states = require("./modules/states/states_activation.js")
const combat_states = require("./modules/states/states_combat.js")
const turn_states = require("./modules/states/states_turn.js")
const action_states = require("./modules/states/states_action.js")

let combat_funcs
let turn_funcs
let action_funcs

const { data } = Engine
const {
	get_sr_cost,
	can_sr_piece,
	can_sr_to_space,
	get_sr_destinations,
	is_reserve_space,
	is_besieged,
	check_supply,
	is_in_supply,
	is_rail_connected_to_supply
} = Engine.map
const {
	set_add,
	set_delete,
	set_has,
	set_toggle,
	shuffle,
	roll_die: engine_roll_die,
	object_copy,
	random
} = Engine.utils
const {
	AP,
	CP,
	COMMITMENT_MOBILIZATION,
	COMMITMENT_LIMITED,
	COMMITMENT_TOTAL,
	RUSSO_BRITISH_ASSAULT
} = Engine.constants
const {
	piece_name: raw_piece_name,
	piece_list,
	space_name,
	find_space,
	find_capital,
	find_piece,
	get_season,
	get_scu_reserve_box,
	get_lcu_reserve_box,
	get_reserve_box,
	get_capacity,
	get_eliminated_box,
	get_removed_box,
	get_permanently_eliminated_box,
	is_in_reserve,
	is_eliminated,
	is_removed,
	is_not_on_map,
	is_piece_reduced,
	reduce_piece: utils_reduce_piece,
	has_scu_in_reserve,
	get_pieces_in_reserve,
	get_pieces_in_eliminated,
	get_pieces_in_removed,
	get_pieces_in_reinforcements,
	pieces_count_as_any_nation_for_rule,
	is_turn_event,
	is_hq,
	add_rps: utils_add_rps,
	place_trench,
	remove_trench,
	has_trench
} = Engine.game_utils
const {
	get_connected_spaces,
	contains_enemy_pieces: map_contains_enemy_pieces,
	get_movement_cost,
	get_area,
	get_region,
	get_restricted_area,
	is_lcu,
	is_scu,
	is_tribe,
	is_island_base,
	is_beachhead_space,
	get_piece_connected_spaces_for_rule,
	is_controlled_by,
	get_pieces_in_space,
	set_debug_log,
	other_faction,
	is_persia,
	is_central_asia,
	is_azerbaijan,
	is_arabistan,
	is_india,
	is_afghanistan,
	is_baluchistan,
	is_sinai,
	is_hejaz,
	is_sudan_and_darfur,
	is_syria_palestine,
	is_galicia,
	is_caucasus,
	is_mesopotamia,
	is_egypt,
	is_balkans,
	is_anatolia,
	is_georgia,
	is_gallipoli
} = Engine.map

set_debug_log(log)

const {
	get_replacement_cost,
	can_afford_replacement,
	get_valid_rebuild_spaces,
	spend_replacement_points,
	is_capital_restricted
} = Engine.replacement

const {
	get_piece_mf,
	get_lcu_limit_for,
	can_enter_region,
	can_stack_end_in_space,
	can_piece_move_to,
	can_stack_move_to,
	get_piece_move_block_reason,
	get_move_end_space_block_reason,
	get_stack_count,
	is_stack_counted_piece,
	get_stack_end_block_reason,
	can_move_stack_composition,
	prune_exhausted_move_stack,
	has_unmoved_pieces_in_space,
	can_besiege
} = Engine.map

const combat = Engine.combat
const {
	has_undestroyed_fort,
	count_steps,
	get_piece_lf,
	get_advance_pieces,
	is_advance_stop_terrain,
	get_valid_retreat_spaces,
	get_valid_advance_spaces,
	resolve_russian_winter_offensive_advance,
	any_capital_occupied_or_besieged,
	get_legal_attackable_spaces: combat_get_legal_attackable_spaces,
	can_choose_attack_with_piece: combat_can_choose_attack_with_piece
} = combat

const {
	create_game,
	normalize_game,
	setup_historical_scenario,
	setup_limited_war_scenario,
	setup_total_war_scenario
} = Engine.setup
const {
	play_event,
	can_play_event,
	get_event_entry,
	bulls_eye_should_prompt_sr,
	bulls_eye_get_sr_spaces,
	bulls_eye_record_sr_space,
	bulls_eye_finish_sr,
	bulls_eye_record_advanced_piece,
	bulls_eye_can_extra_attack,
	bulls_eye_use_extra_attack,
	reinforce
} = Engine.events
const mo = Engine.mo
const event_states = Engine.event_states
const jihad = Engine.jihad

let states = {}
function merge_engine_states(source_states) {
	for (let state_name in source_states) {
		const source_state = source_states[state_name]
		const target_state = Object.assign({}, source_state)
		for (let action_name in source_state) {
			if (typeof source_state[action_name] !== "function") continue
			if (action_name === "prompt") {
				target_state[action_name] = (res) => source_state[action_name](res)
			} else {
				target_state[action_name] = (arg, current) => source_state[action_name](game, log, arg, current)
			}
		}
		states[state_name] = target_state
	}
}

merge_engine_states(mo.states)
merge_engine_states(jihad.states)

function with_optional_game_arg(arg1, arg2, fn) {
	if (arg1 && typeof arg1 === "object" && Array.isArray(arg1.pieces)) {
		return fn(arg1, arg2)
	}
	return fn(game, arg1)
}

function piece_name(p, reduced = null) {
	let name = raw_piece_name(p)
	if (reduced === null) reduced = !!(game && is_piece_reduced(game, p))
	if (reduced) return `(${name})`
	return name
}

function move_piece(target_game, p, s) {
	if (target_game.pieces[p] !== s) {
		let from = target_game.pieces[p]
		target_game.pieces[p] = s

		if (target_game === game) {
			let faction = data.pieces[p].faction
			// Sync jihad city state BEFORE any set_control call
			if (from > 0) {
				Engine.sync_neutral_vp_state(game, from)
				Engine.sync_jihad_city_state(game, from)
				Engine.sync_region_control(game, from)
			}
			Engine.sync_neutral_vp_state(game, s)
			Engine.sync_jihad_city_state(game, s)
			Engine.sync_region_control(game, s)

			let can_capture_persia_vp =
				Engine.events.is_persia_open(game) &&
				Engine.map.is_persia(s) &&
				Engine.is_neutral_vp_space(s) &&
				!is_controlled_by(game, s, faction) &&
				data.pieces[p].type === "regular" &&
				data.pieces[p].type !== "hq"
			if (can_capture_persia_vp) {
				set_control(game, s, faction)
			}
			if (Engine.check_persia_entry_vp_penalty) {
				Engine.check_persia_entry_vp_penalty(game, s, [p])
			}
		}

		// Rule 19.2.1: Entering neutral Athens triggers Greek entry
		if (target_game === game && Engine.neutral.is_greece_neutral(game) && Engine.neutral.is_athens_space(s)) {
			// Get faction of the piece
			let faction = data.pieces[p].faction
			Engine.neutral.trigger_greece_entry(game, s, faction, "事件移动进入雅典", (msg) => log(msg))
		}

		if (target_game === game) {
			if (!target_game.move_animation) target_game.move_animation = []
			target_game.move_animation.push([p, s])
		}
	}
}

const event_rules = Object.freeze({
	push_undo,
	pop_undo,
	gen_action,
	log,
	reinforce,
	goto_end_operations,
	goto_end_event,
	goto_end_action: () => action_funcs.goto_end_action(),
	space_name,
	piece_name,
	is_removed,
	get_capacity,
	eliminate_piece(p, permanent = false) {
		return eliminate_piece(p, permanent)
	},
	remove_piece(p) {
		return remove_piece(p)
	},
	move_piece(arg1, arg2, arg3) {
		if (arg1 && typeof arg1 === "object" && Array.isArray(arg1.pieces)) return move_piece(arg1, arg2, arg3)
		return move_piece(game, arg1, arg2)
	},
	has_undestroyed_fort(arg1, arg2, arg3) {
		if (arg1 && typeof arg1 === "object" && Array.isArray(arg1.pieces))
			return has_undestroyed_fort(arg1, arg2, arg3)
		return has_undestroyed_fort(game, arg1, arg2)
	},
	get_pieces_in_space(arg1, arg2) {
		return with_optional_game_arg(arg1, arg2, get_pieces_in_space)
	},
	is_controlled_by(arg1, arg2, arg3) {
		if (arg1 && typeof arg1 === "object" && Array.isArray(arg1.pieces)) return is_controlled_by(arg1, arg2, arg3)
		return is_controlled_by(game, arg1, arg2)
	},
	get_region,
	get_area,
	is_persia,
	is_central_asia,
	is_azerbaijan,
	is_arabistan,
	is_india,
	is_afghanistan,
	is_baluchistan,
	is_sinai,
	is_hejaz,
	is_sudan_and_darfur,
	is_syria_palestine,
	is_galicia,
	is_caucasus,
	is_mesopotamia,
	is_egypt,
	is_balkans,
	is_anatolia,
	is_georgia,
	is_gallipoli,
	find_space,
	find_piece,
	roll_die,
	update_jihad_level,
	start_attack_sequence,
	get_connected_spaces(arg1, arg2, arg3, arg4, arg5) {
		if (arg1 && typeof arg1 === "object" && (arg1.pieces || arg1.active !== undefined))
			return get_connected_spaces(arg1, arg2, arg3, arg4, arg5)
		return get_connected_spaces(game, arg1, arg2, arg3, arg4)
	},
	contains_enemy_pieces(arg1, arg2, arg3) {
		if (arg1 && typeof arg1 === "object" && Array.isArray(arg1.pieces))
			return contains_enemy_pieces(arg1, arg2, arg3)
		return contains_enemy_pieces(game, arg1, arg2)
	},
	set_control(arg1, arg2, arg3) {
		if (arg1 && typeof arg1 === "object" && Array.isArray(arg1.pieces)) return set_control(arg1, arg2, arg3)
		return set_control(game, arg1, arg2)
	},
	get_attackable_spaces,
	get_stack_count,
	can_sr_piece,
	get_sr_cost,
	get_reserve_box,
	get_removed_box,
	get_eliminated_box,
	get_permanently_eliminated_box,
	is_in_reserve,
	is_island_base(arg1, arg2) {
		return with_optional_game_arg(arg1, arg2, is_island_base)
	},
	is_beachhead_space(arg1, arg2) {
		return with_optional_game_arg(arg1, arg2, is_beachhead_space)
	},
	is_lcu,
	is_scu,
	is_tribe,
	other_faction,
	set_add,
	set_has,
	set_delete,
	set_toggle,
	place_trench,
	refresh_attack_eligibility,
	next_phase(phase) {
		if (turn_funcs && turn_funcs.next_phase) {
			turn_funcs.next_phase(phase)
		} else {
			game.state = phase
		}
	},
	has_scu_in_reserve,
	is_rail_connected_to_supply,
	start_event,
	get_event_data,
	any_capital_occupied_or_besieged,
	can_activate_piece_in_space_to_attack(p, s) {
		return can_activate_piece_in_space_to_attack(p, s)
	},
	get_replacement_cost,
	can_afford_replacement,
	is_capital_restricted,
	get_valid_rebuild_spaces,
	spend_replacement_points,
	is_eliminated,
	is_in_supply,
	get_season,
	get_pieces_in_reserve,
	get_pieces_in_eliminated,
	get_pieces_in_removed,
	get_pieces_in_reinforcements,
	is_ru_sphere_rein: Engine.reinf_helpers.is_ru_sphere_rein,
	is_secret_treaty_rein: Engine.reinf_helpers.is_secret_treaty_rein,
	...Engine.reinf_helpers
})

// Merge Event states with context injection
let merged_event_states = event_states.states || event_states
for (let s in merged_event_states) {
	states[s] = Object.assign({}, merged_event_states[s])
	for (let a in merged_event_states[s]) {
		if (typeof merged_event_states[s][a] === "function") {
			if (a === "prompt") {
				states[s][a] = (res) =>
					merged_event_states[s][a]({
						game: res.game || game,
						res,
						rules: event_rules,
						start_event,
						get_event_data,
						state: s,
						action: a
					})
			} else {
				states[s][a] = (arg) =>
					merged_event_states[s][a]({
						game,
						arg,
						rules: event_rules,
						start_event,
						get_event_data,
						state: s,
						action: a
					})
			}
		}
	}
}

const PHASE_SEQUENCE = {
	attrition_phase: "siege_phase",
	siege_phase: "revolution_phase",
	revolution_phase: "war_status_phase",
	war_status_phase: "replacement_phase",
	replacement_phase: "draw_cards_phase"
}

const {
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
	check_mo_validity
} = mo

// Choice Constants
const ACTION_OPS = "ops"
const ACTION_SR = "sr"
const ACTION_RPS = "rps"
const ACTION_EVENT = "event"
const ACTION_ONE_OP = "one_op"

const MAX_ROLLBACK_TURNS = 2
const MAX_ROLLBACK_ACTION_ROUNDS = 4

// ... (Scenario Constants omitted for brevity, assuming data.js handles most) ...
// Just defined key ones if needed.

const AP_ROLE = "Allied Powers"
const CP_ROLE = "Central Powers"

exports.roles = [AP_ROLE, CP_ROLE]

const HISTORICAL = "Historical"
const LIMITED_WAR = "LIMITED WAR"
const TOTAL_WAR = "TOTAL WAR"

exports.scenarios = [HISTORICAL, LIMITED_WAR, TOTAL_WAR]
exports.default_scenario = HISTORICAL

function roll_die() {
	const result = engine_roll_die(6, game)
	log_event_for_rollback(`T${game?.turn ?? "?"} ${game?.state ?? "?"}: 掷骰 ${result}`)
	return result
}

function faction_name(faction) {
	switch (faction) {
		case AP:
			return "AP"
		case CP:
			return "CP"
		default:
			return faction
	}
}

function short_faction(faction) {
	if (typeof faction === "string") {
		let token = faction.trim().toLowerCase()
		if (token === "ap" || token === "allied powers") return AP
		if (token === "cp" || token === "central powers") return CP
	}
	if (faction === AP_ROLE) return AP
	if (faction === CP_ROLE) return CP
	return faction
}

function is_player_role(role) {
	return role === AP || role === CP || role === AP_ROLE || role === CP_ROLE
}

function active_faction() {
	return short_faction(game.active)
}

function game_over_prompt() {
	return game.victory || "Game over."
}

states.game_over = {
	inactive(res) {
		res.prompt(game_over_prompt())
	},
	prompt(res) {
		res.prompt(game_over_prompt())
	}
}

function is_reserve_space_id(s) {
	if (s <= 0 || !data.spaces[s]) return false
	let name = data.spaces[s].name
	return name === "AP Reserve" || name === "CP Reserve" || name === "AP Corps Assets" || name === "CP Corps Assets"
}

function get_previous_action_for_faction(faction) {
	let actions = faction === AP ? game.ap_actions : game.cp_actions
	if (!actions) return null
	let round = game.action_round || 1
	if (round <= 1) return null
	return actions[round - 1] || null
}

function can_play_sr_card_this_round(faction) {
	let prev = get_previous_action_for_faction(faction)
	return !(prev && prev.type === ACTION_SR)
}

function can_play_rp_card_this_round(faction) {
	let prev = get_previous_action_for_faction(faction)
	return !(prev && prev.type === ACTION_RPS)
}

function can_use_reserve_sr_for_piece(p) {
	let info = data.pieces[p]
	if (!info || info.piece_class === "LCU") return false
	return !any_capital_occupied_or_besieged(game, info.nation)
}

function record_action(type, card) {
	let faction = active_faction()
	let actions = faction === AP ? game.ap_actions : game.cp_actions
	if (!actions) return

	let index
	if (game.state && (game.state.includes("mandated_offensive") || game.state.includes("mo_"))) {
		index = 0
	} else {
		index = game.action_round || 1
	}
	actions[index] = { type, card }
}
// === VIEW & QUERY ===

function update_supply_if_missing() {
	// 性能策略：只在状态变更后重算补给，避免同一步内 view/query/action 重复全量计算。
	if (
		game.supply_dirty !== false ||
		!Array.isArray(game.oos) ||
		!Array.isArray(game.supply_status) ||
		game.supply_status.length !== game.pieces.length ||
		!Array.isArray(game.limited_supply) ||
		!Array.isArray(game.disrupted_supply) ||
		!Array.isArray(game.oos_spaces)
	) {
		check_supply(game)
		game.supply_dirty = false
		delete game.supply_query_cache
	}
}

function get_stable_object_signature(obj) {
	if (!obj || typeof obj !== "object") return ""
	let keys = Object.keys(obj).sort()
	let parts = []
	for (let key of keys) {
		parts.push(key + ":" + JSON.stringify(obj[key]))
	}
	return parts.join("|")
}

function get_array_signature(value) {
	return Array.isArray(value) ? value.join(",") : ""
}

function get_supply_dependency_signature() {
	return [
		get_array_signature(game.pieces),
		get_array_signature(game.control),
		get_array_signature(game.beachheads),
		get_stable_object_signature(game.events),
		get_stable_object_signature(game.forts),
		get_array_signature(game.special_besieged),
		get_array_signature(game.persian_uprising_markers),
		get_array_signature(game.partial_ap_control_markers),
		get_array_signature(game.partial_cp_control_markers),
		get_array_signature(game.ru_control_markers),
		get_array_signature(game.vps),
		game.entry_gr || "",
		game.entry_bu || "",
		game.entry_ro || "",
		game.entry_sb || ""
	].join("#")
}

function set_supply_dirty_if_needed(before_signature) {
	let explicitly_dirty = game.supply_dirty !== false
	let after_signature = get_supply_dependency_signature()
	if (explicitly_dirty || before_signature !== after_signature) {
		game.supply_dirty = true
		delete game.supply_query_cache
		delete game.supply_projection_ap_split
		return
	}
	game.supply_dirty = false
}

function set_state_globals() {
	activation_states.set_globals(game)
	combat_states.set_globals(game)
	turn_states.set_globals(game)
	action_states.set_globals(game)
}

function normalize_action_arg(arg) {
	if (typeof arg === "string" && /^-?\d+$/.test(arg)) {
		return Number(arg)
	}
	if (Array.isArray(arg)) {
		return arg.map((item) => {
			if (typeof item === "string" && /^-?\d+$/.test(item)) {
				return Number(item)
			}
			return item
		})
	}
	return arg
}

exports.action = function (state, current, action, arg) {
	game = normalize_game(state)
	update_supply_if_missing()
	arg = normalize_action_arg(arg)
	if (is_player_role(current)) {
		let current_faction = short_faction(current)
		let active = short_faction(game.active)
		if (current_faction !== active) {
			return game
		}
	}

	set_state_globals()
	normalize_transient_state()
	const supply_dependency_before = get_supply_dependency_signature()
	const state_handlers = states[game.state]
	if (state_handlers && action in state_handlers) {
		state_handlers[action](arg, current)
	} else {
		if (action === "undo" && game.undo && game.undo.length > 0) pop_undo()
		else if (action === "propose_rollback") goto_propose_rollback(arg)
		else if (action === "flag_supply_warnings") goto_flag_supply_warnings()
		else if (is_player_role(current)) return game
		else throw new Error("Invalid action: " + action)
	}
	normalize_transient_state()
	// Only map/supply-relevant state changes need a fresh global supply pass.
	set_supply_dirty_if_needed(supply_dependency_before)
	game.cache_revision = (Number(game.cache_revision) || 0) + 1
	return game
}

exports.resign = function (state, current) {
	game = normalize_game(state)
	if (game.state !== "game_over") {
		log(`${current} resigned.`)
		game.state = "game_over"
		game.active = "None"
		game.result = other_faction(short_faction(current))
		game.victory = current + " resigned."
	}
	return game
}

exports.query = function (state, current, q) {
	game = normalize_game(state)
	update_supply_if_missing()

	if (q === "ap_cards") return query_cards(game, AP)
	if (q === "cp_cards") return query_cards(game, CP)

	if (q === "ap_supply") {
		if (game.supply_projection_ap_split) {
			return game.supply_projection_ap_split
		}
		if (game.supply_query_cache && game.supply_query_cache.ap_supply) {
			return game.supply_query_cache.ap_supply
		}
		let reply = Engine.map.get_ap_supply_split_projection(game)
		game.supply_projection_ap_split = reply
		if (!game.supply_query_cache) game.supply_query_cache = {}
		game.supply_query_cache.ap_supply = reply
		return reply
	}

	if (q === "cp_supply") {
		if (game.supply_projection && game.supply_projection.cp) {
			return { cp: game.supply_projection.cp }
		}
		if (game.supply_query_cache && game.supply_query_cache.cp_supply) {
			return game.supply_query_cache.cp_supply
		}
		const { CP } = Engine.constants
		let supply_spaces = Engine.map.get_supply_eligible_space_ids()
		let cp_sources = Engine.map.get_supply_sources_from_data(game, CP)
		let cp_supply = Engine.map.get_supplied_spaces(game, cp_sources, CP, -1)

		let reply = { cp: [] }
		for (let s of supply_spaces) {
			reply.cp[s] = cp_supply.full.has(s) || cp_supply.disrupted.has(s) ? 1 : 0
		}
		if (!game.supply_query_cache) game.supply_query_cache = {}
		game.supply_query_cache.cp_supply = reply
		return reply
	}

	return null
}

function query_cards(state, faction) {
	const is_ap = faction === AP
	const hand = is_ap ? state.hand_ap || [] : state.hand_cp || []
	const deck = is_ap ? state.deck_ap || [] : state.deck_cp || []
	const discard = is_ap ? state.discard_ap || [] : state.discard_cp || []
	const removed = is_ap ? state.removed_ap || [] : state.removed_cp || []
	return {
		discard: [...discard].sort((a, b) => a - b),
		deck: [...deck, ...hand].sort((a, b) => a - b),
		removed: [...removed].sort((a, b) => a - b)
	}
}

function get_piece_supply_status_view() {
	const status = Array.isArray(game.supply_status) ? game.supply_status : []
	const limited = []
	const disrupted = []
	for (let p = 0; p < status.length; p++) {
		const piece_status = status[p]
		if (Engine.map.is_limited_supply_status(piece_status)) limited.push(p)
		if (Engine.map.is_disrupted_supply_status(piece_status)) disrupted.push(p)
	}
	return {
		limited,
		disrupted
	}
}

function get_control_view() {
	const view_control = {}
	const control = Array.isArray(game.control) ? game.control : []
	for (let s = 1; s < data.spaces.length; s++) {
		const value = control[s]
		const default_value = data.spaces[s] && data.spaces[s].faction
		if (value !== undefined && value !== null && value !== default_value) {
			view_control[s] = value
		}
	}
	return view_control
}

exports.view = function (state, current) {
	game = normalize_game(state)
	update_supply_if_missing()
	const rollback_entries = game.rollback || []
	const rollback_total_events = rollback_entries.reduce((sum, r) => sum + (r.events ? r.events.length : 0), 0)
	const max_rollback_turns = get_max_rollback_turns()
	const max_rollback_action_rounds = get_max_rollback_action_rounds()
	const ui_tokens = { ...(game.ui_tokens || {}) }
	const hidden_reinforcement_markers = []
	if (game.events && game.events["royal_flying_corps_permanent"]) {
		ui_tokens["AP Air Superiority"] = "MAPAirS.png"
		delete ui_tokens["CP Air Superiority"]
	} else if (game.events && game.events["fliegerabteilung"]) {
		ui_tokens["CP Air Superiority"] = "MCPAirS.png"
		delete ui_tokens["AP Air Superiority"]
	} else {
		delete ui_tokens["CP Air Superiority"]
		delete ui_tokens["AP Air Superiority"]
	}
	if (game.events && game.events["kitchener"]) {
		hidden_reinforcement_markers.push("Kitch.token")
	}
	if (game.events && game.events["xinai"] !== undefined) {
		hidden_reinforcement_markers.push("SINAI RAILROAD")
	}
	if (game.events && game.events["parvus_to_berlin"] !== undefined) {
		hidden_reinforcement_markers.push("Parvus to Berlin token")
		hidden_reinforcement_markers.push("Revolution token")
		hidden_reinforcement_markers.push("Long Live the Czar! token")
	}
	if (game.events && game.events["jerusalem_by_christmas"] !== undefined) {
		hidden_reinforcement_markers.push("J By C token")
	}
	if (game.events && game.events["berlin_baghdad"]) {
		ui_tokens["BB.RR"] = "MBBRR.png"
		hidden_reinforcement_markers.push("BB.RR token")
	}

	function create_view() {
		const supply_view = get_piece_supply_status_view()
		const entry_gr = !!(game.entry_gr || (Engine.neutral && Engine.neutral.get_greece_faction(game)))
		const entry_bu = !!(game.entry_bu || (game.events && game.events["bulgaria"]))
		const entry_ro = !!(game.entry_ro || (game.events && game.events["romania"]))
		const entry_sb = !!(game.entry_sb || (game.events && game.events["bulgaria"]))
		const jerusalem_by_christmas =
			game.events && typeof game.events["jerusalem_by_christmas"] === "object"
				? game.events["jerusalem_by_christmas"]
				: null
		const jerusalem_by_christmas_target = Number(jerusalem_by_christmas?.target_space)
		return {
			active: game.active,
			log: game.log,
			prompt: null,
			actions: null,
			turn: game.turn,
			vp: game.vp,
			cp_auto_victory_marker: game.cp_auto_victory_marker,
			blockade: !!(game.events && game.events["royal_navy_blockade"]),
			ws_ap: game.war_status_ap,
			ws_cp: game.war_status_cp,
			combined_war: game.combined_war,
			rp: {
				br: game.rp_ap?.br || 0,
				in: game.rp_ap?.in || 0,
				ru: game.rp_ap?.ru || 0,
				apa: game.rp_ap?.a || 0,
				ge: game.rp_cp?.ge || 0,
				tu: game.rp_cp?.tu || 0,
				cpa: game.rp_cp?.a || 0
			},
			russian_vp: game.russian_vp,
			jihad: game.jihad,
			max_tu_rp: game.events && game.events["royal_navy_blockade"] ? game.tu_rp_limit : undefined,
			ap_hand_count: game.hand_ap ? game.hand_ap.length : 0,
			cp_hand_count: game.hand_cp ? game.hand_cp.length : 0,
			ap_deck_size: game.deck_ap ? game.deck_ap.length : 0,
			cp_deck_size: game.deck_cp ? game.deck_cp.length : 0,
			entry_gr,
			entry_bu,
			entry_ro,
			entry_sb,
			hand: [],
			ap: {
				deck: game.deck_ap ? game.deck_ap.length : 0,
				hand: game.hand_ap ? game.hand_ap.length : 0,
				discard: game.discard_ap ? game.discard_ap.length : 0,
				discard_list: game.discard_ap || [],
				actions: game.ap_actions || []
			},
			cp: {
				deck: game.deck_cp ? game.deck_cp.length : 0,
				hand: game.hand_cp ? game.hand_cp.length : 0,
				discard: game.discard_cp ? game.discard_cp.length : 0,
				discard_list: game.discard_cp || [],
				actions: game.cp_actions || []
			},
			pieces: game.pieces,
			ui_tokens: ui_tokens,
			hidden_reinforcement_markers: hidden_reinforcement_markers,
			control: get_control_view(),
			ru_control_markers: game.ru_control_markers || [],
			persian_uprising_markers: game.persian_uprising_markers || [],
			jerusalem_by_christmas_markers:
				Number.isFinite(jerusalem_by_christmas_target) && jerusalem_by_christmas_target > 0
					? [jerusalem_by_christmas_target]
					: [],
			reduced: game.reduced,
			forts: game.forts,
			beachheads: game.beachheads,
			unplaced_beachheads: Math.max(0, game.unplaced_beachheads || 0),
			trenches: game.trenches,
			trenches_2: game.trenches_2,
			action_round: game.action_round,
			mo_ap: game.mo_ap,
			mo_cp: game.mo_cp,
			mo_ap_modifier: game.mo_ap_modifier,
			mo_ap_fulfilled: game.mo_ap_fulfilled,
			mo_cp_fulfilled: game.mo_cp_fulfilled,
			ru_revolution: game.ru_revolution,
			parvus_to_berlin:
				game.events && game.events["parvus_to_berlin"] !== undefined && !game.events["russian_revolution"]
					? Engine.events.get_parvus_marker_turn(game)
					: undefined,
			russian_revolution_timer:
				game.events && game.events["parvus_to_berlin"] !== undefined && !game.events["russian_revolution"]
					? Engine.events.get_revolution_marker_turn(game)
					: undefined,
			long_live_czar:
				game.events && game.events["parvus_to_berlin"] !== undefined && !game.events["russian_revolution"]
					? Engine.events.get_long_live_czar_turn(game)
					: 0,
			lcu_limit_ap: get_lcu_limit_for(game, AP),
			lcu_limit_cp: get_lcu_limit_for(game, CP),
			activated: (() => {
				// Merge region_activations into a view-only `activated` so the map shows
				// move/attack markers on regions with partial stack activations. Without this,
				// Galicia/etc. look "un-activated" after the first stack is confirmed, which
				// makes players click the region again and accidentally hit Deactivate.
				let base = game.activated || { move: [], attack: [] }
				let merged_move = Array.isArray(base.move) ? base.move.slice() : []
				let merged_attack = Array.isArray(base.attack) ? base.attack.slice() : []
				let ra = game.region_activations || {}
				if (ra.move) {
					for (let key of Object.keys(ra.move)) {
						let stacks = ra.move[key]
						if (Array.isArray(stacks) && stacks.length > 0) {
							let space_id = Number(key)
							if (!merged_move.includes(space_id)) merged_move.push(space_id)
						}
					}
				}
				if (ra.attack) {
					for (let key of Object.keys(ra.attack)) {
						let stacks = ra.attack[key]
						if (Array.isArray(stacks) && stacks.length > 0) {
							let space_id = Number(key)
							if (!merged_attack.includes(space_id)) merged_attack.push(space_id)
						}
					}
				}
				return { move: merged_move, attack: merged_attack }
			})(),
			activation_cost: game.activation_cost,
			move: game.move
				? { pieces: game.move.pieces ? game.move.pieces.slice() : [] }
				: game.sr_piece !== null && game.sr_piece !== undefined
					? { pieces: [game.sr_piece] }
					: null,
			attack: game.attack,
			attacked: game.attacked || [],
			moved: game.moved || [],
			undo: game.undo && game.undo.length > 0,
			where: game.where,
			violations: Engine.map.check_rule_violations(game),
			supply_warnings: game.supply_warnings || [],
			limited_supply: supply_view.limited,
			disrupted_supply: supply_view.disrupted,
			oos: game.oos || [],
			oos_spaces: game.oos_spaces || [],
			entrenching: game.entrenching || [],
			last_card: game.last_card || 0,
			combat_cards: game.combat_cards || null,
			cc_retained: {
				ap: get_cc_retained(AP).slice(),
				cp: get_cc_retained(CP).slice()
			},
			removed_cards: {
				ap: game.removed_ap || [],
				cp: game.removed_cp || []
			},
			events: game.events || {},
			rollback_meta: {
				max_turns: max_rollback_turns,
				max_action_rounds: max_rollback_action_rounds,
				total_points: rollback_entries.length,
				turn_points: rollback_entries.filter((r) => r.turn_start).length,
				action_points: rollback_entries.filter((r) => !r.turn_start).length,
				total_events: rollback_total_events,
				state_compressed: false
			},
			rollback: rollback_entries.map((r) => {
				let name = r.turn_start
					? `回合 ${r.turn} 起始`
					: `回合 ${r.turn} ${faction_name(r.active)} 第 ${r.action} 行动轮`
				return {
					name,
					turn: r.turn,
					active: r.active,
					action: r.action,
					log_index: Number.isInteger(r.log_index) ? r.log_index : undefined,
					turn_start: !!r.turn_start,
					events: r.events || [],
					event_count: r.events ? r.events.length : 0
				}
			})
		}
	}
	function create_result_for_current() {
		let next = Engine.create_result(game)
		if (game.rollback_proposal) next.rollback_proposal({ index: game.rollback_proposal.index })
		if (current === AP_ROLE) {
			next.hand(game.hand_ap)
		} else if (current === CP_ROLE) {
			next.hand(game.hand_cp)
		}
		return next
	}

	function prompt_current_view(next) {
		if (!states[game.state]) {
			next.prompt("Invalid game state: " + game.state)
			return
		}

		
		if (current === "Observer" || short_faction(game.active) !== short_faction(current)) {
				let inactive = states[game.state].inactive
				if (typeof inactive === "function") inactive(next)
				else if (typeof inactive === "string") next.prompt(`等待 ${faction_name(game.active)}   ${inactive}`)
				else next.prompt(`等待 ${faction_name(game.active)} 行动`)
		} else {
			states[game.state].prompt(next)
			if (!next.has_action("undo")) {
				if (game.undo && game.undo.length > 0) next.action("undo")
				else next.set_action("undo", 0)
			}

			if (
				!game.options.no_supply_warnings &&
				game.rollback_proposal === undefined &&
				game.rollback &&
				game.rollback.length > 0
			) {
				for (let i = 0; i < rollback_entries.length; i++) next.action("propose_rollback", i)
			}

			if (!game.options.no_supply_warnings && game.state !== "flag_supply_warnings") {
				next.action("flag_supply_warnings")
			}
		}
	}

	set_state_globals()
	normalize_transient_state()

	with_space_index_cache(() => {
		for (let i = 0; i < 5; i++) {
			let state_before_prompt = game.state
			let active_before_prompt = game.active
			res = create_result_for_current()
			prompt_current_view(res)
			if (game.state === state_before_prompt && game.active === active_before_prompt) {
				break
			}
		}
	})

	view = create_view()
	res.apply(view)
	return view
}

// === SETUP ===

exports.setup = function (seed, scenario, options) {
	game = create_game(seed, scenario, options)
	const maxRollbackTurns = Number(options?.max_rollback_turns ?? options?.rollback_turns)
	if (Number.isInteger(maxRollbackTurns) && maxRollbackTurns >= 0) game.options.max_rollback_turns = maxRollbackTurns
	const maxRollbackActionRounds = Number(options?.max_rollback_action_rounds ?? options?.rollback_action_rounds)
	if (Number.isInteger(maxRollbackActionRounds) && maxRollbackActionRounds >= 0)
		game.options.max_rollback_action_rounds = maxRollbackActionRounds

	// Initialize Control
	for (let i = 0; i < data.spaces.length; i++) {
		if (data.spaces[i].faction) game.control[i] = data.spaces[i].faction
	}

	if (scenario === LIMITED_WAR) setup_limited_war_scenario(game)
	else if (scenario === TOTAL_WAR) setup_total_war_scenario(game)
	else setup_historical_scenario(game)
	game.is_eliminated = is_eliminated
	game.is_in_reserve = is_in_reserve
	game.eliminate_piece = eliminate_piece
	game.options.hand_size = game.options.seven_hand_size ? 7 : 8
	set_up_standard_decks(false)

	set_state_globals()

	goto_start_turn()
	game.supply_dirty = true
	return game
}

// === CONTROL & JIHAD ===

function push_state(next_state) {
	if (!game.state_stack) game.state_stack = []
	game.state_stack.push({ state: game.state, active: game.active })
	game.state = next_state
}

function queue_state_after_stack(next_state) {
	if (!next_state) return
	let depth = game.state_stack ? game.state_stack.length : 0
	if (!game.state_after_stack || game.state_after_stack.depth !== depth) {
		game.state_after_stack = { depth, queue: [] }
	}
	game.state_after_stack.queue.push(next_state)
}

function take_queued_state_after_stack() {
	if (
		!game.state_after_stack ||
		!Array.isArray(game.state_after_stack.queue) ||
		game.state_after_stack.queue.length === 0
	) {
		delete game.state_after_stack
		return null
	}
	let next_state = game.state_after_stack.queue.shift()
	if (game.state_after_stack.queue.length === 0) {
		delete game.state_after_stack
	}
	return next_state
}

function resume_previous_state() {
	if (!game.state_stack || game.state_stack.length === 0) return
	let prev = game.state_stack.pop()
	game.state = prev.state
	if (prev.active !== undefined) game.active = prev.active
	if (game.state_after_stack) {
		let depth = game.state_stack ? game.state_stack.length : 0
		if (depth === game.state_after_stack.depth - 1) {
			let next_state = take_queued_state_after_stack()
			if (next_state) game.state = next_state
		}
	}
}
Engine.push_state = push_state
Engine.resume_previous_state = resume_previous_state

function contains_enemy_pieces(arg1, arg2, arg3) {
	if (arg1 && typeof arg1 === "object") {
		return map_contains_enemy_pieces(arg1, arg2, arg3)
	}
	return map_contains_enemy_pieces(game, arg1, arg2)
}

function update_jihad_level(game, amount) {
	Engine.update_jihad_level(game, amount)
}

function set_control(game, s, faction) {
	Engine.set_control(game, s, faction)
}

function has_jihad_prereq(country) {
	return jihad.has_jihad_prereq(game, country)
}
function check_immediate_jihad_rebellion_on_entry(from_space, target, pieces_moving) {
	return jihad.check_immediate_jihad_rebellion_on_entry(game, from_space, target, pieces_moving, {
		log,
		roll_die,
		update_jihad_level,
		reinforce,
		find_space,
		push_state,
		eliminate_piece,
		piece_name,
		is_removed,
		is_eliminated,
		is_in_reserve,
		is_not_on_map
	})
}

// === LOGIC ===

// MO phase extracted to turn_states.js

states.acknowledge_mo_results = {
	prompt(res) {
		let ap_mo = mo_name(game.mo_ap)
		let cp_mo = mo_name(game.mo_cp)
		if (game.mo_cp === MO_ENVER) {
			cp_mo = `${cp_mo} [攻势#1: ${mo_name(game.mo_cp_1)}, 攻势#2: ${mo_name(game.mo_cp_2)}]`
		}
		res.prompt(`强制进攻: AP = ${ap_mo} , CP= ${cp_mo}.`)
		res.action("next")
	},
	next() {
		game.active = AP
		game.player_order = [AP, CP]
		action_funcs.start_action_phase()
	}
}

states.retreat_choice_cc_cp = {
	prompt(res) {
		res.prompt("回援第比利斯：打出战斗卡，或跳过")
		// 必须在这里向 UI 声明此卡可以作为战斗卡打出，否则 UI 无法点击
		if (Engine.combat_cards.can_play_combat_card(res.game, Engine.combat.CC_CP_SAVE_TIFLIS)) {
			res.action("play_cc", Engine.combat.CC_CP_SAVE_TIFLIS)
		}
		res.action("skip")
	},
	play_cc(card) {
		if (card === Engine.combat.CC_CP_SAVE_TIFLIS) {
			game.events["save_tiflis"] = game.turn
			
			let played_from_retained = false
			if (game.cc_retained && game.cc_retained.cp && set_has(game.cc_retained.cp, card)) {
				set_delete(game.cc_retained.cp, card)
				played_from_retained = true
			} else {
				set_delete(game.hand_cp, card)
			}
			
			if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
			if (!game.combat_cards.attacker) game.combat_cards.attacker = []
			set_add(game.combat_cards.attacker, card)
			
			if (!played_from_retained) {
				set_add(game.removed_cp, card) // 《回援第比利斯》打出后移出游戏
			}
			
			if (!game.combat_cards_effected) game.combat_cards_effected = []
			set_add(game.combat_cards_effected, card)
			
			log("同盟国打出战斗卡：回援第比利斯")
			game.retreat_choice_cc_cp_done = true
			combat.end_battle_sequence(game, log)
		}
	},
	skip() {
		game.retreat_choice_cc_cp_done = true
		combat.end_battle_sequence(game, log)
	}
}

// Save Tiflis retreat states now handled by modules/states/states_combat.js

// Action phase functions moved to states_action.js

function update_war_status(faction, amount) {
	if (faction === AP) {
		game.war_status_ap += amount
		log(`AP 战争状态增加 ${amount} 至 ${game.war_status_ap}`)
	} else {
		game.war_status_cp += amount
		log(`CP 战争状态增加 ${amount} 至 ${game.war_status_cp}`)
	}
	game.combined_war = Math.min(40, game.war_status_ap + game.war_status_cp)

	// Rule 24.2.3: Combined War Status reaches 40
	if (game.combined_war >= 40 && !game.events["armistice_scheduled"]) {
		game.events["armistice_scheduled"] = true
		let roll = roll_die()
		let turns = 0
		if (roll <= 2) turns = 3
		else if (roll <= 4) turns = 4
		else turns = 5
		game.armistice_turn = Math.min(20, game.turn + turns)
		log(`Combined War Status reached 40. Armistice scheduled for Turn ${game.armistice_turn} (Roll: ${roll})`)
	}
}

// Play card states moved to states_action.js

// Card action states moved to states_action.js

function get_attackable_spaces(pieces) {
	return combat_get_legal_attackable_spaces(game, pieces, active_faction(), () => get_season(game), is_rail_connected_to_supply)
}

function can_activate_piece_in_space_to_attack(p, s) {
	return combat_can_choose_attack_with_piece(
		game,
		p,
		s,
		active_faction(),
		() => get_season(game),
		is_rail_connected_to_supply
	)
}

function reset_balkan_attack_targets() {
	combat.reset_balkan_attack_targets(game)
}

function start_attack_sequence() {
	return combat_funcs.start_attack_sequence()
}

// Helpers

const HISTORY_SNAPSHOT_OMIT_KEYS = new Set([
	"undo",
	"rollback",
	"rollback_state",
	"supply_query_cache",
	"event_playability_cache",
	"supply_projection",
	"supply_projection_ap_split",
	"oos",
	"oos_spaces",
	"supply_status",
	"limited_supply",
	"disrupted_supply"
])

function copy_history_snapshot(source) {
	let copy = {}
	for (let key in source) {
		if (!Object.prototype.hasOwnProperty.call(source, key)) continue
		if (key === "log") {
			copy.log = Array.isArray(source.log) ? source.log.length : source.log
			continue
		}
		if (HISTORY_SNAPSHOT_OMIT_KEYS.has(key)) continue
		copy[key] = object_copy(source[key])
	}
	return copy
}

function save_rollback_point() {
	if (game.options.no_supply_warnings) return

	let rollback_state = game.rollback_state || []
	if (!game.rollback) game.rollback = []

	const ap_action_count = Array.isArray(game.ap_actions) ? game.ap_actions.filter(Boolean).length : 0
	const cp_action_count = Array.isArray(game.cp_actions) ? game.cp_actions.filter(Boolean).length : 0
	const is_turn_start = ap_action_count === 0 && cp_action_count === 0

	let copy = copy_history_snapshot(game)

	let action_index = copy.action_round || 1
	game.rollback.push({
		turn: copy.turn,
		active: copy.active,
		action: action_index,
		log_index: Array.isArray(game.log) ? game.log.length : 0,
		events: [],
		turn_start: is_turn_start
	})
	rollback_state.push(copy)

	const maxRollbackTurns = get_max_rollback_turns()
	const maxRollbackActionRounds = get_max_rollback_action_rounds()

	if (is_turn_start) {
		const count_turns = game.rollback.filter((r) => r.turn_start).length
		if (count_turns > maxRollbackTurns) {
			const first_turn_start = game.rollback.findIndex((r) => r.turn_start)
			if (first_turn_start >= 0) {
				game.rollback.splice(first_turn_start, 1)
				rollback_state.splice(first_turn_start, 1)
			}
		}
	} else {
		const count_action_rounds = game.rollback.filter((r) => !r.turn_start).length
		if (count_action_rounds > maxRollbackActionRounds) {
			const first_action_round = game.rollback.findIndex((r) => !r.turn_start)
			if (first_action_round >= 0) {
				let removed_events = game.rollback[first_action_round].events
				game.rollback.splice(first_action_round, 1)
				rollback_state.splice(first_action_round, 1)
				if (first_action_round > 0 && removed_events.length > 0) {
					game.rollback[first_action_round - 1].events.push(...removed_events)
				}
			}
		}
	}

	game.rollback_state = rollback_state
}

function restore_rollback(index) {
	if (!game.rollback || game.rollback.length <= index || index < 0) return
	let rollback_state = game.rollback_state || []
	if (rollback_state.length <= index) return

	let save_rollback = game.rollback
	let save_log = game.log
	let save_seed = game.seed

	game = normalize_game(object_copy(rollback_state[index]))
	game.supply_dirty = true

	if (Array.isArray(save_log)) {
		save_log.length = game.log
		game.log = save_log
	}

	game.undo = []
	game.seed = save_seed
	game.rollback = save_rollback.slice(0, index + 1)
	game.rollback_state = rollback_state.slice(0, index + 1)

	set_state_globals()
}

function goto_propose_rollback(rollback_index) {
	if (!game.rollback || game.rollback.length === 0) return
	if (!Number.isInteger(rollback_index)) rollback_index = game.rollback.length - 1
	if (rollback_index < 0 || rollback_index >= game.rollback.length) return
	game.rollback_proposal = { faction: game.active, save_state: game.state, index: rollback_index }
	game.active = other_faction(game.active)
	game.state = "review_rollback_proposal"
}

states.review_rollback_proposal = {
	inactive: "审查回滚提议",
	prompt(res) {
		const rollback = game.rollback[game.rollback_proposal.index]
		const label = rollback.turn_start
			? `回合 ${rollback.turn} 起始`
			: `回合 ${rollback.turn} ${faction_name(rollback.active)} 第 ${rollback.action} 行动轮`
		res.prompt(`${game.rollback_proposal.faction} 提议回滚到：${label}`)
		res.action("accept")
		res.action("reject")
	},
	accept() {
		const rollback = game.rollback[game.rollback_proposal.index]
		const label = rollback.turn_start
			? `回合 ${rollback.turn} 起始`
			: `回合 ${rollback.turn} ${faction_name(rollback.active)} 第 ${rollback.action} 行动轮`
		restore_rollback(game.rollback_proposal.index)
		game.rollback_confirmation = { msg: `已回滚到：${label}`, state: game.state }
		game.state = "confirm_rollback"
	},
	reject() {
		game.active = game.rollback_proposal.faction
		game.state = game.rollback_proposal.save_state
		delete game.rollback_proposal
	}
}

states.confirm_rollback = {
	inactive: "确认回滚",
	prompt(res) {
		res.prompt(game.rollback_confirmation.msg)
		res.action("next")
	},
	next() {
		log(game.rollback_confirmation.msg)
		game.state = game.rollback_confirmation.state
		delete game.rollback_confirmation
	}
}

function log_event_for_rollback(description) {
	if (!game.rollback || game.rollback.length === 0) return
	game.rollback[game.rollback.length - 1].events.push(description)
}

function get_max_rollback_turns() {
	return Number.isInteger(game.options.max_rollback_turns) ? game.options.max_rollback_turns : MAX_ROLLBACK_TURNS
}

function get_max_rollback_action_rounds() {
	return Number.isInteger(game.options.max_rollback_action_rounds)
		? game.options.max_rollback_action_rounds
		: MAX_ROLLBACK_ACTION_ROUNDS
}

function goto_flag_supply_warnings() {
	game.save_state = game.state
	game.state = "flag_supply_warnings"
}

states.flag_supply_warnings = {
	inactive: "标记补给警告",
	prompt(res) {
		res.prompt("标记补给线可能受威胁的地块。")
		for (let s = 1; s < data.spaces.length; ++s) {
			res.space(s)
		}
		res.action("done")
	},
	space(s) {
		if (game.supply_warnings === undefined) game.supply_warnings = []
		set_toggle(game.supply_warnings, s)
	},
	done() {
		game.state = game.save_state
		delete game.save_state
	}
}

function has_supply_warnings() {
	return game.supply_warnings && game.supply_warnings.length > 0
}

function goto_review_supply_warnings() {
	if (has_supply_warnings()) {
		log_h1("补给警告")
		game.supply_warnings.forEach((s) => {
			log(`${data.spaces[s].name_cn || data.spaces[s].name}`)
		})
		game.state = "review_supply_warnings"
	} else {
		action_funcs.end_action_round()
	}
}

states.review_supply_warnings = {
	prompt(res) {
		res.prompt("确认收到补给警告。")
		if (game.supply_warnings && game.supply_warnings.length < 4) {
			const list = game.supply_warnings.map((s) => data.spaces[s].name_cn || data.spaces[s].name).join(", ")
			res.prompt(`确认收到补给警告 (${list})。`)
		}
		res.action("acknowledge")
	},
	acknowledge() {
		delete game.supply_warnings
		action_funcs.end_action_round()
	}
}

function push_undo() {
	let copy = copy_history_snapshot(game)
	if (!game.undo) game.undo = []
	game.undo.push(copy)
}
Engine.push_undo = push_undo

function pop_undo() {
	if (game.undo && game.undo.length > 0) {
		let save = game.undo.pop()
		let undo_stack = game.undo
		let log_stack = game.log
		let rollback = game.rollback
		let rollback_state = game.rollback_state

		for (let k of Object.keys(game)) {
			delete game[k]
		}

		Object.assign(game, save)
		game.undo = undo_stack
		if (Array.isArray(log_stack)) {
			log_stack.length = game.log
			game.log = log_stack
		}
		if (rollback !== undefined) game.rollback = rollback
		if (rollback_state !== undefined) game.rollback_state = rollback_state
		game.supply_dirty = true
		return true
	}
	return false
}
function log(msg) {
	let text = msg
	if (text === null || text === undefined) text = ""
	if (typeof text !== "string") text = String(text)
	if (game && Array.isArray(game.log)) game.log.push(text)
	else console.log(text)
}
function logi(msg) {
	log(">" + msg)
}
function logii(msg) {
	log(">>" + msg)
}
function log_br() {
	if (game && Array.isArray(game.log)) {
		if (game.log.length === 0 || game.log[game.log.length - 1] !== "") game.log.push("")
	} else console.log("")
}
function log_h1(msg) {
	log_br()
	log(".h1 " + msg)
	log_br()
}
function log_h2(msg) {
	log(".h2 " + msg)
}
function log_h3(msg) {
	log(".h3 " + msg)
}
function log_h3_faction(faction, msg) {
	if (faction === AP) {
		log(".h3ap " + msg)
		return
	}
	if (faction === CP) {
		log(".h3cp " + msg)
		return
	}
	log_h3(msg)
}
function card_name(card) {
	return Engine.card_name(card)
}
function card_names(cards) {
	return Engine.card_names(cards)
}
function gen_action(action, argument) {
	if (res) {
		res.action(action, argument)
	}
}

function draw_card(deck) {
	let i = random(deck.length, game)
	let c = deck[i]
	deck.splice(i, 1)
	return c
}
function reshuffle_discard(faction) {
	let deck = faction === AP ? game.deck_ap : game.deck_cp
	let discard = faction === AP ? game.discard_ap : game.discard_cp
	if (discard.length === 0) return
	deck.push(...discard)
	discard.length = 0
	shuffle(deck, game)
	log(`${faction_name(faction)} deck reshuffled`)
}
function resolve_pending_commitment_shuffle(faction) {
	let pending = game.pending_commitment_shuffle
	if (!pending) return
	let key = faction === AP ? "ap" : "cp"
	if (!pending[key]) return
	let deck = faction === AP ? game.deck_ap : game.deck_cp
	let discard = faction === AP ? game.discard_ap : game.discard_cp
	if (discard.length > 0) {
		deck.push(...discard)
		discard.length = 0
	}
	if (deck.length > 0) {
		shuffle(deck, game)
		log(`${faction_name(faction)} deck reshuffled`)
	}
	pending[key] = false
}
function deal_cards(faction) {
	let hand = faction === AP ? game.hand_ap : game.hand_cp
	let deck = faction === AP ? game.deck_ap : game.deck_cp
	let hand_size = game.options.hand_size || 7
	resolve_pending_commitment_shuffle(faction)
	while (hand.length < hand_size) {
		if (deck.length === 0) reshuffle_discard(faction)
		if (deck.length === 0) break
		hand.push(draw_card(deck))
	}
}

function remove_card_from_hand(c, faction) {
	let hand = faction === AP ? game.hand_ap : game.hand_cp
	if (!Array.isArray(hand)) return
	let i = hand.indexOf(c)
	if (i >= 0) hand.splice(i, 1)
}

function discard_card(c) {
	remove_card_from_hand(c, game.active)
	let discard = game.active === AP ? game.discard_ap : game.discard_cp
	set_add(discard, c)
	game.card = null
}

function remove_card(c) {
	remove_card_from_hand(c, game.active)
	let removed = game.active === AP ? game.removed_ap : game.removed_cp
	set_add(removed, c)
	game.card = null
}

function ensure_cc_retained() {
	if (!game.cc_retained) game.cc_retained = { ap: [], cp: [] }
	if (!game.cc_retained_after_use) game.cc_retained_after_use = { ap: {}, cp: {} }
}

function get_cc_retained(faction) {
	ensure_cc_retained()
	return faction === AP ? game.cc_retained.ap : game.cc_retained.cp
}

function get_cc_retained_after_use(faction, c) {
	ensure_cc_retained()
	let map = faction === AP ? game.cc_retained_after_use.ap : game.cc_retained_after_use.cp
	return map ? map[c] : undefined
}

function add_cc_retained(faction, c, after_use) {
	ensure_cc_retained()
	let list = faction === AP ? game.cc_retained.ap : game.cc_retained.cp
	set_add(list, c)
	if (after_use) {
		let map = faction === AP ? game.cc_retained_after_use.ap : game.cc_retained_after_use.cp
		map[c] = after_use
	}
}

function remove_cc_retained(faction, c) {
	ensure_cc_retained()
	let list = faction === AP ? game.cc_retained.ap : game.cc_retained.cp
	set_delete(list, c)
	let map = faction === AP ? game.cc_retained_after_use.ap : game.cc_retained_after_use.cp
	if (map) delete map[c]
}

function move_card_to_discard(c, faction) {
	let discard = faction === AP ? game.discard_ap : game.discard_cp
	set_add(discard, c)
}

function move_card_to_removed(c, faction) {
	let removed = faction === AP ? game.removed_ap : game.removed_cp
	set_add(removed, c)
}

const CC_AP_NO_PRISONERS = 21
const CC_CP_JAFAR_PASHA = 75

function discard_all_retained_cc() {
	ensure_cc_retained()
	for (let faction of [AP, CP]) {
		let retained = get_cc_retained(faction).slice()
		for (let c of retained) {
			// Rule 7.8.3: Jafar Pasha and No Prisoners are NOT discarded at end of turn.
			if (c === CC_AP_NO_PRISONERS || c === CC_CP_JAFAR_PASHA) {
				continue
			}

			let after_use = get_cc_retained_after_use(faction, c)
			remove_cc_retained(faction, c)
			if (after_use === "remove") {
				move_card_to_removed(c, faction)
			} else {
				move_card_to_discard(c, faction)
			}
		}
	}
}
function contains_friendly(s) {
	let pieces = get_pieces_in_space(game, s)
	return pieces.some((p) => data.pieces[p].faction === active_faction())
}

function get_activation_cost(s, activation_type) {
	return Engine.map.get_activation_cost(game, s, activation_type)
}

const ATTACK_ELIGIBILITY_FORT_SPACES = data.spaces
	.map((space, idx) => (space && space.fort && space.fort > 0 ? idx : 0))
	.filter((idx) => idx > 0)

function hash_number_array(list) {
	if (!Array.isArray(list) || list.length === 0) return 0
	let h = 2166136261 >>> 0
	for (let i = 0; i < list.length; i++) {
		let v = Number(list[i]) | 0
		h ^= (v + 0x9e3779b9 + ((h << 6) >>> 0) + (h >>> 2)) >>> 0
		h >>>= 0
	}
	return h >>> 0
}

function hash_events_flags(events) {
	if (!events) return 0
	let h = 2166136261 >>> 0
	let keys = Object.keys(events).sort()
	for (let k of keys) {
		let v = events[k]
		let chunk = `${k}:${typeof v === "object" ? JSON.stringify(v) : String(v)}`
		for (let i = 0; i < chunk.length; i++) {
			h ^= chunk.charCodeAt(i)
			h = Math.imul(h, 16777619) >>> 0
		}
	}
	return h >>> 0
}

function get_region_attack_activation_entries() {
	let entries = []
	let mode_map = game.region_activations && game.region_activations.attack
	if (!mode_map) return entries
	for (let key of Object.keys(mode_map)) {
		let stacks = mode_map[key]
		if (!Array.isArray(stacks) || stacks.length === 0) continue
		entries.push({ space: Number(key), stacks })
	}
	return entries
}

function hash_region_attack_activations() {
	let h = 2166136261 >>> 0
	for (let { space, stacks } of get_region_attack_activation_entries()) {
		h ^= (space + 1) * 131
		h = Math.imul(h, 16777619) >>> 0
		for (let stack of stacks) {
			h ^= (Number(stack.cost) || 0) + 0x9e3779b9
			h = Math.imul(h, 16777619) >>> 0
			for (let p of stack.pieces || []) {
				h ^= (p + 1) * 313
				h = Math.imul(h, 16777619) >>> 0
			}
		}
	}
	return h >>> 0
}

function build_attack_eligibility_cache_key() {
	// 说明：
	// 1) 这是 phase-local 缓存键，目标是避免同一状态下重复执行资格全量推导。
	// 2) 键覆盖会影响攻击资格的核心输入：棋子位置、已攻击标记、激活攻击格、堡垒状态、事件标志。
	// 3) 如上述任一输入变化，键会变化，缓存自动失效。
	let pieces_hash = 2166136261 >>> 0
	for (let p = 0; p < game.pieces.length; p++) {
		let s = Number(game.pieces[p]) | 0
		pieces_hash ^= (p + 1) * 131 + s + 0x9e3779b9
		pieces_hash = Math.imul(pieces_hash, 16777619) >>> 0
	}

	let attacked_hash = hash_number_array(game.attacked)
	let activated_attack_hash = hash_number_array(game.activated && game.activated.attack)
	let activated_attack_egypt_hash = hash_number_array(game.activated && game.activated.attack_egypt)
	let region_attack_hash = hash_region_attack_activations()
	let retreated_hash = hash_number_array(game.retreated)

	let fort_destroyed = new Uint8Array(data.spaces.length)
	if (game.forts && Array.isArray(game.forts.destroyed)) {
		for (let s of game.forts.destroyed) {
			if (s > 0 && data.spaces[s]) fort_destroyed[s] = 1
		}
	}
	let fort_hash = 2166136261 >>> 0
	for (let s of ATTACK_ELIGIBILITY_FORT_SPACES) {
		let owner = data.spaces[s].faction
		if (game.control && game.control[s]) owner = game.control[s]
		let owner_bit = owner === AP ? 1 : owner === CP ? 2 : 3
		fort_hash ^= s * 17 + owner_bit * 31 + (fort_destroyed[s] === 1 ? 97 : 53)
		fort_hash = Math.imul(fort_hash, 16777619) >>> 0
	}

	let events_hash = hash_events_flags(game.events)
	let faction_bit = game.active === AP || game.active === "AP" || game.active === "Allied Powers" ? 1 : 2

	return `${faction_bit}|${pieces_hash}|${attacked_hash}|${activated_attack_hash}|${activated_attack_egypt_hash}|${region_attack_hash}|${retreated_hash}|${fort_hash}|${events_hash}`
}

function build_enemy_space_flag(faction) {
	let enemy = other_faction(faction)
	let flags = new Uint8Array(data.spaces.length)
	for (let p = 0; p < game.pieces.length; p++) {
		let s = game.pieces[p]
		if (!(s > 0 && data.spaces[s])) continue
		if (Engine.game_utils.get_piece_effective_faction(game, p) !== enemy) continue
		flags[s] = 1
	}
	return flags
}

function has_attack_targets(p, faction, enemy, enemy_space_flag = null) {
	if (Array.isArray(game.retreated) && set_has(game.retreated, p)) return false
	if (combat.get_black_sea_amphibious_targets(game, p, faction).length > 0) return true
	if (combat.can_piece_attack_current_fort(game, p, faction)) return true
	let s = game.pieces[p]
	let adj = get_piece_connected_spaces_for_rule(game, s, p, "attack")
	for (let t of adj) {
		let has_enemy = enemy_space_flag ? enemy_space_flag[t] === 1 : contains_enemy_pieces(game, t, faction)
		if (has_enemy) {
			let defenders = get_pieces_in_space(game, t).filter((q) => Engine.game_utils.get_piece_effective_faction(game, q) === enemy)
			if (
				defenders.length > 0 &&
				defenders.every((q) => Array.isArray(game.retreated) && set_has(game.retreated, q)) &&
				!has_undestroyed_fort(game, t, enemy)
			) {
				has_enemy = false
			}
		}
		if (has_enemy || has_undestroyed_fort(game, t, enemy)) return true
	}
	return false
}

function refresh_attack_eligibility() {
	game.eligible_attackers = []
	let has_egypt_attack = Array.isArray(game.activated?.attack_egypt) && game.activated.attack_egypt.length > 0
	let has_normal_attack_activations = !!(game.activated && game.activated.attack && game.activated.attack.length > 0)
	let region_attack_entries = get_region_attack_activation_entries()
	if (!has_normal_attack_activations && !has_egypt_attack && region_attack_entries.length === 0) return

	let cache_key = build_attack_eligibility_cache_key()
	if (game.attack_eligibility_cache && game.attack_eligibility_cache.key === cache_key) {
		game.eligible_attackers = game.attack_eligibility_cache.eligible_attackers.slice()
		game.activated.attack = game.attack_eligibility_cache.activated_attack_spaces.slice()
		return
	}

	let faction = active_faction()
	let enemy = other_faction(faction)
	let enemy_space_flag = build_enemy_space_flag(faction)
	let activated_attack_flag = new Uint8Array(data.spaces.length)
	for (let s of game.activated.attack) {
		if (s > 0 && data.spaces[s]) activated_attack_flag[s] = 1
	}
	// Also include Egypt-only attack activations
	for (let s of (game.activated.attack_egypt || [])) {
		if (s > 0 && data.spaces[s]) activated_attack_flag[s] = 1
	}
	for (let p = 0; p < game.pieces.length; p++) {
		let s = game.pieces[p]
		if (s && s > 0 && activated_attack_flag[s] === 1 && !is_not_on_map(game, p)) {
			// Check if unit has already attacked in this action round
			if (set_has(game.attacked, p)) continue
			if (Array.isArray(game.retreated) && set_has(game.retreated, p)) continue

			let is_active_piece = Engine.game_utils.get_piece_effective_faction(game, p) === faction
			if (Engine.neutral.is_greek_piece(p) && !Engine.neutral.can_attack_piece_for_faction(game, p, faction)) {
				is_active_piece = false
			}
			if (game.events && game.events["apis"] === game.turn && data.pieces[p].nation === "sb") {
				is_active_piece = false
			}
			if (is_active_piece && (is_lcu(p) || is_scu(p))) {
				if (has_attack_targets(p, faction, enemy, enemy_space_flag) && can_activate_piece_in_space_to_attack(p, s)) {
					set_add(game.eligible_attackers, p)
				}
			}
		}
	}
	let filtered_region_attack = {}
	for (let { space, stacks } of region_attack_entries) {
		let surviving_stacks = []
		for (let stack of stacks) {
			let stack_has_eligible = false
			for (let p of stack.pieces || []) {
				if (game.pieces[p] !== space || is_not_on_map(game, p)) continue
				if (set_has(game.attacked, p)) continue
				if (Array.isArray(game.retreated) && set_has(game.retreated, p)) continue

				let is_active_piece = Engine.game_utils.get_piece_effective_faction(game, p) === faction
				if (Engine.neutral.is_greek_piece(p) && !Engine.neutral.can_attack_piece_for_faction(game, p, faction)) {
					is_active_piece = false
				}
				if (game.events && game.events["apis"] === game.turn && data.pieces[p].nation === "sb") {
					is_active_piece = false
				}
				if (!is_active_piece || (!is_lcu(p) && !is_scu(p))) continue
				if (!has_attack_targets(p, faction, enemy, enemy_space_flag)) continue
				if (!can_activate_piece_in_space_to_attack(p, space)) continue
				set_add(game.eligible_attackers, p)
				stack_has_eligible = true
			}
			if (stack_has_eligible) surviving_stacks.push(stack)
		}
		if (surviving_stacks.length > 0) filtered_region_attack[space] = surviving_stacks
	}
	if (game.region_activations) game.region_activations.attack = filtered_region_attack
	let eligible_space_flag = new Uint8Array(data.spaces.length)
	for (let p of game.eligible_attackers) {
		let s = game.pieces[p]
		if (s > 0 && data.spaces[s]) eligible_space_flag[s] = 1
	}
	game.activated.attack = game.activated.attack.filter((s) => eligible_space_flag[s] === 1)
	let post_filter_cache_key = build_attack_eligibility_cache_key()
	game.attack_eligibility_cache = {
		key: post_filter_cache_key,
		eligible_attackers: game.eligible_attackers.slice(),
		activated_attack_spaces: game.activated.attack.slice()
	}
}

function create_noop_result() {
	return {
		game,
		_is_noop: true,
		prompt() {
			return this
		},
		action() {
			return this
		},
		set_action() {
			return this
		},
		has_action() {
			return false
		},
		get_action() {
			return undefined
		},
		hand() {
			return this
		},
		piece() {
			return this
		},
		space() {
			return this
		},
		where() {
			return this
		},
		who() {
			return this
		},
		log() {
			return this
		},
		apply() {
			return this
		},
		rollback_proposal() {
			return this
		},
		entrenching() {
			return this
		}
	}
}

function with_space_index_cache(fn) {
	if (game._space_index) return fn()
	
	let index = []
	for (let p = 0; p < game.pieces.length; p++) {
		let loc = game.pieces[p]
		if (loc >= 0) {
			if (!index[loc]) index[loc] = []
			index[loc].push(p)
		}
	}
	game._space_index = index
	try {
		return fn()
	} finally {
		delete game._space_index
	}
}

function normalize_transient_state() {
	with_space_index_cache(() => {
		for (let i = 0; i < 5; i++) {
			let state_before_normalize = game.state
			let active_before_normalize = game.active

			if (game.state === "attack") {
				refresh_attack_eligibility()
				if (game.eligible_attackers.length === 0) {
					game.state = "end_operations"
				}
			}

			let state_handlers = states[game.state]
			if (state_handlers && typeof state_handlers.prompt === "function") {
				state_handlers.prompt(create_noop_result())
			}

			if (game.state === state_before_normalize && game.active === active_before_normalize) {
				break
			}
		}
	})
}

function start_event(key, data) {
	if (!game.event_ctx || typeof game.event_ctx !== "object" || Array.isArray(game.event_ctx)) {
		game.event_ctx = {}
	}
	if (game.event_ctx.key === key) {
		if (!game.event_ctx.data || typeof game.event_ctx.data !== "object" || Array.isArray(game.event_ctx.data)) {
			game.event_ctx.data = {}
		}
		if (data && typeof data === "object" && !Array.isArray(data)) {
			Object.assign(game.event_ctx.data, data)
		}
		return game.event_ctx.data
	}
	game.event_ctx = { key, data: {} }
	if (data && typeof data === "object" && !Array.isArray(data)) {
		Object.assign(game.event_ctx.data, data)
	}
	return game.event_ctx.data
}

function get_event_data() {
	if (!game.event_ctx || typeof game.event_ctx !== "object" || Array.isArray(game.event_ctx)) {
		game.event_ctx = {}
	}
	if (!game.event_ctx.data || typeof game.event_ctx.data !== "object" || Array.isArray(game.event_ctx.data)) {
		game.event_ctx.data = {}
	}
	return game.event_ctx.data
}

function clear_event_ctx() {
	if (game.event_ctx) delete game.event_ctx
	if (game.event_next_state) delete game.event_next_state
}

function goto_end_operations() {
	clear_event_ctx()
	if (
		game.state_stack &&
		game.state_stack.length > 0 &&
		(game.state === "jihad_placement" ||
			game.state === "jihad_removal" ||
			game.state === "jihad_rebellion_check" ||
			game.state === "place_egyptian_rebellion")
	) {
		queue_state_after_stack("end_operations")
		return
	}
	let next_state = take_queued_state_after_stack()
	if (next_state) {
		game.state = next_state
		return
	}
	game.state = "end_operations"
}

function goto_end_event() {
	clear_event_ctx()
	if (game.event_ops_card !== undefined) {
		let card_index = game.event_ops_card
		delete game.event_ops_card
		start_ops_from_event(card_index)
		return
	}
	if (
		game.state_stack &&
		game.state_stack.length > 0 &&
		(game.state === "jihad_placement" ||
			game.state === "jihad_removal" ||
			game.state === "jihad_rebellion_check" ||
			game.state === "place_egyptian_rebellion")
	) {
		queue_state_after_stack("confirm_event")
		return
	}
	let next_state = take_queued_state_after_stack()
	if (next_state) {
		game.state = next_state
		return
	}
	game.state = "confirm_event"
}

function start_ops_from_event(card_index) {
	delete game.event_ops_card
	let info = data.cards[card_index]
	if (!info || !info.ops) {
		goto_end_operations()
		return
}
	log(`${card_name(card_index)} -- 行动点 (${info.ops})`)
	game.ops = info.ops
	game.card_ops = info.ops
	game.activated = { move: [], attack: [], attack_egypt: [] }
	game.activation_cost = {}
	game.moved = []
	game.attacked = []
	game.retreated = []
	reset_balkan_attack_targets()
	if (
		game.state_stack &&
		game.state_stack.length > 0 &&
		(game.state === "jihad_placement" ||
			game.state === "jihad_removal" ||
			game.state === "jihad_rebellion_check" ||
			game.state === "place_egyptian_rebellion")
	) {
		queue_state_after_stack("activate_spaces")
		return
	}
	game.state = "activate_spaces"
}

function reduce_piece(p) {
	if (is_piece_reduced(game, p)) {
		eliminate_piece(p)
	} else {
		utils_reduce_piece(game, p)
	}
}
function replace_lcu_with_scu(lcu, space, scu, runtime_state = null) {
	return Engine.game_utils.replace_lcu_with_scu(game, lcu, space, scu, log, runtime_state)
}

function eliminate_piece(p, permanent = false) {
	return Engine.game_utils.eliminate_piece(game, p, log, permanent)
}

function remove_piece(p) {
	return Engine.game_utils.remove_piece(game, p, log)
}

function add_rps(info) {
	return utils_add_rps(game, info, log)
}

function goto_start_turn() {
	turn_funcs.start_turn()
}
function set_up_standard_decks(full) {
	game.deck_ap = []
	game.deck_cp = []
	let starting_commitment = game.initial_deck_commitment || COMMITMENT_MOBILIZATION
	for (let i = 1; i < data.cards.length; i++) {
		let card = data.cards[i]
		if (!card) continue
		let removed = (card.faction === AP ? game.removed_ap : game.removed_cp)?.includes(i)
		if (removed) continue
		if (full || card.commitment === starting_commitment) {
			if (data.cards[i].faction === AP) {
				if (starting_commitment === COMMITMENT_MOBILIZATION && i === RUSSO_BRITISH_ASSAULT) {
					game.hand_ap.push(i)
				} else {
					game.deck_ap.push(i)
				}
			} else if (data.cards[i].faction === CP) {
				game.deck_cp.push(i)
			}
		}
	}
	shuffle(game.deck_ap, game)
	shuffle(game.deck_cp, game)

	if (starting_commitment !== COMMITMENT_MOBILIZATION) {
		while (game.hand_ap.length < game.options.hand_size) {
			if (game.deck_ap.length > 0) game.hand_ap.push(game.deck_ap.pop())
			else break
		}
		while (game.hand_cp.length < game.options.hand_size) {
			if (game.deck_cp.length > 0) game.hand_cp.push(game.deck_cp.pop())
			else break
		}
		return
	}

	// Draw initial hands
	while (game.hand_ap.length < game.options.hand_size) {
		if (game.deck_ap.length > 0) game.hand_ap.push(game.deck_ap.pop())
		else break
	}
}

exports.active_faction = active_faction
exports.get_activation_cost = get_activation_cost
exports.set_game = function (g) {
	game = normalize_game(g)
	set_state_globals()
}
exports.roles = [AP_ROLE, CP_ROLE]

// Helper functions for event states
exports.save_rollback_point = save_rollback_point
exports.push_undo = push_undo
exports.pop_undo = pop_undo
exports.gen_action = gen_action
exports.log = log
exports.reinforce = reinforce
exports.goto_end_operations = goto_end_operations
exports.goto_end_event = goto_end_event
exports.start_event = start_event
exports.get_event_data = get_event_data
exports.clear_event_ctx = clear_event_ctx
exports.space_name = space_name
exports.piece_name = piece_name
exports.get_pieces_in_space = get_pieces_in_space
exports.is_controlled_by = is_controlled_by
exports.get_region = get_region
exports.find_space = find_space
exports.roll_die = roll_die
exports.update_jihad_level = update_jihad_level
exports.start_attack_sequence = start_attack_sequence
exports.get_connected_spaces = get_connected_spaces
exports.contains_enemy_pieces = contains_enemy_pieces
exports.contains_friendly = contains_friendly
exports.is_not_on_map = is_not_on_map
exports.is_in_reserve = is_in_reserve
exports.eliminate_piece = eliminate_piece
exports.remove_piece = remove_piece
exports.can_sr_piece = can_sr_piece
exports.can_sr_to_space = can_sr_to_space
exports.get_attackable_spaces = get_attackable_spaces
exports.get_stack_count = get_stack_count
exports.get_reserve_box = get_reserve_box
exports.get_removed_box = get_removed_box
exports.get_eliminated_box = get_eliminated_box
exports.get_permanently_eliminated_box = get_permanently_eliminated_box
exports.get_sr_cost = function (p, from = null, to = null, faction = null) {
	return get_sr_cost(game, p, from, to, faction)
}
exports.is_in_supply = is_in_supply
exports.is_rail_connected_to_supply = is_rail_connected_to_supply
exports.can_enter_region = can_enter_region
exports.can_stack_end_in_space = can_stack_end_in_space
exports.set_add = set_add
exports.set_has = set_has
exports.set_delete = set_delete
exports.other_faction = other_faction
exports.is_persia = is_persia
exports.is_central_asia = is_central_asia
exports.is_azerbaijan = is_azerbaijan
exports.is_india = is_india
exports.is_afghanistan = is_afghanistan
exports.is_baluchistan = is_baluchistan
exports.is_sinai = is_sinai
exports.is_hejaz = is_hejaz
exports.is_sudan_and_darfur = is_sudan_and_darfur
exports.is_syria_palestine = is_syria_palestine
exports.is_galicia = is_galicia
exports.is_caucasus = is_caucasus
exports.is_mesopotamia = is_mesopotamia
exports.is_egypt = is_egypt
exports.is_balkans = is_balkans
exports.is_anatolia = is_anatolia
exports.is_georgia = is_georgia
exports.is_gallipoli = is_gallipoli
exports.start_ops_from_event = start_ops_from_event

// For testing
exports.check_mo_fulfillment = mo.check_mo_fulfillment
exports.check_mo_criteria = mo.check_mo_criteria
exports.MO_NONE = MO_NONE
exports.MO_RUSSIA = MO_RUSSIA
exports.MO_BRITISH = MO_BRITISH
exports.MO_BRITISH_NO_ATTACK = MO_BRITISH_NO_ATTACK
exports.MO_TURKEY = MO_TURKEY
exports.MO_ENVER = MO_ENVER
exports.MO_MESOPOTAMIA = MO_MESOPOTAMIA
exports.MO_EGYPT = MO_EGYPT
exports.MO_BALKANS = MO_BALKANS
exports.MO_BRITISH_MESOPOTAMIA = MO_BRITISH_MESOPOTAMIA
exports.MO_BRITISH_EGYPT = MO_BRITISH_EGYPT
exports.MO_RUSSIA_CAUCASUS = MO_RUSSIA_CAUCASUS
exports.MO_TURKEY_CAUCASUS = MO_TURKEY_CAUCASUS
exports.MO_TURKEY_EGYPT = MO_TURKEY_EGYPT
exports.MO_TURKEY_MESOPOTAMIA = MO_TURKEY_MESOPOTAMIA
exports.MO_AP_CHOICE_5 = MO_AP_CHOICE_5
exports.determine_mo_ap = determine_mo_ap
exports.determine_mo_cp = determine_mo_cp
exports.AP = AP
exports.CP = CP

activation_states.register(states, Engine, {
	log,
	logi,
	log_br,
	push_undo,
	active_faction,
	contains_friendly,
	get_activation_cost: Engine.map.get_activation_cost,
	get_activation_cost_pair: Engine.map.get_activation_cost_pair,
	get_pieces_in_space,
	can_activate_piece_in_space_to_attack,
	space_name,
	bulls_eye_should_prompt_sr,
	bulls_eye_get_sr_spaces,
	refresh_attack_eligibility,
	bulls_eye_finish_sr,
	is_scu,
	is_lcu,
	is_tribe,
	is_hq,
	get_region,
	get_restricted_area,
	is_rail_connected_to_supply,
	get_piece_mf,
	get_connected_spaces,
	can_stack_move_to,
	can_move_stack_composition,
	prune_exhausted_move_stack,
	get_lcu_reserve_box,
	get_scu_reserve_box,
	get_eliminated_box,
	get_removed_box,
	get_permanently_eliminated_box,
	is_reserve_space,
	is_in_reserve,
	is_eliminated,
	is_removed,
	is_not_on_map,
	goto_end_event,
	find_space,
	piece_name,
	piece_list,
	has_unmoved_pieces_in_space,
	get_movement_cost,
	has_undestroyed_fort,
	other_faction,
	can_besiege,
	can_piece_move_to,
	get_piece_move_block_reason,
	get_move_end_space_block_reason,
	get_stack_end_block_reason,
	is_gallipoli,
	check_immediate_jihad_rebellion_on_entry,
	update_jihad_level: (g, amount) => update_jihad_level(g, amount),
	is_controlled_by,
	set_control,
	bulls_eye_record_sr_space,
	roll_die,
	has_trench,
	place_trench,
	remove_trench
})

combat_funcs = combat_states.register(states, Engine, {
	log,
	log_h3_faction,
	push_undo,
	active_faction,
	get_attackable_spaces,
	get_pieces_in_space,
	space_name,
	refresh_attack_eligibility,
	is_scu,
	is_lcu,
	is_tribe,
	is_rail_connected_to_supply,
	get_connected_spaces,
	is_in_reserve,
	is_eliminated,
	find_space,
	piece_name,
	other_faction,
	set_control,
	goto_end_operations,
	goto_end_action: () => action_funcs.goto_end_action(),
	get_cc_retained,
	check_supply,
	can_enter_region,
	can_stack_end_in_space,
	eliminate_piece,
	bulls_eye_record_advanced_piece,
	bulls_eye_can_extra_attack,
	bulls_eye_use_extra_attack,
	update_war_status,
	remove_cc_retained,
	add_cc_retained,
	get_cc_retained_after_use,
	discard_card,
	remove_card,
	remove_card_from_hand,
	is_not_on_map,
	move_card_to_removed,
	move_card_to_discard,
	get_season,
	is_turn_event,
	mo,
	reduce_piece,
	get_piece_lf,
	replace_lcu_with_scu,
	count_steps,
	get_advance_pieces,
	get_valid_retreat_spaces,
	get_valid_advance_spaces,
	is_advance_stop_terrain,
	resolve_russian_winter_offensive_advance,
	check_immediate_jihad_rebellion_on_entry,
	log_h1,
	card_name,
	card_names,
	MO_NONE,
	PHASE_SEQUENCE,
	push_state,
	has_jihad_prereq,
	update_jihad_level: (g, amount) => update_jihad_level(g, amount),
	AP,
	CP,
	has_trench,
	remove_trench
})

turn_funcs = turn_states.register(states, Engine, {
	log,
	log_h2,
	log_h3_faction,
	get_pieces_in_space,
	find_space,
	other_faction,
	set_control,
	check_supply,
	eliminate_piece,
	is_tribe,
	is_eliminated,
	is_not_on_map,
	is_besieged,
	find_capital,
	get_reserve_box,
	log_h1,
	MO_NONE,
	PHASE_SEQUENCE,
	push_state,
	has_jihad_prereq,
	get_connected_spaces,
	is_controlled_by,
	is_gallipoli,
	pieces_count_as_any_nation_for_rule,
	mo_name,
	determine_mo_ap,
	determine_mo_cp,
	check_mo_validity,
	MO_RUSSIA,
	MO_AP_CHOICE_5,
	MO_BRITISH_NO_ATTACK,
	MO_ENVER,
	reinforce,
	roll_die,
	get_season,
	COMMITMENT_MOBILIZATION,
	COMMITMENT_LIMITED,
	COMMITMENT_TOTAL,
	discard_all_retained_cc,
	deal_cards,
	discard_card,
	faction_name,
	card_name,
	card_names,
	push_undo,
	pop_undo,
	AP,
	CP
})

action_funcs = action_states.register(states, Engine, {
	log,
	log_br,
	log_h2,
	log_h3_faction,
	active_faction,
	push_undo,
	pop_undo,
	can_play_sr_card_this_round,
	can_play_rp_card_this_round,
	can_play_event,
	play_event,
	get_event_entry,
	record_action,
	discard_card,
	remove_card,
	add_rps,
	update_war_status,
	start_ops_from_event,
	start_event,
	update_jihad_level: (g, amount) => update_jihad_level(g, amount),
	goto_end_event,
	goto_end_operations,
	ACTION_OPS,
	ACTION_ONE_OP,
	ACTION_SR,
	ACTION_RPS,
	ACTION_EVENT,
	AP,
	CP,
	push_state,
	is_in_reserve,
	is_not_on_map,
	can_use_reserve_sr_for_piece,
	can_sr_piece,
	get_sr_cost: (p, from = null, to = null, faction = null) => get_sr_cost(game, p, from, to, faction),
	piece_name,
	space_name,
	is_reserve_space_id,
	can_sr_to_space,
	get_sr_destinations,
	save_rollback_point,
	has_supply_warnings,
	goto_review_supply_warnings,
	start_attrition_phase: () => turn_funcs.start_attrition_phase(),
	get_pieces_in_space,
	get_stack_count,
	is_stack_counted_piece,
	is_scu,
	get_scu_reserve_box,
	clear_event_ctx,
	card_name,
	card_names
})
