"use strict"

const rules = require("../rules.js")
const data = require("../data.js")
const Engine = require("../modules/engine.js")

const DEFAULT_SETUP_OPTIONS = Object.freeze({
	seven_hand_size: false,
	no_supply_warnings: false
})

function setupGame(seed, scenario = "Historical", options = {}) {
	return rules.setup(seed, scenario, Object.assign({}, DEFAULT_SETUP_OPTIONS, options))
}

function findSpace(name) {
	let space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`Cannot find space: ${name}`)
	return space
}

function findPiece(faction, name) {
	if (name === undefined) return findPieceByName(faction)
	let piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`Cannot find piece: ${name}`)
	return piece
}

function findPieceByName(name) {
	let piece = Engine.game_utils.find_piece(undefined, name)
	if (piece < 0) throw new Error(`Cannot find piece: ${name}`)
	return piece
}

function findApPiece(name) {
	return findPiece(Engine.constants.AP, name)
}

function findCpPiece(name) {
	return findPiece(Engine.constants.CP, name)
}

function findPieceByPredicate(predicate, label = "piece") {
	let piece = data.pieces.findIndex((info, idx) => idx > 0 && info && predicate(info, idx))
	if (piece < 0) throw new Error(`Cannot find piece: ${label}`)
	return piece
}

function findSpaceByPredicate(predicate, label = "space") {
	let space = data.spaces.findIndex((info, idx) => idx > 0 && info && predicate(info, idx))
	if (space < 0) throw new Error(`Cannot find space: ${label}`)
	return space
}

function clearBoard(game) {
	for (let p = 0; p < game.pieces.length; p++) game.pieces[p] = 0
	game.moved = []
	game.sr_moved = []
}

function clearSpace(game, space) {
	for (let p of rules.get_pieces_in_space(game, space)) game.pieces[p] = 0
}

module.exports = {
	setupGame,
	findSpace,
	findPiece,
	findPieceByName,
	findApPiece,
	findCpPiece,
	findPieceByPredicate,
	findSpaceByPredicate,
	clearBoard,
	clearSpace
}
