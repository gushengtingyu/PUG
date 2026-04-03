const rules = require("./rules.js")
const Engine = require("./modules/engine.js")

const { AP } = Engine.constants

function setupGame(seed) {
	return rules.setup(seed, "Historical", { seven_hand_size: false, no_supply_warnings: false })
}

function currentPlayer(game) {
	return game.active === AP ? "Allied Powers" : "Central Powers"
}

function getSelectableActionNames(view) {
	return Object.keys(view.actions || {}).filter((name) => {
		if (name === "undo") return false
		let value = view.actions[name]
		if (Array.isArray(value)) return value.length > 0
		return value === 1
	})
}

function pickAction(view, salt) {
	let names = getSelectableActionNames(view)
	if (names.length === 0) return null
	let name = names[salt % names.length]
	let value = view.actions[name]
	if (Array.isArray(value)) {
		return {
			name,
			arg: value[salt % value.length]
		}
	}
	return { name }
}

describe("运行时烟雾测试", () => {
	test.each([12345, 22345, 32345, 42345])("历史剧本随机步进 seed=%i", (seed) => {
		let game = setupGame(seed)

		for (let step = 0; step < 120; step++) {
			let player = currentPlayer(game)
			let view

			expect(() => {
				view = rules.view(game, player)
			}).not.toThrow()

			expect(view).toBeTruthy()
			expect(typeof view.prompt).toBe("string")

			if (game.state === "game_over") break

			let choice = pickAction(view, seed + step * 17)
			if (!choice) break

			expect(() => {
				game = rules.action(game, player, choice.name, choice.arg)
			}).not.toThrow()

			expect(game).toBeTruthy()
			expect(game.state).toBeTruthy()
		}
	})
})
