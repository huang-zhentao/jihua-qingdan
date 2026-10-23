import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import electron from 'electron'

const outFile = resolve(process.argv[2] ?? 'shots/month.png')
mkdirSync(dirname(outFile), { recursive: true })

const env = { ...process.env, SHOT: '1', SHOT_OUT: outFile }
// 运行环境里可能设了 ELECTRON_RUN_AS_NODE（会让 electron 退化成纯 Node），启动 GUI 前必须去掉
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, ['--no-sandbox', '.'], { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 0))
