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
		is_reserve_space,
		is_in_reserve,
		is_eliminated,
		is_removed,
		is_not_on_map,
		goto_end_event,
		find_space,
		piece_name,
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
		update_jihad_level,
		is_controlled_by,
		set_control,
		bulls_eye_record_sr_space,
		roll_die,
		has_trench,
		place_trench,
		remove_trench
	} = context

	function is_non_balkan_beachhead(space_id) {
		let space = data.spaces[space_id]
		if (!space) return false
		return space.area !== "balkans"
	}

	function resolve_cp_enter_empty_beachhead_by_movement(from_space, target, pieces_moving) {
		if (active_faction() !== CP) return false
		if (!Engine.map.is_beachhead_space(game, target)) return false
		let has_ap_units = get_pieces_in_space(game, target).some(
			(p) => Engine.game_utils.get_piece_effective_faction(game, p) === AP
		)
		if (has_ap_units) return false

		if (game.beachheads) set_delete(game.beachheads, target)
		if (is_non_balkan_beachhead(target)) {
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

	function activation_now() {
		return Date.now()
	}

	function log_activation_debug(...args) {
		if (DEBUG_ACTIVATION_TRACE) {
			console.log(...args)
		}
	}

	function count_fast_combine_candidates(pieces, faction) {
		const { game_utils } = Engine
		let count = 0
		for (let p of pieces) {
			let info = data.pieces[p]
			if (!is_scu(p)) continue
			if (game_utils.get_piece_effective_faction(game, p) !== faction) continue
			if (set_has(game.moved, p)) continue
			if (info.type === "irregular") continue
			if (game_utils.get_piece_badge(p) === "yellow") continue
			count += 1
			if (count >= 2) return count
		}
		return count
	}

	// === ACTIVATION HELPER ===
	function is_space_activated_for_combine(s) {
		return !!(game.activated && game.activated.combine && set_has(game.activated.combine, s))
	}

	function can_piece_participate_in_activation(p, faction) {
		if (p < 0 || !data.pieces[p]) return false
		if (is_not_on_map(game, p)) return false
		if (Engine.game_utils.get_piece_effective_faction(game, p) !== faction) return false
		if (Engine.greece.is_greek_piece(p)) {
			return (
				Engine.greece.can_move_piece_for_faction(game, p, faction) ||
				Engine.greece.can_attack_piece_for_faction(game, p, faction)
			)
		}
		return true
	}

	function can_piece_move_in_activation(p, faction) {
		if (!can_piece_participate_in_activation(p, faction)) return false
		if (Engine.greece.is_greek_piece(p) && !Engine.greece.can_move_piece_for_faction(game, p, faction)) return false
		return get_piece_mf(p) > 0
	}

	function can_piece_attack_in_activation(p, s, faction) {
		if (!can_piece_participate_in_activation(p, faction)) return false
		if (Engine.greece.is_greek_piece(p) && !Engine.greece.can_attack_piece_for_faction(game, p, faction)) return false
		return can_activate_piece_in_space_to_attack(p, s)
	}

	states.activate_spaces = {
		prompt(res) {
			let perf_start = DEBUG_ACTIVATION_TRACE ? activation_now() : 0
			let perf_attack_checks = 0
			let perf_combine_checks = 0
			let perf_attack_ms = 0
			let perf_combine_ms = 0
			let event_prompt = Engine.event_states.get_activation_prompt(game)
			if (event_prompt) {
				res.prompt(event_prompt)
			} else {
				res.prompt(`选择激活的地块 (剩余行动点: ${game.ops})`)
			}

			let faction = active_faction()
			let pieces_by_space = new Map()
			let activated_move_set = new Set(game.activated.move || [])
			let activated_attack_set = new Set(game.activated.attack || [])
			for (let p = 0; p < game.pieces.length; p++) {
				let s = game.pieces[p]
				if (s <= 0 || is_not_on_map(game, p)) continue
				if (!can_piece_participate_in_activation(p, faction)) continue
				let list = pieces_by_space.get(s)
				if (!list) {
					list = []
					pieces_by_space.set(s, list)
				}
				list.push(p)
			}

			for (let [s, friendly_pieces] of pieces_by_space) {
				if (activated_move_set.has(s) || activated_attack_set.has(s)) continue

				let costs = get_activation_cost_pair(game, s)
				let move_cost = costs.move
				let attack_cost = costs.attack
				let unmoved_pieces = friendly_pieces.filter((p) => !set_has(game.moved, p))

				let can_move = game.ops >= move_cost
				let can_attack = false
				if (game.ops >= attack_cost && unmoved_pieces.length > 0) {
					let t0 = DEBUG_ACTIVATION_TRACE ? activation_now() : 0
					can_attack = unmoved_pieces.some((p) => can_piece_attack_in_activation(p, s, faction))
					if (DEBUG_ACTIVATION_TRACE) {
						perf_attack_checks += 1
						perf_attack_ms += activation_now() - t0
					}
				}
				let can_combine = false
				if (can_move && count_fast_combine_candidates(friendly_pieces, faction) >= 2) {
					let t0 = DEBUG_ACTIVATION_TRACE ? activation_now() : 0
					can_combine = Engine.game_utils.can_combine_in_space(game, s, faction)
					if (DEBUG_ACTIVATION_TRACE) {
						perf_combine_checks += 1
						perf_combine_ms += activation_now() - t0
					}
				}

				if (can_move) res.action("activate_move", s)
				if (can_attack) res.action("activate_attack", s)
				if (can_combine) res.action("activate_combine", s)
			}

			let deactivated_spaces = new Set()
			for (let s of game.activated.move) {
				if (!deactivated_spaces.has(s)) {
					res.action("deactivate", s)
					deactivated_spaces.add(s)
				}
			}
			for (let s of game.activated.attack) {
				if (!deactivated_spaces.has(s)) {
					if (game.liberate_suez_op_required && Engine.map.is_egypt(s)) continue
					res.action("deactivate", s)
					deactivated_spaces.add(s)
				}
			}

			res.action("done")
			if (DEBUG_ACTIVATION_TRACE) {
				log_activation_debug("[调试][activation-perf]", {
					phase: "activate_spaces.prompt",
					total_ms: activation_now() - perf_start,
					pieces_by_space: pieces_by_space.size,
					attack_checks: perf_attack_checks,
					attack_ms: perf_attack_ms,
					combine_checks: perf_combine_checks,
					combine_ms: perf_combine_ms
				})
			}
		},
		activate_move(s) {
			push_undo()
			let cost = get_activation_cost(game, s, "move")
			game.ops -= cost
			set_add(game.activated.move, s)
			if (game.activated.combine) set_delete(game.activated.combine, s)
			if (!game.activation_cost) game.activation_cost = {}
			map_set(game.activation_cost, s, cost)
			log(`${space_name(s)} activated for movement.`)
			if (game.ops === 0) states.activate_spaces.done()
		},
		activate_combine(s) {
			push_undo()
			let cost = get_activation_cost(game, s, "move")
			game.ops -= cost
			set_add(game.activated.move, s)
			if (!game.activated.combine) game.activated.combine = []
			set_add(game.activated.combine, s)
			if (!game.activation_cost) game.activation_cost = {}
			map_set(game.activation_cost, s, cost)
			log(`${space_name(s)} activated for combination.`)
			if (game.ops === 0) states.activate_spaces.done()
		},
		activate_attack(s) {
			push_undo()
			let cost = get_activation_cost(game, s, "attack")
			game.ops -= cost
			set_add(game.activated.attack, s)
			if (game.activated.combine) set_delete(game.activated.combine, s)
			if (!game.activation_cost) game.activation_cost = {}
			map_set(game.activation_cost, s, cost)
			log(`${space_name(s)} activated for attack.`)
			if (game.ops === 0) states.activate_spaces.done()
		},
		deactivate(s) {
			if (game.liberate_suez_op_required && set_has(game.activated.attack, s) && Engine.map.is_egypt(s)) {
				log("解放苏伊士：埃及地区已激活的进攻不能取消。")
				return
			}
			push_undo()
			let cost = map_get(game.activation_cost, s)
			if (cost !== undefined) {
				game.ops += cost

				set_delete(game.activated.move, s)
				set_delete(game.activated.attack, s)
				if (game.activated.combine) set_delete(game.activated.combine, s)
				map_delete(game.activation_cost, s)
				log(`${space_name(s)} deactivated.`)
			}
		},
		done() {
			if (Engine.event_states.on_activation_done(game)) {
				return
			}

			if (game.activated.move.length > 0) {
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

	// --- LCU COMBINATION AND BREAKDOWN ---

	states.choose_move_space = {
		prompt(res) {
			res.prompt("移动已激活的单位.")

			let can_move = false
			let can_combine = false
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
				if (has_movable || can_combine_here) {
					res.space(s)
				}

				if (can_combine_here) {
					res.action("combine", s)
					can_combine = true
				}
			}

			res.action("done")

			if (!can_move && !can_combine) {
				this.done()
			}
		},
		space(s) {
			if (game.activated.move.includes(s)) {
				if (is_space_activated_for_combine(s)) {
					push_undo()
					game.where = s
					game.state = "combine_lcu"
					return
				}
				if (Engine.game_utils.can_combine_in_space(game, s, active_faction())) {
					game.where = s
					game.state = "choose_move_action"
					return
				}
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
			}
		},
		combine(s) {
			push_undo()
			clear_combine_ctx()
			game.where = s
			game.state = "combine_lcu"
		},
		piece(p) {
			let s = game.pieces[p]
			if (is_space_activated_for_combine(s)) {
				push_undo()
				clear_combine_ctx()
				game.where = s
				game.state = "combine_lcu"
				return
			}
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
		done() {
			game.where = -1
			game.activated.move = []
			game.activated.combine = []

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
			game.where = -1
			game.state = "choose_move_space"
			push_undo()
			game.where = s
			game.state = "combine_lcu"
		},
		entrench() {
			let s = game.where
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
			let units = Engine.game_utils.get_entrenching_units_in_space(game, s, active_faction())
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
			res.action("roll", "掷骰")
		},
		roll() {
			let s = game.where
			let selected = game.entrench_pieces
			let roll = roll_die(6, game)

			// Rule 15.4.1: Only one Trench building attempt may be made per space in an Action Round
			if (!game.entrench_attempts) game.entrench_attempts = []
			set_add(game.entrench_attempts, s)

			log(`${active_faction()} 尝试在 ${space_name(s)} 挖壕，参与单位: ${selected.length}。`)
			log(`> 掷骰结果: ${roll}`)

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

			if (success) {
				log(`> 成功！战壕已建立。`)
				place_trench(game, s, active_faction())
			} else {
				log(`> 失败。`)
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
			// POG logic: if no units left to move, end activation
			if (get_pieces_in_space(game, s).every((p) => set_has(game.moved, p))) {
				game.activated.move = []
				game.state = "activate_spaces"
			}
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
				log(`Piece ${p} is not in available SCUs`)
				return
			}
			let selected = get_selected_combine_scus()
			if (set_has(selected, p)) {
				log(`Deselecting piece ${p}`)
				set_delete(selected, p)
				return
			}
			if (selected.length >= 3) {
				log(`Already selected 3 pieces, cannot add ${p}`)
				return
			}
			log(`Selecting piece ${p}`)
			set_add(selected, p)
			if (selected.length >= 2) {
				let valid_lcus = get_valid_lcus_for_selected_scus(selected)
				log(`Checking valid LCUs for selected [${selected}]: found ${valid_lcus.length}`)
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
						log(`No valid LCU can be formed with [${selected}], and no 3rd piece can complete it. Rejecting ${p}`)
						set_delete(selected, p)
					} else {
						log(`Current selection [${selected}] doesn't form an LCU yet, but could be part of a 3-piece combo. Keeping ${p}`)
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
			game.combine_ctx = {
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
			res.prompt("最后选择送去REMOVE的SCU")
			res.where(game.where)
			res.space(get_removed_box(active_faction()))
			res.who(ctx.pending_scus)
			for (let p of ctx.pending_scus) res.piece(p)
			res.action("cancel")
		},
		piece(p) {
			let ctx = game.combine_ctx
			if (!ctx || !set_has(ctx.pending_scus, p)) return
			game.pieces[p] = get_removed_box(data.pieces[p].faction)
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
		set_add(game.moved, ctx.lcu_id)
		set_delete(game.activated.move, space)
		if (game.activated.combine) set_delete(game.activated.combine, space)
		clear_combine_ctx()
		return_to_combine_entry()
	}

	states.choose_pieces_to_move = {
		prompt(res) {
			let s = game.move.initial
			res.where(s)
			res.who(game.move.pieces)
			res.prompt(`选择从 ${space_name(s)} 移动的单位`)

			let pieces = get_pieces_in_space(game, s)

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

				if (!has_moves) res.action("stop")
			} else if (!any_available) {
				log("No movable units in this space.")
			}

			res.action("done")
		},
		piece(p) {
			if (game.pieces[p] !== game.move.initial) return
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
			log(`> 尝试在 ${space_name(s)} 掘壕，参与单位: ${participating.map(p => piece_name(p)).join(", ")}`)
			game.where = s
			game.entrench_pieces = participating
			game.state = "entrench_roll"
			delete game.move
		},
		done() {
			delete game.move
			game.state = "choose_move_space"
		}
	}

	states.move_stack = {
		prompt(res) {
			if (prune_exhausted_move_stack(game, log)) {
				end_move_stack()
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
			res.prompt(`移动 ${space_name(s)} 处的堆叠`)

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

			res.action("stop")

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
			if (prune_exhausted_move_stack(game, log)) {
				end_move_stack()
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
			log(`${piece_name(p)} stops moving in ${space_name(s)}`)
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

		game.move.spaces_moved += step_cost
		game.move.pieces = pieces_moving
		game.move.current = target
		set_add(game.move.touched_spaces, from_space)
		set_add(game.move.touched_spaces, target)

		// Rule 19.2.1: Athens Entry Trigger
		Engine.greece.check_athens_entry(game, pieces_moving, target, active_faction())

		for (let p of pieces_stopped) {
			set_add(game.moved, p)
			log(piece_name(p) + " stops at " + space_name(from_space))
		}

		if (game.move.pieces.length === 0) {
			end_move_stack()
			return
		}

		if (pieces_moving.length > 0) {
			log("Moved to " + space_name(target))
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
			if (Engine.greece.is_greece_neutral(game) && Engine.greece.is_athens_space(target)) {
				Engine.greece.trigger_greece_entry(game, target, active_faction(), "进入雅典", (msg) => log(msg))
			}

			check_immediate_jihad_rebellion_on_entry(from_space, target, pieces_moving)

			if (!has_undestroyed_fort(game, target, other_faction(active_faction())) && !is_gallipoli(target)) {
				if (!is_controlled_by(game, target, active_faction())) {
					if (pieces_moving.some((p) => !is_tribe(p))) {
						set_control(game, target, active_faction())
					}
				}
			}

			if (is_siege_entry) {
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

	function end_move_stack() {
		let touched_spaces = game.move.touched_spaces || [game.move.initial, game.move.current]
		for (let s of touched_spaces) {
			let reason = get_move_end_space_block_reason(game, s, active_faction())
			if (reason) {
				log(`不能结束移动：${space_name(s)} 不合法（${reason}）`)
				set_next_state("move_stack")
				return
			}
		}

		for (let p of game.move.pieces) {
			set_add(game.moved, p)
		}
		let initial = game.move.initial
		delete game.move
		if (has_unmoved_pieces_in_space(game, initial, active_faction())) {
			game.move = {
				initial: initial,
				current: initial,
				spaces_moved: 0,
				pieces: [],
				touched_spaces: [initial]
			}
			set_next_state("choose_pieces_to_move")
			return
		}
		end_move_activation(initial)
	}

	function end_move_activation(s) {
		if (game.activated && game.activated.move) {
			set_delete(game.activated.move, s)
		}
		if (game.activated && game.activated.combine) {
			set_delete(game.activated.combine, s)
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
			game.activated.move = game.activated.move.filter((s) =>
				has_unmoved_pieces_in_space(game, s, active_faction())
			)
		}
		if (game.activated && game.activated.combine) {
			game.activated.combine = game.activated.combine.filter((s) => set_has(game.activated.move, s))
		}

		if (game.activated.move && game.activated.move.length > 0) {
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
