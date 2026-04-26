const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { AP, ELIMINATED } = Engine.constants

function clearSpace(game, name) {
	let space = findSpace(name)
	let apReserve = findSpace("AP Reserve")
	let cpReserve = findSpace("CP Reserve")

	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] !== space) continue
		game.pieces[p] = Engine.data.pieces[p].faction === AP ? apReserve : cpReserve
	}
}

function getRebuildNames(game, piece) {
	return Engine.replacement.get_valid_rebuild_spaces(game, piece, AP).map((s) => Engine.data.spaces[s].name)
}

test("RU LCU 只能在俄国补给点重建，不能直接重建到一般港口或黑海港口", () => {
	let game = setupGame(2026042206, "Historical")
	let ruArmy = findPiece(AP, "RU 6 Army")

	for (let name of ["Odessa", "TIFLIS", "Central Asia", "Petrovsk", "Poti", "Batum", "Baku", "Abadan", "Lemnos", "Alexandria"]) {
		clearSpace(game, name)
	}

	game.pieces[ruArmy] = ELIMINATED

	let rebuildNames = getRebuildNames(game, ruArmy)

	expect(rebuildNames).toEqual(expect.arrayContaining(["Odessa", "TIFLIS", "Central Asia", "Petrovsk"]))
	expect(rebuildNames).not.toContain("Poti")
	expect(rebuildNames).not.toContain("Batum")
	expect(rebuildNames).not.toContain("Baku")
	expect(rebuildNames).not.toContain("Abadan")
	expect(rebuildNames).not.toContain("Lemnos")
	expect(rebuildNames).not.toContain("Alexandria")
})

test("RU LCU 只有在 Trabzon 被标记为俄国补给点时才能重建到 Trabzon", () => {
	let game = setupGame(2026042207, "Historical")
	let ruArmy = findPiece(AP, "RU 6 Army")
	let trabzon = findSpace("Trabzon")

	clearSpace(game, "Trabzon")
	game.pieces[ruArmy] = ELIMINATED
	Engine.set_control(game, trabzon, AP)

	let withoutRuVp = getRebuildNames(game, ruArmy)
	expect(withoutRuVp).not.toContain("Trabzon")

	if (!game.vps) game.vps = []
	game.vps[trabzon] = "ru"

	let withRuVp = getRebuildNames(game, ruArmy)
	expect(withRuVp).toContain("Trabzon")
})
