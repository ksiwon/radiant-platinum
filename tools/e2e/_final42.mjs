// 최종 검사를 **차례로** 돌리고 실제 종료 코드를 남긴다 (야간 실행서 N5)
//
//     node tools/e2e/_final42.mjs                 전부
//     node tools/e2e/_final42.mjs --only=journey  하나만
//     node tools/e2e/_final42.mjs --from=gpu:loss 그 자리부터
//
// ⚠️ **한꺼번에 안 돌린다.** GPU를 쓰는 검사를 나란히 돌리면 서로의 프레임
// 시간을 망가뜨리고, 그러면 재고 있는 것이 제품이 아니라 기계 부하가 된다
// (실행서 §6 끝). 하나가 끝나야 다음이 시작한다.
//
// ⚠️ **실패해도 멈추지 않는다.** 멈추면 뒤엣것이 「미실행」인지 「못 잰 것」인지
// 안 보인다 — 전부 돌리고 표로 남긴다. PASS로 바꾸는 자리는 없다.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit === undefined ? d : hit.slice(n.length + 3)
}
const OUT = resolve(ROOT, '.audit/overnight-20260908')
mkdirSync(OUT, { recursive: true })

/**
 * 차례. 실행서 §7이 이름을 댄 그대로다 —
 * 첫 화면 WebGPU 5판 · 강제 WebGL 5판 · 설치 크롬 3판 · 장치 손실 ·
 * 대표 구간 · 브라우저 실측 · 이야기 훑기
 */
const STEPS = [
  { id: 'render:first/webgpu', cmd: ['tools/e2e/firstFrame.mjs', '--runs=5'] },
  { id: 'render:first/webgl', cmd: ['tools/e2e/firstFrame.mjs', '--runs=5', '--gpu=gl'] },
  { id: 'render:first/chrome', cmd: ['tools/e2e/firstFrame.mjs', '--runs=3', '--channel=chrome'] },
  { id: 'gpu:loss', cmd: ['tools/e2e/gpuLoss.mjs'] },
  { id: 'journey', cmd: ['tools/e2e/journey.mjs'] },
  { id: 'e2e', cmd: ['tools/e2e/run.mjs'] },
  { id: 'story', cmd: ['tools/e2e/story.mjs'] },
]

const ONLY = flag('only')
const FROM = flag('from')
let picked = STEPS
if (ONLY !== null) picked = STEPS.filter((s) => s.id.includes(ONLY))
else if (FROM !== null) {
  const at = STEPS.findIndex((s) => s.id.includes(FROM))
  picked = at < 0 ? STEPS : STEPS.slice(at)
}

const rows = []
for (const step of picked) {
  const log = resolve(OUT, `${step.id.replace(/[:/]/g, '-')}.log`)
  const t0 = Date.now()
  console.log(`\n▶ ${step.id} — ${step.cmd.join(' ')}`)
  const code = await new Promise((done) => {
    const child = spawn(process.execPath, step.cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []
    child.stdout.on('data', (b) => { chunks.push(b); process.stdout.write(b) })
    child.stderr.on('data', (b) => { chunks.push(b); process.stderr.write(b) })
    child.on('close', (c) => {
      writeFileSync(log, Buffer.concat(chunks))
      done(c ?? -1)
    })
    child.on('error', (e) => {
      writeFileSync(log, String(e))
      done(-1)
    })
  })
  const row = { id: step.id, cmd: step.cmd.join(' '), exit: code, seconds: Math.round((Date.now() - t0) / 1000), log }
  rows.push(row)
  console.log(`◼ ${step.id} — 종료 ${String(code)} · ${String(row.seconds)}초 · ${log}`)
  writeFileSync(resolve(OUT, 'final42.json'), `${JSON.stringify({ at: new Date().toISOString(), rows }, null, 1)}\n`)
}

console.log('\n=== 최종 검사 종료 코드 ===')
for (const r of rows) console.log(`  ${String(r.exit).padStart(3)}  ${r.id}  (${String(r.seconds)}초)`)
// ⚠️ **여기서 판정하지 않는다.** 종료 코드를 그대로 남기는 것이 이 도구의 일이고,
// 무엇이 PASS인지는 각 도구가 제 봉투에 적는다
process.exit(0)
