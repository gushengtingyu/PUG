const rules = require("../rules.js")

const { setupGame, findSpace } = require("./helpers.js")

const AP = rules.AP
const AP_ROLE = rules.roles[0]

function prepareChurchillPlacementState(game) {
	game.active = AP
	game.state = "event_churchill_prevails_place_units"
	game.event_ctx = {
		key: "churchill_prevails",
		data: {
			reinf_to_place: ["BR Elite DIV #1", "BR Elite DIV #2"]
		}
	}
}

test("German Subs in the Med 打出的当回合会阻止丘吉尔将精锐师放到爱琴海或东地中海", () => {
	let game = setupGame(2026041808)
	let reserve = rules.get_reserve_box(AP)

	game.events["german_subs"] = true
	game.events["german_subs_turn"] = game.turn
	prepareChurchillPlacementState(game)

	let view = rules.view(game, AP_ROLE)
	let legal_spaces = view.actions.space || []

	expect(legal_spaces).toContain(reserve)
	expect(legal_spaces).toEqual([reserve])
})

test("German Subs in the Med 仅封锁打出当回合，后续回合丘吉尔仍可选择港口放兵", () => {
	let game = setupGame(2026041809)
	let reserve = rules.get_reserve_box(AP)
	let portSaid = findSpace("Port Said")
	let lemnos = findSpace("Lemnos")

	game.events["german_subs"] = true
	game.events["german_subs_turn"] = game.turn - 1
	prepareChurchillPlacementState(game)

	let view = rules.view(game, AP_ROLE)
	let legal_spaces = view.actions.space || []

	expect(legal_spaces).toContain(reserve)
	expect(legal_spaces).toContain(portSaid)
	expect(legal_spaces).toContain(lemnos)
})

test("丘吉尔胜出的精锐师不能直接放到 Gallipoli 的滩头格", () => {
	let game = setupGame(2026041810)
	let reserve = rules.get_reserve_box(AP)
	let lemnos = findSpace("Lemnos")
	let suvlabay = findSpace("Suvla Bay")
	let gabaTepe = findSpace("Gaba Tepe")
	let capeHelles = findSpace("Cape Helles")
	let besikaBay = findSpace("Besika Bay")

	prepareChurchillPlacementState(game)

	let view = rules.view(game, AP_ROLE)
	let legal_spaces = view.actions.space || []

	expect(legal_spaces).toContain(reserve)
	expect(legal_spaces).toContain(lemnos)
	expect(legal_spaces).not.toContain(suvlabay)
	expect(legal_spaces).not.toContain(gabaTepe)
	expect(legal_spaces).not.toContain(capeHelles)
	expect(legal_spaces).not.toContain(besikaBay)
})
