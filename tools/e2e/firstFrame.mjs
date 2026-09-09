// **첫 화면이 창을 안 흔들고도 나오는가** — REPAIR §41의 관문 (`pnpm render:first`).
//
//     pnpm render:first                     개발 서버를 띄워 잰다
//     pnpm render:first --url=http://…      이미 떠 있는 서버를 쓴다
//     pnpm render:first --runs=5            새 맥락에서 몇 판 (기본 5)
//     pnpm render:first --gpu=gl            WebGPU를 끄고 WebGL2 경로로
//     pnpm render:first --gpu=default       깃발을 하나도 안 준다
//     pnpm render:first --channel=chrome    설치된 크롬으로 (엣지는 msedge)
//     pnpm render:first --headed            창을 띄워서
//     pnpm render:first --no-probe          GPU 조회를 아예 안 한다
//
// ⚠️ **이 검사는 제 손으로 크기를 안 흔든다.** 마지막 viewport와 DPR을 **처음부터**
// 주고 시작하고, 재는 동안 창도 부모 CSS도 캔버스 width도 안 건드린다.
// 그것들이 바로 §41에서 화면을 살려 내던 것들이라, 검사가 하면 검사가 답을
// 만든다 — 예전 `pnpm shot`이 찍기 직전에 창을 키우면서 결함을 지나가며
// 고치고 있었다.
//
// ⚠️ **`data-renderer="live"`는 통과 조건이 아니다.** 그것은 「렌더 함수가
// 예외 없이 돌아왔다」는 런타임 표식이지 「사람 화면에 나갔다」가 아니다
// (`scene/EngineDriver`의 `markPresented`). 통과는 **찍은 픽셀**로만 준다.
//
// ⚠️ **깃발 이름을 믿지 않는다.** 무엇을 재고 있는지는 화면의 `data-backend`가
// 말한다 — 요청한 경로와 실제 경로가 다르면 그 판은 그 환경의 검증이 아니다.
//
// ⚠️ **GPU 조회는 첫 화면을 잰 뒤에 한다.** `probeGpu`가 제 GPU 장치를 하나 더
// 만들기 때문이다 — 첫 화면 앞에 두면 그 장치가 관측에 섞인다.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs, probeGpu, wantBackend } from '../gpuFlags.mjs'
import { playOpening } from './drive.mjs'
import {
  WATCH_INIT, compareShots, hideDom, looksDrawn, measureFrame, sameFrame, shootCanvas,
} from './canvasShot.mjs'
import { NEED, judgeFirstFrame } from './firstFrameRules.mjs'
import { statsOf } from '../shot/png.mjs'
import {
  bindingDigest, dataDigest, describeEnvironment, rosterOf, sealEvidence,
} from '../distribution/evidence.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/first')
const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const RUNS = Number(flag('runs', '5'))
const VIEW = { width: 960, height: 640 }
const DPR = Number(flag('dpr', '1'))
const CHANNEL = flag('channel')
const HEADED = args.includes('--headed')
const NO_PROBE = args.includes('--no-probe')
/**
 * 깃발 프로필.
 *
 * ⚠️ **`--channel`을 주면 기본이 `default`다.** 설치된 브라우저로 재는 뜻은
 * 「사람이 여는 조건」인데, 거기에 헤드리스용 실험 깃발을 그대로 얹으면 그것은
 * 다른 조건이다. 예전 판이 정확히 그랬고, 보고서에 「실험 깃발 없이」라고
 * 적을 뻔했다
 */
const PROFILE = flag('gpu', CHANNEL === null ? 'webgpu' : 'default')
const ARGS = gpuArgs(PROFILE)
const WANT_BACKEND = wantBackend(PROFILE)

const EXPECTED_CASES = rosterOf('render-first')?.cases ?? null
const START_DIGEST = bindingDigest('render-first')
/** 도는 동안 자료가 바뀌었는지 보려고 시작 지문을 같이 든다 (지시 §7) */
const dataAtStart = dataDigest()
if (EXPECTED_CASES === null) {
  console.error('\n정본 case 목록을 못 냈다 — tools/distribution/evidence.mjs를 본다\n')
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

/** ⚠️ **죽으면서 데려간다** — 안 죽이면 주인 없는 vite가 남아 다음 검사를 흐린다 */
let vite = null
const url = flag('url') ?? await (async () => {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-first')
  return vite.url
})()

const browser = await chromium.launch({
  args: ARGS,
  headless: !HEADED,
  ...(CHANNEL === null ? {} : { channel: CHANNEL }),
})
const browserVersion = browser.version()
console.log(`  브라우저 ${browserVersion}${CHANNEL === null ? ' (번들 크로미움)' : ` (${CHANNEL})`}`
  + ` · ${HEADED ? 'headed' : 'headless'} · 프로필 ${PROFILE}`
  + ` · 우리가 준 깃발 ${ARGS.length === 0 ? '없음' : ARGS.join(' ')}`)

let gpu = null
const runs = []

const marks = (page) => page.evaluate(() => ({ ...document.documentElement.dataset }))
async function tap(page, key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(60)
}

/**
 * 대사창이 조용해질 때까지 넘긴다.
 *
 * ⚠️ **상한에 닿은 것을 조용히 넘기지 않는다** — 돌려주는 값으로 말한다.
 * 한 번 사라진 것으로 끝도 아니다: 오프닝 뒤에도 스크립트가 이어서 말을 걸어서,
 * 「지금 없다」로 멈추면 다음 쪽이 뜬 채로 재게 된다
 */
async function clearTalk(page, limit = 400) {
  let quiet = 0
  let i = 0
  for (; i < limit && quiet < 8; i++) {
    if ((await marks(page)).talk === undefined) { quiet += 1; await page.waitForTimeout(150); continue }
    quiet = 0
    await tap(page, 'Space')
  }
  return { hitLimit: i >= limit, taps: i }
}

/**
 * 오프닝 연출이 끝나 **필드에 설 때까지** 넘긴다.
 *
 * ⚠️ **`clearTalk`으로는 못 넘긴다.** 연출 안의 대사는 `data-talk`을 안 세워서
 * (`app/sceneMark`의 `markTalk`을 안 부른다) 자에게는 조용해 보인다. 실측으로
 * 다섯 판 중 넷이 「환영하네!」 쪽에 멎은 채로 재였고, 그 판들은 한 칸도 못
 * 걸어서 ⑤가 BLOCKED였다. **`data-scene`으로 본다** — 그것이 지금 무엇이 떠
 * 있는지를 말한다
 */
async function reachField(page, limit = 300) {
  let i = 0
  const seen = []
  for (; i < limit; i++) {
    if ((await marks(page)).scene === 'overworld') return { ok: true, taps: i, seen }
    // ⚠️ **눈먼 스페이스는 오프닝을 맴돌게 한다.** 「그 밖에 알고 싶은 건?」의
    // 커서 첫 칸이 **조작 설명**이라, 그냥 누르면 설명을 다 듣고 그 물음으로
    // 돌아와 또 설명을 듣는다 — 실측으로 300번을 눌러도 못 빠져나왔다.
    // 마지막 칸이 「괜찮다!」다 (`engine/intro/beats`의 `INFO_CHOICES`)
    const row = await page.evaluate(() => {
      const g = document.querySelector('[role="radiogroup"]')
      if (g === null) return null
      const items = [...g.querySelectorAll('[role="radio"]')]
      const at = items.findIndex((e) => e.getAttribute('aria-checked') === 'true')
      return { n: items.length, at: at < 0 ? 0 : at, last: items.at(-1)?.textContent ?? '' }
    })
    // 이름 자판과 몬스터볼은 키로 안 넘어간다 — `playOpening`과 같은 손이다
    const input = page.getByLabel('이름')
    if (await input.count() > 0) {
      seen.push('이름')
      await input.fill('레디')
      await page.getByRole('button', { name: '결정' }).click()
      await page.waitForTimeout(200)
      continue
    }
    const ball = page.getByLabel('몬스터볼')
    if (await ball.count() > 0) {
      seen.push('몬스터볼')
      await ball.click(); await page.waitForTimeout(200); continue
    }
    // ⚠️ **칸이 둘이면 옮기지 않는다.** 그 줄은 예/아니오다 — 마지막을 고르면
    // 「아니오」가 되어 성별 물음으로 되돌아가고, 그 둘을 영영 왕복한다
    // (실측: 「여자 → 아니오」가 300번). 첫 칸이 「예」다
    if (row !== null) {
      if (seen.at(-1) !== row.last) seen.push(row.last)
      if (row.n >= 3) for (let d = row.at; d < row.n - 1; d++) await tap(page, 'ArrowDown', 40)
    }
    await tap(page, 'Space')
  }
  return { ok: false, taps: i, seen }
}

/** 한 칸이라도 실제로 옮겨 선다. **방향은 네 쪽을 다 해 본다** */
async function walk(page) {
  const from = (await marks(page)).tile
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
    for (let i = 0; i < 5; i++) await tap(page, key, 220)
    await page.waitForTimeout(500)
    const to = (await marks(page)).tile
    if (to !== from && to !== undefined) return { from, to, key }
  }
  return { from, to: (await marks(page)).tile, key: null }
}

/**
 * 한 판. **새 맥락에서 시작한다** — 앞 판이 크기를 흔들어 살려 놓은 상태가
 * 다음 판의 판정에 새어 들어가면 안 된다
 */
async function once(n) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: DPR })
  const out = { n, shots: [], notes: [] }
  const dir = `${OUT}/${String(n).padStart(2, '0')}`
  mkdirSync(dir, { recursive: true })
  await page.addInitScript(WATCH_INIT)
  const noise = []
  page.on('pageerror', (e) => { noise.push(String(e.message).slice(0, 200)) })

  /**
   * 기준 컷의 상태와, 그 뒤 모든 잰 값. **첫 컷부터 마지막 컷까지** 화면이
   * 안 흔들렸는지를 이것으로 본다 — 한 컷의 앞뒤만 보면 그 사이를 못 잡는다
   */
  let base = null
  const span = { ok: true, why: null, what: null }
  const watch = (where, m) => {
    if (base === null) { base = m; span.what = `${m.buffer} · CSS ${m.css} · DPR ${String(m.dpr)}`; return }
    if (!span.ok) return
    const same = sameFrame(base, m)
    if (!same.ok) { span.ok = false; span.why = `${where}에서 ${String(same.why)}` }
  }

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 })

    // ① 정상 오프닝으로 필드까지. **크기는 한 번도 안 건드린다**
    const start = page.getByRole('button', { name: '시작', exact: true })
    await start.waitFor({ timeout: 120_000 })
    await start.click({ timeout: 60_000 })
    await playOpening(page)
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
      null, { timeout: 180_000 })
    await page.waitForFunction(() => (document.documentElement.dataset.map ?? '') !== '',
      null, { timeout: 60_000 })
    const stood = await reachField(page)
    out.reachedField = stood
    if (!stood.ok) out.notes.push(`${String(stood.taps)}번 넘겨도 필드에 못 섰다`)
    const talk = await clearTalk(page)
    if (talk.hitLimit) out.notes.push(`대사를 ${String(talk.taps)}번 넘겨도 안 끝났다`)
    await page.waitForTimeout(2000)

    // 무엇을 재고 있는지는 **화면이 말한다** — 깃발 이름이 아니다
    out.marks = await marks(page)
    out.backend = out.marks.backend ?? null

    const field = await shootCanvas(page, { path: `${dir}/01-field.png` })
    watch('필드 컷 앞', field.before); watch('필드 컷 뒤', field.after)
    await page.screenshot({ path: `${dir}/01-field-page.png` })
    out.shots.push('field')
    out.field = {
      drawn: looksDrawn(field.stats), colors: field.stats.colors,
      stdev: Number(field.stats.stdev.toFixed(1)),
    }

    // ② **음성 대조군 — 같은 자리, 캔버스만 뺀다.** 남는 것은 페이지 배경이고,
    //    그 컷이 「그려졌다」로 읽히면 자가 고장 난 것이다. 두 장 찍어
    //    **한 프레임에 멎은 화면**도 같이 잰다
    const bg = await shootCanvas(page, { path: `${dir}/90-neg-bg.png`, dropCanvas: true })
    watch('대조군 컷 뒤', bg.after)
    await page.waitForTimeout(800)
    const bg2 = await shootCanvas(page, { path: `${dir}/90-neg-bg-again.png`, dropCanvas: true })
    watch('대조군 둘째 컷 뒤', bg2.after)
    out.shots.push('bg', 'bg-again')
    out.neg = {
      drawn: looksDrawn(bg.stats), colors: bg.stats.colors,
      stdev: Number(bg.stats.stdev.toFixed(1)),
      still: shrink(compareShots(bg.png, bg2.png)),
    }

    // ③ **낡은 방식이 왜 거짓 통과였는가.** 캔버스만 빼고 화면 전체를 찍으면
    //    계기판이 남는데, 예전 ⑮는 그 컷의 색 수로 판정했다. 판정에는 안 쓰고
    //    수치만 남긴다
    await hideDom(page, true, true, true)
    const hud = statsOf(await page.screenshot({ path: `${dir}/91-neg-hud-page.png` }))
    await hideDom(page, false)
    watch('계기판 대조군 뒤', await measureFrame(page))
    out.hudOnly = {
      colors: hud.colors, stdev: Number(hud.stdev.toFixed(1)),
      passesOldRule: looksDrawn(hud),
    }

    // ④ 정상 입력으로 걷고 다시 찍는다 — **세계가 갱신되는가**
    const walked = await walk(page)
    await page.waitForTimeout(1000)
    const moved = await shootCanvas(page, { path: `${dir}/02-moved.png` })
    watch('걸은 뒤 컷 앞', moved.before); watch('걸은 뒤 컷 뒤', moved.after)
    await page.screenshot({ path: `${dir}/02-moved-page.png` })
    out.shots.push('moved')
    out.moved = {
      drawn: looksDrawn(moved.stats), colors: moved.stats.colors,
      change: shrink(compareShots(field.png, moved.png)),
      tile: `${String(walked.from)} → ${String(walked.to)}`,
      key: walked.key, walked: walked.from !== walked.to && walked.to !== undefined,
    }

    // ⑤ **GPU 조회는 맨 끝이다** — 여기서야 장치를 하나 더 만들어도 안 섞인다
    if (!NO_PROBE) gpu ??= await probeGpu(page)
  } catch (e) {
    out.crash = String(e?.message ?? e).slice(0, 300)
  } finally {
    out.span = span
    out.noise = noise.slice(0, 5)
    await page.close()
  }
  return out
}

/** 견준 결과를 봉투에 넣을 만큼만 줄인다 */
function shrink(got) {
  return {
    comparable: got.comparable,
    ratio: got.ratio === null ? null : Number(got.ratio.toFixed(4)),
    why: got.why,
  }
}

try {
  for (let i = 1; i <= RUNS; i++) {
    console.log(`\n${String(i)}/${String(RUNS)}판`)
    const r = await once(i)
    runs.push(r)
    console.log(`      backend ${String(r.backend)} · 필드 ${JSON.stringify(r.field ?? r.crash)}`)
    console.log(`      대조군   ${JSON.stringify(r.neg ?? null)} · 계기판만 ${JSON.stringify(r.hudOnly ?? null)}`)
    console.log(`      걸은 뒤  ${JSON.stringify(r.moved ?? null)}`)
    console.log(`      흔들림   ${JSON.stringify(r.span)}`)
  }
} finally {
  await browser.close()
  vite?.child.kill()
}

console.log('')
const rows = judgeFirstFrame(runs, RUNS)

// ⚠️ **요청한 경로로 실제로 돌았는가.** 다르면 그 환경의 검증이 아니다 —
// 통과든 실패든 그 판의 결과를 그 환경 이름으로 적으면 거짓이 된다
const backends = [...new Set(runs.map((r) => r.backend).filter((b) => b !== null && b !== undefined))]
const wrongPath = WANT_BACKEND !== null && backends.some((b) => b !== WANT_BACKEND)
if (wrongPath) {
  for (const row of rows) {
    if (row.status === 'PASS' && row.id !== '01' && row.id !== '02') {
      row.status = 'BLOCKED'
      row.detail = `${WANT_BACKEND}를 재려 했는데 실제로는 ${backends.join('·')}였다 — ${row.detail}`
    }
  }
}

for (const row of rows) {
  console.log(`  ${{ PASS: '✓', FAIL: '✗', BLOCKED: '⛔' }[row.status]} ${row.id}  ${row.what}`)
  if (row.detail) console.log(`        ${row.detail}`)
}
if (runs.some((r) => r.hudOnly)) {
  const one = runs.find((r) => r.hudOnly).hudOnly
  console.log(`\n  참고: 캔버스만 뺀 화면 전체는 색 ${String(one.colors)}로`
    + ` ${one.passesOldRule ? '**낡은 자를 통과한다**' : '떨어진다'}`)
}
console.log(`  실제 backend ${backends.join('·') || '(못 읽었다)'}`
  + `${WANT_BACKEND === null ? '' : ` · 재려던 것 ${WANT_BACKEND}`}`)

const fails = rows.filter((r) => r.status !== 'PASS')
// ⚠️ **봉투를 씌운다.** 어느 소스를·어느 기계에서·무엇을 다 돌려서 나온 결과인지가
// 결과와 한 몸이어야 한다 — 소스가 바뀌면 이 결과는 스스로 무효가 된다
const sealed = sealEvidence({
  dataAtStart,
  suite: 'render-first',
  expectedCases: EXPECTED_CASES,
  executedCases: rows.map((r) => r.id),
  startDigest: START_DIGEST,
  environment: {
    ...describeEnvironment({ browserVersion, gpu, backend: backends.join('·') }),
    view: VIEW, dpr: DPR, runs: RUNS,
    channel: CHANNEL, headed: HEADED, profile: PROFILE,
    // ⚠️ **우리가 넘긴 것만 적는다.** 플레이라이트 제 기본 깃발까지 없다는 뜻이 아니다
    argsWeGave: ARGS, wantBackend: WANT_BACKEND, gpuProbe: !NO_PROBE,
  },
  results: rows,
  extra: { url, need: NEED, detail: runs },
})
writeFileSync(resolve(ROOT, '.audit/probe/out/renderFirst.json'), `${JSON.stringify(sealed, null, 1)}\n`)
console.log(`\n${fails.length === 0 ? '다 통과했다' : `${String(fails.length)}건이 떨어졌다`}`
  + ' — shots/first · .audit/probe/out/renderFirst.json')
process.exit(fails.length === 0 ? 0 : 1)
