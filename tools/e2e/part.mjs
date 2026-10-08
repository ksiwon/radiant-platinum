/**
 * **파트를 돈다** — `pnpm part <N> [--save=…]` · `pnpm parts` (`docs/orders/JOURNEY_PARTS_20261008.md` §7).
 *
 * 로그는 화면과 `.audit/parts/part-N-<커밋>.log`에 **같이 흘린다** — `| tail`로 걸면
 * 끝날 때까지 0바이트라 도는 동안 못 본다.
 *
 * `pnpm parts`는 P1부터 차례로 돌고, 앞 파트가 못 닿으면 거기서 멈춘다. 판은 한 번에 하나다.
 * P4 · P5(`_dw` · `_league`를 파트로 올린 것)와 P6는 아직 없다 — 만들면 여기 잇는다
 */
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JOURNEY_PARTS, PARTS_DIR } from './parts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const all = args.includes('--all')
const rest = args.filter((a) => a.startsWith('--') && a !== '--all')
const which = all ? Object.keys(JOURNEY_PARTS).map(Number) : [Number(args.find((a) => /^\d+$/.test(a)))]

if (which.some((n) => JOURNEY_PARTS[n] === undefined)) {
  console.error(`\n파트 번호를 준다 — 지금 도는 것은 ${Object.keys(JOURNEY_PARTS).join(' · ')}이다 (pnpm part 2)\n`)
  process.exit(1)
}
if (all && rest.some((a) => a.startsWith('--save='))) {
  console.error('\npnpm parts에는 --save를 못 준다 — 연쇄는 앞 파트의 끝 세이브로만 잇는다\n')
  process.exit(1)
}

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim()
mkdirSync(PARTS_DIR, { recursive: true })

const runOne = (n) => new Promise((done) => {
  const log = resolve(PARTS_DIR, `part-${String(n)}-${sha}.log`)
  const out = createWriteStream(log)
  console.log(`\n── 파트 ${String(n)} — ${JOURNEY_PARTS[n].what} · 로그 ${log}\n`)
  const child = spawn(process.execPath, [resolve(ROOT, 'tools/e2e/journey.mjs'), `--part=${String(n)}`, ...rest],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const s of [child.stdout, child.stderr]) {
    s.on('data', (chunk) => { process.stdout.write(chunk); out.write(chunk) })
  }
  child.on('close', (code) => { out.end(); done(code ?? 1) })
})

for (const n of which) {
  const code = await runOne(n)
  console.log(`\n── 파트 ${String(n)} 끝 — 종료 코드 ${String(code)}`)
  if (code !== 0) {
    if (all) console.log('  앞 파트가 못 닿아 여기서 멈춘다')
    process.exit(code)
  }
}
