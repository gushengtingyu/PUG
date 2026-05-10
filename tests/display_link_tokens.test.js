"use strict"

const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { findSpace, findPiece } = require("./helpers.js")

const { CP } = Engine.constants

test("rules display helpers emit frontend link tokens", () => {
	const baghdad = findSpace("Baghdad")
	const tuDiv = findPiece(CP, "TU DIV #1")

	expect(rules.space_name(baghdad)).toBe(`s${baghdad}`)
	expect(rules.piece_name(tuDiv, false)).toBe(`P${tuDiv}`)
	expect(rules.piece_name(tuDiv, true)).toBe(`p${tuDiv}`)
})

test("engine game utilities keep raw names for rule logic", () => {
	const baghdad = findSpace("Baghdad")
	const tuDiv = findPiece(CP, "TU DIV #1")

	expect(Engine.game_utils.space_name(baghdad)).toBe("Baghdad")
	expect(Engine.game_utils.piece_name(tuDiv)).toBe("TU\u00A0DIV\u00A0#1")
})
