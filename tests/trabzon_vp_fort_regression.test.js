"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")
const { setupGame, findSpace, findApPiece, clearBoard } = require("./helpers.js")

const { AP, CP } = Engine.constants

test("Trabzon fort prevents VP change from Armenian Uprising", () => {
	let game = setupGame(2026052201, "Historical")
	clearBoard(game)
	
	let trabzon = findSpace("Trabzon")
	let armenianUprising = findApPiece("Armenian Uprising")
	
	// 1. Ensure Trabzon has a CP fort
	Engine.map.set_fort_owner(game, trabzon, CP)
	
	let initialVp = game.vp
	let initialRuVp = game.russian_vp || 0
	
	// 2. Place Armenian Uprising in Trabzon
	game.pieces[armenianUprising] = trabzon
	
	// 3. Sync state
	Engine.neutral.sync_vp_state(game, trabzon)
	
	// 4. Verify no VP change
	expect(game.vp).toBe(initialVp)
	expect(game.russian_vp || 0).toBe(initialRuVp)
	
	// 5. Verify disruptor is 0
	expect(Engine.neutral.get_vp_effective_owner(game, trabzon)).toBe(0)
})

test("Trabzon without fort allows VP change from Armenian Uprising", () => {
	let game = setupGame(2026052202, "Historical")
	clearBoard(game)
	
	let trabzon = findSpace("Trabzon")
	let armenianUprising = findApPiece("Armenian Uprising")
	
	// 1. Ensure Trabzon fort is destroyed
	Engine.map.set_fort_owner(game, trabzon, CP)
	Engine.map.destroy_fort(game, trabzon)
	
	let initialVp = game.vp
	let initialRuVp = game.russian_vp || 0
	
	// 2. Place Armenian Uprising in Trabzon
	game.pieces[armenianUprising] = trabzon
	
	// 3. Sync state
	Engine.neutral.sync_vp_state(game, trabzon)
	
	// 4. Verify VP change
	expect(game.vp).not.toBe(initialVp)
	expect(game.russian_vp || 0).not.toBe(initialRuVp)
	
	// 5. Verify disruptor is AP
	expect(Engine.neutral.get_vp_effective_owner(game, trabzon)).toBe(AP)
})
