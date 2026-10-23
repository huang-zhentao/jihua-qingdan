import { createServer } from "node:http"
const port = Number(process.env.MOCK_PORT ?? 8899)
const delay = Number(process.env.MOCK_DELAY ?? 120)
const chunks = Number(process.env.MOCK_CHUNKS ?? 8)
createServer((req, res) => {
  if (req.method === "POST" && req.url.endsWith("/chat/completions")) {
    req.on("data", () => {})
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" })
      let i = 0
      const timer = setInterval(() => {
        if (i >= chunks) {
          res.write("data: [DONE]\n\n")
          clearInterval(timer)
          res.end()
          return
        }
        const piece = i === 0 ? "## 概览\n" : `- 第 ${i} 条要点\n`
        res.write("data: " + JSON.stringify({ choices: [{ delta: { content: piece } }] }) + "\n\n")
        i++
      }, delay)
      res.on("close", () => clearInterval(timer))
    })
    return
  }
  res.writeHead(404)
  res.end()
}).listen(port, "127.0.0.1", () => console.log("mock ai", port, delay))

