const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findCpPiece: findPiece } = require("./helpers.js")

const CP_ROLE = rules.roles[1]

function createEventCtx(game) {
	return {
		start_event(key, data) {
			game.event_ctx = { key, data: data || {} }
			return game.event_ctx.data
		}
	}
}

function playTurkishReinforcements(game, placements) {
	let event = Engine.events.get_event_by_id(81)
	event.handler(game, createEventCtx(game))
	for (let space of placements) {
		game = rules.action(game, CP_ROLE, "space", space)
	}
	return game
}

test("Turkish Reinforcements 会赠送 1 次立即组合新 Corps 的机会", () => {
	let game = setupGame(2026041904)
	let corpsAssets = findSpace("CP Corps Assets")
	let reserve = findSpace("CP Reserve")
	let constantinople = findSpace("CONSTANTINOPLE")
	let tuDiv1 = findPiece("TU DIV #1")
	let tuDiv2 = findPiece("TU DIV #2")
	let tuXivCorps = findPiece("TU XIV Corps")

	game.pieces[tuDiv1] = constantinople
	game.pieces[tuDiv2] = constantinople

	game = playTurkishReinforcements(game, [corpsAssets, corpsAssets, corpsAssets, corpsAssets, corpsAssets, reserve, reserve])

	expect(game.state).toBe("event_turkish_reinf_81_combine")

	let combineView = rules.view(game, CP_ROLE)
	expect(combineView.actions.combine || []).toContain(constantinople)

	game = rules.action(game, CP_ROLE, "combine", constantinople)

	let chooseScusView = rules.view(game, CP_ROLE)
	expect(chooseScusView.actions.piece || []).toContain(tuDiv1)
	expect(chooseScusView.actions.piece || []).toContain(tuDiv2)

	game = rules.action(game, CP_ROLE, "piece", tuDiv1)
	game = rules.action(game, CP_ROLE, "piece", tuDiv2)
	game = rules.action(game, CP_ROLE, "select_lcu")

	let chooseLcuView = rules.view(game, CP_ROLE)
	expect(chooseLcuView.actions.piece || []).toContain(tuXivCorps)

	game = rules.action(game, CP_ROLE, "piece", tuXivCorps)

	let reserveDisposeView = rules.view(game, CP_ROLE)
	let reserveChoices = reserveDisposeView.actions.piece || []
	game = rules.action(game, CP_ROLE, "piece", reserveChoices[0])

	let removedDisposeView = rules.view(game, CP_ROLE)
	let removedChoices = removedDisposeView.actions.piece || []
	game = rules.action(game, CP_ROLE, "piece", removedChoices[0])

	expect(game.state).toBe("event_turkish_reinf_81_combine")

	let afterCombineView = rules.view(game, CP_ROLE)
	expect(afterCombineView.actions.combine || []).toEqual([])
	expect(afterCombineView.actions.done).toBeTruthy()
	expect(game.event_ctx.data.combine_used).toBe(true)
})

test("Turkish Reinforcements 中的 TU-A DIV #11 使用 TU-A 的正常增援落点", () => {
	let game = setupGame(2026041905)
	let corpsAssets = findSpace("CP Corps Assets")
	let reserve = findSpace("CP Reserve")
	let constantinople = findSpace("CONSTANTINOPLE")
	let kayseri = findSpace("Kayseri")
	let erzincan = findSpace("Erzincan")
	let baghdad = findSpace("Baghdad")
	let damascus = findSpace("Damascus")

	game = playTurkishReinforcements(game, [corpsAssets, corpsAssets, corpsAssets, corpsAssets, corpsAssets, reserve])

	let tuaView = rules.view(game, CP_ROLE)
	let legalSpaces = tuaView.actions.space || []

	expect(legalSpaces).toContain(baghdad)
	expect(legalSpaces).toContain(damascus)
	expect(legalSpaces).toContain(reserve)
	expect(legalSpaces).not.toContain(constantinople)
	expect(legalSpaces).not.toContain(kayseri)
	expect(legalSpaces).not.toContain(erzincan)
})
