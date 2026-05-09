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
		push_undo,
		clear_undo,
		active_faction,
		get_attackable_spaces: get_legal_attackable_spaces,
		get_pieces_in_space,
		space_name,
		refresh_attack_eligibility,
		is_scu,
		is_lcu,
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
		update_jihad_level,
		card_name,
		AP,
		CP,
		has_trench,
		remove_trench
	} = context
	const JERUSALEM = find_space("Jerusalem")

	const UPRISING_MARKER_RULES = [
		{ key: "persian_uprising_markers", enemies: [AP], label: "Persian Uprising" },
		{ key: "armenian_uprising_markers", enemies: [CP], label: "Armenian Uprising" }
	]

	function get_enemy_uprising_marker_rule(s, faction = active_faction()) {
		for (let rule of UPRISING_MARKER_RULES) {
			if (!rule.enemies.includes(faction)) continue
			let markers = game[rule.key]
			if (Array.isArray(markers) && markers.includes(s)) return rule
		}
		return null
	}

	function can_piece_participate_in_marker_removal(p, faction = active_faction()) {
		if (p < 0 || !data.pieces[p]) return false
		if (is_not_on_map(game, p)) return false
		if (set_has(game.moved, p) || set_has(game.attacked, p)) return false
		if (!Engine.game_utils.can_piece_be_activated(p)) return false
		if (Engine.game_utils.get_piece_effective_faction(game, p) !== faction) return false
		let s = game.pieces[p]
		let supply_status = Engine.map.get_supply_status(game, s, faction, p)
		if (supply_status === "OOS") return false
		if (Engine.neutral.is_greek_piece(p)) {
			return (
				Engine.neutral.can_move_piece_for_faction(game, p, faction) ||
				Engine.neutral.can_attack_piece_for_faction(game, p, faction)
			)
		}
		return true
	}

	function get_combat_uprising_marker_removal_units(faction = active_faction()) {
		let spaces = new Set([...(game.activated?.attack || []), ...(game.activated?.attack_egypt || [])])
		let units = []
		for (let s of spaces) {
			if (!get_enemy_uprising_marker_rule(s, faction)) continue
			for (let p of get_pieces_in_space(game, s)) {
				if (can_piece_participate_in_marker_removal(p, faction)) set_add(units, p)
			}
		}
		return units
	}

	function can_selected_attack_pieces_remove_uprising_marker(removal_units = null) {
		if (!game.attack || !Array.isArray(game.attack.pieces) || game.attack.pieces.length !== 1) return false
		let p = game.attack.pieces[0]
		return (removal_units || get_combat_uprising_marker_removal_units()).includes(p)
	}

	function remove_enemy_uprising_marker(s, faction = active_faction()) {
		let rule = get_enemy_uprising_marker_rule(s, faction)
		if (!rule) return null
		game[rule.key] = game[rule.key].filter((marker_space) => marker_space !== s)
		return rule
	}

	function finish_combat_uprising_marker_removal(p, rule, s) {
		if (!Array.isArray(game.attacked)) game.attacked = []
		set_add(game.attacked, p)
		delete game.attack_eligibility_cache
		log(`${piece_name(p)} removes ${rule.label} marker in ${space_name(s)}.`)
		if (game.attack) {
			game.attack.pieces = []
			game.attack.space = -1
		}
		reset_attack_focus()
		refresh_attack_eligibility()
		if (game.eligible_attackers.length > 0 || get_combat_uprising_marker_removal_units().length > 0) {
			game.state = "attack"
		} else {
			game.state = "end_operations"
		}
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

	function mark_reserves_to_front_damage(p) {
		if (!game.attack) return
		let nation = Engine.game_utils.get_piece_nation(p)
		if (nation !== "tu" && nation !== "tua") return
		if (!game.attack.reserves_to_front_damaged_pieces) game.attack.reserves_to_front_damaged_pieces = []
		set_add(game.attack.reserves_to_front_damaged_pieces, p)
	}

	function can_select_all_attackers() {
		if (game.eligible_attackers.length === 0) return false
		let attacking_from_siege = game.eligible_attackers.some((p) => Engine.map.is_besieged(game, game.pieces[p]))
		if (attacking_from_siege) return false
		return get_attackable_spaces(game.eligible_attackers).length > 0
	}

	function get_liberate_suez_required_attack_spaces() {
		if (!game.liberate_suez_battle_required) return []
		if (Array.isArray(game.liberate_suez_required_attack_spaces)) {
			return game.liberate_suez_required_attack_spaces.filter((s) => s > 0 && data.spaces[s])
		}
		let spaces = []
		if (Array.isArray(game.activated?.attack)) {
			for (let s of game.activated.attack) {
				if (Engine.map.is_egypt(s)) set_add(spaces, s)
			}
		}
		if (Array.isArray(game.activated?.attack_egypt)) {
			for (let s of game.activated.attack_egypt) set_add(spaces, s)
		}
		return spaces
	}

	function can_liberate_suez_piece_still_attack_egypt(p) {
		if (set_has(game.attacked, p)) return false
		if (Array.isArray(game.retreated) && set_has(game.retreated, p)) return false
		if (is_not_on_map(game, p)) return false
		if (Engine.game_utils.get_piece_effective_faction(game, p) !== CP) return false
		if (!is_lcu(p) && !is_scu(p)) return false
		return get_attackable_spaces([p]).some((s) => Engine.map.is_egypt(s))
	}

	function get_pending_liberate_suez_attack_spaces() {
		let pending = []
		for (let s of get_liberate_suez_required_attack_spaces()) {
			let pieces = get_pieces_in_space(game, s)
			if (pieces.some((p) => can_liberate_suez_piece_still_attack_egypt(p))) {
				set_add(pending, s)
			}
		}
		return pending
	}

	function has_pending_liberate_suez_attack() {
		return get_pending_liberate_suez_attack_spaces().length > 0
	}

	function reset_attack_focus() {
		game.where = -1
	}

	function format_piece_log(p, reduced = null) {
		let is_reduced = reduced
		if (is_reduced === null) is_reduced = Engine.game_utils.is_piece_reduced(game, p)
		let name = data.pieces[p] ? data.pieces[p].name : piece_name(p)
		if (is_reduced) return `(${name})`
		return name
	}

	function ensure_attack_log_section(flag, title) {
		if (!game.attack) return
		if (game.attack[flag]) return
		log(`**${title}**`)
		game.attack[flag] = true
	}

	function needs_jerusalem_special_rule() {
		if (!game.attack || game.attack.space !== JERUSALEM) return false
		if ((game.attack.pieces?.length || 0) < 3) return false
		if (game.attack.jerusalem_special_resolved) return false
		return !game.events["jerusalem_actual_combat"]
	}

	function apply_jerusalem_battleground_penalty() {
		if (!game.attack || game.attack.jerusalem_battleground_penalty_applied) return
		let defender = game.attack.defender || other_faction(game.attack.attacker || game.active)
		if (defender === CP) game.vp -= 1
		else game.vp += 1
		update_jihad_level(game, 1)
		log("耶路撒冷变为战区，圣战等级 +1。")
		log(`${defender === CP ? "同盟国" : "协约国"}因将耶路撒冷变为战区而承受 1 VP 惩罚。`)
		game.attack.jerusalem_battleground_penalty_applied = true
	}

	function enter_jerusalem_withdrawal_advance() {
		let attackers = (game.attack?.pieces || []).filter((p) => !is_not_on_map(game, p))
		let advance_pieces = get_advance_pieces(game, {
			attackers,
			advance_with_reduced: true
		}).filter((p) => set_has(attackers, p))
		if (advance_pieces.length === 0) {
			goto_attack()
			return
		}
		game.advance_pieces = advance_pieces
		game.advance_space = game.attack.space
		game.advance_count = 0
		game.advance_limit = 3
		game.advance_trench_processed = false
		game.active = game.attack?.attacker || game.active
		game.state = "advance"
	}

	states.attack = {
		prompt(res) {
			if (res && res._is_noop) return
			refresh_attack_eligibility()
			let removal_units = get_combat_uprising_marker_removal_units()
			let removal_unit_set = new Set(removal_units)
			let eligible_attacker_set = new Set(game.eligible_attackers)
			if (game.eligible_attackers.length === 0 && removal_units.length === 0) {
				res.prompt("操作完成.")
				res.action("end_action")
				return
			}

			if (!game.attack) {
				game.attack = { pieces: [], space: -1 }
			}
			if (typeof game.where !== "number") {
				game.where = -1
			}

			if (has_pending_liberate_suez_attack()) {
				res.prompt("解放苏伊士：已指定进攻埃及的 CP 单位必须攻击埃及目标，然后才能结束进攻阶段。")
			} else {
				res.prompt("请选择攻击单位和目标")
			}
			let selected_pieces = game.attack.pieces || []
			let prompt_attackable_cache = new Map()
			function get_cached_attackable_spaces(pieces) {
				if (!Array.isArray(pieces) || pieces.length === 0) return []
				let key =
					pieces.length === 1
						? `p:${pieces[0]}`
						: `g:${pieces
								.slice()
								.sort((a, b) => a - b)
								.join(",")}`
				if (!prompt_attackable_cache.has(key)) {
					prompt_attackable_cache.set(key, get_legal_attackable_spaces(pieces))
				}
				return prompt_attackable_cache.get(key)
			}
			if (selected_pieces.length > 0) {
				let selected_spaces = [...new Set(selected_pieces.map((p) => game.pieces[p]).filter((s) => s > 0))]
				if (game.attack.space !== -1) {
					res.where(game.attack.space)
				} else if (selected_spaces.length === 1) {
					res.where(selected_spaces[0])
				} else if (selected_spaces.length > 1) {
					res.where(selected_spaces)
				}
				res.who(selected_pieces)
			}

			if (selected_pieces.length === 0) {
				for (let p of game.eligible_attackers) {
					res.piece(p)
				}
				for (let p of removal_units) {
					if (!eligible_attacker_set.has(p)) res.piece(p)
				}
				if (can_select_all_attackers()) {
					res.action("select_all")
				}
			} else {
				let selected_can_attack = selected_pieces.every((p) => eligible_attacker_set.has(p))
				let selected_targets = selected_can_attack ? get_cached_attackable_spaces(selected_pieces) : []

				let prompted_pieces = new Set()
				for (let p of selected_pieces) {
					if (!eligible_attacker_set.has(p) && !removal_unit_set.has(p)) continue
					res.piece(p)
					prompted_pieces.add(p)
				}
				for (let p of game.eligible_attackers) {
					if (set_has(selected_pieces, p)) {
						if (!prompted_pieces.has(p)) res.piece(p)
						continue
					}
					if (selected_can_attack && get_cached_attackable_spaces([...selected_pieces, p]).length > 0) {
						res.piece(p)
					}
				}

				for (let t of selected_targets) {
					res.space(t)
				}

				if (can_selected_attack_pieces_remove_uprising_marker(removal_units)) {
					res.action("remove_uprising_marker")
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
			let is_selected = set_has(game.attack.pieces, p)
			if (!is_selected) {
				let removal_units = get_combat_uprising_marker_removal_units()
				let eligible_attacker_set = new Set(game.eligible_attackers)
				let is_eligible_attacker = eligible_attacker_set.has(p)
				let is_removal_unit = removal_units.includes(p)
				if (!is_eligible_attacker && !is_removal_unit) return
				if (!is_eligible_attacker && game.attack.pieces.length > 0) return
				if (is_eligible_attacker && game.attack.pieces.some((q) => !eligible_attacker_set.has(q))) return
			}
			if (game.attack.pieces.length === 0) push_undo()
			set_toggle(game.attack.pieces, p)
			game.attack.space = -1
		},
		space(s) {
			if (!game.attack) {
				game.attack = { pieces: [], space: -1 }
			}

			let selected_pieces = game.attack.pieces || []
			if (selected_pieces.length === 0) {
				return
			}

			let targets = get_attackable_spaces(selected_pieces)
			if (!targets.includes(s)) {
				return
			}

			push_undo()
			game.attack.space = s
			game.state = "confirm_attack"
		},
		remove_uprising_marker() {
			if (!can_selected_attack_pieces_remove_uprising_marker()) return
			let p = game.attack.pieces[0]
			let s = game.pieces[p]
			push_undo()
			let rule = remove_enemy_uprising_marker(s)
			if (!rule) return
			finish_combat_uprising_marker_removal(p, rule, s)
		},
		select_all() {
			refresh_attack_eligibility()
			if (!can_select_all_attackers()) return
			if (!game.attack) {
				game.attack = { pieces: [], space: -1 }
			}
			if (!Array.isArray(game.attack.pieces)) {
				game.attack.pieces = []
			}
			push_undo()
			for (let p of game.eligible_attackers) {
				set_add(game.attack.pieces, p)
			}
			reset_attack_focus()
			game.attack.space = -1
		},
		cancel_selection() {
			push_undo()
			if (game.attack) {
				game.attack.pieces = []
				game.attack.space = -1
			}
			reset_attack_focus()
		},
		end_attack() {
			refresh_attack_eligibility()
			if (has_pending_liberate_suez_attack()) {
				log("解放苏伊士：已指定进攻埃及的 CP 单位仍有合法埃及目标，不能结束进攻阶段。")
				game.state = "attack"
				return
			}
			if (game.event_romania_attack_required && game.eligible_attackers.length > 0) {
				log("罗马尼亚：必须用该事件完成一次攻击，不能结束进攻阶段。")
				game.state = "attack"
				return
			}
			push_undo()
			if (game.attack) {
				delete game.attack
			}
			reset_attack_focus()
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
			if (combat.is_black_sea_amphibious_invasion(game)) {
				res.prompt("确认黑海两栖突袭")
			} else {
				let odds = fmt_attack_odds(game)
				if (odds) {
					res.prompt(`确认攻击: ${odds}`)
				} else {
					res.prompt("确认攻击")
				}
			}
			res.action("confirm")
			res.action("cancel")
		},
		confirm() {
			clear_undo()
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
			if (has_pending_liberate_suez_attack()) {
				log("解放苏伊士：已指定进攻埃及的 CP 单位仍有合法埃及目标，不能跳过进攻。")
				game.state = "attack"
				return
			}
			if (game.event_romania_attack_required && game.eligible_attackers.length > 0) {
				log("罗马尼亚：必须用该事件完成一次攻击，不能跳过进攻。")
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
		inactive: "确认事件",
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
		inactive: "结束行动",
		prompt(res) {
			res.prompt("操作完成.")
			res.action("end_action")
		},
		end_action() {
			refresh_attack_eligibility()
			if (has_pending_liberate_suez_attack()) {
				log("解放苏伊士：已指定进攻埃及的 CP 单位仍有合法埃及目标，当前不能结束行动轮。")
				game.state = "attack"
				return
			}
			if (game.event_romania_attack_required && game.eligible_attackers.length > 0) {
				log("罗马尼亚：必须先完成这次事件攻击。")
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
		log_combat_card_side("attacker")
		game.active = other_faction(game.active)
		enter_combat_card_state("play_cc_defender")
	}

	function finalize_defender_cc_step() {
		if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
		log_combat_card_side("defender")
		resolve_battle_sequence()
	}

	function apply_severe_weather_before_cc() {
		if (!game.attack || game.attack.severe_weather_checked) return
		combat.apply_severe_weather(game, log, get_season(game), reduce_piece)
		game.attack.severe_weather_checked = true
	}

	function format_combat_card_summary_line(side) {
		let cards = (game.combat_cards && game.combat_cards[side]) || []
		let label = side === "attacker" ? "进攻方" : "防守方"
		return `${label}：${cards.length ? cards.map((c) => card_name(c)).join("，") : "无"}`
	}

	function ensure_combat_card_log_header() {
		if (!game.attack) return
		if (game.attack.cc_log_header) return
		game.attack.cc_log_header = true
		log("*战斗卡：")
	}

	function log_combat_card_side(side) {
		if (!game.attack) return
		if (!game.attack.cc_log_sides) game.attack.cc_log_sides = {}
		if (game.attack.cc_log_sides[side]) return
		game.attack.cc_log_sides[side] = true
		log(`>> ${format_combat_card_summary_line(side)}`)
	}

	function enter_combat_card_state(state) {
		game.state = state
	}

	function start_standard_cc_window() {
		apply_severe_weather_before_cc()
		game.active = game.attack?.attacker || game.active
		ensure_combat_card_log_header()
		enter_combat_card_state("play_cc_attacker")
	}

	function finalize_pre_weather_attacker_cc_step() {
		if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
		game.active = game.attack?.defender || other_faction(game.active)
		if (has_window_cc_options("pre_weather_cc_defender", game.active, false)) {
			enter_combat_card_state("pre_weather_cc_defender")
			return
		}
		start_standard_cc_window()
	}

	function finalize_pre_weather_defender_cc_step() {
		if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
		start_standard_cc_window()
	}

	function goto_pre_weather_step() {
		game.active = game.attack?.attacker || game.active
		if (has_window_cc_options("pre_weather_cc_attacker", game.active, true)) {
			enter_combat_card_state("pre_weather_cc_attacker")
			return
		}
		let defender = game.attack?.defender || other_faction(game.active)
		if (has_window_cc_options("pre_weather_cc_defender", defender, false)) {
			game.active = defender
			enter_combat_card_state("pre_weather_cc_defender")
			return
		}
		start_standard_cc_window()
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
			game.turkish_retreat = true
			resolve_after_turkish_retreat_choice()
		},
		skip_turkish_retreat() {
			game.turkish_retreat = false
			resolve_after_turkish_retreat_choice()
		}
	}

	const BATTLE_SUB_STATES = new Set([
		"retreat",
		"advance",
		"catastrophic_attack_choose_stack",
		"catastrophic_attack_retreat",
		"catastrophic_attack_advance",
		"turkish_retreat",
		"jafar_pasha_retreat",
		"retreat_cancel",
		"save_tiflis_retreat",
		"choose_lcu_replacement",
		"post_roll_cc_defender",
		"post_battle_cc_cp",
		"post_advance_cc_cp",
		"retreat_choice_cc_cp",
		"maude_place_indian_division",
		"maude_place_hq",
		"army_of_islam_place_hq",
		"confused_orders",
		"declare_turkish_retreat"
	])

	function can_play_combat_card(c, target_game) {
		return combat_cards.can_play_combat_card(target_game, c)
	}

	function get_used_ccs_this_action(target_game) {
		if (!target_game || !target_game.action_state) return []
		return Array.isArray(target_game.action_state.used_ccs) ? target_game.action_state.used_ccs : []
	}

	function is_cc_used_this_action(target_game, c) {
		return set_has(get_used_ccs_this_action(target_game), c)
	}

	function mark_cc_used_this_action(target_game, c) {
		if (!target_game.action_state || typeof target_game.action_state !== "object") {
			target_game.action_state = {}
		}
		if (!Array.isArray(target_game.action_state.used_ccs)) {
			target_game.action_state.used_ccs = []
		}
		set_add(target_game.action_state.used_ccs, c)
	}

	function collect_playable_cc_options(target_game, faction, is_attacker) {
		let hand = faction === AP ? target_game.hand_ap || [] : target_game.hand_cp || []
		let retained = get_cc_retained(faction)
		let options = []
		for (let c of hand) {
			if (!data.cards[c].cc) continue
			if (is_cc_used_this_action(target_game, c)) continue
			if (is_attacker && c === combat.CC_CP_JAFAR_PASHA) continue
			if (!can_play_combat_card(c, target_game)) continue
			set_add(options, c)
		}
		for (let c of retained) {
			if (!data.cards[c].cc) continue
			if (is_cc_used_this_action(target_game, c)) continue
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
		return collect_playable_cc_options(window_game, faction, is_attacker)
	}

	function has_window_cc_options(window_state, faction, is_attacker) {
		return collect_window_cc_options(game, window_state, faction, is_attacker).length > 0
	}

	function show_attack_context(res) {
		if (game.attack && game.attack.space !== -1) {
			res.where(game.attack.space)
			res.who(game.attack.pieces)
		}
	}

	function get_reinforcement_space_options(helper) {
		if (!helper || typeof helper.check !== "function") return []
		let options = []
		let enemy_faction = other_faction(helper.faction)
		let enemy_spaces = []
		for (let s = 1; s < data.spaces.length; s++) {
			let pieces = get_pieces_in_space(game, s)
			if (pieces.length > 0 && data.pieces[pieces[0]] && data.pieces[pieces[0]].faction === enemy_faction) {
				enemy_spaces.push(s)
			}
		}

		for (let s = 1; s < data.spaces.length; s++) {
			if (!helper.check(game, s)) continue
			if (Engine.game_utils.get_capacity(game, s) > 0) {
				set_add(options, s)
				continue
			}

			let neighbors = get_connected_spaces(game, s)
			let candidates = neighbors.filter((ns) => Engine.game_utils.get_capacity(game, ns) > 0)
			if (candidates.length === 0) continue

			let max_min_dist = -1
			let best_candidates = []
			for (let ns of candidates) {
				let min_enemy_dist = 999
				for (let es of enemy_spaces) {
					let distance = Engine.map.get_distance(ns, es)
					if (distance < min_enemy_dist) min_enemy_dist = distance
				}
				if (min_enemy_dist > max_min_dist) {
					max_min_dist = min_enemy_dist
					best_candidates = [ns]
				} else if (min_enemy_dist === max_min_dist) {
					best_candidates.push(ns)
				}
			}

			for (let ns of best_candidates) set_add(options, ns)
		}

		set_add(options, Engine.game_utils.get_reserve_box(helper.faction))
		return options
	}

	function get_maude_attack_origin_spaces() {
		let seen = new Set()
		let spaces = []
		for (let p of game.attack?.pieces || []) {
			let s = game.pieces[p]
			if (seen.has(s)) continue
			seen.add(s)
			spaces.push(s)
		}
		return spaces
	}

	function get_maude_hq_space_options() {
		let options = []
		for (let s of get_maude_attack_origin_spaces()) {
			let pieces = get_pieces_in_space(game, s).filter(
				(p) => Engine.game_utils.get_piece_effective_faction(game, p) === AP
			)
			let has_br = Engine.game_utils.pieces_count_as_any_nation_for_rule(game, pieces, "br")
			let has_in = Engine.game_utils.pieces_count_as_any_nation_for_rule(game, pieces, "in")
			if (has_br && has_in) options.push(s)
		}
		return options
	}

	function get_maude_reinforcement_space_options() {
		let helper = Engine.reinf_helpers?.is_br
		let options = get_reinforcement_space_options(helper)
		if (get_maude_hq_space_options().length > 0) return options
		let attack_spaces = new Set(get_maude_attack_origin_spaces())
		return options.filter((s) => {
			if (!attack_spaces.has(s)) return false
			let pieces = get_pieces_in_space(game, s).filter(
				(p) => Engine.game_utils.get_piece_effective_faction(game, p) === AP
			)
			return Engine.game_utils.pieces_count_as_any_nation_for_rule(game, pieces, "br")
		})
	}

	function get_army_of_islam_space_options() {
		if (typeof combat_cards.get_army_of_islam_space_options !== "function") return []
		return combat_cards.get_army_of_islam_space_options(game)
	}

	function continue_after_retreat_choice_cc_window() {
		game.retreat_choice_cc_cp_done = true
		game.retreat_choice_cc_done = true
		delete game.retreat_choice_resume_state
		delete game.retreat_choice_prev_active
		combat.end_battle_sequence(game, log)
	}

	function resume_window_combat_card_state(return_state) {
		switch (return_state) {
			case "pre_weather_cc_attacker":
				game.active = game.attack?.attacker || game.active
				if (has_window_cc_options("pre_weather_cc_attacker", game.active, true)) {
					enter_combat_card_state("pre_weather_cc_attacker")
				} else {
					finalize_pre_weather_attacker_cc_step()
				}
				return true
			case "pre_weather_cc_defender":
				game.active = game.attack?.defender || other_faction(game.active)
				if (has_window_cc_options("pre_weather_cc_defender", game.active, false)) {
					enter_combat_card_state("pre_weather_cc_defender")
				} else {
					finalize_pre_weather_defender_cc_step()
				}
				return true
			case "post_roll_cc_defender":
				game.active = CP
				if (has_window_cc_options("post_roll_cc_defender", CP, false)) {
					game.state = "post_roll_cc_defender"
				} else {
					game.post_roll_cc_done = true
					game.active = game.attack?.attacker || AP
					end_battle_sequence()
				}
				return true
			case "post_battle_cc_cp":
				game.active = CP
				if (has_window_cc_options("post_battle_cc_cp", CP, false)) {
					game.state = "post_battle_cc_cp"
				} else {
					continue_after_post_battle_cc()
				}
				return true
			case "post_advance_cc_cp":
				game.active = CP
				if (has_window_cc_options("post_advance_cc_cp", CP, false)) {
					game.state = "post_advance_cc_cp"
				} else {
					goto_attack()
				}
				return true
			case "retreat_choice_cc_cp":
				continue_after_retreat_choice_cc_window()
				return true
			default:
				return false
		}
	}

	function register_combat_card_state(name, config) {
		states[name] = {
			inactive: "打出战斗卡",
			prompt(res) {
				res.prompt(config.prompt)
				show_attack_context(res)
				let options = config.get_options()
				for (let c of options) res.action("play_cc", c)
				res.action("done")
			},
			play_cc(c) {
				handle_play_cc(game, c, config.is_attacker)
			},
			done() {
				config.done()
			}
		}
		if (config.allow_pass) {
			states[name].pass = function () {
				config.done()
			}
		}
	}

	// 统一战斗卡打出上下文，避免状态机里散落每张卡的来源处理与收尾逻辑。
	function create_combat_card_play_context(
		game,
		c,
		info,
		faction,
		is_attacker,
		from_retained,
		return_state,
		mark_effected
	) {
		function dispose_after_use(after_use) {
			if (after_use === "remove") move_card_to_removed(c, faction)
			else move_card_to_discard(c, faction)
		}

		return {
			game,
			card: c,
			info,
			faction,
			is_attacker,
			from_retained,
			return_state,
			log,
			card_name: () => card_name(c),
			mark_effected: () => mark_effected(c),
			remove_card_from_hand() {
				remove_card_from_hand(c, faction)
			},
			add_cc_retained(target_faction, after_use) {
				add_cc_retained(target_faction, c, after_use)
			},
			take_retained_card() {
				let after_use = get_cc_retained_after_use(faction, c)
				remove_cc_retained(faction, c)
				return after_use
			},
			dispose_after_use,
			dispose_standard() {
				if (from_retained) {
					dispose_after_use(this.take_retained_card())
				} else if (info.remove) {
					remove_card(c)
				} else {
					discard_card(c)
				}
			},
			apply_war_status() {
				if (info.ws) {
					update_war_status(faction, info.ws)
				}
			}
		}
	}

	function resume_combat_card_flow(return_state, is_attacker) {
		if (resume_window_combat_card_state(return_state)) {
			return
		}

		enter_combat_card_state(is_attacker ? "play_cc_attacker" : "play_cc_defender")
	}

	function handle_play_cc(game, c, is_attacker) {
		// Defense in depth: the UI should already hide these cards, but some
		// event/state round-trips can re-enter combat windows with stale actions.
		if (is_cc_used_this_action(game, c)) return
		if (!game.combat_cards) game.combat_cards = { attacker: [], defender: [] }
		if (!game.combat_cards_effected) game.combat_cards_effected = []
		let return_state = game.state
		let faction = game.active
		let info = data.cards[c]
		let retained = get_cc_retained(faction)
		let from_retained = set_has(retained, c)
		if (is_attacker) {
			game.combat_cards.attacker.push(c)
		} else {
			game.combat_cards.defender.push(c)
		}
		mark_cc_used_this_action(game, c)
		const mark_effected = (card) => {
			set_add(game.combat_cards_effected, card)
		}
		let spec = combat_cards.get_combat_card_spec(c)
		let ctx = create_combat_card_play_context(
			game,
			c,
			info,
			faction,
			is_attacker,
			from_retained,
			return_state,
			mark_effected
		)

		if (spec?.on_play?.(ctx) === "stop") {
			return
		}

		if (!spec?.dispose?.(ctx)) {
			ctx.dispose_standard()
		}
		ctx.apply_war_status()

		let hook_result = spec?.on_play_after_disposition?.(game, ctx)
		if (hook_result === "stop") {
			return
		}

		resume_combat_card_flow(return_state, is_attacker)
	}

	register_combat_card_state("play_cc_attacker", {
		prompt: "进攻方：打出战斗卡",
		is_attacker: true,
		get_options: () => collect_playable_cc_options(game, game.active, true),
		done: finalize_attacker_cc_step,
		allow_pass: true
	})

	register_combat_card_state("play_cc_defender", {
		prompt: "防守方：打出战斗卡",
		is_attacker: false,
		get_options: () => collect_playable_cc_options(game, game.active, false),
		done: finalize_defender_cc_step,
		allow_pass: true
	})

	register_combat_card_state("pre_weather_cc_attacker", {
		prompt: "进攻方：打出先于恶劣天气判定的战斗卡",
		is_attacker: true,
		get_options: () => collect_window_cc_options(game, "pre_weather_cc_attacker", game.active, true),
		done: finalize_pre_weather_attacker_cc_step,
		allow_pass: true
	})

	register_combat_card_state("pre_weather_cc_defender", {
		prompt: "防守方：打出先于恶劣天气判定的战斗卡",
		is_attacker: false,
		get_options: () => collect_window_cc_options(game, "pre_weather_cc_defender", game.active, false),
		done: finalize_pre_weather_defender_cc_step,
		allow_pass: true
	})

	states.maude_place_indian_division = {
		inactive: "打出战斗卡",
		prompt(res) {
			res.prompt("莫德：放置印度第15步兵师")
			show_attack_context(res)
			for (let s of get_maude_reinforcement_space_options()) res.space(s)
		},
		space(s) {
			push_undo()
			Engine.events.reinforce(game, "IN 15th DIV", AP, s)
			game.active = AP
			game.state = "maude_place_hq"
		}
	}

	states.maude_place_hq = {
		inactive: "打出战斗卡",
		prompt(res) {
			res.prompt("莫德：将莫德HQ放置到包含英国与印度部队的攻击地块")
			show_attack_context(res)
			for (let s of get_maude_hq_space_options()) res.space(s)
		},
		space(s) {
			push_undo()
			let maude_hq = Engine.game_utils.find_piece(AP, "BR Maude HQ")
			if (maude_hq >= 0) {
				game.pieces[maude_hq] = s
				if (game.attack && Array.isArray(game.attack.pieces) && !game.attack.pieces.includes(maude_hq)) {
					game.attack.pieces.push(maude_hq)
					combat.remember_attack_piece_origin(game, maude_hq)
				}
				log(`增援：BR Maude HQ 放置到 ${space_name(s)} 并加入战斗`)
			}
			let return_state = game.maude_cc?.return_state || "play_cc_attacker"
			let prev_active = game.maude_cc?.prev_active || AP
			delete game.maude_cc
			game.active = prev_active
			resume_combat_card_flow(return_state, true)
		}
	}

	states.army_of_islam_place_hq = {
		inactive: "打出战斗卡",
		prompt(res) {
			res.prompt("伊斯兰军：将伊斯兰军HQ放置到已启动攻击的土耳其/土耳其-阿拉伯部队所在攻击地块")
			show_attack_context(res)
			for (let s of get_army_of_islam_space_options()) res.space(s)
		},
		space(s) {
			push_undo()
			let army_of_islam_hq = Engine.game_utils.find_piece(CP, "TU Army Islam HQ")
			if (army_of_islam_hq >= 0) {
				game.pieces[army_of_islam_hq] = s
				if (
					game.attack &&
					Array.isArray(game.attack.pieces) &&
					!game.attack.pieces.includes(army_of_islam_hq)
				) {
					game.attack.pieces.push(army_of_islam_hq)
					combat.remember_attack_piece_origin(game, army_of_islam_hq)
				}
				log(`增援：TU Army Islam HQ 放置到 ${space_name(s)} 并加入战斗`)
			}
			let return_state = game.army_of_islam_cc?.return_state || "play_cc_attacker"
			let prev_active = game.army_of_islam_cc?.prev_active || CP
			delete game.army_of_islam_cc
			game.active = prev_active
			resume_combat_card_flow(return_state, true)
		}
	}

	function finalize_jafar_pasha_choice() {
		if (game.cc_jafar_pasha && game.cc_jafar_pasha.after_use === "remove") {
			move_card_to_removed(game.cc_jafar_pasha.card, game.cc_jafar_pasha.faction)
		} else if (game.cc_jafar_pasha && game.cc_jafar_pasha.after_use === "discard") {
			move_card_to_discard(game.cc_jafar_pasha.card, game.cc_jafar_pasha.faction)
		} else if (game.cc_jafar_pasha) {
			game.cc_jafar_pasha_post_battle = true
		}
		game.cc_jafar_pasha = null
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
				if (is_not_on_map(game, p)) continue
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
			enter_combat_card_state("play_cc_attacker")
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
				combat.remember_attack_piece_origin(game, p)
				set_add(game.attacked, p)
				delete game.march_and_countermarch
				enter_combat_card_state("play_cc_attacker")
			}
		},
		cancel() {
			delete game.march_and_countermarch
			enter_combat_card_state("play_cc_attacker")
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
			let target = game.surprise.space
			for (let p = 0; p < data.pieces.length; p++) {
				if (!data.pieces[p]) continue
				if (Engine.game_utils.get_piece_effective_faction(game, p) !== CP) continue
				if (!["tu", "tua"].includes(data.pieces[p].nation)) continue
				if (!is_scu(p)) continue
				if (is_not_on_map(game, p) && !is_in_reserve(game, p)) continue
				if (!can_stack_end_in_space(game, target, [p])) continue
				if (is_in_reserve(game, p)) {
					res.piece(p)
				} else if (
					game.pieces[p] !== target &&
					Engine.map.has_sr_path(game, p, game.pieces[p], target, CP, false)
				) {
					res.piece(p)
				}
			}
		},
		piece(p) {
			push_undo()
			game.pieces[p] = game.surprise.space
			game.surprise.remaining -= 1
			if (game.surprise.remaining <= 0) {
				delete game.surprise
				resolve_battle_sequence()
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
				if (is_not_on_map(game, p)) continue
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
			let mode = game.cc_jafar_pasha?.mode
			res.prompt("贾法尔帕夏：选择效果")
			if (mode !== "reroll") res.action("retreat")
			if (mode !== "retreat") res.action("reroll")
		},
		retreat() {
			push_undo()
			if (!game.attack) return
			let attackers = game.attack.pieces || []
			let defenders = get_pieces_in_space(game, game.attack.space).filter(
				(p) =>
					Engine.game_utils.get_piece_effective_faction(game, p) === game.active &&
					!set_has(game.retreated, p)
			)
			if (!Array.isArray(game.retreated)) game.retreated = []
			game.jafar_pasha_retreat = {
				pieces: defenders,
				avoided_spaces: attackers.map((p) => game.pieces[p])
			}
			game.retreat_distance = 1
			game.retreat_from = game.attack.space
			game.retreat_space = game.attack.space
			game.retreat_steps_left = null
			game.selected_piece = null
			game.state = "jafar_pasha_retreat"
			if (defenders.length === 0) finish_jafar_pasha_retreat()
		},
		reroll() {
			finalize_jafar_pasha_choice()
			game.cc_jafar_pasha_reroll = true
			resolve_battle_sequence()
		}
	}

	function get_jafar_pasha_retreat_state() {
		if (!game.jafar_pasha_retreat) {
			game.jafar_pasha_retreat = { pieces: [], avoided_spaces: [] }
		}
		game.jafar_pasha_retreat.pieces = (game.jafar_pasha_retreat.pieces || []).filter(
			(p) => !is_not_on_map(game, p) && !is_eliminated(game, p)
		)
		if (!Array.isArray(game.jafar_pasha_retreat.avoided_spaces)) game.jafar_pasha_retreat.avoided_spaces = []
		return game.jafar_pasha_retreat
	}

	function get_jafar_pasha_retreat_spaces(piece) {
		let state = get_jafar_pasha_retreat_state()
		let valid = get_valid_retreat_spaces(game, piece, state.avoided_spaces, 1, false)
		return combat.apply_retreat_priorities(game, piece, valid)
	}

	function finish_jafar_pasha_retreat() {
		let advance_space = game.attack?.space
		delete game.jafar_pasha_retreat
		delete game.selected_piece
		delete game.retreat_pieces
		delete game.retreat_space
		delete game.retreat_distance
		delete game.retreat_from
		game.retreat_steps_left = null
		finalize_jafar_pasha_choice()
		game.jafar_pasha_advance_after_cancel = { advance_space }
		game.cc_jafar_pasha_retreat = true
		resolve_battle_sequence()
	}

	states.jafar_pasha_retreat = {
		prompt(res) {
			let state = get_jafar_pasha_retreat_state()
			res.who(state.pieces)
			res.where(game.retreat_space)

			if (state.pieces.length === 0) {
				res.prompt("贾法尔帕夏：撤退已完成")
				res.action("done")
				return
			}

			if (game.selected_piece === null || game.selected_piece === undefined) {
				res.prompt("贾法尔帕夏：选择防守单位后撤 1 格")
				for (let p of state.pieces) res.piece(p)
				return
			}

			let piece = game.selected_piece
			if (!set_has(state.pieces, piece)) {
				game.selected_piece = null
				res.prompt("贾法尔帕夏：选择防守单位后撤 1 格")
				for (let p of state.pieces) res.piece(p)
				return
			}

			res.prompt(`贾法尔帕夏：选择 ${data.pieces[piece].name} 的撤退地块`)
			let valid = get_jafar_pasha_retreat_spaces(piece)
			if (valid.length === 0) {
				res.action("eliminate_retreating")
			} else {
				for (let s of valid) res.space(s)
			}
			res.piece(piece)
		},
		piece(p) {
			let state = get_jafar_pasha_retreat_state()
			if (game.selected_piece === p) {
				game.selected_piece = null
			} else if (set_has(state.pieces, p)) {
				game.selected_piece = p
			}
		},
		space(s) {
			let state = get_jafar_pasha_retreat_state()
			let p = game.selected_piece
			if (p === null || p === undefined || !set_has(state.pieces, p)) return
			let valid = get_jafar_pasha_retreat_spaces(p)
			if (!set_has(valid, s)) return
			push_undo()
			let from = game.pieces[p]
			ensure_attack_log_section("retreat_log_started", "撤退：")
			log(`>> ${format_piece_log(p)} → s${s}`)
			game.pieces[p] = s
			game.retreat_space = s
			if (!Engine.map.is_controlled_by(game, s, game.active) && data.pieces[p].type === "regular") {
				set_control(game, s, game.active)
			}
			if (Engine.check_persia_entry_vp_penalty) {
				Engine.check_persia_entry_vp_penalty(game, s, [p])
			}
			if (from > 0) {
				Engine.sync_neutral_vp_state(game, from)
				Engine.sync_jihad_city_state(game, from)
				Engine.sync_region_control(game, from)
			}
			Engine.sync_region_control(game, s)
			Engine.sync_neutral_vp_state(game, s)
			Engine.sync_jihad_city_state(game, s)
			set_delete(state.pieces, p)
			set_add(game.retreated, p)
			game.selected_piece = null
			if (state.pieces.length === 0) finish_jafar_pasha_retreat()
		},
		eliminate_retreating() {
			let state = get_jafar_pasha_retreat_state()
			let p = game.selected_piece
			if (p === null || p === undefined || !set_has(state.pieces, p)) return
			push_undo()
			ensure_attack_log_section("retreat_log_started", "撤退：")
			log(`>> ${format_piece_log(p, true)} 无法撤退并被消灭`)
			eliminate_piece(p, true)
			set_delete(state.pieces, p)
			game.selected_piece = null
			if (state.pieces.length === 0) finish_jafar_pasha_retreat()
		},
		done() {
			finish_jafar_pasha_retreat()
		}
	}

	function start_attack_sequence() {
		delete game.jafar_pasha_retreat
		delete game.turkish_retreat_prev_active
		delete game.turkish_retreat_chosen_space
		delete game.retreat_choice_cc_done
		delete game.retreat_choice_resume_state
		delete game.retreat_choice_prev_active
		delete game.battle_resolution_applied
		combat.start_attack_sequence(game, log)
		if (game.attack) {
			delete game.attack.cc_log_header
			delete game.attack.cc_log_sides
		}
		if (combat.is_black_sea_amphibious_invasion(game)) {
			combat.resolve_black_sea_amphibious_invasion(game, log)
			return
		}
		if (needs_jerusalem_special_rule()) {
			game.attack.jerusalem_special_resolved = true
			game.active = game.attack.defender || other_faction(game.attack.attacker || game.active)
			game.state = "jerusalem_defender_choice"
			return
		}

		// Rule 12.2 sequence: Flank Attack Announcement (Step 2) before CC (Step 5)
		if (combat.check_can_flank(game) && game.attack.flank_attempt === undefined) {
			game.state = "choose_flank_attack"
		} else {
			goto_pre_weather_step()
		}
	}

	function get_attackable_spaces(pieces) {
		if (get_legal_attackable_spaces) {
			return get_legal_attackable_spaces(pieces)
		}
		return combat.get_legal_attackable_spaces(
			game,
			pieces,
			active_faction(),
			() => get_season(game),
			is_rail_connected_to_supply
		)
	}

	function resolve_battle_sequence() {
		const ctx = {
			log,
			eliminate_piece,
			check_mo_fulfillment: mo.check_mo_fulfillment,
			get_season: () => get_season(game),
			reduce_piece
		}
		if (combat.is_battle_cancelled_by_cc(game)) {
			let res = combat.resolve_battle_sequence(game, ctx)
			if (res === "end" || res === "cancelled") {
				if (game.jafar_pasha_advance_after_cancel) {
					continue_after_jafar_pasha_cancelled_battle()
					return
				}
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

		combat.resolve_flank_attempt(game, log)

		if (combat.resolve_battle_sequence(game, ctx) === "end") {
			if (game.attack?.space === JERUSALEM) {
				game.events["jerusalem_actual_combat"] = true
			}
			end_battle_sequence()
		}
	}

	states.jerusalem_defender_choice = {
		prompt(res) {
			res.where(game.attack?.space)
			res.who(game.attack?.pieces || [])
			res.prompt("耶路撒冷特殊规则：防守方必须选择战斗或撤退。")
			res.action("fight")
			res.action("withdraw")
		},
		fight() {
			push_undo()
			game.active = game.attack?.attacker || AP
			game.state = "jerusalem_attacker_choice"
		},
		withdraw() {
			if (!game.attack) return
			let defender = game.attack.defender || other_faction(game.attack.attacker || game.active)
			let defenders = get_pieces_in_space(game, game.attack.space).filter(
				(p) =>
					Engine.game_utils.get_piece_effective_faction(game, p) === defender &&
					!(Array.isArray(game.retreated) && set_has(game.retreated, p))
			)
			push_undo()
			log("耶路撒冷特殊规则：防守方选择在战斗前撤退。")
			game.jerusalem_withdrawal = true
			game.active = defender
			game.retreat_pieces = defenders
			game.retreat_space = game.attack.space
			game.retreat_from = game.attack.space
			game.retreat_distance = 1
			game.retreat_first_spaces = []
			game.retreat_steps_left = null
			game.selected_piece = null
			game.state = "retreat"
		}
	}

	states.jerusalem_attacker_choice = {
		prompt(res) {
			res.where(game.attack?.space)
			res.who(game.attack?.pieces || [])
			res.prompt("耶路撒冷特殊规则：防守方选择战斗。进攻方可以取消攻击，或继续并使耶路撒冷成为战区。")
			res.action("continue_attack")
			res.action("cancel_attack")
		},
		continue_attack() {
			push_undo()
			apply_jerusalem_battleground_penalty()
			game.active = game.attack?.attacker || AP
			if (combat.check_can_flank(game) && game.attack.flank_attempt === undefined) {
				game.state = "choose_flank_attack"
			} else {
				goto_pre_weather_step()
			}
		},
		cancel_attack() {
			push_undo()
			log("耶路撒冷特殊规则：进攻方取消了本次攻击。")
			goto_attack()
		}
	}

	states.choose_flank_attack = {
		prompt(res) {
			res.prompt("你是否要尝试侧翼进攻？")
			res.action("flank")
			res.action("no_flank")
		},
		flank() {
			push_undo()
			game.attack.flank_attempt = true
			goto_pre_weather_step()
		},
		no_flank() {
			push_undo()
			game.attack.flank_attempt = false
			goto_pre_weather_step()
		}
	}

	function end_battle_sequence() {
		let prev_state = game.state
		combat.end_battle_sequence(game, log)
		if (game.cc_jafar_pasha_post_battle) resolve_jafar_pasha_post_battle()

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
			has_window_cc_options("retreat_choice_cc_cp", CP, true)
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
		if (BATTLE_SUB_STATES.has(game.state)) {
			return
		}

		if (game.attack?.attacker) {
			game.active = game.attack.attacker
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

	function resolve_jafar_pasha_post_battle() {
		let roll = roll_die(6, game)
		if (roll <= 3) {
			add_cc_retained(AP, combat.CC_CP_JAFAR_PASHA, "remove")
			log(`贾法尔帕夏：掷骰${roll}，卡牌交予协约国，正面朝上保留一次使用。`)
		} else {
			move_card_to_discard(combat.CC_CP_JAFAR_PASHA, CP)
			log(`贾法尔帕夏：掷骰${roll}，弃牌。`)
		}
		delete game.cc_jafar_pasha_post_battle
	}

	register_combat_card_state("post_roll_cc_defender", {
		prompt: "防守方：掷骰后战斗卡",
		is_attacker: false,
		get_options: () => collect_window_cc_options(game, "post_roll_cc_defender", CP, false),
		done() {
			game.post_roll_cc_done = true
			game.active = game.attack?.attacker || AP
			end_battle_sequence()
		}
	})

	register_combat_card_state("post_battle_cc_cp", {
		prompt: "同盟国：战斗后战斗卡",
		is_attacker: false,
		get_options: () => collect_window_cc_options(game, "post_battle_cc_cp", CP, false),
		done: continue_after_post_battle_cc
	})

	register_combat_card_state("post_advance_cc_cp", {
		prompt: "同盟国：挺近后战斗卡",
		is_attacker: false,
		get_options: () => collect_window_cc_options(game, "post_advance_cc_cp", CP, false),
		done: goto_attack
	})

	register_combat_card_state("retreat_choice_cc_cp", {
		prompt: "同盟国：撤退选择阶段战斗卡",
		is_attacker: true,
		get_options: () => collect_window_cc_options(game, "retreat_choice_cc_cp", CP, true),
		done() {
			continue_after_retreat_choice_cc_window()
		}
	})

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
				(p) =>
					Engine.game_utils.get_piece_effective_faction(game, p) === active_faction() &&
					data.pieces[p].type !== "hq" &&
					!set_has(game.retreated, p)
			)
			let fort_strength = 0
			let defender_faction = active_faction()
			if (combat.has_undestroyed_fort(game, game.attack.space, defender_faction)) {
				fort_strength = data.spaces[game.attack.space].fort || 0
			}

			let options = combat.get_loss_options(game, defenders, needed, fort_strength, "defender")
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
			let was_reduced = Engine.game_utils.is_piece_reduced(game, p)
			combat.remember_variable_loss_other_unit_hit(game, "defender", p)
			ensure_attack_log_section("defender_loss_log_started", "防守方承伤：")
			reduce_piece(p)
			if (was_reduced) {
				log(`>> ${format_piece_log(p, true)} 被消灭`)
			} else {
				log(`>> ${format_piece_log(p, false)} 减员`)
			}
			game.attack.defender_losses_absorbed += lf
			mark_reserves_to_front_damage(p)
		},
		done() {
			clear_undo()
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

	states.eliminate_retreated_units = {
		prompt(res) {
			if (!game.attack) {
				res.prompt("无效的攻击状态.")
				res.action("done")
				return
			}
			let defender_faction = game.attack.defender || active_faction()
			let retreated_defenders = get_pieces_in_space(game, game.attack.space).filter(
				(p) =>
					Engine.game_utils.get_piece_effective_faction(game, p) === defender_faction &&
					set_has(game.retreated, p)
			)
			if (retreated_defenders.length === 0) {
				res.prompt(`战斗结算: ${space_name(game.attack.space)}（无此前退却单位）`)
				res.action("done")
				return
			}
			res.prompt("移除本行动轮先前已退却的防守单位")
			for (let p of retreated_defenders) res.piece(p)
		},
		piece(p) {
			push_undo()
			log(`${format_piece_log(p, true)} 因本行动轮先前已退却，在当前战斗造成损失后被摧毁。`)
			eliminate_piece(p)
			set_delete(game.retreated, p)
			mark_reserves_to_front_damage(p)
		},
		done() {
			game.state = "apply_defender_losses"
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
			let attackers = game.attack.pieces.filter((p) => !is_not_on_map(game, p) && data.pieces[p].type !== "hq")
			let options = combat.get_loss_options(game, attackers, needed, 0, "attacker")
			for (let p of options) res.piece(p)

			if (options.length === 0) {
				res.prompt(`战斗结算: ${space_name(game.attack.space)} (剩余伤害不足以导致减员)`)
				res.action("done")
			}
		},
		piece(p) {
			push_undo()
			let lf = get_piece_lf(game, p)
			let was_reduced = Engine.game_utils.is_piece_reduced(game, p)
			combat.remember_variable_loss_other_unit_hit(game, "attacker", p)
			ensure_attack_log_section("attacker_loss_log_started", "进攻方承伤：")
			reduce_piece(p)
			if (was_reduced) {
				log(`>> ${format_piece_log(p, true)} 被消灭`)
			} else {
				log(`>> ${format_piece_log(p, false)} 减员`)
			}
			game.attack.attacker_losses_absorbed += lf
			mark_reserves_to_front_damage(p)
		},
		done() {
			clear_undo()
			if (game.attack.second_fire === "attacker") {
				delete game.attack.second_fire
				combat.resolve_second_fire(game, log)
				if (game.attack.defender_losses > 0) {
					game.active = other_faction(game.attack.attacker)
					game.state = combat.get_defender_losses_state(game)
				} else {
					end_battle_sequence()
				}
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
			res.prompt(`LCU ${data.pieces[lcu].name} 被击溃：请从预备军格选择一个 SCU 进行替换`)
			for (let p of game.attack.replacement.options) res.piece(p)
		},
		piece(p) {
			push_undo()
			replace_lcu_with_scu(
				game.attack.replacement.unit,
				game.attack.replacement.space,
				p,
				game.attack.replacement.runtime_state
			)
			let return_state = game.attack.replacement.return_state
			delete game.attack.replacement
			resume_replacement_return_state(return_state)
		},
		done() {
			if (game.attack && game.attack.replacement) {
				let return_state = game.attack.replacement.return_state
				delete game.attack.replacement
				resume_replacement_return_state(return_state)
			} else {
				game.state = "apply_defender_losses"
			}
		}
	}

	function check_event_next_state() {
		if (game.event_next_state) {
			if (game.event_next_state === "event_russo_british_assault_ru_activation_setup") {
				Engine.event_states.begin_russo_british_russian_activation(game)
				delete game.event_next_state
				return true
			}
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
		clear_battle_runtime_state()

		refresh_attack_eligibility()
		if (game.eligible_attackers.length > 0) {
			game.state = "attack"
		} else {
			goto_end_operations()
		}
	}

	function finish_turkish_retreat() {
		combat.finish_turkish_retreat(game)
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

	function clear_save_tiflis_flags() {
		combat.clear_save_tiflis_state(game)
	}

	function get_catastrophic_attack_state() {
		return game.catastrophic_attack || null
	}

	function select_catastrophic_attack_stack(origin) {
		let cat = get_catastrophic_attack_state()
		if (!cat) return false
		let option = (cat.options || []).find((entry) => entry.origin === origin)
		if (!option) return false
		cat.origin = origin
		cat.participants = option.participants.slice()
		cat.retreating_pieces = option.participants.filter(
			(p) =>
				!is_not_on_map(game, p) &&
				!is_eliminated(game, p) &&
				combat.get_attack_piece_origin(game, p) === origin &&
				game.pieces[p] === origin
		)
		cat.retreat_space = null
		cat.advanced_pieces = []
		cat.advance_remaining = {}
		game.selected_piece = null
		game.active = AP
		game.state = "catastrophic_attack_retreat"
		log(`Catastrophic Attack: ${space_name(origin)} stack selected.`)
		return true
	}

	function get_catastrophic_attack_retreat_spaces() {
		let cat = get_catastrophic_attack_state()
		let retreating = cat?.retreating_pieces || []
		if (retreating.length === 0) return []
		let valid = []
		let first_piece = true
		for (let p of retreating) {
			let piece_valid = get_valid_retreat_spaces(game, p, [], 1, true)
			if (first_piece) {
				valid = piece_valid.slice()
				first_piece = false
			} else {
				valid = valid.filter((s) => set_has(piece_valid, s))
			}
		}
		if (valid.length === 0) return []
		return combat.apply_retreat_priorities(game, retreating[0], valid)
	}

	function complete_catastrophic_attack_retreat(destination = null) {
		let cat = get_catastrophic_attack_state()
		if (!cat) return
		let retreating = (cat.retreating_pieces || []).filter((p) => !is_not_on_map(game, p) && !is_eliminated(game, p))
		let from_space = cat.origin
		if (destination > 0 && retreating.length > 0) {
			ensure_attack_log_section("retreat_log_started", "撤退：")
			log(`>> ${retreating.map((p) => format_piece_log(p)).join(", ")} → s${destination}`)
			for (let p of retreating) {
				game.pieces[p] = destination
				set_add(game.retreated, p)
			}
			if (
				!Engine.map.is_controlled_by(game, destination, AP) &&
				retreating.some((p) => data.pieces[p].type === "regular")
			) {
				set_control(game, destination, AP)
			}
			if (Engine.check_persia_entry_vp_penalty) {
				Engine.check_persia_entry_vp_penalty(game, destination, retreating)
			}
			if (from_space > 0) {
				Engine.sync_neutral_vp_state(game, from_space)
				Engine.sync_jihad_city_state(game, from_space)
				Engine.sync_region_control(game, from_space)
			}
			Engine.sync_region_control(game, destination)
			Engine.sync_neutral_vp_state(game, destination)
			Engine.sync_jihad_city_state(game, destination)
			cat.retreat_space = destination
		} else if (retreating.length > 0) {
			ensure_attack_log_section("retreat_log_started", "撤退：")
			for (let p of retreating) {
				log(`>> ${format_piece_log(p, true)} 无法撤退并被永久消灭`)
				eliminate_piece(p, true)
			}
			if (from_space > 0) {
				Engine.sync_neutral_vp_state(game, from_space)
				Engine.sync_jihad_city_state(game, from_space)
				Engine.sync_region_control(game, from_space)
			}
			cat.retreat_space = null
		}
		cat.retreating_pieces = []
		if (enter_post_battle_cc_window({ kind: "catastrophic_attack" })) return
		enter_catastrophic_attack_advance_state()
	}

	function enter_catastrophic_attack_advance_state() {
		let cat = get_catastrophic_attack_state()
		if (!cat) {
			goto_attack()
			return
		}
		let defenders = get_pieces_in_space(game, cat.defender_space).filter(
			(p) =>
				Engine.game_utils.get_piece_effective_faction(game, p) === CP &&
				!is_not_on_map(game, p) &&
				!is_eliminated(game, p) &&
				!(Array.isArray(game.retreated) && set_has(game.retreated, p))
		)
		cat.advance_candidates = defenders
		cat.advance_remaining = {}
		for (let p of defenders) {
			cat.advance_remaining[p] = Engine.game_utils.get_piece_mf(p) > 0 ? 3 : 1
		}
		cat.advanced_pieces = []
		game.selected_piece = null
		game.active = CP
		game.state = "catastrophic_attack_advance"
	}

	function get_catastrophic_attack_advance_spaces(p, options = {}) {
		let cat = get_catastrophic_attack_state()
		if (!cat || !cat.advance_remaining) return []
		let from_space = options.from_space ?? game.pieces[p]
		let remaining = options.remaining_steps ?? cat.advance_remaining[p] ?? 0
		let exclude_space = options.exclude_space
		if (!(remaining > 0) || !(from_space > 0)) return []
		let connected = Engine.map.get_piece_connected_spaces_for_rule(game, from_space, p)
		let candidates =
			from_space === cat.defender_space ? connected.filter((s) => s === cat.origin) : connected.slice()
		let valid = []
		for (let s of candidates) {
			if (exclude_space !== undefined && s === exclude_space) continue
			if (!can_enter_region(game, p, s)) continue
			let is_retreat_transit =
				cat.retreat_space && s === cat.retreat_space && Engine.map.contains_enemy_pieces(game, s, CP)
			if (!is_retreat_transit && Engine.map.contains_enemy_pieces(game, s, CP)) continue
			if (!is_retreat_transit && !can_stack_end_in_space(game, s, [p])) continue
			if (is_retreat_transit) {
				let remaining_after_move = remaining - 1
				if (remaining_after_move <= 0) continue
				let exits = get_catastrophic_attack_advance_spaces(p, {
					from_space: s,
					remaining_steps: remaining_after_move,
					exclude_space: from_space
				})
				if (exits.length === 0) continue
			}
			valid.push(s)
		}
		return [...new Set(valid)]
	}

	function move_catastrophic_attack_piece(p, to_space) {
		let cat = get_catastrophic_attack_state()
		if (!cat) return false
		let from_space = game.pieces[p]
		let is_retreat_transit =
			cat.retreat_space && to_space === cat.retreat_space && Engine.map.contains_enemy_pieces(game, to_space, CP)
		if (is_retreat_transit) {
			game.pieces[p] = to_space
		} else if (!advance_piece_into_space(p, from_space, to_space)) {
			return false
		}
		cat.advance_remaining[p] = Math.max(0, (cat.advance_remaining[p] || 0) - 1)
		set_add(cat.advanced_pieces, p)
		return true
	}

	function finish_catastrophic_attack_advance() {
		game.selected_piece = null
		let cat = get_catastrophic_attack_state()
		if (
			game.active === CP &&
			cat &&
			(cat.advanced_pieces || []).length > 0 &&
			has_window_cc_options("post_advance_cc_cp", CP, false)
		) {
			game.state = "post_advance_cc_cp"
			return
		}
		goto_attack()
	}

	function create_advance_resume(advance_space = game.attack?.space) {
		return {
			kind: "advance",
			advance_space,
			save_tiflis_failed: !!game.save_tiflis_failed
		}
	}

	function enter_finish_attack_window() {
		return enter_post_battle_cc_window({ kind: "finish_attack" })
	}

	function continue_after_post_retreat_cancel() {
		if (!enter_finish_attack_window()) {
			goto_attack()
		}
	}

	function enter_turkish_retreat_state() {
		combat.enter_turkish_retreat_state(game)
		let snapshot = sync_turkish_retreat_state()
		if (!snapshot.pending) {
			finish_turkish_retreat()
		}
	}

	function ensure_retreat_steps(pieces, distance = game.retreat_distance || 1) {
		if (!game.retreat_steps_left) {
			game.retreat_steps_left = {}
			for (let p of pieces) game.retreat_steps_left[p] = distance
		}
	}

	function get_turkish_retreat_pieces() {
		return [...(game.turkish_retreat_mandatory || []), ...(game.turkish_retreat_optional || [])]
	}

	function derive_turkish_retreat_state() {
		if (!game.turkish_retreat_pending) {
			return {
				pending: false,
				retreat_space: game.turkish_retreat_space ?? game.attack?.space,
				mandatory: [],
				optional: [],
				selected_piece: null
			}
		}
		let retreat_space = game.turkish_retreat_space ?? game.attack?.space
		let is_valid_turkish_retreat_piece = (p) =>
			retreat_space !== undefined && !is_not_on_map(game, p) && game.pieces[p] === retreat_space
		let mandatory = (game.turkish_retreat_mandatory || []).filter(is_valid_turkish_retreat_piece)
		let optional = (game.turkish_retreat_optional || []).filter(is_valid_turkish_retreat_piece)
		let can_control = (p) => set_has(mandatory, p) || set_has(optional, p)
		let selected_piece =
			game.selected_piece !== null && game.selected_piece !== undefined && can_control(game.selected_piece)
				? game.selected_piece
				: null
		if (mandatory.length === 0 && optional.length === 0 && game.battle_result) {
			let current_cp_defenders = get_pieces_in_space(game, retreat_space).filter(
				(p) =>
					Engine.game_utils.get_piece_effective_faction(game, p) === CP &&
					!is_not_on_map(game, p) &&
					!is_eliminated(game, p)
			)
			if (game.battle_result.retreat_needed && game.battle_result.retreating_faction === CP) {
				mandatory = current_cp_defenders
				optional = []
			} else {
				mandatory = current_cp_defenders.filter(
					(p) =>
						(data.pieces[p].nation === "tu" || data.pieces[p].nation === "tua") &&
						data.pieces[p].piece_class === "SCU"
				)
				optional = current_cp_defenders.filter((p) => !set_has(mandatory, p))
			}
		}
		return {
			pending: mandatory.length > 0 || optional.length > 0,
			retreat_space,
			mandatory,
			optional,
			selected_piece
		}
	}

	function sync_turkish_retreat_state() {
		let snapshot = derive_turkish_retreat_state()
		game.turkish_retreat_mandatory = snapshot.mandatory
		game.turkish_retreat_optional = snapshot.optional
		game.selected_piece = snapshot.selected_piece
		if (!snapshot.pending) {
			delete game.turkish_retreat_pending
		}
		return snapshot
	}

	function resume_replacement_return_state(return_state) {
		game.state = return_state || "apply_defender_losses"
		if (game.state === "post_retreat_cancel") {
			continue_after_post_retreat_cancel()
		}
	}

	function clear_retreat_runtime_state() {
		delete game.retreat_pieces
		delete game.retreat_space
		delete game.retreat_distance
		delete game.retreat_from
		delete game.retreat_first_spaces
		game.retreat_steps_left = null
	}

	function clear_battle_runtime_state() {
		delete game.reserves_to_front_effected_pieces
		clear_retreat_runtime_state()
		delete game.jafar_pasha_retreat
		delete game.jafar_pasha_advance_after_cancel
		delete game.advance_pieces
		delete game.advance_space
		delete game.advance_count
		delete game.advance_limit
		delete game.advance_follow_mode
		delete game.advance_follow_pieces
		delete game.advance_yildirim_used
		delete game.advance_trench_processed
		delete game.turkish_retreat_prev_active
		delete game.turkish_retreat_chosen_space
		delete game.post_battle_cc_resume
		delete game.jerusalem_withdrawal
		delete game.selected_piece
		delete game.battle_result
		delete game.battle_resolution_applied
		combat.clear_catastrophic_attack_state(game)
	}

	function enter_advance_state(resume) {
		if (!combat.begin_advance(game, game.battle_result, resume.advance_space)) {
			clear_save_tiflis_flags()
			goto_attack()
			return
		}
		if (resume.save_tiflis_failed && game.battle_result?.no_advance) {
			log("Russian units could not retreat towards Tiflis; full-strength TU/TUA units may advance.")
		}
		clear_save_tiflis_flags()
	}

	function continue_after_jafar_pasha_cancelled_battle() {
		let resume = game.jafar_pasha_advance_after_cancel
		delete game.jafar_pasha_advance_after_cancel
		if (!resume || !(resume.advance_space > 0)) {
			goto_attack()
			return
		}
		if (!combat.begin_advance(game, game.battle_result, resume.advance_space)) {
			goto_attack()
		}
	}

	function continue_after_defender_retreat(resume, allow_post_battle_cc) {
		if (!game.battle_result?.no_advance || resume.save_tiflis_failed) {
			if (allow_post_battle_cc && enter_post_battle_cc_window(resume)) {
				clear_retreat_runtime_state()
				return
			}
			enter_advance_state(resume)
			clear_retreat_runtime_state()
			return
		}
		clear_save_tiflis_flags()
		goto_attack()
	}

	function continue_after_post_battle_cc() {
		let resume = game.post_battle_cc_resume
		delete game.post_battle_cc_resume
		game.active = game.attack?.attacker || AP

		switch (resume?.kind) {
			case "resolve_battle":
				game.post_battle_cc_done = true
				end_battle_sequence()
				return
			case "advance":
				continue_after_defender_retreat(resume, false)
				return
			case "catastrophic_attack":
				enter_catastrophic_attack_advance_state()
				return
		}

		goto_attack()
	}

	function finish_retreat_resolution() {
		if (game.jerusalem_withdrawal) {
			delete game.jerusalem_withdrawal
			game.active = game.attack?.attacker || AP
			enter_jerusalem_withdrawal_advance()
			clear_retreat_runtime_state()
			return
		}
		if (game.active === game.attack?.defender) {
			game.active = game.attack?.attacker || AP
			continue_after_defender_retreat(create_advance_resume(), true)
		} else if (game.turkish_retreat_pending) {
			game.turkish_retreat_attacker_retreated = true
			enter_turkish_retreat_state()
			clear_retreat_runtime_state()
		} else {
			goto_attack()
		}
	}

	function maybe_finish_retreat() {
		if ((game.retreat_pieces?.length || 0) === 0 && game.selected_piece === null) {
			finish_retreat_resolution()
		}
	}

	function maybe_finish_turkish_retreat() {
		if (
			(game.turkish_retreat_mandatory?.length || 0) === 0 &&
			(game.turkish_retreat_optional?.length || 0) === 0 &&
			game.selected_piece === null
		) {
			finish_turkish_retreat()
		}
	}

	states.save_tiflis_retreat = {
		prompt(res) {
			if (game.selected_piece === null || game.selected_piece === undefined) {
				res.prompt("Save Tiflis：选择向第比利斯撤退的单位")
				for (let p of game.save_tiflis_pieces || []) {
					res.piece(p)
				}
				if ((game.save_tiflis_pieces || []).length === 0) {
					res.action("done")
				}
			} else {
				let piece = game.selected_piece
				res.prompt(`正在撤退 ${data.pieces[piece].name} 到第比利斯`)

				// Calculate spaces towards Tiflis (ID 12)
				const TIFLIS = 12
				let current_dist = Engine.map.get_distance(game.pieces[piece], TIFLIS)
				let valid = []
				let legal_retreats = combat.get_valid_retreat_spaces(game, piece, [], 1, false)
				for (let s of legal_retreats) {
					if (Engine.map.get_distance(s, TIFLIS) < current_dist) {
						valid.push(s)
					}
				}

				let piece_space = game.pieces[piece]
				let pieces_here = get_pieces_in_space(game, piece_space)
				let with_yudenitch = pieces_here.some((p2) => data.pieces[p2].name === "RU Yudenitch HQ")
				let in_fort =
					combat.has_undestroyed_fort(game, piece_space, AP) ||
					combat.has_undestroyed_fort(game, piece_space, CP)
				let can_decline = with_yudenitch || in_fort || valid.length === 0

				if (valid.length === 0) {
					res.prompt(`无法让 ${data.pieces[piece].name} 向第比利斯方向撤退。`)
					res.action("decline_retreat")
				} else {
					for (let s of valid) res.space(s)
					if (can_decline) res.action("decline_retreat")
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
				let from = game.pieces[p]
				log(`${data.pieces[p].name} retreats to ${data.spaces[s].name} (towards Tiflis).`)
				game.pieces[p] = s
				if (from > 0) Engine.sync_region_control(game, from)
				Engine.sync_region_control(game, s)
				set_delete(game.save_tiflis_pieces, p)
				game.selected_piece = null
			}
		},
		cannot_retreat() {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				log(`${data.pieces[p].name} cannot retreat towards Tiflis and remains in place.`)
				game.save_tiflis_failed = true
				set_delete(game.save_tiflis_pieces, p)
				game.selected_piece = null
			}
		},
		decline_retreat() {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				log(`${data.pieces[p].name} declines to retreat towards Tiflis.`)
				set_delete(game.save_tiflis_pieces, p)
				game.selected_piece = null
			}
		},
		done() {
			delete game.save_tiflis_pieces
			delete game.selected_piece

			// Restore active faction to attacker (CP)
			game.active = game.attack.attacker

			// Resume end_battle_sequence to handle losses and normal retreats
			combat.end_battle_sequence(game, log)
		}
	}

	states.retreat_cancel = {
		prompt(res) {
			res.prompt("防守方可以额外承受 1 级损失以取消撤退")
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
			log(`防守方取消撤退 ${format_piece_log(p)} 额外承受1级损失`)

			game.retreat_pieces = []
			game.selected_piece = null
			game.retreat_space = null
			game.retreat_steps_left = null
			game.battle_result.retreat_needed = false

			game.state = "post_retreat_cancel"
			reduce_piece(p)

			// If reduce_piece didn't trigger choose_lcu_replacement, we can proceed immediately
			if (game.state === "post_retreat_cancel") {
				continue_after_post_retreat_cancel()
			}
		},
		proceed_retreat() {
			game.state = "retreat"
		}
	}

	states.post_retreat_cancel = {
		prompt(res) {
			res.prompt("撤退取消已完成")
			res.action("done")
		},
		done() {
			continue_after_post_retreat_cancel()
		}
	}

	states.catastrophic_attack_choose_stack = {
		prompt(res) {
			let cat = get_catastrophic_attack_state()
			if (!cat || (cat.options || []).length === 0) {
				res.prompt("灾难性攻击：没有包含英印澳新战斗单位的进攻堆叠")
				res.action("done")
				return
			}

			res.prompt("灾难性攻击：选择一个包含英印澳新战斗单位的进攻堆叠撤退 1 格")
			res.where(cat.defender_space)
			res.who(game.attack?.pieces || [])
			for (let option of cat.options) {
				res.space(option.origin)
			}
		},
		space(s) {
			push_undo()
			select_catastrophic_attack_stack(s)
		},
		done() {
			goto_attack()
		}
	}

	states.catastrophic_attack_retreat = {
		prompt(res) {
			let cat = get_catastrophic_attack_state()
			if (!cat) {
				res.prompt("灾难性攻击撤退已结束")
				res.action("done")
				return
			}

			let retreating = cat.retreating_pieces || []
			res.who(retreating)
			if (cat.origin > 0) {
				res.where(cat.origin)
			}

			if (retreating.length === 0) {
				res.prompt("灾难性攻击撤退已完成")
				res.action("done")
				return
			}

			let valid = get_catastrophic_attack_retreat_spaces()
			res.prompt(`灾难性攻击：将 ${space_name(cat.origin)} 的整堆部队撤退 1 格`)
			if (valid.length === 0) {
				res.action("eliminate_stack")
				return
			}

			for (let s of valid) res.space(s)
		},
		space(s) {
			push_undo()
			complete_catastrophic_attack_retreat(s)
		},
		eliminate_stack() {
			push_undo()
			complete_catastrophic_attack_retreat(null)
		},
		done() {
			enter_catastrophic_attack_advance_state()
		}
	}

	states.catastrophic_attack_advance = {
		prompt(res) {
			let cat = get_catastrophic_attack_state()
			if (!cat) {
				res.prompt("灾难性攻击挺进已结束")
				res.action("done")
				return
			}

			let candidates = (cat.advance_candidates || []).filter(
				(p) => !is_not_on_map(game, p) && !is_eliminated(game, p)
			)
			let movable = candidates.filter((p) => get_catastrophic_attack_advance_spaces(p).length > 0)
			res.where(cat.defender_space)
			res.who(candidates)

			if (game.selected_piece === null || game.selected_piece === undefined) {
				res.prompt("灾难性攻击：选择同盟国防守部队进行最多 3 格挺进")
				res.action("end_advance")
				for (let p of movable) res.piece(p)
				return
			}

			let piece = game.selected_piece
			let valid = get_catastrophic_attack_advance_spaces(piece)
			if (!candidates.includes(piece) || valid.length === 0) {
				game.selected_piece = null
				res.prompt("灾难性攻击：选择同盟国防守部队进行最多 3 格挺进")
				res.action("end_advance")
				for (let p of movable) res.piece(p)
				return
			}

			res.prompt(`灾难性攻击：选择 ${data.pieces[piece].name} 的挺进地块`)
			res.action("end_advance")
			for (let s of valid) res.space(s)
			res.piece(piece)
		},
		piece(p) {
			let cat = get_catastrophic_attack_state()
			if (!cat) return
			if (game.selected_piece === p) {
				game.selected_piece = null
				return
			}
			if (set_has(cat.advance_candidates || [], p) && get_catastrophic_attack_advance_spaces(p).length > 0) {
				game.selected_piece = p
			}
		},
		space(s) {
			let p = game.selected_piece
			if (p === null || p === undefined) return
			let valid = get_catastrophic_attack_advance_spaces(p)
			if (!set_has(valid, s)) return
			push_undo()
			ensure_attack_log_section("advance_log_started", "挺近：")
			log(`>> ${format_piece_log(p)} → s${s}`)
			if (!move_catastrophic_attack_piece(p, s)) {
				game.selected_piece = null
				return
			}
			if (get_catastrophic_attack_advance_spaces(p).length === 0) {
				game.selected_piece = null
			}
		},
		done() {
			finish_catastrophic_attack_advance()
		},
		end_advance() {
			finish_catastrophic_attack_advance()
		}
	}

	states.retreat = {
		prompt(res) {
			if (!game.retreat_pieces) {
				game.retreat_pieces = []
			}
			res.who(game.retreat_pieces)
			res.where(game.retreat_space)
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
				res.prompt("撤退已完成")
				res.action("done")
				return
			}

			ensure_retreat_steps(game.retreat_pieces)

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

				let remaining_steps = game.retreat_steps_left[piece] || 1
				let valid = get_valid_retreat_spaces(
					game,
					piece,
					game.attack ? [game.attack.space] : [],
					remaining_steps,
					false // obey stacking limit; overstack retreat destination is illegal
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
		done() {
			clear_undo()
			finish_retreat_resolution()
		},
		piece(p) {
			ensure_retreat_steps(game.retreat_pieces)
			if (game.selected_piece === p) {
				game.selected_piece = null
			} else if (set_has(game.retreat_pieces, p)) {
				game.selected_piece = p
			}
		},
		space(s) {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				let from = game.pieces[p]
				ensure_attack_log_section("retreat_log_started", "撤退：")
				log(`>> ${format_piece_log(p)} → s${s}`)
				game.pieces[p] = s
				game.retreat_from = s
				game.retreat_space = s
				let remaining_before_move = game.retreat_steps_left[p] || 1
				if (remaining_before_move === (game.retreat_distance || 1)) {
					if (!game.retreat_first_spaces) game.retreat_first_spaces = []
					set_add(game.retreat_first_spaces, s)
				}
				let remaining = remaining_before_move - 1
				let ends_retreat_here =
					remaining <= 0 || Engine.map.is_region(game, s) || Engine.map.is_island_base(game, s)
				if (ends_retreat_here) {
					if (!Engine.map.is_controlled_by(game, s, game.active)) {
						if (data.pieces[p].type === "regular") {
							set_control(game, s, game.active)
						}
					}
					if (Engine.check_persia_entry_vp_penalty) {
						Engine.check_persia_entry_vp_penalty(game, s, [p])
					}
					if (from > 0) {
						Engine.sync_neutral_vp_state(game, from)
						Engine.sync_jihad_city_state(game, from)
						Engine.sync_region_control(game, from)
					}
					Engine.sync_region_control(game, s)
					Engine.sync_neutral_vp_state(game, s)
					Engine.sync_jihad_city_state(game, s)
					set_delete(game.retreat_pieces, p)
					delete game.retreat_steps_left[p]
					set_add(game.retreated, p)
				} else {
					game.retreat_steps_left[p] = remaining
				}
				game.selected_piece = null
				maybe_finish_retreat()
			}
		},
		eliminate_retreating() {
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				ensure_attack_log_section("retreat_log_started", "撤退：")
				log(`>> ${format_piece_log(p, true)} 无法撤退并被消灭`)
				eliminate_piece(p, is_lcu(p))
				set_delete(game.retreat_pieces, p)
				if (game.retreat_steps_left) delete game.retreat_steps_left[p]
				game.selected_piece = null
				maybe_finish_retreat()
			}
		}
	}

	states.turkish_retreat = {
		prompt(res) {
			let snapshot = derive_turkish_retreat_state()
			if (!snapshot.pending) {
				res.prompt("土耳其撤退已完成")
				res.action("done")
				return
			}

			ensure_retreat_steps(get_turkish_retreat_pieces(), 1)

			if (snapshot.selected_piece !== null && snapshot.selected_piece !== undefined) {
				let piece = snapshot.selected_piece
				res.prompt(`正在撤退 ${data.pieces[piece].name}`)

				let valid = get_valid_retreat_spaces(
					game,
					piece,
					snapshot.retreat_space !== undefined ? [snapshot.retreat_space] : [],
					game.retreat_steps_left[piece] || 1,
					false // obey stacking limit; overstack retreat destination is illegal
				)

				// Rule 6.1.7: Must retreat to a single adjacent space that is not enemy-occupied and does not contain a fortress.
				valid = valid.filter((s) => !combat.has_undestroyed_fort(game, s, other_faction(active_faction())))

				valid = combat.apply_retreat_priorities(game, piece, valid)

				if (valid.length === 0) {
					res.action("eliminate_retreating")
				} else {
					for (let s of valid) res.space(s)
				}

				res.piece(piece)
				return
			}

			if (snapshot.mandatory.length > 0) {
				res.prompt("土耳其撤退：必须选择部队进行撤退")
				for (let p of snapshot.mandatory) res.piece(p)
				// PUG Rule 617: Turkish SCUs MUST retreat. If only mandatory units remain, skip is not allowed.
				return
			}

			if (snapshot.optional.length > 0) {
				res.prompt("土耳其撤退：可以选择其他部队进行撤退")
				for (let p of snapshot.optional) res.piece(p)
				res.action("skip_turkish_retreat")
				return
			}

			res.prompt("土耳其撤退已完成")
			res.action("done")
		},
		done() {
			finish_turkish_retreat()
		},
		piece(p) {
			sync_turkish_retreat_state()
			ensure_retreat_steps(get_turkish_retreat_pieces(), 1)
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
			sync_turkish_retreat_state()
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				let from = game.pieces[p]
				ensure_attack_log_section("retreat_log_started", "撤退：")
				log(`>> ${format_piece_log(p)} → s${s}`)
				game.pieces[p] = s

				// Retreat control check: capture neutral spaces
				if (!Engine.map.is_controlled_by(game, s, game.active)) {
					if (data.pieces[p].type === "regular") {
						set_control(game, s, game.active)
					}
				}
				if (Engine.check_persia_entry_vp_penalty) {
					Engine.check_persia_entry_vp_penalty(game, s, [p])
				}
				if (from > 0) {
					Engine.sync_neutral_vp_state(game, from)
					Engine.sync_jihad_city_state(game, from)
					Engine.sync_region_control(game, from)
				}
				Engine.sync_region_control(game, s)
				Engine.sync_neutral_vp_state(game, s)
				Engine.sync_jihad_city_state(game, s)

				if (game.turkish_retreat_mandatory && set_has(game.turkish_retreat_mandatory, p)) {
					set_delete(game.turkish_retreat_mandatory, p)
				}
				if (game.turkish_retreat_optional && set_has(game.turkish_retreat_optional, p)) {
					set_delete(game.turkish_retreat_optional, p)
				}
				delete game.retreat_steps_left[p]
				set_add(game.retreated, p)
				game.selected_piece = null
				maybe_finish_turkish_retreat()
			}
		},
		eliminate_retreating() {
			sync_turkish_retreat_state()
			let p = game.selected_piece
			if (p !== null && p !== undefined) {
				ensure_attack_log_section("retreat_log_started", "撤退：")
				log(`>> ${format_piece_log(p, true)} 无法撤退并被消灭`)
				eliminate_piece(p, is_lcu(p))
				if (game.turkish_retreat_mandatory && set_has(game.turkish_retreat_mandatory, p)) {
					set_delete(game.turkish_retreat_mandatory, p)
				}
				if (game.turkish_retreat_optional && set_has(game.turkish_retreat_optional, p)) {
					set_delete(game.turkish_retreat_optional, p)
				}
				delete game.retreat_steps_left[p]
				game.selected_piece = null
				maybe_finish_turkish_retreat()
			}
		},
		skip_turkish_retreat() {
			sync_turkish_retreat_state()
			game.turkish_retreat_optional = []
			finish_turkish_retreat()
		}
	}

	function get_follow_advance_spaces(p) {
		let valid = []
		for (let s of game.retreat_first_spaces || []) {
			if (get_valid_advance_spaces(game, p, s).length > 0) valid.push(s)
		}
		return valid
	}

	function advance_piece_into_space(p, from_space, to_space) {
		game.pieces[p] = to_space
		if (active_faction() === CP && Engine.map.is_beachhead_space(game, to_space)) {
			let has_ap_units = get_pieces_in_space(game, to_space).some(
				(uid) => Engine.game_utils.get_piece_effective_faction(game, uid) === AP
			)
			if (!has_ap_units) {
				Engine.map.clear_beachhead(game, to_space)
				if (Engine.map.is_non_balkan_beachhead(to_space)) {
					update_jihad_level(game, 2)
					let bonus = count_beachhead_captured_materiel_bonus()
					if (bonus > 0) {
						game.tu_rp_bonus = (game.tu_rp_bonus || 0) + bonus
						log(
							`空滩头在推进中被同盟国摧毁：${space_name(to_space)}，圣战等级 +2，土耳其奖励RP +${bonus}。`
						)
					} else {
						log(`空滩头在推进中被同盟国摧毁：${space_name(to_space)}，圣战等级 +2。`)
					}
				} else {
					log(`空滩头在推进中被同盟国摧毁：${space_name(to_space)}。`)
				}
				game.pieces[p] = from_space
				return false
			}
		}
		if (
			has_trench(game, to_space) > 0 &&
			!Engine.map.is_controlled_by(game, to_space, active_faction()) &&
			!game.advance_trench_processed
		) {
			remove_trench(game, to_space)
			log(`Trench in ${space_name(to_space)} removed by enemy entry.`)
			game.advance_trench_processed = true
		}
		resolve_russian_winter_offensive_advance(game, p, to_space, log)
		let enemy_holds_contested_region =
			!!data.spaces[to_space]?.region && Engine.map.contains_enemy_pieces(game, to_space, active_faction())
		let will_control_to_space =
			!Engine.map.is_controlled_by(game, to_space, active_faction()) &&
			!combat.has_undestroyed_fort(game, to_space, other_faction(active_faction())) &&
			data.pieces[p].type === "regular" &&
			!enemy_holds_contested_region
		// Sync VP and jihad BEFORE set_control so the previous controller is still the old one
		Engine.sync_neutral_vp_state(game, to_space, undefined, { silent: will_control_to_space })
		Engine.sync_jihad_city_state(game, to_space)
		if (!Engine.map.is_controlled_by(game, to_space, active_faction())) {
			if (
				!enemy_holds_contested_region &&
				active_faction() === CP &&
				Engine.map.is_russian_vp_space(game, to_space)
			) {
				game.captured_russian_vp_in_advance = true
			}
			if (!combat.has_undestroyed_fort(game, to_space, other_faction(active_faction()))) {
				if (data.pieces[p].type === "regular" && !enemy_holds_contested_region) {
					set_control(game, to_space, active_faction())
				}
			}
		}
		if (Engine.check_persia_entry_vp_penalty) {
			Engine.check_persia_entry_vp_penalty(game, to_space, [p])
		}
		if (from_space > 0) {
			Engine.sync_neutral_vp_state(game, from_space)
			Engine.sync_jihad_city_state(game, from_space)
			Engine.sync_region_control(game, from_space)
		}
		Engine.sync_region_control(game, to_space)
		if (Engine.neutral.is_greece_neutral(game) && Engine.neutral.is_athens_space(to_space)) {
			Engine.neutral.trigger_greece_entry(game, to_space, active_faction(), "战斗推进进入雅典", (msg) => log(msg))
		}
		check_immediate_jihad_rebellion_on_entry(from_space, to_space, [p])
		return true
	}

	states.advance = {
		prompt(res) {
			let is_blocked_by_reserves_to_front = (p) =>
				game.attack &&
				game.attack.attacker === CP &&
				game.reserves_to_front_effected_pieces &&
				set_has(game.reserves_to_front_effected_pieces, p)

			if (game.advance_follow_mode) {
				let selectable = (game.advance_follow_pieces || []).filter(
					(p) => get_follow_advance_spaces(p).length > 0
				)
				res.prompt("选择继续推进的单位")
				res.action("end_advance")
				if (selectable.length === 0) {
					res.who(game.advance_follow_pieces || [])
					return
				}
				if (game.selected_piece === null || game.selected_piece === undefined) {
					for (let p of selectable) res.piece(p)
				} else if (set_has(selectable, game.selected_piece)) {
					let p = game.selected_piece
					res.prompt(`选择 ${data.pieces[p].name} 的继续推进地块`)
					for (let s of get_follow_advance_spaces(p)) res.space(s)
					res.piece(p)
				} else {
					game.selected_piece = null
					for (let p of selectable) res.piece(p)
				}
				res.who(game.advance_follow_pieces || [])
				return
			}

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
						if (is_blocked_by_reserves_to_front(p)) {
							continue
						}
						let valid = get_valid_advance_spaces(game, p, game.advance_space)
						if (valid.length > 0) {
							res.piece(p)
						}
					}
				} else {
					for (let p of game.advance_pieces) {
						if (is_blocked_by_reserves_to_front(p)) {
							continue
						}
						let is_hq = data.pieces[p].type === "hq"
						let is_heavy_arty = Engine.game_utils.is_heavy_arty(p)
						let is_yildirim = data.pieces[p].symbol === "Y" && data.pieces[p].nation === "ge"
						if (is_hq || is_heavy_arty || (is_yildirim && !game.advance_yildirim_used)) {
							let valid = get_valid_advance_spaces(game, p, game.advance_space)
							if (valid.length > 0) {
								res.piece(p)
							}
						}
					}
				}
			}
			res.get_action("piece")
			res.where(game.advance_space)
			res.who(game.advance_pieces)
		},
		piece(p) {
			if (game.advance_follow_mode) {
				if (game.selected_piece === p) game.selected_piece = null
				else if (set_has(game.advance_follow_pieces || [], p)) game.selected_piece = p
				return
			}

			let from_space = game.pieces[p]
			ensure_attack_log_section("advance_log_started", "挺近：")
			log(`>> ${format_piece_log(p)} → s${game.advance_space}`)
			if (!advance_piece_into_space(p, from_space, game.advance_space)) {
				set_delete(game.advance_pieces, p)
				this.end_advance()
				return
			}

			let is_hq = data.pieces[p].type === "hq"
			let is_heavy_arty = Engine.game_utils.is_heavy_arty(p)
			let is_yildirim = data.pieces[p].symbol === "Y" && data.pieces[p].nation === "ge"
			let yildirim_free = false
			if (is_yildirim && !game.advance_yildirim_used) {
				game.advance_yildirim_used = true
				yildirim_free = true
			}

			if (!is_hq && !is_heavy_arty && !yildirim_free) {
				game.advance_count = (game.advance_count || 0) + 1
			}

			let can_follow = false
			if ((game.retreat_distance || 1) > 1 && !is_advance_stop_terrain(game, game.advance_space)) {
				can_follow = get_follow_advance_spaces(p).length > 0
			}

			if (is_advance_stop_terrain(game, game.advance_space)) {
				if (!game.advanced_stopped) game.advanced_stopped = []
				set_add(game.advanced_stopped, p)
			}

			if (can_follow) {
				if (!game.advance_follow_pieces) game.advance_follow_pieces = []
				set_add(game.advance_follow_pieces, p)
			}

			bulls_eye_record_advanced_piece(game, p)
			set_delete(game.advance_pieces, p)

			let count_limited_left = game.advance_pieces.some((uid) => {
				let is_hq = data.pieces[uid].type === "hq"
				let is_heavy_arty = Engine.game_utils.is_heavy_arty(uid)
				let is_yildirim = data.pieces[uid].symbol === "Y" && data.pieces[uid].nation === "ge"
				if (is_hq || is_heavy_arty) return false
				return !(is_yildirim && !game.advance_yildirim_used)
			})
			let limit_reached = (game.advance_count || 0) >= (game.advance_limit || 3)

			if (game.advance_pieces.length === 0 || (limit_reached && !count_limited_left)) {
				let selectable_follow = (game.advance_follow_pieces || []).filter(
					(uid) => get_follow_advance_spaces(uid).length > 0
				)
				if ((game.retreat_distance || 1) > 1 && selectable_follow.length > 0) {
					game.advance_follow_mode = true
					game.selected_piece = null
				}
			} else if (limit_reached) {
				let allowed = game.advance_pieces.filter((uid) => {
					if (data.pieces[uid].type === "hq") return true
					if (Engine.game_utils.is_heavy_arty(uid)) return true
					return (
						!game.advance_yildirim_used &&
						data.pieces[uid].symbol === "Y" &&
						data.pieces[uid].nation === "ge"
					)
				})
				if (allowed.length === 0) {
					let selectable_follow = (game.advance_follow_pieces || []).filter(
						(uid) => get_follow_advance_spaces(uid).length > 0
					)
					if ((game.retreat_distance || 1) > 1 && selectable_follow.length > 0) {
						game.advance_follow_mode = true
						game.selected_piece = null
					}
				}
			}
		},
		space(s) {
			if (!game.advance_follow_mode) return
			let p = game.selected_piece
			if (p === null || p === undefined) return
			let valid = get_follow_advance_spaces(p)
			if (!set_has(valid, s)) return
			ensure_attack_log_section("advance_log_started", "挺近：")
			log(`>> ${format_piece_log(p)} → s${s}`)
			let from_space = game.pieces[p]
			if (!advance_piece_into_space(p, from_space, s)) {
				set_delete(game.advance_follow_pieces, p)
				game.selected_piece = null
			} else {
				set_delete(game.advance_follow_pieces, p)
				game.selected_piece = null
			}
			let selectable = (game.advance_follow_pieces || []).filter(
				(uid) => get_follow_advance_spaces(uid).length > 0
			)
			if (selectable.length === 0) {
				game.selected_piece = null
			}
		},
		end_advance() {
			delete game.advance_follow_mode
			delete game.advance_follow_pieces
			delete game.retreat_first_spaces
			delete game.selected_piece
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
