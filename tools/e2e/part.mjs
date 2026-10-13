/**
 * **칸을 돈다** — `pnpm part <N> [--save=…]` · `pnpm parts [--from=N]` (`docs/orders/JOURNEY_CELLS_20261011.md` §4).
 *
 * 열여섯 칸 전부 `journey.mjs --cell=N`이다. `_dw` · `_league`는 칸 판에 안 쓴다 (사용자 10-11).
 *
 * · `pnpm part 9` — 칸 하나. 시작은 칸 8의 끝 세이브
 * · `pnpm part 9 --save=<file>` — 진단 (봉투에 진단으로 적힌다)
 * · `pnpm parts` — 칸 1→16. 못 닿은 칸에서 멈춘다
 * · `pnpm parts --from=9` — 칸 9부터 이어 간다. 앞 칸은 다시 안 돈다 — 하네스만 고친 것은 연쇄를 안 끊는다 (사용자 10-11)
 * · `pnpm part 3 9 --parallel` — 칸 여럿을 **동시에** 돈다 (`docs/orders/JOURNEY_SPEED_20261012.md`). 아래 「동시 실행」
 *
 * ⚠️ **동시 실행.** 앞 칸의 끝 세이브가 이미 있는 칸끼리만 된다(서로 이웃한 칸은 못 한다 — 뒤 칸이 앞 칸의 끝 세이브를 기다린다).
 * 칸마다 **개발 서버를 따로**(빈 포트 하나씩 · vite 캐시 `node_modules/.vite-journey-c<N>`) 띄우고 `--lane=c<N>`을 준다 —
 * 그림은 `shots/journey-c<N>/`, 리포트 백업은 `.audit/journey-c<N>/`, 로그 · 끝 세이브 · 봉투는 원래 칸 번호가 이름에 있어 안 겹친다.
 * 브라우저는 칸마다 새로 띄우는 비영속 프로필이라 프로필 디렉터리가 겹칠 일이 없다. 칸마다 `--concurrent=<같이 도는 칸>`을 받아
 * 봉투의 `environment.concurrent` · `load.concurrent`에 「동시 실행」이 적히고, 그 판의 프레임 시간은 성능 판정에서 빠진다
 * (`budget.perfLoad`). 통과 · 실패 판정은 그대로다. `--url=…`을 주면 서버를 안 띄우고 모두 그 서버를 쓴다(한 서버에 브라우저 둘 —
 * 서버가 하나라 변환 경합은 있고, 칸 둘이 서로의 `story` 하네스를 죽이는 문제는 없다). **마지막 칸 둘 + 실제 시간 판은 혼자 돈다.**
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
import { CELLS, CELL_COUNT, diagDir, PARTS_DIR } from './parts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const all = args.includes('--all')
const from = flag('from') === null ? 1 : Number(flag('from'))
/** journey에 그대로 넘기는 것 — `--save` · `--headed` 따위. 이 파일이 쓰는 것은 뺀다 */
const parallel = args.includes('--parallel')
/**
 * `--lane`은 칸 하나를 돌 때만 그대로 넘긴다 — 손으로 준 세이브로 뒤 칸을 진단할 때 본 연쇄와 그림 ·
 * 리포트 · 서버 캐시 · 로그 · 봉투가 안 겹치게 (`pnpm part 9 --save=… --lane=d9`, 2026-10-13).
 * 동시 실행은 칸마다 `c<N>`을 이 파일이 정한다
 */
const LANE = parallel ? null : flag('lane')
const OUT_DIR = flag('save') === null ? PARTS_DIR : diagDir(LANE)
const pass = args.filter((a) => a.startsWith('--') && a !== '--all' && a !== '--parallel' && !a.startsWith('--from=') && !a.startsWith('--url=')
  && (LANE !== null || !a.startsWith('--lane=')) && !a.startsWith('--concurrent='))

const nums = args.filter((a) => /^\d+$/.test(a)).map(Number)
const which = all
  ? Array.from({ length: CELL_COUNT - from + 1 }, (_, i) => from + i)
  : nums
if (!all && nums.length > 1 && !parallel) {
  console.error('\n칸을 여럿 주려면 --parallel을 같이 준다 — pnpm part 3 9 --parallel (동시에 돈다)\n')
  process.exit(1)
}
if (parallel && (all || nums.length < 2)) {
  console.error('\n--parallel은 칸 둘 이상을 직접 줄 때만 된다 — pnpm part 3 9 --parallel (pnpm parts 연쇄는 앞 칸을 기다려야 해서 못 한다)\n')
  process.exit(1)
}
if (parallel && (new Set(nums).size !== nums.length || nums.some((n) => nums.includes(n + 1)))) {
  console.error('\n동시에 도는 칸은 서로 이웃하면 안 된다 — 뒤 칸이 앞 칸의 끝 세이브(`cell-N.rpsave`)를 기다린다\n')
  process.exit(1)
}
if (which.length === 0 || which.some((n) => CELLS[n] === undefined)) {
  console.error(`\n칸 번호를 준다 — 1~${String(CELL_COUNT)} (pnpm part 2 · pnpm parts --from=9)\n`)
  process.exit(1)
}
if (all && pass.some((a) => a.startsWith('--save='))) {
  console.error('\npnpm parts에는 --save를 못 준다 — 연쇄는 앞 칸의 끝 세이브로만 잇는다\n')
  process.exit(1)
}

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim()
mkdirSync(OUT_DIR, { recursive: true })

let vite = null
let url = flag('url')
/** 동시 실행이 칸마다 띄운 서버들 — `{ n, vite }` */
const lanes = []
if (parallel) {
  // 칸마다 포트 하나 · 캐시 하나. 포트를 **한꺼번에 잡지 않는다** — `freePort`가 같은 번호를 둘에게 주지 않게 하나 띄우고 다음을 묻는다
  if (url === null) {
    for (const n of nums) {
      const v = await startVite(await freePort(), `node_modules/.vite-journey-c${String(n)}`)
      lanes.push({ n, vite: v, url: v.url })
    }
  } else {
    for (const n of nums) lanes.push({ n, vite: null, url })
  }
} else if (url === null) {
  vite = await startVite(await freePort(), LANE === null ? 'node_modules/.vite-journey' : `node_modules/.vite-journey-${LANE}`)
  url = vite.url
}
const stop = () => { vite?.child.kill(); for (const l of lanes) l.vite?.child.kill() }
process.on('SIGINT', () => { stop(); process.exit(130) })

const runOne = (n, serverUrl = url, extra = []) => new Promise((done) => {
  const cell = CELLS[n]
  const log = resolve(OUT_DIR, `cell-${String(n)}-${sha}.log`)
  const out = createWriteStream(log)
  console.log(`\n── 칸 ${String(n)}/${String(CELL_COUNT)} — ${cell.what} · 예산 ${String(Math.round(cell.budget / 60))}분 · 로그 ${log}\n`)
  const child = spawn(process.execPath, [resolve(ROOT, 'tools/e2e/journey.mjs'), `--cell=${String(n)}`,
    `--budget=${String(cell.budget)}`, `--url=${serverUrl}`, ...extra, ...pass], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const s of [child.stdout, child.stderr]) {
    s.on('data', (chunk) => { process.stdout.write(chunk); out.write(chunk) })
  }
  child.on('close', (code) => { out.end(); done(code ?? 1) })
})

let code = 0
if (parallel) {
  console.log(`
── 칸 ${nums.join(' · ')}을 동시에 돈다 — 서버 ${lanes.map((l) => `${String(l.n)}:${l.url}`).join(' · ')}
`)
  const codes = await Promise.all(lanes.map((l) => runOne(l.n, l.url, [
    `--lane=c${String(l.n)}`, `--concurrent=${nums.filter((m) => m !== l.n).join(',')}`,
  ])))
  codes.forEach((c, i) => { console.log(`
── 칸 ${String(nums[i])} 끝 — 종료 코드 ${String(c)} (동시 실행 — 프레임 시간은 성능 증거가 아니다)`) })
  code = codes.some((c) => c !== 0) ? 1 : 0
  stop()
  process.exit(code)
}
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
