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
				if (info.event && !info.cc) {
					event_check_count += 1
					if (can_play_event(game, c)) res.action("play_event", c)
				}
				if (info.ops) res.action("play_ops", c)
				if (info.sr && allow_sr) res.action("play_sr", c)
				if ((info.rp_a || info.rp_br || info.rp_ru || info.rp_ge || info.rp_tu || info.rp_in) && allow_rp)
					res.action("play_rps", c)
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
			let info = data.cards[c]
			if (!can_play_event(game, c)) {
				log(`${card_name(c)} 不能作为事件打出`)
				return
			}
			let t0 = DEBUG_ACTION_TRACE ? action_now() : 0
			push_undo()
			game.card = c
			game.last_card = c
			log_card_action(c, "Event")
			record_action(ACTION_EVENT, c)

			if (info.remove) remove_card(c)
			else discard_card(c)

			if (info.ws) {
				update_war_status(game.active, info.ws)
			}

			let done = play_event(game, c, {
				log,
				goto_end_event,
				goto_end_operations,
				start_ops_from_event,
				start_event,
				push_state,
				card_name,
				update_jihad_level: (g, amount) => update_jihad_level(g, amount)
			})
			if (!done) {
				log("事件未实现。")
				let entry = get_event_entry(c)
				if (entry && entry.use_ops) {
					start_ops_from_event(c)
				} else {
					goto_end_operations()
				}
			}
			if (DEBUG_ACTION_TRACE) {
				log_action_debug({
					phase: "play_card.play_event",
					card: c,
					use_ops_fallback: !done && !!(get_event_entry(c) && get_event_entry(c).use_ops),
					elapsed_ms: action_now() - t0
				})
			}
		}
	}

	states.card_action = {
		prompt(res) {
			let t0 = DEBUG_ACTION_TRACE ? action_now() : 0
			let info = data.cards[game.card]
			res.prompt(`打出 ${card_name(game.card)}`)
			let allow_sr = can_play_sr_card_this_round(active_faction())
			let allow_rp = can_play_rp_card_this_round(active_faction())
			if (info.ops) res.action("play_ops", game.card)
			if (info.sr && allow_sr) res.action("play_sr", game.card)
			if ((info.rp_a || info.rp_br || info.rp_ru || info.rp_ge || info.rp_tu || info.rp_in) && allow_rp)
				res.action("play_rps", game.card)
			if (info.event && !info.cc && can_play_event(game, game.card)) res.action("play_event", game.card)
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
			let info = data.cards[c]
			if (!can_play_event(game, c)) {
				log(`${card_name(c)} 不能作为事件打出`)
				return
			}
			let t0 = DEBUG_ACTION_TRACE ? action_now() : 0
			log_card_action(c, "Event")
			record_action(ACTION_EVENT, c)

			if (info.remove) remove_card(c)
			else discard_card(c)

			if (info.ws) {
				update_war_status(game.active, info.ws)
			}

			let done = play_event(game, c, {
				log,
				goto_end_event,
				goto_end_operations,
				start_ops_from_event,
				start_event,
				push_state,
				card_name,
				update_jihad_level: (g, amount) => update_jihad_level(g, amount)
			})
			if (!done) {
				log("事件未实现。")
				let entry = get_event_entry(c)
				if (entry && entry.use_ops) {
					start_ops_from_event(c)
				} else {
					goto_end_operations()
				}
			}
			if (DEBUG_ACTION_TRACE) {
				log_action_debug({
					phase: "card_action.play_event",
					card: c,
					use_ops_fallback: !done && !!(get_event_entry(c) && get_event_entry(c).use_ops),
					elapsed_ms: action_now() - t0
				})
			}
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
				res.prompt(`战略调整：选择要调整的单位或堆叠 (剩余 SR 点数: ${game.sr}。LCU 耗费 4 点，SCU 耗费 1 点)`)
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

			// 战略再部署进入雅典，触发希腊参战（规则 19.2.1）
			if (Engine.neutral.is_greece_neutral(game) && Engine.neutral.is_athens_space(s)) {
				Engine.neutral.trigger_greece_entry(game, s, active_faction(), "战略再部署进入雅典", (msg) => log(msg))
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
