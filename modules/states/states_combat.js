"use strict"

let game

exports.set_globals = function (g) {
	game = g
}

exports.register = function (states, Engine, context) {
	const { data, combat } = Engine
	const combat_cards = Engine.combat_cards
	const { set_has, set_add, set_delete, set_toggle, roll_die } = Engine.utils

	const {
		log,
		log_h3_faction,
		push_undo,
		active_faction,
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
		goto_end_action,
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
		update_jihad_level,
		AP,
		CP,
		has_trench,
		remove_trench
	} = context

	function is_non_balkan_beachhead(space_id) {
		let space = data.spaces[space_id]
		if (!space) return false
		return space.area !== "balkans"
	}

	function count_beachhead_captured_materiel_bonus() {
		let initial_defenders = (game.attack && game.attack.initial_defenders) || []
		let ap_lcu = 0
		let ap_scu = 0
		for (let p of initial_defenders) {
			if (Engine.game_utils.get_piece_effective_faction(game, p) !== AP) continue
			if (is_lcu(p)) ap_lcu += 1
			else if (is_scu(p)) ap_scu += 1
		}
		return ap_lcu + Math.floor(ap_scu / 3)
	}

	states.attack = {
		prompt(res) {
			refresh_attack_eligibility()
			if (game.eligible_attackers.length === 0) {
				if (game.liberate_suez_op_required && !game.liberate_suez_egypt_battle_done) {
					log("解放苏伊士：由于没有可用进攻单位，无法完成埃及地区的战斗要求。")
				}
				game.state = "end_operations"
				return
			}

			if (!game.attack) {
				game.attack = { pieces: [], space: -1 }
			}

			if (game.liberate_suez_op_required && !game.liberate_suez_egypt_battle_done) {
				res.prompt("解放苏伊士：必须先在埃及地区完成至少一次战斗，然后才能结束进攻阶段。")
			} else {
				res.prompt("请选择攻击单位和目标")
			}
			let selected_pieces = game.attack.pieces || []

			// 始终高亮已选择的进攻方和目标地块（如有）
			if (game.attack.space !== -1) {
				res.where(game.attack.space)
			}
			if (selected_pieces.length > 0) {
				res.who(selected_pieces)
			}

			let selected_targets = selected_pieces.length > 0 ? get_attackable_spaces(selected_pieces) : null
			let selected_target_set = selected_targets ? new Set(selected_targets) : null

			// Eligible pieces to join the attack
			for (let p of game.eligible_attackers) {
				if (set_has(selected_pieces, p)) {
					res.piece(p)
					continue
				}
				if (selected_target_set === null) {
					res.piece(p)
					continue
				}
				let piece_targets = get_attackable_spaces([p])
				if (selected_target_set !== null && piece_targets.some((t) => selected_target_set.has(t))) {
					res.piece(p)
				}
			}

			// If pieces selected, show potential target spaces
			if (selected_targets && selected_targets.length > 0) {
				for (let t of selected_targets) {
					res.space(t)
				}
				res.action("cancel_selection")
			}

			res.action("end_attack")
		},
		piece(p) {
			if (!game.attack) {
				game.attack = { pieces: [], space: -1 }
			}
			if (!game.attack.pieces) {
				game.attack.pieces = []
			}
			if (game.attack.pieces.length === 0) push_undo()
			set_toggle(game.attack.pieces, p)
		},
		space(s) {
			if (!game.attack) {
				game.attack = { pieces: [], space: -1 }
			}
			// If pieces selected, check if s is a valid target
			if (game.attack.pieces && game.attack.pieces.length > 0) {
				let targets = get_attackable_spaces(game.attack.pieces)
				if (targets.includes(s)) {
					push_undo()
					game.attack.space = s
					game.state = "confirm_attack"
					return
				}
			}

			return
		},
		cancel_selection() {
			push_undo()
			if (game.attack) {
				game.attack.pieces = []
				game.attack.space = -1
			}
		},
		end_attack() {
			refresh_attack_eligibility()
			if (game.liberate_suez_op_required && !game.liberate_suez_egypt_battle_done && game.eligible_attackers.length > 0) {
				log("解放苏伊士：你必须在埃及地区完成至少一次战斗，不能结束进攻阶段。")
				game.state = "attack"
				return
			}
			push_undo()
			if (game.attack) {
				delete game.attack
			}
			refresh_attack_eligibility()
			if (game.eligible_attackers.length > 0) {
				game.state = "confirm_pass_attack"
			} else {
				game.state = "end_operations"
			}
		}
	}

	states.confirm_attack = {
		prompt(res) {
			if (!game.attack) {
				res.prompt("无效的攻击状态.")
				res.action("cancel")
				return
			}
			res.where(game.attack.space)
			res.who(game.attack.pieces)
			let odds = fmt_attack_odds(game)
			if (odds) {
				res.prompt(`确认攻击: ${odds}`)
			} else {
				res.prompt("确认攻击")
			}
			res.action("confirm")
			res.action("cancel")
		},
		confirm() {
			start_attack_sequence()
		},
		cancel() {
			push_undo()
			game.attack.space = -1
			game.state = "attack"
		}
	}

	states.confirm_pass_attack = {
		prompt(res) {
			res.prompt("你仍有单位可以攻击.")
			res.action("pass")
			res.action("cancel")
		},
		pass() {
			refresh_attack_eligibility()
			if (game.liberate_suez_op_required && !game.liberate_suez_egypt_battle_done && game.eligible_attackers.length > 0) {
				log("解放苏伊士：你必须在埃及地区完成至少一次战斗，不能跳过进攻。")
				game.state = "attack"
				return
			}
			game.eligible_attackers = []
			game.state = "end_operations"
		},
		cancel() {
			game.state = "attack"
		}
	}

	states.confirm_event = {
		inactive: "confirm event",
		prompt(res) {
			let c = game.card !== null ? game.card : game.last_card
			let info = data.cards[c]
			res.prompt(`${info ? info.name : "Event"}: 完成.`)
			res.action("end_action")
		},
		end_action() {
			goto_end_action()
		}
	}

	states.end_operations = {
		inactive: "end operations",
		prompt(res) {
			res.prompt("操作完成.")
			res.action("end_action")
		},
		end_action() {
			refresh_attack_eligibility()
			if (game.liberate_suez_op_required && !game.liberate_suez_egypt_battle_done && game.eligible_attackers.length > 0) {
				log("解放苏伊士：必须在埃及地区完成至少一次战斗，当前不能结束行动轮。")
				game.state = "attack"
				return
			}
			goto_end_action()
		}
	}

	function resolve_after_turkish_retreat_choice() {
		if (game.turkish_retreat_prev_active) {
			game.active = game.turkish_retreat_prev_active
			delete game.turkish_retreat_prev_active
		}
		resolve_battle_sequence()
	}

	function finalize_attacker_cc_step() {
		if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
		log(`${game.active} done with CC.`)
		game.active = other_faction(game.active)
		game.state = "play_cc_defender"
	}

	function finalize_defender_cc_step() {
		if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
		log(`${game.active} done with CC.`)
		resolve_battle_sequence()
	}

	states.declare_turkish_retreat = {
		prompt(res) {
			res.prompt("土耳其撤退：同盟国是否宣言？")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			res.action("declare_turkish_retreat")
			res.action("skip_turkish_retreat")
		},
		declare_turkish_retreat() {
			log("CP declares Turkish Retreat.")
			game.turkish_retreat = true
			resolve_after_turkish_retreat_choice()
		},
		skip_turkish_retreat() {
			log("CP declines Turkish Retreat.")
			game.turkish_retreat = false
			resolve_after_turkish_retreat_choice()
		}
	}

	const CC_VALIDATORS = {
		[combat.CC_AP_NO_PRISONERS]: combat_cards.can_play_no_prisoners,
		[combat.CC_AP_SHORE_BOMBARDMENT]: combat_cards.can_play_shore_bombardment,
		[combat.CC_AP_ARMENIAN_DRUZHINY]: combat_cards.can_play_armenian_druzhiny,
		[combat.CC_AP_PUGNACITY]: combat_cards.can_play_pugnacity,
		[combat.CC_AP_GURKHAS]: combat_cards.can_play_gurkhas,
		[combat.CC_AP_ARMORED_CARS]: combat_cards.can_play_armored_cars,
		[combat.CC_AP_MAUDE]: combat_cards.can_play_maude,
		[combat.CC_AP_ROYAL_FLYING_CORPS]: combat_cards.can_play_royal_flying_corps,
		[combat.CC_AP_TANKS]: combat_cards.can_play_tanks,
		[combat.CC_AP_WAR_WEARY_BALKANS]: combat_cards.can_play_war_weary_balkans,
		[combat.CC_AP_MASSED_CAVALRY_CHARGE]: combat_cards.can_play_massed_cavalry_charge,
		[combat.CC_AP_PUSH_TO_THE_BREAKING_POINT]: combat_cards.can_play_push_to_the_breaking_point,
		[combat.CC_AP_HAVERSACK_RUSE]: combat_cards.can_play_haversack_ruse,
		[combat.CC_AP_MARCH_AND_COUNTERMARCH]: combat_cards.can_play_march_and_countermarch,
		[combat.CC_CP_JIHAD_OFFENSIVE]: combat_cards.can_play_jihad_offensive,
		[combat.CC_CP_RESERVES_TO_FRONT]: combat_cards.can_play_reserves_to_front,
		[combat.CC_CP_GERMAN_HIGH_COMMAND]: combat_cards.can_play_german_high_command,
		[combat.CC_CP_SANDSTORMS]: combat_cards.can_play_sandstorms,
		[combat.CC_CP_SAVE_TIFLIS]: combat_cards.can_play_save_tiflis,
		[combat.CC_CP_SURPRISE]: combat_cards.can_play_surprise,
		[combat.CC_CP_JAFAR_PASHA]: combat_cards.can_play_jafar_pasha,
		[combat.CC_CP_FLIEGERABTEILUNG]: combat_cards.can_play_fliegerabteilung,
		[combat.CC_CP_CATASTROPHIC_ATTACK]: combat_cards.can_play_catastrophic_attack,
		[combat.CC_CP_I_ORDER_YOU_TO_DIE]: combat_cards.can_play_i_order_you_to_die,
		[combat.CC_CP_WATER_SHORTAGE]: combat_cards.can_play_water_shortage,
		[combat.CC_CP_PASHA_1]: combat_cards.can_play_pasha_1,
		[combat.CC_CP_CZARS_ARMORIES]: combat_cards.can_play_czars_armories,
		[combat.CC_CP_CONFUSED_ORDERS]: combat_cards.can_play_confused_orders,
		[combat.CC_CP_ARMY_OF_ISLAM]: combat_cards.can_play_army_of_islam
	}

	const WINDOW_CC_ALLOWED = {
		post_roll_cc_defender: new Set([
			combat.CC_CP_WATER_SHORTAGE,
			combat.CC_CP_CONFUSED_ORDERS,
			combat.CC_CP_JAFAR_PASHA
		]),
		post_battle_cc_cp: new Set([combat.CC_CP_RESERVES_TO_FRONT]),
		post_advance_cc_cp: new Set([combat.CC_CP_CZARS_ARMORIES]),
		retreat_choice_cc_cp: new Set([combat.CC_CP_SAVE_TIFLIS])
	}

	function can_play_combat_card(c, target_game) {
		let validator = CC_VALIDATORS[c]
		return validator ? validator(target_game) : true
	}

	function collect_playable_cc_options(target_game, faction, is_attacker) {
		let hand = faction === AP ? target_game.hand_ap || [] : target_game.hand_cp || []
		let retained = get_cc_retained(faction)
		let options = []
		for (let c of hand) {
			if (!data.cards[c].cc) continue
			if (is_attacker && c === combat.CC_CP_JAFAR_PASHA) continue
			if (!can_play_combat_card(c, target_game)) continue
			set_add(options, c)
		}
		for (let c of retained) {
			if (!data.cards[c].cc) continue
			if (is_attacker && c === combat.CC_CP_JAFAR_PASHA) continue
			if (!can_play_combat_card(c, target_game)) continue
			// Only allow play if not already played in this combat
			if (target_game.combat_cards) {
				let already_played = is_attacker ? target_game.combat_cards.attacker : target_game.combat_cards.defender
				if (set_has(already_played, c)) continue
			}
			set_add(options, c)
		}
		return options
	}

	function collect_window_cc_options(target_game, window_state, faction, is_attacker) {
		let window_game = { ...target_game, state: window_state, active: faction }
		let options = collect_playable_cc_options(window_game, faction, is_attacker)
		let allow_set = WINDOW_CC_ALLOWED[window_state]
		if (!allow_set) return options
		return options.filter((c) => allow_set.has(c))
	}

	function has_window_cc_options(window_state, faction, is_attacker) {
		return collect_window_cc_options(game, window_state, faction, is_attacker).length > 0
	}

	function handle_play_cc(game, c, is_attacker) {
		if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
		if (!game.combat_cards_effected) game.combat_cards_effected = []
		let return_state = game.state
		let faction = game.active
		let info = data.cards[c]
		let retained = get_cc_retained(faction)
		let from_retained = set_has(retained, c)
		log(`${game.active} plays CC: ${data.cards[c].name}`)

		if (is_attacker) {
			game.combat_cards.attacker.push(c)
		} else {
			game.combat_cards.defender.push(c)
		}

		const mark_effected = (card) => {
			set_add(game.combat_cards_effected, card)
		}

		if (c === combat.CC_AP_PUGNACITY) {
			game.events["pugnacity_tenacity_no_weather"] = true
			mark_effected(c)
		}
		if (c === combat.CC_AP_ROYAL_FLYING_CORPS) {
			game.events["royal_flying_corps_permanent"] = true
			mark_effected(c)
		}
		if (c === combat.CC_AP_WAR_WEARY_BALKANS) {
			game.events["war_weary_balkans"] = game.turn
			mark_effected(c)
		}
		if (c === combat.CC_CP_JIHAD_OFFENSIVE) {
			game.events["jihad_offensive"] = game.turn
			mark_effected(c)
		}
		if (c === combat.CC_CP_RESERVES_TO_FRONT) {
			game.rp_cp.tu += 2
			game.reserves_to_front_pieces = combat_cards.get_battle_piece_pool(game).filter((p) => ["tu", "tua"].includes(Engine.game_utils.get_piece_nation(p)))
			game.state = "event_reserves_to_front"
			mark_effected(c)
		}
		if (c === combat.CC_CP_SAVE_TIFLIS) {
			game.events["save_tiflis"] = game.turn
			mark_effected(c)
		}
		if (c === combat.CC_CP_JAFAR_PASHA) {
			let after_use = null
			if (from_retained) {
				after_use = get_cc_retained_after_use(faction, c)
				remove_cc_retained(faction, c)
			} else {
				remove_card_from_hand(c, faction)
			}
			game.cc_jafar_pasha = {
				card: c,
				faction: faction,
				after_use: after_use,
				post_roll: faction === CP
			}
			game.state = "choose_jafar_pasha"
			return
		}
		if (c === combat.CC_CP_CZARS_ARMORIES) {
			game.rp_cp.tu += 4
			mark_effected(c)
		}
		if (c === combat.CC_AP_NO_PRISONERS && faction === AP && !from_retained) {
			remove_card_from_hand(c, faction)
			add_cc_retained(CP, c, "discard")
			log("No Prisoners: Card given to CP, kept face-up for one use.")
		} else if (from_retained) {
			let after_use = get_cc_retained_after_use(faction, c)
			remove_cc_retained(faction, c)
			if (after_use === "remove") move_card_to_removed(c, faction)
			else move_card_to_discard(c, faction)
		} else {
			if (info.remove) remove_card(c)
			else discard_card(c)
		}
		if (info.ws) {
			update_war_status(game.active, info.ws)
		}

		if (is_attacker && c === combat.CC_AP_MARCH_AND_COUNTERMARCH) {
			game.march_and_countermarch = { remaining_moves: 2, piece: -1, space: game.attack.space }
			mark_effected(c)
			game.state = "march_and_countermarch_select"
			return
		}

		if (!is_attacker && c === combat.CC_CP_SURPRISE) {
			game.surprise = { remaining: 2, space: game.attack.space }
			mark_effected(c)
			game.state = "surprise_sr"
			return
		}

		if (
			return_state === "post_roll_cc_defender" ||
			return_state === "post_battle_cc_cp" ||
			return_state === "post_advance_cc_cp" ||
			return_state === "retreat_choice_cc_cp"
		) {
			game.state = return_state
			return
		}

		game.state = is_attacker ? "play_cc_attacker" : "play_cc_defender"
	}

	states.play_cc_attacker = {
		inactive: "play combat cards",
		prompt(res) {
			res.prompt("进攻方：打出战斗卡")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			let options = collect_playable_cc_options(game, game.active, true)
			for (let c of options) res.action("play_cc", c)
			res.action("done")
		},
		play_cc(c) {
			handle_play_cc(game, c, true)
		},
		done() {
			if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
			log(`${game.active} done with CC.`)
			game.state = "play_cc_defender"
			game.active = other_faction(game.active)
		},
		pass() {
			if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
			log(`${game.active} done with CC.`)
			game.state = "play_cc_defender"
			game.active = other_faction(game.active)
		}
	}

	states.play_cc_defender = {
		inactive: "play combat cards",
		prompt(res) {
			res.prompt("防守方：打出战斗卡")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			let options = collect_playable_cc_options(game, game.active, false)
			for (let c of options) res.action("play_cc", c)
			res.action("done")
		},
		play_cc(c) {
			handle_play_cc(game, c, false)
		},
		done() {
			finalize_defender_cc_step()
		},
		pass() {
			finalize_defender_cc_step()
		}
	}

	states.march_and_countermarch_select = {
		prompt(res) {
			res.prompt("前后佯动：选择一个未激活的英国单位")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			res.action("cancel")
			for (let p = 0; p < data.pieces.length; p++) {
				if (!data.pieces[p]) continue
				if (data.pieces[p].nation !== "br") continue
				if (set_has(game.attacked, p)) continue
				if (is_not_on_map(p)) continue
				let dist = Engine.map.get_distance(game.pieces[p], game.attack.space)
				if (dist >= 1 && dist <= 2) {
					res.piece(p)
				}
			}
		},
		piece(p) {
			push_undo()
			game.march_and_countermarch.piece = p
			game.state = "march_and_countermarch_move"
		},
		cancel() {
			delete game.march_and_countermarch
			game.state = "play_cc_attacker"
		}
	}

	states.march_and_countermarch_move = {
		prompt(res) {
			let p = game.march_and_countermarch.piece
			let rem = game.march_and_countermarch.remaining_moves
			if (game.pieces[p] === game.attack.space) {
				res.prompt("前后佯动：单位已到达目标区域")
				res.action("done")
				return
			}
			res.prompt(`前后佯动：移动选定的单位 (剩余 ${rem} 步)`)
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			res.action("cancel")
			let adj = get_connected_spaces(game.pieces[p])
			for (let s of adj) {
				// Can only move through AP controlled spaces, to reach target space
				if (s === game.attack.space || Engine.map.is_controlled_by(game, s, AP)) {
					// Check distance from s to target
					let dist = Engine.map.get_distance(s, game.attack.space)
					if (dist <= rem - 1) {
						if (s === game.attack.space) {
							if (can_stack_end_in_space(game, s, [p], game.attack.pieces)) {
								res.space(s)
							}
						} else {
							res.space(s)
						}
					}
				}
			}
		},
		space(s) {
			push_undo()
			let p = game.march_and_countermarch.piece
			game.pieces[p] = s
			game.march_and_countermarch.remaining_moves -= 1
			if (s === game.attack.space) {
				set_add(game.attack.pieces, p)
				set_add(game.attacked, p)
				delete game.march_and_countermarch
				game.state = "play_cc_attacker"
			}
		},
		cancel() {
			delete game.march_and_countermarch
			game.state = "play_cc_attacker"
		}
	}

	states.surprise_sr = {
		prompt(res) {
			if (!game.surprise) {
				game.surprise = { remaining: 2, space: game.attack.space }
			}
			res.prompt(`奇袭增援：可增援 ${game.surprise.remaining} 个SCU到 ${space_name(game.surprise.space)}`)
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			res.action("done")
			for (let p = 0; p < data.pieces.length; p++) {
				if (!data.pieces[p]) continue
				if (data.pieces[p].faction !== CP) continue
				if (!["tu", "tua"].includes(data.pieces[p].nation)) continue
				if (!is_scu(p)) continue
				if (!is_in_reserve(p)) continue
				if (!can_stack_end_in_space(game, game.surprise.space, [p])) continue
				res.piece(p)
			}
		},
		piece(p) {
			push_undo()
			game.pieces[p] = game.surprise.space
			game.surprise.remaining -= 1
			if (game.surprise.remaining <= 0) {
				delete game.surprise
				resolve_battle_sequence()
				return
			}
		},
		done() {
			delete game.surprise
			resolve_battle_sequence()
		}
	}

	states.confused_orders = {
		prompt(res) {
			let conf = game.confused_orders
			if (!conf) {
				res.prompt("混乱指令：无可用效果")
				res.action("done")
				return
			}
			let options = []
			if (conf.can_cancel_retreat) options.push("cancel_retreat")
			if (conf.can_cancel_advance) options.push("cancel_advance")
			if (conf.can_cancel_retreat && conf.can_cancel_advance) options.push("cancel_both")
			res.prompt("混乱指令：选择效果")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			if (!conf.moved) res.action("move_unit")
			for (let o of options) res.action(o)
			res.action("done")
		},
		cancel_retreat() {
			game.confused_orders.cancel_retreat = true
		},
		cancel_advance() {
			game.confused_orders.cancel_advance = true
		},
		cancel_both() {
			game.confused_orders.cancel_retreat = true
			game.confused_orders.cancel_advance = true
		},
		move_unit() {
			game.state = "confused_orders_move"
		},
		done() {
			if (game.confused_orders) {
				if (game.confused_orders.cancel_retreat) {
					game.battle_result.retreat_needed = false
					game.battle_result.retreating_units = []
					game.battle_result.retreat_can_cancel = false
				}
				if (game.confused_orders.cancel_advance) {
					game.battle_result.no_advance = true
				}
			}
			game.confused_orders_used = true
			delete game.confused_orders
			end_battle_sequence()
			delete game.confused_orders_used
		}
	}

	states.confused_orders_move = {
		prompt(res) {
			let conf = game.confused_orders
			if (!conf) {
				res.prompt("混乱指令：无可移动单位")
				res.action("done")
				return
			}
			res.prompt("混乱指令：选择单位移动到攻击区域")
			res.action("done")
			for (let p = 0; p < data.pieces.length; p++) {
				if (!data.pieces[p]) continue
				if (data.pieces[p].faction !== CP) continue
				if (is_not_on_map(p)) continue
				let from = game.pieces[p]
				let neighbors = get_connected_spaces(game, from, data.pieces[p].nation, CP, p)
				if (!neighbors.includes(conf.space)) continue
				if (!can_enter_region(game, p, conf.space)) continue
				if (!can_stack_end_in_space(game, conf.space, [p])) continue
				res.piece(p)
			}
		},
		piece(p) {
			push_undo()
			game.pieces[p] = game.confused_orders.space
			game.confused_orders.moved = true
			game.state = "confused_orders"
		},
		done() {
			game.state = "confused_orders"
		}
	}

	states.choose_jafar_pasha = {
		prompt(res) {
			res.prompt("贾法尔帕夏：选择效果")
			res.action("retreat")
			res.action("reroll")
		},
		retreat() {
			let attackers = game.attack ? game.attack.pieces || [] : []
			let defenders = get_pieces_in_space(game, game.attack.space).filter(
				(p) => data.pieces[p].faction === game.active
			)
			combat.retreat_units(
				game,
				defenders,
				1,
				attackers.map((p) => game.pieces[p])
			)
			if (game.cc_jafar_pasha && game.cc_jafar_pasha.after_use === "remove") {
				move_card_to_removed(game.cc_jafar_pasha.card, game.cc_jafar_pasha.faction)
			} else if (game.cc_jafar_pasha && game.cc_jafar_pasha.after_use === "discard") {
				move_card_to_discard(game.cc_jafar_pasha.card, game.cc_jafar_pasha.faction)
			} else if (game.cc_jafar_pasha && game.cc_jafar_pasha.post_roll) {
				game.cc_jafar_pasha_post_roll = true
			}
			game.cc_jafar_pasha = null
			if (game.cc_jafar_pasha_post_roll) resolve_jafar_pasha_post_roll()
			game.attack = null
			game.active = other_faction(game.active)
			game.state = "attack"
		},
		reroll() {
			if (game.cc_jafar_pasha && game.cc_jafar_pasha.after_use === "remove") {
				move_card_to_removed(game.cc_jafar_pasha.card, game.cc_jafar_pasha.faction)
			} else if (game.cc_jafar_pasha && game.cc_jafar_pasha.after_use === "discard") {
				move_card_to_discard(game.cc_jafar_pasha.card, game.cc_jafar_pasha.faction)
			} else if (game.cc_jafar_pasha && game.cc_jafar_pasha.post_roll) {
				game.cc_jafar_pasha_post_roll = true
			}
			game.cc_jafar_pasha = null
			game.cc_jafar_pasha_reroll = true
			resolve_battle_sequence()
		}
	}

	function start_attack_sequence() {
		if (game.attack && game.attack.space !== -1) {
			log(`发起进攻：${space_name(game.attack.space)}`)
		}
		delete game.retreat_choice_cc_done
		delete game.retreat_choice_resume_state
		delete game.retreat_choice_prev_active
		combat.start_attack_sequence(game)
		
		// Rule 12.2 sequence: Flank Attack Announcement (Step 2) before CC (Step 5)
		if (combat.check_can_flank(game) && game.attack.flank_attempt === undefined) {
			game.state = "choose_flank_attack"
		} else {
			game.state = "play_cc_attacker"
		}
	}

	function get_attackable_spaces(pieces) {
		return combat.get_attackable_spaces(
			game,
			pieces,
			active_faction(),
			() => get_season(game),
			is_rail_connected_to_supply
		)
	}

	function resolve_battle_sequence() {
		if (combat.is_battle_cancelled_by_cc(game)) {
			const ctx = {
				log,
				eliminate_piece,
				check_mo_fulfillment: mo.check_mo_fulfillment,
				get_season: () => get_season(game),
				reduce_piece
			}
			if (combat.resolve_battle_sequence(game, ctx) === "end") {
				end_battle_sequence()
			}
			return
		}

		if (game.turkish_retreat === undefined && combat.can_declare_turkish_retreat(game)) {
			game.turkish_retreat_prev_active = game.active
			game.active = CP
			game.state = "declare_turkish_retreat"
			return
		}

		const ctx = {
			log,
			eliminate_piece,
			check_mo_fulfillment: mo.check_mo_fulfillment,
			get_season: () => get_season(game),
			reduce_piece
		}
		if (combat.resolve_battle_sequence(game, ctx) === "end") {
			end_battle_sequence()
		}
	}

	states.choose_flank_attack = {
		prompt(res) {
			res.prompt("你是否要尝试侧翼进攻？")
			res.action("flank", "尝试侧翼进攻")
			res.action("no_flank", "不尝试侧翼进攻")
		},
		flank() {
			push_undo()
			game.attack.flank_attempt = true
			game.state = "play_cc_attacker"
		},
		no_flank() {
			push_undo()
			game.attack.flank_attempt = false
			game.state = "play_cc_attacker"
		}
	}

	function end_battle_sequence() {
		let prev_state = game.state
		combat.end_battle_sequence(game, log)
		if (game.cc_jafar_pasha_post_roll) resolve_jafar_pasha_post_roll()

		if (game.state === "post_roll_cc_defender" && !has_window_cc_options("post_roll_cc_defender", CP, false)) {
			game.post_roll_cc_done = true
			game.active = game.attack?.attacker || AP
			end_battle_sequence()
			return
		}

		if (game.state === "post_battle_cc_cp" && !has_window_cc_options("post_battle_cc_cp", CP, false)) {
			continue_after_post_battle_cc()
			return
		}

		if (game.state === "post_advance_cc_cp" && !has_window_cc_options("post_advance_cc_cp", CP, false)) {
			goto_attack()
			return
		}

		if (
			(game.state === "retreat" || game.state === "retreat_cancel") &&
			!game.retreat_choice_cc_done &&
			has_window_cc_options("retreat_choice_cc_cp", CP, false)
		) {
			game.retreat_choice_resume_state = game.state
			game.retreat_choice_prev_active = game.active
			game.retreat_choice_cc_done = true
			game.active = CP
			game.state = "retreat_choice_cc_cp"
			return
		}

		// If we entered a sub-state (retreat, advance, etc.), don't check event transition yet.
		// Those sub-states will call goto_attack() or check_event_next_state() when they finish.
		const SUB_STATES = [
			"retreat",
			"advance",
			"turkish_retreat",
			"retreat_cancel",
			"save_tiflis_retreat",
			"choose_lcu_replacement",
			"post_roll_cc_defender"
		]
		if (SUB_STATES.includes(game.state)) {
			return
		}

		if (check_event_next_state()) {
			return
		}

		if (game.state === prev_state || !game.state) {
			if (!game.attack) {
				refresh_attack_eligibility()
				if (game.eligible_attackers.length > 0) game.state = "attack"
				else game.state = "end_operations"
			} else {
				game.state = "attack"
			}
		}
	}

	function resolve_jafar_pasha_post_roll() {
		let roll = roll_die(6, game)
		if (roll <= 3) {
			add_cc_retained(AP, combat.CC_CP_JAFAR_PASHA, "remove")
			log(`贾法尔帕夏：掷骰${roll}，卡牌交予协约国，正面朝上保留一次使用。`)
		} else {
			move_card_to_discard(combat.CC_CP_JAFAR_PASHA, CP)
			log(`贾法尔帕夏：掷骰${roll}，弃牌。`)
		}
		delete game.cc_jafar_pasha_post_roll
	}

	states.post_roll_cc_defender = {
		inactive: "play combat cards",
		prompt(res) {
			res.prompt("防守方：掷骰后战斗卡")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			let options = collect_window_cc_options(game, "post_roll_cc_defender", CP, false)
			for (let c of options) res.action("play_cc", c)
			res.action("done")
		},
		play_cc(c) {
			handle_play_cc(game, c, false)
		},
		done() {
			game.post_roll_cc_done = true
			game.active = game.attack?.attacker || AP
			end_battle_sequence()
		}
	}

	states.post_battle_cc_cp = {
		inactive: "play combat cards",
		prompt(res) {
			// 该窗口只允许进入“战斗结束后、清理攻击上下文前”的同盟国战斗卡。
			res.prompt("同盟国：战斗后战斗卡")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			let options = collect_window_cc_options(game, "post_battle_cc_cp", CP, false)
			for (let c of options) res.action("play_cc", c)
			res.action("done")
		},
		play_cc(c) {
			handle_play_cc(game, c, false)
		},
		done() {
			continue_after_post_battle_cc()
		}
	}

	states.post_advance_cc_cp = {
		inactive: "play combat cards",
		prompt(res) {
			// 该窗口只允许进入“推进完成后、返回攻击状态前”的后置战斗卡。
			res.prompt("同盟国：挺近后战斗卡")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			let options = collect_window_cc_options(game, "post_advance_cc_cp", CP, false)
			for (let c of options) res.action("play_cc", c)
			res.action("done")
		},
		play_cc(c) {
			handle_play_cc(game, c, false)
		},
		done() {
			goto_attack()
		}
	}

	states.retreat_choice_cc_cp = {
		inactive: "play combat cards",
		prompt(res) {
			res.prompt("同盟国：撤退选择阶段战斗卡")
			if (game.attack && game.attack.space !== -1) {
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			}
			let options = collect_window_cc_options(game, "retreat_choice_cc_cp", CP, false)
			for (let c of options) res.action("play_cc", c)
			res.action("done")
		},
		play_cc(c) {
			handle_play_cc(game, c, false)
		},
		done() {
			let resume_state = game.retreat_choice_resume_state || "retreat"
			let prev_active = game.retreat_choice_prev_active || AP
			delete game.retreat_choice_resume_state
			delete game.retreat_choice_prev_active
			game.active = prev_active
			game.state = resume_state
		}
	}

	function fmt_attack_odds(game) {
		return combat.fmt_attack_odds(game)
	}

	/**
	 * 防守方分配损失状态 (Rule 12.6)
	 *
	 * 逻辑:
	 * 1. 计算待满足的伤害总量: game.attack.defender_losses - game.attack.defender_losses_absorbed
	 * 2. 如果伤害 >= 单位的 LF (Loss Factor)，则该单位可选以承受损失。
	 * 3. 必须分配损失直到无法再承受或伤害点数归零。
	 */
	states.apply_defender_losses = {
		prompt(res) {
			if (!game.attack) {
				res.prompt("无效的攻击状态.")
				res.action("done")
				return
			}
			let needed = game.attack.defender_losses - game.attack.defender_losses_absorbed
			if (needed <= 0) {
				res.prompt(`战斗结算: ${space_name(game.attack.space)}（防守方损失已完成）`)
				res.action("done")
				return
			}

			res.prompt(`防守方分配损失：${game.attack.defender_losses_absorbed}/${game.attack.defender_losses}`)
			let defenders = get_pieces_in_space(game, game.attack.space).filter(
				(p) => data.pieces[p].faction === active_faction() && data.pieces[p].type !== "hq"
			)
			let fort_strength = 0
			let defender_faction = active_faction()
			if (combat.has_undestroyed_fort(game, game.attack.space, defender_faction)) {
				fort_strength = data.spaces[game.attack.space].fort || 0
			}

			let options = combat.get_loss_options(game, defenders, needed, fort_strength)
			for (let p of options) res.piece(p)

			// POG 12.4.6: Fort destruction as loss option if all units eliminated and remaining losses >= Fort LF
			let fort_can_be_destroyed = false
			if (defenders.length === 0 && fort_strength > 0 && needed >= fort_strength) {
				res.action("destroy_fort")
				fort_can_be_destroyed = true
			}

			if (options.length === 0 && !fort_can_be_destroyed) {
				res.prompt(`战斗结算: ${space_name(game.attack.space)}（无可分配损失）`)
				res.action("done")
				return
			}
		},
		destroy_fort() {
			push_undo()
			let s = game.attack.space
			let fort_strength = data.spaces[s].fort || 0
			if (!game.forts) game.forts = { destroyed: [] }
			if (!game.forts.destroyed) game.forts.destroyed = []
			set_add(game.forts.destroyed, s)
			log(`Fort at ${space_name(s)} destroyed.`)
			game.attack.defender_losses_absorbed += fort_strength
		},
		piece(p) {
			push_undo()
			let lf = get_piece_lf(game, p)
			reduce_piece(p)
			game.attack.defender_losses_absorbed += lf
		},
		done() {
			// Back to attacker using absolute anchor
			game.active = (game.attack && game.attack.attacker) || AP
			if (game.attack.second_fire === "defender") {
				delete game.attack.second_fire
				combat.resolve_second_fire(game, log)
				if (game.attack.attacker_losses > 0) {
					game.state = "apply_attacker_losses"
				} else {
					end_battle_sequence()
				}
			} else if (game.attack.attacker_losses > 0) {
				game.state = "apply_attacker_losses"
			} else {
				end_battle_sequence()
			}
		}
	}

	/**
	 * 进攻方分配损失状态 (Rule 12.6)
	 *
	 * 逻辑同 apply_defender_losses，针对进攻方参与战斗的单位。
	 * 使用变量: game.attack.attacker_losses (总伤害) 和 game.attack.attacker_losses_absorbed (已分配 LF)。
	 */
	states.apply_attacker_losses = {
		prompt(res) {
			if (!game.attack) {
				res.prompt("无效的攻击状态.")
				res.action("done")
				return
			}
			let needed = game.attack.attacker_losses - game.attack.attacker_losses_absorbed
			if (needed <= 0) {
				res.prompt(`战斗结算: ${space_name(game.attack.space)}（进攻方损失已完成）`)
				res.action("done")
				return
			}

			res.prompt(
				`攻击方承伤 (已承受: ${game.attack.attacker_losses_absorbed} / 需要: ${game.attack.attacker_losses})`
			)
			let attackers = game.attack.pieces.filter((p) => !is_not_on_map(p) && data.pieces[p].type !== "hq")
			let options = combat.get_loss_options(game, attackers, needed, 0)
			for (let p of options) res.piece(p)

			if (options.length === 0) {
				res.prompt(`战斗结算: ${space_name(game.attack.space)} (剩余伤害不足以导致减员)`)
				res.action("done")
				return
			}
		},
		piece(p) {
			push_undo()
			let lf = get_piece_lf(game, p)
			reduce_piece(p)
			game.attack.attacker_losses_absorbed += lf
		},
		done() {
			if (game.attack.second_fire === "attacker") {
				delete game.attack.second_fire
				combat.resolve_second_fire(game, log)
				if (game.attack.defender_losses > 0) {
					game.active = other_faction(game.attack.attacker)
					game.state = "apply_defender_losses"
				} else {
					end_battle_sequence()
				}
			} else if (game.battle_result && game.battle_result.turkish_retreat) {
				// Rule 12.8.2: Turkish retreat happens after attacker losses but before defender losses
				// Turkish retreat is always a CP action
				game.active = CP
				game.state = "turkish_retreat"
				game.turkish_retreat_pending = true
				game.turkish_retreat_space = game.attack.space
				game.turkish_retreat_mandatory = [...game.battle_result.turkish_retreat_units]
				game.turkish_retreat_optional = [...game.battle_result.turkish_retreat_optional_units]
			} else {
				end_battle_sequence()
			}
		}
	}

	states.choose_lcu_replacement = {
		prompt(res) {
			if (!game.attack || !game.attack.replacement) {
				res.prompt("无效的替换状态.")
				res.action("done")
				return
			}
			let lcu = game.attack.replacement.unit
			res.prompt(`LCU ${data.pieces[lcu].name} 被击溃：请从储备箱选择一个 SCU 进行替换`)
			for (let p of game.attack.replacement.options) res.piece(p)
		},
		piece(p) {
			push_undo()
			replace_lcu_with_scu(game.attack.replacement.unit, game.attack.replacement.space, p)
			let return_state = game.attack.replacement.return_state
			delete game.attack.replacement
			game.state = return_state || "apply_defender_losses"
		},
		done() {
			if (game.attack && game.attack.replacement) {
				let return_state = game.attack.replacement.return_state
				delete game.attack.replacement
				game.state = return_state || "apply_defender_losses"
			} else {
				game.state = "apply_defender_losses"
			}
		}
	}

	function check_event_next_state() {
		if (game.event_next_state) {
			// Russo-British Assault (Card 1) is an AP event
			if (game.event_next_state.startsWith("event_russo_british_assault")) {
				game.active = AP
			}
			// Enver Goes East (Card 7) is an AP event that uses CP pieces
			else if (game.event_next_state.startsWith("event_enver_goes_east")) {
				game.active = AP
			}
			// Arab Revolt Cleanup (Card 16) is an AP event
			else if (game.event_next_state === "event_arab_revolt_cleanup") {
				game.active = AP
			}
			// Grand Duke to Tiflis (Card 20) is an AP event
			else if (game.event_next_state === "event_grand_duke_to_tiflis_sr") {
				game.active = AP
			}
			// Turkish Reinforcements (Card 81) is a CP event
			else if (game.event_next_state === "event_turkish_reinf_81_combine") {
				game.active = CP
			}

			game.state = game.event_next_state
			delete game.event_next_state

			return true
		}
		return false
	}

	function goto_attack() {
		if (game.attack && game.attack.attacker) {
			game.active = game.attack.attacker
		}
		if (check_event_next_state()) return
		game.attack = null

		// Ensure all battle-related state is cleaned up
		delete game.reserves_to_front_effected_pieces
		delete game.retreat_pieces
		delete game.retreat_space
		delete game.retreat_distance
		delete game.retreat_from
		game.retreat_steps_left = null
		delete game.advance_pieces
		delete game.advance_space
		delete game.advance_trench_processed
		delete game.battle_result

		refresh_attack_eligibility()
		if (game.eligible_attackers.length > 0) {
			game.state = "attack"
		} else {
			goto_end_operations()
		}
	}

	function finish_turkish_retreat() {
		combat.finish_turkish_retreat(game, log)
		if (game.state === "attack" && !game.attack) {
			check_event_next_state()
		}
	}

	function enter_post_battle_cc_window(resume) {
		if (!has_window_cc_options("post_battle_cc_cp", CP, false)) return false
		game.post_battle_cc_resume = resume
		game.active = CP
		game.state = "post_battle_cc_cp"
		return true
	}

	function continue_after_post_battle_cc() {
		let resume = game.post_battle_cc_resume
		delete game.post_battle_cc_resume
		game.active = game.attack?.attacker || game.active

		if (resume && resume.kind === "advance") {
			if (!game.battle_result?.no_advance || resume.save_tiflis_failed) {
				game.advance_pieces = get_advance_pieces(game, game.battle_result)
				if (game.advance_pieces.length > 0) {
					game.advance_space = resume.advance_space
					game.advance_count = 0
					game.advance_limit = 3
					if (game.mcc_advance || game.ptbp_active || is_turn_event(game, "bulls_eye_directive")) {
						game.advance_limit = 4
					}
					game.advance_trench_processed = false
					game.state = "advance"
					if (resume.save_tiflis_failed && game.battle_result?.no_advance) {
						log("Russian units could not retreat towards Tiflis; full-strength TU/TUA units may advance.")
					} else {
						log("Attacker may advance.")
					}
				} else {
					log("Attacker has no units capable of advancing.")
					goto_attack()
				}
			} else {
				log("Attacker may not advance.")
				goto_attack()
			}
			delete game.save_tiflis_failed
			delete game.save_tiflis_resolved
			return
		}

		goto_attack()
	}

	states.save_tiflis_retreat = {
		prompt(res) {
			if (game.selected_piece === null || game.selected_piece === undefined) {
				res.prompt("Save Tiflis：选择向第比利斯撤退的单位")
				for (let p of game.save_tiflis_pieces || []) {
					res.piece(p)
				}
				res.action("done")
			} else {
				let piece = game.selected_piece
				res.prompt(`正在撤退 ${data.pieces[piece].name} 到第比利斯`)

				// Calculate spaces towards Tiflis (ID 12)
				const TIFLIS = 12
				let current_dist = Engine.map.get_distance(game.pieces[piece], TIFLIS)
				let valid = []
				let connections = data.spaces[game.pieces[piece]].connections || []
				for (let s of connections) {
					if (Engine.map.get_distance(s, TIFLIS) < current_dist) {
						valid.push(s)
					}
				}

				if (valid.length === 0) {
					res.prompt(`无法让 ${data.pieces[piece].name} 向第比利斯方向撤退。`)
					res.action("cannot_retreat")
				} else {
					for (let s of valid) res.space(s)
				}
				res.piece(piece)
			}
		},
		piece(p) {
			if (game.selected_piece === p) {
				game.selected_piece = null
			} else if (set_has(game.save_tiflis_pieces, p)) {
				game.selected_piece = p
			}
		},
		space(s) {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				log(`${data.pieces[p].name} retreats to ${data.spaces[s].name} (towards Tiflis).`)
				game.pieces[p] = s
				set_delete(game.save_tiflis_pieces, p)
				game.selected_piece = null
			}
		},
		cannot_retreat() {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				log(`${data.pieces[p].name} cannot retreat towards Tiflis.`)
				game.save_tiflis_failed = true
				set_delete(game.save_tiflis_pieces, p)
				game.selected_piece = null
			}
		},
		done() {
			delete game.save_tiflis_pieces
			delete game.selected_piece
			// Continue the battle sequence where we left off
			game.active = other_faction(game.active)
			game.state = "retreat" // Go back to normal retreat sequence

			// If normal retreat sequence expects some data, we should set it
			// But since we interrupted end_battle_sequence, we might need to resume it.
			// Actually, end_battle_sequence was interrupted. Let's resume it.
			// However, in this engine, resuming is often done by calling the function again.
			// Let's call end_battle_sequence again.
			combat.end_battle_sequence(game, log)
		}
	}

	states.retreat_cancel = {
		prompt(res) {
			res.prompt("防守方可以承受 1 点损失以取消撤退")
			let steps = count_steps(game, game.retreat_pieces)
			if (steps > 1) {
				for (let p of game.retreat_pieces) {
					res.piece(p)
				}
			} else {
				res.prompt("防守方必须撤退")
			}
			res.action("proceed_retreat")
		},
		piece(p) {
			push_undo()
			log(`Defender cancels retreat. ${piece_name(p)} takes 1 loss.`)

			game.retreat_pieces = []
			game.selected_piece = null
			game.retreat_space = null
			game.retreat_steps_left = null
			game.battle_result.retreat_needed = false

			game.state = "post_retreat_cancel"
			reduce_piece(p)

			// If reduce_piece didn't trigger choose_lcu_replacement, we can proceed immediately
			if (game.state === "post_retreat_cancel") {
				if (!enter_post_battle_cc_window({ kind: "finish_attack" })) {
					goto_attack()
				}
			}
		},
		proceed_retreat() {
			game.state = "retreat"
		}
	}

	states.post_retreat_cancel = {
		prompt(res) {
			if (!enter_post_battle_cc_window({ kind: "finish_attack" })) {
				goto_attack()
			}
			if (states[game.state] && states[game.state].prompt) {
				states[game.state].prompt(res)
			}
		}
	}

	states.retreat = {
		prompt(res) {
			if (!game.retreat_pieces) {
				game.retreat_pieces = []
			}
			res.who(game.retreat_pieces)
			let retreat_origin = game.attack?.space ?? game.retreat_from
			if (retreat_origin > 0) {
				res.where(retreat_origin)
			}
			if (game.retreat_space) {
				let retreat_from = game.retreat_from ?? game.attack?.space
				let from_name = retreat_from !== undefined ? data.spaces[retreat_from]?.name : null
				let to_name = data.spaces[game.retreat_space]?.name
				if (from_name && to_name && from_name !== to_name) {
					res.prompt(`正在撤退从 ${from_name} 的单位到 ${to_name}`)
				} else if (from_name) {
					res.prompt(`正在从 ${from_name} 撤退单位`)
				} else if (to_name) {
					res.prompt(`正在撤退到 ${to_name}`)
				} else {
					res.prompt("正在选择撤退路径")
				}
			} else {
				res.prompt("正在选择撤退路径")
			}

			if (game.retreat_pieces.length === 0) {
				// Done retreating
				if (game.active === game.attack?.defender) {
					// Defender finished retreating
					// Attacker can advance
					game.active = game.attack?.attacker || AP
					let resume = {
						kind: "advance",
						advance_space: game.attack?.space,
						save_tiflis_failed: !!game.save_tiflis_failed
					}
					if (enter_post_battle_cc_window(resume)) {
						delete game.retreat_pieces
						delete game.retreat_space
						delete game.retreat_distance
						delete game.retreat_from
						game.retreat_steps_left = null
						return
					}
					if (!game.battle_result.no_advance || game.save_tiflis_failed) {
						game.advance_pieces = get_advance_pieces(game, game.battle_result)
						if (game.advance_pieces.length > 0) {
							game.advance_space = resume.advance_space
							game.advance_trench_processed = false
							game.state = "advance"
							if (resume.save_tiflis_failed && game.battle_result.no_advance) {
								log(
									"Russian units could not retreat towards Tiflis; full-strength TU/TUA units may advance."
								)
							} else {
								log("Attacker may advance.")
							}
						} else {
							log("Attacker has no units capable of advancing.")
							goto_attack()
						}
					} else {
						log("Attacker may not advance.")
						goto_attack()
					}
					delete game.save_tiflis_failed
					delete game.save_tiflis_resolved
				} else {
					// Attacker finished retreating
					// Attack over
					if (game.turkish_retreat_pending) {
						game.turkish_retreat_attacker_retreated = true
						game.active = CP
						game.state = "turkish_retreat"
					} else {
						goto_attack()
					}
				}
				delete game.retreat_pieces
				delete game.retreat_space
				delete game.retreat_distance
				delete game.retreat_from
				game.retreat_steps_left = null
				return
			}

			if (!game.retreat_steps_left) {
				game.retreat_steps_left = {}
				let distance = game.retreat_distance || 1
				for (let p of game.retreat_pieces) game.retreat_steps_left[p] = distance
			}

			let piece = game.retreat_pieces[0] // Default for auto-selection logic if needed
			if (game.selected_piece !== null && game.selected_piece !== undefined) piece = game.selected_piece

			if (game.selected_piece === null || game.selected_piece === undefined) {
				// Select piece phase
				res.prompt("选择撤退单位")
				for (let p of game.retreat_pieces) {
					res.piece(p)
				}
			} else {
				// Move piece phase
				res.prompt(`选择 ${data.pieces[piece].name} 的撤退路径`)

				let valid = get_valid_retreat_spaces(
					game,
					piece,
					game.attack ? [game.attack.space] : [],
					1,
					true // ignore_stacking
				)
				valid = combat.apply_retreat_priorities(game, piece, valid)

				if (valid.length === 0) {
					// Cannot retreat - Eliminate
					res.action("eliminate_retreating")
				} else {
					for (let s of valid) res.space(s)
				}

				// Allow deselect
				res.piece(piece)
			}
		},
		piece(p) {
			if (!game.retreat_steps_left) {
				game.retreat_steps_left = {}
				let distance = game.retreat_distance || 1
				for (let p of game.retreat_pieces) game.retreat_steps_left[p] = distance
			}
			if (game.selected_piece === p) {
				game.selected_piece = null
			} else if (set_has(game.retreat_pieces, p)) {
				game.selected_piece = p
			}
		},
		space(s) {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				log(data.pieces[p].name + " retreats to " + data.spaces[s].name)
				game.pieces[p] = s

				// Retreat control check: capture neutral spaces
				if (!Engine.map.is_controlled_by(game, s, game.active)) {
					if (!is_tribe(p) && data.pieces[p].type !== "hq") {
						set_control(game, s, game.active)
					}
				}

				let remaining = (game.retreat_steps_left[p] || 1) - 1
				if (remaining <= 0) {
					set_delete(game.retreat_pieces, p)
					delete game.retreat_steps_left[p]
				} else {
					game.retreat_steps_left[p] = remaining
				}
				game.selected_piece = null
			}
		},
		eliminate_retreating() {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				log(data.pieces[p].name + " cannot retreat and is eliminated.")
				eliminate_piece(p, true)
				set_delete(game.retreat_pieces, p)
				if (game.retreat_steps_left) delete game.retreat_steps_left[p]
				game.selected_piece = null
			}
		}
	}

	states.turkish_retreat = {
		prompt(res) {
			if (!game.turkish_retreat_pending) {
				game.attack = null
				game.state = "attack"
				if (states[game.state] && states[game.state].prompt) {
					states[game.state].prompt(res)
				}
				return
			}

			if (!game.retreat_steps_left) {
				game.retreat_steps_left = {}
				for (let p of game.turkish_retreat_mandatory || []) game.retreat_steps_left[p] = 1
				for (let p of game.turkish_retreat_optional || []) game.retreat_steps_left[p] = 1
			}

			if (game.selected_piece !== null && game.selected_piece !== undefined) {
				let piece = game.selected_piece
				res.prompt(`正在撤退 ${data.pieces[piece].name}`)

				let valid = get_valid_retreat_spaces(
					game,
					piece,
					game.turkish_retreat_space ? [game.turkish_retreat_space] : [],
					game.retreat_steps_left[piece] || 1,
					true // ignore_stacking
				)

				// Rule 6.1.7: Must retreat to a single adjacent space that is not enemy-occupied and does not contain a fortress.
				valid = valid.filter(
					(s) => !combat.has_undestroyed_fort(game, s, CP) && !combat.has_undestroyed_fort(game, s, AP)
				)

				if (game.turkish_retreat_chosen_space !== undefined) {
					valid = valid.filter((s) => s === game.turkish_retreat_chosen_space)
				}

				valid = combat.apply_retreat_priorities(game, piece, valid)

				if (valid.length === 0) {
					res.action("eliminate_retreating")
				} else {
					for (let s of valid) res.space(s)
				}

				res.piece(piece)
				return
			}

			if (game.turkish_retreat_mandatory && game.turkish_retreat_mandatory.length > 0) {
				res.prompt("土耳其撤退：必须选择一个 SCU 进行撤退")
				for (let p of game.turkish_retreat_mandatory) res.piece(p)
				// PUG Rule 617: Turkish SCUs MUST retreat. If only mandatory units remain, skip is not allowed.
				return
			}

			if (game.turkish_retreat_optional && game.turkish_retreat_optional.length > 0) {
				res.prompt("土耳其撤退：可以选择其他部队进行撤退")
				for (let p of game.turkish_retreat_optional) res.piece(p)
				res.action("skip_turkish_retreat")
				return
			}

			finish_turkish_retreat()
			if (states[game.state] && states[game.state].prompt) {
				states[game.state].prompt(res)
			}
		},
		piece(p) {
			if (!game.retreat_steps_left) {
				game.retreat_steps_left = {}
				for (let p of game.turkish_retreat_mandatory || []) game.retreat_steps_left[p] = 1
				for (let p of game.turkish_retreat_optional || []) game.retreat_steps_left[p] = 1
			}
			if (game.selected_piece === p) {
				game.selected_piece = null
				return
			}
			if (
				(game.turkish_retreat_mandatory && set_has(game.turkish_retreat_mandatory, p)) ||
				(game.turkish_retreat_optional && set_has(game.turkish_retreat_optional, p))
			) {
				game.selected_piece = p
			}
		},
		space(s) {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				log(data.pieces[p].name + " retreats to " + data.spaces[s].name)
				game.pieces[p] = s

				// Retreat control check: capture neutral spaces
				if (!Engine.map.is_controlled_by(game, s, game.active)) {
					if (!is_tribe(p) && data.pieces[p].type !== "hq") {
						set_control(game, s, game.active)
					}
				}

				if (game.turkish_retreat_chosen_space === undefined) {
					game.turkish_retreat_chosen_space = s
				}
				if (game.turkish_retreat_mandatory && set_has(game.turkish_retreat_mandatory, p)) {
					set_delete(game.turkish_retreat_mandatory, p)
				}
				if (game.turkish_retreat_optional && set_has(game.turkish_retreat_optional, p)) {
					set_delete(game.turkish_retreat_optional, p)
				}
				delete game.retreat_steps_left[p]
				game.selected_piece = null
			}
		},
		eliminate_retreating() {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				log(data.pieces[p].name + " cannot retreat and is eliminated.")
				eliminate_piece(p, true)
				if (game.turkish_retreat_mandatory && set_has(game.turkish_retreat_mandatory, p)) {
					set_delete(game.turkish_retreat_mandatory, p)
				}
				if (game.turkish_retreat_optional && set_has(game.turkish_retreat_optional, p)) {
					set_delete(game.turkish_retreat_optional, p)
				}
				delete game.retreat_steps_left[p]
				game.selected_piece = null
			}
		},
		skip_turkish_retreat() {
			game.turkish_retreat_optional = []
			finish_turkish_retreat()
		}
	}

	states.advance = {
		prompt(res) {
			let mandatory = []
			if (game.mcc_advance && (game.advance_count || 0) === 0) {
				mandatory = game.advance_pieces.filter((p) => data.pieces[p].counter === "ANZ Desert Corps")
			}

			if (mandatory.length > 0) {
				res.prompt("靶心指令 (MCC)：必须推进 ANZ Desert Corps")
				for (let p of mandatory) res.piece(p)
			} else {
				res.prompt("推进至 " + data.spaces[game.advance_space].name)
				res.action("end_advance")

				if ((game.advance_count || 0) < (game.advance_limit || 3)) {
					for (let p of game.advance_pieces) {
						if (game.reserves_to_front_effected_pieces && set_has(game.reserves_to_front_effected_pieces, p)) {
							continue
						}
						let valid = get_valid_advance_spaces(game, p, game.advance_space)
						if (valid.length > 0) {
							res.piece(p)
						}
					}
				} else {
					// Limit reached, but HQs or unused Yildirim can still advance
					for (let p of game.advance_pieces) {
						if (game.reserves_to_front_effected_pieces && set_has(game.reserves_to_front_effected_pieces, p)) {
							continue
						}
						let is_hq = data.pieces[p].type === "hq"
						let is_yildirim = data.pieces[p].symbol === "Y" && data.pieces[p].nation === "ge"
						if (is_hq || (is_yildirim && !game.advance_yildirim_used)) {
							let valid = get_valid_advance_spaces(game, p, game.advance_space)
							if (valid.length > 0) {
								res.piece(p)
							}
						}
					}
				}
			}
			res.where(game.advance_space)
			res.who(game.advance_pieces)
		},
		piece(p) {
			log(data.pieces[p].name + " advances.")
			let from_space = game.pieces[p]
			game.pieces[p] = game.advance_space
			if (active_faction() === CP && Engine.map.is_beachhead_space(game, game.advance_space)) {
				let has_ap_units = get_pieces_in_space(game, game.advance_space).some(
					(uid) => Engine.game_utils.get_piece_effective_faction(game, uid) === AP
				)
				if (!has_ap_units) {
					if (game.beachheads) set_delete(game.beachheads, game.advance_space)
					if (is_non_balkan_beachhead(game.advance_space)) {
						update_jihad_level(game, 2)
						let bonus = count_beachhead_captured_materiel_bonus()
						if (bonus > 0) {
							game.tu_rp_bonus = (game.tu_rp_bonus || 0) + bonus
							log(`空滩头在推进中被同盟国摧毁：${space_name(game.advance_space)}，圣战等级 +2，土耳其奖励RP +${bonus}。`)
						} else {
							log(`空滩头在推进中被同盟国摧毁：${space_name(game.advance_space)}，圣战等级 +2。`)
						}
					} else {
						log(`空滩头在推进中被同盟国摧毁：${space_name(game.advance_space)}。`)
					}
					game.pieces[p] = from_space
					set_delete(game.advance_pieces, p)
					this.end_advance()
					return
				}
			}

			// Rule 15.4.6: Trenches are removed when an enemy unit enters the space
			// remove_trench handles Doiran's permanence
			if (
				has_trench(game, game.advance_space) > 0 &&
				!Engine.map.is_controlled_by(game, game.advance_space, active_faction()) &&
				!game.advance_trench_processed
			) {
				remove_trench(game, game.advance_space)
				log(`Trench in ${space_name(game.advance_space)} removed by enemy entry.`)
				game.advance_trench_processed = true
			}

			// PUG Rule: Russian Winter Offensive destroys Caucasus forts on advance
			resolve_russian_winter_offensive_advance(game, p, game.advance_space, log)

			// Control check: capture if not a fort and not already controlled by active faction
			if (!combat.has_undestroyed_fort(game, game.advance_space, other_faction(active_faction()))) {
				if (!Engine.map.is_controlled_by(game, game.advance_space, active_faction())) {
					if (active_faction() === CP && Engine.map.is_russian_vp_space(game, game.advance_space)) {
						game.captured_russian_vp_in_advance = true
					}
					if (!is_tribe(p) && data.pieces[p].type !== "hq") {
						set_control(game, game.advance_space, active_faction())
					}
				}
			}

			// Rule 19.2.1: Entering neutral Athens triggers Greek entry
			if (Engine.greece.is_greece_neutral(game) && Engine.greece.is_athens_space(game.advance_space)) {
				Engine.greece.trigger_greece_entry(
					game,
					game.advance_space,
					active_faction(),
					"战斗推进进入雅典",
					(msg) => log(msg)
				)
			}

			// HQs and Heavy Artillery do not count towards advance limit
			let is_hq = data.pieces[p].type === "hq"
			let is_heavy_arty = Engine.game_utils.is_heavy_arty(p)

			// One GE Yildirim does not count towards the limit
			let is_yildirim = data.pieces[p].symbol === "Y" && data.pieces[p].nation === "ge"
			let yildirim_free = false
			if (is_yildirim && !game.advance_yildirim_used) {
				game.advance_yildirim_used = true
				yildirim_free = true
			}

			if (!is_hq && !is_heavy_arty && !yildirim_free) {
				game.advance_count = (game.advance_count || 0) + 1
			}

			if (is_advance_stop_terrain(game, game.advance_space)) {
				if (!game.advanced_stopped) game.advanced_stopped = []
				set_add(game.advanced_stopped, p)
			}

			bulls_eye_record_advanced_piece(game, p)

			set_delete(game.advance_pieces, p)

			// Check if we can still advance any regular units
			let regular_left = game.advance_pieces.some((uid) => data.pieces[uid].type !== "hq")
			let limit_reached = (game.advance_count || 0) >= (game.advance_limit || 3)

			if (
				game.advance_pieces.length === 0 ||
				(limit_reached &&
					!regular_left &&
					!(
						!game.advance_yildirim_used &&
						game.advance_pieces.some(
							(uid) => data.pieces[uid].symbol === "Y" && data.pieces[uid].nation === "ge"
						)
					))
			) {
				this.end_advance()
			} else if (limit_reached) {
				// Only allow HQs or unused Yildirim if limit reached
				let allowed = game.advance_pieces.filter((uid) => {
					if (data.pieces[uid].type === "hq") return true
					if (
						!game.advance_yildirim_used &&
						data.pieces[uid].symbol === "Y" &&
						data.pieces[uid].nation === "ge"
					)
						return true
					return false
				})
				if (allowed.length === 0) {
					this.end_advance()
				}
			}
		},
		end_advance() {
			delete game.advance_yildirim_used
			if (bulls_eye_can_extra_attack(game)) {
				game.state = "bulls_eye_extra_attack_prompt"
				return
			}
			game.bulls_eye_advanced_stack = []
			if (game.active === CP && has_window_cc_options("post_advance_cc_cp", CP, false)) {
				game.state = "post_advance_cc_cp"
				return
			}
			goto_attack()
		}
	}

	states.bulls_eye_extra_attack_prompt = {
		prompt(res) {
			res.prompt("靶心指令：激活推进的土耳其部队进行额外进攻？")
			res.action("yes")
			res.action("no")
		},
		yes() {
			game.state = "bulls_eye_attack"
		},
		no() {
			game.bulls_eye_advanced_stack = []
			goto_attack()
		}
	}

	states.bulls_eye_attack = {
		prompt(res) {
			res.prompt("靶心指令：选择额外进攻的目标")

			let targets = get_attackable_spaces(game.bulls_eye_advanced_stack)

			for (let t of targets) {
				res.space(t)
			}
			res.action("cancel")
		},
		space(s) {
			push_undo()
			game.attack = {
				pieces: game.bulls_eye_advanced_stack,
				space: s,
				extra_attack: true
			}
			bulls_eye_use_extra_attack(game)
			game.bulls_eye_advanced_stack = []

			game.state = "confirm_attack"
		},
		cancel() {
			game.bulls_eye_advanced_stack = []
			game.attack = null
			game.state = "attack"
		}
	}

	return {
		start_attack_sequence,
		get_attackable_spaces
	}
}
