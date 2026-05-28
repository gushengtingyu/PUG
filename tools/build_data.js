const fs = require("fs")
const path = require("path")

const CSV_DIR = path.join(__dirname, "../csv")
const OUTPUT_FILE = path.join(__dirname, "../data.js")

function parseCSV(filePath) {
	if (!fs.existsSync(filePath)) return []
	const content = fs.readFileSync(filePath, "utf8")
	const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
	const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""))
	const data = []
	for (let i = 1; i < lines.length; i++) {
		const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""))
		const obj = {}
		headers.forEach((h, index) => {
			let val = values[index]
			if (val === undefined) return
			if (val === "") return
			// Convert types
			if (val.toLowerCase() === "true") val = true
			else if (val.toLowerCase() === "false") val = false
			else if (!isNaN(val) && val !== "") val = Number(val)
			obj[h.trim()] = val
		})
		data.push(obj)
	}
	return data
}

function createGeneratedGapSpace(id) {
	return {
		id,
		name: "Generated Gap",
		type: "generated_gap",
		generated: true
	}
}

const piecesRaw = parseCSV(path.join(CSV_DIR, "pieces.csv"))
const apNations = new Set()
const cpNations = new Set()
piecesRaw.forEach((p) => {
	const faction = (p.faction || "").toString().toLowerCase()
	const nation = (p.nation || "").toString().toLowerCase()
	if (!nation) return
	if (faction === "ap") apNations.add(nation)
	if (faction === "cp") cpNations.add(nation)
})

// 1. Load Spaces
console.log("Loading spaces...")
const spacesRaw = parseCSV(path.join(CSV_DIR, "spaces.csv"))
const reinforcementsRaw = parseCSV(path.join(CSV_DIR, "reinforcements.csv"))

const spaces = [{}] // 1-based index, so index 0 is empty
const spaceMap = new Map() // name -> id
const spaceMapLower = new Map() // lower_name -> id

// Process Spaces
spacesRaw.forEach((s) => {
	// Ensure numeric fields
	;["x", "y", "w", "h", "vp", "fort", "port", "capital", "card"].forEach((k) => {
		if (s[k] !== undefined) s[k] = Number(s[k])
	})

	if (s.jihad_city === "true" || s.jihad_city === true || s.jihad_city === "1" || s.jihad_city === 1)
		s.jihad_city = true
	else delete s.jihad_city

	if (s.tribal_activity_grid) {
		// Keep it as is (e.g. "Bakhtiari")
	} else {
		delete s.tribal_activity_grid
	}

	if (s.island_base === "true" || s.island_base === true) s.island_base = true
	// Keep port as is (1=CP, 2=AP)
	if (!s.port) delete s.port

	// Normalize string fields
	if (s.region) s.region = s.region.toLowerCase()
	if (s.area) s.area = s.area.toLowerCase()

	spaces[s.id] = s
	spaceMap.set(s.name, s.id)
	if (s.name) spaceMapLower.set(s.name.toLowerCase(), s.id)
})

// 1.1 Process Reinforcements (Support for # multi-tokens)
console.log("Processing reinforcements...")
reinforcementsRaw.forEach((s) => {
	// Numeric fields
	;["x", "y", "w", "h", "vp", "fort", "port", "capital", "card"].forEach((k) => {
		if (s[k] !== undefined) s[k] = Number(s[k])
	})

	const originalName = s.name || ""

	// Note: We create individual slots for each token if name has #,
	// so that pieces can map to their specific slot if needed.
	// But usually, they should just map to the same base name.
	// For simplicity, we just add the entry to spaces.
	// If it's a multi-token entry, we register each individual name in the map.

	spaces[s.id] = s
	spaceMap.set(s.name, s.id)
	if (s.name) spaceMapLower.set(s.name.toLowerCase(), s.id)

	if (originalName.includes("#")) {
		// Extract base name, e.g. "Egypt Rebel" from "Egypt Rebel #1 #2 #3"
		const base = originalName.split("#")[0].trim()
		const parts = originalName.split("#").map((p) => p.trim())
		const tokens = parts.slice(1).flatMap((p) => p.split(/\s+/))
		tokens.forEach((t) => {
			if (!t) return
			const fullName = `${base} #${t}`
			spaceMap.set(fullName, s.id)
			spaceMapLower.set(fullName.toLowerCase(), s.id)
		})
	}
})

console.log(`Loaded ${spaces.length} spaces.`)

// Fill gaps if any (though usually IDs are contiguous)
for (let i = 0; i < spaces.length; i++) {
	if (!spaces[i]) spaces[i] = createGeneratedGapSpace(i)
}

// 1a. Load UI (inserted early for setup)
console.log("Loading ui...")
const uiRaw = parseCSV(path.join(CSV_DIR, "ui.csv"))
const ui = uiRaw.map((u) => {
	// Ensure numeric fields
	;["x", "y", "w", "h"].forEach((k) => {
		if (u[k] !== undefined) u[k] = Number(u[k])
	})

	// Add UI locations as valid spaces for setup
	let name = u.key
	if (name && !spaceMap.has(name)) {
		let id = spaces.length
		let s = {
			id: id,
			name: name,
			x: u.x,
			y: u.y,
			type: "ui"
		}
		spaces.push(s)
		spaceMap.set(name, id)
		if (s.name) spaceMapLower.set(s.name.toLowerCase(), id)
	}

	return u
})

// 2. Load Edges
console.log("Loading edges...")
const edgesRaw = parseCSV(path.join(CSV_DIR, "edges.csv"))
const adj = Array(spaces.length)
	.fill()
	.map(() => [])
const lim_adj = Array(spaces.length)
	.fill()
	.map(() => ({}))
const rail_adj = Array(spaces.length)
	.fill()
	.map(() => [])
const conn_types = Array(spaces.length)
	.fill()
	.map(() => ({}))
const conn_straits = Array(spaces.length)
	.fill()
	.map(() => ({}))
const conn_crossings = Array(spaces.length)
	.fill()
	.map(() => ({}))
const conn_nations = Array(spaces.length)
	.fill()
	.map(() => ({}))
const conn_flags = Array(spaces.length)
	.fill()
	.map(() => ({}))

edgesRaw.forEach((e) => {
	const a = Number(e.a)
	const b = Number(e.b)
	if (!spaces[a] || !spaces[b]) {
		// console.warn(`Invalid edge: ${a} <-> ${b}`);
		return
	}

	const rawNations = e.nations
		? String(e.nations)
				.split(";")
				.map((n) => n.trim())
				.filter(Boolean)
		: []
		
	const nationTokens = rawNations.map((n) => n.toLowerCase())
	let nations = []
	nationTokens.forEach((n) => {
		if (n === "ap") {
			apNations.forEach((v) => nations.push(v))
		} else if (n === "cp") {
			cpNations.forEach((v) => nations.push(v))
		} else if (n === "arab") {
			nations.push("ar")
		} else if (n === "arab_and_tu") {
			nations.push("ar", "tu", "tua")
		} else if (n === "s") {
			nations.push("senussi")
		} else if (n === "no_tribe") {
			apNations.forEach((v) => { if (v !== "tr") nations.push(v) })
			cpNations.forEach((v) => { if (v !== "tr") nations.push(v) })
		} else {
			nations.push(n)
		}
	})
	nations = [...new Set(nations)]

	let type = e.type || ""
	let strait = null
	const flags = e.flags
		? String(e.flags)
				.split(";")
				.map((f) => f.trim())
				.filter(Boolean)
		: []

	// Strict Flags Logic: Flags serve Type
	if (type === "strait") {
		// Find strait number in flags
		for (const token of flags) {
			if (/^\d+$/.test(token)) {
				strait = Number(token)
				break
			}
		}
	} else if (type === "rail") {
		// Check for conditional rail events
		for (const token of flags) {
			if (token.startsWith("event_")) {
				type = "conditional_rail"
				break
			}
		}
	}
	// For 'green', 'caspian' is just a flag, passed naturally below.
	// No other type modifications based on flags.

	// Crossing Logic (0-3)
	// Crossing marks a water-crossing combat side only. Values 2/3 are
	// kept as authored metadata (used by map tooling for orientation), but
	// they must not make the map connection one-way for movement or attack.
	let crossing_val = 0
	if (e.crossing !== undefined && e.crossing !== "") {
		crossing_val = Number(e.crossing)
	}

	let crossing_type = null

	if (crossing_val === 1) {
		crossing_type = "bidirectional"
	} else if (crossing_val === 2) {
		crossing_type = "a_to_b"
	} else if (crossing_val === 3) {
		crossing_type = "b_to_a"
	}

	conn_types[a][b] = type
	conn_types[b][a] = type

	if (strait !== null && !Number.isNaN(strait)) {
		conn_straits[a][b] = strait
		conn_straits[b][a] = strait
	}

	if (flags.length > 0) {
		conn_flags[a][b] = flags
		conn_flags[b][a] = flags
	}

	if (nationTokens.length > 0) {
		conn_nations[a][b] = nationTokens
		conn_nations[b][a] = nationTokens
	}

	if (crossing_type) {
		// Store only the attack direction that crosses water; movement adjacency
		// remains bidirectional below.
		if (crossing_type === "bidirectional") {
			conn_crossings[a][b] = crossing_type
			conn_crossings[b][a] = crossing_type
		} else if (crossing_type === "a_to_b") {
			conn_crossings[a][b] = crossing_type
		} else if (crossing_type === "b_to_a") {
			conn_crossings[b][a] = crossing_type
		}
	}

	// Determine if it's a restricted edge
	if (nations.length === 0) {
		// Standard connection
		if (!adj[a].includes(b)) adj[a].push(b)
		if (type === "rail" || type === "conditional_rail") {
			if (!rail_adj[a].includes(b)) rail_adj[a].push(b)
		}
		if (!adj[b].includes(a)) adj[b].push(a)
		if (type === "rail" || type === "conditional_rail") {
			if (!rail_adj[b].includes(a)) rail_adj[b].push(a)
		}
	} else {
		// Limited connection
		nations.forEach((n) => {
			if (!lim_adj[a][n]) lim_adj[a][n] = []
			if (!lim_adj[b][n]) lim_adj[b][n] = []

			if (!lim_adj[a][n].includes(b)) lim_adj[a][n].push(b)
			if (!lim_adj[b][n].includes(a)) lim_adj[b][n].push(a)
		})
	}
})

// Apply connections to spaces
for (let i = 1; i < spaces.length; i++) {
	if (!spaces[i]) continue

	// Sort connections
	adj[i].sort((a, b) => a - b)
	rail_adj[i].sort((a, b) => a - b)

	spaces[i].connections = adj[i]
	spaces[i].rail_connections = rail_adj[i]
	spaces[i].connection_types = conn_types[i]
	if (Object.keys(conn_straits[i]).length > 0) spaces[i].connection_straits = conn_straits[i]
	if (Object.keys(conn_crossings[i]).length > 0) spaces[i].crossings = conn_crossings[i]
	if (Object.keys(conn_nations[i]).length > 0) spaces[i].connection_nations = conn_nations[i]
	if (Object.keys(conn_flags[i]).length > 0) spaces[i].connection_flags = conn_flags[i]

	if (Object.keys(lim_adj[i]).length > 0) {
		spaces[i].limited_connections = {}
		for (const n in lim_adj[i]) {
			// Merge standard + limited
			const combined = [...new Set([...adj[i], ...lim_adj[i][n]])].sort((a, b) => a - b)
			spaces[i].limited_connections[n] = combined
		}
	}
}

// 3. Load Cards
console.log("Loading cards...")
const cardsRaw = parseCSV(path.join(CSV_DIR, "cards.csv"))
const cards = [{}, ...cardsRaw] // 1-based index
// Ensure numeric fields
cards.forEach((c) => {
	;["ops", "sr", "ws", "rp_a", "rp_br", "rp_ru", "rp_in", "rp_ah", "rp_ge", "rp_tu"].forEach((k) => {
		if (c[k] !== undefined) c[k] = Number(c[k])
	})
	if (c.remove === "TRUE" || c.remove === true) c.remove = true
	if (c.cc === "TRUE" || c.cc === true) c.cc = true

	delete c.effect
})

// 4. Load Pieces
console.log("Loading pieces...")
const pieces = [{}, ...piecesRaw] // 1-based index
pieces.forEach((p) => {
	if (!p.id) return
	;["cf", "lf", "mf", "rcf", "rlf", "rmf"].forEach((k) => {
		if (p[k] !== undefined) p[k] = Number(p[k])
	})
	if (p.notreplaceable === "TRUE" || p.notreplaceable === true) p.notreplaceable = true
})

// Write Output
const output = `
"use strict"

var data = {
	spaces: ${JSON.stringify(spaces, null, "\t")},
	edges: ${JSON.stringify(edgesRaw, null, "\t")}, // Keep raw edges for reference if needed, or structured adj
	pieces: ${JSON.stringify(pieces, null, "\t")},
	cards: ${JSON.stringify(cards, null, "\t")},
	ui: ${JSON.stringify(ui, null, "\t")}
}

// Helper structures if needed
data.space_name = ${JSON.stringify(Object.fromEntries(spaceMap), null, "\t")}

if (typeof module === 'object') {
	module.exports = data
}
`

fs.writeFileSync(OUTPUT_FILE, output)
console.log(`Successfully wrote to ${OUTPUT_FILE}`)
