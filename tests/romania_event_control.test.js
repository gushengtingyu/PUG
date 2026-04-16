const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { AP, CP } = Engine.constants

function setupGame(seed, scenario = "Historical") {
	return rules.setup(seed, scenario, { seven_hand_size: false, no_supply_warnings: false })
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

function hasDelayedEntry(game, faction, name, turn, spaceName) {
	let piece = findPiece(faction, name)
	let space = findSpace(spaceName)
	return Array.isArray(game.delayed_reinforcements) && game.delayed_reinforcements.some((entry) => entry.piece === piece && entry.turn === turn && entry.space === space)
}

function countPoolUnitsInSpace(game, faction, names, spaceName) {
	let space = findSpace(spaceName)
	return names.filter((name) => game.pieces[findPiece(faction, name)] === space).length
}

test("Romania 事件会按展示板正确放置单位、切换罗马尼亚控制并登记延迟入场", () => {
	let game = setupGame(2026041701, "Historical")
	let event = Engine.events.get_event_by_id(29)
	let geAlpen = findPiece(CP, "GE Alpenkorps")

	expect(game.pieces[geAlpen]).toBe(findSpace("Vidin"))
	expect(Engine.game_utils.get_piece_effective_faction(game, geAlpen)).toBe("neutral")

	event.handler(game)

	expect(Engine.map.get_space_controller(game, findSpace("BUCHAREST"))).toBe(AP)
	expect(Engine.map.get_space_controller(game, findSpace("Ploesti"))).toBe(AP)
	expect(Engine.map.get_space_controller(game, findSpace("Constanta"))).toBe(AP)

	expect(game.pieces[findPiece(AP, "RO 1 Army")]).toBe(findSpace("Craiova"))
	expect(game.pieces[findPiece(AP, "RO 2 Army")]).toBe(findSpace("Ploesti"))
	expect(game.pieces[findPiece(AP, "RO 3 Army")]).toBe(findSpace("Turtukai"))
	expect(game.pieces[findPiece(AP, "RO Cavalry")]).toBe(findSpace("Ploesti"))
	expect(game.pieces[findPiece(AP, "RU Dobruja")]).toBe(findSpace("Constanta"))
	expect(game.pieces[findPiece(AP, "RU/SB Yugo Infantry")]).toBe(findSpace("AP Reserve"))
	expect(countPoolUnitsInSpace(game, AP, ["RU DIV #11", "RU DIV #12", "RU DIV #13", "RU DIV #14", "RU DIV #15"], "AP Reserve")).toBe(2)

	expect(game.pieces[findPiece(CP, "GE IX Army")]).toBe(findSpace("Galicia"))
	expect(game.pieces[findPiece(CP, "GE Alpenkorps")]).toBe(findSpace("Galicia"))
	expect(game.pieces[findPiece(CP, "AH VI R Corps")]).toBe(findSpace("Galicia"))
	expect(game.pieces[findPiece(CP, "AH DIV #1")]).toBe(findSpace("Hermannstadt"))
	expect(game.pieces[findPiece(CP, "AH DIV #2")]).toBe(findSpace("Hermannstadt"))
	expect(game.pieces[findPiece(CP, "AH DIV #3")]).toBe(findSpace("CP Reserve"))
	expect(game.pieces[findPiece(CP, "Combined BU/AH Div")]).toBe(findSpace("CP Reserve"))
	expect(countPoolUnitsInSpace(game, CP, ["GE DIV #3", "GE DIV #4"], "CP Reserve")).toBe(2)

	expect(Engine.game_utils.get_piece_effective_faction(game, geAlpen)).toBe(CP)
	expect(hasDelayedEntry(game, AP, "RU Danube Army", game.turn + 1, "Odessa")).toBe(true)
	expect(hasDelayedEntry(game, AP, "RU 6 Army", game.turn + 2, "Odessa")).toBe(true)
	expect(hasDelayedEntry(game, AP, "FR Army Orient 1", game.turn + 1, "Lemnos")).toBe(true)
	expect(hasDelayedEntry(game, AP, "FR Army Orient 2", game.turn + 1, "Lemnos")).toBe(true)
	expect(hasDelayedEntry(game, CP, "GE Schmettow", game.turn + 1, "Galicia")).toBe(true)
	expect(game.active).toBe(AP)
	expect(game.state).toBe("event_romania_attack")
})

test("Bulgaria 已参战后打出 Romania 不会把已经在地图上的 Alpenkorps 拉回 Galicia，并把 Combined BU/AH Div 放入保加利亚", () => {
	let game = setupGame(2026041702, "Historical")
	let bulgariaEvent = Engine.events.get_event_by_id(88)
	let romaniaEvent = Engine.events.get_event_by_id(29)
	let geAlpen = findPiece(CP, "GE Alpenkorps")

	bulgariaEvent.handler(game)
	expect(game.pieces[geAlpen]).toBe(findSpace("Vidin"))
	expect(Engine.game_utils.get_piece_effective_faction(game, geAlpen)).toBe(CP)

	romaniaEvent.handler(game)

	expect(game.pieces[geAlpen]).toBe(findSpace("Vidin"))
	expect(game.pieces[findPiece(CP, "Combined BU/AH Div")]).toBe(findSpace("SOFIA"))
})
