const rules = require("../rules.js")

let game = rules.setup(1, "Historical", { seven_hand_size: false, no_supply_warnings: false })
console.log("rules.js loaded successfully")
console.log("Initial state:", game.state)
