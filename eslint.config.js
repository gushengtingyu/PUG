const js = require("@eslint/js")

const baseRules = {
	"no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
}

const nodeGlobals = {
	require: "readonly",
	module: "readonly",
	exports: "readonly",
	__dirname: "readonly",
	process: "readonly",
	Buffer: "readonly",
	console: "readonly",
	setTimeout: "readonly",
	clearTimeout: "readonly",
	setInterval: "readonly",
	clearInterval: "readonly"
}

const browserGlobals = {
	view: "readonly",
	params: "readonly",
	window: "readonly",
	document: "readonly",
	navigator: "readonly",
	fetch: "readonly",
	localStorage: "readonly",
	alert: "readonly",
	Image: "readonly",
	console: "readonly",
	setTimeout: "readonly",
	clearTimeout: "readonly",
	setInterval: "readonly",
	clearInterval: "readonly",
	action_button: "readonly",
	send_action: "readonly",
	scroll_into_view: "readonly",
	module: "readonly"
}

module.exports = [
	{
		ignores: ["node_modules/**", "cards.CN/**", "cards.EN/**", "pieces/**", "info/**", "alpine.js", "temp*.js"]
	},
	js.configs.recommended,
	{
		files: ["**/*.js"],
		ignores: ["**/play.js", "**/alpine.js", "**/layout.js", "vitest.config.js"],
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: "script",
			globals: nodeGlobals
		},
		rules: baseRules
	},
	{
		files: ["vitest.config.js"],
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: "module",
			globals: nodeGlobals
		},
		rules: baseRules
	},
	{
		files: ["**/play.js", "**/alpine.js", "**/layout.js"],
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: "script",
			globals: browserGlobals
		},
		rules: baseRules
	},
	{
		files: ["**/tests/**/*.js", "**/*.test.js"],
		languageOptions: {
			globals: {
				describe: "readonly",
				test: "readonly",
				expect: "readonly",
				global: "readonly"
			}
		}
	}
]
