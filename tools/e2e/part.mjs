/**
 * **칸을 돈다** — `pnpm part <N> [--save=…]` · `pnpm parts [--from=N]` (`docs/orders/JOURNEY_CELLS_20261011.md` §4).
 *
 * 열여섯 칸 전부 `journey.mjs --cell=N`이다. `_dw` · `_league`는 칸 판에 안 쓴다 (사용자 10-11).
 *
 * · `pnpm part 9` — 칸 하나. 시작은 칸 8의 끝 세이브
 * · `pnpm part 9 --save=<file>` — 진단 (봉투에 진단으로 적힌다)
 * · `pnpm parts` — 칸 1→16. 못 닿은 칸에서 멈춘다
 * · `pnpm parts --from=9` — 칸 9부터 이어 간다. 앞 칸은 다시 안 돈다 — 하네스만 고친 것은 연쇄를 안 끊는다 (사용자 10-11)
 *
 * ⚠️ **개발 서버는 하나다.** 칸마다 띄우면 기동이 3~4분(붐비는 날 5~10분)씩 붙는다 — 한 번 띄워 모든 칸이 `--url`로 같이 쓴다.
 * `--url=…`을 주면 떠 있는 서버를 쓴다.
 *
 * 로그는 화면과 `.audit/parts/cell-N-<커밋>.log`에 **같이 흘린다** — `| tail`로 걸면 끝날 때까지 0바이트라 도는 동안 못 본다
 */
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort, startVite } from '../devServer.mjs'
import { CELLS, CELL_COUNT, PARTS_DIR } from './parts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const all = args.includes('--all')
const from = flag('from') === null ? 1 : Number(flag('from'))
/** journey에 그대로 넘기는 것 — `--save` · `--headed` 따위. 이 파일이 쓰는 것은 뺀다 */
const pass = args.filter((a) => a.startsWith('--') && a !== '--all' && !a.startsWith('--from=') && !a.startsWith('--url='))

const which = all
  ? Array.from({ length: CELL_COUNT - from + 1 }, (_, i) => from + i)
  : [Number(args.find((a) => /^\d+$/.test(a)))]
if (which.length === 0 || which.some((n) => CELLS[n] === undefined)) {
  console.error(`\n칸 번호를 준다 — 1~${String(CELL_COUNT)} (pnpm part 2 · pnpm parts --from=9)\n`)
  process.exit(1)
}
if (all && pass.some((a) => a.startsWith('--save='))) {
  console.error('\npnpm parts에는 --save를 못 준다 — 연쇄는 앞 칸의 끝 세이브로만 잇는다\n')
  process.exit(1)
}

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim()
mkdirSync(PARTS_DIR, { recursive: true })

let vite = null
let url = flag('url')
if (url === null) {
  vite = await startVite(await freePort(), 'node_modules/.vite-journey')
  url = vite.url
}
const stop = () => { vite?.child.kill() }
process.on('SIGINT', () => { stop(); process.exit(130) })

const runOne = (n) => new Promise((done) => {
  const cell = CELLS[n]
  const log = resolve(PARTS_DIR, `cell-${String(n)}-${sha}.log`)
  const out = createWriteStream(log)
  console.log(`\n── 칸 ${String(n)}/${String(CELL_COUNT)} — ${cell.what} · 예산 ${String(Math.round(cell.budget / 60))}분 · 로그 ${log}\n`)
  const child = spawn(process.execPath, [resolve(ROOT, 'tools/e2e/journey.mjs'), `--cell=${String(n)}`,
    `--budget=${String(cell.budget)}`, `--url=${url}`, ...pass], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const s of [child.stdout, child.stderr]) {
    s.on('data', (chunk) => { process.stdout.write(chunk); out.write(chunk) })
  }
  child.on('close', (code) => { out.end(); done(code ?? 1) })
})

let code = 0
for (const n of which) {
  code = await runOne(n)
  console.log(`\n── 칸 ${String(n)} 끝 — 종료 코드 ${String(code)}`)
  if (code !== 0) {
    if (all) console.log(`  못 닿아 여기서 멈춘다 — 고친 뒤 \`pnpm parts --from=${String(n)}\``)
    break
  }
}
stop()
process.exit(code)
