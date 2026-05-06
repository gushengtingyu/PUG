const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { AP, CP } = Engine.constants
const CP_ROLE = rules.roles[1]

function activateBullsEye(game) {
	// Directly activate Bull's Eye flags as if the card was just played.
	game.active = CP
	game.events["bulls_eye_directive"] = game.turn
	game.events["bulls_eye_used"] = false
	game.bulls_eye_sr_done = false
	game.bulls_eye_sr_spaces = []
	game.bulls_eye_advanced_stack = []
}

test("Bull's Eye +1 DRM 只对俄国单位有效", () => {
	let game = setupGame(2026042201)
	activateBullsEye(game)

	let ruDiv = findPiece(AP, "RU DIV #1")
	let inDiv = findPiece(AP, "IN DIV #1")

	expect(Engine.events.bulls_eye_ru_attack_drm(game, [ruDiv])).toBe(1)
	expect(Engine.events.bulls_eye_ru_attack_drm(game, [inDiv])).toBe(0)
	expect(Engine.events.bulls_eye_ru_attack_drm(game, [ruDiv, inDiv])).toBe(1)
	expect(Engine.events.bulls_eye_ru_attack_drm(game, [])).toBe(0)
})

test("Bull's Eye 事件未激活时不给 DRM", () => {
	let game = setupGame(2026042202)
	let ruDiv = findPiece(AP, "RU DIV #1")
	expect(Engine.events.bulls_eye_ru_attack_drm(game, [ruDiv])).toBe(0)
})

test("Bull's Eye DRM 在行动轮结束后失效 (修复回归)", () => {
	let game = setupGame(2026042203)
	activateBullsEye(game)
	let ruDiv = findPiece(AP, "RU DIV #1")
	expect(Engine.events.bulls_eye_ru_attack_drm(game, [ruDiv])).toBe(1)

	// Simulate end of action round via goto_end_action path
	game.activated = { move: [], attack: [] }
	game.state = "end_operations"
	rules.view(game, CP_ROLE)
	rules.action(game, CP_ROLE, "end_action", null)

	expect(Engine.events.bulls_eye_ru_attack_drm(game, [ruDiv])).toBe(0)
	expect(Engine.events.is_bulls_eye_active ? Engine.events.is_bulls_eye_active(game) : false).toBe(false)
})

test("Bull's Eye 追踪推进部队只记录 TU/TU-A", () => {
	let game = setupGame(2026042204)
	activateBullsEye(game)

	let tuDiv = findPiece(CP, "TU DIV #1")
	let geDiv = findPiece(CP, "GE DIV #1")
	let tuaDiv = findPiece(CP, "TU-A DIV #1")

	Engine.events.bulls_eye_record_advanced_piece(game, tuDiv)
	Engine.events.bulls_eye_record_advanced_piece(game, geDiv)
	Engine.events.bulls_eye_record_advanced_piece(game, tuaDiv)

	expect(game.bulls_eye_advanced_stack).toContain(tuDiv)
	expect(game.bulls_eye_advanced_stack).toContain(tuaDiv)
	expect(game.bulls_eye_advanced_stack).not.toContain(geDiv)
})

test("Bull's Eye can_extra_attack 需要 TU 推进且未使用", () => {
	let game = setupGame(2026042205)
	activateBullsEye(game)
	expect(Engine.events.bulls_eye_can_extra_attack(game)).toBe(false)

	let tuDiv = findPiece(CP, "TU DIV #1")
	Engine.events.bulls_eye_record_advanced_piece(game, tuDiv)
	expect(Engine.events.bulls_eye_can_extra_attack(game)).toBe(true)

	Engine.events.bulls_eye_use_extra_attack(game)
	expect(Engine.events.bulls_eye_can_extra_attack(game)).toBe(false)
})

test("Bull's Eye cleanup 将超过堆叠限制的 SCU 送回预备格", () => {
	let game = setupGame(2026042206)
	activateBullsEye(game)

	// Use an empty space not preloaded by the scenario
	let space = findSpace("Erzurum")
	let reserve = findSpace("CP Reserve")

	// Clear any existing CP pieces in the target space to start from a clean slate
	let eliminated = findSpace("CP Eliminated")
	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === space) game.pieces[p] = eliminated
	}

	// Put 4 TU SCUs in the space (over stack limit of 3)
	let scus = [
		findPiece(CP, "TU DIV #1"),
		findPiece(CP, "TU DIV #2"),
		findPiece(CP, "TU DIV #3"),
		findPiece(CP, "TU DIV #4")
	]
	for (let p of scus) game.pieces[p] = space

	Engine.events.bulls_eye_cleanup_scus(game)

	let in_space = scus.filter((p) => game.pieces[p] === space).length
	let in_reserve = scus.filter((p) => game.pieces[p] === reserve).length
	expect(in_space).toBe(3)
	expect(in_reserve).toBe(1)
})

test("Bull's Eye SR 空间列表使用已激活进攻地块且去重", () => {
	let game = setupGame(2026042207)
	activateBullsEye(game)

	let sA = findSpace("Constantinople")
	let sB = findSpace("Erzurum")
	game.activated = { move: [], attack: [sA, sB] }

	let spaces = Engine.events.bulls_eye_get_sr_spaces(game)
	expect(spaces).toContain(sA)
	expect(spaces).toContain(sB)

	Engine.events.bulls_eye_record_sr_space(game, sA)
	spaces = Engine.events.bulls_eye_get_sr_spaces(game)
	expect(spaces).not.toContain(sA)
	expect(spaces).toContain(sB)
})
