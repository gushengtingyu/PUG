const rules = require("../rules.js")
const Engine = require("../modules/engine.js")

const { setupGame, findSpace } = require("./helpers.js")

const { AP, CP } = Engine.constants
const AP_ROLE = rules.roles[0]
const CP_ROLE = rules.roles[1]

function getSinglePieceMoveOptions(game, piece, from) {
	game.active = AP
	game.state = "move_stack"
	game.ops = 1
	game.card_ops = 1
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = { move: 0, attack: 0 }
	game.attacked = []
	game.retreated = []
	game.moved = []
	game.move = {
		initial: from,
		current: from,
		spaces_moved: 0,
		pieces: [piece],
		touched_spaces: [from]
	}
	game.pieces[piece] = from
	return rules.view(game, AP_ROLE).actions.space || []
}

test("未建立 marker 的 beachhead 不会进入断补翻控制链路", () => {
	let game = setupGame(2026042101)
	let suvlaBay = findSpace("Suvla Bay")

	expect(Engine.map.is_beachhead_space(game, suvlaBay)).toBe(false)
	expect(Engine.map.get_space_controller(game, suvlaBay)).toBe(AP)

	Engine.map.check_supply(game)

	expect(game.oos_spaces || []).not.toContain(suvlaBay)
	expect(Engine.map.get_space_controller(game, suvlaBay)).toBe(AP)
})

test("运行时不能把 beachhead 写成 CP 控制", () => {
	let game = setupGame(2026042102)
	let suvlaBay = findSpace("Suvla Bay")
	let toAdana = findSpace("To Adana")

	Engine.set_control(game, suvlaBay, CP)
	Engine.set_control(game, toAdana, CP)

	expect(Engine.map.get_space_controller(game, suvlaBay)).toBe(AP)
	expect(Engine.map.get_space_controller(game, toAdana)).toBe("neutral")
	expect(game.control[suvlaBay]).toBe(AP)
	expect(game.control[toAdana]).toBe("neutral")
})

test("旧坏档里的 beachhead CP 控制会在加载归一化时被清洗", () => {
	let game = setupGame(2026042103)
	let suvlaBay = findSpace("Suvla Bay")
	let toAdana = findSpace("To Adana")

	game.control[suvlaBay] = CP
	game.control[toAdana] = CP

	Engine.setup.normalize_game(game)

	expect(game.control[suvlaBay]).toBe(AP)
	expect(game.control[toAdana]).toBe("neutral")
	expect(Engine.map.get_space_controller(game, suvlaBay)).toBe(AP)
	expect(Engine.map.get_space_controller(game, toAdana)).toBe("neutral")
})

test("Beirut 滩头上的 AP SCU 在 attack 阶段可以选择进攻 Beirut", () => {
	let game = setupGame(2026042104)
	let toBeirut = findSpace("To Beirut")
	let beirut = findSpace("Beirut")
	let cyprus = findSpace("Cyprus")
	let attacker = Engine.data.pieces.findIndex((piece) => piece && piece.faction === AP && piece.lf === 1)
	let defender = Engine.data.pieces.findIndex((piece) => piece && piece.faction === CP && piece.lf === 1)

	game.active = AP
	game.state = "attack"
	game.events.egyptian_coup = true
	game.control[cyprus] = AP
	game.beachheads = [toBeirut]
	game.activated = { move: [], attack: [toBeirut] }
	game.region_activations = { move: {}, attack: {} }
	game.attacked = []
	game.retreated = []
	delete game.attack
	delete game.attack_eligibility_cache

	game.pieces[attacker] = toBeirut
	game.pieces[defender] = beirut

	let attackView = rules.view(game, AP_ROLE)
	expect(attackView.actions.piece || []).toContain(attacker)

	game = rules.action(game, AP_ROLE, "piece", attacker)
	let targetView = rules.view(game, AP_ROLE)
	expect(targetView.actions.space || []).toContain(beirut)
})

test("Besika Bay 的 beachhead 单位可以激活并进攻 Kum Kale 空堡", () => {
	let game = setupGame(2026042205)
	let besikaBay = findSpace("Besika Bay")
	let kumKale = findSpace("Kum Kale")
	let attacker = Engine.game_utils.find_piece(AP, "BR DIV #4")

	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === besikaBay || game.pieces[p] === kumKale) game.pieces[p] = 0
	}

	rules.set_add(game.beachheads, besikaBay)
	game.pieces[attacker] = besikaBay
	game.active = AP
	game.state = "activate_spaces"
	game.ops = 1
	game.card_ops = 1
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = { move: 0, attack: 0 }
	game.attacked = []
	game.retreated = []

	let activationView = rules.view(game, AP_ROLE)
	expect(activationView.actions.activate_attack || []).toContain(besikaBay)

	expect(rules.get_attackable_spaces([attacker])).toContain(kumKale)
})

test("Gallipoli build-up 完成后将滩头保留在预备而不是立即上图", () => {
	let game = setupGame(2026042206)
	let lemnos = findSpace("Lemnos")
	let besikaBay = findSpace("Besika Bay")

	game.active = AP
	game.state = "event_gallipoli_invasion_flip"
	game.event_ctx = {
		key: "gallipoli_invasion",
		data: {
			beachheads_to_place: 2,
			allowed_beachhead_area: "gallipoli",
			allowed_beachhead_island_base: lemnos,
			invasion_island_base: lemnos,
			flip_lcu_if_scu: true
		}
	}

	game = rules.action(game, AP_ROLE, "done")

	expect(game.beachheads || []).not.toContain(besikaBay)
	expect(game.unplaced_beachheads).toBe(2)
})

test("通用 reserve 只能用于合法的空潜在滩头，并在首次进入时自动建滩停步", () => {
	let game = setupGame(2026042207)
	let lemnos = findSpace("Lemnos")
	let besikaBay = findSpace("Besika Bay")
	let toBeirut = findSpace("To Beirut")
	let attacker = Engine.game_utils.find_piece(AP, "BR DIV #4")

	game.pieces[attacker] = lemnos
	game.unplaced_beachheads = 1
	game.active = AP
	game.move = {
		initial: lemnos,
		current: lemnos,
		spaces_moved: 0,
		pieces: [attacker],
		touched_spaces: [lemnos]
	}
	game.state = "move_stack"

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space || []).toContain(besikaBay)
	expect(view.actions.space || []).not.toContain(toBeirut)
	expect(Engine.map.can_ap_initiate_invasion_to_beachhead(game, lemnos, besikaBay, AP)).toBe(true)
	expect(Engine.map.can_ap_initiate_invasion_to_beachhead(game, lemnos, toBeirut, AP)).toBe(false)

	game = rules.action(game, AP_ROLE, "space", besikaBay)

	expect(game.beachheads || []).toContain(besikaBay)
	expect(game.pieces[attacker]).toBe(besikaBay)
	expect(game.unplaced_beachheads).toBe(0)
	expect(game.state).not.toBe("move_stack")
})

test("叙利亚登陆触发圣战放置后继续协约国移动流程", () => {
	let game = setupGame(2026051201)
	let cyprus = findSpace("Cyprus")
	let toBeirut = findSpace("To Beirut")
	let first = Engine.game_utils.find_piece(AP, "BR DIV #1")
	let second = Engine.game_utils.find_piece(AP, "BR DIV #2")

	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === cyprus || game.pieces[p] === toBeirut) game.pieces[p] = 0
	}

	game.active = AP
	game.events.egyptian_coup = true
	game.control[cyprus] = AP
	game.unplaced_beachheads = 1
	game.pieces[first] = cyprus
	game.pieces[second] = cyprus
	game.activated = { move: [cyprus], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = { move: 0, attack: 0 }
	game.moved = []
	game.attacked = []
	game.retreated = []
	game.state = "move_stack"
	game.move = {
		initial: cyprus,
		current: cyprus,
		spaces_moved: 0,
		pieces: [first],
		touched_spaces: [cyprus],
		faction: AP
	}

	game = rules.action(game, AP_ROLE, "space", toBeirut)

	expect(game.state).toBe("jihad_placement")
	expect(game.state_stack[game.state_stack.length - 1].state).toBe("choose_pieces_to_move")

	game = rules.action(game, CP_ROLE, "done")

	expect(game.state).toBe("choose_pieces_to_move")
	expect(game.active).toBe(AP)
	expect(game.move.initial).toBe(cyprus)
	expect(rules.view(game, AP_ROLE).actions.piece || []).toContain(second)
})

test("Salonika build-up 完成后只增加通用 reserve", () => {
	let game = setupGame(2026042208)
	let lemnos = findSpace("Lemnos")

	game.active = AP
	game.state = "event_salonika_invasion_sr"
	game.event_ctx = {
		key: "salonika_invasion",
		data: {
			beachheads_to_place: 1,
			invasion_island_base: lemnos,
			allow_sr_to_island: 0
		}
	}

	game = rules.action(game, AP_ROLE, "done")

	expect(game.unplaced_beachheads).toBe(1)
})

test("Kitchener 例外入侵不能通过 skip 把滩头存入预备", () => {
	let game = setupGame(2026042209)

	game.active = AP
	game.state = "event_invasion_place_beachhead"
	game.event_ctx = {
		key: "kitcheners_invasion",
		data: {
			beachheads_to_place: 1,
			direct_to_beachhead: true,
			allow_beachhead_reserve_box: false
		}
	}

	game = rules.action(game, AP_ROLE, "skip")

	expect(game.unplaced_beachheads || 0).toBe(0)
	expect(game.event_ctx.data.beachheads_to_place).toBe(1)
	expect(game.state).toBe("event_invasion_place_beachhead")
})

test("AP 后续行动轮开始时不会进入旧的显式预备滩头放置流程", () => {
	let game = setupGame(2026042210)

	game.unplaced_beachheads = 1
	game.active = CP
	game.action_round = 1
	game.state = "end_operations"

	game = rules.action(game, rules.roles[1], "end_action")

	expect(game.active).toBe(AP)
	expect(game.action_round).toBe(2)
	expect(game.state).toBe("play_card")

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.reserve_beachhead || []).toHaveLength(0)
})

test("进入空潜在滩头没有 reserve marker 时不合法", () => {
	let game = setupGame(2026042211)
	let lemnos = findSpace("Lemnos")
	let besikaBay = findSpace("Besika Bay")
	let attacker = Engine.game_utils.find_piece(AP, "BR DIV #4")

	game.unplaced_beachheads = 0
	game.pieces[attacker] = lemnos
	game.active = AP
	game.move = {
		initial: lemnos,
		current: lemnos,
		spaces_moved: 0,
		pieces: [attacker],
		touched_spaces: [lemnos]
	}
	game.state = "move_stack"

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space || []).not.toContain(besikaBay)
	expect(Engine.map.can_ap_initiate_invasion_to_beachhead(game, lemnos, besikaBay, AP)).toBe(false)
})

test("进入已有滩头按普通移动处理，不会再次消耗 reserve marker", () => {
	let game = setupGame(2026042212)
	let lemnos = findSpace("Lemnos")
	let besikaBay = findSpace("Besika Bay")
	let attacker = Engine.game_utils.find_piece(AP, "FR DIV #1")

	game.pieces[attacker] = lemnos
	game.beachheads = [besikaBay]
	game.unplaced_beachheads = 1
	game.active = AP
	game.move = {
		initial: lemnos,
		current: lemnos,
		spaces_moved: 0,
		pieces: [attacker],
		touched_spaces: [lemnos]
	}
	game.state = "move_stack"

	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space || []).toContain(besikaBay)

	game = rules.action(game, AP_ROLE, "space", besikaBay)

	expect(game.pieces[attacker]).toBe(besikaBay)
	expect(game.unplaced_beachheads).toBe(1)
	expect(game.state).toBe("move_stack")
	expect(game.move.current).toBe(besikaBay)
})

test("移除空滩头时只需要清掉 beachhead marker", () => {
	let game = setupGame(2026042213)
	let besikaBay = findSpace("Besika Bay")

	game.active = AP
	game.state = "confirm_remove_beachhead"
	game.remove_beachhead_space = besikaBay
	game.beachheads = [besikaBay]

	game = rules.action(game, AP_ROLE, "confirm")

	expect(game.beachheads || []).not.toContain(besikaBay)
})

test("Cyprus 宀涘熀鍦颁笂鐨?AP 鍗曚綅鍙互澧炴彺 To Haifa beachhead", () => {
	let game = setupGame(2026042307)
	let cyprus = findSpace("Cyprus")
	let toHaifa = findSpace("To Haifa")
	let attacker = Engine.game_utils.find_piece(AP, "BR DIV #4")

	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === cyprus || game.pieces[p] === toHaifa) game.pieces[p] = 0
	}

	game.events.egyptian_coup = true
	game.control[cyprus] = AP
	game.beachheads = [toHaifa]

	let options = getSinglePieceMoveOptions(game, attacker, cyprus)
	expect(options).toContain(toHaifa)
})

test("To Haifa beachhead 鍦ㄥ宀告棤鏁屽啗鏃跺彲浠ョЩ鍔ㄥ埌 Haifa", () => {
	let game = setupGame(2026042308)
	let toHaifa = findSpace("To Haifa")
	let haifa = findSpace("Haifa")
	let attacker = Engine.game_utils.find_piece(AP, "BR DIV #4")

	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === toHaifa || game.pieces[p] === haifa) game.pieces[p] = 0
	}

	game.events.egyptian_coup = true
	game.beachheads = [toHaifa]

	let options = getSinglePieceMoveOptions(game, attacker, toHaifa)
	expect(options).toContain(haifa)
})

test("Besika Bay beachhead 鍦ㄥ宀告棤鏁屽啗鏃跺彲浠ョЩ鍔ㄥ埌 Kum Kale", () => {
	let game = setupGame(2026042309)
	let besikaBay = findSpace("Besika Bay")
	let kumKale = findSpace("Kum Kale")
	let attacker = Engine.game_utils.find_piece(AP, "BR DIV #4")

	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === besikaBay || game.pieces[p] === kumKale) game.pieces[p] = 0
	}

	game.beachheads = [besikaBay]
	game.forts = game.forts || { destroyed: [] }
	rules.set_add(game.forts.destroyed, kumKale)

	let options = getSinglePieceMoveOptions(game, attacker, besikaBay)
	expect(options).toContain(kumKale)
})

test("LCU cannot use a beachhead created earlier in the same action round", () => {
	let game = setupGame(2026051501)
	let lemnos = findSpace("Lemnos")
	let besikaBay = findSpace("Besika Bay")
	let lcu = Engine.game_utils.find_piece(AP, "BR VIII Corps")
	let scu = Engine.game_utils.find_piece(AP, "BR DIV #4")

	for (let p = 0; p < game.pieces.length; p++) {
		if (game.pieces[p] === lemnos || game.pieces[p] === besikaBay) game.pieces[p] = 0
	}

	game.pieces[lcu] = lemnos
	game.pieces[scu] = lemnos
	game.unplaced_beachheads = 1
	game.active = AP
	game.state = "activate_spaces"
	game.ops = 2
	game.card_ops = 2
	game.activated = { move: [], attack: [] }
	game.region_activations = { move: {}, attack: {} }
	game.activation_cost = {}
	game.moved = []
	game.attacked = []
	game.retreated = []

	game = rules.action(game, AP_ROLE, "activate_move", lemnos)
	game = rules.action(game, AP_ROLE, "piece", scu)
	game = rules.action(game, AP_ROLE, "confirm")
	game = rules.action(game, AP_ROLE, "activate_move", lemnos)
	game = rules.action(game, AP_ROLE, "piece", lcu)
	game = rules.action(game, AP_ROLE, "confirm")

	game = rules.action(game, AP_ROLE, "piece", scu)
	expect(rules.view(game, AP_ROLE).actions.space || []).toContain(besikaBay)
	game = rules.action(game, AP_ROLE, "space", besikaBay)

	expect(game.beachheads || []).toContain(besikaBay)
	expect(game.beachheads_placed_this_action_round || []).toContain(besikaBay)
	expect(game.pieces[scu]).toBe(besikaBay)

	game = rules.action(game, AP_ROLE, "piece", lcu)
	let view = rules.view(game, AP_ROLE)
	expect(view.actions.space || []).not.toContain(besikaBay)
	expect(Engine.map.can_stack_move_to(game, besikaBay, AP)).toBe(false)
})
