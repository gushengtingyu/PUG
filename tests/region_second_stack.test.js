const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace, findPiece } = require("./helpers.js")

const { CP } = Engine.constants
const CP_ROLE = rules.roles[1]

describe("大区多堆叠激活的 view 暴露 (BUG: 首次激活后点大区默认 deactivate)", () => {
	function baseSetup() {
		let game = setupGame(2026042212, "Historical")
		let galicia = findSpace("Galicia")
		let gePieces = [findPiece(CP, "German 11th Army"), findPiece(CP, "GE IV R Corps")]
		let ahPieces = [
			findPiece(CP, "AH VIII Corps"),
			findPiece(CP, "AH XXII R Corps"),
			findPiece(CP, "AH DIV #4")
		]
		for (let p of [...gePieces, ...ahPieces]) game.pieces[p] = galicia
		game.events.bulgaria = 1
		game.active = CP
		game.state = "activate_spaces"
		game.ops = 2
		game.card_ops = 2
		game.activated = { move: [], attack: [] }
		game.activation_cost = {}
		game.region_activations = { move: {}, attack: {} }
		game.moved = []
		game.attacked = []
		game.retreated = []
		return { game, galicia, gePieces, ahPieces }
	}

	test("确认第一堆叠之后 view.actions.activate_attack 和 deactivate 同时包含该大区", () => {
		let { game, galicia, gePieces } = baseSetup()

		rules.action(game, CP_ROLE, "activate_attack", galicia)
		for (let p of gePieces) rules.action(game, CP_ROLE, "piece", p)
		rules.action(game, CP_ROLE, "confirm")

		expect(game.ops).toBe(1)
		expect(game.state).toBe("activate_spaces")

		let view = rules.view(game, CP_ROLE)
		expect(view.actions.activate_attack || []).toContain(galicia)
		expect(view.actions.deactivate || []).toContain(galicia)
	})

	test("view.activated.attack 将带有 region_activations 的大区合并进来，便于前端显示激活 marker", () => {
		let { game, galicia, gePieces } = baseSetup()

		rules.action(game, CP_ROLE, "activate_attack", galicia)
		for (let p of gePieces) rules.action(game, CP_ROLE, "piece", p)
		rules.action(game, CP_ROLE, "confirm")

		let view = rules.view(game, CP_ROLE)
		// 后端 game.activated.attack 依然为空（真实状态不动）
		expect(game.activated.attack).toEqual([])
		// 但 view.activated.attack 带上了已有 region_activations 的大区，让前端渲染攻击 marker
		expect(view.activated.attack).toContain(galicia)
	})

	test("第二次点 activate_attack 进入选择状态但不应丢掉第一个堆叠", () => {
		let { game, galicia, gePieces } = baseSetup()
		// 用 2 GE 同国单位激活一个堆叠 (cost=1)
		rules.action(game, CP_ROLE, "activate_attack", galicia)
		for (let p of gePieces) rules.action(game, CP_ROLE, "piece", p)
		rules.action(game, CP_ROLE, "confirm")

		let ops_after_first = game.ops
		expect(game.region_activations.attack[galicia]).toHaveLength(1)
		expect(game.state).toBe("activate_spaces")

		// 第二次点 activate_attack：应该只改变 state 进入 activate_region_stack，
		// 绝对不能把第一堆叠删掉或回退 OP
		rules.action(game, CP_ROLE, "activate_attack", galicia)
		expect(game.state).toBe("activate_region_stack")
		expect(game.ops).toBe(ops_after_first) // OP 没被退
		expect(game.region_activations.attack[galicia]).toHaveLength(1) // 第一堆叠还在
		expect(game.region_activations.attack[galicia][0].pieces.sort((a, b) => a - b)).toEqual(
			gePieces.slice().sort((a, b) => a - b)
		)

		// 取消这次选择，第一堆叠依然保留
		rules.action(game, CP_ROLE, "cancel")
		expect(game.state).toBe("activate_spaces")
		expect(game.region_activations.attack[galicia]).toHaveLength(1)
		expect(game.ops).toBe(ops_after_first)
	})
})
