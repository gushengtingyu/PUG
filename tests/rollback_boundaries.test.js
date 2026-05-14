const rules = require("../rules.js")
const data = require("../data.js")

const AP_ROLE = rules.roles[0]

function findSpaceByName(name) {
	let space = data.spaces.findIndex((info, idx) => idx > 0 && info && info.name === name)
	if (space < 0) throw new Error(`Missing space: ${name}`)
	return space
}

function firstSpaceIds(count) {
	return data.spaces
		.map((space, idx) => (idx > 0 && space && space.name ? idx : 0))
		.filter(Boolean)
		.slice(0, count)
}

function createRollbackActionGame(actionType) {
	let game = rules.setup(201, "Historical", { no_supply_warnings: false })
	game.active = rules.AP
	game.state = "attack"
	game.action_round = 1
	game.ap_actions = []
	game.cp_actions = []
	game.ap_actions[1] = { type: actionType, card: 1 }
	game.rollback = []
	game.rollback_state = []
	game.log = []
	game.attacked_spaces = []

	rules.set_game(game)
	rules.save_rollback_point()
	return game
}

test("ordinary undo is unavailable while a rollback proposal is under review", () => {
	let game = rules.setup(200, "Historical", { no_supply_warnings: false })
	game.active = rules.AP
	game.state = "review_rollback_proposal"
	game.undo = [{ state: "attack" }]
	game.rollback = [{ kind: "action_round", turn: 1, active: rules.AP, action: 1, events: [], turn_start: false }]
	game.rollback_state = [{}]
	game.rollback_proposal = { faction: rules.CP, save_state: "attack", index: 0 }

	let view = rules.view(game, AP_ROLE)
	expect(view.undo).toBe(false)
	expect(view.actions.undo).toBe(0)

	rules.action(game, AP_ROLE, "undo")

	expect(game.state).toBe("review_rollback_proposal")
	expect(game.undo).toHaveLength(1)
})

test("OPS combat rollback points are hidden until the second combat in the action", () => {
	let firstSpace = findSpaceByName("Oltu")
	let secondSpace = findSpaceByName("Bayburt")
	let game = createRollbackActionGame("ops")

	game.attack = { space: firstSpace, pieces: [], attacker: rules.AP, defender: rules.CP }
	rules.save_combat_rollback_point()

	expect(game.rollback.map((rollback) => rollback.kind)).toEqual(["action_round"])
	expect(game.combat_rollback_pending).toBeTruthy()

	game.attacked_spaces = [firstSpace]
	game.attack.space = secondSpace
	rules.save_combat_rollback_point()

	expect(game.combat_rollback_pending).toBeUndefined()
	expect(game.rollback.map((rollback) => rollback.kind)).toEqual(["action_round", "combat", "combat"])
	expect(game.rollback.map((rollback) => rollback.combat_index || 0)).toEqual([0, 1, 2])
	expect(rules.decompress_rollback_state(game.rollback_state)).toHaveLength(3)

	let view = rules.view(game, AP_ROLE)
	let combatEntries = view.rollback.filter((rollback) => rollback.kind === "combat")
	expect(view.rollback_meta.action_points).toBe(1)
	expect(view.rollback_meta.combat_points).toBe(2)
	expect(combatEntries.map((rollback) => rollback.combat_index)).toEqual([1, 2])
	expect(combatEntries.map((rollback) => rollback.name)).toEqual([
		expect.stringContaining("Oltu 战斗前"),
		expect.stringContaining("Bayburt 战斗前")
	])
})

test("ordinary undo after the first OPS combat preserves the pending combat rollback point", () => {
	let firstSpace = findSpaceByName("Oltu")
	let secondSpace = findSpaceByName("Bayburt")
	let game = createRollbackActionGame("ops")

	game.attack = { space: firstSpace, pieces: [], attacker: rules.AP, defender: rules.CP }
	rules.save_combat_rollback_point()

	let snapshot = JSON.parse(JSON.stringify(game))
	snapshot.log = game.log.length
	delete snapshot.undo
	delete snapshot.rollback
	delete snapshot.rollback_state
	delete snapshot.combat_rollback_pending

	game.undo = [snapshot]
	game.where = secondSpace
	rules.pop_undo()

	expect(game.where).not.toBe(secondSpace)
	expect(game.combat_rollback_pending).toBeTruthy()

	game.attacked_spaces = [firstSpace]
	game.attack.space = secondSpace
	rules.save_combat_rollback_point()

	expect(game.rollback.map((rollback) => rollback.kind)).toEqual(["action_round", "combat", "combat"])
	expect(game.rollback.map((rollback) => rollback.combat_index || 0)).toEqual([0, 1, 2])
})

test("OPS combat rollback points support two through five combats only", () => {
	let spaceIds = firstSpaceIds(6)
	let game = createRollbackActionGame("ops")

	game.attack = { space: spaceIds[0], pieces: [], attacker: rules.AP, defender: rules.CP }
	rules.save_combat_rollback_point()
	expect(game.rollback.filter((rollback) => rollback.kind === "combat")).toHaveLength(0)

	for (let i = 1; i < spaceIds.length; i++) {
		game.attacked_spaces = spaceIds.slice(0, i)
		game.attack.space = spaceIds[i]
		rules.save_combat_rollback_point()
	}

	let combatEntries = game.rollback.filter((rollback) => rollback.kind === "combat")
	expect(combatEntries).toHaveLength(5)
	expect(combatEntries.map((rollback) => rollback.combat_index)).toEqual([1, 2, 3, 4, 5])
})

test("one-op combat does not create combat rollback points", () => {
	let firstSpace = findSpaceByName("Oltu")
	let game = createRollbackActionGame("one_op")

	game.attack = { space: firstSpace, pieces: [], attacker: rules.AP, defender: rules.CP }
	rules.save_combat_rollback_point()

	expect(game.rollback.map((rollback) => rollback.kind)).toEqual(["action_round"])
	expect(game.combat_rollback_pending).toBeUndefined()
})
