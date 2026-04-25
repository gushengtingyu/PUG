const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP } = Engine.constants
function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
}

function findPiece(faction, name) {
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

function clearSpace(game, space) {
	for (let p of rules.get_pieces_in_space(game, space)) {
		game.pieces[p] = rules.get_eliminated_box(Engine.data.pieces[p].faction)
	}
}

test("争夺中的 Meshed 会保持既有控制方，不会平白改 VP", () => {
	let game = setupGame(2026042201)
	let meshed = findSpace("Meshed")
	let apPiece = findPiece(AP, "BR Persian Cordon #1")
	let cpPiece = findPiece(CP, "TU-A DIV #10")

	clearSpace(game, meshed)
	game.pieces[apPiece] = meshed
	game.pieces[cpPiece] = meshed

	Engine.sync_region_control(game, meshed)

	expect(Engine.map.get_space_controller(game, meshed)).toBe(AP)
	expect(game.vp).toBe(10)
})

test("争夺中的 Meshed 在 AP 单位离开后会正确转为 CP 控制", () => {
	let game = setupGame(2026042202)
	let meshed = findSpace("Meshed")
	let shiraz = findSpace("Shiraz")
	let apPiece = findPiece(AP, "BR Persian Cordon #1")
	let cpPiece = findPiece(CP, "TU-A DIV #10")

	clearSpace(game, meshed)
	clearSpace(game, shiraz)
	game.pieces[apPiece] = meshed
	game.pieces[cpPiece] = meshed

	Engine.sync_region_control(game, meshed)
	game.pieces[apPiece] = shiraz
	Engine.sync_region_control(game, meshed)
	Engine.sync_region_control(game, shiraz)

	expect(Engine.map.get_space_controller(game, meshed)).toBe(CP)
	expect(game.vp).toBe(11)
})

test("Secret Treaty 把 BR Persian Cordon #4 放进 Meshed 时不会平白多出 1VP", () => {
	let game = setupGame(2026042203)
	let meshed = findSpace("Meshed")
	let apPiece = findPiece(AP, "BR Persian Cordon #4")

	clearSpace(game, meshed)
	Engine.events.reinforce(game, "BR Persian Cordon #4", AP, meshed)

	expect(game.pieces[apPiece]).toBe(meshed)
	expect(Engine.map.get_space_controller(game, meshed)).toBe(AP)
	expect(game.vp).toBe(10)
})
