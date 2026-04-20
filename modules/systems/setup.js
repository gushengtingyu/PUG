"use strict"

module.exports = function (Engine) {
	const { data } = Engine
	const exports = {}

	const { set_add } = Engine.utils
	const { find_space, find_piece } = Engine.game_utils
	const { COMMITMENT_LIMITED, REMOVED } = Engine.constants
	const CYPRUS_BEACHHEAD_NAMES = ["To Adana", "To Beirut", "To Haifa", "To Jaffa"]
	const piece_lookup = new Map()
	const space_lookup = new Map()

	for (let p = 0; p < data.pieces.length; p++) {
		const piece = data.pieces[p]
		if (!piece) continue
		piece_lookup.set(`${piece.faction}:${piece.name}`, p)
	}

	for (let s = 1; s < data.spaces.length; s++) {
		const space = data.spaces[s]
		if (!space || space.name === undefined || space_lookup.has(space.name)) continue
		space_lookup.set(space.name, s)
	}

	function get_space_id(name) {
		if (space_lookup.has(name)) return space_lookup.get(name)
		return find_space(name)
	}

	function get_piece_id(faction, name) {
		const key = `${faction}:${name}`
		if (piece_lookup.has(key)) return piece_lookup.get(key)
		return find_piece(faction, name)
	}

	const CYPRUS = get_space_id("Cyprus")
	const CYPRUS_BEACHHEADS = CYPRUS_BEACHHEAD_NAMES.map(get_space_id)
	const AFGHANISTAN = get_space_id("Afghanistan")

	function place_piece(game, faction, name, space_name, reduced = false) {
		let p = get_piece_id(faction, name)
		let s = get_space_id(space_name)

		if (p < 0 && s >= 0) {
			const slot = data.spaces[s]
			if (slot && slot.type === "reinforcement" && slot.name === name) return
		}

		if (p >= 0 && s >= 0) {
			game.pieces[p] = s
			// Use CSV coordinates if this is a reinforcement slot
			const slot = data.spaces[s]
			if (slot && slot.type === "reinforcement") {
				if (slot.x !== undefined && slot.y !== undefined) {
					game.piece_x[p] = slot.x
					game.piece_y[p] = slot.y
				}
			}
			if (reduced) {
				set_add(game.reduced, p)
			}
		} else {
			if (p < 0) console.log("Could not find piece:", faction, name)
			if (s < 0) console.log("Could not find space:", space_name)
		}
	}

	function preplace_balkan_entry_displays(game) {
		if (!Engine.collapse || typeof Engine.collapse.get_bulgaria_entry_plan !== "function") return

		let bulgaria = Engine.collapse.get_bulgaria_entry_plan()
		for (let entry of bulgaria.cp.placements) {
			place_piece(game, "cp", entry.name, entry.space, false)
		}
		for (let entry of bulgaria.ap.placements) {
			place_piece(game, "ap", entry.name, entry.space, false)
		}
	}

	function place_trench(game, level, space_name) {
		let s = get_space_id(space_name)
		if (s >= 0) {
			if (level === 2) {
				set_add(game.trenches_2, s)
			} else {
				set_add(game.trenches, s)
			}
		} else {
			console.log("Could not find space for trench:", space_name)
		}
	}

	function place_beachhead(game, space_name) {
		let s = get_space_id(space_name)
		if (s >= 0) {
			set_add(game.beachheads, s)
		} else {
			console.log("Could not find space for beachhead:", space_name)
		}
	}

	function setup_historical_scenario(game) {
		game.scenario_max_turn = 17

		game.ui_tokens = {}
		game.ui_tokens["Cyprus Allowed"] = "MCYPNT.png"
		Engine.set_control(game, CYPRUS, "neutral")
		for (let s of CYPRUS_BEACHHEADS) Engine.set_control(game, s, "neutral")
		Engine.set_control(game, AFGHANISTAN, "neutral")
		game.ui_tokens["Persian_Neutrality"] = "MPERNEUT.PNG"
		game.ui_tokens["C.Asia_Revolt"] = "MNCASRV.png"
		game.ui_tokens["Afghan_Alliance"] = "MNAFGAL.PNG"
		game.ui_tokens["Indian_Mutiny"] = "MNINMUT.png"
		game.ui_tokens["GE RPs TO TU"] = "MGESPTU.png"
		game.ui_tokens["Egypt Uprising"] = "MEGRBA.PNG"
		game.ui_tokens["RU Amphib Assault Allowed"] = "MRUAMPH.PNG"

		// Central Powers
		place_piece(game, "cp", "TU I Corps", "CONSTANTINOPLE", false)
		place_piece(game, "cp", "TU II Corps", "Adrianople", true)
		place_piece(game, "cp", "TU III Corps", "CP Corps Assets", false)
		place_piece(game, "cp", "TU IV Corps", "CP Corps Assets", false)
		place_piece(game, "cp", "TU V Corps", "CP Corps Assets", false)
		place_piece(game, "cp", "TU IX Corps", "Koprukoy", false)
		place_piece(game, "cp", "TU X Corps", "Sivas", true)
		place_piece(game, "cp", "TU XI Corps", "Erzurum", true)
		place_piece(game, "cp", "TU-A VI Corps", "Rodosto", true)
		place_piece(game, "cp", "TU-A VIII Corps", "CP Corps Assets", false)
		place_piece(game, "cp", "TU-A XII Corps", "CP Corps Assets", false)
		place_piece(game, "cp", "TU-A XIII Corps", "CP Corps Assets", false)

		place_piece(game, "cp", "TU DIV #1", "CONSTANTINOPLE", false)
		place_piece(game, "cp", "TU DIV #2", "CONSTANTINOPLE", false)
		place_piece(game, "cp", "TU DIV #3", "Bandirma", false)
		place_piece(game, "cp", "TU DIV #4", "Smyrna", false)
		place_piece(game, "cp", "TU DIV #5", "Ankara", false)
		place_piece(game, "cp", "TU DIV #6", "Kastamonu", false)
		place_piece(game, "cp", "TU DIV #7", "Yozgat", false)
		place_piece(game, "cp", "TU DIV #8", "Bayburt", false)
		place_piece(game, "cp", "TU DIV #9", "Ruwandiz", true)
		place_piece(game, "cp", "TU DIV #10", "CP Reserve", false)
		place_piece(game, "cp", "TU DIV #11", "CP Reserve", false)
		place_piece(game, "cp", "TU DIV #12", "CP Reserve", false)

		place_piece(game, "cp", "TU-A DIV #1", "Cizre", false)
		place_piece(game, "cp", "TU-A DIV #2", "Aleppo", false)
		place_piece(game, "cp", "TU-A DIV #3", "Aleppo", false)
		place_piece(game, "cp", "TU-A DIV #4", "Suleymaniye", true)
		place_piece(game, "cp", "TU-A DIV #5", "Nasiriya", true)
		place_piece(game, "cp", "TU-A DIV #6", "Basra", true)
		place_piece(game, "cp", "TU-A DIV #7", "Gaza", false)
		place_piece(game, "cp", "TU-A DIV #8", "Gaza", false)
		place_piece(game, "cp", "TU-A DIV #9", "Mecca", false)

		place_piece(game, "cp", "TU Elite DIV #1", "Bulair", false)
		place_piece(game, "cp", "TU Elite DIV #2", "Gallipoli", false)
		place_piece(game, "cp", "TU Elite DIV #3", "Seddul Bahr", false)
		place_piece(game, "cp", "TU Elite DIV #4", "Van", false)
		place_piece(game, "cp", "TU Elite DIV #5", "Damascus", false)
		place_piece(game, "cp", "TU Elite DIV #6", "Damascus", false)
		place_piece(game, "cp", "TU Elite DIV #7", "CP Reserve", false)
		place_piece(game, "cp", "TU Elite DIV #8", "CP Reserve", false)
		place_piece(game, "cp", "TU-A Elite DIV #1", "Adana", true)
		place_piece(game, "cp", "TU-A Elite DIV #2", "Homs", false)

		place_piece(game, "cp", "TU Cavalry #1", "Rodosto", true)
		place_piece(game, "cp", "TU Cavalry #2", "Erzurum", false)
		place_piece(game, "cp", "TU Cavalry #3", "Eleskirt", true)
		place_piece(game, "cp", "TU Cavalry #4", "Bayazit", true)
		place_piece(game, "cp", "TU-A Cavalry", "Ruwandiz", true)
		place_piece(game, "cp", "TU-A Camel Corps", "Beersheba", false)
		place_piece(game, "cp", "TU Stanke Bey", "Rize", false)

		// Tribal units
		place_piece(game, "cp", "Bakhtiari", "Bakhtiari", false)
		place_piece(game, "cp", "Bawi", "Bawi", false)
		place_piece(game, "cp", "Jangali", "Jangali", false)
		place_piece(game, "cp", "Kurds #1", "Kurds", false)
		place_piece(game, "cp", "Kurds #2", "Kurds", false)
		place_piece(game, "cp", "Laz", "Laz", false)
		place_piece(game, "cp", "Marsh #1", "Marsh", false)
		place_piece(game, "cp", "Marsh #2", "Marsh", false)
		place_piece(game, "cp", "NW Frontier", "NW Frontier", false)
		place_piece(game, "cp", "Qashqai", "Qashqai", false)
		place_piece(game, "cp", "Senussi #1", "Senussi", false)
		place_piece(game, "cp", "Senussi #2", "Senussi", false)
		place_piece(game, "cp", "Sinjabi", "Sinjabi", false)
		place_piece(game, "cp", "Tangistani", "Tangistani", false)

		// Allied Powers
		place_piece(game, "ap", "GR DIV #1", "ATHENS", false)
		place_piece(game, "ap", "GR DIV #2", "Doiran", false)
		place_piece(game, "ap", "GR DIV #3", "Ft. Rupel", false)

		place_piece(game, "ap", "BR Royal Navy", "Mersa Matruh", true)
		place_piece(game, "ap", "BR DIV #1", "CAIRO", true)
		place_piece(game, "ap", "BR IN Garrison #1", "Simla", true)
		place_piece(game, "ap", "BR IN Garrison #2", "Simla", true)
		place_piece(game, "ap", "BR IN Garrison #3", "Simla", true)

		place_piece(game, "ap", "IN DIV #1", "Ismailia", true)
		place_piece(game, "ap", "IN DIV #2", "Suez", false)
		place_piece(game, "ap", "IN DIV #3", "Bahrain", false)
		place_piece(game, "ap", "IN DIV #4", "to Fao", false)
		place_piece(game, "ap", "IN DIV #5", "to Fao", false)
		place_piece(game, "ap", "IN DIV #6", "Baluchistan", false)
		place_piece(game, "ap", "IN Elite DIV #1", "INDIA", false)
		place_piece(game, "ap", "IN Elite DIV #2", "INDIA", false)
		place_piece(game, "ap", "IN Cavalry #1", "Port Said", false)
		place_piece(game, "ap", "IN Cavalry #2", "to Fao", false)
		place_piece(game, "ap", "IN Cavalry #3", "Baluchistan", false)
		place_piece(game, "ap", "IN Bikanir Camel", "Ismailia", false)

		place_piece(game, "ap", "RU I Caucasian", "Sarikamis", false)
		place_piece(game, "ap", "RU II Turkistani", "AP Corps Assets", false)
		place_piece(game, "ap", "RU DIV #1", "Batum", true)
		place_piece(game, "ap", "RU DIV #2", "Batum", true)
		place_piece(game, "ap", "RU DIV #3", "Oltu", false)
		place_piece(game, "ap", "RU DIV #4", "Kars", false)
		place_piece(game, "ap", "RU DIV #5", "Kagizman", false)
		place_piece(game, "ap", "RU DIV #6", "Kagizman", false)
		place_piece(game, "ap", "RU DIV #7", "TIFLIS", false)
		place_piece(game, "ap", "RU DIV #8", "TIFLIS", false)
		place_piece(game, "ap", "RU DIV #9", "AP Reserve", false)
		place_piece(game, "ap", "RU DIV #10", "AP Reserve", false)
		place_piece(game, "ap", "RU Elite DIV #1", "Erevan", false)
		place_piece(game, "ap", "RU Elite DIV #2", "Tabriz", false)
		place_piece(game, "ap", "RU Cavalry #1", "Sarikamis", false)
		place_piece(game, "ap", "RU Cavalry #2", "Julfa", false)
		place_piece(game, "ap", "RU Cavalry #3", "Julfa", false)
		place_piece(game, "ap", "RU Cavalry #4", "Tabriz", false)
		place_piece(game, "ap", "RU Cavalry #5", "TIFLIS", false)
		place_piece(game, "ap", "RU Cavalry #6", "Central Asia", true)
		place_piece(game, "ap", "RU Persian coss", "Tabriz", false)
		place_piece(game, "ap", "RU Yudenitch HQ", "TIFLIS", false)

		// Beachhead
		place_beachhead(game, "to Fao")

		// Trenches
		place_trench(game, 1, "Adrianople")
		place_trench(game, 1, "Bulair")
		place_trench(game, 1, "Catalca")
		place_trench(game, 1, "CONSTANTINOPLE")
		place_trench(game, 1, "Ctesiphon")
		place_trench(game, 2, "Doiran")

		// 保加利亚展示板单位在历史开局时预摆到固定展示位，待事件打出后再“解锁”归属。
		// BU 3 Army 仍由事件流程决定具体落位，因此不在此处预摆。
		preplace_balkan_entry_displays(game)
	}

	function mark_removed_cards(game, card_ids) {
		for (let card_id of card_ids) {
			let info = data.cards[card_id]
			if (!info) continue
			let removed = info.faction === "ap" ? game.removed_ap : game.removed_cp
			set_add(removed, card_id)
		}
	}

	function apply_limited_war_started_events(game) {
		const prior_event_flags = {
			russo_british_assault: true,
			secret_treaty: true,
			churchill_prevails: true,
			lawrence: true,
			goeben: true,
			german_military_advisers: true,
			persian_push: true
		}

		game.jihad = 2

		game.events["egyptian_coup"] = true
		game.jihad -= 1
		if (game.ui_tokens) game.ui_tokens["Cyprus Allowed"] = "MCYPBR.png"
		Engine.set_control(game, CYPRUS, "ap")
		for (let s of CYPRUS_BEACHHEADS) Engine.set_control(game, s, "ap")

		game.events["royal_navy_blockade"] = true
		game.tu_rp_limit = 25
		game.blockade_vp_penalty_active = true
		game.events["royal_navy_blockade_transport_lock_placeholder"] = true
		game.events["royal_navy_blockade_restricted_seas"] = [
			"aegean",
			"east_mediterranean",
			"persian_gulf",
			"red_sea"
		]

		game.events["kitchener"] = 1
		game.events["kitchener_conversion"] = true
		game.rp_ap.br += 1
		game.rp_ap.in += 1
		game.rp_ap.a += 1
		game.rp_ap.ru += 1
		if (game.ui_tokens) game.ui_tokens["BR RPs TO RU"] = "MKitch.png"
		let kitchener_token = get_piece_id("system", "Kitch.token")
		if (kitchener_token >= 0) game.pieces[kitchener_token] = REMOVED

		game.events["liberate_suez"] = 2
		game.events["liberate_suez_active"] = true
		game.rp_cp.tu += 1
		game.jihad += 1

		game.events["pan_turkism"] = true
		game.rp_cp.tu += 1
		game.jihad += 1

		game.events["indian_mutiny"] = 2
		game.jihad += 1
		if (game.ui_tokens) {
			game.ui_tokens["Persian_Neutrality"] = "MPENV.png"
			game.ui_tokens["Indian_Mutiny"] = "MINMUTA.png"
		}

		for (let event_key in prior_event_flags) {
			game.events[event_key] = prior_event_flags[event_key]
		}

		delete game.liberate_suez_op_required
		delete game.liberate_suez_battle_required
		delete game.liberate_suez_min_egypt_attack_ops
		delete game.liberate_suez_egypt_attacked_spaces
		delete game.liberate_suez_egypt_battle_done
		delete game.liberate_suez_drm
		delete game.indian_mutiny_drm
	}

	function setup_limited_war_scenario(game) {
		setup_historical_scenario(game)

		game.turn = 2
		game.scenario_max_turn = 17
		game.initial_deck_commitment = COMMITMENT_LIMITED
		game.vp = 10
		game.war_status_ap = 4
		game.war_status_cp = 4
		game.war_commitment_ap = COMMITMENT_LIMITED
		game.war_commitment_cp = COMMITMENT_LIMITED
		game.pending_commitment_shuffle = { ap: false, cp: false }
		game.cp_opening_mobilization_pick_done = true

		mark_removed_cards(game, [
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68,
			69
		])
		apply_limited_war_started_events(game)
		game.combined_war = game.war_status_ap + game.war_status_cp
	}

	function get_reinforcement_box() {
		return Engine.constants.REINFORCEMENTS
	}

	function normalize_faction_token(value) {
		if (typeof value !== "string") return value
		let token = value.trim().toLowerCase()
		if (token === "ap" || token === "allied powers") return Engine.constants.AP
		if (token === "cp" || token === "central powers") return Engine.constants.CP
		return value
	}

	function normalize_game(state) {
		const { COMMITMENT_MOBILIZATION } = Engine.constants
		const { MO_NONE } = Engine.mo
		if (!state) state = {}
		if (!state.options) state.options = {}
		state.active = normalize_faction_token(state.active)
		if (!Array.isArray(state.log)) state.log = []
		if (!Array.isArray(state.undo)) state.undo = []
		if (!Array.isArray(state.pieces)) state.pieces = Array(data.pieces.length).fill(0)
		if (!Array.isArray(state.piece_x)) state.piece_x = Array(data.pieces.length).fill(undefined)
		if (!Array.isArray(state.piece_y)) state.piece_y = Array(data.pieces.length).fill(undefined)
		if (!Array.isArray(state.control)) state.control = Array(data.spaces.length).fill(null)
		if (!Array.isArray(state.reduced)) state.reduced = []
		if (!state.forts) state.forts = { destroyed: [], besieged: [] }
		if (!Array.isArray(state.trenches)) state.trenches = []
		if (!Array.isArray(state.trenches_2)) state.trenches_2 = []
		if (!Array.isArray(state.deck_ap)) state.deck_ap = []
		if (!Array.isArray(state.hand_ap)) state.hand_ap = []
		if (!Array.isArray(state.discard_ap)) state.discard_ap = []
		if (!Array.isArray(state.removed_ap)) state.removed_ap = []
		if (!Array.isArray(state.deck_cp)) state.deck_cp = []
		if (!Array.isArray(state.hand_cp)) state.hand_cp = []
		if (!Array.isArray(state.discard_cp)) state.discard_cp = []
		if (!Array.isArray(state.removed_cp)) state.removed_cp = []
		if (!Array.isArray(state.discarded_ccs)) state.discarded_ccs = []
		if (!state.cc_retained) state.cc_retained = { ap: [], cp: [] }
		if (!Array.isArray(state.cc_retained.ap)) state.cc_retained.ap = []
		if (!Array.isArray(state.cc_retained.cp)) state.cc_retained.cp = []
		if (!state.cc_retained_after_use) state.cc_retained_after_use = { ap: {}, cp: {} }
		if (!state.cc_retained_after_use.ap) state.cc_retained_after_use.ap = {}
		if (!state.cc_retained_after_use.cp) state.cc_retained_after_use.cp = {}
		if (!state.rp_ap) state.rp_ap = { br: 0, ru: 0, in: 0, a: 0, fr: 0 }
		if (!state.rp_cp) state.rp_cp = { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 }
		if (!state.rp_rebel) state.rp_rebel = { ca: 0, af: 0, eg: 0, in: 0 }
		if (state.tu_rp_limit === undefined) state.tu_rp_limit = 25
		if (!state.events) state.events = {}
		if (state.cp_auto_victory_marker === undefined) {
			state.cp_auto_victory_marker = null
		} else if (state.cp_auto_victory_marker !== null) {
			state.cp_auto_victory_marker = Math.max(0, Math.floor(Number(state.cp_auto_victory_marker) || 0))
		}
		if (!state.pending_commitment_shuffle) state.pending_commitment_shuffle = { ap: false, cp: false }
		if (state.pending_commitment_shuffle.ap === undefined) state.pending_commitment_shuffle.ap = false
		if (state.pending_commitment_shuffle.cp === undefined) state.pending_commitment_shuffle.cp = false
		if (state.war_status_ap === undefined) state.war_status_ap = 0
		if (state.war_status_cp === undefined) state.war_status_cp = 0
		if (!state.war_commitment_ap) state.war_commitment_ap = COMMITMENT_MOBILIZATION
		if (!state.war_commitment_cp) state.war_commitment_cp = COMMITMENT_MOBILIZATION
		if (state.mo_ap === undefined) state.mo_ap = MO_NONE
		if (state.mo_cp === undefined) state.mo_cp = MO_NONE
		if (state.mo_ap_modifier === undefined) state.mo_ap_modifier = 0
		if (state.mo_ap_fulfilled === undefined) state.mo_ap_fulfilled = false
		if (state.mo_cp_fulfilled === undefined) state.mo_cp_fulfilled = false
		if (state.mo_cp_cancelled === undefined) state.mo_cp_cancelled = false
		if (state.ru_revolution === undefined) state.ru_revolution = 0
		if (state.jihad === undefined) state.jihad = 0
		if (state.russian_vp === undefined) state.russian_vp = 0
		state.combined_war = Math.min(40, Math.max(0, (state.war_status_ap || 0) + (state.war_status_cp || 0)))
		if (!Array.isArray(state.tribal_reserve)) state.tribal_reserve = []
		if (state.russian_revolution === undefined) state.russian_revolution = 0
		if (state.god_save_the_tsar === undefined) state.god_save_the_tsar = 0
		if (state.ge_to_tu_rp_used === undefined) state.ge_to_tu_rp_used = 0
		if (!Array.isArray(state.beachheads)) state.beachheads = []
		if (!Array.isArray(state.ap_actions)) state.ap_actions = Array(7).fill(null)
		if (!Array.isArray(state.cp_actions)) state.cp_actions = Array(7).fill(null)
		if (state.where === undefined) state.where = -1
		if (!Array.isArray(state.supply_warnings)) state.supply_warnings = []
		if (!Array.isArray(state.oos)) state.oos = []
		if (!Array.isArray(state.entrenching)) state.entrenching = []
		if (!Array.isArray(state.entrench_attempts)) state.entrench_attempts = []
		if (!Array.isArray(state.entered_regions_this_turn)) state.entered_regions_this_turn = []
		if (state.last_card === undefined) state.last_card = 0
		if (!Array.isArray(state.rollback)) state.rollback = []
		if (!(Array.isArray(state.rollback_state) || typeof state.rollback_state === "string"))
			state.rollback_state = []
		if (!state.activated) state.activated = { move: [], attack: [] }
		if (!Array.isArray(state.moved)) state.moved = []
		if (!Array.isArray(state.attacked)) state.attacked = []
		if (!Array.isArray(state.retreated)) state.retreated = []
		if (!state.balkan_attack_targets) state.balkan_attack_targets = { ap: -1, ap_mo: -1, cp: -1 }
		if (state.balkan_attack_targets.ap === undefined) state.balkan_attack_targets.ap = -1
		if (state.balkan_attack_targets.ap_mo === undefined) state.balkan_attack_targets.ap_mo = -1
		if (state.balkan_attack_targets.cp === undefined) state.balkan_attack_targets.cp = -1
		if (!Array.isArray(state.eligible_attackers)) state.eligible_attackers = []
		if (!Array.isArray(state.player_order)) state.player_order = [Engine.constants.AP, Engine.constants.CP]
		else state.player_order = state.player_order.map(normalize_faction_token)
		if (!Array.isArray(state.jihad_cities_flipped)) state.jihad_cities_flipped = []
		if (!Array.isArray(state.jihad_city_effective_owner)) state.jihad_city_effective_owner = []
		if (!Array.isArray(state.vp_partial_disruption)) state.vp_partial_disruption = []
		if (state.tribes_to_place === undefined) state.tribes_to_place = 0
		if (state.cp_opening_mobilization_pick_done === undefined) state.cp_opening_mobilization_pick_done = state.turn > 1
		return state
	}

	function create_game(seed, scenario, options) {
		const { COMMITMENT_MOBILIZATION } = Engine.constants
		const { MO_NONE } = Engine.mo
		let pieces = Array(data.pieces.length).fill(0)

		for (let p = 0; p < data.pieces.length; p++) {
			if (data.pieces[p]) {
				pieces[p] = get_reinforcement_box()
			}
		}

		let state = {
			seed: seed,
			scenario: scenario,
			options: Object.assign({}, options || {}),
			log: [],
			undo: [],
			active: null,
			state: "setup",
			turn: 0,
			vp: 10,
			pieces: pieces,
			piece_x: Array(data.pieces.length).fill(undefined),
			piece_y: Array(data.pieces.length).fill(undefined),
			control: Array(data.spaces.length).fill(null),
			reduced: [],
			forts: { destroyed: [], besieged: [] },
			trenches: [],
			trenches_2: [],
			deck_ap: [],
			hand_ap: [],
			discard_ap: [],
			removed_ap: [],
			deck_cp: [],
			hand_cp: [],
			discard_cp: [],
			removed_cp: [],
			rp_ap: { br: 0, ru: 0, in: 0, a: 0, fr: 0 },
			rp_cp: { ge: 0, ah: 0, tu: 0, a: 0, bu: 0 },
			rp_rebel: { ca: 0, af: 0, eg: 0, in: 0 },
			tu_rp_limit: 25,
			events: {},
			cp_auto_victory_marker: null,
			pending_commitment_shuffle: { ap: false, cp: false },
			war_status_ap: 0,
			war_status_cp: 0,
			war_commitment_ap: COMMITMENT_MOBILIZATION,
			war_commitment_cp: COMMITMENT_MOBILIZATION,
			mo_ap: MO_NONE,
			mo_cp: MO_NONE,
			mo_ap_modifier: 0,
			mo_ap_fulfilled: false,
			mo_cp_fulfilled: false,
			mo_cp_cancelled: false,
			ru_revolution: 0,
			jihad: 0,
			jihad_cities_flipped: [],
			jihad_city_effective_owner: [],
			vp_partial_disruption: [],
			russian_vp: 0,
			combined_war: 0,
			tribal_reserve: [],
			russian_revolution: 0,
			god_save_the_tsar: 0,
			ge_to_tu_rp_used: 0,
			ap_actions: Array(7).fill(null),
			cp_actions: Array(7).fill(null),
			where: -1,
			supply_warnings: [],
			oos: [],
			entrenching: [],
			entrench_attempts: [],
			entered_regions_this_turn: [],
			last_card: 0,
			rollback: [],
			rollback_state: [],
			balkan_attack_targets: { ap: -1, ap_mo: -1, cp: -1 },
			cp_opening_mobilization_pick_done: false
		}
		return normalize_game(state)
	}

	Object.assign(exports, {
		create_game,
		normalize_game,
		setup_historical_scenario,
		setup_limited_war_scenario
	})

	return exports
}
