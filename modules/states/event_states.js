"use strict"

module.exports = function (Engine) {
	const { data } = Engine
	const { AP, CP, RESERVE } = Engine.constants
	const { set_delete } = Engine.utils
	const BULGARIAN_ENTRY_AH_DIVISIONS = Engine.collapse.get_bulgarian_entry_ah_divisions()
	const { find_space, get_capacity, get_piece_badge } = Engine.game_utils

	const states = {}

	// === Constants for Space IDs ===
	const FAO = find_space("Fao")
	const BASRA = find_space("Basra")
	const TO_FAO = find_space("to Fao")
	const TO_ABADAN = find_space("to Abadan")
	const SHAIBA = find_space("Shaiba")
	const SALONIKA = find_space("Salonika")
	const LEMNOS = find_space("Lemnos")
	const KUM_KALE = find_space("Kum Kale")
	const SEDDUL_BAHR = find_space("Seddul Bahr")
	const MAIDOS = find_space("Maidos")
	const CANAKKALE = find_space("Canakkale")
	const BATUM = find_space("Batum")
	const BAKU = find_space("Baku")
	const ENZELI = find_space("Enzeli")
	const PETROVSK = find_space("Petrovsk")
	const GALLIPOLI = find_space("Gallipoli")
	const BOSPHORUS_FORTS = find_space("The Bosphorus Forts")
	const MECCA = find_space("Mecca")

	/**
	 * 检查地块是否为丘吉尔胜出事件的合法增援地块
	 */
	function is_churchill_reinf_space(ctx, s) {
		let { game, rules } = ctx
		if (s === rules.get_reserve_box(AP)) return true
		return (
			Engine.map.is_aegean_east_med_port(s) &&
			Engine.map.is_controlled_by(game, s, AP) &&
			!Engine.map.is_besieged(game, s) &&
			get_capacity(game, s) > 0
		)
	}

	/**
	 * 获取或初始化事件数据
	 * @param {object} game 游戏状态
	 * @param {string} key 事件键值
	 * @returns {object} 事件对象
	 */
	function use_event(game, key) {
		if (!game) {
			console.error(`Error: game object is undefined in use_event for key: ${key}`)
			throw new Error(`Cannot access event data for "${key}": game state is missing.`)
		}
		// 如果当前有激活的事件上下文且 key 匹配，则返回上下文数据
		if (game.event_ctx && game.event_ctx.key === key) {
			if (!game.event_ctx.data) game.event_ctx.data = {}
			return game.event_ctx.data
		}
		if (!game.events) game.events = {}
		if (!game.events[key] || typeof game.events[key] !== "object") {
			game.events[key] = {}
		}
		return game.events[key]
	}

	function get_reinforcement_units(game) {
		let units = null
		let source = null
		if (
			game.event_ctx &&
			game.event_ctx.data &&
			Array.isArray(game.event_ctx.data.reinf_to_place) &&
			game.event_ctx.data.reinf_to_place.length > 0
		) {
			units = game.event_ctx.data.reinf_to_place
			source = game.event_ctx.data
		}
		if ((!units || units.length === 0) && game.event_ctx && game.event_ctx.key && game.events) {
			let event = game.events[game.event_ctx.key]
			if (event && Array.isArray(event.reinf_to_place) && event.reinf_to_place.length > 0) {
				units = event.reinf_to_place
				source = event
			}
		}
		return { units, source }
	}

	function get_active_event_data(game) {
		if (game && game.event_ctx && game.event_ctx.data) return game.event_ctx.data
		return null
	}

	// === EVENT ACTIVATION HOOKS ===

	/**
	 * 获取激活阶段的事件提示
	 */
	function get_activation_prompt(game) {
		if (game.russo_british_russian_activation) {
			let selected = Array.isArray(game.activated?.attack) ? game.activated.attack.length : 0
			return `英俄突袭：选择最多 2 个含俄军的合法进攻地块（已选: ${selected}/2）`
		}
		if (game.liberate_suez_op_required) {
			let need_ops = game.liberate_suez_min_egypt_attack_ops || 2
			let used_ops = get_liberate_suez_egypt_activated_attack_ops(game)
			let remain = Math.max(0, need_ops - used_ops)
			return `解放苏伊士：选择激活的地块 (剩余行动点: ${game.ops}) [埃及进攻已分配: ${used_ops}/${need_ops} OP，仍需 ${remain} OP]`
		}
		return null
	}

	/**
	 * 激活结束后的事件状态转移
	 */
	function on_activation_done(game) {
		if (game.liberate_suez_op_required) {
			game.state = "event_liberate_suez_check_ops"
			return true
		}
		if (Engine.events.bulls_eye_should_prompt_sr(game) && Engine.events.bulls_eye_get_sr_spaces(game).length > 0) {
			game.state = "event_bulls_eye_sr"
			return true
		}
		return false
	}

	// === EVENT: RUSSO-BRITISH ASSAULT (ID 1) ===

	states.event_russo_british_assault_fao_fort = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			if (rules.has_undestroyed_fort(game, FAO, CP)) {
				res.prompt("英俄突袭：炮击法奥 (Fao) 摧毁要塞")
				res.space(FAO)
			} else {
				game.state = "event_russo_british_assault_land_fao"
			}
		},
		space(ctx) {
			let { game, rules, res } = ctx
			rules.push_undo()
			if (!game.forts) game.forts = { destroyed: [] }
			if (!game.forts.destroyed) game.forts.destroyed = []
			rules.set_add(game.forts.destroyed, FAO)
			rules.log("英俄突袭：法奥要塞被摧毁")

			// 立即触发渲染
			if (res && typeof res.apply === "function") {
				res.apply(game.view)
			}

			game.state = "event_russo_british_assault_land_fao"
		}
	}

	states.event_russo_british_assault_land_fao = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("英俄突袭：波斯湾部队实施登陆")
			res.space(FAO)
		},
		space(ctx) {
			let { game, rules, res } = ctx
			rules.push_undo()

			let pieces = rules.get_pieces_in_space(game, TO_FAO)
			if (pieces.length > 0) {
				rules.log(`英俄突袭：波斯湾部队登陆到 ${rules.space_name(FAO)}.`)
				for (let p of pieces) {
					rules.move_piece(game, p, FAO)
				}
			}

			let abadan_pieces = rules.get_pieces_in_space(game, TO_ABADAN)
			if (abadan_pieces.length > 0) {
				for (let p of abadan_pieces) {
					rules.move_piece(game, p, SHAIBA)
				}
			}

			// 登陆导致控制权变更，立即渲染
			if (rules.is_controlled_by(game, FAO, CP)) {
				rules.set_control(game, FAO, AP)
				if (res && typeof res.apply === "function") {
					res.apply(game.view)
				}
			}

			game.state = "event_russo_british_assault_attack_basra"
		}
	}

	states.event_russo_british_assault_attack_basra = {
		prompt(ctx) {
			let { game, res, rules } = ctx

			if (!game.attack) {
				game.attack = { pieces: [], space: -1 }
			}

			if (game.attack && game.attack.space !== -1) {
				res.prompt(`英俄突袭：确认向 ${Engine.game_utils.space_name(game.attack.space)} 进攻`)
				res.where(game.attack.space)
				res.who(game.attack.pieces)
			} else {
				res.prompt("英俄突袭：选择参与突袭巴士拉的单位")
				res.where(FAO)
			}

			let pieces = rules.get_pieces_in_space(game, FAO)
			for (let p of pieces) {
				if (data.pieces[p].faction === AP) {
					if (game.attack.space === -1 || game.attack.pieces.includes(p)) {
						res.piece(p)
					}
				}
			}

			if (game.attack.pieces && game.attack.pieces.length > 0) {
				if (game.attack.space !== BASRA) {
					res.space(BASRA)
				}
				// 如果已经选择了目标地块，显示确认按钮
				if (game.attack.space === BASRA) {
					res.action("confirm")
				}
			}
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			if (!game.attack) {
				game.attack = { pieces: [], space: -1 }
			}
			rules.push_undo()
			rules.set_toggle(game.attack.pieces, p)
			game.attack.space = -1
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			if (s === BASRA && game.attack && game.attack.pieces && game.attack.pieces.length > 0) {
				rules.push_undo()
				// 切换选择目标地块，而不是直接开始战斗
				if (game.attack.space === BASRA) {
					game.attack.space = -1
				} else {
					game.attack.space = BASRA
				}
			}
		},
		confirm(ctx) {
			let { game, rules } = ctx
			if (game.attack && game.attack.space === BASRA && game.attack.pieces.length > 0) {
				rules.push_undo()
				game.attack.attacker_faction = AP
				game.attack.keep_context = true // 保持上下文，以便在俄国突袭前手动清理状态
				game.event_next_state = "event_russo_british_assault_ru_activation_setup"
				rules.start_attack_sequence(game, rules.log, () => rules.get_season(game))
			}
		}
	}

	function cleanup_russo_british_attack_state(game) {
		if (game.attack && game.attack.pieces) {
			for (let p of game.attack.pieces) {
				set_delete(game.attacked, p)
				set_delete(game.moved, p)
			}
		}
		delete game.combat_cards
		delete game.combat_cards_effected
		delete game.battle_result
		delete game.post_battle_cc_resume
		delete game.post_roll_cc_done
		game.attack = null
		game.where = -1
	}

	function begin_russo_british_russian_activation(game) {
		cleanup_russo_british_attack_state(game)
		if (!game.activated) game.activated = { move: [], attack: [] }
		if (!Array.isArray(game.activated.move)) game.activated.move = []
		game.activated.move = []
		if (!Array.isArray(game.activated.attack)) game.activated.attack = []
		game.activated.attack = []
		delete game.activated.combine
		if (!game.activation_cost) game.activation_cost = {}
		game.activation_cost = {}
		game.russo_british_russian_activation = true
		game.active = AP
		game.where = -1
		delete game.russo_british_selected_spaces
		delete game.russo_british_attack_origins
		game.state = "activate_spaces"
	}

	// === EVENT: ENVER GOES EAST (ID 7) ===

	function enver_get_selectable_spaces(game, rules, event) {
		let selected = event.enver_selected_spaces || []
		let selectable = []
		for (let s = 1; s < data.spaces.length; s++) {
			let pieces = rules.get_pieces_in_space(game, s)
			let turkish_pieces = pieces.filter((p) => data.pieces[p].nation === "tu" || data.pieces[p].nation === "tua")
			if (turkish_pieces.length === 0) continue
			let has_ru_adjacent = rules
				.get_connected_spaces(game, s)
				.some((ns) => rules.get_pieces_in_space(game, ns).some((p) => data.pieces[p].nation === "ru"))
			if (!has_ru_adjacent) continue
			if (rules.set_has(selected, s)) continue
			selectable.push(s)
		}
		return selectable
	}

	function enver_get_targets(game, rules, space) {
		let targets = []
		for (let ns of rules.get_connected_spaces(game, space)) {
			let has_ru = rules.get_pieces_in_space(game, ns).some((p) => data.pieces[p].nation === "ru")
			if (has_ru) targets.push(ns)
		}
		return targets
	}

	states.event_enver_goes_east_select_space = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "enver_goes_east")
			if (!event.enver_selected_spaces) event.enver_selected_spaces = []
			if (!event.enver_plans) event.enver_plans = []
			if (event.enver_expected_count === undefined) event.enver_expected_count = 2
			let selectable = enver_get_selectable_spaces(game, rules, event)
			res.prompt(
				`恩维尔东方攻势：选择土耳其堆叠与攻击目标（已选择: ${event.enver_plans.length}/${event.enver_expected_count}）`
			)
			if (event.enver_plans.length < event.enver_expected_count) {
				for (let s of selectable) res.space(s)
			}
			if (
				event.enver_plans.length > 0 &&
				(event.enver_plans.length >= event.enver_expected_count || selectable.length === 0)
			) {
				res.action("confirm")
			}
			if (event.enver_plans.length === 0 && selectable.length === 0) res.action("done")
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let event = use_event(game, "enver_goes_east")
			if (event.enver_plans.length >= event.enver_expected_count) return
			rules.push_undo()
			event.enver_current_space = s
			game.state = "event_enver_goes_east_select_target"
		},
		confirm(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "enver_goes_east")
			if (!event.enver_plans || event.enver_plans.length === 0) return
			rules.push_undo()
			event.enver_queue = event.enver_plans.map((plan) => ({
				from: plan.from,
				to: plan.to,
				pieces: plan.pieces.slice()
			}))
			delete event.enver_current_space
			// Initialize retained cards storage if not exists
			if (!game.cc_retained) game.cc_retained = { ap: [], cp: [] }
			game.state = "event_enver_goes_east_resolve_next_attack"
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_operations()
		}
	}

	states.event_enver_goes_east_select_target = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "enver_goes_east")
			let s = event.enver_current_space
			if (s === undefined) {
				game.state = "event_enver_goes_east_select_space"
				return
			}
			res.where(s)
			res.prompt(`恩维尔东方攻势：为 ${rules.space_name(s)} 的土耳其部队选择一个攻击目标。`)
			for (let ns of enver_get_targets(game, rules, s)) res.space(ns)
			res.action("cancel")
		},
		space(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "enver_goes_east")
			let ns = ctx.arg
			let s = event.enver_current_space
			if (s === undefined) {
				game.state = "event_enver_goes_east_select_space"
				return
			}
			let targets = enver_get_targets(game, rules, s)
			if (!rules.set_has(targets, ns)) return
			let pieces = rules
				.get_pieces_in_space(game, s)
				.filter((p) => data.pieces[p].nation === "tu" || data.pieces[p].nation === "tua")
			if (pieces.length === 0) {
				delete event.enver_current_space
				game.state = "event_enver_goes_east_select_space"
				return
			}
			rules.push_undo()
			if (!event.enver_selected_spaces) event.enver_selected_spaces = []
			if (!event.enver_plans) event.enver_plans = []
			rules.set_add(event.enver_selected_spaces, s)
			event.enver_plans.push({ from: s, to: ns, pieces: pieces.slice() })
			delete event.enver_current_space
			game.state = "event_enver_goes_east_select_space"
		},
		cancel(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "enver_goes_east")
			delete event.enver_current_space
			game.state = "event_enver_goes_east_select_space"
		}
	}

	states.event_enver_goes_east_resolve_next_attack = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "enver_goes_east")
			if (!event.enver_queue || event.enver_queue.length === 0) {
				res.prompt("恩维尔东方攻势：攻击结算完毕。")
				res.action("done")
			} else {
				let next = event.enver_queue[0]
				res.prompt(
					`恩维尔东方攻势：准备结算 ${rules.space_name(next.from)} 对 ${rules.space_name(next.to)} 的攻击。`
				)
				res.action("next")
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "enver_goes_east")
			delete event.enver_queue
			delete event.enver_plans
			delete event.enver_selected_spaces
			delete event.enver_expected_count
			delete event.enver_current_space
			// Ensure retained cards are kept but current combat context is cleared
			delete game.combat_cards
			delete game.combat_cards_effected
			game.active = AP
			rules.goto_end_operations()
		},
		next(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "enver_goes_east")
			let next = event.enver_queue.shift()
			rules.log(`Enver Goes East: ${rules.space_name(next.from)} attacks ${rules.space_name(next.to)}.`)
			game.attack = {
				space: next.to,
				pieces: next.pieces.slice(),
				attacker_faction: CP,
				keep_context: true // Mark as part of the event to keep combat context
			}
			game.event_next_state = "event_enver_goes_east_resolve_next_attack"
			game.active = CP
			rules.start_attack_sequence(game, rules.log, () => rules.get_season(game))
		}
	}

	// === EVENT: SECRET TREATY (ID 8) ===

	states.event_secret_treaty_place_reinforcement = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "secret_treaty")
			if (!event.reinf_to_place) {
				event.reinf_to_place = ["BR Persian Cordon #4"]
			}
			if (event.reinf_to_place.length === 0) {
				res.prompt("秘密条约：增援放置完毕。")
				res.action("done")
				return
			}
			let unit = event.reinf_to_place[0]
			res.prompt(`秘密条约：将 ${unit} 放置在任意波斯大区。`)
			for (let s = 1; s < data.spaces.length; s++) {
				if (rules.is_secret_treaty_rein.check(game, s)) {
					if (get_capacity(game, s) > 0) {
						res.space(s)
					}
				}
			}
		},
		done(ctx) {
			let { game } = ctx
			game.state = "event_secret_treaty_select_move_space"
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let event = use_event(game, "secret_treaty")
			if (!event.reinf_to_place || event.reinf_to_place.length === 0) {
				event.reinf_to_place = ["BR Persian Cordon #4"]
			}
			if (event.reinf_to_place.length === 0) {
				game.state = "event_secret_treaty_select_move_space"
				return
			}
			rules.push_undo()
			let unit = event.reinf_to_place.shift()
			rules.reinforce(game, unit, AP, s)
			if (event.reinf_to_place.length === 0) {
				delete event.reinf_to_place
				game.state = "event_secret_treaty_select_move_space"
			}
		}
	}

	states.event_secret_treaty_select_move_space = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			res.prompt("秘密条约：选择一个地区的协约国单位进行移动。")
			let has_option = false
			//A:波斯大区、中亚大区B:高加索、阿塞拜疆区域C:美索不达米亚限制区域。
			for (let s = 1; s < data.spaces.length; s++) {
				// A: 属于波斯大区、中亚大区
				let is_A = rules.is_persia(s) || rules.is_central_asia(s)
				// B: 属于高加索或阿塞拜疆区域
				let is_B = rules.is_caucasus(s) || rules.is_azerbaijan(s)
				// C: 属于美索不达米亚限制区域
				let is_C = rules.is_mesopotamia(s)

				if (is_A || is_B || is_C) {
					let pieces = rules.get_pieces_in_space(game, s).filter((p) => data.pieces[p].faction === AP)
					if (pieces.length > 0) {
						res.space(s)
						has_option = true
					}
				}
			}
			if (!has_option) {
				res.prompt("秘密条约：没有可移动的协约国单位。")
				res.action("done")
			}
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			game.activated = { move: [s], attack: [] }
			game.activation_cost = {}
			game.moved = []
			game.attacked = []
			game.move_from_event = true
			game.state = "choose_move_space"
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	// === EVENT: SPHERE OF INFLUENCE (ID 9) ===

	states.event_sphere_of_influence_place = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "sphere_of_influence")
			if (!event.reinf_to_place) {
				event.reinf_to_place = ["RU Elite DIV #3", "RU DIV #11", "RU DIV #12"]
			}
			if (event.reinf_to_place.length === 0) {
				rules.goto_end_event()
				return
			}
			let units_str = event.reinf_to_place.join("、")
			let legal_spaces_found = false
			let legal_spaces = []
			for (let s = 1; s < data.spaces.length; s++) {
				if (rules.is_ru_sphere_rein.check(game, s)) {
					res.space(s)
					legal_spaces_found = true
					legal_spaces.push(`${data.spaces[s].name} (${s})`)
				}
			}
			if (legal_spaces_found) {
				res.prompt(
					`俄国势力范围：将 ${units_str} 放置在协约国控制、空置且铁路连通俄国补给点的俄国/阿塞拜疆地区。`
				)
			} else {
				res.prompt(`俄国势力范围：没有合法位置可以放置增援单位。`)
				res.action("done", "完成放置")
			}
		},
		space(ctx) {
		let { game, rules, arg: s } = ctx
		let event = use_event(game, "sphere_of_influence")
		let units = ["RU Elite DIV #3", "RU DIV #11", "RU DIV #12"]
		rules.push_undo()

		// 全部放在选定的同一个地块
		for (let unit of units) {
			rules.reinforce(game, unit, AP, s)
		}

		rules.goto_end_event()
	},
		done(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "sphere_of_influence")
			delete event.reinf_to_place
			rules.goto_end_event()
		}
	}

	// === EVENT: PROJECT ALEXANDRIA (ID 12) ===

	states.event_project_alexandria_place_beachhead = {
		prompt(ctx) {
			let { res, rules } = ctx
			res.prompt("亚历山大计划：将一个滩头标志放置在塞浦路斯旁的滩头地区。")
			for (let s = 1; s < data.spaces.length; s++) {
				if (data.spaces[s].beach_for === "Cyprus") {
					res.space(s)
				}
			}
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let event = use_event(game, "project_alexandria")
			rules.push_undo()
			if (!game.beachheads) game.beachheads = []
			game.beachheads.push(s)
			Engine.greece.on_beachhead_placed(game, s, AP)
			rules.log(`Beachhead placed at ${data.spaces[s].name}.`)
			event.event_port = s
			game.state = "event_project_alexandria_sr"
		}
	}

	states.event_project_alexandria_sr = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let data_event = rules.get_event_data()
			let event = use_event(game, "project_alexandria")
			let count = data_event.count || 0
			let max_count = 3 // Up to 3 SR points for SCUs

			res.prompt(
				`亚历山大计划：选择至多3支英国/印度/澳新步兵师从预备军战略调整至位于 ${data.spaces[event.event_port].name} 的滩头 (${count}/${max_count})。`
			)

			for (let p = 1; p < data.pieces.length; p++) {
				let piece = data.pieces[p]
				if (!piece || !piece.faction) continue
				if (
					piece.faction === AP &&
					(piece.nation === "br" || piece.nation === "in" || piece.nation === "anz") &&
					piece.piece_class === "SCU" &&
					(get_piece_badge(p) === "infantry" || get_piece_badge(p) === "blue") &&
					rules.is_in_reserve(game, p)
				) {
					let cost = rules.get_sr_cost(p)
					if (count + cost <= max_count) {
						res.piece(p)
					}
				}
			}
			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			let event = use_event(game, "project_alexandria")
			rules.push_undo()
			let data_event = rules.get_event_data()
			let cost = rules.get_sr_cost(p)
			data_event.count = (data_event.count || 0) + cost

			game.pieces[p] = event.event_port
			rules.log(`${rules.piece_name(p)} Strategic Redeployed to Beachhead (Cost: ${cost}).`)

			if ((data_event.count || 0) >= 3) {
				delete event.event_port
				rules.goto_end_operations()
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "project_alexandria")
			delete event.event_port
			rules.goto_end_operations()
		}
	}

	// === EVENT: CHURCHILL PREVAILS (ID 13) ===

	states.event_churchill_prevails_bombardment = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "churchill_prevails")
			let step = event.churchill_prevails_step || 0

			if (step === 0) {
				res.prompt("丘吉尔胜出：选择首先炮击的达达尼尔要塞（ Kum Kal 或 Sefful bahr ）")
				res.space(KUM_KALE)
				res.space(SEDDUL_BAHR)
			} else if (step === 1) {
				let first = event.churchill_prevails_first_fort
				let second = first === KUM_KALE ? SEDDUL_BAHR : KUM_KALE
				res.prompt(`丘吉尔胜出：继续炮击第二个达达尼尔要塞（${rules.space_name(second)}）`)
				res.space(second)
			} else if (step === 2) {
				res.prompt("丘吉尔胜出：选择首先炮击的窄口要塞（ Maidos 或 Canakkale ）")
				res.space(MAIDOS)
				res.space(CANAKKALE)
			} else if (step === 3) {
				let first = event.churchill_prevails_first_fort
				let second = first === MAIDOS ? CANAKKALE : MAIDOS
				res.prompt(`丘吉尔胜出：继续炮击第二个窄口要塞（${rules.space_name(second)}）`)
				res.space(second)
			} else if (step === 4) {
				res.prompt("丘吉尔胜出：最后炮击加利波里要塞（ Gallipoli ）")
				res.space(GALLIPOLI)
			}
		},
		space(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "churchill_prevails")
			let s = ctx.arg
			rules.push_undo()

			let cf = data.spaces[s].fort || 1
			let roll = rules.roll_die(6, game)
			rules.log(`Bombardment roll against ${rules.space_name(s)} (CF ${cf}): ${roll}`)

			if (roll > cf) {
				rules.log(`${rules.space_name(s)} destroyed!`)
				if (!game.forts) game.forts = { destroyed: [] }
				if (!game.forts.destroyed) game.forts.destroyed = []
				rules.set_add(game.forts.destroyed, s)

				if (event.churchill_prevails_step === 0) {
					event.churchill_prevails_first_fort = s
					event.churchill_prevails_step = 1
				} else if (event.churchill_prevails_step === 1) {
					event.churchill_prevails_step = 2
				} else if (event.churchill_prevails_step === 2) {
					event.churchill_prevails_first_fort = s
					event.churchill_prevails_step = 3
				} else if (event.churchill_prevails_step === 3) {
					event.churchill_prevails_step = 4
				} else if (event.churchill_prevails_step === 4) {
					rules.log("Royal Navy enters Sea of Marmara!")
					game.state = "event_churchill_prevails_constantinople"
				}
			} else {
				rules.log(`Bombardment failed. Churchill's plan ends.`)
				rules.goto_end_operations()
			}
		}
	}

	states.event_churchill_prevails_constantinople = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("皇家海军驶入马尔马拉海。是否选择炮击君士坦丁堡？")
			res.action("bombard", "炮击")
			res.action("skip", "跳过")
		},
		bombard(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			rules.log("Royal Navy bombards Constantinople!")
			game.vp -= 1
			game.state = "event_churchill_prevails_place_units"
			rules.update_jihad_level(game, 1)
		},
		skip(ctx) {
			let { game } = ctx
			game.state = "event_churchill_prevails_place_units"
		}
	}

	states.event_churchill_prevails_place_units = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "churchill_prevails")
			if (!event.reinf_to_place) {
				event.reinf_to_place = ["BR Elite DIV #1", "BR Elite DIV #2"]
			}
			let unit = event.reinf_to_place[0]
			res.prompt(`丘吉尔胜出：将 ${unit} 放置在预备军格或任何协约国控制的爱琴海/东地中海港口。`)

			for (let s = 1; s < data.spaces.length; s++) {
				if (is_churchill_reinf_space(ctx, s)) {
					res.space(s)
				}
			}
		},
		space(ctx) {
			let { game, rules } = ctx
			let event = use_event(game, "churchill_prevails")
			let s = ctx.arg

			// 验证选择的地块是否合法
			if (!is_churchill_reinf_space(ctx, s)) {
				return
			}

			if (!event.reinf_to_place || event.reinf_to_place.length === 0) {
				event.reinf_to_place = ["BR Elite DIV #1", "BR Elite DIV #2"]
			}
			if (event.reinf_to_place.length === 0) {
				game.state = "event_churchill_prevails_bosphorus"
				return
			}
			rules.push_undo()
			let unit = event.reinf_to_place.shift()
			rules.reinforce(game, unit, AP, s)
			if (event.reinf_to_place.length === 0) {
				delete event.reinf_to_place
				game.state = "event_churchill_prevails_bosphorus"
			}
		}
	}

	states.event_churchill_prevails_bosphorus = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("丘吉尔胜出：是否继续炮击博斯普鲁斯海峡要塞？")
			res.action("bombard", "炮击")
			res.action("skip", "跳过")
		},
		bombard(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			let cf = BOSPHORUS_FORTS >= 0 ? data.spaces[BOSPHORUS_FORTS].fort || 1 : 3
			let roll = rules.roll_die(6, game)
			rules.log(`Bombardment roll against Bosphorus Forts (CF ${cf}): ${roll}`)
			if (roll > cf) {
				if (!game.forts) game.forts = { destroyed: [] }
				if (!game.forts.destroyed) game.forts.destroyed = []
				if (BOSPHORUS_FORTS >= 0) rules.set_add(game.forts.destroyed, BOSPHORUS_FORTS)
				game.events["bosphorus_destroyed"] = true
				if (!game.events["german_subs"]) {
					game.rp_ap.ru += 2
					rules.log("Bosphorus Forts destroyed! Allied gain +2 RU RP and +1 RU RP each turn thereafter.")
				} else {
					rules.log("Bosphorus Forts destroyed, but German Subs in the Med already played: no RU RP bonus.")
				}
				rules.goto_end_operations()
			} else {
				rules.log("Bombardment failed. Churchill's plan ends.")
				rules.goto_end_operations()
			}
		},
		skip(ctx) {
			let { rules } = ctx
			rules.goto_end_operations()
		}
	}

	// === EVENT: ARAB REVOLT (ID 16) ===

	states.event_arab_revolt_place = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let { units } = get_reinforcement_units(game)
			if (!units || units.length === 0) {
				res.prompt("阿拉伯起义：所有单位已放置在麦加。是否启动它们进行战斗？")
				res.action("activate")
				return
			}
			let unit = units[0]
			res.prompt(`阿拉伯起义：在麦加放置 ${unit}。`)
			res.space(MECCA)
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			if (s !== MECCA) return
			let { units } = get_reinforcement_units(game)
			if (!units || units.length === 0) return
			rules.push_undo() // 保存每个单位放置前的状态
			let unit = units.shift()
			let p = rules.reinforce(game, unit, AP, s)
			if (!game.arab_revolt_pieces) game.arab_revolt_pieces = []
			rules.set_add(game.arab_revolt_pieces, p)
		},
		activate(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.state = "event_arab_revolt_attack"
			game.selected_pieces = []
		}
	}

	states.event_arab_revolt_attack = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let revolt_pieces = game.arab_revolt_pieces || []

			// If not all 3 pieces selected, allow selecting them
			if (game.selected_pieces.length < 3) {
				res.prompt(`阿拉伯起义：请选中麦加的所有 3 个起义单位以发起战斗 (${game.selected_pieces.length}/3)。`)
				for (let p of revolt_pieces) {
					if (!game.selected_pieces.includes(p)) {
						res.piece(p)
					}
				}
				return
			}

			// All 3 selected, now pick target
			res.who(game.selected_pieces)
			if (game.attack && game.attack.space !== -1) {
				res.prompt(`阿拉伯起义：确认向 ${Engine.game_utils.space_name(game.attack.space)} 进攻`)
				res.where(game.attack.space)
				res.action("confirm")
			} else {
				res.prompt("阿拉伯起义：请选择攻击目标地块。")
			}
			let targets = rules.get_attackable_spaces(game.selected_pieces)
			if (targets.length === 0 && (!game.attack || game.attack.space === -1)) {
				res.prompt("阿拉伯起义：没有可攻击的目标。事件结束。")
				res.action("done", "完成事件")
			} else {
				for (let t of targets) {
					if (!game.attack || t !== game.attack.space) {
						res.space(t)
					}
				}
			}
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			rules.set_add(game.selected_pieces, p)
			// Reset target when piece list changes
			if (game.attack) game.attack.space = -1
		},
		space(ctx) {
			let { game, rules, arg: t } = ctx
			rules.push_undo()
			if (!game.attack) {
				game.attack = { pieces: [...game.selected_pieces], space: -1 }
			}
			if (game.attack.space === t) {
				game.attack.space = -1
			} else {
				game.attack.space = t
			}
		},
		confirm(ctx) {
			let { game } = ctx
			if (game.attack && game.attack.space !== -1) {
				delete game.selected_pieces
				delete game.arab_revolt_pieces
				game.state = "confirm_attack"
				game.event_next_state = "event_arab_revolt_cleanup"
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			delete game.selected_pieces
			delete game.arab_revolt_pieces
			rules.goto_end_event()
		}
	}

	states.event_arab_revolt_cleanup = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("阿拉伯起义：战斗结束。")
			res.action("done", "完成事件")
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	// === EVENT: ALLIED SOLIDARITY (ID 17) ===

	states.event_allied_solidarity_place = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let { units } = get_reinforcement_units(game)
			if (!units || units.length === 0) {
				res.prompt("盟军团结：所有增援已放置。")
				res.action("done")
				return
			}
			let unit = units[0]
			if (unit === "GR National Defense") {
				res.prompt(`盟军团结：将 ${unit} 放置在协约国控制的港口、巴尔干滩头、利姆诺斯岛或萨洛尼卡。`)
			} else {
				res.prompt(`盟军团结：将 ${unit} 放置在协约国控制的港口、巴尔干滩头或利姆诺斯岛。`)
			}

			if (unit === "GR National Defense") {
				let salonika = SALONIKA
				if (salonika >= 0 && get_capacity(game, salonika) > 0) {
					res.space(salonika)
				}
			}

			for (let s = 1; s < data.spaces.length; s++) {
				// 萨洛尼卡只能由希腊国防军放置，此处循环排除它
				if (s === SALONIKA) continue

				let is_port = data.spaces[s].port
				let is_controlled = rules.is_controlled_by(game, s, AP)
				let is_beachhead =
					game.beachheads && game.beachheads.includes(s) && data.spaces[s].beach_for === "Lemnos"
				let is_lemnos = s === LEMNOS

				if (((is_port && is_controlled) || is_beachhead || is_lemnos) && get_capacity(game, s) > 0) {
					res.space(s)
				}
			}
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let { units, source } = get_reinforcement_units(game)
			if (!units || units.length === 0) return
			rules.push_undo() // 保存每个单位放置前的状态
			let unit = units.shift()
			rules.reinforce(game, unit, AP, s)

			if (unit === "GR National Defense" && data.spaces[s].name === "Salonika") {
				game.control[s] = AP
				game.events["salonika_is_port"] = true
				rules.log("Salonika is now an AP port.")
			}

			if (units.length === 0) {
				if (source) delete source.reinf_to_place
				rules.goto_end_event()
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let { source } = get_reinforcement_units(game)
			if (source) delete source.reinf_to_place
			rules.goto_end_event()
		}
	}

	// === EVENT: INVASION EVENTS (ID 22, 30, 34) ===

	states.event_kitcheners_invasion_choice = {
		prompt(ctx) {
			let { game, res } = ctx
			res.prompt("基钦纳入侵：选择一种打法")
			if (!game.events["unrestricted_submarine_warfare"]) {
				res.action("invasion", "发起入侵 (海上入侵+入侵+增援)")
			}
			res.action("reinforcement", "仅增援 (替代入侵)")
		},
		invasion(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			let event = get_active_event_data(game)
			if (event) {
				event.beachheads_to_place = 1
				event.reinf_to_place = ["BR IX Corps", "BR DIV #2", "BR DIV #3"]
				event.direct_to_beachhead = true
			}
			game.state = "event_invasion_place_beachhead"
		},
		reinforcement(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			rules.log("Kitchener's Invasion: AP chooses to only reinforce.")
			rules.reinforce(game, "BR IX Corps", AP)
			rules.reinforce(game, "BR DIV #2", AP)
			rules.reinforce(game, "BR DIV #3", AP)
			rules.goto_end_event()
		}
	}

	states.event_gallipoli_invasion_choice = {
		prompt(ctx) {
			let { game, res } = ctx
			res.prompt("加利波里入侵：选择一种打法")
			if (!game.events["unrestricted_submarine_warfare"]) {
				res.action("invasion", "发起入侵 (海上入侵+入侵)")
			}
			res.action("reinforcement", "仅增援 (替代入侵)")
		},
		invasion(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			let event = get_active_event_data(game)
			if (event) {
				event.beachheads_to_place = 2
				event.reinf_to_place = ["BR VIII Corps", "ANZ ANZAC", "FR DIV #1", "FR DIV #2", "BR DIV #1"]
				event.flip_lcu_if_scu = true
			}
			game.state = "event_invasion_place_beachhead"
		},
		reinforcement(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			rules.log("Gallipoli Invasion: AP chooses to only reinforce.")
			rules.reinforce(game, "BR VIII Corps", AP)
			rules.reinforce(game, "ANZ ANZAC", AP)
			rules.reinforce(game, "FR DIV #1", AP)
			rules.reinforce(game, "FR DIV #2", AP)
			rules.reinforce(game, "BR DIV #1", AP)
			rules.goto_end_event()
		}
	}

	states.event_salonika_invasion_choice = {
		prompt(ctx) {
			let { game, res } = ctx
			res.prompt("萨洛尼卡入侵：选择一种打法")
			if (!game.events["unrestricted_submarine_warfare"]) {
				res.action("invasion", "发起入侵 (海上入侵+入侵)")
			}
			res.action("reinforcement", "仅增援 (替代入侵)")
		},
		invasion(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			let event = get_active_event_data(game)
			if (event) {
				event.beachheads_to_place = 1
				event.reinf_to_place = ["BR XVI Corps", "BR XII Corps", "FR DIV #1", "FR DIV #2"]
				event.allow_sr_to_island = 3
			}
			game.state = "event_invasion_place_beachhead"
		},
		reinforcement(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			rules.log("Salonika Invasion: AP chooses to only reinforce.")
			rules.reinforce(game, "BR XVI Corps", AP)
			rules.reinforce(game, "BR XII Corps", AP)
			rules.reinforce(game, "FR DIV #1", AP)
			rules.reinforce(game, "FR DIV #2", AP)
			rules.goto_end_event()
		}
	}

	states.event_invasion_place_beachhead = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = get_active_event_data(game)
			let b = (event && event.beachheads_to_place) || 0
			if (b <= 0) {
				res.prompt("海上入侵：滩头放置完毕。")
				res.action("done")
				return
			}
			res.prompt(`海上入侵：放置一个滩头标记（剩余 ${b} 个）。`)

			res.space(rules.get_reserve_box(AP))

			for (let s = 1; s < data.spaces.length; s++) {
				if (data.spaces[s].beach_for) {
					if (!rules.set_has(game.beachheads, s)) {
						res.space(s)
					}
				}
			}
		},
		done(ctx) {
			let { game } = ctx
			let event = get_active_event_data(game)
			let direct_to_beachhead = event && event.direct_to_beachhead
			if (direct_to_beachhead) {
				game.state = "event_invasion_place_units_beachhead"
			} else {
				game.state = "event_invasion_place_units_island"
			}
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let event = get_active_event_data(game)
			rules.push_undo()
			if (s !== rules.get_reserve_box(AP)) {
				if (!game.beachheads) game.beachheads = []
				rules.set_add(game.beachheads, s)
				rules.log(`Beachhead placed at ${data.spaces[s].name}.`)

				// Rule 19.2.1: Placing a Beachhead marker in Athens triggers Greek entry as CP ally
				if (Engine.greece.is_greece_neutral(game) && Engine.greece.is_athens_space(s)) {
					Engine.greece.trigger_greece_entry(game, s, AP, "在雅典放置滩头", (msg) => rules.log(msg))
				}
			} else {
				rules.log("Beachhead placed in Reserve Box.")
				game.unplaced_beachheads = (game.unplaced_beachheads || 0) + 1
			}
			let b = (event && event.beachheads_to_place) || 0
			b--
			if (event) event.beachheads_to_place = b
			if (b <= 0) {
				let direct_to_beachhead = event && event.direct_to_beachhead
				if (direct_to_beachhead) {
					game.state = "event_invasion_place_units_beachhead"
				} else {
					game.state = "event_invasion_place_units_island"
				}
			}
		}
	}

	states.event_invasion_place_units_beachhead = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let { units } = get_reinforcement_units(game)
			if (!units || units.length === 0) {
				rules.goto_end_event()
				return
			}
			let unit = units[0]
			res.prompt(`海上入侵：将 ${unit} 放置在任何滩头。`)
			let has_space = false
			for (let s of game.beachheads || []) {
				if (get_capacity(game, s) > 0) {
					res.space(s)
					has_space = true
				}
			}
			if (!has_space) {
				res.action("done", "无法放置（跳过）")
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let invasion = get_active_event_data(game)
			let { units, source } = get_reinforcement_units(game)
			if (source) delete source.reinf_to_place
			if (invasion) delete invasion.direct_to_beachhead
			rules.goto_end_event()
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			let invasion = get_active_event_data(game)
			let { units, source } = get_reinforcement_units(game)
			if (!units || units.length === 0) return
			let unit = units.shift()
			rules.reinforce(game, unit, AP, s)
			if (units.length === 0) {
				if (source) delete source.reinf_to_place
				if (invasion) delete invasion.direct_to_beachhead
				rules.goto_end_event()
			}
		}
	}

	states.event_invasion_place_units_island = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let invasion = get_active_event_data(game)
			let { units } = get_reinforcement_units(game)
			if (!units || units.length === 0) {
				res.prompt("海上入侵：岛屿增援放置完毕。")
				res.action("done")
				return
			}
			let unit = units[0]
			res.prompt(`海上入侵：将 ${unit} 放置在任何协约国控制的岛屿基地。`)
			let has_space = false
			for (let s = 1; s < data.spaces.length; s++) {
				if (data.spaces[s].island_base && rules.is_controlled_by(game, s, AP) && get_capacity(game, s) > 0) {
					res.space(s)
					has_space = true
				}
			}
			if (!has_space) {
				res.action("done", "无法放置（跳过）")
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let invasion = get_active_event_data(game)
			if (invasion && invasion.flip_lcu_if_scu) {
				game.state = "event_gallipoli_invasion_flip"
			} else if (((invasion && invasion.allow_sr_to_island) || 0) > 0) {
				game.state = "event_salonika_invasion_sr"
			} else {
				rules.goto_end_event()
			}
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			let invasion = get_active_event_data(game)
			let { units, source } = get_reinforcement_units(game)
			if (!units || units.length === 0) return
			let unit = units.shift()

			if (unit === "BR VIII Corps" || unit === "ANZ ANZAC" || unit === "BR XII Corps") {
				rules.reinforce(game, unit, AP, s)
				let p = rules.find_piece(AP, unit)
				if (p >= 0 && !rules.set_has(game.reduced, p)) {
					rules.set_add(game.reduced, p)
				}
			} else {
				rules.reinforce(game, unit, AP, s)
			}

			if (units.length === 0) {
				if (source) delete source.reinf_to_place
				if (invasion && invasion.flip_lcu_if_scu) {
					game.state = "event_gallipoli_invasion_flip"
				} else if (((invasion && invasion.allow_sr_to_island) || 0) > 0) {
					game.state = "event_salonika_invasion_sr"
				} else {
					rules.goto_end_event()
				}
			}
		}
	}

	states.event_gallipoli_invasion_flip = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			res.prompt("加利波里入侵：你可以选择一个 SCU 将其翻转为 LCU 状态（如果存在的话）。")
			let pieces = rules.get_pieces_in_reserve(AP)
			let has_lcu = pieces.some((p) => rules.is_lcu(p))
			if (has_lcu) {
				// This is a placeholder for actual flip logic if needed
				res.action("done")
			} else {
				res.action("done")
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let invasion = get_active_event_data(game)
			if (invasion) delete invasion.flip_lcu_if_scu
			rules.goto_end_event()
		}
	}

	states.event_salonika_invasion_sr = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let invasion = get_active_event_data(game)
			let sr_count = (invasion && invasion.allow_sr_to_island) || 0
			res.prompt(`萨洛尼卡入侵：你可以将最多 ${sr_count} 个单位战略调整至岛屿基地。`)
			for (let p = 0; p < data.pieces.length; p++) {
				if (data.pieces[p].faction === AP && rules.is_scu(p) && game.pieces[p] > 0) {
					res.piece(p)
				}
			}
			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			let invasion = get_active_event_data(game)
			rules.push_undo()
			game.pieces[p] = LEMNOS // Example island base
			let sr_count = (invasion && invasion.allow_sr_to_island) || 0
			sr_count--
			if (invasion) invasion.allow_sr_to_island = sr_count
			if (sr_count <= 0) {
				if (invasion) delete invasion.allow_sr_to_island
				rules.goto_end_event()
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let invasion = get_active_event_data(game)
			if (invasion) delete invasion.allow_sr_to_island
			rules.goto_end_event()
		}
	}

	// === EVENT: GRAND DUKE TO TIFLIS (ID 23) ===

	states.event_grand_duke_to_tiflis_select_port = {
		prompt(ctx) {
			let { res, rules, game } = ctx
			res.prompt("大公前往第比利斯：选择一个里海港口放置增援。")
			for (let s of [BAKU, find_space("Derbent"), PETROVSK]) {
				let pieces = rules.get_pieces_in_space(game, s)
				let cap = get_capacity(game, s)
				// Need room for 2 SCUs (RU DIV #14, RU Cavalry #8) and 1 HQ (Baratov HQ, doesn't count)
				if (cap >= 2) {
					res.space(s)
				}
			}
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let event = use_event(game, "grand_duke_to_tiflis")
			rules.push_undo()
			event.event_port = s
			rules.log(`AP selects ${data.spaces[s].name} for reinforcements.`)

			rules.reinforce(game, "RU DIV #14", AP, s)
			rules.reinforce(game, "RU Cavalry #8", AP, s)
			rules.reinforce(game, "RU Baratov HQ", AP, s)

			let pieces = rules.get_pieces_in_space(game, s)
			let cp_units = pieces.filter((p) => data.pieces[p].faction === CP)

			if (cp_units.length > 0) {
				game.retreat_pieces = cp_units
				game.retreat_space = s
				game.retreat_distance = 2
				game.retreat_from = s
				game.active = CP
				game.state = "retreat"
				game.event_next_state = "event_grand_duke_to_tiflis_sr"
			} else {
				game.state = "event_grand_duke_to_tiflis_sr"
			}
		}
	}

	states.event_grand_duke_to_tiflis_sr = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "grand_duke_to_tiflis")
			res.prompt("大公前往第比利斯：可选操作，将 1 个俄国骑兵师战略调整至 " + data.spaces[event.event_port].name)
			if (get_capacity(game, event.event_port) > 0) {
				for (let p = 0; p < game.pieces.length; p++) {
					let info = data.pieces[p]
					if (info && info.faction === AP && info.name.includes("RU Cavalry") && info.piece_class === "SCU") {
						if (game.pieces[p] !== event.event_port && game.pieces[p] > 0) {
							res.piece(p)
						}
					}
				}
			}
			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			let event = use_event(game, "grand_duke_to_tiflis")
			rules.push_undo()
			game.pieces[p] = event.event_port
			rules.log(`${rules.piece_name(p)} Strategic Redeployed to ${data.spaces[event.event_port].name}`)
			game.state = "event_grand_duke_to_tiflis_place_cordons"
		},
		done(ctx) {
			let { game } = ctx
			game.state = "event_grand_duke_to_tiflis_place_cordons"
		}
	}

	states.event_grand_duke_to_tiflis_place_cordons = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "grand_duke_to_tiflis")
			if (!event.placed_ru_police) {
				res.prompt("大公前往第比利斯：将俄国/波斯北路军宪兵队放置在阿塞拜疆的空置地区。")
				for (let s = 1; s < data.spaces.length; s++) {
					if (rules.is_azerbaijan(s) && rules.get_pieces_in_space(game, s).length === 0) {
						res.space(s)
					}
				}
			} else {
				let count = event.br_cordons_to_place || 3
				res.prompt(`大公前往第比利斯：还需在波斯任何地区放置 ${count} 个英国波斯警戒线。`)
				for (let s = 1; s < data.spaces.length; s++) {
					if (rules.is_persia(s) && get_capacity(game, s) > 0) {
						res.space(s)
					}
				}
			}
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let event = use_event(game, "grand_duke_to_tiflis")
			rules.push_undo()
			if (!event.placed_ru_police) {
				rules.reinforce(game, "RU/PE Police North", AP, s)
				event.placed_ru_police = true
				event.br_cordons_to_place = 3
			} else {
				let names = ["BR Persian Cordon #1", "BR Persian Cordon #2", "BR Persian Cordon #3"]
				let index = 3 - event.br_cordons_to_place
				rules.reinforce(game, names[index], AP, s)
				event.br_cordons_to_place--
				if (event.br_cordons_to_place === 0) {
					delete event.event_port
					delete event.placed_ru_police
					delete event.br_cordons_to_place
					delete game.event_next_state
					rules.goto_end_operations()
				}
			}
		}
	}

	// === EVENT: FRESH RECRUITS (ID 57) ===

	states.event_fresh_recruits = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let spent = game.fresh_recruits_spent || 0
			let remaining = 2 - spent
			res.prompt(`新兵征募: 剩余 ${remaining} 土耳其补员点数`)

			if (remaining > 0) {
				for (let p = 0; p < data.pieces.length; p++) {
					let info = data.pieces[p]
					if (info.faction !== CP) continue
					if (info.nation !== "tu" && info.nation !== "tua") continue
					if (info.badge === "dot") continue
					if (info.notreplaceable) continue
					if (rules.any_capital_occupied_or_besieged(game, info.nation)) continue

					let cost = rules.get_replacement_cost(game, p)
					if (cost > 0 && cost <= remaining && rules.can_afford_replacement(game, p, cost)) {
						if (rules.is_eliminated(game, p)) {
							if (info.badge === "triangle") continue
							let valid_spaces = rules.get_valid_rebuild_spaces(game, p, CP)
							if (valid_spaces.length > 0) {
								res.piece(p)
							}
						} else if (rules.set_has(game.reduced, p)) {
							let s = game.pieces[p]
							if (s === RESERVE || rules.is_in_supply(game, s, CP, p)) {
								res.piece(p)
							}
						}
					}
				}
			}

			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			let cost = rules.get_replacement_cost(game, p)
			rules.spend_replacement_points(game, p, cost)
			if (!game.fresh_recruits_spent) game.fresh_recruits_spent = 0
			game.fresh_recruits_spent += cost

			if (rules.is_eliminated(game, p)) {
				game.state = "event_fresh_recruits_rebuild"
				game.rebuild_piece = p
			} else {
				rules.set_delete(game.reduced, p)
				rules.log(`${rules.piece_name(p)} (${rules.space_name(game.pieces[p])}) 补员至满员状态。`)
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let leftover = 2 - (game.fresh_recruits_spent || 0)
			if (leftover > 0) {
				game.rp_cp.tu -= leftover
			}
			delete game.fresh_recruits_spent
			delete game.fresh_recruits_pieces
			rules.goto_end_action()
		}
	}

	states.event_fresh_recruits_rebuild = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let p = game.rebuild_piece
			res.who(p)
			res.prompt(`重建 ${rules.piece_name(p)}: 选择一个有效的空格。`)
			let spaces = rules.get_valid_rebuild_spaces(game, p, CP)
			for (let s of spaces) {
				res.space(s)
			}
			res.action("cancel")
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let p = game.rebuild_piece
			game.pieces[p] = s
			rules.log(`${rules.piece_name(p)} 在 ${rules.space_name(s)} 重建。`)
			game.rebuild_piece = null
			game.state = "event_fresh_recruits"
		},
		cancel(ctx) {
			let { rules } = ctx
			rules.pop_undo()
		}
	}

	// === EVENT: RESERVES TO THE FRONT (ID 59) ===

	states.event_reserves_to_front = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let spent = game.reserves_to_front_spent || 0
			let remaining = 2 - spent
			res.prompt(`前线预备役: 剩余 ${remaining} 土耳其补员点数`)

			if (remaining > 0) {
				for (let p of game.reserves_to_front_pieces || []) {
					let cost = Engine.combat_cards.get_reserves_to_front_piece_cost(game, p)
					if (cost > 0 && cost <= remaining) {
						res.piece(p)
					}
				}
			}

			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			if (!Array.isArray(game.reserves_to_front_pieces) || !game.reserves_to_front_pieces.includes(p)) return
			let spent = game.reserves_to_front_spent || 0
			let remaining = 2 - spent
			if (remaining <= 0) return
			let cost = Engine.combat_cards.get_reserves_to_front_piece_cost(game, p)
			if (cost <= 0 || cost > remaining) return
			let is_elim_or_removed_exception =
				rules.is_eliminated(game, p) || Engine.combat_cards.is_reserves_to_front_removed_exception(game, p)
			// 战斗后原地重建依赖当前战斗地块，缺失上下文时直接拒绝本次操作
			if (is_elim_or_removed_exception && (!game.attack || !game.attack.space)) return

			rules.push_undo()
			rules.spend_replacement_points(game, p, cost)
			if (!game.reserves_to_front_spent) game.reserves_to_front_spent = 0
			game.reserves_to_front_spent += cost

			if (game.attack && game.attack.attacker === CP) {
				if (!game.reserves_to_front_effected_pieces) game.reserves_to_front_effected_pieces = []
				rules.set_add(game.reserves_to_front_effected_pieces, p)
			}

			if (is_elim_or_removed_exception) {
				game.pieces[p] = game.attack.space
				rules.set_add(game.reduced, p)
				rules.log(`> ${rules.piece_name(p)} 在 ${rules.space_name(game.attack.space)} 重建。`)
			} else {
				rules.set_delete(game.reduced, p)
				rules.log(`> ${rules.piece_name(p)} (${rules.space_name(game.pieces[p])}) 补员至满员状态。`)
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			let leftover = 2 - (game.reserves_to_front_spent || 0)
			if (leftover > 0) {
				game.rp_cp.tu -= leftover
			}
			delete game.reserves_to_front_spent
			delete game.reserves_to_front_pieces
			game.state = "post_battle_cc_cp" // Return to CC window
		}
	}

	// === EVENT: GOEBEN (ID 62) ===

	states.event_goeben = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("戈本号：炮击巴统（Batum）。")
			res.action("bombard", "炮击")
		},
		bombard(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			let roll = rules.roll_die(6, game)
			rules.log(`GOEBEN bombardment roll: ${roll}`)
			let success = false
			if (roll % 2 !== 0) {
				// 奇数时摧毁要塞
				success = true
				if (!game.forts) game.forts = { destroyed: [], besieged: [] }
				if (!game.forts.destroyed) game.forts.destroyed = []
				// Batum
				if (!game.forts.destroyed.includes(BATUM)) {
					game.forts.destroyed.push(BATUM)
				}
				rules.log("Batum's fortress is destroyed by GOEBEN bombardment!")
			} else {
				rules.log("GOEBEN bombardment failed to destroy Batum's fortress.")
			}
			game.goeben_result = { roll, success }
			game.state = "event_goeben_result"
		}
	}

	states.event_goeben_result = {
		prompt(ctx) {
			let { game, res } = ctx
			let { roll, success } = game.goeben_result
			let msg = `掷骰：(${roll})，`
			if (success) {
				msg += "炮击成功，巴统被摧毁。"
			} else {
				msg += "炮击失败。"
			}
			res.prompt(msg)
			res.action("done", "操作完成")
		},
		done(ctx) {
			let { game, rules } = ctx
			delete game.goeben_result
			rules.goto_end_event()
		}
	}

	// === EVENT: GERMAN MILITARY ADVISERS (ID 63) ===

	states.event_german_military_advisers_trench = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event_data = use_event(game, "german_military_advisers")
			let count = event_data.trenches_to_place || 0
			res.prompt(`德国军事顾问：在安纳托利亚或加利波里放置${count}个 1 级战壕。`)

			for (let s = 1; s < data.spaces.length; s++) {
				let area = rules.get_area(s)
				if (area === "anatolia" || area === "gallipoli") {
					// 只能在尚未有战壕、同盟国控制且不是岛屿基地、滩头或潜在登陆点 (beach_for) 的空间放置
					let is_empty_trench = !rules.set_has(game.trenches, s)
					let is_controlled = rules.is_controlled_by(game, s, CP)
					let is_beachhead = rules.is_beachhead_space(game, s) || !!data.spaces[s].beach_for
					let is_valid_type = !rules.is_island_base(game, s) && !is_beachhead

					if (is_empty_trench && is_controlled && is_valid_type) {
						res.space(s)
					}
				}
			}

			res.action("done")
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let event_data = use_event(game, "german_military_advisers")
			rules.push_undo()
			rules.place_trench(game, s)
			event_data.trenches_to_place -= 1
			if (event_data.trenches_to_place <= 0) {
				rules.goto_end_event()
			}
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	// === EVENT: PERSIAN PUSH (ID 65) ===

	states.event_persian_push_place = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = use_event(game, "persian_push")
			if (!event.reinf_to_place) event.reinf_to_place = ["TU-A DIV #10"]
			if (event.reinf_to_place.length === 0) {
				res.prompt("波斯攻势：增援放置完毕。")
				res.action("done")
				return
			}
			let unit = event.reinf_to_place[0]
			res.prompt(`波斯攻势：将 ${unit} 放置在任何同盟国控制的美索不达米亚地区。`)
			let has_option = false
			for (let s = 1; s < data.spaces.length; s++) {
				if (rules.is_mesopotamia(s) && rules.is_controlled_by(game, s, CP) && get_capacity(game, s) > 0) {
					res.space(s)
					has_option = true
				}
			}
			if (!has_option) {
				res.prompt(`波斯攻势：美索不达米亚无可放置位置，将 ${unit} 放入预备军。`)
				res.space(rules.get_reserve_box(CP))
			}
		},
		done(ctx) {
			let { game } = ctx
			game.state = "event_persian_push_move"
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			let event = use_event(game, "persian_push")
			if (!event.reinf_to_place) event.reinf_to_place = ["TU-A DIV #10"]
			if (!event.reinf_to_place || event.reinf_to_place.length === 0) {
				game.state = "event_persian_push_move"
				return
			}
			rules.push_undo()
			let unit = event.reinf_to_place.shift()
			rules.reinforce(game, unit, CP, s)
			if (event.reinf_to_place.length === 0) {
				delete event.reinf_to_place
				game.state = "event_persian_push_move"
			}
		}
	}

	states.event_persian_push_move = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			res.prompt("波斯攻势：你可以立即激活高加索、阿塞拜疆或美索不达米亚的一个地块进行移动。")
			let has_option = false
			for (let s = 1; s < data.spaces.length; s++) {
				if (rules.is_caucasus(s) || rules.is_azerbaijan(s) || rules.is_mesopotamia(s)) {
					let pieces = rules.get_pieces_in_space(game, s).filter((p) => data.pieces[p].faction === CP)
					if (pieces.length > 0) {
						res.space(s)
						has_option = true
					}
				}
			}
			if (!has_option) res.action("done")
			res.action("skip")
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			game.activated = { move: [s], attack: [] }
			game.activation_cost = {}
			game.moved = []
			game.attacked = []
			game.move_from_event = true
			game.state = "choose_move_space"
		},
		skip(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

		// === EVENT: LIBERATE SUEZ (ID 67) ===

	/**
	 * 检查 67 号事件 (解放苏伊士) 的 OP 分配是否合法。
	 * 必须至少分配 2 OP 在埃及地区进行进攻激活。
	 */
	function check_liberate_suez_ops(game, log_fn) {
		if (!game.liberate_suez_op_required) return true
		let need_ops = game.liberate_suez_min_egypt_attack_ops || 2
		let used_ops = get_liberate_suez_egypt_activated_attack_ops(game)
		if (used_ops >= need_ops) return true
		if (log_fn) log_fn(`解放苏伊士：必须在埃及地区分配至少 ${need_ops} OP 进行进攻激活。当前仅分配 ${used_ops} OP。`)
		return false
	}

	function get_liberate_suez_egypt_activated_attack_ops(game) {
		let total = 0
		if (!game || !game.activated || !Array.isArray(game.activated.attack)) return total
		for (let s of game.activated.attack) {
			if (!Engine.map.is_egypt(s)) continue
			let cost = game.activation_cost && game.activation_cost[s] !== undefined ? game.activation_cost[s] : 0
			total += cost
		}
		return total
	}

	states.event_liberate_suez_check_ops = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			if (check_liberate_suez_ops(game, (msg) => res.log(msg))) {
				game.liberate_suez_egypt_attack_activation_valid = true
				// 这里需要决定下一步去哪，通常是回到正常的 OP 流程
				if (game.activated.move.length > 0) {
					game.state = "choose_move_space"
				} else {
					if (rules && rules.refresh_attack_eligibility) {
						rules.refresh_attack_eligibility()
					}
					if (game.eligible_attackers && game.eligible_attackers.length > 0) {
						game.state = "attack"
					} else {
						game.state = "end_operations"
					}
				}
			} else {
				res.prompt("解放苏伊士：OP 分配不满足要求，请重新分配。")
				res.action("re-activate")
			}
		},
		"re-activate"(ctx) {
			let { game } = ctx
			game.state = "activate_spaces"
		}
	}

	// === EVENT: TURKISH REINFORCEMENTS (ID 81) ===

	states.event_turkish_reinf_81_combine = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			const { Engine, active_faction, data } = rules
			res.prompt("土耳其增援：你可以立即进行 LCU 组合。")

			// Find all spaces where combinations are possible for CP
			let possible_spaces = []
			for (let s = 1; s < data.spaces.length; s++) {
				if (Engine.game_utils.can_combine_in_space(game, s, active_faction())) {
					possible_spaces.push(s)
				}
			}

			if (possible_spaces.length > 0) {
				for (let s of possible_spaces) {
					res.action("combine", s)
				}
			}

			res.action("done")
		},
		combine(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			game.where = s
			game.move_from_event = true
			game.event_next_state = "event_turkish_reinf_81_combine"
			game.state = "combine_lcu"
		},
		done(ctx) {
			let { game, rules } = ctx
			delete game.move_from_event
			delete game.event_next_state
			rules.goto_end_event()
		}
	}

	// === EVENT: ENVER-FALKENHAYN MEETING (ID 84) ===

	states.event_enver_falkenhayn_sr = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = get_active_event_data(game)
			let sr_points = event && typeof event.sr_points === "number" ? event.sr_points : game.sr_points || 0
			if (sr_points <= 0) {
				rules.goto_end_event()
				return
			}
			res.prompt(
				`恩维尔-法金汉会晤：使用最多 ${sr_points} 点战略调整点数将土耳其/土耳其-阿拉伯部队调整至巴尔干。`
			)
			res.action("done")
		},
		done(ctx) {
			let { game, rules } = ctx
			let event = get_active_event_data(game)
			if (event) delete event.sr_points
			delete game.sr_points
			rules.goto_end_event()
		}
	}

	// === EVENT: TURKISH REINFORCEMENTS (ID 92) ===

	states.event_turkish_reinf_92_trench = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			res.prompt("土耳其增援：在叙利亚/巴勒斯坦或西奈放置 1 个战壕。")
			for (let s = 1; s < data.spaces.length; s++) {
				if (rules.is_syria_palestine(s) || rules.is_sinai(s)) {
					// 只能在尚未有战壕、且不是岛屿基地或滩头的空间放置
					if (
						!rules.set_has(game.trenches, s) &&
						!rules.is_island_base(game, s) &&
						!rules.is_beachhead_space(game, s)
					) {
						res.space(s)
					}
				}
			}
			res.action("done")
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			rules.place_trench(game, s)
			rules.goto_end_event()
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	// === GENERAL: PLACE REINFORCEMENTS ===

	states.event_place_reinforcements = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let event = get_active_event_data(game)
			let logic_key = (event && event.reinf_logic) || "is_br"
			let helper = Engine.reinf_helpers[logic_key]

			let { units } = get_reinforcement_units(game)

			if (!units || units.length === 0) {
				rules.goto_end_event()
				return
			}

			let unit = units[0]
			let desc = helper ? helper.desc : "指定地点"
			res.prompt(`增援：将 ${unit} 放置在 ${desc}。`)

			if (helper && helper.check) {
				let enemy_faction = rules.other_faction(helper.faction)
				let enemy_spaces = []
				for (let s = 1; s < data.spaces.length; s++) {
					let pieces = rules.get_pieces_in_space(game, s)
					if (
						pieces.length > 0 &&
						data.pieces[pieces[0]] &&
						data.pieces[pieces[0]].faction === enemy_faction
					) {
						enemy_spaces.push(s)
					}
				}

				for (let s = 1; s < data.spaces.length; s++) {
					if (helper.check(game, s)) {
						// Stacking limit check (Rule 7.7.2)
						let pieces = rules.get_pieces_in_space(game, s)
						if (get_capacity(game, s) > 0) {
							res.space(s)
						} else {
							// Rule 7.7.2: if full, adjacent placement allowed
							let neighbors = rules.get_connected_spaces(game, s)
							let candidates = neighbors.filter((ns) => get_capacity(game, ns) > 0)

							if (candidates.length > 0) {
								// Priority to spaces farthest from enemy units
								let max_min_dist = -1
								let best_candidates = []

								for (let ns of candidates) {
									let min_enemy_dist = 999
									for (let es of enemy_spaces) {
										let d = Engine.map.get_distance(ns, es)
										if (d < min_enemy_dist) min_enemy_dist = d
									}

									if (min_enemy_dist > max_min_dist) {
										max_min_dist = min_enemy_dist
										best_candidates = [ns]
									} else if (min_enemy_dist === max_min_dist) {
										best_candidates.push(ns)
									}
								}

								for (let bc of best_candidates) {
									res.space(bc)
								}
							}
						}
					}
				}
			}

			let faction = helper ? helper.faction : game.active || AP
			res.space(rules.get_reserve_box(faction))
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			let event = get_active_event_data(game)

			let { units, source } = get_reinforcement_units(game)
			if (!units || units.length === 0) {
				rules.goto_end_event()
				return
			}

			let unit_name = units.shift()
			let logic_key = (event && event.reinf_logic) || "is_br"
			let helper = Engine.reinf_helpers[logic_key]
			let faction = helper ? helper.faction : game.active || AP

			rules.reinforce(game, unit_name, faction, s)

			let s_name = s === rules.get_reserve_box(faction) ? "Reserve" : data.spaces[s].name
			rules.log(`增援： ${unit_name} 放置在 ${s_name}.`)

			if (units.length === 0) {
				if (source) delete source.reinf_to_place
				if (event) delete event.reinf_logic
				rules.goto_end_event()
			}
		}
	}
	// === EVENT: BULL'S EYE DIRECTIVE (ID 58) ===

	states.event_bulls_eye_sr = {
		prompt(ctx) {
			let { game, res } = ctx
			res.prompt("靶心指令: SR 1 TU/TU-A SCU 至每个已激活的战斗地块 (选择地块)")
			res.action("done")
			for (let s of Engine.events.bulls_eye_get_sr_spaces(game)) res.space(s)
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			game.bulls_eye_target = s
			game.state = "event_bulls_eye_sr_select_unit"
		},
		done(ctx) {
			let { game, rules } = ctx
			Engine.events.bulls_eye_finish_sr(game)
			// Resume normal flow
			if (game.activated.move.length > 0) {
				game.state = "choose_move_space"
			} else {
				rules.refresh_attack_eligibility()
				if (game.eligible_attackers.length > 0) game.state = "attack"
				else rules.goto_end_operations()
			}
		}
	}

	states.event_bulls_eye_sr_select_unit = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			res.prompt(`靶心指令: 从预备格选择 TU/TU-A SCU 放置于 ${data.spaces[game.bulls_eye_target].name}`)
			res.action("cancel")

			// Find TU/TU-A SCUs in Reserve
			let reserve = rules.find_space("CP Reserve")
			let pieces = rules.get_pieces_in_space(game, reserve)
			for (let p of pieces) {
				if (rules.is_scu(p) && (data.pieces[p].nation === "tu" || data.pieces[p].nation === "tua")) {
					res.piece(p)
				}
			}
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			// Move piece to target space
			game.pieces[p] = game.bulls_eye_target
			Engine.events.bulls_eye_record_sr_space(game, game.bulls_eye_target)
			rules.log(`Bull's Eye Directive: ${data.pieces[p].name} SR to ${data.spaces[game.bulls_eye_target].name}`)

			game.bulls_eye_target = null
			game.state = "event_bulls_eye_sr"
		},
		cancel(ctx) {
			let { game } = ctx
			game.bulls_eye_target = null
			game.state = "event_bulls_eye_sr"
		}
	}

	states.event_warm_water_port = {
		prompt(ctx) {
			let { game, res } = ctx
			res.prompt("不冻港：选择一个爱琴海、东地中海或波斯湾港口作为不冻港")
			if (game.warm_water_port_options) {
				for (let s of game.warm_water_port_options) {
					res.space(s)
				}
			}
		},
		space(ctx) {
			let { game, arg: s, rules } = ctx
			rules.push_undo()
			Engine.events.apply_warm_water_port_effect(game, s)
			delete game.warm_water_port_options
			game.state = "action_round"
		}
	}

	// === NATIONAL COLLAPSE (Rules 19.3.6, 19.4.6, 19.5.6) ===

	function handle_collapse_choice_prompt(ctx, nation_name) {
		let { game, res, rules } = ctx
		if (!game.event_ctx) game.event_ctx = { data: { removed: [] }, count: 2 }
		if (!game.event_ctx.data) game.event_ctx.data = { removed: [] }
		let removed = game.event_ctx.data.removed
		let count = game.event_ctx.count || 2

		res.prompt(`${nation_name}崩溃：CP 玩家必须选择 ${count} 个奥匈师移除 (${removed.length}/${count})`)

		if (removed.length >= count) {
			res.action("confirm")
		} else {
			let options = 0
			for (let name of BULGARIAN_ENTRY_AH_DIVISIONS) {
				let p = Engine.game_utils.find_piece_by_name(CP, name)
				if (p >= 0 && !rules.set_has(removed, p)) {
					if (!rules.is_removed(game, p)) {
						res.piece(p)
						options++
					}
				}
			}
			if (options === 0) {
				res.action("confirm")
			}
		}
	}

	function handle_collapse_choice_confirm(ctx, next_state) {
		let { game, rules } = ctx
		rules.push_undo()
		let removed = game.event_ctx.data.removed
		for (let p of removed) {
			rules.eliminate_piece(p, true)
		}
		delete game.event_ctx
		game.state = next_state
		game.active = CP
	}

	states.event_serbian_collapse_choice = {
		prompt(ctx) {
			handle_collapse_choice_prompt(ctx, "塞尔维亚")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			if (!game.event_ctx.data) game.event_ctx.data = { removed: [] }
			rules.set_add(game.event_ctx.data.removed, p)
		},
		confirm(ctx) {
			handle_collapse_choice_confirm(ctx, "event_serbian_collapse_sr")
		}
	}

	states.event_romanian_collapse_choice = {
		prompt(ctx) {
			handle_collapse_choice_prompt(ctx, "罗马尼亚")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			if (!game.event_ctx.data) game.event_ctx.data = { removed: [] }
			rules.set_add(game.event_ctx.data.removed, p)
		},
		space(ctx) {
			// Dummy handler to prevent "Invalid action: space" if any spaces are highlighted
		},
		confirm(ctx) {
			handle_collapse_choice_confirm(ctx, "event_romanian_collapse_sr")
		}
	}

	function handle_collapse_sr_prompt(ctx, nation_name) {
		let { game, res, rules } = ctx
		if (!game.event_ctx) game.event_ctx = { data: { moved: [] } }
		if (!game.event_ctx.data) game.event_ctx.data = { moved: [] }
		let moved = game.event_ctx.data.moved

		res.prompt(`${nation_name}崩溃：CP 玩家可选择符合条件的单位进行战略转移 (SR)`)
		res.action("done")

		// Find units that can be SR'd
		for (let p = 0; p < data.pieces.length; p++) {
			if (Engine.collapse.can_collapse_sr_piece(game, p) && !rules.set_has(moved, p)) {
				res.piece(p)
			}
		}

		if (game.sr_piece !== undefined && game.sr_piece !== null) {
			let destinations = Engine.collapse.get_collapse_sr_destination_spaces(game)
			for (let s of destinations) {
				res.space(s)
			}
		}
	}

	function handle_collapse_sr_done(ctx) {
		let { game, rules } = ctx
		rules.push_undo()
		delete game.event_ctx
		delete game.sr_piece
		if (!Engine.collapse.handle_national_collapse(game, rules.log)) {
			rules.next_phase("war_status_phase")
		}
	}

	function prompt_voluntary_collapse_offer(ctx, nation_key, nation_name) {
		let { res } = ctx
		res.prompt(`${nation_name}符合自愿崩溃条件：AP 玩家可选择令其崩溃`)
		res.action("accept", `执行${nation_name}崩溃`)
		res.action("decline", "暂不崩溃")
	}

	function resolve_voluntary_collapse_decline(ctx, nation_key, nation_name) {
		let { game, rules } = ctx
		rules.push_undo()
		Engine.collapse.decline_voluntary_collapse(game, nation_key)
		rules.log(`${nation_name}暂不崩溃。`)
		if (!Engine.collapse.handle_national_collapse(game, rules.log)) {
			rules.next_phase("war_status_phase")
		}
	}

	states.war_status_serbian_collapse_offer = {
		prompt(ctx) {
			prompt_voluntary_collapse_offer(ctx, "serbia", "塞尔维亚")
		},
		accept(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			Engine.collapse.accept_voluntary_collapse(game, "serbia", rules.log)
		},
		decline(ctx) {
			resolve_voluntary_collapse_decline(ctx, "serbia", "塞尔维亚")
		}
	}

	states.war_status_romanian_collapse_offer = {
		prompt(ctx) {
			prompt_voluntary_collapse_offer(ctx, "romania", "罗马尼亚")
		},
		accept(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			Engine.collapse.accept_voluntary_collapse(game, "romania", rules.log)
		},
		decline(ctx) {
			resolve_voluntary_collapse_decline(ctx, "romania", "罗马尼亚")
		}
	}

	states.event_serbian_collapse_sr = {
		prompt(ctx) {
			handle_collapse_sr_prompt(ctx, "塞尔维亚")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			game.sr_piece = p
		},
		space(ctx) {
			let { game, rules, arg: s, log } = ctx
			rules.push_undo()
			let p = game.sr_piece
			let from = game.pieces[p]
			rules.move_piece(game, p, s)
			log(`塞尔维亚崩溃：${data.pieces[p].name} 从 ${data.spaces[from].name} SR 到 ${data.spaces[s].name}`)
			if (!game.event_ctx.data) game.event_ctx.data = { moved: [] }
			rules.set_add(game.event_ctx.data.moved, p)
			game.sr_piece = null
		},
		done(ctx) {
			handle_collapse_sr_done(ctx)
		}
	}

	states.event_romanian_collapse_sr = {
		prompt(ctx) {
			handle_collapse_sr_prompt(ctx, "罗马尼亚")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			game.sr_piece = p
		},
		space(ctx) {
			let { game, rules, arg: s, log } = ctx
			rules.push_undo()
			let p = game.sr_piece
			let from = game.pieces[p]
			rules.move_piece(game, p, s)
			log(`罗马尼亚崩溃：${data.pieces[p].name} 从 ${data.spaces[from].name} SR 到 ${data.spaces[s].name}`)
			if (!game.event_ctx.data) game.event_ctx.data = { moved: [] }
			rules.set_add(game.event_ctx.data.moved, p)
			game.sr_piece = null
		},
		done(ctx) {
			handle_collapse_sr_done(ctx)
		}
	}

	states.event_rupel_move_greek_units = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let data = get_active_event_data(game)
			if (!data || !data.greek_units || data.current_unit_index >= data.greek_units.length) {
				let event72 = Engine.events.get_event_by_id(72)
				if (event72 && typeof event72.advance_cp_units === "function") {
					event72.advance_cp_units(game, ctx)
				}
				rules.goto_end_event()
				return
			}

			let unit = data.greek_units[data.current_unit_index]
			res.prompt(`鲁贝尔堡的背叛：为希腊部队 ${Engine.game_utils.piece_name(unit)} 选择移动目的地`)
			res.space(131) // Lamia
			res.space(149) // Athens
		},
		space(ctx) {
			let { game, res, rules, arg: s } = ctx
			let data = get_active_event_data(game)

			if (s !== 131 && s !== 149) return

			let unit = data.greek_units[data.current_unit_index]
			rules.push_undo()
			game.pieces[unit] = s
			res.log(`鲁贝尔堡的背叛：希腊部队 ${Engine.game_utils.piece_name(unit)} 移动至 ${Engine.game_utils.space_name(s)}。`)

			data.current_unit_index++
			if (data.current_unit_index >= data.greek_units.length) {
				let event72 = Engine.events.get_event_by_id(72)
				if (event72 && typeof event72.advance_cp_units === "function") {
					event72.advance_cp_units(game, ctx)
				}
				rules.goto_end_event()
			}
		}
	}

	states.event_romania_attack = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			res.prompt("罗马尼亚：立即启动1个包含罗马尼亚部队的地区进行战斗。")
			let can_attack = false
			for (let s = 1; s < data.spaces.length; s++) {
				let pieces = rules.get_pieces_in_space(game, s)
				if (pieces.some(p => data.pieces[p] && data.pieces[p].nation === "ro" && rules.can_activate_piece_in_space_to_attack(p, s))) {
					res.space(s)
					can_attack = true
				}
			}
			if (!can_attack) res.action("done", "无法攻击")
		},
		space(ctx) {
			let { game, rules, arg: s } = ctx
			rules.push_undo()
			game.activated = { attack: [s], move: [] }
			game.activation_cost = {}
			game.attacked = []
			game.state = "choose_attack_space"
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	states.event_gorlice_tarnow_choice = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("戈尔利采-塔尔诺夫攻势：选择一项")
			res.action("vp", "+2 VP")
			res.action("remove_ru_lcu", "暂时移除一个俄国LCU")
		},
		vp(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.vp += 2
			rules.log("AP 选择了 +2 VP。")
			rules.goto_end_event()
		},
		remove_ru_lcu(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.state = "event_gorlice_tarnow_remove_lcu"
		}
	}

	states.event_gorlice_tarnow_remove_lcu = {
		prompt(ctx) {
			let { game, res } = ctx
			res.prompt("戈尔利采-塔尔诺夫攻势：选择一个地图上的俄国LCU暂时移除")
			let found = false
			for (let p = 1; p < data.pieces.length; p++) {
				if (data.pieces[p] && data.pieces[p].nation === "ru" && Engine.game_utils.is_lcu(p)) {
					if (!Engine.game_utils.is_not_on_map(game, p) && !Engine.game_utils.is_in_reserve(game, p)) {
						res.piece(p)
						found = true
					}
				}
			}
			if (!found) res.action("done", "无合法单位")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			rules.eliminate_piece(p, true)
			if (!game.delayed_reinforcements) game.delayed_reinforcements = []
			game.delayed_reinforcements.push({ turn: game.turn + 4, piece: p, space: rules.get_reserve_box(AP) })
			rules.log(`${data.pieces[p].name} 将在 ${game.turn + 4} 回合返回预备军格。`)
			rules.goto_end_event()
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	states.event_verdun_choice = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("凡尔登战役：选择一项")
			res.action("vp", "+2 VP")
			res.action("remove", "将最多4个英国/印度/澳新师（或1个集团军+1个师）移除游戏")
		},
		vp(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.vp += 2
			rules.log("AP 选择了 +2 VP。")
			rules.goto_end_event()
		},
		remove(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.state = "event_verdun_remove"
		}
	}

	states.event_verdun_remove = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let data_event = rules.get_event_data()
			let count = data_event.count || 0
			res.prompt(`凡尔登战役：选择要移除的单位 (${count}/4 SCU当量)`)
			for (let p = 1; p < data.pieces.length; p++) {
				let info = data.pieces[p]
				if (info && info.faction === AP && (info.nation === "br" || info.nation === "in" || info.nation === "anz")) {
					if (!Engine.game_utils.is_not_on_map(game, p)) {
						let badge = Engine.game_utils.get_piece_badge(p)
						if (badge !== "cavalry" && !info.name.includes("Camel") && !info.name.includes("Persian") && !info.name.includes("Garrison")) {
							let cost = Engine.game_utils.is_lcu(p) ? 3 : 1
							if (count + cost <= 4) res.piece(p)
						}
					}
				}
			}
			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			let cost = Engine.game_utils.is_lcu(p) ? 3 : 1
			let data_event = rules.get_event_data()
			data_event.count = (data_event.count || 0) + cost
			rules.eliminate_piece(p, true)
			if (data_event.count >= 4) rules.goto_end_event()
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	states.event_apis_eliminate = {
		prompt(ctx) {
			let { game, res } = ctx
			res.prompt("“蜜蜂”党骚乱：选择一个塞尔维亚集团军消灭")
			let found = false
			for (let p = 1; p < data.pieces.length; p++) {
				if (data.pieces[p] && data.pieces[p].nation === "sb" && data.pieces[p].name.includes("Army") && !Engine.game_utils.is_not_on_map(game, p) && !Engine.game_utils.is_in_reserve(game, p)) {
					res.piece(p)
					found = true
				}
			}
			if (!found) res.action("done", "无合法单位")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			rules.eliminate_piece(p, true)
			rules.goto_end_event()
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	states.event_to_help_and_save_you = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let data_event = rules.get_event_data()
			let count = data_event.count || 0
			res.prompt(`拯救保加利亚：将摧毁栏/移除栏的 AH/GE 单位以减损面放置在加利西亚 (当前已选 ${count} SCU当量, 每 3 SCU 当量 CP -1VP)。`)
			for (let p = 1; p < data.pieces.length; p++) {
				let info = data.pieces[p]
				if (info && (info.nation === "ah" || info.nation === "ge")) {
					let s = game.pieces[p]
					if (s === Engine.constants.ELIMINATED || s === Engine.constants.REMOVED || s === Engine.constants.AP_REMOVED || s === Engine.constants.AP_ELIMINATED) {
						res.piece(p)
					}
				}
			}
			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			let cost = Engine.game_utils.is_lcu(p) ? 3 : 1
			let data_event = rules.get_event_data()
			data_event.count = (data_event.count || 0) + cost
			let vps_to_deduct = Math.floor(data_event.count / 3) - Math.floor((data_event.count - cost) / 3)
			if (vps_to_deduct > 0) {
				game.vp -= vps_to_deduct
				rules.log(`拯救保加利亚：- ${vps_to_deduct} VP`)
			}
			let galicia = rules.find_space("Galicia")
			game.pieces[p] = galicia
			if (!rules.set_has(game.reduced, p)) rules.set_add(game.reduced, p)
			rules.log(`拯救保加利亚：${data.pieces[p].name} 减损面放置在 Galicia`)
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	states.event_robertson_choice = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("罗伯逊：协约国必须选择一项")
			res.action("vp", "+1 VP")
			res.action("remove", "将最多3个英国/印度/澳新师移除游戏")
		},
		vp(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.vp += 1
			rules.log("AP 选择了 +1 VP。")
			rules.goto_end_event()
		},
		remove(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.state = "event_robertson_remove"
		}
	}

	states.event_robertson_remove = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let data_event = rules.get_event_data()
			let count = data_event.count || 0
			res.prompt(`罗伯逊：选择要移除的单位 (${count}/3 SCU当量)`)
			for (let p = 1; p < data.pieces.length; p++) {
				let info = data.pieces[p]
				if (info && info.faction === AP && (info.nation === "br" || info.nation === "in" || info.nation === "anz")) {
					if (!Engine.game_utils.is_not_on_map(game, p)) {
						let badge = Engine.game_utils.get_piece_badge(p)
						if (badge !== "cavalry" && !info.name.includes("Camel") && !info.name.includes("Persian") && !info.name.includes("Garrison")) {
							let cost = Engine.game_utils.is_lcu(p) ? 3 : 1
							if (count + cost <= 3) res.piece(p)
						}
					}
				}
			}
			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			let cost = Engine.game_utils.is_lcu(p) ? 3 : 1
			let data_event = rules.get_event_data()
			data_event.count = (data_event.count || 0) + cost
			rules.eliminate_piece(p, true)
			if (data_event.count >= 3) rules.goto_end_event()
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	states.event_kaiserschlacht_choice = {
		prompt(ctx) {
			let { res } = ctx
			res.prompt("皇帝攻势：协约国必须选择一项")
			res.action("vp", "+1 VP")
			res.action("remove", "将最多3个英国/印度/澳新师移除游戏")
		},
		vp(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.vp += 1
			rules.log("AP 选择了 +1 VP。")
			rules.goto_end_event()
		},
		remove(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			game.state = "event_kaiserschlacht_remove"
		}
	}

	states.event_kaiserschlacht_remove = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let data_event = rules.get_event_data()
			let count = data_event.count || 0
			res.prompt(`皇帝攻势：选择要移除的单位 (${count}/3 SCU当量)`)
			for (let p = 1; p < data.pieces.length; p++) {
				let info = data.pieces[p]
				if (info && info.faction === AP && (info.nation === "br" || info.nation === "in" || info.nation === "anz")) {
					if (!Engine.game_utils.is_not_on_map(game, p)) {
						let badge = Engine.game_utils.get_piece_badge(p)
						if (badge !== "cavalry" && !info.name.includes("Camel") && !info.name.includes("Persian") && !info.name.includes("Garrison")) {
							let cost = Engine.game_utils.is_lcu(p) ? 3 : 1
							if (count + cost <= 3) res.piece(p)
						}
					}
				}
			}
			res.action("done")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			let cost = Engine.game_utils.is_lcu(p) ? 3 : 1
			let data_event = rules.get_event_data()
			data_event.count = (data_event.count || 0) + cost
			rules.eliminate_piece(p, true)
			if (data_event.count >= 3) rules.goto_end_event()
		},
		done(ctx) {
			let { rules } = ctx
			rules.goto_end_event()
		}
	}

	states.event_caucasian_army_reforms_eliminate = {
		prompt(ctx) {
			let { game, res, rules } = ctx
			let data_event = rules.get_event_data()
			let count = data_event.count || 0
			res.prompt(`高加索军队重组：立即消灭4个地图上/预备军格的土耳其/土耳其-阿拉伯LCU (${count}/4)`)
			let found = false
			for (let p = 1; p < data.pieces.length; p++) {
				let info = data.pieces[p]
				if (info && info.faction === CP && (info.nation === "tu" || info.nation === "tua") && Engine.game_utils.is_lcu(p)) {
					if (!Engine.game_utils.is_not_on_map(game, p) || Engine.game_utils.is_in_reserve(game, p)) {
						res.piece(p)
						found = true
					}
				}
			}
			if (!found && count < 4) res.action("done", "无足够合法单位，强制结束")
		},
		piece(ctx) {
			let { game, rules, arg: p } = ctx
			rules.push_undo()
			let data_event = rules.get_event_data()
			data_event.count = (data_event.count || 0) + 1
			rules.eliminate_piece(p, true)
			if (data_event.count >= 4) {
				rules.reinforce(game, "TU 1 Caucasian", CP)
				rules.reinforce(game, "TU 2 Caucasian", CP)
				rules.goto_end_event()
			}
		},
		done(ctx) {
			let { game, rules } = ctx
			rules.push_undo()
			let data_event = rules.get_event_data()
			if ((data_event.count || 0) >= 4 || !this.has_more(ctx)) {
				rules.reinforce(game, "TU 1 Caucasian", CP)
				rules.reinforce(game, "TU 2 Caucasian", CP)
			}
			rules.goto_end_event()
		},
		has_more(ctx) {
			let { game } = ctx
			for (let p = 1; p < data.pieces.length; p++) {
				let info = data.pieces[p]
				if (info && info.faction === CP && (info.nation === "tu" || info.nation === "tua") && Engine.game_utils.is_lcu(p)) {
					if (!Engine.game_utils.is_not_on_map(game, p) || Engine.game_utils.is_in_reserve(game, p)) return true
				}
			}
			return false
		}
	}

	return {
		states,
		get_activation_prompt,
		on_activation_done,
		check_liberate_suez_ops,
		begin_russo_british_russian_activation,
		is_russo_british_russian_activation(game) {
			return !!game.russo_british_russian_activation
		}
	}
}
