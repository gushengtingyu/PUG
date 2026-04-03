const rules = require("../rules.js")

let game = rules.setup(1, "Campaign", {})
let view = rules.view(game, "Allied Powers")

let q1 = rules.query(game, "AP", "ap_supply")
console.log("AP Supply Query:", Object.keys(q1).join(", "))
let q2 = rules.query(game, "CP", "cp_supply")
console.log("CP Supply Query:", Object.keys(q2).join(", "))
console.log("Initial prompt:", view.prompt)
console.log("Done")
