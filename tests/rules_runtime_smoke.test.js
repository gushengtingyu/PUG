const rules = require("../rules.js");

/**
 * 规则运行冒烟测试框架
 */

function test_activation_flow() {
    console.log("Running: test_activation_flow");
    let game = rules.setup(1, "Historical", { seed: 42 });
    
    // 示例：验证初始激活逻辑
    // let view = rules.view(game, game.active);
    
    console.log("Smoke test completed.");
}

// 执行测试
try {
    test_activation_flow();
} catch (e) {
    console.error("Test failed:", e);
    process.exit(1);
}
