const rules = require("../rules.js");

/**
 * 规则运行冒烟测试框架
 */

test("Activation flow", () => {
    let game = rules.setup(1, "Historical", { seed: 42 });
    
    // 示例：验证初始激活逻辑
    // let view = rules.view(game, game.active);
})
