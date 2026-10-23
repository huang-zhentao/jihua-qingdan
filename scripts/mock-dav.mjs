// 极简 WebDAV 模拟服务，只为验证同步逻辑（PROPFIND / MKCOL / GET / PUT）
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'

const port = Number(process.argv[2] ?? 8787)
const seedFile = process.argv[3]
const storeFile = process.argv[4] ?? 'shots/mock-dav-store.json'

let remote = null
if (seedFile) {
  try {
    remote = readFileSync(seedFile, 'utf8')
  } catch {
    remote = null
  }
}

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  console.log(req.method, url)

  if (req.method === 'PROPFIND') {
    res.writeHead(207, { 'Content-Type': 'application/xml' })
    res.end('<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"/>')
    return
  }

  if (req.method === 'MKCOL') {
    res.writeHead(201)
    res.end()
    return
  }

  if (url.endsWith('/data.json')) {
    if (req.method === 'GET') {
      if (remote === null) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json', ETag: `"v${remote.length}"` })
      res.end(remote)
      return
    }

    if (req.method === 'PUT') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        remote = body
        writeFileSync(storeFile, body, 'utf8')
        res.writeHead(201, { ETag: `"v${remote.length}"` })
        res.end()
      })
      return
    }
  }

  res.writeHead(404)
  res.end()
})

server.listen(port, '127.0.0.1', () => console.log(`mock dav on ${port}`))
