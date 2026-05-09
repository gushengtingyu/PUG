const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findApPiece, findCpPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]

function createArmenianEventGame() {
	let game = setupGame(2026050901, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	game.active = AP
	game.state = "event_armenian_uprising_unit"
	game.events = { pan_turkism: true }
	game.event_ctx = {
		key: "armenian_uprising_32",
		data: {
			unit_name: "Armenian Uprising",
			blue_a_spaces: ["Sivas", "Kayseri", "Erevan"].map(findSpace),
			markers_to_place: 3,
			marker_spaces: []
		}
	}
	game.armenian_uprising_markers = []
	return game
}

test("Armenian Uprising unit placement excludes CP-occupied blue A spaces", () => {
	let game = createArmenianEventGame()
	let sivas = findSpace("Sivas")
	let kayseri = findSpace("Kayseri")
	let erevan = findSpace("Erevan")
	let turkishUnit = findCpPiece("TU X Corps")
	let russianUnit = findApPiece("RU Elite DIV #1")
	let armenianUprising = findApPiece("Armenian Uprising")

	game.pieces[turkishUnit] = sivas
	game.pieces[russianUnit] = erevan

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space).not.toContain(sivas)
	expect(view.actions.space).toContain(kayseri)
	expect(view.actions.space).toContain(erevan)

	game = rules.action(game, AP_ROLE, "space", sivas)
	expect(game.pieces[armenianUprising]).not.toBe(sivas)
})

test("Armenian Uprising unit prompt filters historical CP-occupied blue A spaces", () => {
	let game = setupGame(2026050905, "Historical", { no_supply_warnings: true })
	game.active = AP
	game.state = "event_armenian_uprising_unit"
	game.event_ctx = {
		key: "armenian_uprising_32",
		data: {
			unit_name: "Armenian Uprising",
			blue_a_spaces: [
				"Yozgat",
				"Sivas",
				"Kayseri",
				"Harput",
				"Diyarbekir",
				"Mus",
				"Bitlis",
				"Van",
				"Erzurum",
				"Alexandretta",
				"Erevan",
				"Trabzon"
			].map(findSpace),
			markers_to_place: 3,
			marker_spaces: []
		}
	}

	let options = rules.view(game, AP_ROLE).actions.space || []
	for (let name of ["Sivas", "Van", "Erzurum"]) {
		expect(options).not.toContain(findSpace(name))
	}
	for (let name of ["Kayseri", "Erevan"]) {
		expect(options).toContain(findSpace(name))
	}
})

test("Armenian Uprising markers are not forced into the unit space", () => {
	let game = setupGame(2026050910, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let kayseri = findSpace("Kayseri")
	let sivas = findSpace("Sivas")
	let van = findSpace("Van")
	let erevan = findSpace("Erevan")
	let armenianUprising = findApPiece("Armenian Uprising")

	game.active = AP
	game.state = "event_armenian_uprising_unit"
	game.event_ctx = {
		key: "armenian_uprising_32",
		data: {
			unit_name: "Armenian Uprising",
			blue_a_spaces: [kayseri, sivas, van, erevan],
			markers_to_place: 3,
			marker_spaces: []
		}
	}
	game.armenian_uprising_markers = []

	game = rules.action(game, AP_ROLE, "space", kayseri)

	expect(game.pieces[armenianUprising]).toBe(kayseri)
	expect(game.armenian_uprising_markers).toEqual([])
	expect(game.event_ctx.data.markers_to_place).toBe(3)
	expect(game.state).toBe("event_armenian_uprising_markers")

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space).toEqual(expect.arrayContaining([kayseri, sivas, van, erevan]))

	game = rules.action(game, AP_ROLE, "space", sivas)
	game = rules.action(game, AP_ROLE, "space", van)
	game = rules.action(game, AP_ROLE, "space", erevan)

	expect(game.armenian_uprising_markers).toEqual([sivas, van, erevan])
	expect(game.armenian_uprising_markers).not.toContain(kayseri)
})

test("Armenian Uprising marker placement still allows CP-occupied blue A spaces", () => {
	let game = setupGame(2026050906, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let van = findSpace("Van")
	let kayseri = findSpace("Kayseri")
	let turkishUnit = findCpPiece("TU DIV #1")

	game.active = AP
	game.state = "event_armenian_uprising_markers"
	game.pieces[turkishUnit] = van
	game.event_ctx = {
		key: "armenian_uprising_32",
		data: {
			unit_name: "Armenian Uprising",
			blue_a_spaces: [van, kayseri],
			markers_to_place: 1,
			marker_spaces: []
		}
	}
	game.armenian_uprising_markers = []

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space).toContain(van)

	game = rules.action(game, AP_ROLE, "space", van)
	expect(game.armenian_uprising_markers).toContain(van)
	expect(game.pieces[turkishUnit]).toBe(van)
})

test("Armenian Uprising markers are visible and disrupt CP supply context", () => {
	let game = setupGame(2026050902, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let van = findSpace("Van")
	let turkishUnit = findCpPiece("TU DIV #1")

	game.active = CP
	game.pieces[turkishUnit] = van
	game.armenian_uprising_markers = [van]

	expect(Engine.map.is_disrupted_by_enemy(game, van, CP)).toBe(true)
	expect(Engine.map.create_supply_context(game).disrupted[CP][van]).toBe(1)
	expect(Engine.map.get_activation_cost_pair(game, van).move).toBe(2)

	let view = rules.view(game, "Observer")
	expect(view.armenian_uprising_markers).toEqual([van])
})

test("Armenian Uprising unit is always in supply in Anatolia, Caucasus, and Russian spaces", () => {
	let game = setupGame(2026050903, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let armenianUprising = findApPiece("Armenian Uprising")

	for (let name of ["Kayseri", "Van", "Odessa"]) {
		let space = findSpace(name)
		game.pieces[armenianUprising] = space
		expect(Engine.map.get_supply_status(game, space, AP, armenianUprising)).toBe("FULL")
	}
})

test("Armenian Uprising partial VP capture counts as Russian VP and reverses when it leaves", () => {
	let game = setupGame(2026050904, "Historical", { no_supply_warnings: true })
	clearBoard(game)
	let kayseri = findSpace("Kayseri")
	let armenianUprising = findApPiece("Armenian Uprising")

	game.vp = 10
	game.russian_vp = 0
	game.pieces[armenianUprising] = kayseri
	Engine.sync_neutral_vp_state(game, kayseri)

	expect(game.vp).toBe(9)
	expect(game.russian_vp).toBe(1)
	expect(game.ru_control_markers).toContain(kayseri)
	expect(game.armenian_uprising_ru_vp_markers).toContain(kayseri)

	game.pieces[armenianUprising] = 0
	Engine.sync_neutral_vp_state(game, kayseri)

	expect(game.vp).toBe(10)
	expect(game.russian_vp).toBe(0)
	expect(game.ru_control_markers || []).not.toContain(kayseri)
	expect(game.armenian_uprising_ru_vp_markers || []).not.toContain(kayseri)
})
