"use strict"

const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function loadRollbackHelpers(view) {
	const source = fs.readFileSync(path.join(__dirname, "..", "play.js"), "utf8")
	const start = source.indexOf("function get_rollback_point")
	const end = source.indexOf("function is_rollback_dice_record", start)
	if (start < 0 || end < 0) {
		throw new Error("Could not find rollback helpers in play.js")
	}

	const context = {
		view,
		spaces: [
			null,
			{ name: "Oltu" },
			{ name: "Bayburt" },
			{ name: "Erzurum" },
			{ name: "Kars" },
			{ name: "Sarikamis" }
		]
	}
	vm.createContext(context)
	vm.runInContext(
		`${source.slice(start, end)}
		globalThis.get_primary_rollback_indices = get_primary_rollback_indices
		globalThis.get_rollback_primary_index = get_rollback_primary_index
		globalThis.get_combat_rollback_indices_for_action = get_combat_rollback_indices_for_action
		globalThis.format_rollback_timepoint_label = format_rollback_timepoint_label`,
		context
	)
	return context
}

test("rollback combat checkpoints are grouped under their action round", () => {
	const view = {
		rollback: [
			{ kind: "turn_start", turn: 1, active: "ap", name: "回合 1 起始", turn_start: true },
			{ kind: "action_round", turn: 1, active: "ap", action: 1, name: "回合 1 AP 第 1 行动轮" },
			{ kind: "combat", turn: 1, active: "ap", action: 1, combat_index: 1, space: 1 },
			{ kind: "combat", turn: 1, active: "ap", action: 1, combat_index: 2, space: 2 },
			{ kind: "action_round", turn: 1, active: "cp", action: 1, name: "回合 1 CP 第 1 行动轮" }
		]
	}
	const helpers = loadRollbackHelpers(view)

	expect(helpers.get_primary_rollback_indices()).toEqual([0, 1, 4])
	expect(helpers.get_rollback_primary_index(3)).toBe(1)
	expect(helpers.get_combat_rollback_indices_for_action(1)).toEqual([2, 3])
	expect(helpers.format_rollback_timepoint_label(view.rollback[2])).toBe("Oltu 战斗前")
	expect(helpers.format_rollback_timepoint_label(view.rollback[3])).toBe("Bayburt 战斗前")
})
