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

	is_neutral_vp_space(s) {
		if (!Engine.neutral || typeof Engine.neutral.is_neutral_vp_space !== "function") return false
		return Engine.neutral.is_neutral_vp_space(s)
	},

	check_persia_entry_vp_penalty(game, s, entered_pieces) {
		if (!Engine.neutral || typeof Engine.neutral.check_persia_entry_vp_penalty !== "function") return
		Engine.neutral.check_persia_entry_vp_penalty(game, s, entered_pieces)
	},

	get_neutral_vp_partial_owner(game, s) {
		if (!Engine.neutral || typeof Engine.neutral.get_neutral_vp_partial_owner !== "function") return 0
		return Engine.neutral.get_neutral_vp_partial_owner(game, s)
	},

	get_effective_vp_value(game, s) {
		if (!Engine.neutral || typeof Engine.neutral.get_effective_vp_value !== "function") return 0
		return Engine.neutral.get_effective_vp_value(game, s)
	},

	get_vp_effective_owner(game, s) {
		if (!Engine.neutral || typeof Engine.neutral.get_vp_effective_owner !== "function") return 0
		return Engine.neutral.get_vp_effective_owner(game, s)
	},

	sync_vp_state(game, s, previous_override) {
		if (!Engine.neutral || typeof Engine.neutral.sync_vp_state !== "function") return
		Engine.neutral.sync_vp_state(game, s, previous_override)
	},

	sync_neutral_vp_state(game, s, previous_override) {
		Engine.sync_vp_state(game, s, previous_override)
	},

	get_jihad_city_effective_owner(game, s) {
		if (!Engine.jihad || typeof Engine.jihad.get_jihad_city_effective_owner !== "function") return 0
		return Engine.jihad.get_jihad_city_effective_owner(game, s)
	},

	sync_jihad_city_state(game, s, previous_override) {
		if (!Engine.jihad || typeof Engine.jihad.sync_jihad_city_state !== "function") return
		Engine.jihad.sync_jihad_city_state(game, s, previous_override, {
			update_jihad_level: (g, amount) => Engine.update_jihad_level(g, amount)
		})
	},

	set_control(game, s, faction) {
		if (
			Engine.map &&
			typeof Engine.map.is_potential_beachhead_space === "function" &&
			Engine.map.is_potential_beachhead_space(s) &&
			faction === constants.CP
		) {
			faction =
				typeof Engine.map.get_legal_beachhead_controller === "function"
					? Engine.map.get_legal_beachhead_controller(game, s)
					: constants.AP
		}
		const is_vp_space = Engine.get_effective_vp_value(game, s) > 0
		const is_jihad_city = !!(data.spaces[s] && data.spaces[s].jihad_city)
		let previous_jihad_owner = is_jihad_city ? Engine.get_jihad_city_effective_owner(game, s) || 0 : 0
		let current_controller =
			Engine.map && typeof Engine.map.get_space_controller === "function"
				? Engine.map.get_space_controller(game, s)
				: game.control[s] || (data.spaces[s] && data.spaces[s].faction)
		let previous_vp_owner = is_vp_space && (current_controller === constants.AP || current_controller === constants.CP) ? current_controller : 0
		if (current_controller === faction) {
			if (is_vp_space) {
				Engine.sync_vp_state(game, s)
			}
			if (is_jihad_city) {
				Engine.sync_jihad_city_state(game, s, previous_jihad_owner)
			}
			return
		}
		let default_controller =
			Engine.map && typeof Engine.map.get_default_controller === "function"
				? Engine.map.get_default_controller(game, s)
				: data.spaces[s] && data.spaces[s].faction
		game.control[s] = faction === default_controller ? null : faction

		if (is_vp_space) {
			Engine.sync_vp_state(game, s)
		}
		if (is_jihad_city) {
			Engine.sync_jihad_city_state(game, s, previous_jihad_owner)
		}
		if (Engine.neutral && typeof Engine.neutral.apply_control_change === "function") {
			Engine.neutral.apply_control_change(game, s, faction, previous_vp_owner)
		}
	},

	// Contextual helper to pass Engine to sub-modules if needed
	get context() {
		return this
	}
}

// Inject Engine into factories
Engine.game_utils = require("./core/game_utils.js")(Engine)
Engine.neutral = require("./systems/neutral.js")(Engine)
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
