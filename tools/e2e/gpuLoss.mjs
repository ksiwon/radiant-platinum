// 그래픽 장치를 **실제로 죽여 보고** 게임이 사람 손에 남는지 잰다 (기획서 §3.3 · PT-01/02)
//
//     pnpm gpu:loss              WebGL2 길에서 장치를 잃게 한다
//     pnpm gpu:loss --url=http://…   이미 떠 있는 개발 서버를 쓴다
//
// ⚠️ **왜 WebGL2 길인가.** 브라우저가 내주는 「장치를 잃게 하는」 손잡이가
// 그쪽에만 있다 — `WEBGL_lose_context.loseContext()`는 진짜 `webglcontextlost`를
// 쏘고, three의 `WebGLBackend`가 그것을 듣는다. WebGPU 쪽은 `device.destroy()`가
// `reason: 'destroyed'`로 오는데 three가 그 갈래를 **일부러 무시한다**(제가 닫은
// 것과 잃은 것을 가르려고). 그래서 진짜 손실을 밖에서 못 만든다.
//
// **두 길의 신호가 한 자리로 모인다는 것**은 three가 보장한다 — 둘 다
// `renderer.onDeviceLost(info)`를 부르고 우리는 그 하나만 잡는다
// (`scene/Stage.tsx`). 여기서 재는 것은 그 하나를 받은 **뒤**의 행동이고,
// 그것은 백엔드와 무관하다.
//
// ⚠️ **재는 것은 「복구되는가」만이 아니다.** 더 중요한 것은 그 사이에
// **아무도 못 움직이는가**다. 루프만 세우고 조작을 안 끄면, 복구가 끝나는
// 순간 그동안 눌리고 있던 방향이 한꺼번에 먹어서 주인공이 벽으로 달린다.
//
// ⚠️ **결과에 봉투를 씌운다** (기획서 §3.3). 판 1의 `gpuLoss.json`은
// `backendBefore`와 줄 목록뿐이라 **어느 소스를·어느 기계에서·어느 길로 잰
// 것인지 말할 수 없었다.** 그리고 FAIL이 있을 때만 종료 1을 내서, BLOCKED만
// 남은 판이 종료 0으로 읽혔다 — 안 잰 것이 잰 것으로 셈되는 자리다
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs, probeGpu } from '../gpuFlags.mjs'
import {
  bindingDigest, dataDigest, describeEnvironment, rosterOf, sealEvidence,
} from '../distribution/evidence.mjs'
import { playOpening } from './drive.mjs'
import { missingData } from './route.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? null : hit.slice(name.length + 3)
}

/**
 * 재기 **시작할 때**의 게임 소스 지문.
 *
 * ⚠️ 이 검사는 개발 서버에서 돈다(확인 지점이 `import.meta.env.DEV` 뒤다).
 * 그래서 묶이는 것은 dist가 아니라 소스이고, 도는 동안 소스가 바뀌면 그 결과는
 * 무효다 (`distribution/evidence.mjs`)
 */
const START_DIGEST = bindingDigest('gpu-loss')
/** 도는 동안 자료가 바뀌었는지 보려고 시작 지문을 같이 든다 (지시 §7) */
const dataAtStart = dataDigest()

const rows = []
const add = (id, what, status, detail) => {
  rows.push({ id, what, status, detail })
  const mark = { PASS: '✓', FAIL: '✗', BLOCKED: '⛔' }[status]
  console.log(`  ${mark} ${id}  ${what}`)
  if (detail) console.log(`        ${detail}`)
}

/** 이번 판의 환경. 무대가 서야 정해지는 것들은 지나가는 길에 줍는다 */
let browserVersion = null
let gpu = null
let backendBefore = null

/** 원본 자료가 없으면 아예 못 도는 검사다. 안 잰 것을 통과로 세지 않는다 */
const missing = missingData()
if (missing.length > 0) {
  // ⚠️ **여기서 「00 BLOCKED」 한 줄을 적고 끝내지 않는다.** 그러면 결과 파일에
  // 줄이 하나 생기는데, 그 하나는 정본 목록 아홉과 아무 관계가 없다 —
  // 봉투는 「아홉 중 아홉을 안 돌렸다」로 읽어야 한다
  console.log(`\n  개발 산출물이 없다 — ${missing.slice(0, 3).join(' · ')}. pnpm extract가 먼저다\n`)
  writeResult()
  process.exit(1)
}

const url = flag('url') ?? await (async () => {
  const port = await freePort()
  const t0 = Date.now()
  // ⚠️ **주소를 우리가 짓지 않는다.** 윈도우에서 vite는 `[::1]`에만 붙어서
  // `127.0.0.1`로는 영영 연결이 안 된다 — `devServer.mjs`가 그 함정을 이미
  // 적어 두었고, 여기서 다시 지으면 그 지식이 두 자리로 갈린다
  const { url: at } = await startVite(port, 'node_modules/.vite-harness')
  console.log(`  개발 서버(${String(port)}) 준비됐다 — ${String(Math.round((Date.now() - t0) / 1000))}초`)
  console.log()
  return at
})()

// ⚠️ **WebGPU 깃발을 일부러 안 준다** — 위 주석의 까닭으로 WebGL2 길에서 잰다
const browser = await chromium.launch({ args: gpuArgs('gl') })
// ⚠️ **닫기 전에 받아 둔다.** `browser.close()` 뒤에는 판을 못 묻는다
browserVersion = browser.version()
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
// ⚠️ **기본 30초로는 첫 요청을 못 기다린다.** vite가 뜬 뒤에도 브라우저가
// 실제로 받는 모듈은 그때 변환된다 — `run.mjs`가 같은 까닭으로 300초를 준다
page.setDefaultNavigationTimeout(300_000)

const marks = () => page.evaluate(() => ({
  scene: document.documentElement.dataset.scene ?? null,
  map: document.documentElement.dataset.map ?? null,
  tile: document.documentElement.dataset.tile ?? null,
  backend: document.documentElement.dataset.backend ?? null,
  renderer: document.documentElement.dataset.renderer ?? null,
  talk: document.documentElement.dataset.talk === '1',
  script: document.documentElement.dataset.script === '1',
}))

/**
 * 키 한 번. **누른 시간이 있어야 한다.**
 *
 * ⚠️ `page.keyboard.press()`는 누름과 뗌 사이가 사실상 0이라 **60Hz 시뮬이
 * 통째로 놓친다.** 실측으로 이 자리에서 헛짚었다 — 오프닝 컷신을 걷으려고
 * 120번을 눌렀는데 한 번도 안 먹었고, 검사는 그것을 「복구 뒤 조작이
 * 죽었다」로 적었다. `story.mjs`의 `tap`이 70ms를 쥐는 까닭이 이것이다
 */
async function tap(key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(50)
}

/** 그 키를 그만큼 쥔다. 60Hz 시뮬이 놓치지 않을 만큼은 쥐어야 한다 */
async function hold(key, ms) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
  await page.waitForTimeout(150)
}

/** 지금 서 있는 칸 */
async function tile() {
  const t = (await marks()).tile
  return t === null ? null : t
}

const apart = (a, b) => {
  if (a === null || b === null) return 0
  const [ax, az] = a.split(',').map(Number)
  const [bx, bz] = b.split(',').map(Number)
  return Math.abs(ax - bx) + Math.abs(az - bz)
}

/**
 * 같은 시간 누르면 몇 칸 가는가 — **갔다가 되돌아온다.**
 *
 * ⚠️ **상수 「서너 칸」을 못 박지 않는다** (기획서 §3.3). 판 1은 `baseline = 4`를
 * 코드에 적어 두고 `moved <= 8`을 봤는데, 그러면 **이동 0도 이 줄만은 통과한다**
 * — 기계와 프레임에 따라 흔들리는 값을 상수와 견주는 것 자체가 증명이 아니다.
 * 재는 것은 「장애 전과 **같은 구간에서** 두 배가 되지 않았는가」이므로,
 * 장애 전에 실제로 걸어 보고 그 수를 쥔 다음 같은 자리에서 다시 잰다.
 *
 * 되돌아오는 걸음까지 넣는 이유는 **다음 측정이 같은 칸에서 시작해야** 하기
 * 때문이다. 시작 칸이 다르면 그것은 같은 구간이 아니다
 */
async function stepsIn(ms, key, back) {
  // 재기 직전에 한 번 더 걷어 낸다 — 앞 걸음이 문 사건이 아직 살아 있을 수 있다
  await settle()
  const from = await tile()
  await hold(key, ms)
  const at = await marks()
  // 왔던 만큼 조금 더 눌러 되돌린다 — 벽에 붙으면 거기서 멎으므로 해가 없다
  await settle()
  await hold(back, ms + 250)
  return { from, moved: apart(from, at.tile), home: await tile(), at }
}

/**
 * 대사창과 스크립트가 걷힐 때까지 누른다.
 *
 * ⚠️ **이걸 안 하면 「조작이 죽었다」로 잘못 읽는다.** 실측으로 이 자리에서
 * 걸렸다 — 다시 세운 뒤 좌표 스크립트가 걸려 `talk`·`script`가 켜져 있었고,
 * 주인공이 안 움직이는 것은 그 때문이었는데 검사는 「조작을 다시 안 켰다」고
 * 적었다. 발을 묶은 것이 무엇인지는 `data-talk`·`data-script`가 말해 준다
 */
async function settle(taps = 90) {
  for (let i = 0; i < taps; i++) {
    const at = await marks()
    if (at.scene === 'overworld' && !at.talk && !at.script) return true
    await tap('Space')
  }
  return false
}

/** 「그래픽이 멈췄습니다」 창이 떠 있는가 */
const troubleUp = () => page.locator('[role="alertdialog"]').count().then((n) => n > 0)

const OPPOSITE = {
  ArrowDown: 'ArrowUp', ArrowUp: 'ArrowDown', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft',
}

/**
 * 어느 쪽으로 걸을 수 있는가 — **찾고 나서 제자리로 돌아온다.**
 *
 * ⚠️ **방향을 못 박으면 서 있는 자리에 따라 검사가 성립 안 한다.** 새 게임
 * 직후의 자리는 방 안이라 벽이 가까워서, 아래쪽이 막힌 판에서는 「못 걸었다」가
 * 되어 버린다. 장애 전과 후가 **같은 방향·같은 칸**이면 그것으로 충분하다
 */
async function pickDirection() {
  for (const key of Object.keys(OPPOSITE)) {
    await settle()
    const from = await tile()
    await hold(key, 400)
    const at = await marks()
    if (apart(from, at.tile) === 0) continue
    // ⚠️ **걷긴 했는데 그 칸이 사건을 무는 자리다.** 실측으로 침실(맵 415)의
    // (4,6)에서 한 칸 내려가면 계단 스크립트가 걸렸다 — 그 뒤로는 조작이 묶여
    // 「어디로도 못 걷는다」로 보인다. 그 방향으로는 기준을 못 잡는다
    if (at.talk || at.script) continue
    await hold(OPPOSITE[key], 650)
    // 제자리로 못 돌아오면 같은 구간을 두 번 잴 수 없다
    if (await tile() !== from) continue
    return key
  }
  return null
}

/**
 * 걸을 수 있는 방향을 찾는다 — **걷다가 스크립트가 걸리면 걷어 내고 다시.**
 *
 * ⚠️ 실측으로 여기서 헛짚었다. 방향 넷을 훑는 도중에 좌표 스크립트가 걸리면
 * 남은 셋도 다 안 움직여서 「어디로도 못 걷는다」로 보인다 — 발을 묶은 것이
 * 벽인지 스크립트인지는 `data-talk`·`data-script`가 말해 준다
 */
async function walkable() {
  for (let round = 0; round < 5; round++) {
    const key = await pickDirection()
    if (key !== null) return key
    // 네 방향이 다 벽이거나 사건을 문다 — **사건을 물고서라도 한 칸 나아가** 본다.
    // 침실에서 시작하면 계단·현관이 차례로 걸리고, 몇 번이면 밖으로 나온다
    await hold('ArrowDown', 600)
    await settle()
    console.log(`  기준 잡을 자리를 찾는 중 — ${JSON.stringify(await marks())}`)
  }
  return null
}

/**
 * 기준을 잡았던 칸으로 되돌아간다.
 *
 * ⚠️ **누른 채로 죽였으니 살아난 순간 그 방향으로 걸어간다** — 그게 이 검사가
 * 보고 싶은 것이기도 하다(멎어 있던 동안엔 안 움직이고, 살아나면 움직인다).
 * 그래서 복구 뒤의 자리는 기준을 잡은 자리가 아니다. 실측으로 (4,10)에서
 * 기준을 잡고 (4,6)에서 다시 재려다 「같은 구간이 아니다」로 막혔다 —
 * 막힌 것 자체는 옳고, 견주려면 **되돌아가서** 재야 한다
 */
async function returnTo(target, key) {
  for (let i = 0; i < 10; i++) {
    if (await tile() === target) return true
    await settle()
    await hold(key, 250)
  }
  return (await tile()) === target
}

/** 이 판에서 재는 방향. 장애 전후가 같아야 견줄 수 있다 */
let walkKey = null
/** 장애 전에 잰 걸음. 없으면 08을 판정할 근거가 없다 */
let baseline = null
let ranToTheEnd = false

try {
  // ── 준비: 새 게임으로 오버월드까지 (손잡이 없이 사람이 하는 그대로) ────────
  await page.goto(url, { waitUntil: 'load' })
  const start = page.getByRole('button', { name: '시작', exact: true })
  const button = await start.count() > 0 ? start : page.getByRole('button').first()
  await button.click({ timeout: 60_000 })
  await page.waitForFunction(() => location.pathname === '/intro', null, { timeout: 60_000 })
  const after = await playOpening(page)
  if (after !== '/play') throw new Error(`오프닝이 안 끝났다 — ${after}`)
  await page.waitForSelector('canvas', { timeout: 120_000 })
  // 오프닝 뒤에 이어지는 대사·스크립트를 걷는다 (`settle`이 그것만 한다)
  const opened = await settle(150)
  console.log(`  오버월드까지 왔다 — ${JSON.stringify(await marks())}`
    + `${opened ? '' : ' ⚠️ 대사·스크립트가 안 걷혔다'}`)

  await page.waitForFunction(() => document.documentElement.dataset.backend !== undefined,
    null, { timeout: 60_000 })
  // ⚠️ **깃발을 줬다고 믿지 않는다.** 어느 길로 그렸는지는 `data-backend`가,
  // 소프트웨어 래스터라이저였는지는 `probeGpu`가 잰 값이다
  gpu = await probeGpu(page)
  backendBefore = (await marks()).backend
  add('01', '무대가 서고 실제 backend를 밖에서 읽을 수 있다', 'PASS',
    `data-backend ${backendBefore} · ${String(gpu.renderer)}`
    + ' (개발 HUD 없이 — 배포 빌드에도 있는 표식이다)')

  // ── 장애 **전에** 같은 구간을 걸어 둔다 ──────────────────────────────────
  walkKey = await walkable()
  baseline = walkKey === null
    ? { from: await tile(), moved: 0, home: await tile() }
    : await stepsIn(700, walkKey, OPPOSITE[walkKey])
  if (baseline.moved === 0) {
    add('02', '죽이기 전에 같은 구간을 걸어 기준을 잡는다', 'FAIL',
      `0.7초에 0칸 — 못 걸었다. 이 검사가 성립 안 한다`
      + ` (고른 방향 ${String(walkKey)} · ${JSON.stringify(baseline.at ?? await marks())})`)
    throw new Error('장치를 죽이기 전에도 못 걸었다')
  }
  add('02', '죽이기 전에 같은 구간을 걸어 기준을 잡는다', 'PASS',
    `${baseline.from}에서 ${walkKey}로 0.7초에 ${String(baseline.moved)}칸`
    + `${baseline.home === baseline.from ? ' · 제자리로 돌아왔다' : ` · 돌아온 자리 ${String(baseline.home)}`}`)

  // ⚠️ **밖에서 훑어서는 못 잰다.** 자동 복구가 1초 안에 끝나므로 50ms마다
  // 물어보면 첫 물음에 이미 `live`인 판이 나온다 — 그러면 「멎은 동안」을
  // 한 번도 안 보고 통과가 찍힌다(실측으로 그런 판이 나왔다). 그래서
  // **문서가 바뀌는 것을 안에서 받아 적는다** — 전이가 하나도 안 빠진다.
  //
  // 이 관찰자는 검사가 심는 것이고 제품 코드에는 없다
  await page.evaluate(() => {
    const log = []
    globalThis.__rpLossLog = log
    const read = () => ({
      renderer: document.documentElement.dataset.renderer ?? null,
      tile: document.documentElement.dataset.tile ?? null,
    })
    log.push(read())
    new MutationObserver(() => { log.push(read()) })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-renderer', 'data-tile'] })
  })

  await page.keyboard.down(walkKey)
  // ⚠️ **누른 채로 죽인다.** 놓고 죽이면 「멎어서 안 움직인 것」과 「아무도
  // 안 눌러서 안 움직인 것」이 같은 모양이 된다

  // ── 장치를 죽인다 ────────────────────────────────────────────────────────
  const shot = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (canvas === null) return '캔버스가 없다'
    // 같은 종류를 다시 물으면 **같은 컨텍스트**가 온다 — three가 쓰는 그것이다
    const gl = canvas.getContext('webgl2')
    if (gl === null) return 'webgl2 컨텍스트가 아니다 — WebGPU 길이라 못 죽인다'
    const ext = gl.getExtension('WEBGL_lose_context')
    if (ext === null) return 'WEBGL_lose_context가 없다'
    ext.loseContext()
    return null
  })
  if (shot !== null) {
    await page.keyboard.up(walkKey)
    add('03', '진짜 장치 손실을 쏜다', 'BLOCKED', shot)
  } else {
    add('03', '진짜 장치 손실을 쏜다', 'PASS', 'WEBGL_lose_context.loseContext()')

    // ── 사람에게 무엇이 보이는가 ──────────────────────────────────────────
    await page.waitForSelector('[role="alertdialog"]', { timeout: 30_000 })
    const said = await page.locator('[role="alertdialog"]').innerText()
    add('04', '흰 화면이 아니라 설명이 뜬다', 'PASS', said.split('\n')[0])

    // ── 그 사이에 아무도 못 움직인다 ──────────────────────────────────────
    //
    // ⚠️ **이것이 이 검사의 핵심이다.** 화면이 멎은 채 조작만 살아 있으면
    // 사람은 자기가 어디로 걸었는지 모르는 채로 세계를 움직이게 된다
    for (let i = 0; i < 200; i++) {
      const at = await marks()
      if (at.renderer === 'live' && at.backend !== null) break
      await page.waitForTimeout(50)
    }
    // 돌아온 뒤로도 조금 더 눌러 둔다 — 그래야 「멎었다가 다시 걷는다」가 한 벌로 남는다
    await page.waitForTimeout(500)
    await page.keyboard.up(walkKey)
    await page.waitForTimeout(150)

    const log = await page.evaluate(() => globalThis.__rpLossLog ?? [])
    const phases = [...new Set(log.map((r) => String(r.renderer)))]
    // 멎어 있던 동안 칸이 한 번이라도 바뀌었나.
    //
    // ⚠️ **`live`가 아닌 칸이 곧 「멎은 동안」이다.** `ready`는 렌더러가 선
    // 것뿐이고 씬은 아직 다시 서는 중이라, 그때 걸으면 안 된다 (기획서 §6.2)
    let slipped = null
    for (let i = 1; i < log.length; i++) {
      if (log[i].tile !== log[i - 1].tile && log[i].renderer !== 'live') {
        slipped = log[i].renderer
        break
      }
    }
    const sawFrozen = log.some((r) => r.renderer !== 'live')
    if (slipped !== null) {
      add('05', '멎은 동안에는 세계가 안 움직인다', 'FAIL',
        `${String(slipped)} 칸인데 칸이 바뀌었다 — 루프나 조작이 안 멎었다`)
    } else if (!sawFrozen) {
      // ⚠️ **안 본 것을 통과로 안 센다.** 멎은 칸을 한 번도 못 봤으면
      // 이 줄이 증명하는 것은 아무것도 없다
      add('05', '멎은 동안에는 세계가 안 움직인다', 'BLOCKED',
        `멎은 칸을 한 번도 못 봤다 — 본 것은 ${phases.join(' · ')}뿐이다`)
    } else {
      add('05', '멎은 동안에는 세계가 안 움직인다', 'PASS',
        `누른 채로 ${phases.join(' → ')}를 지나는 동안 멎은 칸에서는 칸이 안 바뀐다`
        + ` (전이 ${String(log.length)}번을 안에서 받아 적었다)`)
    }

    // ── 자동으로 한 번 다시 세운다 ────────────────────────────────────────
    let back = false
    for (let i = 0; i < 120; i++) {
      if (!await troubleUp() && (await marks()).renderer === 'live') { back = true; break }
      await page.waitForTimeout(500)
    }
    if (!back) {
      add('06', '자동으로 한 번 다시 세운다', 'FAIL',
        `60초 안에 무대가 안 돌아왔다 — ${JSON.stringify(await marks())}`)
    } else {
      add('06', '자동으로 한 번 다시 세운다', 'PASS',
        `창이 닫히고 ${JSON.stringify(await marks())}`)

      // ── 돌아온 뒤에 **같은 구간을** 다시 걷는다 ────────────────────────
      //
      // ⚠️ **먼저 발을 묶은 것을 걷는다.** 다시 세운 뒤 좌표 스크립트가
      // 걸리면 조작이 멀쩡해도 안 움직인다 (실측으로 여기서 헛짚었다)
      const clear = await settle()
      if (!clear) {
        add('07', '돌아온 뒤에 조작이 살아난다', 'BLOCKED',
          `대사·스크립트가 안 걷혔다 — ${JSON.stringify(await marks())}`)
        add('08', '루프가 두 번 돌지 않는다', 'BLOCKED', '걸을 수 있는 상태가 아니라 못 쟀다')
      } else {
        // 기준을 잡았던 칸으로 돌아가서 잰다 — 그래야 같은 구간이다
        const home = await returnTo(baseline.from, OPPOSITE[walkKey])
        const now = await stepsIn(700, walkKey, OPPOSITE[walkKey])
        if (!home) console.log(`  기준 칸으로 못 돌아갔다 — ${String(await tile())}`)
        if (now.moved === 0) {
          add('07', '돌아온 뒤에 조작이 살아난다', 'FAIL',
            `화면은 돌아왔는데 주인공이 안 움직인다 — ${JSON.stringify(await marks())}`)
          add('08', '루프가 두 번 돌지 않는다', 'BLOCKED', '안 움직여서 견줄 값이 없다')
        } else {
          add('07', '돌아온 뒤에 조작이 살아난다', 'PASS',
            `${String(now.from)}에서 ${walkKey}로 0.7초에 ${String(now.moved)}칸`)
          // ⚠️ **시스템이 두 번 등록되면 같은 시간에 두 배로 걷는다.** 그래서
          // 재는 것은 절대 칸 수가 아니라 **장애 전 같은 칸에서 잰 값과의 비**다
          if (now.from !== baseline.from) {
            add('08', '루프가 두 번 돌지 않는다', 'BLOCKED',
              `같은 구간이 아니다 — 기준은 ${String(baseline.from)}, 이번은 ${String(now.from)}`)
          } else {
            const ratio = now.moved / baseline.moved
            add('08', '루프가 두 번 돌지 않는다', ratio <= 1.5 ? 'PASS' : 'FAIL',
              `${String(baseline.from)}에서 0.7초에 기준 ${String(baseline.moved)}칸 → 이번 ${String(now.moved)}칸`
              + ` (${ratio.toFixed(2)}배 · 두 배면 루프가 겹친 것이다)`)
          }
        }
      }
    }
  }
  ranToTheEnd = true
  add('99', '검사가 끝까지 갔다', 'PASS', `${String(rows.length)}줄을 적었다`)
} catch (e) {
  if (!ranToTheEnd) add('99', '검사가 끝까지 갔다', 'FAIL', String(e.message ?? e).slice(0, 300))
} finally {
  await browser.close()
}

console.log('\n장치 손실 복구 (기획서 §3.3 · G-G)\n')
const counts = ['PASS', 'FAIL', 'BLOCKED']
  .map((s) => `${s} ${String(rows.filter((r) => r.status === s).length)}`).join(' · ')
console.log(`  ${counts}`)
writeResult()

/**
 * ⚠️ **BLOCKED에도 종료 1이다** (기획서 §3.3). 판 1은 FAIL만 봐서 「못 쟀다」가
 * 종료 0으로 나갔고, 그러면 부르는 쪽이 그것을 합격으로 센다. 못 잰 것은
 * 통과가 아니다 — 봉투도 같은 판정을 한다 (`distribution/evidence.mjs`)
 */
process.exit(rows.some((r) => r.status === 'FAIL' || r.status === 'BLOCKED') ? 1 : 0)

function writeResult() {
  mkdirSync(resolve(ROOT, '.audit'), { recursive: true })
  const expected = rosterOf('gpu-loss').cases
  writeFileSync(resolve(ROOT, '.audit/probe/out/gpuLoss.json'), `${JSON.stringify(sealEvidence({
  dataAtStart,
    suite: 'gpu-loss',
    selection: flag('url') === null ? 'all' : `--url=${String(flag('url'))}`,
    expectedCases: expected,
    startDigest: START_DIGEST,
    // 실제로 적은 줄이 곧 돌린 것이다 — 못 돌린 것은 빈칸으로 남고, 봉투가
    // 「아홉 중 몇을 안 돌렸다」로 읽는다
    executedCases: rows.map((r) => r.id),
    environment: describeEnvironment({ browserVersion, gpu, backend: backendBefore }),
    results: rows,
    // 아래는 판정에 안 쓰지만 읽는 사람에게 필요한 부속이다
    extra: { backendBefore, baseline, view: { width: 960, height: 640 } },
  }), null, 1)}\n`)
}
