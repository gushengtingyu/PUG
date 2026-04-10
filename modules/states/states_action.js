"use strict"

let game

exports.set_globals = function (g) {
	game = g
}

exports.register = function (states, Engine, context) {
	const { data } = Engine
	const DEBUG_ACTION_TRACE = !!(
		typeof process !== "undefined" &&
		process &&
		process.env &&
		(process.env.PUG_DEBUG_ACTION === "1" || process.env.PUG_DEBUG_ACTION === "true")
	)

	const {
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
		update_jihad_level,
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
		get_sr_cost,
		piece_name,
		space_name,
		is_reserve_space_id,
		get_sr_destinations,
		save_rollback_point,
		has_supply_warnings,
		goto_review_supply_warnings,
		start_attrition_phase,
		get_pieces_in_space,
		is_stack_counted_piece,
		is_scu,
		get_scu_reserve_box,
		clear_event_ctx,
		card_name
	} = context

	function action_now() {
		return Date.now()
	}

	function log_action_debug(payload) {
		if (!DEBUG_ACTION_TRACE) return
		console.log("[调试][action-perf]", payload)
	}

	function begin_ops_action(card, ops) {
		let t0 = DEBUG_ACTION_TRACE ? action_now() : 0
		if (card === undefined || card === null) {
			log(`自动行动 (${ops})`)
			record_action(ACTION_ONE_OP, 0)
			game.card = null
		} else {
			log(`${card_name(card)} -- 行动点 (${ops})`)
			record_action(ACTION_OPS, card)
			discard_card(card)
		}
		game.ops = ops
		game.card_ops = ops
		game.activated = { move: [], attack: [] }
		game.activation_cost = {}
		game.moved = []
		game.attacked = []
		game.retreated = []
		game.balkan_attack_targets = { ap: -1, ap_mo: -1, cp: -1 }
		game.state = "activate_spaces"
		if (DEBUG_ACTION_TRACE) {
			log_action_debug({
				phase: "begin_ops_action",
				card: card ?? null,
				ops,
				elapsed_ms: action_now() - t0
			})
		}
	}

	function log_card_action(card, mode, value) {
		if (value !== undefined && value !== null) {
			log(`${card_name(card)} -- ${mode} (${value})`)
		} else {
			log(`${card_name(card)} -- ${mode}`)
		}
	}

	function can_use_rp_action(info) {
		return !!(info.rp_a || info.rp_br || info.rp_ru || info.rp_ge || info.rp_tu || info.rp_in)
	}

	function can_play_event_cached(card) {
		let revision = Number(game.cache_revision) || 0
		if (!game.event_playability_cache || game.event_playability_cache.revision !== revision) {
			game.event_playability_cache = { revision, by_card: {} }
		}
		if (!(card in game.event_playability_cache.by_card)) {
			game.event_playability_cache.by_card[card] = can_play_event(game, card)
		}
		return game.event_playability_cache.by_card[card]
	}

	function append_card_actions(res, card, info, allow_sr, allow_rp) {
		if (info.event && !info.cc && can_play_event_cached(card)) res.action("play_event", card)
		if (info.ops) res.action("play_ops", card)
		if (info.sr && allow_sr) res.action("play_sr", card)
		if (can_use_rp_action(info) && allow_rp) res.action("play_rps", card)
	}

	function perform_event_action(card, trace_phase) {
		let info = data.cards[card]
		if (!can_play_event_cached(card)) {
			log(`${card_name(card)} 不能作为事件打出`)
			return
		}
		let t0 = DEBUG_ACTION_TRACE ? action_now() : 0
		let entry = get_event_entry(card)
		let use_ops_fallback = !!(entry && entry.use_ops)
		log_card_action(card, "Event")
		record_action(ACTION_EVENT, card)

		if (info.remove) remove_card(card)
		else discard_card(card)

		if (info.ws) {
			update_war_status(game.active, info.ws)
		}

		let done = play_event(game, card, {
			log,
			goto_end_event,
			goto_end_operations,
			start_ops_from_event,
			start_event,
			push_state,
			clear_event_ctx,
			card_name,
			update_jihad_level: (g, amount) => update_jihad_level(g, amount)
		})
		if (!done) {
			log("事件未实现。")
			if (use_ops_fallback) {
				start_ops_from_event(card)
			} else {
				goto_end_operations()
			}
		}
		if (DEBUG_ACTION_TRACE) {
			log_action_debug({
				phase: trace_phase,
				card,
				use_ops_fallback: !done && use_ops_fallback,
				elapsed_ms: action_now() - t0
			})
		}
	}

	function is_winter_turn() {
		return Engine.game_utils.get_season(game) === "Winter"
	}

	function get_ap_beachheads() {
		return Engine.map.get_beachhead_spaces(game, AP).filter((s) => Engine.map.is_beachhead_space(game, s))
	}

	function with_temporarily_removed_beachhead(beachhead, fn) {
		let original = Array.isArray(game.beachheads) ? game.beachheads.slice() : []
		if (game.beachheads) Engine.utils.set_delete(game.beachheads, beachhead)
		let result = fn()
		game.beachheads = original
		return result
	}

	function is_piece_on_shore_or_beachhead(p) {
		let s = game.pieces[p]
		if (s <= 0 || !data.spaces[s]) return false
		if (Engine.map.is_island_base(game, s)) return false
		return true
	}

	function is_piece_supplied_solely_through_beachhead(p, beachhead) {
		if (data.pieces[p].faction !== AP) return false
		if (is_not_on_map(game, p) || is_in_reserve(game, p)) return false
		if (!is_piece_on_shore_or_beachhead(p)) return false
		let s = game.pieces[p]
		if (!Engine.map.is_in_supply(game, s, AP, p)) return false
		if (!Engine.map.can_trace_piece_supply_to_sources(game, p, beachhead)) return false
		return !with_temporarily_removed_beachhead(beachhead, () => Engine.map.is_in_supply(game, s, AP, p))
	}

	function get_beachhead_withdrawal_units(beachhead) {
		let result = []
		for (let p = 0; p < game.pieces.length; p++) {
			if (!data.pieces[p]) continue
			if (is_piece_supplied_solely_through_beachhead(p, beachhead)) result.push(p)
		}
		return result
	}

	function get_beachhead_under_fire(beachhead) {
		return get_beachhead_withdrawal_units(beachhead).some((p) => {
			let s = game.pieces[p]
			let info = data.spaces[s]
			if (!info || !Array.isArray(info.connections)) return false
			return info.connections.some((n) => Engine.map.contains_enemy_pieces(game, n, AP))
		})
	}

	function can_remove_empty_beachhead(beachhead) {
		if (active_faction() !== AP) return false
		if (get_pieces_in_space(game, beachhead).length > 0) return false
		let stranded = 0
		let currently_supplied = []
		for (let p = 0; p < game.pieces.length; p++) {
			if (!data.pieces[p] || data.pieces[p].faction !== AP) continue
			if (is_not_on_map(game, p) || is_in_reserve(game, p)) continue
			let s = game.pieces[p]
			if (s <= 0 || !data.spaces[s]) continue
			if (Engine.map.is_in_supply(game, s, AP, p)) currently_supplied.push(p)
		}
		with_temporarily_removed_beachhead(beachhead, () => {
			for (let p of currently_supplied) {
				let s = game.pieces[p]
				if (!Engine.map.is_in_supply(game, s, AP, p)) stranded++
			}
		})
		return stranded === 0
	}

	function can_safe_withdraw_beachhead(beachhead) {
		if (active_faction() !== AP) return false
		if (is_winter_turn()) return false
		let units = get_beachhead_withdrawal_units(beachhead)
		if (units.length === 0) return false
		return !get_beachhead_under_fire(beachhead)
	}

	function can_withdraw_under_fire(beachhead) {
		if (active_faction() !== AP) return false
		if (is_winter_turn()) return false
		let units = get_beachhead_withdrawal_units(beachhead)
		if (units.length === 0) return false
		return get_beachhead_under_fire(beachhead)
	}

	function get_breakdown_candidates_for_lcu(lcu) {
		let info = data.pieces[lcu]
		let group = Engine.game_utils.get_nation_group(info.nation)
		let pools = [
			Engine.game_utils.get_pieces_in_reserve(game, AP),
			Engine.game_utils.get_pieces_in_eliminated(game, AP),
			Engine.game_utils.get_pieces_in_reinforcements(game, AP),
			Engine.game_utils.get_pieces_in_removed(game, AP)
		]
		let result = []
		for (let pool of pools) {
			for (let p of pool) {
				if (p === lcu || !data.pieces[p]) continue
				if (data.pieces[p].piece_class !== "SCU") continue
				if (Engine.game_utils.get_nation_group(data.pieces[p].nation) !== group) continue
				if (!result.includes(p)) result.push(p)
			}
		}
		return result
	}

	function break_down_lcu_for_withdrawal(lcu, island_base) {
		let info = data.pieces[lcu]
		let needed = Engine.game_utils.is_piece_reduced(game, lcu) ? 2 : 3
		let candidates = get_breakdown_candidates_for_lcu(lcu)
		let selected = []
		let exact_nation = candidates.find((p) => data.pieces[p].nation === info.nation)
		if (exact_nation !== undefined) selected.push(exact_nation)
		for (let p of candidates) {
			if (selected.length >= needed) break
			if (selected.includes(p)) continue
			selected.push(p)
		}
		game.pieces[lcu] = Engine.game_utils.get_lcu_reserve_box(AP)
		Engine.utils.set_delete(game.reduced, lcu)
		for (let scu of selected) {
			game.pieces[scu] = island_base
			Engine.utils.set_delete(game.reduced, scu)
		}
		log(`${piece_name(lcu)} 撤离后解编至 ${space_name(island_base)}。`)
		if (selected.length < needed) {
			log(`${piece_name(lcu)} 仅找到 ${selected.length}/${needed} 个可用 SCU 进行解编。`)
		}
	}

	function finish_beachhead_withdrawal(beachhead, under_fire) {
		let island_base = Engine.map.get_adjacent_island_base_for_beachhead(beachhead)
		let units = get_beachhead_withdrawal_units(beachhead)
		let original_scu_count = units.filter((p) => data.pieces[p].piece_class === "SCU").length
		let original_lcu_count = units.filter((p) => data.pieces[p].piece_class === "LCU").length
		for (let p of units) {
			if (data.pieces[p].piece_class === "LCU" && under_fire) {
				break_down_lcu_for_withdrawal(p, island_base)
			} else {
				game.pieces[p] = island_base
				log(`${piece_name(p)} 撤回至 ${space_name(island_base)}。`)
			}
		}
		if (under_fire) {
			if (game.beachheads) Engine.utils.set_delete(game.beachheads, beachhead)
			if (Engine.map.is_non_balkan_beachhead(beachhead)) {
				update_jihad_level(game, 1)
			}
			let bonus = Engine.map.is_non_balkan_beachhead(beachhead)
				? original_lcu_count + Math.floor(original_scu_count / 3)
				: 0
			if (bonus > 0) {
				game.tu_rp_bonus = (game.tu_rp_bonus || 0) + bonus
				log(`${space_name(beachhead)} 撤离：土耳其奖励 RP +${bonus}。`)
			}
		} else if (
			Engine.map.is_non_balkan_beachhead(beachhead) &&
			get_beachhead_withdrawal_units(beachhead).length === 0
		) {
			update_jihad_level(game, 1)
		}
	}

	states.play_card = {
		inactive: "play a card",
		prompt(res) {
			let t0 = DEBUG_ACTION_TRACE ? action_now() : 0
			let event_check_count = 0
			res.prompt(`第 ${game.turn} 回合, 行动轮 ${game.action_round}: 请选择一项行动`)
			let hand = game.active === AP ? game.hand_ap : game.hand_cp
			let allow_sr = can_play_sr_card_this_round(active_faction())
			let allow_rp = can_play_rp_card_this_round(active_faction())
			for (let c of hand) {
				let info = data.cards[c]
				if (info.event && !info.cc) event_check_count += 1
				append_card_actions(res, c, info, allow_sr, allow_rp)
			}
			if (active_faction() === AP) {
				for (let beachhead of get_ap_beachheads()) {
					if (can_withdraw_under_fire(beachhead)) res.action("withdraw_under_fire", beachhead)
					else if (can_safe_withdraw_beachhead(beachhead)) res.action("safe_withdraw", beachhead)
					if (can_remove_empty_beachhead(beachhead)) res.action("remove_beachhead", beachhead)
				}
			}
			res.action("single_op")
			if (DEBUG_ACTION_TRACE) {
				log_action_debug({
					phase: "play_card.prompt",
					hand_size: hand.length,
					event_checks: event_check_count,
					elapsed_ms: action_now() - t0
				})
			}
		},
		card(c) {
			push_undo()
			game.card = c
			game.last_card = c
			game.state = "card_action"
		},
		play_card(c) {
			this.card(c)
		},
		play_ops(c) {
			push_undo()
			game.card = c
			game.last_card = c
			let info = data.cards[c]
			begin_ops_action(c, info.ops)
		},
		single_op() {
			push_undo()
			begin_ops_action(null, 1)
		},
		play_sr(c) {
			if (!can_play_sr_card_this_round(active_faction())) {
				log("不能连续打出 SR 卡。")
				pop_undo()
				return
			}
			push_undo()
			game.card = c
			game.last_card = c
			let info = data.cards[c]
			log_card_action(c, "Strategic Redeployment", info.sr)
			record_action(ACTION_SR, c)
			discard_card(c)
			game.sr = info.sr
			game.state = "sr_phase"
		},
		play_rps(c) {
			if (!can_play_rp_card_this_round(active_faction())) {
				log("不能连续打出 RP 卡。")
				pop_undo()
				return
			}
			push_undo()
			game.card = c
			game.last_card = c
			let info = data.cards[c]
			log_card_action(c, "Replacement Points")
			record_action(ACTION_RPS, c)
			discard_card(c)
			add_rps(info)
			goto_end_operations()
		},
		play_event(c) {
			push_undo()
			game.card = c
			game.last_card = c
			perform_event_action(c, "play_card.play_event")
		},
		withdraw_under_fire(beachhead) {
			push_undo()
			finish_beachhead_withdrawal(beachhead, true)
		},
		safe_withdraw(beachhead) {
			push_undo()
			finish_beachhead_withdrawal(beachhead, false)
		},
		remove_beachhead(beachhead) {
			push_undo()
			game.remove_beachhead_space = beachhead
			game.state = "confirm_remove_beachhead"
		}
	}

	states.confirm_remove_beachhead = {
		prompt(res) {
			let s = game.remove_beachhead_space
			res.where(s)
			res.prompt(`是否移除 ${space_name(s)} 的滩头标记？`)
			res.action("confirm")
			res.action("cancel")
		},
		confirm() {
			let s = game.remove_beachhead_space
			if (game.beachheads) Engine.utils.set_delete(game.beachheads, s)
			log(`移除空滩头：${space_name(s)}。`)
			delete game.remove_beachhead_space
			game.state = "play_card"
		},
		cancel() {
			delete game.remove_beachhead_space
			pop_undo()
		}
	}

	states.card_action = {
		prompt(res) {
			let t0 = DEBUG_ACTION_TRACE ? action_now() : 0
			let info = data.cards[game.card]
			res.prompt(`打出 ${card_name(game.card)}`)
			let allow_sr = can_play_sr_card_this_round(active_faction())
			let allow_rp = can_play_rp_card_this_round(active_faction())
			append_card_actions(res, game.card, info, allow_sr, allow_rp)
			res.action("cancel")
			if (DEBUG_ACTION_TRACE) {
				log_action_debug({
					phase: "card_action.prompt",
					card: game.card,
					elapsed_ms: action_now() - t0
				})
			}
		},
		play_ops(c) {
			if (c === undefined) c = game.card
			let info = data.cards[c]
			begin_ops_action(c, info.ops)
		},
		play_sr(c) {
			if (c === undefined) c = game.card
			if (!can_play_sr_card_this_round(active_faction())) {
				log("此回合不能连续打出 SR 卡。")
				return
			}
			let info = data.cards[c]
			log_card_action(c, "Strategic Redeployment", info.sr)
			record_action(ACTION_SR, c)
			discard_card(c)
			game.sr = info.sr
			game.state = "sr_phase"
		},
		play_rps(c) {
			if (c === undefined) c = game.card
			if (!can_play_rp_card_this_round(active_faction())) {
				log("此回合不能连续打出 RP 卡。")
				return
			}
			let info = data.cards[c]
			log_card_action(c, "Replacement Points")
			record_action(ACTION_RPS, c)
			discard_card(c)
			add_rps(info)
			goto_end_operations()
		},
		play_event(c) {
			if (c === undefined) c = game.card
			perform_event_action(c, "card_action.play_event")
		},
		cancel() {
			game.card = null
			pop_undo()
		}
	}

	states.sr_phase = {
		prompt(res) {
			if (game.where !== undefined && game.where !== -1) {
				res.where(game.where)
				res.prompt(`战略调整：选择从 ${space_name(game.where)} SR 的单位 (剩余 SR 点数: ${game.sr})`)
				let pieces = get_pieces_in_space(game, game.where)
				for (let p of pieces) {
					if (can_sr_piece(game, p, active_faction())) {
						let cost = get_sr_cost(p)
						if (game.sr >= cost) {
							res.piece(p)
						}
					}
				}
				res.action("back")
			} else {
				res.prompt(`战略调整：选择要调整的单位或堆叠 (剩余 SR 点数: ${game.sr}。)`)
				let spaces = new Set()
				for (let p = 0; p < game.pieces.length; p++) {
					let from_reserve = is_in_reserve(game, p)
					if (is_not_on_map(game, p) && !from_reserve) continue
					if (from_reserve && !can_use_reserve_sr_for_piece(p)) continue
					if (can_sr_piece(game, p, active_faction())) {
						let cost = get_sr_cost(p)
						if (game.sr >= cost) {
							res.piece(p)
							spaces.add(game.pieces[p])
						}
					}
				}
				for (let s of spaces) {
					res.space(s)
				}
			}

			if (game.sr > 0) {
				res.action("confirm_done_sr")
			} else {
				res.action("done")
			}
		},
		space(s) {
			game.where = s
		},
		piece(p) {
			push_undo() // 仅在选择单位进行 SR 时保存撤销点
			let cost = get_sr_cost(p)
			if (game.sr >= cost) {
				game.sr -= cost
				game.sr_piece = p
				game.where = -1
				game.state = "sr_move"
			} else {
				log("SR点数不足")
				pop_undo()
			}
		},
		back() {
			game.where = -1
		},
		confirm_done_sr() {
			game.where = -1
			goto_end_operations()
		},
		done() {
			goto_end_operations()
		}
	}

	states.end_event = {
		prompt(res) {
			res.prompt("事件结束")
			res.action("confirm")
		},
		confirm() {
			save_rollback_point()
			clear_event_ctx()
			goto_end_operations()
		}
	}

	states.sr_move = {
		prompt(res) {
			let p = game.sr_piece
			let cost = get_sr_cost(p)
			res.who(p)
			res.where(game.pieces[p])
			res.prompt(`战略调整：选择 ${piece_name(p)} 的目的地 (SR 耗费: ${cost})`)
			let from_reserve = is_in_reserve(game, p)
			let destinations = get_sr_destinations(game, p, active_faction())
			for (let s of destinations) {
				if (from_reserve && is_reserve_space_id(s)) continue
				if ((from_reserve || is_reserve_space_id(s)) && !can_use_reserve_sr_for_piece(p)) continue
				res.space(s)
			}
			res.action("cancel")
		},
		space(s) {
			let p = game.sr_piece
			// Move piece
			game.pieces[p] = s

			// 战略调整进入雅典，触发希腊参战（规则 19.2.1）
			if (Engine.neutral.is_greece_neutral(game) && Engine.neutral.is_athens_space(s)) {
				Engine.neutral.trigger_greece_entry(game, s, active_faction(), "战略调整进入雅典", (msg) => log(msg))
			}

			if (!game.sr_moved) game.sr_moved = []
			Engine.utils.set_add(game.sr_moved, p)
			log(`${piece_name(p)} SR 到 ${space_name(s)}`)
			game.sr_piece = null
			game.state = "sr_phase"

			if (game.sr === 0) goto_end_operations()
		},
		cancel() {
			pop_undo()
		}
	}

	function start_action_phase() {
		game.action_round = 1
		game.jihad_cities_flipped = game.jihad_cities_flipped || []
		let player_order = game.player_order || [AP, CP]
		game.active = player_order[0]
		game.state = "play_card"
		log_br()
		log_h2("行动阶段")
		log_h3_faction(game.active, `行动轮 ${game.action_round}`)
		save_rollback_point()
	}

	function end_action_round() {
		delete game.undo
		delete game.ops
		delete game.sr
		delete game.card
		delete game.activated
		delete game.activation_cost
		delete game.moved
		delete game.move
		delete game.where
		delete game.move_space
		delete game.sr_selected
		delete game.attack
		delete game.combat_cards
		delete game.eligible_attackers
		delete game.retreated
		delete game.advanced_stopped
		delete game.sr_moved
		delete game.entrenching
		delete game.entrench_attempts

		// 67: LIBERATE SUEZ - Clear flags
		delete game.liberate_suez_op_required
		delete game.liberate_suez_battle_required
		delete game.liberate_suez_min_egypt_attack_ops
		delete game.liberate_suez_egypt_attacked_spaces
		delete game.liberate_suez_egypt_attack_activation_valid
		delete game.liberate_suez_egypt_battle_done
		delete game.liberate_suez_drm
		delete game.event_ops_card

		// 69: INDIAN MUTINY - Clear flag
		delete game.indian_mutiny_drm

		if (game.state !== "review_supply_warnings") {
			// Determine next player
			let player_order = game.player_order || [game.active, game.active === AP ? CP : AP]
			let current_idx = player_order.indexOf(game.active)
			if (current_idx === 0) {
				game.active = player_order[1]
			} else {
				game.action_round++
				game.jihad_cities_flipped = []
				game.active = player_order[0]
			}

			// 在对手下个行动轮开始前检查是否有补给警告
			if (has_supply_warnings()) {
				goto_review_supply_warnings()
				return
			}
		}

		if (game.action_round > 6) {
			start_attrition_phase()
			return
		}

		game.state = "play_card"
		log_br()
		log_h3_faction(game.active, `行动轮 ${game.action_round}`)
		save_rollback_point()
	}

	function goto_end_action() {
		if (game.events["bulls_eye_directive"] === game.turn) {
			Engine.events.bulls_eye_cleanup_scus(game)
		}
		clear_event_ctx()
		end_action_round()
	}

	return {
		start_action_phase,
		end_action_round,
		goto_end_action
	}
}
