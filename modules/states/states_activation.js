"use strict"

let game

exports.set_globals = function (g) {
	game = g
}

exports.register = function (states, Engine, context) {
	const { data } = Engine
	const { AP, CP } = Engine.constants
	const { set_has, set_add, set_delete, set_toggle, map_set, map_get, map_delete } = Engine.utils
	const DEBUG_ACTIVATION_TRACE = !!(
		typeof process !== "undefined" &&
		process &&
		process.env &&
		(process.env.PUG_DEBUG_ACTIVATION === "1" || process.env.PUG_DEBUG_ACTIVATION === "true")
	)

	const {
		log,
		logi,
		log_br,
		push_undo,
		active_faction,
		contains_friendly,
		get_activation_cost,
		get_activation_cost_pair,
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
		update_jihad_level,
		is_controlled_by,
		set_control,
		bulls_eye_record_sr_space,
		roll_die,
		has_trench,
		place_trench,
		remove_trench
	} = context

	function resolve_cp_enter_empty_beachhead_by_movement(from_space, target, pieces_moving) {
		if (active_faction() !== CP) return false
		if (!Engine.map.is_beachhead_space(game, target)) return false
		let has_ap_units = get_pieces_in_space(game, target).some(
			(p) => Engine.game_utils.get_piece_effective_faction(game, p) === AP
		)
		if (has_ap_units) return false

		if (game.beachheads) set_delete(game.beachheads, target)
		if (Engine.map.is_non_balkan_beachhead(target)) {
			update_jihad_level(game, 1)
			log(`空滩头被同盟国占领并摧毁：${space_name(target)}，圣战等级 +1。`)
		} else {
			log(`空滩头被同盟国占领并摧毁：${space_name(target)}。`)
		}

		for (let p of pieces_moving) {
			game.pieces[p] = from_space
			set_add(game.moved, p)
		}

		game.move.current = from_space
		game.move.pieces = []
		game.move.touched_spaces = [game.move.initial, from_space]
		end_move_stack()
		return true
	}

	function should_stop_move_on_island_base(from_space, target) {
		if (!Engine.map.is_island_base(game, target)) return false
		return !Engine.map.is_island_base(game, from_space)
	}

	function should_create_beachhead_on_entry(from_space, target) {
		return Engine.map.can_ap_initiate_invasion_to_beachhead(game, from_space, target, active_faction())
	}

	function activation_now() {
		return Date.now()
	}

	function log_activation_debug(...args) {
		if (DEBUG_ACTIVATION_TRACE) {
			console.log(...args)
		}
	}

	function log_activation_group(title, spaces) {
		if (!Array.isArray(spaces) || spaces.length === 0) return
		log(title)
		for (let s of spaces) {
			let cost = map_get(game.activation_cost, s, 1)
			logi(space_name(s) + (cost > 1 ? ` (${cost} OPS)` : ""))
		}
	}

	function log_region_activation_group(title, mode) {
		let entries = get_region_activation_entries(mode)
		if (entries.length === 0) return
		log(title)
		for (let { space, stacks } of entries) {
			for (let stack of stacks) {
				let cost = Number(stack.cost) || 0
				logi(`${space_name(space)}: ${piece_list(stack.pieces)}${cost > 1 ? ` (${cost} OPS)` : ""}`)
			}
		}
	}

	function log_activation_summary() {
		let move_spaces = Array.isArray(game.activated.move) ? game.activated.move : []
		let attack_spaces = Array.isArray(game.activated.attack) ? game.activated.attack : []

		log_activation_group("MOVE", move_spaces)
		log_activation_group("ATTACK", attack_spaces)
		log_region_activation_group("MOVE", "move")
		log_region_activation_group("ATTACK", "attack")
	}

	function can_temporarily_end_current_move_in_overstacked_space(space_id, stopping_pieces = null) {
		let pieces = stopping_pieces ?? game.move?.pieces
		if (!Array.isArray(pieces) || pieces.length === 0) return false
		// 当前地块虽然超堆叠，但后续仍可继续移动已激活友军。
		return Engine.map.can_temporarily_end_move_in_space(game, space_id, active_faction(), pieces, {
			stopping_pieces_already_in_space: true,
			excluded_future_movers: pieces
		})
	}

	function get_current_move_end_block_reason(space_id, stopping_pieces = null) {
		let reason = get_move_end_space_block_reason(game, space_id, active_faction())
		if (reason === "堆叠超限" && can_temporarily_end_current_move_in_overstacked_space(space_id, stopping_pieces)) {
			return null
		}
		return reason
	}

	function get_unresolved_move_activation_violations() {
		let violations = []
		for (let s of game.activated.move || []) {
			let reason = get_move_end_space_block_reason(game, s, active_faction())
			if (reason) violations.push({ space: s, reason })
		}
		return violations
	}

	// === ACTIVATION HELPER ===
	function get_piece_activation_supply_status(p, faction) {
		let s = game.pieces[p]
		if (!(s > 0 && data.spaces[s])) return "OOS"
		return Engine.supply.get_supply_status(game, s, faction, p)
	}

	function has_unmoved_move_eligible_pieces_in_space(s, faction) {
		return get_pieces_in_space(game, s).some((p) => !set_has(game.moved, p) && can_piece_move_in_activation(p, faction))
	}

	function has_unmoved_allowed_move_pieces_in_space(s, allowed_pieces, faction) {
		if (!Array.isArray(allowed_pieces) || allowed_pieces.length === 0) return false
		return allowed_pieces.some(
			(p) => game.pieces[p] === s && !set_has(game.moved, p) && can_piece_move_in_activation(p, faction)
		)
	}

	function has_move_activation_options_in_space(s, faction) {
		if (has_unmoved_move_eligible_pieces_in_space(s, faction)) return true
		if (Engine.game_utils.can_combine_in_space(game, s, faction)) return true
		return can_space_entrench_in_activation(s)
	}

	function can_piece_participate_in_activation(p, faction) {
		if (p < 0 || !data.pieces[p]) return false
		if (is_not_on_map(game, p)) return false
		if (Engine.game_utils.get_piece_effective_faction(game, p) !== faction) return false
		if (get_piece_activation_supply_status(p, faction) === "OOS") return false
		if (Engine.neutral.is_greek_piece(p)) {
			return (
				Engine.neutral.can_move_piece_for_faction(game, p, faction) ||
				Engine.neutral.can_attack_piece_for_faction(game, p, faction)
			)
		}
		return true
	}

	function can_piece_move_in_activation(p, faction) {
		if (!can_piece_participate_in_activation(p, faction)) return false
		if (Engine.neutral.is_greek_piece(p) && !Engine.neutral.can_move_piece_for_faction(game, p, faction)) return false
		return get_piece_mf(p) > 0
	}

	function can_piece_attack_in_activation(p, s, faction) {
		if (!can_piece_participate_in_activation(p, faction)) return false
		if (get_piece_activation_supply_status(p, faction) === "LIMITED") return false
		if (Engine.neutral.is_greek_piece(p) && !Engine.neutral.can_attack_piece_for_faction(game, p, faction)) return false
		return can_activate_piece_in_space_to_attack(p, s)
	}

	function can_space_entrench_in_activation(s) {
		if (!Engine.game_utils.can_entrench_in_space(game, s, active_faction())) return false
		if (game.entrench_attempts && set_has(game.entrench_attempts, s)) return false
		return Engine.game_utils.get_entrenching_units_in_space(game, s, active_faction()).some((p) =>
			can_piece_participate_in_activation(p, active_faction())
		)
	}

	function ensure_region_activations() {
		if (!game.region_activations) game.region_activations = {}
		if (!game.region_activations.move) game.region_activations.move = {}
		if (!game.region_activations.attack) game.region_activations.attack = {}
		return game.region_activations
	}

	function get_region_activation_mode_map(mode) {
		return ensure_region_activations()[mode]
	}

	function get_region_activation_stacks(mode, s) {
		let mode_map = get_region_activation_mode_map(mode)
		return Array.isArray(mode_map[s]) ? mode_map[s] : []
	}

	function set_region_activation_stacks(mode, s, stacks) {
		let mode_map = get_region_activation_mode_map(mode)
		if (Array.isArray(stacks) && stacks.length > 0) mode_map[s] = stacks
		else delete mode_map[s]
	}

	function get_region_activation_entries(mode) {
		let entries = []
		let mode_map = get_region_activation_mode_map(mode)
		for (let key of Object.keys(mode_map)) {
			let stacks = mode_map[key]
			if (!Array.isArray(stacks) || stacks.length === 0) continue
			entries.push({ space: Number(key), stacks })
		}
		return entries
	}

	function has_region_activations(mode) {
		return get_region_activation_entries(mode).length > 0
	}

	function has_any_move_activations() {
		return (game.activated.move && game.activated.move.length > 0) || has_region_activations("move")
	}

	function get_region_activation_stack_for_piece(mode, p) {
		for (let { space, stacks } of get_region_activation_entries(mode)) {
			for (let index = 0; index < stacks.length; index++) {
				let stack = stacks[index]
				if (Array.isArray(stack.pieces) && set_has(stack.pieces, p)) {
					return { space, index, stack }
				}
			}
		}
		return null
	}

	function is_piece_region_activated(p) {
		return !!get_region_activation_stack_for_piece("move", p) || !!get_region_activation_stack_for_piece("attack", p)
	}

	function get_region_activation_available_pieces(mode, s, faction) {
		if (!Engine.map.is_region(game, s)) return []
		return get_pieces_in_space(game, s).filter((p) => {
			if (is_piece_region_activated(p)) return false
			if (mode === "move") return !set_has(game.moved, p) && can_piece_move_in_activation(p, faction)
			return !set_has(game.moved, p) && can_piece_attack_in_activation(p, s, faction)
		})
	}

	function get_region_activation_cost(mode, s, pieces) {
		let costs = get_activation_cost_pair(game, s, pieces)
		return mode === "move" ? costs.move : costs.attack
	}

	function get_region_activation_attack_targets(pieces) {
		return Engine.combat.get_legal_attackable_spaces(
			game,
			pieces,
			active_faction(),
			() => Engine.game_utils.get_season(game),
			is_rail_connected_to_supply
		)
	}

	function get_region_activation_block_reason(mode, s, pieces) {
		let composition_reason = Engine.map.get_region_activation_stack_block_reason(game, pieces)
		if (composition_reason) return composition_reason
		for (let p of pieces) {
			if (game.pieces[p] !== s) return "单位不在该大区"
			if (is_piece_region_activated(p)) return "单位已激活"
			if (mode === "move") {
				if (set_has(game.moved, p) || !can_piece_move_in_activation(p, active_faction())) return "单位不能移动"
			} else if (set_has(game.moved, p) || !can_piece_attack_in_activation(p, s, active_faction())) {
				return "单位不能进攻"
			}
		}
		let cost = get_region_activation_cost(mode, s, pieces)
		if (!Number.isFinite(cost)) return "OPS不足以激活该堆叠"
		if (cost > game.ops) return "行动点不足"
		if (mode === "attack" && get_region_activation_attack_targets(pieces).length === 0) return "没有共同攻击目标"
		return null
	}

	function has_region_activation_options_in_space(mode, s, faction) {
		if (game.ops <= 0) return false
		return get_region_activation_available_pieces(mode, s, faction).some((p) => {
			let cost = get_region_activation_cost(mode, s, [p])
			return Number.isFinite(cost) && cost <= game.ops
		})
	}

	function get_region_activation_total_cost_for_space(s) {
		let total = 0
		for (let mode of ["move", "attack"]) {
			for (let stack of get_region_activation_stacks(mode, s)) {
				total += Number(stack.cost) || 0
			}
		}
		return total
	}

	function update_region_activation_cost_for_space(s) {
		if (!game.activation_cost) game.activation_cost = {}
		let total = get_region_activation_total_cost_for_space(s)
		if (total > 0) map_set(game.activation_cost, s, total)
		else map_delete(game.activation_cost, s)
	}

	function add_region_activation_stack(mode, s, pieces, cost) {
		let stacks = get_region_activation_stacks(mode, s).slice()
		stacks.push({
			pieces: pieces.slice().sort((a, b) => a - b),
			cost
		})
		set_region_activation_stacks(mode, s, stacks)
		update_region_activation_cost_for_space(s)
	}

	function refund_region_activations_for_space(s) {
		let refund = get_region_activation_total_cost_for_space(s)
		if (refund === 0) return 0
		set_region_activation_stacks("move", s, [])
		set_region_activation_stacks("attack", s, [])
		update_region_activation_cost_for_space(s)
		game.ops += refund
		return refund
	}

	function clear_region_activation_mode(mode) {
		let mode_map = get_region_activation_mode_map(mode)
		for (let key of Object.keys(mode_map)) {
			delete mode_map[key]
		}
	}

	function prune_region_move_activations() {
		let faction = active_faction()
		for (let { space, stacks } of get_region_activation_entries("move")) {
			let remaining = stacks.filter((stack) =>
				Array.isArray(stack.pieces) &&
				stack.pieces.some(
					(p) => game.pieces[p] === space && !set_has(game.moved, p) && can_piece_move_in_activation(p, faction)
				)
			)
			set_region_activation_stacks("move", space, remaining)
			update_region_activation_cost_for_space(space)
		}
	}

	function begin_region_activation_selection(mode, s) {
		game.region_activation_selection = {
			mode,
			space: s,
			pieces: []
		}
		game.state = "activate_region_stack"
	}

	function clear_region_activation_selection() {
		delete game.region_activation_selection
	}

	function can_selected_move_pieces_combine(selected_pieces) {
		if (!Array.isArray(selected_pieces) || selected_pieces.length < 2 || selected_pieces.length > 3) return false
		let available = get_available_combine_scus()
		if (!selected_pieces.every((p) => set_has(available, p))) return false
		return get_valid_lcus_for_selected_scus(selected_pieces).length > 0
	}

	function space_has_adjacent_enemy(s, faction, enemy_space_flag = null) {
		let info = data.spaces[s]
		if (!info || !Array.isArray(info.connections)) return false
		for (let n of info.connections) {
			if (enemy_space_flag) {
				if (enemy_space_flag[n] === 1) return true
			} else if (Engine.map.contains_enemy_pieces(game, n, faction)) {
				return true
			}
		}
		return false
	}

	function is_russo_british_russian_activation() {
		return Engine.event_states.is_russo_british_russian_activation(game)
	}

	function is_romania_event_activation() {
		return Engine.event_states.is_romania_event_activation(game)
	}

	function get_russo_british_legal_attack_spaces(pieces_by_space) {
		if (!pieces_by_space) {
			pieces_by_space = new Map()
			for (let p = 0; p < game.pieces.length; p++) {
				let s = game.pieces[p]
				if (s <= 0 || is_not_on_map(game, p)) continue
				let list = pieces_by_space.get(s)
				if (!list) {
					list = []
					pieces_by_space.set(s, list)
				}
				list.push(p)
			}
		}
		let legal = []
		for (let [s, pieces] of pieces_by_space) {
			let has_ru_can_attack = pieces.some(
				(p) => data.pieces[p].nation === "ru" && can_piece_attack_in_activation(p, s, AP)
			)
			if (has_ru_can_attack) {
				legal.push(s)
			}
		}
		return legal
	}

	function get_romania_event_legal_attack_spaces(pieces_by_space) {
		if (!pieces_by_space) {
			pieces_by_space = new Map()
			for (let p = 0; p < game.pieces.length; p++) {
				let s = game.pieces[p]
				if (s <= 0 || is_not_on_map(game, p)) continue
				let list = pieces_by_space.get(s)
				if (!list) {
					list = []
					pieces_by_space.set(s, list)
				}
				list.push(p)
			}
		}
		let legal = []
		for (let [s, pieces] of pieces_by_space) {
			let has_ro_can_attack = pieces.some(
				(p) => data.pieces[p].nation === "ro" && can_piece_attack_in_activation(p, s, AP)
			)
			if (has_ro_can_attack) {
				legal.push(s)
			}
		}
		return legal
	}

	states.activate_spaces = {
		prompt(res) {
			if (res && res._is_noop) return
			let perf_start = DEBUG_ACTIVATION_TRACE ? activation_now() : 0
			let perf_attack_checks = 0
			let perf_enemy_adjacency_checks = 0
			let perf_attack_ms = 0
			let perf_enemy_adjacency_ms = 0
			let event_prompt = Engine.event_states.get_activation_prompt(game)
			if (event_prompt) {
				res.prompt(event_prompt)
			} else {
				res.prompt(`选择激活的地块 (剩余行动点: ${game.ops})`)
			}

			let faction = active_faction()
			let russo_british_mode = is_russo_british_russian_activation()
			let romania_mode = is_romania_event_activation()
			let russo_british_selected = Array.isArray(game.activated?.attack) ? game.activated.attack.length : 0
			let romania_selected = Array.isArray(game.activated?.attack) ? game.activated.attack.length : 0
			let all_pieces_by_space = new Map()
			let pieces_by_space = new Map()
			let activated_move_set = new Set(game.activated.move || [])
			let activated_attack_set = new Set(game.activated.attack || [])
			let enemy = other_faction(faction)
			let enemy_space_flag = new Uint8Array(data.spaces.length)
			for (let p = 0; p < game.pieces.length; p++) {
				let s = game.pieces[p]
				if (s <= 0 || is_not_on_map(game, p)) continue
				let all_list = all_pieces_by_space.get(s)
				if (!all_list) {
					all_list = []
					all_pieces_by_space.set(s, all_list)
				}
				all_list.push(p)
				if (Engine.game_utils.get_piece_effective_faction(game, p) === enemy) {
					enemy_space_flag[s] = 1
				}
				if (!can_piece_participate_in_activation(p, faction)) continue
				let list = pieces_by_space.get(s)
				if (!list) {
					list = []
					pieces_by_space.set(s, list)
				}
				list.push(p)
			}
			let russo_british_legal_spaces = russo_british_mode ? get_russo_british_legal_attack_spaces(pieces_by_space) : []
			let russo_british_required_count = russo_british_mode ? Math.min(2, russo_british_legal_spaces.length) : 0
			let russo_british_legal_set = russo_british_mode ? new Set(russo_british_legal_spaces) : null
			let romania_legal_spaces = romania_mode ? get_romania_event_legal_attack_spaces(pieces_by_space) : []
			let romania_required_count = romania_mode ? Math.min(1, romania_legal_spaces.length) : 0
			let romania_legal_set = romania_mode ? new Set(romania_legal_spaces) : null

			for (let [s, friendly_pieces] of pieces_by_space) {
				let is_region_space = Engine.map.is_region(game, s)
				if (!is_region_space && (activated_move_set.has(s) || activated_attack_set.has(s))) continue

				let costs = is_region_space ? { move: 1, attack: 1 } : get_activation_cost_pair(game, s, all_pieces_by_space.get(s))
				let move_cost = costs.move
				let attack_cost = costs.attack
				let unmoved_pieces = friendly_pieces.filter((p) => !set_has(game.moved, p))

				let can_move = is_region_space
					? has_region_activation_options_in_space("move", s, faction)
					: game.ops >= move_cost && has_move_activation_options_in_space(s, faction)
				let can_attack = false
				if (is_region_space) {
					can_attack = has_region_activation_options_in_space("attack", s, faction)
				} else if (game.ops >= attack_cost && unmoved_pieces.length > 0) {
					let has_adjacent_enemy = false
					let t_adj = DEBUG_ACTIVATION_TRACE ? activation_now() : 0
					has_adjacent_enemy = space_has_adjacent_enemy(s, faction, enemy_space_flag)
					if (DEBUG_ACTIVATION_TRACE) {
						perf_enemy_adjacency_checks += 1
						perf_enemy_adjacency_ms += activation_now() - t_adj
					}
					if (has_adjacent_enemy) {
						let t0 = DEBUG_ACTIVATION_TRACE ? activation_now() : 0
						can_attack = unmoved_pieces.some((p) => can_piece_attack_in_activation(p, s, faction))
						if (DEBUG_ACTIVATION_TRACE) {
							perf_attack_checks += 1
							perf_attack_ms += activation_now() - t0
						}
					}
				}

				if (russo_british_mode) {
					if (!russo_british_legal_set.has(s)) continue
					if (activated_attack_set.has(s) || russo_british_selected < russo_british_required_count) {
						res.action("activate_attack", s)
					}
					continue
				}

				if (romania_mode) {
					if (!romania_legal_set.has(s)) continue
					if (activated_attack_set.has(s) || romania_selected < romania_required_count) {
						res.action("activate_attack", s)
					}
					continue
				}

				if (can_move) res.action("activate_move", s)
				if (can_attack) res.action("activate_attack", s)
			}

			let deactivated_spaces = new Set()
			for (let s of game.activated.move) {
				if (!russo_british_mode && !deactivated_spaces.has(s)) {
					res.action("deactivate", s)
					deactivated_spaces.add(s)
				}
			}
			for (let s of game.activated.attack) {
				if (!deactivated_spaces.has(s)) {
					if (game.liberate_suez_op_required && Engine.map.is_egypt(s)) continue
					if (russo_british_mode && !russo_british_legal_set.has(s)) continue
					if (romania_mode && !romania_legal_set.has(s)) continue
					res.action("deactivate", s)
					deactivated_spaces.add(s)
				}
			}
			for (let { space } of get_region_activation_entries("move")) {
				if (!russo_british_mode && !deactivated_spaces.has(space)) {
					res.action("deactivate", space)
					deactivated_spaces.add(space)
				}
			}
			for (let { space } of get_region_activation_entries("attack")) {
				if (!deactivated_spaces.has(space)) {
					res.action("deactivate", space)
					deactivated_spaces.add(space)
				}
			}

			let can_done = true
			if (game.liberate_suez_op_required) {
				if (!Engine.event_states.check_liberate_suez_ops(game)) {
					can_done = false
				}
			}

			if (russo_british_mode) {
				can_done = russo_british_required_count === 0 || russo_british_selected >= russo_british_required_count
			}
			if (romania_mode) {
				can_done = romania_required_count === 0 || romania_selected >= romania_required_count
			}

			if (can_done) {
				res.action("done")
			}
			if (DEBUG_ACTIVATION_TRACE) {
				log_activation_debug("[调试][activation-perf]", {
					phase: "activate_spaces.prompt",
					total_ms: activation_now() - perf_start,
					pieces_by_space: pieces_by_space.size,
					enemy_adjacency_checks: perf_enemy_adjacency_checks,
					enemy_adjacency_ms: perf_enemy_adjacency_ms,
					attack_checks: perf_attack_checks,
					attack_ms: perf_attack_ms
				})
			}
		},
		activate_move(s) {
			if (Engine.map.is_region(game, s)) {
				if (!has_region_activation_options_in_space("move", s, active_faction())) return
				begin_region_activation_selection("move", s)
				return
			}
			if (!has_move_activation_options_in_space(s, active_faction())) return
			push_undo()
			let cost = get_activation_cost(game, s, "move")
			game.ops -= cost
			set_add(game.activated.move, s)
			if (!game.activation_cost) game.activation_cost = {}
			map_set(game.activation_cost, s, cost)
			if (game.ops === 0) states.activate_spaces.done()
		},
		activate_attack(s) {
			let faction = active_faction()
			if (Engine.map.is_region(game, s)) {
				if (!has_region_activation_options_in_space("attack", s, faction)) return
				begin_region_activation_selection("attack", s)
				return
			}
			let unmoved_pieces = get_pieces_in_space(game, s).filter((p) => !set_has(game.moved, p))
			if (!unmoved_pieces.some((p) => can_piece_attack_in_activation(p, s, faction))) return
			push_undo()
			let russo_british_mode = is_russo_british_russian_activation()
			let romania_mode = is_romania_event_activation()
			let cost = russo_british_mode || romania_mode ? 0 : get_activation_cost(game, s, "attack")
			game.ops -= cost
			set_add(game.activated.attack, s)
			if (!game.activation_cost) game.activation_cost = {}
			map_set(game.activation_cost, s, cost)

			if (russo_british_mode) {
				let required_count = Math.min(2, get_russo_british_legal_attack_spaces().length)
				if (game.activated.attack.length >= required_count) {
					states.activate_spaces.done()
				}
			} else if (romania_mode) {
				let required_count = Math.min(1, get_romania_event_legal_attack_spaces().length)
				if (game.activated.attack.length >= required_count) {
					states.activate_spaces.done()
				}
			} else if (game.ops === 0) {
				states.activate_spaces.done()
			}
		},
		deactivate(s) {
			if (game.liberate_suez_op_required && set_has(game.activated.attack, s) && Engine.map.is_egypt(s)) {
				log("解放苏伊士：埃及地区已激活的进攻不能取消。")
				return
			}
			push_undo()
			let total_cost_before = map_get(game.activation_cost, s) || 0
			let region_refund = refund_region_activations_for_space(s)
			let had_ordinary_activation = set_has(game.activated.move, s) || set_has(game.activated.attack, s)
			if (had_ordinary_activation) {
				let ordinary_cost = total_cost_before - region_refund
				if (ordinary_cost <= 0) ordinary_cost = total_cost_before
				set_delete(game.activated.move, s)
				set_delete(game.activated.attack, s)
				game.ops += ordinary_cost
				map_delete(game.activation_cost, s)
			}
		},
		done() {
			let russo_british_mode = is_russo_british_russian_activation()
			let romania_mode = is_romania_event_activation()
			if (is_russo_british_russian_activation()) {
				let required_count = Math.min(2, get_russo_british_legal_attack_spaces().length)
				if (required_count > 0 && game.activated.attack.length < required_count) {
					return
				}
				delete game.russo_british_russian_activation
			}
			if (romania_mode) {
				let required_count = Math.min(1, get_romania_event_legal_attack_spaces().length)
				if (required_count > 0 && game.activated.attack.length < required_count) {
					return
				}
				delete game.romania_event_activation
				if (required_count === 0) {
					game.state = "event_romania_attack_cleanup"
					return
				}
			}
			if (!russo_british_mode) log_activation_summary()
			if (Engine.event_states.on_activation_done(game)) {
				return
			}

			if (has_any_move_activations()) {
				game.state = "choose_move_space"
			} else {
				refresh_attack_eligibility()
				if (game.eligible_attackers.length > 0) {
					game.state = "attack"
				} else {
					game.state = "end_operations"
				}
			}
		}
	}

	states.activate_region_stack = {
		prompt(res) {
			let selection = game.region_activation_selection
			if (!selection) {
				game.state = "activate_spaces"
				return
			}
			let { mode, space, pieces } = selection
			let mode_name = mode === "move" ? "移动" : "进攻"
			let available = get_region_activation_available_pieces(mode, space, active_faction())
			res.where(space)
			res.who(pieces)
			res.prompt(`选择 ${space_name(space)} 中要${mode_name}激活的堆叠`)

			for (let p of get_pieces_in_space(game, space)) {
				if (set_has(pieces, p) || set_has(available, p)) {
					res.piece(p)
				}
			}

			if (pieces.length > 0) {
				let reason = get_region_activation_block_reason(mode, space, pieces)
				if (!reason) {
					let cost = get_region_activation_cost(mode, space, pieces)
					res.action("confirm")
					res.prompt(`确认${mode_name}激活 ${piece_list(pieces)} (花费 ${cost} OPS)`)
				}
			}

			res.action("cancel")
		},
		piece(p) {
			let selection = game.region_activation_selection
			if (!selection) return
			let { mode, space } = selection
			if (game.pieces[p] !== space) return
			let available = get_region_activation_available_pieces(mode, space, active_faction())
			if (!set_has(selection.pieces, p) && !set_has(available, p)) return
			set_toggle(selection.pieces, p)
		},
		confirm() {
			let selection = game.region_activation_selection
			if (!selection || selection.pieces.length === 0) return
			let { mode, space, pieces } = selection
			let reason = get_region_activation_block_reason(mode, space, pieces)
			if (reason) {
				log(`${space_name(space)} 不能按所选堆叠激活：${reason}`)
				return
			}
			push_undo()
			let cost = get_region_activation_cost(mode, space, pieces)
			game.ops -= cost
			add_region_activation_stack(mode, space, pieces, cost)
			clear_region_activation_selection()
			game.state = "activate_spaces"
			if (game.ops === 0) states.activate_spaces.done()
		},
		cancel() {
			clear_region_activation_selection()
			game.state = "activate_spaces"
		}
	}

	// --- LCU COMBINATION AND BREAKDOWN ---

	states.choose_move_space = {
		prompt(res) {
			let can_entrench = false
			let can_combine = false
			res.prompt("移动已激活的单位.")

			let can_move = false
			for (let s of game.activated.move) {
				let pieces = get_pieces_in_space(game, s)
				let has_movable = false
				for (let p of pieces) {
					if (can_piece_move_in_activation(p, active_faction()) && !set_has(game.moved, p)) {
						res.piece(p)
						can_move = true
						has_movable = true
					}
				}
				let can_combine_here = Engine.game_utils.can_combine_in_space(game, s, active_faction())
				let can_entrench_here = can_space_entrench_in_activation(s)
				if (has_movable || can_combine_here || can_entrench_here) {
					res.space(s)
				}
				if (can_combine_here) {
					can_combine = true
				}
				if (can_entrench_here) {
					can_entrench = true
				}
			}
			for (let { space, stacks } of get_region_activation_entries("move")) {
				for (let stack of stacks) {
					for (let p of stack.pieces || []) {
						if (game.pieces[p] !== space) continue
						if (can_piece_move_in_activation(p, active_faction()) && !set_has(game.moved, p)) {
							res.piece(p)
							can_move = true
						}
					}
				}
			}

			if (can_entrench) {
				res.prompt("移动或掘壕已激活的单位.")
			}

			res.action("done")

			if (!can_move && !can_entrench && !can_combine) {
				this.done()
			}
		},
		space(s) {
			if (game.activated.move.includes(s)) {
				let can_entrench_here = can_space_entrench_in_activation(s)
				if (Engine.game_utils.can_combine_in_space(game, s, active_faction()) || can_entrench_here) {
					game.where = s
					game.state = "choose_move_action"
					return
				}
				push_undo()
				log_br()
				log("Moved from " + space_name(s))
				game.where = s
				game.move = {
					initial: s,
					current: s,
					spaces_moved: 0,
					pieces: [],
					touched_spaces: [s]
				}
				game.state = "choose_pieces_to_move"
			}
		},
		piece(p) {
			let region_activation = get_region_activation_stack_for_piece("move", p)
			let s = region_activation ? region_activation.space : game.pieces[p]
			push_undo()
			log_br()
			log("Moved from " + space_name(s))
			game.where = s
			game.move = {
				initial: s,
				current: s,
				spaces_moved: 0,
				pieces: [p],
				touched_spaces: [s],
				allowed_activation_pieces: region_activation ? region_activation.stack.pieces.slice() : null
			}
			game.state = "choose_pieces_to_move"
		},
		done() {
			// 与 POG 一样，移动阶段整体结束时仍必须没有未解消的超堆叠。
			let violations = get_unresolved_move_activation_violations()
			if (violations.length > 0) {
				for (let { space, reason } of violations) {
					log(`不能结束移动阶段：${space_name(space)} 仍不合法（${reason}）`)
				}
				return
			}
			game.where = -1
			game.activated.move = []
			clear_region_activation_mode("move")

			if (game.move_from_event) {
				delete game.move_from_event
				goto_end_event()
				return
			}

			refresh_attack_eligibility()
			if (game.eligible_attackers.length > 0) game.state = "attack"
			else game.state = "end_operations"
		}
	}

	states.choose_move_action = {
		prompt(res) {
			let s = game.where
			res.prompt(`${space_name(s)}: 选择操作`)
			res.where(s)

			let has_movable = get_pieces_in_space(game, s).some((p) => {
				return can_piece_move_in_activation(p, active_faction()) && !set_has(game.moved, p)
			})
			for (let p of get_pieces_in_space(game, s)) {
				if (can_piece_move_in_activation(p, active_faction()) && !set_has(game.moved, p)) {
					res.piece(p)
				}
			}

			if (has_movable) {
				res.action("move")
			}
			if (Engine.game_utils.can_combine_in_space(game, s, active_faction())) {
				res.action("combine")
			}
			if (can_space_entrench_in_activation(s)) {
				res.action("entrench")
			}
			res.action("cancel")
		},
		move() {
			let s = game.where
			game.where = -1
			game.state = "choose_move_space"
			// Force the move action by bypassing the check in space(s)
			push_undo()
			game.where = s
			game.move = {
				initial: s,
				current: s,
				spaces_moved: 0,
				pieces: [],
				touched_spaces: [s]
			}
			game.state = "choose_pieces_to_move"
		},
		piece(p) {
			let s = game.where
			if (game.pieces[p] !== s) return
			if (!can_piece_move_in_activation(p, active_faction())) return
			if (set_has(game.moved, p)) return
			game.where = -1
			game.state = "choose_move_space"
			push_undo()
			game.where = s
			game.move = {
				initial: s,
				current: s,
				spaces_moved: 0,
				pieces: [p],
				touched_spaces: [s]
			}
			game.state = "choose_pieces_to_move"
		},
		combine() {
			let s = game.where
			if (!Engine.game_utils.can_combine_in_space(game, s, active_faction())) return
			game.where = -1
			game.state = "choose_move_space"
			push_undo()
			enter_combine_lcu_state(s)
		},
		entrench() {
			let s = game.where
			if (!can_space_entrench_in_activation(s)) return
			game.where = -1
			game.state = "choose_move_space"
			push_undo()
			game.where = s
			game.state = "entrench"
		},
		cancel() {
			game.where = -1
			game.state = "choose_move_space"
		}
	}

	states.entrench = {
		prompt(res) {
			let s = game.where
			let units = Engine.game_utils
				.get_entrenching_units_in_space(game, s, active_faction())
				.filter((p) => can_piece_participate_in_activation(p, active_faction()))
			let selected = game.entrench_pieces || []
			res.prompt(`在 ${space_name(s)} 选择参与挖壕的单位（当前已选: ${selected.length} 个）`)
			res.where(s)
			res.who(selected)

			for (let p of units) {
				res.piece(p)
			}

			if (selected.length > 0) {
				res.action("roll")
			}
			res.action("cancel")
		},
		piece(p) {
			if (!game.entrench_pieces) game.entrench_pieces = []
			set_toggle(game.entrench_pieces, p)
		},
		roll() {
			game.state = "entrench_roll"
		},
		cancel() {
			delete game.entrench_pieces
			game.state = "choose_move_action"
		}
	}

	states.entrench_roll = {
		prompt(res) {
			res.prompt("掷骰尝试挖壕。")
			res.action("roll")
		},
		roll() {
			let s = game.where
			let selected = game.entrench_pieces
			let roll = roll_die(6, game)

			// Rule 15.4.1: Only one Trench building attempt may be made per space in an Action Round
			if (!game.entrench_attempts) game.entrench_attempts = []
			set_add(game.entrench_attempts, s)

			// Rule 15.4.2:
			// • If there is an LCU in the space, the Trench is built on a roll of 1–3. On a roll of 4–6, the attempt fails.
			// • If only SCUs are in the space, a roll equal to or less than the number of regular combat SCUs indicates that the Trench was built.
			//   However, the attempt always fails on a roll of 4-6.
			let has_lcu_val = selected.some((p) => is_lcu(p))
			let regular_scu_count = selected.filter(
				(p) => is_scu(p) && !is_tribe(p) && !Engine.game_utils.is_irregular(p)
			).length

			let success = false
			if (roll >= 1 && roll <= 3) {
				if (has_lcu_val) {
					success = true // LCU: 1-3
				} else if (roll <= regular_scu_count) {
					success = true // SCU only: roll <= count (max 3)
				}
			}
			let target = has_lcu_val ? 3 : Math.min(3, regular_scu_count)
			log(`掘壕尝试：${space_name(s)}`)
			log(`> ${roll} <= ${target} -> ${success ? "成功" : "失败"}`)
			if (success) {
				place_trench(game, s, active_faction())
			}

			// All participating units are marked as moved (cannot move further)
			for (let p of selected) {
				set_add(game.moved, p)
				if (!game.entrenching) game.entrenching = []
				set_add(game.entrenching, p)
			}

			// Clean up and return
			delete game.entrench_pieces
			game.where = -1
			game.state = "choose_move_space"
		}
	}

	states.combine_lcu = {
		prompt(res) {
			let selected = get_selected_combine_scus()
			res.prompt(`在 ${space_name(game.where)} 选择2或3个SCU进行组合`)
			res.where(game.where)
			res.who(selected)

			for (let p of get_available_combine_scus()) {
				res.piece(p)
			}

			if (selected.length >= 2 && get_valid_lcus_for_selected_scus(selected).length > 0) {
				res.action("select_lcu")
			}
			if (selected.length > 0) {
				res.action("clear")
			}
			res.action("cancel")
		},
		piece(p) {
			if (!set_has(get_available_combine_scus(), p)) {
				return
			}
			let selected = get_selected_combine_scus()
			if (set_has(selected, p)) {
				set_delete(selected, p)
				return
			}
			if (selected.length >= 3) {
				return
			}
			set_add(selected, p)
			if (selected.length >= 2) {
				let valid_lcus = get_valid_lcus_for_selected_scus(selected)
				if (valid_lcus.length === 0) {
					// Check if it could be part of a 3-piece combo
					let available = get_available_combine_scus()
					let could_be_3 = false
					if (selected.length === 2) {
						for (let third of available) {
							if (!set_has(selected, third)) {
								let test_3 = [...selected, third]
								if (get_valid_lcus_for_selected_scus(test_3).length > 0) {
									could_be_3 = true
									break
								}
							}
						}
					}

					if (!could_be_3) {
						set_delete(selected, p)
					}
				}
			}
		},
		select_lcu() {
			let selected = get_selected_combine_scus()
			if (selected.length < 2) {
				return
			}
			if (get_valid_lcus_for_selected_scus(selected).length === 0) {
				return
			}
			game.state = "combine_lcu_select_lcu"
		},
		clear() {
			game.combine_ctx = { selected_scus: [] }
		},
		cancel() {
			clear_combine_ctx()
			return_to_combine_entry()
		}
	}

	states.combine_lcu_select_lcu = {
		prompt(res) {
			let selected = get_selected_combine_scus()
			res.prompt(`选择预备区中可与已选SCU组合的LCU`)
			res.where(game.where)
			res.who(selected)
			res.space(get_lcu_reserve_box(active_faction()))

			for (let lcu of get_valid_lcus_for_selected_scus(selected)) {
				res.piece(lcu)
			}

			res.action("back")
			res.action("cancel")
		},
		piece(lcu_id) {
			let selected = get_selected_combine_scus()
			let options = get_manual_combination_for_lcu(lcu_id, selected)
			if (!options) {
				return
			}
			let previous_ctx = game.combine_ctx || {}
			game.combine_ctx = {
				...previous_ctx,
				selected_scus: selected.slice(),
				lcu_id,
				type: options.type,
				pending_scus: selected.slice()
			}
			game.state = "combine_lcu_dispose_reserve"
		},
		back() {
			game.state = "combine_lcu"
		},
		cancel() {
			clear_combine_ctx()
			return_to_combine_entry()
		}
	}

	states.combine_lcu_dispose_reserve = {
		prompt(res) {
			let ctx = game.combine_ctx
			if (!ctx || !ctx.pending_scus || ctx.pending_scus.length === 0) {
				return_to_combine_entry()
				return
			}
			res.prompt("选择移入预备区的SCU")
			res.where(game.where)
			res.space(get_scu_reserve_box(active_faction()))
			res.who(ctx.pending_scus)
			for (let p of ctx.pending_scus) res.piece(p)
			res.action("cancel")
		},
		piece(p) {
			let ctx = game.combine_ctx
			if (!ctx || !set_has(ctx.pending_scus, p)) return
			game.pieces[p] = get_scu_reserve_box(data.pieces[p].faction)
			set_delete(ctx.pending_scus, p)
			log(`SCU ${data.pieces[p].name} to reserve.`)
			if (ctx.type === "full") game.state = "combine_lcu_dispose_eliminated"
			else game.state = "combine_lcu_dispose_removed"
		},
		cancel() {
			clear_combine_ctx()
			return_to_combine_entry()
		}
	}

	states.combine_lcu_dispose_eliminated = {
		prompt(res) {
			let ctx = game.combine_ctx
			if (!ctx || !ctx.pending_scus || ctx.pending_scus.length === 0) {
				return_to_combine_entry()
				return
			}
			res.prompt("选择移入被消灭区的SCU")
			res.where(game.where)
			res.space(get_eliminated_box(active_faction()))
			res.who(ctx.pending_scus)
			for (let p of ctx.pending_scus) res.piece(p)
			res.action("cancel")
		},
		piece(p) {
			let ctx = game.combine_ctx
			if (!ctx || !set_has(ctx.pending_scus, p)) return
			game.pieces[p] = get_eliminated_box(data.pieces[p].faction)
			set_delete(game.reduced, p)
			set_delete(ctx.pending_scus, p)
			log(`SCU ${data.pieces[p].name} to eliminated.`)
			game.state = "combine_lcu_dispose_removed"
		},
		cancel() {
			clear_combine_ctx()
			return_to_combine_entry()
		}
	}

	states.combine_lcu_dispose_removed = {
		prompt(res) {
			let ctx = game.combine_ctx
			if (!ctx || !ctx.pending_scus || ctx.pending_scus.length === 0) {
				return_to_combine_entry()
				return
			}
			res.prompt("选择移入PE的SCU")
			res.where(game.where)
			res.space(get_permanently_eliminated_box(active_faction()))
			res.who(ctx.pending_scus)
			for (let p of ctx.pending_scus) res.piece(p)
			res.action("cancel")
		},
		piece(p) {
			let ctx = game.combine_ctx
			if (!ctx || !set_has(ctx.pending_scus, p)) return
			game.pieces[p] = get_permanently_eliminated_box(data.pieces[p].faction)
			set_delete(ctx.pending_scus, p)
			log(`SCU ${data.pieces[p].name} removed.`)
			finalize_manual_combination()
		},
		cancel() {
			clear_combine_ctx()
			return_to_combine_entry()
		}
	}

	function get_available_combine_scus() {
		const { game_utils, supply } = Engine
		let pieces = get_pieces_in_space(game, game.where)
		log_activation_debug(`[调试] get_available_combine_scus in space: ${game.where}, pieces in space: ${pieces}`)
		return pieces.filter((p) => {
			let info = data.pieces[p]
			if (!is_scu(p)) {
				log_activation_debug(`[调试] piece ${p} (${info.name}) is not SCU`)
				return false
			}
			if (game.combine_ctx && game.combine_ctx.allowed_scus) {
				if (!set_has(game.combine_ctx.allowed_scus, p)) {
					log_activation_debug(`[调试] piece ${p} (${info.name}) not in allowed_scus`)
					return false
				}
			}
			if (is_hq(p)) {
				log_activation_debug(`[调试] piece ${p} (${info.name}) is HQ`)
				return false
			}
			if (is_tribe(p)) {
				log_activation_debug(`[调试] piece ${p} (${info.name}) is Tribe`)
				return false
			}
			if (game_utils.get_piece_effective_faction(game, p) !== active_faction()) {
				log_activation_debug(`[调试] piece ${p} (${info.name}) faction mismatch`)
				return false
			}
			if (set_has(game.moved, p)) {
				log_activation_debug(`[调试] piece ${p} (${info.name}) already moved`)
				return false
			}
			if (info.type === "irregular") {
				log_activation_debug(`[调试] piece ${p} (${info.name}) is irregular`)
				return false
			}
			let badge = game_utils.get_piece_badge(p)
			if (badge === "yellow") {
				log_activation_debug(`[调试] piece ${p} (${info.name}) has yellow badge`)
				return false
			}
			let status = supply.get_supply_status(game, game.where, active_faction(), p)
			if (status === "OOS") {
				log_activation_debug(`[调试] piece ${p} (${info.name}) out of supply`)
				return false
			}
			if (status === "LIMITED") {
				log_activation_debug(`[调试] piece ${p} (${info.name}) in limited supply`)
				return false
			}
			return true
		})
	}

	function get_selected_combine_scus() {
		if (!game.combine_ctx) game.combine_ctx = {}
		if (!game.combine_ctx.selected_scus) game.combine_ctx.selected_scus = []
		return game.combine_ctx.selected_scus
	}

	function get_manual_combination_for_lcu(lcu_id, selected_scus) {
		let options = Engine.game_utils.get_combination_options_for_lcu(game, lcu_id, selected_scus.slice(), game.where)
		if (!options) {
			log_activation_debug(`[调试] get_manual_combination_for_lcu: no options for lcu ${data.pieces[lcu_id].name}`)
			return null
		}
		if (selected_scus.length !== options.pieces.length) {
			log_activation_debug(
				`[调试] get_manual_combination_for_lcu: count mismatch for lcu ${data.pieces[lcu_id].name}: selected=${selected_scus.length}, found=${options.pieces.length}`
			)
			return null
		}
		if (selected_scus.length === 3 && options.type !== "full") {
			log_activation_debug(`[调试] get_manual_combination_for_lcu: not full for lcu ${data.pieces[lcu_id].name}`)
			return null
		}
		if (selected_scus.length === 2 && options.type !== "reduced") {
			log_activation_debug(`[调试] get_manual_combination_for_lcu: not reduced for lcu ${data.pieces[lcu_id].name}`)
			return null
		}
		for (let p of options.pieces) {
			if (!set_has(selected_scus, p)) {
				log_activation_debug(`[调试] get_manual_combination_for_lcu: piece mismatch for lcu ${data.pieces[lcu_id].name}`)
				return null
			}
		}
		return options
	}

	function get_valid_lcus_for_selected_scus(selected_scus) {
		if (selected_scus.length < 2 || selected_scus.length > 3) return []
		let faction = active_faction()
		let lcus = Engine.game_utils.get_available_lcus_in_reserve(game, faction)
		if (game.combine_ctx && game.combine_ctx.allowed_lcus) {
			lcus = lcus.filter((lcu) => set_has(game.combine_ctx.allowed_lcus, lcu))
		}
		log_activation_debug(
			`[调试] get_valid_lcus_for_selected_scus: faction=${faction}, reserve lcus: ${lcus.map((id) => data.pieces[id].name)}`
		)
		return lcus.filter((lcu) => {
			let res = get_manual_combination_for_lcu(lcu, selected_scus)
			log_activation_debug(`[调试] check lcu ${data.pieces[lcu].name}: valid=${!!res}`)
			return !!res
		})
	}

	function clear_combine_ctx() {
		delete game.combine_ctx
	}

	function enter_combine_lcu_state(space) {
		clear_combine_ctx()
		game.where = space
		game.state = "combine_lcu"
		log(`开始组合(${space_name(space)})`)
	}

	function return_to_combine_entry() {
		if (game.event_next_state) {
			let next_state = game.event_next_state
			delete game.event_next_state
			game.state = next_state
		} else {
			game.state = game.move_from_attack ? "attack" : "choose_move_space"
		}
		delete game.move_from_attack
	}

	function finalize_manual_combination() {
		let ctx = game.combine_ctx
		if (!ctx) {
			return_to_combine_entry()
			return
		}
		let lcu_info = data.pieces[ctx.lcu_id]
		let space = game.where
		game.pieces[ctx.lcu_id] = space
		if (ctx.type === "reduced") {
			set_add(game.reduced, ctx.lcu_id)
			log(`${active_faction()} combines 2 SCUs into a Reduced LCU ${lcu_info.name} in ${space_name(space)}.`)
		} else {
			set_delete(game.reduced, ctx.lcu_id)
			log(`${active_faction()} combines 3 SCUs into a Full LCU ${lcu_info.name} in ${space_name(space)}.`)
		}
		if (ctx.event_flag_on_success && game.event_ctx && game.event_ctx.key === ctx.event_flag_on_success.key) {
			if (!game.event_ctx.data) game.event_ctx.data = {}
			game.event_ctx.data[ctx.event_flag_on_success.field] = true
		}
		set_add(game.moved, ctx.lcu_id)
		clear_combine_ctx()
		return_to_combine_entry()
	}

	states.choose_pieces_to_move = {
		prompt(res) {
			let s = game.move.initial
			res.where(s)
			res.who(game.move.pieces)
			res.prompt(`选择从 ${space_name(s)} 移动的单位`)

			let allowed_pieces = game.move.allowed_activation_pieces
			let pieces = get_pieces_in_space(game, s).filter(
				(p) => !Array.isArray(allowed_pieces) || set_has(allowed_pieces, p) || set_has(game.move.pieces, p)
			)

			let any_available = false
			for (let p of pieces) {
				let is_moved = set_has(game.moved, p)
				if (can_piece_move_in_activation(p, active_faction()) && !is_moved && !set_has(game.move.pieces, p)) {
					res.piece(p)
					any_available = true
				}
			}

			if (game.move.pieces.length > 0) {
				let all_neighbors = new Set()
				for (let p of game.move.pieces) {
					let neighbors = get_connected_spaces(game, s, data.pieces[p].nation, active_faction(), p)
					for (let n of neighbors) all_neighbors.add(n)
				}

				let has_moves = false
				for (let next of all_neighbors) {
					if (can_stack_move_to(game, next, active_faction())) {
						res.space(next)
						has_moves = true
					}
				}

				// Rule: Only one unit can entrench per space per AR
				let can_entrench = Engine.game_utils.can_entrench_in_space(game, s, active_faction())
				if (can_entrench && !game.entrench_attempts?.includes(s)) {
					// POG style: must have pieces selected to see entrench button
					if (game.move.pieces.length > 0) {
						let entrenching_units = Engine.game_utils.get_entrenching_units_in_space(game, s, active_faction())
						let all_selected_can_entrench = game.move.pieces.every((p) => entrenching_units.includes(p))
						if (all_selected_can_entrench) {
							res.action("entrench")
						}
					}
				}
				if (can_selected_move_pieces_combine(game.move.pieces)) {
					res.action("combine")
				}

				if (!has_moves) res.action("stop")
			} else if (!any_available) {
				log("No movable units in this space.")
			}

			res.action("done")
		},
		piece(p) {
			if (game.pieces[p] !== game.move.initial) return
			if (Array.isArray(game.move.allowed_activation_pieces) && !set_has(game.move.allowed_activation_pieces, p)) return
			if (!can_piece_move_in_activation(p, active_faction())) return
			if (set_has(game.moved, p)) return
			if (game.move.pieces.length === 0) push_undo()
			set_toggle(game.move.pieces, p)
			if (game.move.pieces.length > 0 && !can_move_stack_composition(game, game.move.pieces)) {
				set_delete(game.move.pieces, p)
				log("Cannot select unit: stacking limit.")
			}
		},
		space(s) {
			push_undo()
			move_stack_to_space(s)
			if (game.move && game.state === "choose_pieces_to_move") {
				game.state = "move_stack"
			}
		},
		stop() {
			end_move_stack()
		},
		entrench() {
			let s = game.move.initial
			let participating = game.move.pieces.slice()
			push_undo()
			for (let p of participating) {
				log(`>${piece_name(p)} 掘壕`)
			}
			game.where = s
			game.entrench_pieces = participating
			game.state = "entrench_roll"
			delete game.move
		},
		combine() {
			let s = game.move.initial
			let selected = game.move.pieces.slice()
			if (!can_selected_move_pieces_combine(selected)) return
			push_undo()
			delete game.move
			game.where = s
			game.combine_ctx = { selected_scus: selected.slice() }
			game.state = "combine_lcu_select_lcu"
		},
		done() {
			delete game.move
			game.state = "choose_move_space"
		}
	}

	states.move_stack = {
		prompt(res) {
			let exhausted_stopping_pieces = game.move.pieces.filter((p) => get_piece_mf(p) <= game.move.spaces_moved)
			if (prune_exhausted_move_stack(game, log)) {
				end_move_stack(exhausted_stopping_pieces)
				if (
					game.state !== "move_stack" &&
					states[game.state] &&
					typeof states[game.state].prompt === "function"
				) {
					states[game.state].prompt(res)
				}
				return
			}
			let s = game.move.current
			res.where(s)
			res.who(game.move.pieces)

			let current_block_reason = get_current_move_end_block_reason(s)
			if (current_block_reason) {
				res.prompt(`移动 ${space_name(s)} 处的堆叠 (无法结束移动: ${current_block_reason})`)
			} else if (get_move_end_space_block_reason(game, s, active_faction()) === "堆叠超限") {
				res.prompt(`移动 ${space_name(s)} 处的堆叠 (临时超堆叠，需后续移出单位)`)
			} else {
				res.prompt(`移动 ${space_name(s)} 处的堆叠`)
			}

			let all_neighbors = new Set()
			for (let p of game.move.pieces) {
				let neighbors = get_connected_spaces(game, s, data.pieces[p].nation, active_faction(), p)
				for (let n of neighbors) all_neighbors.add(n)
			}

			for (let next of all_neighbors) {
				if (can_stack_move_to(game, next, active_faction())) {
					res.space(next)
				}
			}

			if (!current_block_reason) {
				res.action("stop")
			}

			// Allow dropping pieces
			for (let p of game.move.pieces) {
				res.piece(p)
			}
		},
		space(s) {
			push_undo()
			game.where = s
			move_stack_to_space(s)
			if (!game.move) return
			let exhausted_stopping_pieces = game.move.pieces.filter((p) => get_piece_mf(p) <= game.move.spaces_moved)
			if (prune_exhausted_move_stack(game, log)) {
				end_move_stack(exhausted_stopping_pieces)
			}
		},
		piece(p) {
			// Drop piece
			let s = game.move.current
			let reason = get_stack_end_block_reason(game, s, [p])
			if (reason) {
				log(`不能在此放下 ${piece_name(p)}：${reason}`)
				return
			}
			set_delete(game.move.pieces, p)
			set_add(game.moved, p)
			log_piece_move([p], s)
			if (game.move.pieces.length === 0) {
				end_move_stack()
			}
		},
		stop() {
			end_move_stack()
		}
	}

	function move_stack_to_space(target) {
		let from_space = game.move.current
		let pieces_moving = []
		let pieces_stopped = []
		let creates_beachhead = should_create_beachhead_on_entry(from_space, target)

		let is_siege_entry =
			has_undestroyed_fort(game, target, other_faction(active_faction())) && !Engine.map.is_besieged(game, target)
		if (is_siege_entry) {
			let potential_pieces = game.move.pieces.filter((p) => {
				let cost = get_movement_cost(game, p, target) + 1
				return get_piece_mf(p) >= game.move.spaces_moved + cost
			})

			if (!can_besiege(game, target, potential_pieces)) {
				log("Cannot enter " + space_name(target) + ": Insufficient strength to besiege.")
				return
			}
		}

		let step_cost = 0
		for (let p of game.move.pieces) {
			if (can_piece_move_to(game, p, target, active_faction())) {
				let cost = get_movement_cost(game, p, target)
				if (is_siege_entry) cost += 1

				step_cost = Math.max(step_cost, cost)
				game.pieces[p] = target
				pieces_moving.push(p)

				if (is_gallipoli(from_space) && is_gallipoli(target)) {
					game.move.gallipoli_internal_paid = true
				}
			} else {
				pieces_stopped.push(p)
				let reason = get_piece_move_block_reason(game, p, target, active_faction())
				if (reason) log(`移动阻断：${piece_name(p)} -> ${space_name(target)}，原因=${reason}`)
			}
		}
		if (from_space > 0) {
			Engine.sync_neutral_vp_state(game, from_space)
			Engine.sync_jihad_city_state(game, from_space)
		}

		game.move.spaces_moved += step_cost
		game.move.pieces = pieces_moving
		game.move.current = target
		set_add(game.move.touched_spaces, from_space)
		set_add(game.move.touched_spaces, target)

		// Rule 19.2.1: Athens Entry Trigger
		Engine.neutral.check_athens_entry(game, pieces_moving, target, active_faction())

		for (let p of pieces_stopped) {
			set_add(game.moved, p)
			log(piece_name(p) + " stops at " + space_name(from_space))
		}

		if (game.move.pieces.length === 0) {
			end_move_stack()
			return
		}

		if (pieces_moving.length > 0) {
			if (creates_beachhead) {
				if (!game.beachheads) game.beachheads = []
				set_add(game.beachheads, target)
				game.unplaced_beachheads--
				Engine.neutral.on_beachhead_placed(game, target, active_faction())
				log(`Beachhead placed at ${space_name(target)}.`)
			}
			if (resolve_cp_enter_empty_beachhead_by_movement(from_space, target, pieces_moving)) {
				return
			}

			// Rule 15.4.6: Trenches are removed when an enemy unit enters the space
			// remove_trench handles Doiran's permanence
			if (has_trench(game, target) > 0 && !is_controlled_by(game, target, active_faction())) {
				remove_trench(game, target)
				log(`Trench in ${space_name(target)} removed by enemy entry.`)
			}

			// Rule 19.2.1: Entering neutral Athens triggers Greek entry
			if (Engine.neutral.is_greece_neutral(game) && Engine.neutral.is_athens_space(target)) {
				Engine.neutral.trigger_greece_entry(game, target, active_faction(), "进入雅典", (msg) => log(msg))
			}

			check_immediate_jihad_rebellion_on_entry(from_space, target, pieces_moving)

			if (!has_undestroyed_fort(game, target, other_faction(active_faction())) && !is_gallipoli(target)) {
				if (!is_controlled_by(game, target, active_faction())) {
					if (pieces_moving.some((p) => data.pieces[p].type === "regular")) {
						set_control(game, target, active_faction())
					}
				}
			}
			if (Engine.check_persia_entry_vp_penalty) {
				Engine.check_persia_entry_vp_penalty(game, target, pieces_moving)
			}
			Engine.sync_neutral_vp_state(game, target)
			Engine.sync_jihad_city_state(game, target)

			if (is_siege_entry || creates_beachhead || should_stop_move_on_island_base(from_space, target)) {
				end_move_stack()
			}
		} else {
			end_move_stack()
		}
	}

	function set_next_state(st) {
		if (
			(game.state === "place_egyptian_rebellion" ||
				game.state === "jihad_placement" ||
				game.state === "jihad_removal" ||
				game.state === "jihad_rebellion_check") &&
			game.state_stack &&
			game.state_stack.length > 0
		) {
			game.state_stack[game.state_stack.length - 1].state = st
		} else {
			game.state = st
		}
	}

	function log_piece_move(pieces, destination) {
		if (pieces.length > 0) {
			logi(piece_list(pieces) + " -> " + space_name(destination))
		}
	}

	function end_move_stack(stopping_pieces = null) {
		let current_space = game.move.current
		let allowed_activation_pieces = Array.isArray(game.move.allowed_activation_pieces)
			? game.move.allowed_activation_pieces.slice()
			: null
		// 这里保留 PUG“每次结束当前堆叠移动都做校验”的结构，
		// 但对“可由后续已激活单位解消的临时超堆叠”放行。
		let reason = get_current_move_end_block_reason(current_space, stopping_pieces)
		if (reason) {
			log(`不能结束移动：${space_name(current_space)} 不合法（${reason}）`)
			set_next_state("move_stack")
			return
		}
		
		log_piece_move(game.move.pieces, current_space)

		for (let p of game.move.pieces) {
			set_add(game.moved, p)
		}
		let initial = game.move.initial
		delete game.move
		let has_remaining_pieces = allowed_activation_pieces
			? has_unmoved_allowed_move_pieces_in_space(initial, allowed_activation_pieces, active_faction())
			: has_unmoved_move_eligible_pieces_in_space(initial, active_faction())
		if (has_remaining_pieces) {
			game.move = {
				initial: initial,
				current: initial,
				spaces_moved: 0,
				pieces: [],
				touched_spaces: [initial],
				allowed_activation_pieces
			}
			set_next_state("choose_pieces_to_move")
			return
		}
		if (
			!allowed_activation_pieces &&
			(Engine.game_utils.can_combine_in_space(game, initial, active_faction()) || can_space_entrench_in_activation(initial))
		) {
			set_next_state("choose_move_space")
			return
		}
		end_move_activation(initial)
	}

	function end_move_activation(s) {
		if (game.activated && game.activated.move) {
			set_delete(game.activated.move, s)
		}
		game.where = -1
		if (game.event_next_state) {
			let next_state = game.event_next_state
			delete game.event_next_state
			set_next_state(next_state)
			return
		}
		next_move_activation()
	}

	function next_move_activation() {
		// Filter out activated spaces that have no movable pieces left
		if (game.activated && game.activated.move) {
			game.activated.move = game.activated.move.filter((s) => has_move_activation_options_in_space(s, active_faction()))
		}
		prune_region_move_activations()

		if (has_any_move_activations()) {
			set_next_state("choose_move_space")
		} else {
			if (game.move_from_event) {
				delete game.move_from_event
				goto_end_event()
				return
			}
			// No more movement, go to attack
			set_next_state("attack")
			refresh_attack_eligibility()
			if (game.eligible_attackers.length === 0) set_next_state("end_operations")
		}
	}
}
