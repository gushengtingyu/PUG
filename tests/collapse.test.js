const Engine = require("../modules/engine.js")
const eventStates = Engine.event_states.states

const { AP, CP, RESERVE } = Engine.constants

function createGame() {
	const game = Engine.setup.create_game(1, "Historical", {})
	game.turn = 6
	game.log = []
	game.events = {}
	game.control = Array(Engine.data.spaces.length).fill(null)
	return game
}

function makeLogger(game) {
	return (msg) => game.log.push(msg)
}

function findPiece(faction, name) {
	const piece = Engine.game_utils.find_piece(faction, name)
	if (piece < 0) throw new Error(`找不到单位: ${name}`)
	return piece
}

function findSpace(name) {
	const space = Engine.game_utils.find_space(name)
	if (space < 0) throw new Error(`找不到地块: ${name}`)
	return space
}

function setControl(game, spaceName, faction) {
	game.control[findSpace(spaceName)] = faction
}

function placePiece(game, faction, name, spaceName) {
	const piece = findPiece(faction, name)
	game.pieces[piece] = findSpace(spaceName)
	return piece
}

function moveToReserve(game, faction, name) {
	const piece = findPiece(faction, name)
	game.pieces[piece] = RESERVE
	return piece
}

function createStateRules(game) {
	const phaseTransitions = []
	const stateLogs = []
	return {
		phaseTransitions,
		stateLogs,
		set_has: Engine.utils.set_has,
		set_add: Engine.utils.set_add,
		is_removed: (targetGame, piece) => Engine.game_utils.is_removed(targetGame, piece),
		push_undo() {},
		log(message) {
			stateLogs.push(message)
			game.log.push(message)
		},
		next_phase(phase) {
			phaseTransitions.push(phase)
		},
		eliminate_piece(piece, permanent) {
			return Engine.game_utils.eliminate_piece(game, piece, null, permanent)
		},
		move_piece(targetGame, piece, space) {
			targetGame.pieces[piece] = space
		}
	}
}

function getPiecesAction(res) {
	return res.get_action("piece") || []
}

function getSpacesAction(res) {
	return res.get_action("space") || []
}

function isRemoved(game, piece) {
	return Engine.game_utils.is_removed(game, piece)
}

describe("崩溃规则", () => {
	test("保加利亚崩溃时会用预备盒 GE 步兵 SCU 替换 German 11th Army", () => {
		const game = createGame()
		const log = makeLogger(game)
		const sofia = findSpace("SOFIA")
		const german11th = placePiece(game, CP, "German 11th Army", "SOFIA")
		const replacement = moveToReserve(game, CP, "GE DIV #1")

		game.events.bulgaria = true
		setControl(game, "SOFIA", AP)

		const handled = Engine.collapse.handle_national_collapse(game, log)

		expect(handled).toBe(false)
		expect(game.events.bulgarian_collapse).toBe(6)
		expect(isRemoved(game, german11th)).toBe(true)
		expect(game.pieces[replacement]).toBe(sofia)
	})

	test("塞尔维亚自愿崩溃在罗马尼亚未崩溃时进入 AH 选择步骤，并保留 2 个免费 SR 上限", () => {
		const game = createGame()
		const log = makeLogger(game)

		game.events.bulgaria = true
		game.events.romania = true
		for (let index = 1; index <= 6; index++) {
			moveToReserve(game, CP, `AH DIV #${index}`)
		}

		Engine.collapse.accept_voluntary_collapse(game, "serbia", log)

		expect(game.events.serbian_collapse).toBe(6)
		expect(game.state).toBe("event_serbian_collapse_choice")
		expect(game.event_ctx).toMatchObject({
			collapse_nation: "serbia",
			choice_limit: 2,
			move_limit: 2
		})
	})

	test("塞尔维亚崩溃的 AH 选择提示只展示保加利亚入场的两个 AH 师", () => {
		const game = createGame()
		const log = makeLogger(game)

		game.events.bulgaria = true
		game.events.romania = true
		moveToReserve(game, CP, "AH DIV #1")
		moveToReserve(game, CP, "AH DIV #4")
		moveToReserve(game, CP, "AH DIV #5")

		Engine.collapse.accept_voluntary_collapse(game, "serbia", log)

		const res = Engine.create_result(game)
		eventStates.event_serbian_collapse_choice.prompt({
			game,
			res,
			rules: createStateRules(game)
		})

		expect(getPiecesAction(res)).toContain(findPiece(CP, "AH DIV #4"))
		expect(getPiecesAction(res)).toContain(findPiece(CP, "AH DIV #5"))
		expect(getPiecesAction(res)).not.toContain(findPiece(CP, "AH DIV #1"))
	})

	test("罗马尼亚崩溃的选择提示只展示罗马尼亚入场的 AH 单位名单", () => {
		const game = createGame()
		const log = makeLogger(game)

		game.events.romania = true
		game.events.bulgaria = true
		moveToReserve(game, CP, "Combined BU/AH Div")
		moveToReserve(game, CP, "AH DIV #1")
		moveToReserve(game, CP, "AH DIV #2")
		moveToReserve(game, CP, "AH DIV #3")
		moveToReserve(game, CP, "AH DIV #4")

		Engine.collapse.accept_voluntary_collapse(game, "romania", log)

		const res = Engine.create_result(game)
		eventStates.event_romanian_collapse_choice.prompt({
			game,
			res,
			rules: createStateRules(game)
		})

		expect(game.state).toBe("event_romanian_collapse_choice")
		expect(getPiecesAction(res)).toContain(findPiece(CP, "Combined BU/AH Div"))
		expect(getPiecesAction(res)).toContain(findPiece(CP, "AH DIV #3"))
		expect(getPiecesAction(res)).not.toContain(findPiece(CP, "AH DIV #4"))
	})

	test("崩溃后的免费 SR 达到 2 个单位后不再提供新的单位或目标地块", () => {
		const game = createGame()
		const movedA = placePiece(game, CP, "German 11th Army", "SOFIA")
		const movedB = placePiece(game, CP, "GE Mackenson HQ", "BELGRADE")
		placePiece(game, CP, "BU 1 Army", "Skopje")
		setControl(game, "SOFIA", CP)
		setControl(game, "BELGRADE", CP)
		setControl(game, "Skopje", CP)

		game.state = "event_serbian_collapse_sr"
		game.event_ctx = {
			move_limit: 2,
			data: { moved: [movedA, movedB] }
		}

		const res = Engine.create_result(game)
		eventStates.event_serbian_collapse_sr.prompt({
			game,
			res,
			rules: createStateRules(game)
		})

		expect(getPiecesAction(res)).toEqual([])
		expect(getSpacesAction(res)).toEqual([])
		expect(res.has_action("done")).toBe(true)
	})

	test("罗马尼亚满足三座关键城市失守时会自动崩溃", () => {
		const game = createGame()
		const log = makeLogger(game)
		const geCav = placePiece(game, CP, "GE Schmettow", "Ploesti")
		placePiece(game, AP, "RO 1 Army", "BUCHAREST")

		game.events.romania = true
		setControl(game, "BUCHAREST", CP)
		setControl(game, "Ploesti", CP)
		setControl(game, "Constanta", CP)

		const handled = Engine.collapse.handle_national_collapse(game, log)

		expect(handled).toBe(true)
		expect(game.events.romania_collapse).toBe(6)
		expect(game.state).toBe("event_romanian_collapse_sr")
		expect(isRemoved(game, geCav)).toBe(true)
	})

	test("塞尔维亚崩溃后塞军攻击范围会随贝尔格莱德控制权变化", () => {
		const game = createGame()
		const sbArmy = findPiece(undefined, "SB 1 Army")

		game.events.serbian_collapse = game.turn

		expect(Engine.collapse.can_piece_attack_after_serbian_collapse(game, sbArmy, findSpace("ATHENS"))).toBe(true)
		expect(Engine.collapse.can_piece_attack_after_serbian_collapse(game, sbArmy, findSpace("SOFIA"))).toBe(false)

		setControl(game, "BELGRADE", AP)

		expect(Engine.collapse.can_piece_attack_after_serbian_collapse(game, sbArmy, findSpace("SOFIA"))).toBe(true)
		expect(Engine.collapse.can_piece_attack_after_serbian_collapse(game, sbArmy, findSpace("Damascus"))).toBe(false)
	})

	test("塞尔维亚自愿崩溃可完成 offer->accept->移除->免费SR->done 全链路", () => {
		const game = createGame()
		const rules = createStateRules(game)
		const ahDiv1 = moveToReserve(game, CP, "AH DIV #4")
		const ahDiv2 = moveToReserve(game, CP, "AH DIV #5")
		const srPiece = placePiece(game, CP, "German 11th Army", "SOFIA")
		const destination = findSpace("BELGRADE")

		game.events.bulgaria = true
		game.events.romania = true
		placePiece(game, AP, "RO 1 Army", "BUCHAREST")
		game.collapse_status = {
			turn: game.turn,
			serbia_considered: false,
			romania_considered: true
		}
		setControl(game, "BELGRADE", CP)
		setControl(game, "SOFIA", CP)
		setControl(game, "Skopje", AP)

		expect(Engine.collapse.handle_national_collapse(game, rules.log)).toBe(true)
		expect(game.state).toBe("war_status_serbian_collapse_offer")

		eventStates.war_status_serbian_collapse_offer.accept({ game, rules })
		expect(game.state).toBe("event_serbian_collapse_choice")

		eventStates.event_serbian_collapse_choice.piece({ game, rules, arg: ahDiv1 })
		eventStates.event_serbian_collapse_choice.piece({ game, rules, arg: ahDiv2 })
		eventStates.event_serbian_collapse_choice.confirm({ game, rules })

		expect(game.state).toBe("event_serbian_collapse_sr")
		expect(isRemoved(game, ahDiv1)).toBe(true)
		expect(isRemoved(game, ahDiv2)).toBe(true)

		eventStates.event_serbian_collapse_sr.piece({ game, rules, arg: srPiece })
		eventStates.event_serbian_collapse_sr.space({ game, rules, arg: destination, log: rules.log })
		eventStates.event_serbian_collapse_sr.done({ game, rules })

		expect(game.pieces[srPiece]).toBe(destination)
		expect(rules.phaseTransitions).toEqual(["war_status_phase"])
		expect(game.event_ctx).toBeUndefined()
		expect(game.sr_piece).toBeUndefined()
	})

	test("罗马尼亚自愿崩溃可完成 offer->accept->移除->免费SR->done 全链路", () => {
		const game = createGame()
		const rules = createStateRules(game)
		const combined = moveToReserve(game, CP, "Combined BU/AH Div")
		const ahDiv1 = moveToReserve(game, CP, "AH DIV #1")
		const ahDiv2 = moveToReserve(game, CP, "AH DIV #2")
		const srPiece = placePiece(game, CP, "German 11th Army", "SOFIA")
		const destination = findSpace("BELGRADE")

		game.events.romania = true
		game.events.bulgaria = true
		game.collapse_status = {
			turn: game.turn,
			serbia_considered: true,
			romania_considered: false
		}
		placePiece(game, AP, "RO 1 Army", "BUCHAREST")
		setControl(game, "SOFIA", CP)
		setControl(game, "BELGRADE", CP)

		expect(Engine.collapse.handle_national_collapse(game, rules.log)).toBe(true)
		expect(game.state).toBe("war_status_romanian_collapse_offer")

		eventStates.war_status_romanian_collapse_offer.accept({ game, rules })
		expect(game.state).toBe("event_romanian_collapse_choice")

		eventStates.event_romanian_collapse_choice.piece({ game, rules, arg: combined })
		eventStates.event_romanian_collapse_choice.piece({ game, rules, arg: ahDiv1 })
		eventStates.event_romanian_collapse_choice.piece({ game, rules, arg: ahDiv2 })
		eventStates.event_romanian_collapse_choice.confirm({ game, rules })

		expect(game.state).toBe("event_romanian_collapse_sr")
		expect(isRemoved(game, combined)).toBe(true)
		expect(isRemoved(game, ahDiv1)).toBe(true)
		expect(isRemoved(game, ahDiv2)).toBe(true)

		eventStates.event_romanian_collapse_sr.piece({ game, rules, arg: srPiece })
		eventStates.event_romanian_collapse_sr.space({ game, rules, arg: destination, log: rules.log })
		eventStates.event_romanian_collapse_sr.done({ game, rules })

		expect(game.pieces[srPiece]).toBe(destination)
		expect(rules.phaseTransitions).toEqual(["war_status_phase"])
		expect(game.event_ctx).toBeUndefined()
		expect(game.sr_piece).toBeUndefined()
	})
})
