const rules = require("./rules.js")
const data = require("./data.js")

let game = rules.setup(1, "Campaign", {})
let view = rules.view(game, "AP")

let q1 = rules.query(game, "AP", "ap_supply")
console.log("AP Supply Query:", Object.keys(q1).join(", "))
let q2 = rules.query(game, "CP", "cp_supply")
console.log("CP Supply Query:", Object.keys(q2).join(", "))
console.log("Done")