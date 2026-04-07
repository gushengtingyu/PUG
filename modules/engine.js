"use strict"

/**
 * Pursuit of Glory - Rule Engine Aggregation Layer
 * This module acts as a central hub for all rule-related logic,
 * decoupling sub-modules from each other and simplifying rules.js.
 */

const data = require("../data.js")
const constants = require("./core/constants.js")
const utils = require("./core/utils.js")

const Engine = {
	data,
	constants,
	utils,

	/**
	 * Result object for logic-view separation.
	 * Helps collect logs, prompts, and actions without direct side effects on view.
	 */
	create_result(game) {
		return {
			game,
			_prompt: undefined,
			_where: undefined,
			_who: undefined,
			_hand: undefined,
			_rollback_proposal: undefined,
			_entrenching: undefined,
			_actions: {},
			logs: [],
			prompt(msg) {
				this._prompt = msg
				return this
			},
			where(s) {
				this._where = s
				return this
			},
			who(p) {
				this._who = p
				return this
			},
			hand(h) {
				this._hand = h
				return this
			},
			rollback_proposal(p) {
				this._rollback_proposal = p
				return this
			},
			entrenching(e) {
				this._entrenching = e
				return this
			},
			log(msg) {
				this.logs.push(msg)
				if (this.game && Array.isArray(this.game.log)) {
					this.game.log.push(msg)
				}
				return this
			},
			action(name, arg) {
				if (arg !== undefined) {
					if (!this._actions[name]) this._actions[name] = []
					if (Array.isArray(this._actions[name])) {
						if (!this._actions[name].includes(arg)) {
							this._actions[name].push(arg)
						}
					}
				} else {
					this._actions[name] = 1
				}
				return this
			},
			piece(p) {
				return this.action("piece", p)
			},
			space(s) {
				return this.action("space", s)
			},
			has_action(name) {
				if (name === undefined) return Object.keys(this._actions).length > 0
				return !!this._actions[name]
			},
			get_action(name) {
				return this._actions[name]
			},
			set_action(name, value) {
				this._actions[name] = value
				return this
			},
			apply(view) {
				if (this._prompt !== undefined) view.prompt = this._prompt
				if (this._where !== undefined) view.where = this._where
				if (this._who !== undefined) view.who = this._who
				if (this._hand !== undefined) view.hand = this._hand
				if (this._rollback_proposal !== undefined) view.rollback_proposal = this._rollback_proposal
				if (this._entrenching !== undefined) view.entrenching = this._entrenching
				view.actions = this._actions
			},
			set_control(s, faction) {
				Engine.set_control(this.game, s, faction)
				return this
			},
			update_jihad_level(amount) {
				Engine.update_jihad_level(this.game, amount)
				return this
			}
		}
	},

	// Core state management helpers
	log(game, msg) {
		if (Array.isArray(game.log)) {
			game.log.push(msg)
		}
	},

	card_name(card) {
		if (!Number.isInteger(card) || !Engine.data.cards[card]) return `Unknown Card ${card}`
		return `c${card}`
	},

	card_names(cards) {
		if (!Array.isArray(cards)) return []
		return cards.map((card) => Engine.card_name(card))
	},

	update_jihad_level(game, amount) {
		if (Engine.jihad && typeof Engine.jihad.update_jihad_level === "function") {
			const push_state =
				typeof Engine.push_state === "function"
					? Engine.push_state
					: (next_state) => {
							if (game && typeof game.push_state === "function") {
								game.push_state(next_state)
							}
						}
			Engine.jihad.update_jihad_level(game, amount, push_state, (msg) => Engine.log(game, msg))
			return
		}
		game.jihad = Math.max(0, (game.jihad || 0) + amount)
	},

	registerJihadStates(global_states) {
		Engine.jihad.register(global_states)
	},

	registerMOStates(global_states) {
		Engine.mo.register(global_states)
	},

	is_neutral_vp_space(s) {
		let info = Engine.data.spaces[s]
		return !!(info && info.faction === "neutral" && info.vp > 0)
	},

	check_persia_entry_vp_penalty(game, s, entered_pieces) {
		if (!game || !Array.isArray(entered_pieces) || entered_pieces.length === 0) return
		if (!game.events) game.events = {}

		if (!game.events["russian_british_sphere_penalty"]) {
			let has_russian_entry = entered_pieces.some((p) => Engine.game_utils.piece_counts_as_nation_for_rule(game, p, "ru"))
			if (Engine.map.is_arabistan(s) && has_russian_entry) {
				game.events["russian_british_sphere_penalty"] = true
				game.vp += 1
				Engine.log(game, "帝国间的猜忌：俄国部队首次进入阿拉伯斯坦，CP +1 VP。")
			}
		}
	},

	get_neutral_vp_partial_owner(game, s) {
		if (!Engine.is_neutral_vp_space(s)) return 0
		let has_ap_regular = false
		let has_cp_regular = false
		let has_ap_partial = false
		let has_cp_partial = false
		for (let p of Engine.map.get_pieces_in_space(game, s)) {
			let info = Engine.data.pieces[p]
			if (!info || info.type === "hq") continue
			let faction = Engine.game_utils.get_piece_effective_faction(game, p)
			if (Engine.game_utils.is_regular(p)) {
				if (faction === Engine.constants.AP) has_ap_regular = true
				else if (faction === Engine.constants.CP) has_cp_regular = true
				continue
			}
			if (Engine.game_utils.is_irregular(p) || Engine.game_utils.is_tribe(p)) {
				if (faction === Engine.constants.AP) has_ap_partial = true
				else if (faction === Engine.constants.CP) has_cp_partial = true
			}
		}
		if (has_ap_regular && !has_cp_regular) return Engine.constants.AP
		if (has_cp_regular && !has_ap_regular) return Engine.constants.CP
		if (has_ap_partial && !has_cp_partial) return Engine.constants.AP
		if (has_cp_partial && !has_ap_partial) return Engine.constants.CP
		return (game.control && game.control[s]) || 0
	},

	sync_neutral_vp_state(game, s, previous_override) {
		if (!Engine.is_neutral_vp_space(s)) return
		if (!game.neutral_vp_partial_control) game.neutral_vp_partial_control = []
		let vp_val = (Engine.data.spaces[s] && Engine.data.spaces[s].vp) || 0
		let previous =
			previous_override !== undefined ? previous_override || 0 : game.neutral_vp_partial_control[s] || 0
		let next = Engine.get_neutral_vp_partial_owner(game, s) || 0
		if (previous === next) {
			game.neutral_vp_partial_control[s] = next
			return
		}
		if (previous === Engine.constants.AP) game.vp += vp_val
		else if (previous === Engine.constants.CP) game.vp -= vp_val
		if (next === Engine.constants.AP) game.vp -= vp_val
		else if (next === Engine.constants.CP) game.vp += vp_val
		game.neutral_vp_partial_control[s] = next
	},

	set_control(game, s, faction) {
		let previous_neutral_vp_owner =
			Engine.is_neutral_vp_space(s) && game.neutral_vp_partial_control ? game.neutral_vp_partial_control[s] || 0 : 0
		if (game.control[s] === faction) {
			if (Engine.is_neutral_vp_space(s)) Engine.sync_neutral_vp_state(game, s, previous_neutral_vp_owner)
			return
		}

		let old_faction = game.control[s]
		game.control[s] = faction

		if (Engine.jihad && typeof Engine.jihad.on_control_changed === "function") {
			Engine.jihad.on_control_changed(game, s, faction, {
				update_jihad_level: (g, amount) => Engine.update_jihad_level(g, amount)
			})
		}

		if (Engine.is_neutral_vp_space(s)) {
			Engine.sync_neutral_vp_state(game, s, previous_neutral_vp_owner)
			if (!game.ru_control_markers) game.ru_control_markers = []
			if (faction === Engine.constants.AP) {
				let is_ru_capture = false
				let pieces = Engine.map.get_pieces_in_space(game, s)
				for (let p of pieces) {
					let info = Engine.data.pieces[p]
					if (info.nation === "ru" || info.name.startsWith("Armenian") || info.name.startsWith("RU/PE")) {
						is_ru_capture = true
						break
					}
				}
				if (is_ru_capture) {
					game.russian_vp += 1
					if (!game.ru_control_markers.includes(s)) game.ru_control_markers.push(s)
					Engine.log(game, `俄国部队占领VP点，俄国VP +1 (当前: ${game.russian_vp})`)
				}
			} else if (faction === Engine.constants.CP) {
				let is_ru_vp = Engine.map.is_russian_vp_space(game, s)
				let was_ru_controlled = game.ru_control_markers.includes(s)
				if (was_ru_controlled) {
					game.ru_control_markers = game.ru_control_markers.filter((x) => x !== s)
				}
				if (is_ru_vp || was_ru_controlled) {
					game.russian_vp -= 1
					Engine.log(game, `同盟国占领俄国VP点，俄国VP -1 (当前: ${game.russian_vp})`)
				}
			}
			return
		}

		// Normal VP and RU VP logic
		let vp_val = Engine.data.spaces[s].vp || 0
		if (vp_val > 0) {
			const { AP, CP } = Engine.constants
			if (!game.ru_control_markers) game.ru_control_markers = []

			if (faction === AP) {
				game.vp -= vp_val
				Engine.log(game, `AP 获得 ${vp_val} VP (当前VP: ${game.vp})`)

				// Check if RU unit captured it
				let is_ru_capture = false
				let pieces = Engine.map.get_pieces_in_space(game, s)
				for (let p of pieces) {
					let info = Engine.data.pieces[p]
					if (info.nation === "ru" || info.name.startsWith("Armenian") || info.name.startsWith("RU/PE")) {
						is_ru_capture = true
						break
					}
				}
				if (is_ru_capture) {
					game.russian_vp += 1
					if (!game.ru_control_markers.includes(s)) game.ru_control_markers.push(s)
					Engine.log(game, `俄国部队占领VP点，俄国VP +1 (当前: ${game.russian_vp})`)
				}
			} else if (faction === CP) {
				game.vp += vp_val
				Engine.log(game, `CP 获得 ${vp_val} VP (当前VP: ${game.vp})`)

				// CP logic for capturing RU VP space etc.
				let is_ru_vp = Engine.map.is_russian_vp_space(game, s)
				let was_ru_controlled = game.ru_control_markers.includes(s)

				if (was_ru_controlled) {
					game.ru_control_markers = game.ru_control_markers.filter((x) => x !== s)
				}

				if (is_ru_vp || was_ru_controlled) {
					game.russian_vp -= 1
					Engine.log(game, `同盟国占领俄国VP点，俄国VP -1 (当前: ${game.russian_vp})`)
				}
			}
		}
	},

	// Contextual helper to pass Engine to sub-modules if needed
	get context() {
		return this
	}
}

// Inject Engine into factories
Engine.game_utils = require("./core/game_utils.js")(Engine)
Engine.greece = require("./systems/greece.js")(Engine)
Engine.map = require("./systems/map.js")(Engine)
// Expose map functions as supply and movement for backward compatibility
Engine.supply = Engine.map
Engine.movement = Engine.map

Engine.events = require("./systems/events.js")(Engine)
Engine.combat = require("./systems/combat.js")(Engine)
Engine.replacement = require("./systems/replacement.js")(Engine)
Engine.mo = require("./systems/mo.js")(Engine)
Engine.setup = require("./systems/setup.js")(Engine)
Engine.collapse = require("./systems/collapse.js")(Engine)
Engine.event_states = require("./states/event_states.js")(Engine)
Engine.combat_cards = require("./systems/combat_cards.js")(Engine)
Engine.jihad = require("./systems/jihad.js")(Engine)
Engine.units = Engine.game_utils

module.exports = Engine
