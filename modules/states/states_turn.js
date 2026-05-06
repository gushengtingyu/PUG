"use strict"

let game

exports.set_globals = function (g) {
	game = g
}

exports.register = function (states, Engine, context) {
	const { data, combat } = Engine
	const { set_has, set_add } = Engine.utils

	const {
		log,
		log_h2,
		get_pieces_in_space,
		find_space,
		other_faction,
		set_control,
		check_supply,
		eliminate_piece,
		is_tribe,
		is_eliminated,
		is_not_on_map,
		get_reserve_box,
		faction_name,
		log_h1,
		MO_NONE,
		PHASE_SEQUENCE,
		push_state,
		has_jihad_prereq,
		get_connected_spaces,
		is_controlled_by,
		is_gallipoli,
		pieces_count_as_any_nation_for_rule,
		reinforce,
		push_undo,
		roll_die,
		determine_mo_ap,
		determine_mo_cp,
		check_mo_validity,
		get_season,
		discard_all_retained_cc,
		deal_cards,
		discard_card,
		card_name,
		MO_RUSSIA,
		MO_AP_CHOICE_5,
		MO_BRITISH_NO_ATTACK,
		MO_ENVER,
		COMMITMENT_TOTAL,
		COMMITMENT_MOBILIZATION,
		COMMITMENT_LIMITED,
		AP,
		CP
	} = context

	function final_victory_from_vp(vp) {
		if (vp >= 14) return { result: CP, victory: "CP Decisive Victory" }
		if (vp >= 10) return { result: CP, victory: "CP Marginal Victory" }
		if (vp >= 7) return { result: AP, victory: "AP Marginal Victory" }
		return { result: AP, victory: "AP Decisive Victory" }
	}

	function calculate_protocol_victory_adjustments() {
		let adjustments = 0

		let oilfields = new Set(["ploesti", "baku", "mosul", "kirkuk", "ahwaz", "bahrain"])
		for (let s = 1; s < data.spaces.length; s++) {
			let name = data.spaces[s].name
			if (name && oilfields.has(name.toLowerCase())) {
				if (is_controlled_by(game, s, CP)) adjustments += 1
				else if (is_controlled_by(game, s, AP)) adjustments -= 1
			}
		}

		let suez = find_space("Suez")
		if (suez >= 0) {
			let spaces = get_connected_spaces(game, suez)
			spaces.push(suez)
			let has_turkish = spaces.some((space) => {
				let pieces = get_pieces_in_space(game, space)
				return pieces.some((p) => data.pieces[p].nation === "tu")
			})
			if (has_turkish) adjustments += 1
		}

		let has_turkish_in_india = false
		for (let s = 1; s < data.spaces.length; s++) {
			if (data.spaces[s].region === "india") {
				let pieces = get_pieces_in_space(game, s)
				if (pieces.some((p) => data.pieces[p].nation === "tu")) {
					has_turkish_in_india = true
					break
				}
			}
		}
		if (has_turkish_in_india) adjustments += 1

		let cairo = find_space("Cairo")
		if (cairo >= 0) {
			let pieces = get_pieces_in_space(game, cairo)
			if (pieces.some((p) => data.pieces[p].faction === CP)) adjustments += 1
		}

		let has_ap_on_gallipoli = false
		for (let s = 1; s < data.spaces.length; s++) {
			if (is_gallipoli(s)) {
				let pieces = get_pieces_in_space(game, s)
				if (pieces.some((p) => data.pieces[p].faction === AP)) {
					has_ap_on_gallipoli = true
					break
				}
			}
		}
		if (has_ap_on_gallipoli) adjustments -= 1

		let constantinople = find_space("CONSTANTINOPLE")
		if (constantinople < 0) constantinople = find_space("Constantinople")
		let bosphorus = find_space("The Bosphorus Forts")
		let has_ap_in_constantinople = false
		for (let s of [constantinople, bosphorus]) {
			if (s >= 0) {
				let pieces = get_pieces_in_space(game, s)
				if (pieces.some((p) => data.pieces[p].faction === AP)) {
					has_ap_in_constantinople = true
					break
				}
			}
		}
		if (has_ap_in_constantinople) adjustments -= 1

		if (game.jihad <= 3) adjustments -= 1
		if (game.jihad >= 8) adjustments += 1

		return adjustments
	}

	states.revolution_phase = {
		active: CP,
		prompt(res) {
			continue_revolution_phase()
			if (
				game.state !== "revolution_phase" &&
				states[game.state] &&
				typeof states[game.state].prompt === "function"
			) {
				states[game.state].prompt(res)
				return
			}
			res.prompt("革命阶段结算中")
		}
	}

	function start_attrition_phase() {
		game.state = "attrition_phase"
		log_h1("补给结算阶段")

		// Rule 5.1.2: If the affected area is emptied of enemy troops, the VP penalty for failure no longer applies.
		Engine.mo.update_mo_fulfillment_status(game)

		if (game.mo_ap !== MO_NONE && !game.mo_ap_fulfilled) {
			game.vp += 1
			log("AP failed Mandated Offensive: VP +1")
		}
		if (game.british_mandate_violated) {
			game.vp += 1
			log("AP violated British No Attack Mandate: VP +1")
		}

		if (game.mo_cp !== MO_NONE && !game.mo_cp_fulfilled) {
			game.vp -= 1
			log("CP failed Mandated Offensive: VP -1")
		}

		let galicia = find_space("Galicia")
		let enver_falkenhayn_active = !!game.events["enver_falkenhayn_summit_active"]
		let russian_revolution_stage = game.events["russian_revolution"] || 0
		if (enver_falkenhayn_active && russian_revolution_stage < 4 && galicia >= 0) {
			let pieces = get_pieces_in_space(game, galicia)
			for (let p of pieces) {
				let info = data.pieces[p]
				if ((info.nation === "tu" || info.nation === "tua") && info.piece_class === "LCU") {
					let roll = roll_die()
					let lf = set_has(game.reduced, p) ? info.rlf : info.lf
					log(`Galicia Attrition roll for ${info.name}: ${roll} (LF: ${lf})`)
					if (roll > lf) {
						if (set_has(game.reduced, p)) {
							log(`${info.name} hit in Galicia Attrition (Eliminated/Replaced)`)
							eliminate_piece(p, false)
						} else {
							log(`${info.name} reduced in Galicia Attrition`)
							set_add(game.reduced, p)
						}
					}
				}
			}
		}

		check_supply(game)

		if (game.oos && game.oos.length > 0) {
			let oos_units = [...game.oos]
			for (let p of oos_units) {
				log(`${data.pieces[p].name} eliminated (OOS)`)
				eliminate_piece(p, true)
			}
			game.oos = []
		}

		// Rule 14.3.3: OOS spaces change control
		if (game.oos_spaces && game.oos_spaces.length > 0) {
			for (let s of game.oos_spaces) {
				if (Engine.map.is_potential_beachhead_space(s)) continue
				// Rule 14.3.3: Does not apply to neutral spaces or intact friendly forts
				let faction = Engine.map.get_space_controller(game, s)
				if ((faction === AP || faction === CP) && !Engine.map.has_undestroyed_fort(game, s, faction)) {
					let opponent = other_faction(faction)
					log(`${data.spaces[s].name} becomes enemy-controlled due to attrition (OOS)`)
					set_control(game, s, opponent)
				}
			}
			game.oos_spaces = []
		}

		if (game.vp >= 20) {
			game.state = "game_over"
			game.result = CP
			game.victory = "CP Automatic Victory (VP 20+)"
			return
		}
		if (game.vp <= 0) {
			game.state = "game_over"
			game.result = AP
			game.victory = "AP Automatic Victory (VP 0)"
			return
		}

		next_phase("attrition_phase")
	}

	function next_phase(current) {
		let next = PHASE_SEQUENCE[current]
		if (next) start_phase(next)
	}

	function start_phase(phase) {
		if (phase === "siege_phase") {
			start_siege_phase()
			return
		}
		if (phase === "revolution_phase") {
			start_revolution_phase()
			return
		}
		if (phase === "war_status_phase") {
			start_war_status_phase()
			return
		}
		if (phase === "replacement_phase") {
			start_replacement_phase()
			return
		}
		if (phase === "draw_cards_phase") {
			start_draw_cards_phase()
			return
		}
		game.state = phase
	}

	function check_victory_conditions() {
		if (game.protocol_victory) {
			let adjusted_vp = game.vp + calculate_protocol_victory_adjustments()
			let outcome = final_victory_from_vp(adjusted_vp)
			game.state = "game_over"
			game.result = outcome.result
			game.victory = "Protocol Victory - " + outcome.victory
			return true
		}
		if (Number.isFinite(game.cp_auto_victory_marker) && game.vp >= game.cp_auto_victory_marker) {
			game.state = "game_over"
			game.result = CP
			game.victory = `CP Automatic Victory (Marker ${game.cp_auto_victory_marker})`
			return true
		}
		if (game.vp >= 20) {
			game.state = "game_over"
			game.result = CP
			game.victory = "CP Automatic Victory (VP 20+)"
			return true
		}
		if (game.vp <= 0) {
			game.state = "game_over"
			game.result = AP
			game.victory = "AP Automatic Victory (VP 0)"
			return true
		}
		return false
	}

	function start_siege_phase() {
		game.state = "siege_phase"
		log_h1("围攻阶段")
		combat.resolve_siege_phase(game, log, set_control)
		next_phase("siege_phase")
	}

	function start_revolution_phase() {
		game.state = "revolution_phase"
		log_h1("革命阶段")
		game.active = CP
		game.revolution_step = 1
		continue_revolution_phase()
	}

	function check_russian_revolution_step() {
		if (!game.events["parvus_to_berlin"]) return

		if (typeof Engine.events.sync_russian_revolution_markers === "function") {
			Engine.events.sync_russian_revolution_markers(game)
		}

		let constantinople = find_space("CONSTANTINOPLE")
		let blocked = constantinople >= 0 && Engine.map.is_russia_controlled_space(game, constantinople)
		if (!game.events["russian_revolution"]) {
			let timer =
				typeof Engine.events.get_revolution_marker_turn === "function"
					? Engine.events.get_revolution_marker_turn(game)
					: game.events["russian_revolution_timer"] || 9
			if (game.turn >= timer && game.turn >= game.god_save_the_tsar && !blocked) {
				game.ru_revolution = 1
				game.events["russian_revolution"] = 1
				log("俄国革命开始：第1阶段。")
				return
			}
			return
		}
		if (blocked) return
		if (game.events["russian_revolution"] < 4) {
			game.events["russian_revolution"] += 1
			game.ru_revolution = game.events["russian_revolution"]
			log(`俄国革命推进至阶段 ${game.events["russian_revolution"]}。`)
		}
	}

	function continue_revolution_phase() {
		if (game.revolution_step === 1) {
			let tribes_on_map = []
			for (let p = 0; p < game.pieces.length; p++) {
				if (is_tribe(p) && !is_not_on_map(game, p)) tribes_on_map.push(p)
			}

			let diff = game.jihad - tribes_on_map.length
			if (diff > 0) {
				log(`圣战等级 (${game.jihad}) 大于地图上的部落数量 (${tribes_on_map.length}): 需增加 ${diff} 个部落。`)
				game.tribes_to_place = diff
				game.revolution_step = 2
				push_state("jihad_placement")
				return
			}
			if (diff < 0) {
				let to_remove = -diff
				log(
					`圣战等级 (${game.jihad}) 小于地图上的部落数量 (${tribes_on_map.length}): 需移除 ${to_remove} 个部落。`
				)
				game.tribes_to_remove = to_remove
				game.revolution_step = 2
				push_state("jihad_removal")
				return
			}
			game.revolution_step = 2
		}

		if (game.revolution_step === 2) {
			game.revolution_step = 3
			let has_rebellion_option =
				(has_jihad_prereq("Egypt") && !game.jihad_revolt_egypt) ||
				(has_jihad_prereq("India") && !game.jihad_revolt_india) ||
				(has_jihad_prereq("Afghanistan") && !game.jihad_revolt_afghanistan) ||
				(has_jihad_prereq("Central Asia") && !game.jihad_revolt_central_asia)
			if (has_rebellion_option) {
				push_state("jihad_rebellion_check")
				return
			}
		}

		if (game.revolution_step === 3) {
			check_russian_revolution_step()
			game.revolution_step = 4
		}

		delete game.revolution_step
		next_phase("revolution_phase")
	}

	function start_turn() {
		let max_turn = game.scenario_max_turn || 20
		if (game.turn >= max_turn) {
			log(`End of Turn ${max_turn} reached. Game ends.`)
			let final = final_victory_from_vp(game.vp)
			game.state = "game_over"
			game.result = final.result
			game.victory = `End of Turn ${max_turn} - ` + final.victory
			return
		}

		game.turn++
		log_h1(`Turn ${game.turn}`)

		game.ap_actions = Array(7).fill(null)
		game.cp_actions = Array(7).fill(null)

		// Reset per-turn trackers
		game.mo_ap_fulfilled = false
		game.mo_cp_fulfilled = false
		game.mo_ap = null
		game.mo_cp = null

		// Reset Enver Variables
		game.mo_cp_1 = null
		game.mo_cp_2 = null
		game.mo_cp_1_fulfilled = false
		game.mo_cp_2_fulfilled = false

		game.mo_required_ap = false
		game.mo_required_cp = false
		game.enver_attack_count = 0
		game.british_mandate_violated = false
		delete game.br_attack_penalty_paid
		game.ge_to_tu_rp_used = 0
		game.kitchener_conversion_used = false
		game.entered_regions_this_turn = []
		game.rein_record = { ru: 0, br: 0, in_anz: 0, tu: 0 }
		
		// Handle delayed reinforcements
		if (game.delayed_reinforcements && Array.isArray(game.delayed_reinforcements)) {
			let remaining = []
			for (let r of game.delayed_reinforcements) {
				if (r.turn <= game.turn) {
					log(`Delayed Reinforcement Arrives: ${data.pieces[r.piece].name}`)
					reinforce(game, data.pieces[r.piece].name, data.pieces[r.piece].faction, r.space)

					if (
						game.events &&
						game.events["gorlice_tarnow_return"] === r.turn &&
						game.events["gorlice_tarnow_piece"] === r.piece
					) {
						delete game.events["gorlice_tarnow_return"]
						delete game.events["gorlice_tarnow_piece"]
					}
				} else {
					remaining.push(r)
				}
			}
			game.delayed_reinforcements = remaining
		}

		if (
			game.events["jerusalem_by_christmas"] &&
			typeof game.events["jerusalem_by_christmas"] === "object" &&
			game.events["jerusalem_by_christmas"].turn !== undefined &&
			game.events["jerusalem_by_christmas"].turn <= game.turn
		) {
			let event = game.events["jerusalem_by_christmas"]
			let target = event.target_space
			let occupied = false
			if (target > 0) {
				let pieces = get_pieces_in_space(game, target)
				occupied = pieces_count_as_any_nation_for_rule(game, pieces, ["br", "in", "anz"])
			}
			if (occupied) {
				game.vp -= 1
				log(`圣诞节前收复圣城结算：${data.spaces[target].name} 被英国/印度/澳新部队占据，VP -1。`)
			} else {
				game.vp += 1
				let target_name = target > 0 ? data.spaces[target].name : "目标地块"
				log(`圣诞节前收复圣城结算：${target_name} 未被英国/印度/澳新部队占据，VP +1。`)
			}
			delete game.events["jerusalem_by_christmas"]
		}

		// Rule: Churchill Prevails recurring RU RP
		if (game.events["bosphorus_destroyed"] && !game.events["german_subs"]) {
			game.rp_ap.ru += 1
			log("丘吉尔胜出持续效果：博斯普鲁斯海峡已打通，俄国补员点数 +1。")
		}

		start_mandated_offensive_phase()
	}

	function get_cp_opening_mobilization_ops4_cards() {
		if (!Array.isArray(game.deck_cp)) return []
		let candidates = game.deck_cp.filter((c) => {
			let card = data.cards[c]
			return (
				card &&
				card.faction === CP &&
				card.commitment === COMMITMENT_MOBILIZATION &&
				Number(card.ops) === 4
			)
		})
		candidates.sort((a, b) => a - b)
		return candidates
	}

	function start_mandated_offensive_phase() {
		game.state = "mandated_offensive_phase"
		log_h2("强制进攻阶段")

		game.mo_ap = MO_NONE
		game.mo_cp = MO_NONE
		game.mo_ap_fulfilled = true
		game.mo_cp_fulfilled = true

		if (game.turn === 1) {
			log("第一回合：无MO掷骰")
			log("AP：俄罗斯")
			log("CP：俄罗斯")
			game.mo_ap = MO_RUSSIA
			game.mo_cp = MO_RUSSIA
			game.mo_ap_fulfilled = false
			game.mo_cp_fulfilled = false
			game.active = CP
			game.player_order = [AP, CP]
			if (!game.cp_opening_mobilization_pick_done) {
				game.state = "cp_opening_mobilization_pick"
			} else {
				game.state = "acknowledge_mo_results"
			}
			return
		}

		let ap_roll = roll_die()
		if (game.mo_ap_modifier) {
			log(`AP MO Modifier: ${game.mo_ap_modifier}`)
			ap_roll += game.mo_ap_modifier
		}
		let cp_roll = roll_die()
		if (game.mo_cp_cancelled) {
			log("CP: 无")
			game.mo_cp = MO_NONE
			game.mo_cp_fulfilled = true
		} else {
			log(`MO 掷骰: AP ${ap_roll}, CP ${cp_roll}`)
			let mo_ap = determine_mo_ap(ap_roll)
			let mo_cp = determine_mo_cp(cp_roll)

			// Rule 5.1.2: Validity check (None or Reroll)
			let status_ap = check_mo_validity(game, AP, mo_ap)
			while (status_ap === "REROLL") {
				ap_roll = roll_die()
				if (game.mo_ap_modifier) ap_roll += game.mo_ap_modifier
				mo_ap = determine_mo_ap(ap_roll)
				status_ap = check_mo_validity(game, AP, mo_ap)
				log(`AP 掷骰: ${ap_roll} -> ${mo_ap}`)
			}
			if (status_ap === "NONE") {
				log(`AP ${mo_ap} nation not on map: None`)
				mo_ap = MO_NONE
			}

			let status_cp = check_mo_validity(game, CP, mo_cp)
			while (status_cp === "REROLL") {
				cp_roll = roll_die()
				mo_cp = determine_mo_cp(cp_roll)
				status_cp = check_mo_validity(game, CP, mo_cp)
				log(`CP MO Area empty, rerolling: ${cp_roll} -> ${mo_cp}`)
			}
			if (status_cp === "NONE") {
				log(`CP MO ${mo_cp} nation not on map: None`)
				mo_cp = MO_NONE
			}

			game.mo_ap = mo_ap
			game.mo_cp = mo_cp
		}

		if (game.mo_ap === MO_RUSSIA && game.events["russian_revolution"]) {
			log("AP: 俄国革命开始后视为“无”")
			game.mo_ap = MO_NONE
		}
		if (game.mo_cp === MO_RUSSIA && game.events["russian_revolution"] >= 4) {
			log("CP: 俄国革命阶段4后视为“无”")
			game.mo_cp = MO_NONE
		}

		if (game.mo_ap !== MO_NONE) {
			if (game.mo_ap === MO_AP_CHOICE_5) {
				log("AP: Choice needed")
			} else {
				log(`AP: ${game.mo_ap}`)
			}
			game.mo_ap_fulfilled = game.mo_ap === MO_BRITISH_NO_ATTACK
		} else {
			log(`AP: None`)
			game.mo_ap_fulfilled = true
		}

		if (game.mo_cp !== MO_NONE) {
			log(`CP: ${game.mo_cp}`)
			game.mo_cp_fulfilled = false
		} else {
			log(`CP: None`)
			game.mo_cp_fulfilled = true
		}
		// Handle Enver (CP Roll 6)
		if (game.mo_cp === MO_ENVER) {
			game.active = AP
			game.state = "mo_enver_choose_1"
			log("MO CP: Enver - AP chooses first mandate")
			return
		}

		// Check for Choices
		if (game.mo_ap === MO_AP_CHOICE_5) {
			game.active = AP
			game.state = "mo_choice_ap"
			return
		}

		game.active = AP
		game.state = "acknowledge_mo_results"
	}

	states.cp_opening_mobilization_pick = {
		prompt(res) {
			let candidates = get_cp_opening_mobilization_ops4_cards()
			if (candidates.length === 0) {
				log("开局同盟国未找到可选的动员阶段4点牌，跳过选牌。")
				deal_cards(CP)
				game.cp_opening_mobilization_pick_done = true
				game.active = AP
				game.state = "acknowledge_mo_results"
				states.acknowledge_mo_results.prompt(res)
				return
			}
			res.prompt("同盟国自选一张动员阶段4点牌加入手牌。")
			res.hand(candidates)
			for (let c of candidates) {
				res.action("card", c)
			}
		},
		card(c) {
			c = Number(c)
			if (!Number.isInteger(c)) return
			let candidates = get_cp_opening_mobilization_ops4_cards()
			if (!candidates.includes(c)) return
			push_undo()
			let idx = game.deck_cp.indexOf(c)
			if (idx >= 0) game.deck_cp.splice(idx, 1)
			game.hand_cp.push(c)
			deal_cards(CP)
			game.cp_opening_mobilization_pick_done = true
			log(`同盟国自选牌: ${card_name(c)}`)
			game.active = AP
			game.state = "acknowledge_mo_results"
		}
	}

	function start_war_status_phase() {
		game.state = "war_status_phase"
		log_h1("战争状态阶段")

		let galicia = find_space("Galicia")
		let enver_falkenhayn_active = !!game.events["enver_falkenhayn_summit_active"]
		let russian_revolution_stage = game.events["russian_revolution"] || 0
		if (enver_falkenhayn_active && russian_revolution_stage < 4 && get_season(game) === "Summer" && galicia >= 0) {
			let has_turkish_lcu_in_galicia = get_pieces_in_space(game, galicia).some((p) => {
				let info = data.pieces[p]
				return info && (info.nation === "tu" || info.nation === "tua") && info.piece_class === "LCU"
			})
			if (has_turkish_lcu_in_galicia) {
				game.vp += 1
				log("Enver-Falkenhayn Summit: Turkish LCU in Galicia grants VP +1.")
			}
		}

		if (game.blockade_vp_penalty_active && get_season(game) === "Winter") {
			let total_war_cp = game.war_commitment_cp === COMMITMENT_TOTAL
			let railway_complete = !!game.events["berlin_constantinople_railway"] || !!game.events["berlin_baghdad"]

			if (total_war_cp && railway_complete) {
				game.blockade_vp_penalty_active = false
				log(
					"柏林-君士坦丁堡铁路建成且同盟国进入全面战争状态: 皇家海军封锁效果被取消。"
				)
			} else {
				game.vp -= 1
				log("皇家海军封锁: -1 VP.")
			}
		}

		if (game.turn === 1) {
			log("第一回合：跳过战争状态阶段")
			next_phase("war_status_phase")
			return
		}

		if (get_season(game) === "Winter" && game.events["british_war_weariness"]) {
			if (Engine.events && typeof Engine.events.shift_cp_auto_victory_marker === "function") {
				Engine.events.shift_cp_auto_victory_marker(game, -1, { log }, "英国厌战冬季结算")
			}
		}

		if (check_victory_conditions()) return

		if (game.armistice_turn && game.turn >= game.armistice_turn) {
			log(`Armistice turn ${game.armistice_turn} reached. Game ends.`)
			let final = final_victory_from_vp(game.vp)
			game.state = "game_over"
			game.result = final.result
			game.victory = "Armistice - " + final.victory
			return
		}

		check_war_commitment_increase()

		if (game.turn >= 20) {
			let final = final_victory_from_vp(game.vp)
			game.state = "game_over"
			game.result = final.result
			game.victory = "Armistice - " + final.victory
			return
		}

		if (Engine.collapse.handle_national_collapse(game, log)) return

		next_phase("war_status_phase")
	}

	function check_war_commitment_increase() {
		if (game.turn < 2) return

		// AP
		if (game.war_commitment_ap === COMMITMENT_MOBILIZATION && game.war_status_ap >= 4) {
			game.war_commitment_ap = COMMITMENT_LIMITED
			log("协约国进入有限战争")
			add_commitment_cards(AP, COMMITMENT_LIMITED)
		} else if (game.war_commitment_ap === COMMITMENT_LIMITED && game.war_status_ap >= 11) {
			game.war_commitment_ap = COMMITMENT_TOTAL
			log("协约国进入全面战争")
			add_commitment_cards(AP, COMMITMENT_TOTAL)
		}

		// CP
		if (game.war_commitment_cp === COMMITMENT_MOBILIZATION && game.war_status_cp >= 4) {
			game.war_commitment_cp = COMMITMENT_LIMITED
			log("同盟国进入有限战争")
			add_commitment_cards(CP, COMMITMENT_LIMITED)
		} else if (game.war_commitment_cp === COMMITMENT_LIMITED && game.war_status_cp >= 11) {
			game.war_commitment_cp = COMMITMENT_TOTAL
			log("同盟国进入全面战争")
			add_commitment_cards(CP, COMMITMENT_TOTAL)
		}
	}

	function add_commitment_cards(faction, commitment) {
		let deck = faction === AP ? game.deck_ap : game.deck_cp
		let cards_added = 0
		for (let i = 1; i < data.cards.length; i++) {
			if (data.cards[i].faction === faction && data.cards[i].commitment === commitment) {
				deck.push(i)
				cards_added++
			}
		}
		if (cards_added > 0) {
			let key = faction === AP ? "ap" : "cp"
			if (!game.pending_commitment_shuffle) game.pending_commitment_shuffle = { ap: false, cp: false }
			game.pending_commitment_shuffle[key] = true
			log(`${faction_name(faction)} adds ${commitment.toUpperCase()} cards.`)
		}
	}

	function start_replacement_phase() {
		log_h1("补员阶段")

		let deficit = Engine.events.apply_turkish_war_weariness_rp(game, log)
		if (deficit > 0) {
			game.tu_war_weariness_deficit = deficit
			game.active = CP
			game.state = "turkish_war_weariness_penalty"
			return
		}

		enter_replacement_rp_phase()
	}

	function enter_replacement_rp_phase() {
		game.kitchener_conversion_used = false
		game.br_to_ru_rp_used = false

		if (game.events["central_asia_rebellion"]) game.rp_rebel.ca += 1
		if (game.events["afghan_alliance"]) game.rp_rebel.af += 1
		if (game.events["egyptian_rebellion"]) game.rp_rebel.eg += 1
		if (game.events["indian_rebellion"]) game.rp_rebel.in += 1

		if (game.events["lloyd_george_takes_command"]) {
			game.rp_ap.br += 1
			log("劳合乔治接管指挥权：AP 额外获得 1 BR RP。")
		}

		if (game.events["robertson"]) {
			game.rp_ap.br = Math.max(0, game.rp_ap.br - 1)
			log("罗伯逊：AP 减少 1 BR RP。")
		}

		goto_replacement_faction(AP)
	}

	function get_tu_war_weariness_candidates() {
		let candidates = []
		for (let p = 0; p < game.pieces.length; p++) {
			let info = data.pieces[p]
			if (!info) continue
			if (info.faction !== CP) continue
			if (info.nation !== "tu" && info.nation !== "tua") continue
			if (is_eliminated(game, p)) continue
			if (Engine.game_utils.is_removed(game, p)) continue
			if (Engine.game_utils.is_reinforcement(game, p)) continue
			let cost = set_has(game.reduced, p) ? (info.piece_class === "LCU" ? 2 : 1) : info.piece_class === "LCU" ? 1 : 0.5
			if (cost > 0) candidates.push({ p, cost })
		}
		return candidates
	}

	function finish_tu_war_weariness_penalty() {
		delete game.tu_war_weariness_deficit
		enter_replacement_rp_phase()
	}

	function clear_replacement_points_for_active_faction() {
		let rps = game.active === AP ? game.rp_ap : game.rp_cp
		if (game.active === CP && game.events["royal_navy_blockade"]) {
			let unused_tu_rp = Number(rps.tu || 0)
			if (unused_tu_rp > 0) {
				let max_tu_rp = Math.max(0, Number(game.tu_rp_limit ?? 25))
				let recoverable_room = Math.max(0, 25 - max_tu_rp)
				let recovered_tu_rp = Math.min(recoverable_room, unused_tu_rp)
				if (recovered_tu_rp > 0) {
					game.tu_rp_limit = max_tu_rp + recovered_tu_rp
					if (game && Array.isArray(game.log)) {
						log(`皇家海军封锁：未使用土耳其 RP ${unused_tu_rp}，最大补给限度回升至 ${game.tu_rp_limit}。`)
					}
				}
			}
		}
		for (let key of Object.keys(rps)) {
			rps[key] = 0
		}
	}

	function has_replacement_points(faction) {
		let rps = faction === AP ? game.rp_ap : game.rp_cp
		if (faction === CP) {
			let has_rebel_rp = Object.values(game.rp_rebel || {}).some(v => v > 0)
			if (has_rebel_rp) return true
		}
		return Object.values(rps).some((value) => value > 0)
	}

	function get_rebuild_spaces(p) {
		let info = data.pieces[p]
		let spaces = new Set()
		if (!info) return spaces

		if (is_eliminated(game, p)) {
			for (let s of Engine.replacement.get_valid_rebuild_spaces(game, p, info.faction)) {
				spaces.add(s)
			}
			if (Engine.replacement.can_rebuild_in_reserve_box(p)) {
				spaces.add(get_reserve_box(info.faction))
			}
		} else {
			let s = game.pieces[p]
			if (s > 0 && s < data.spaces.length) {
				spaces.add(s)
			}
		}
		return spaces
	}

	function is_piece_replaceable_in_rp_phase(p, faction = game.active) {
		if (!data.pieces[p] || data.pieces[p].faction !== faction) return false
		let cost = Engine.replacement.get_replacement_cost(game, p)
		if (cost <= 0) return false
		if (is_eliminated(game, p)) {
			if (get_rebuild_spaces(p).size === 0) return false
		} else if (!set_has(game.reduced, p)) {
			return false
		}
		return Engine.replacement.can_afford_replacement(game, p, cost)
	}

	function has_valid_replacements(faction) {
		for (let p = 0; p < game.pieces.length; p++) {
			if (is_piece_replaceable_in_rp_phase(p, faction)) return true
		}
		return false
	}

	function finish_replacement_phase() {
		for (let key of Object.keys(game.rp_rebel || {})) {
			game.rp_rebel[key] = 0
		}
		next_phase("replacement_phase")
	}

	function goto_replacement_faction(faction) {
		if (faction === AP) {
			if (has_replacement_points(AP) && has_valid_replacements(AP)) {
				game.active = AP
				game.state = "rp_phase"
				return
			}
			game.active = AP
			clear_replacement_points_for_active_faction()
			goto_replacement_faction(CP)
			return
		}

		if (has_replacement_points(CP) && has_valid_replacements(CP)) {
			game.active = CP
			game.state = "rp_phase"
			return
		}

		game.active = CP
		clear_replacement_points_for_active_faction()
		finish_replacement_phase()
	}

	states.turkish_war_weariness_penalty = {
		prompt(res) {
			let remaining = Number(game.tu_war_weariness_deficit || 0)
			if (remaining <= 0) {
				finish_tu_war_weariness_penalty()
				states.rp_phase.prompt(res)
				return
			}

			let candidates = get_tu_war_weariness_candidates()
			res.prompt(`土耳其战争疲劳：同盟国需降编 ${remaining} RP`)
			for (let c of candidates) res.piece(c.p)
			if (candidates.length === 0) {
				res.prompt("无可降编土耳其单位，点击 done 继续补员阶段。")
			}
			res.action("done")
		},
		piece(p) {
			p = Number(p)
			if (!Number.isInteger(p)) return
			let remaining = Number(game.tu_war_weariness_deficit || 0)
			if (remaining <= 0) {
				finish_tu_war_weariness_penalty()
				return
			}
			let candidate = get_tu_war_weariness_candidates().find((x) => x.p === p)
			if (!candidate) return

			push_undo()
			let info = data.pieces[p]
			if (set_has(game.reduced, p)) {
				log(`${faction_name(CP)} 因土耳其战争疲劳移除 ${info.name}`)
				game.pieces[p] = Engine.game_utils.get_eliminated_box(info.faction)
				Engine.utils.set_delete(game.reduced, p)
			} else {
				log(`${faction_name(CP)} 因土耳其战争疲劳将 ${info.name} 降为残编`)
				set_add(game.reduced, p)
			}
			game.tu_war_weariness_deficit = Number((remaining - candidate.cost).toFixed(2))
			if (game.tu_war_weariness_deficit <= 0) {
				finish_tu_war_weariness_penalty()
			}
		},
		done() {
			let remaining = Number(game.tu_war_weariness_deficit || 0)
			if (remaining > 0 && get_tu_war_weariness_candidates().length > 0) return
			finish_tu_war_weariness_penalty()
		}
	}

	function start_draw_cards_phase() {
		log_h1("抽牌阶段")

		// Reset markers for next turn
		game.mo_ap = MO_NONE
		game.mo_cp = MO_NONE

		discard_all_retained_cc()
		delete game.combat_cards
		goto_ap_draw_cards_phase()
	}

	function goto_ap_draw_cards_phase() {
		if (game.hand_ap && game.hand_ap.length > 0) {
			game.state = "draw_cards_phase"
			game.active = AP
			game.discarded_ccs = []
		} else {
			deal_cards(AP)
			goto_cp_draw_cards_phase()
		}
	}

	function goto_cp_draw_cards_phase() {
		if (game.hand_cp && game.hand_cp.length > 0) {
			game.state = "draw_cards_phase"
			game.active = CP
			game.discarded_ccs = []
		} else {
			deal_cards(CP)
			start_turn()
		}
	}

	function can_discard_during_draw_phase(c) {
		let card = data.cards[c]
		if (!card) return false
		return !!card.cc;
	}

	states.draw_cards_phase = {
		prompt(res) {
			let hand = game.active === AP ? game.hand_ap : game.hand_cp
			res.prompt(`${faction_name(game.active)} 抽牌阶段: 弃置任意战斗牌。`)
			for (let c of hand) {
				if (can_discard_during_draw_phase(c)) {
					res.action("card", c)
				}
			}
			res.action("done")
		},
		card(c) {
			push_undo()
			discard_card(c)
			if (!Array.isArray(game.discarded_ccs)) game.discarded_ccs = []
			game.discarded_ccs.push(c)
		},
		discard(c) {
			this.card(c)
		},
		done() {
			if (!Array.isArray(game.discarded_ccs)) game.discarded_ccs = []
			if (game.discarded_ccs.length > 0) {
				log(`${faction_name(game.active)} 弃掉手牌:`)
				for (let c of game.discarded_ccs) {
					log(card_name(c))
				}
			}
			deal_cards(game.active)
			if (game.active === AP) {
				goto_cp_draw_cards_phase()
			} else {
				start_turn()
			}
		}
	}

	states.rp_phase = {
		prompt(res) {
			let faction = game.active === AP ? "AP" : "CP"
			let rps = game.active === AP ? game.rp_ap : game.rp_cp
			let rp_str = Object.entries(rps)
				.filter(([, v]) => v > 0)
				.map(([k, v]) => `${k.toUpperCase()}:${v}`)
				.join(", ")

			if (game.active === CP) {
				let rebel_str = Object.entries(game.rp_rebel || {})
					.filter(([, v]) => v > 0)
					.map(([k, v]) => `${k.toUpperCase()}(Rebel):${v}`)
					.join(", ")
				if (rebel_str) {
					rp_str = rp_str ? `${rp_str}, ${rebel_str}` : rebel_str
				}
			}

			res.prompt(`${faction} 补员阶段: ${rp_str || "无可用RP"}`)

			for (let p = 0; p < game.pieces.length; p++) {
				if (is_piece_replaceable_in_rp_phase(p)) res.piece(p)
			}
			res.action("done")
		},
		piece(p) {
			p = Number(p)
			if (!Number.isInteger(p)) return
			let info = data.pieces[p]
			if (!info || info.faction !== game.active) return
			if (!is_piece_replaceable_in_rp_phase(p)) return
			let cost = Engine.replacement.get_replacement_cost(game, p)
			push_undo()
			Engine.replacement.spend_replacement_points(game, p, cost)
			if (is_eliminated(game, p)) {
				log(`${faction_name(game.active)} 残血重建 ${info.name}`)
				game.rebuild_piece = p
				game.state = "rp_rebuild_where"
			} else {
				log(`${faction_name(game.active)} 补足 ${info.name}`)
				Engine.utils.set_delete(game.reduced, p)
			}
		},
		done() {
			clear_replacement_points_for_active_faction()
			if (game.active === AP) {
				goto_replacement_faction(CP)
			} else {
				finish_replacement_phase()
			}
		}
	}

	states.rp_rebuild_where = {
		prompt(res) {
			let p = game.rebuild_piece
			if (!Number.isInteger(p) || !data.pieces[p]) {
				game.state = "rp_phase"
				return
			}
			res.who(p)
			res.prompt(`选择 ${data.pieces[p].name} 的重建位置`)
			for (let s of get_rebuild_spaces(p)) res.space(s)
		},
		piece() {},
		space(s) {
			s = Number(s)
			if (!Number.isInteger(s)) return
			let p = game.rebuild_piece
			if (!Number.isInteger(p) || !data.pieces[p]) {
				game.state = "rp_phase"
				return
			}
			let spaces = get_rebuild_spaces(p)
			if (!spaces.has(s)) return
			game.pieces[p] = s
			set_add(game.reduced, p)
			delete game.rebuild_piece
			game.state = "rp_phase"
		},
	}

	return {
		start_attrition_phase,
		next_phase,
		start_phase,
		check_victory_conditions,
		start_siege_phase,
		start_revolution_phase,
		check_russian_revolution_step,
		continue_revolution_phase,
		start_turn,
		start_war_status_phase,
		start_replacement_phase,
		start_draw_cards_phase,
		final_victory_from_vp,
		calculate_protocol_victory_adjustments
	}
}
