const http = require("http")
const fs = require("fs")
const path = require("path")

const PORT = 8082
const ROOT = path.resolve(__dirname, "..") // pursuit-of-glory root
const SPACES_PATH = path.join(ROOT, "csv", "spaces.csv")
const EDGES_PATH = path.join(ROOT, "csv", "edges.csv")
const PIECES_PATH = path.join(ROOT, "csv", "pieces.csv")
const CARDS_PATH = path.join(ROOT, "csv", "cards.csv")
const UI_PATH = path.join(ROOT, "csv", "ui.csv")
const REINFORCEMENTS_PATH = path.join(ROOT, "csv", "reinforcements.csv")

const SPACE_HEADERS = [
	"id",
	"map",
	"name",
	"x",
	"y",
	"w",
	"h",
	"nation",
	"faction",
	"terrain",
	"vp",
	"fort",
	"port",
	"capital",
	"region",
	"island_base",
	"beach_for",
	"area",
	"tribal_activity_grid",
	"jihad_city"
]
const EDGE_HEADERS = ["a", "b", "nations", "type", "crossing", "flags", "comment"]
// Determine headers dynamically for pieces/cards to be safe, or define them if fixed.
// Based on file read:
const PIECE_HEADERS = [
	"id",
	"faction",
	"nation",
	"name",
	"cf",
	"lf",
	"mf",
	"rcf",
	"rlf",
	"rmf",
	"rptype",
	"symbol",
	"region_limit",
	"type",
	"badge",
	"piece_class",
	"image_full",
	"image_reduced",
	"romanian_entry",
	"bulgarian_entry"
]
const CARD_HEADERS = [
	"num",
	"faction",
	"commitment",
	"ops",
	"sr",
	"remove",
	"cc",
	"ws",
	"rp_a",
	"rp_br",
	"rp_ru",
	"rp_ah",
	"rp_ge",
	"rp_tu",
	"rp_in",
	"name",
	"event",
	"effect"
]
const UI_HEADERS = ["id", "key", "x", "y", "w", "h"]
const REINFORCEMENT_HEADERS = ["id", "card", "name", "x", "y", "side", "type"]

function isLocalRequest(req) {
	const addr = req.socket.remoteAddress
	return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1"
}

function parseCSVText(text) {
	const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
	if (lines.length === 0) return { headers: [], rows: [] }
	const headers = parseCSVLine(lines[0])
	const rows = lines.slice(1).map((line) => {
		const values = parseCSVLine(line)
		const obj = {}
		headers.forEach((h, i) => (obj[h] = (values[i] ?? "").trim()))
		return obj
	})
	return { headers, rows }
}

function parseCSVLine(line) {
	const values = []
	let current = ""
	let inQuotes = false
	for (let i = 0; i < line.length; i++) {
		const char = line[i]
		if (char === '"') {
			inQuotes = !inQuotes
		} else if (char === "," && !inQuotes) {
			values.push(current.trim())
			current = ""
		} else {
			current += char
		}
	}
	values.push(current.trim())
	return values.map((v) => v.replace(/^"(.*)"$/, "$1"))
}

function buildCSV(headers, rows) {
	let out = headers.join(",") + "\n"
	rows.forEach((r) => {
		out +=
			headers
				.map((h) => {
					let v = r[h] ?? ""
					if (v.includes(",") || v.includes('"')) {
						v = '"' + v.replace(/"/g, '""') + '"'
					}
					return v
				})
				.join(",") + "\n"
	})
	return out
}

function normalizeEdgeKey(a, b) {
	const x = Math.min(a, b)
	const y = Math.max(a, b)
	return `${x}-${y}`
}

const server = http.createServer((req, res) => {
	// CORS headers
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type")

	if (req.method === "OPTIONS") {
		res.writeHead(204)
		res.end()
		return
	}

	// API: Save Data
	if (req.method === "POST" && req.url === "/api/save") {
		if (!isLocalRequest(req)) {
			res.writeHead(403, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ success: false, error: "Forbidden" }))
			return
		}
		let body = ""
		req.on("data", (chunk) => (body += chunk.toString()))
		req.on("end", () => {
			try {
				const data = JSON.parse(body)
				if (data.spaces) {
					fs.writeFileSync(SPACES_PATH, data.spaces, "utf8")
					console.log("Saved spaces.csv")
				}
				if (data.edges) {
					fs.writeFileSync(EDGES_PATH, data.edges, "utf8")
					console.log("Saved edges.csv")
				}
				if (data.pieces) {
					fs.writeFileSync(PIECES_PATH, data.pieces, "utf8")
					console.log("Saved pieces.csv")
				}
				if (data.ui) {
					fs.writeFileSync(UI_PATH, data.ui, "utf8")
					console.log("Saved ui.csv")
				}
				if (data.reinforcements) {
					fs.writeFileSync(REINFORCEMENTS_PATH, data.reinforcements, "utf8")
					console.log("Saved reinforcements.csv")
				}

				res.writeHead(200, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ success: true }))
			} catch (err) {
				console.error(err)
				res.writeHead(500, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ success: false, error: err.message }))
			}
		})
		return
	}

	if (req.method === "POST" && req.url === "/api/save-diff") {
		if (!isLocalRequest(req)) {
			res.writeHead(403, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ success: false, error: "Forbidden" }))
			return
		}
		let body = ""
		req.on("data", (chunk) => (body += chunk.toString()))
		req.on("end", () => {
			try {
				const diff = JSON.parse(body)

				// Helper to apply diffs (generic)
				const applyDiff = (path, headers, diffObj, keyFn, createFn) => {
					if (!diffObj) return
					const text = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : headers.join(",") + "\n"
					const parsed = parseCSVText(text)
					const fileHeaders = parsed.headers.length ? parsed.headers : headers
					// Ensure all headers in default list are present (e.g. if we added 'setup')
					headers.forEach((h) => {
						if (!fileHeaders.includes(h)) fileHeaders.push(h)
					})

					const map = new Map()
					parsed.rows.forEach((r) => map.set(keyFn(r), r))
					;(diffObj.deleted || []).forEach((item) => map.delete(keyFn(item)))
					;[...(diffObj.added || []), ...(diffObj.updated || [])].forEach((item) => {
						const key = keyFn(item)
						const row = createFn(item, fileHeaders)
						map.set(key, row)
					})

					const rows = Array.from(map.values())
					// Sort? Spaces by ID, others maybe not strictly needed or keep original order
					if (path.includes("spaces.csv")) rows.sort((a, b) => parseInt(a.id) - parseInt(b.id))

					fs.writeFileSync(path, buildCSV(fileHeaders, rows), "utf8")
				}

				// SPACES
				applyDiff(
					SPACES_PATH,
					SPACE_HEADERS,
					diff.spaces,
					(r) => parseInt(r.id),
					(s, headers) => {
						const row = {}
						headers.forEach((h) => {
							if (s[h] !== undefined) row[h] = String(s[h])
						})
						if (!row.id) row.id = String(s.id) // Ensure ID
						return row
					}
				)

				// EDGES
				applyDiff(
					EDGES_PATH,
					EDGE_HEADERS,
					diff.edges,
					(r) => normalizeEdgeKey(parseInt(r.a), parseInt(r.b)),
					(e, headers) => {
						const row = {}
						headers.forEach((h) => {
							if (e[h] !== undefined) row[h] = String(e[h])
						})
						return row
					}
				)

				// PIECES (New)
				applyDiff(
					PIECES_PATH,
					PIECE_HEADERS,
					diff.pieces,
					(r) => String(r.id),
					(p, headers) => {
						const row = {}
						headers.forEach((h) => {
							if (p[h] !== undefined) row[h] = String(p[h])
						})
						return row
					}
				)

				applyDiff(
					UI_PATH,
					UI_HEADERS,
					diff.ui,
					(r) => String(r.key),
					(u, headers) => {
						const row = {}
						headers.forEach((h) => {
							if (u[h] !== undefined) row[h] = String(u[h])
						})
						return row
					}
				)

				// REINFORCEMENTS
				if (diff.reinforcements) {
					applyDiff(
						REINFORCEMENTS_PATH,
						REINFORCEMENT_HEADERS,
						diff.reinforcements,
						(r) => parseInt(r.id),
						(r, headers) => {
							const row = {}
							headers.forEach((h) => {
								if (r[h] !== undefined) row[h] = String(r[h])
							})
							return row
						}
					)
					console.log("Saved reinforcements.csv (diff)")
				}

				res.writeHead(200, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ success: true }))
			} catch (err) {
				console.error(err)
				res.writeHead(500, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ success: false, error: err.message }))
			}
		})
		return
	}

	// Static File Serving
	// URL /tools/map_editor.html -> d:\PUG\pursuit-of-glory\tools\map_editor.html
	// URL /csv/spaces.csv -> d:\PUG\pursuit-of-glory\csv\spaces.csv
	// URL /map.EN.jpg -> d:\PUG\pursuit-of-glory\map.EN.jpg

	// Strip query parameters for file lookup
	const reqUrl = decodeURIComponent(req.url.split("?")[0])
	let filePath = path.join(ROOT, reqUrl)

	console.log(`Request: ${req.url} -> ${filePath}`)

	// Prevent directory traversal
	if (!filePath.startsWith(ROOT)) {
		res.writeHead(403)
		res.end("Forbidden")
		return
	}

	const ext = path.extname(filePath)
	const contentType =
		{
			".html": "text/html",
			".js": "text/javascript",
			".css": "text/css",
			".json": "application/json",
			".png": "image/png",
			".jpg": "image/jpeg",
			".csv": "text/plain"
		}[ext] || "text/plain"

	fs.readFile(filePath, (err, content) => {
		if (err) {
			if (err.code === "ENOENT") {
				console.log(`404: ${req.url}`)
				res.writeHead(404)
				res.end("Not Found")
			} else {
				res.writeHead(500)
				res.end(`Server Error: ${err.code}`)
			}
		} else {
			res.writeHead(200, {
				"Content-Type": contentType,
				"Access-Control-Allow-Origin": "*"
			})
			res.end(content)
		}
	})
})

server.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		console.error(`Error: Port ${PORT} is already in use. Please close the other process and try again.`)
		process.exit(1)
	} else {
		throw err
	}
})

server.listen(PORT, () => {
	console.log(`PUG Map Editor Server running at http://localhost:${PORT}/tools/map_editor.html`)
	console.log(`Root directory: ${ROOT}`)
})
