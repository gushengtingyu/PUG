const fs = require("node:fs")

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const turnStates = require("../modules/states/states_turn.js")

const { setupGame } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function getTurnFuncs(game) {
	turnStates.set_globals(game)
	return turnStates.register({}, Engine, {
		log: () => {},
		log_h1: () => {},
		log_h2: () => {},
		get_pieces_in_space: Engine.map.get_pieces_in_space,
		find_space: Engine.game_utils.find_space,
		space_name: Engine.game_utils.space_name,
		piece_name: Engine.game_utils.piece_name,
		other_faction: Engine.utils.other_faction,
		set_control: Engine.set_control,
		check_supply: Engine.map.check_supply,
		eliminate_piece: (p, permanent = false) => Engine.game_utils.eliminate_piece(game, p, () => {}, permanent),
		roll_die: () => 1,
		MO_NONE: Engine.mo.MO_NONE,
		PHASE_SEQUENCE: {},
		AP,
		CP
	})
}

test("missed MO penalties record their turn for the view", () => {
	let game = setupGame(2026051703, "Historical", { no_supply_warnings: true })
	let turn = getTurnFuncs(game)

	game.turn = 4
	game.mo_ap = Engine.mo.MO_RUSSIA
	game.mo_cp = Engine.mo.MO_TURKEY
	game.mo_ap_fulfilled = false
	game.mo_cp_fulfilled = false
	game.missed_mo_ap = []
	game.missed_mo_cp = []

	turn.start_attrition_phase()

	expect(game.missed_mo_ap).toEqual([4])
	expect(game.missed_mo_cp).toEqual([4])

	let view = rules.view(game, AP_ROLE)

	expect(view.missed_mo_ap).toEqual([4])
	expect(view.missed_mo_cp).toEqual([4])
})

test("british no attack violation (penalty unpaid) records missed_mo_ap", () => {
	let game = setupGame(2026052401, "Historical", { no_supply_warnings: true })
	let turn = getTurnFuncs(game)

	game.turn = 5
	game.mo_ap = Engine.mo.MO_BRITISH_NO_ATTACK
	game.mo_ap_fulfilled = true
	game.mo_cp = Engine.mo.MO_NONE
	game.mo_cp_fulfilled = true
	game.british_mandate_violated = true
	game.br_attack_penalty_paid = false
	game.missed_mo_ap = []
	game.missed_mo_cp = []
	game.vp = 10

	turn.start_attrition_phase()

	expect(game.vp).toBe(11)
	expect(game.br_attack_penalty_paid).toBe(true)
	expect(game.missed_mo_ap).toEqual([5])

	let view = rules.view(game, AP_ROLE)
	expect(view.missed_mo_ap).toEqual([5])
})

test("british no attack violation (penalty already paid) still records missed_mo_ap", () => {
	let game = setupGame(2026052402, "Historical", { no_supply_warnings: true })
	let turn = getTurnFuncs(game)

	game.turn = 6
	game.mo_ap = Engine.mo.MO_BRITISH_NO_ATTACK
	game.mo_ap_fulfilled = true
	game.mo_cp = Engine.mo.MO_NONE
	game.mo_cp_fulfilled = true
	game.british_mandate_violated = true
	game.br_attack_penalty_paid = true
	game.missed_mo_ap = []
	game.missed_mo_cp = []
	game.vp = 10

	turn.start_attrition_phase()

	expect(game.vp).toBe(10)
	expect(game.br_attack_penalty_paid).toBe(true)
	expect(game.missed_mo_ap).toEqual([6])

	let view = rules.view(game, AP_ROLE)
	expect(view.missed_mo_ap).toEqual([6])
})

test("missed MO turn-track markers use turn-number stack indexes", () => {
	let playSource = fs.readFileSync("play.js", "utf8")
	let imagesSource = fs.readFileSync("images.css", "utf8")

	expect(playSource).toContain("for (let i = 1; i <= MAX_TURN_TRACK; i++)")
	expect(playSource).toContain("turn_track_stacks[i].push(marker)")
	expect(playSource).not.toContain("turn_track_stacks[i - 1].push(marker)")
	expect(imagesSource).toContain("pieces/ap_missed_mo.webp")
	expect(imagesSource).toContain("pieces/cp_missed_mo.webp")
	expect(fs.existsSync("pieces/ap_missed_mo.webp")).toBe(true)
	expect(fs.existsSync("pieces/cp_missed_mo.webp")).toBe(true)
})
