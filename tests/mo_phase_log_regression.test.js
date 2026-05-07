"use strict"

const Engine = require("../modules/engine.js")

function collectLogs() {
	const logs = []
	return { logs, log: (msg) => logs.push(msg) }
}

test("MO phase result log uses compact final results", () => {
	const { logs, log } = collectLogs()

	Engine.mo.log_mo_results(
		{
			mo_ap: Engine.mo.MO_MESOPOTAMIA,
			mo_cp: Engine.mo.MO_TURKEY
		},
		log
	)

	expect(logs).toEqual(["AP：美索不达米亚/波斯", "CP：土耳其"])
	expect(logs.join("\n")).not.toContain("掷骰")
	expect(logs.join("\n")).not.toContain("Modifier")
})

test("Enver first choice waits and logs only the final summary", () => {
	const { logs, log } = collectLogs()
	const game = {
		seed: 4,
		events: {},
		mo_ap: Engine.mo.MO_MESOPOTAMIA,
		mo_cp: Engine.mo.MO_ENVER,
		mo_cp_1_fulfilled: false,
		mo_cp_2_fulfilled: false
	}

	Engine.mo.states.mo_enver_choose_1.choose_enver_british(game, log)

	expect(logs).toEqual(["AP：美索不达米亚/波斯", "CP：恩维尔（#1 大英帝国，#2 大英帝国）"])
	expect(logs.join("\n")).not.toContain("恩维尔第二次掷骰")
	expect(logs.join("\n")).not.toContain("协约国为恩维尔")
	expect(logs.join("\n")).not.toContain("攻势目标为")
})

test("Enver rerolled Enver logs only after the second target choice", () => {
	const { logs, log } = collectLogs()
	const game = {
		seed: 1,
		events: {},
		mo_ap: Engine.mo.MO_EGYPT,
		mo_cp: Engine.mo.MO_ENVER,
		mo_cp_1_fulfilled: false,
		mo_cp_2_fulfilled: false
	}

	Engine.mo.states.mo_enver_choose_1.choose_enver_british(game, log)

	expect(logs).toEqual([])
	expect(game.state).toBe("mo_enver_choose_2")

	Engine.mo.states.mo_enver_choose_2.choose_enver_turkey(game, log)

	expect(logs).toEqual(["AP：埃及", "CP：恩维尔（#1 大英帝国，#2 土耳其）"])
	expect(logs.join("\n")).not.toContain("再次被掷出")
	expect(logs.join("\n")).not.toContain("同盟国为恩维尔")
})

test("AP choice logs the final selected result instead of the choice action", () => {
	const { logs, log } = collectLogs()
	const game = {
		mo_ap: Engine.mo.MO_AP_CHOICE_5,
		mo_cp: Engine.mo.MO_RUSSIA
	}

	Engine.mo.states.mo_choice_ap.choose_mesopotamia(game, log)

	expect(logs).toEqual(["AP：英军 (美索不达米亚)", "CP：俄国"])
	expect(logs.join("\n")).not.toContain("Choice needed")
	expect(logs.join("\n")).not.toContain("协约国选择")
})
