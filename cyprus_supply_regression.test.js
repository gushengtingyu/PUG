const rules = require("./rules.js")
const Engine = require("./modules/engine.js")

function cyprusCluster() {
	return ["Cyprus", "To Adana", "To Beirut", "To Haifa", "To Jaffa"].map((name) => ({
		name,
		space: Engine.game_utils.find_space(name)
	}))
}

function egyptianCoupCardIndex() {
	return Engine.data.cards.findIndex((card) => card && card.event === "EGYPTIAN COUP")
}

describe("Cyprus 控制权与补给回归", () => {
	test("开局塞浦路斯及对应滩头为中立", () => {
		let game = rules.setup(1001, "Historical", {})
		for (let node of cyprusCluster()) {
			expect(game.control[node.space]).toBe("neutral")
		}
	})

	test("埃及政变前这些空间不会进入断补转控列表", () => {
		let game = rules.setup(1002, "Historical", {})
		for (let node of cyprusCluster()) {
			game.control[node.space] = Engine.constants.AP
		}
		Engine.map.check_supply(game)
		for (let node of cyprusCluster()) {
			expect((game.oos_spaces || []).includes(node.space)).toBe(false)
		}
	})

	test("埃及政变后塞浦路斯及对应滩头转为AP", () => {
		let game = rules.setup(1003, "Historical", {})
		let card = egyptianCoupCardIndex()
		expect(card).toBeGreaterThan(0)
		let ok = Engine.events.play_event(game, card, { log: () => {} })
		expect(ok).toBe(true)
		for (let node of cyprusCluster()) {
			expect(game.control[node.space]).toBe(Engine.constants.AP)
		}
	})
})
