import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../out/renderer/', import.meta.url))
const port = Number(process.argv[2] ?? 5178)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
}

createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const rel = urlPath === '/' ? 'index.html' : normalize(urlPath).replace(/^([/\\])+/, '')
  try {
    const body = await readFile(join(root, rel))
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`preview on http://127.0.0.1:${port}`)
})
