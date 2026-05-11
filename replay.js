"use strict"

;(function () {

const module_cache = new Map()
const text_encoder = new TextEncoder()
const text_decoder = new TextDecoder()

function make_buffer(value, encoding) {
	let bytes
	if (typeof value === "string") {
		if (encoding === "base64")
			bytes = base64_to_bytes(value)
		else
			bytes = text_encoder.encode(value)
	} else if (value instanceof ArrayBuffer) {
		bytes = new Uint8Array(value)
	} else if (ArrayBuffer.isView(value)) {
		bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
	} else {
		bytes = new Uint8Array(value || [])
	}

	bytes.toString = function (enc = "utf8") {
		if (enc === "base64")
			return bytes_to_base64(bytes)
		if (enc === "utf8" || enc === "utf-8")
			return text_decoder.decode(bytes)
		return Array.prototype.join.call(bytes, ",")
	}

	return bytes
}

function bytes_to_base64(bytes) {
	let text = ""
	for (let i = 0; i < bytes.length; i += 0x8000) {
		let chunk = bytes.subarray(i, i + 0x8000)
		text += String.fromCharCode.apply(null, chunk)
	}
	return btoa(text)
}

function base64_to_bytes(text) {
	let bin = atob(text)
	let bytes = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; ++i)
		bytes[i] = bin.charCodeAt(i)
	return bytes
}

function install_buffer_shim() {
	if (typeof window.Buffer === "undefined")
		window.Buffer = { from: make_buffer }
}

const fake_zlib = {
	deflateSync(input) {
		return make_buffer(input)
	},
	inflateSync(input) {
		return make_buffer(input)
	}
}

function normalize_module_url(path, parent_url) {
	if (path === "zlib")
		return "node:zlib"
	if (!path.endsWith(".js"))
		path += ".js"
	let base = parent_url ? new URL(".", parent_url) : new URL("./", window.location.href)
	return new URL(path, base).href
}

async function pug_require(path, parent_url = null) {
	let url = normalize_module_url(path, parent_url)

	if (url === "node:zlib")
		return fake_zlib

	if (module_cache.has(url))
		return module_cache.get(url).exports

	let module = { exports: {} }
	module_cache.set(url, module)

	let response = await fetch(url)
	if (!response.ok)
		throw new Error(`Cannot load replay module ${path}: HTTP ${response.status} (${url})`)

	let source = await response.text()
	let deps = new Set()
	for (let match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g))
		deps.add(match[1])

	for (let dep of deps)
		await pug_require(dep, url)

	function local_require(dep) {
		let dep_url = normalize_module_url(dep, url)
		if (dep_url === "node:zlib")
			return fake_zlib
		let dep_module = module_cache.get(dep_url)
		if (!dep_module)
			throw new Error(`Replay module ${dep} was not preloaded from ${url}`)
		return dep_module.exports
	}

	Function("module", "exports", "require", source)(module, module.exports, local_require)
	return module.exports
}

async function load_common_replay_with_pug_loader() {
	try {
		install_buffer_shim()
		window.__pug_replay_require = (path) => pug_require(path)

		let response = await fetch("/common/replay.js")
		if (!response.ok)
			throw new Error(`Cannot load common replay script: HTTP ${response.status}`)

		let source = await response.text()
		let patched = source.replace(
			/async function require\(path\) \{[\s\S]*?\r?\n\}\r?\n\r?\nfunction snap_from_state/,
			"async function require(path) {\n\treturn window.__pug_replay_require(path)\n}\n\nfunction snap_from_state"
		)
		if (patched === source)
			throw new Error("Cannot patch common replay loader")
		source = patched

		let script = document.createElement("script")
		script.text = source + "\n//# sourceURL=/pursuit-of-glory/replay-common-adapter.js"
		document.body.appendChild(script)
	} catch (err) {
		console.error(err)
		document.getElementById("prompt").textContent = "ERROR loading replay: " + err
	}
}

load_common_replay_with_pug_loader()

})()
