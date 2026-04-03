const rules = require("../rules.js")
let game = rules.setup(12345, "Historical", { seven_hand_size: false, no_supply_warnings: false })

console.log("Game turn:", game.turn)
console.log("Game active:", game.active)
console.log("Game state:", game.state)

let view = rules.view(game, "Central Powers")
console.log("Actions available for CP:", view.actions)
console.log("Retreated initialized:", Array.isArray(game.retreated))
