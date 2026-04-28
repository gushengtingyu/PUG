"use strict"

const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")

function read(file) {
	return fs.readFileSync(path.join(root, file), "utf8")
}

function collectRelativeCssUrls(file) {
	const text = read(file)
	const urls = []
	for (const match of text.matchAll(/url\(([^)]+)\)/g)) {
		const url = match[1].trim().replace(/^["']|["']$/g, "")
		if (url.startsWith("/") || url.startsWith("data:") || /^[a-z]+:/i.test(url)) {
			continue
		}
		urls.push({ file, url })
	}
	return urls
}

test("frontend CSS relative asset URLs resolve", () => {
	const missing = []
	for (const item of [
		...collectRelativeCssUrls("play.css"),
		...collectRelativeCssUrls("images.css"),
		...collectRelativeCssUrls("colors.css")
	]) {
		if (!fs.existsSync(path.join(root, item.url))) {
			missing.push(`${item.file}: ${item.url}`)
		}
	}
	expect(missing).toEqual([])
})

test("play page only loads active title scripts", () => {
	const html = read("play.html")
	expect(html).not.toContain("alpine.js")
	expect(html).toContain('src="/common/client.js"')
	expect(html).toContain('src="play.js"')
})

test("title metadata is present for RTT registration", () => {
	const titleSql = read("title.sql")
	expect(titleSql).toContain("'pursuit-of-glory'")
	expect(titleSql).toContain("'Pursuit of Glory'")
})
