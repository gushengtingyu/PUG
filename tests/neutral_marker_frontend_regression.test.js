"use strict"

const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")

function read(file) {
	return fs.readFileSync(path.join(root, file), "utf8")
}

test("neutral marker visibility is resilient to async layout initialization", () => {
	const play = read("play.js")

	expect(play).toContain('{ id: "neutral_gr", key: "neutral_gr_UI", nation: "gr", entry: "entry_gr" }')
	expect(play).toContain('{ id: "neutral_bu", key: "neutral_bu_UI", nation: "bu", entry: "entry_bu" }')
	expect(play).toContain('{ id: "neutral_ro", key: "neutral_ro_UI", nation: "ro", entry: "entry_ro" }')
	expect(play).toContain('{ id: "neutral_sb", key: "neutral_SB_UI", nation: "sb", entry: "entry_sb" }')

	expect(play).toContain("function get_neutral_marker_element(marker)")
	expect(play).toContain("elt = document.getElementById(marker.id)")
	expect(play).toContain("apply_neutral_marker_visibility(marker, get_neutral_marker_element(marker))")
	expect(play).toContain("apply_neutral_marker_visibility(marker, elt)")
	expect(play).toContain("elt.hidden = hidden")
	expect(play).not.toContain("if (!ui.neutral) {\n\t\treturn\n\t}")
})

test("neutral markers fade on pointer overlap without blocking map hit testing", () => {
	const play = read("play.js")
	const css = read("play.css")

	expect(css).toMatch(/\.marker\.neutral\s*\{[\s\S]*pointer-events:\s*none/)
	expect(css).toMatch(/\.marker\.neutral\.neutral-peek\s*\{[\s\S]*opacity:\s*0\.35/)
	expect(play).toContain("function update_neutral_marker_peek(evt)")
	expect(play).toContain('ui.map.classList.contains("hide_markers")')
	expect(play).toContain("window.requestAnimationFrame(flush_neutral_marker_peek)")
	expect(play).toContain('map.addEventListener("pointermove", update_neutral_marker_peek)')
	expect(play).toContain('map.addEventListener("pointerleave", clear_neutral_marker_peek)')
})
