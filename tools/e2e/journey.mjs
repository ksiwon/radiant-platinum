// 대표 구간 — **새 게임부터 첫 배지까지 정상 입력으로** 간다 (PLATINUM_3D_COMPLETION_PLAN §7 · PT-03)
//
//     pnpm journey                   개발 서버를 띄워 처음부터 몬다
//     pnpm journey --url=http://…    이미 떠 있는 서버를 쓴다
//     pnpm journey --budget=5400     초 (기본 5400 = 90분)
//
// ⚠️ **확인 지점을 주입하지 않는다.** `pnpm story`는 여든여덟 자리로 **뛰어들어**
// 그 장면이 서는지를 보는 검사고, 여기서 재는 것은 **걸어서 이어지는가**다.
// 둘은 다른 것을 증명한다 — 장면이 다 서도 그 사이가 안 이어질 수 있다
// (기획서 §1.4 「장면 체크포인트 통과와 정상 스토리 완주를 분리한다」).
// 그래서 이 파일은 `warpTo`도 `window.pt`도 안 쓴다. 쓰는 것은 방향키·A·B와
// 화면의 진짜 단추뿐이고, 보는 것은 `<html>`의 읽기 전용 표식이다.
//
// ⚠️ **읽는 것과 넣는 것은 다르다.** 배지 수와 자리는 개발 서버에서 모듈을
// 열어 **읽기만** 한다 (`story.mjs`가 확인 지점 표를 읽는 것과 같은 자리다).
// 진행은 한 걸음도 그렇게 만들지 않는다.
//
// ⚠️ **리포트는 화면의 그 길로 쓴다.** 시작 메뉴 → 리포트 → 「예」다.
// `pt.report()`(개발 손잡이)를 안 쓴다 — 사람이 하는 길에서만 「덮어쓸까요」와
// 백업 다운로드가 같이 일어나고, 그 둘이 이 구간의 납품물이다.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs, probeGpu } from '../gpuFlags.mjs'
import { driveStory, playOpening } from './drive.mjs'
import { looksFlat, statsOf } from '../shot/png.mjs'
import { WATCH_INIT, looksDrawn, missingShots, shootCanvas } from './canvasShot.mjs'
import { missingData, trainersOn } from './route.mjs'
import {
  bindingDigest, describeEnvironment, rosterOf, sealEvidence,
} from '../distribution/evidence.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? null : hit.slice(name.length + 3)
}
const BUDGET_MS = Number(flag('budget') ?? 5400) * 1000

/**
 * 다 돌면 내야 할 정본 목록과, **돌기 시작할 때의 나무 지문.**
 *
 * ⚠️ **둘 다 하네스 밖에서 온다** (기획서 §6.1). 목록을 여기 적어 두면 「시험
 * 하나를 빼면서 목록도 같이 빼는」 한 번의 편집이 통과를 만든다.
 * `startDigest`는 **도중에 src를 고쳤는가**를 잡는다 — 개발 서버가 HMR로
 * 갈아 끼우면 앞뒤 걸음이 서로 다른 게임에서 재어진다
 */
const EXPECTED_CASES = rosterOf('journey')?.cases ?? null
const START_DIGEST = bindingDigest('journey')

if (EXPECTED_CASES === null) {
  console.error('\n정본 case 목록을 못 냈다 — tools/distribution/evidence.mjs를 본다\n')
  process.exit(1)
}
const SHOTS = resolve(ROOT, 'shots/journey')
const SAVES = resolve(ROOT, '.audit/journey')
const VIEW = { width: 960, height: 640 }

/**
 * 대표 구간이 지나는 자리. **맵 번호는 확인 지점 표에서 온 값이다**
 * (`src/engine/dev/checkpoints.ts`) — 여기서 새로 짓지 않는다.
 *
 * ⚠️ **탄광이 체육관보다 먼저다.** 원작에서 관장은 처음에 체육관에 없다 —
 * 무쇠탄광에 있고, 거기서 만나야 체육관이 열린다. 순서를 뒤집으면 「체육관에
 * 갔는데 아무도 없다」를 게임의 결함으로 적게 된다
 */

/**
 * 축복시티에서 **동쪽 길을 여는 것**. 원작의 차례 그대로다.
 *
 * ⚠️ **여기를 건너뛰면 무쇠시티에 영영 못 간다.** 실측(3·4판)으로 480초 동안
 * (187,760)에서 오른쪽만 누르다 섰다 — 막은 것은 지형이 아니라 이야기다.
 * 원본 자료가 그대로 말한다:
 *
 * · `events_jubilife_city.json` — 동쪽 출구 (188, 757~760)에
 *   `VAR_JUBILIFE_CITY_STATE == 1`일 때만 도는 좌표 이벤트가 있고, 그것이
 *   `JubilifeCity_CoordEvent_LookerBlockRoute203`다. 핸섬이 걸어와 말을 걸고
 *   주인공을 **서쪽으로 되돌려 세운다**
 * · `scripts_jubilife_city.s` — 그 값을 2로 올리는 자리는 온 게임에 **하나**,
 *   `JubilifeCity_GivePoketch`뿐이다
 * · `scripts_trainers_school.s` — 사장과 광대 ①②는 처음에 **없다**
 *   (`scripts_init_new_game.s`가 숨김 깃발을 세운다). 트레이너 스쿨에서
 *   라이벌에게 **소포를 건네야** `ClearFlag`로 셋이 나타나고 캠페인이 1이 된다
 *
 * 그래서 차례가 이렇다 —
 *
 *   ① 트레이너 스쿨(맵 4)에서 라이벌에게 말을 건다 (소포 → 타운맵)
 *   ② 포켓치사 사장 앞(172~176, 776)을 지난다 → 「광대 셋을 찾아라」
 *   ③ 광대 셋에게 **셋 다 「예」**로 답한다 → 쿠폰 셋
 *   ④ 사장에게 말을 걸어 포켓치를 받는다 → 동쪽이 열린다
 *
 * ⚠️ **사람은 자리가 아니라 스크립트 번호로 찾는다** (`api.talkToNpc`).
 * 광대 둘은 `MOVEMENT_TYPE_WANDER_AROUND`라 배치표 자리에 안 서 있고, 사장은
 * 좌표 이벤트가 주인공 쪽으로 걸어오게 만든다 — 실측(진단 탐침)으로 배치표
 * 자리로 찾으니 셋 중 둘에게 「말을 못 걸었다」가 났다
 */
const JUBILIFE = {
  /**
   * 트레이너 스쿨. 라이벌은 그 맵의 스크립트 1번이다.
   *
   * ⚠️ **29다.** 한 번 4로 적었다가 프렌들리숍에 들어가 엉뚱한 사람과 말했고,
   * 「말을 걸었다」가 뜨는데 깃발은 그대로였다. 번호는 `generated/map_headers.txt`의
   * 차례로 정해진다 (`MAP_HEADER_EVERYWHERE`가 0) — 4는 `JUBILIFE_CITY_MART`,
   * 29가 `TRAINERS_SCHOOL`이고, 그 맵의 (6,3)에 숨김 깃발 500(=
   * `FLAG_HIDE_TRAINERS_SCHOOL_RIVAL`)을 단 사람이 라이벌이다
   */
  school: { map: 29, rival: 1 },
  /** 사장이 알아보는 자리. 폭 5(172~176)의 한가운데를 밟는다 */
  campaign: { x: 174, z: 776 },
  clowns: [
    { script: 14, what: '광대 ①' },
    { script: 15, what: '광대 ②' },
    { script: 16, what: '광대 ③' },
  ],
  president: { script: 18, what: '포켓치사 사장' },
}

const AFTER_STOPS = [
  { id: '08', map: 3, what: '축복시티' },
  { id: '09', map: 45, what: '무쇠시티' },
  { id: '10', map: 198, what: '무쇠탄광 (관장을 만나는 자리)' },
  { id: '11', map: 47, what: '무쇠 체육관' },
]

let video = null
const rows = []
const add = (id, what, status, detail) => {
  rows.push({ id, what, status, detail })
  const mark = { PASS: '✓', FAIL: '✗', BLOCKED: '⛔' }[status]
  console.log(`  ${mark} ${id}  ${what}`)
  if (detail) console.log(`        ${detail}`)
}

const missing = missingData()
if (missing.length > 0) {
  console.error(`\n개발 산출물이 없다 — ${missing.slice(0, 3).join(' · ')}. pnpm extract가 먼저다\n`)
  process.exit(1)
}

rmSync(SHOTS, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })
mkdirSync(SAVES, { recursive: true })

const url = flag('url') ?? await (async () => {
  const port = await freePort()
  const t0 = Date.now()
  const { url: at } = await startVite(port, 'node_modules/.vite-journey')
  console.log(`  개발 서버(${String(port)}) 준비됐다 — ${String(Math.round((Date.now() - t0) / 1000))}초\n`)
  return at
})()

const browser = await chromium.launch({ args: gpuArgs(flag('gpu') ?? 'webgpu') })
const browserVersion = browser.version()
// ⚠️ **영상은 납품물이다** (기획서 §7.3.3). 그림 여덟 컷은 「그 자리에 섰다」를
// 보이지만 **걷는 것과 싸우는 것**은 못 보인다 — 컷인 타이밍도, 대사창이
// 이중으로 넘어가는지도 정지 화면에서는 안 보인다. playwright는 맥락이 닫힐 때
// 파일을 쓰므로 `browser.close()`까지 가야 남는다
const page = await browser.newPage({
  viewport: VIEW,
  acceptDownloads: true,
  recordVideo: { dir: resolve(ROOT, 'shots/journey/video'), size: VIEW },
})
page.setDefaultNavigationTimeout(300_000)
// 찍는 동안 화면이 흔들렸는지 재는 자 (`tools/e2e/canvasShot.mjs`)
await page.addInitScript(WATCH_INIT)

/**
 * 콘솔이 조용한가. 게임이 도는 내내 듣는다.
 *
 * ⚠️ **`WebGPU`가 든 줄을 통째로 버리지 않는다.** 처음에 그렇게 걸렀는데,
 * 그 바람에 **진짜 첫 오류를 내가 버렸다** — 남은 258건은 전부 그 뒤에 딸려 온
 * 「이전 오류 때문에 무효」였고, 원인 줄은 `Uncaptured WebGPU GPUValidationError:
 * The resolve target … size does not match` 하나였다. 거르는 것은 **이름을
 * 아는 잡음만**이다
 */
const BENIGN = [
  /Download the React DevTools/,
  /\[vite\]/,
  // 크로미움이 윈도우에서 늘 찍는다 — 우리 코드와 무관하다
  /powerPreference option is currently ignored/,
  // three 0.185가 제 안에서 쓰면서 스스로 경고한다
  /THREE\.Clock: This module has been deprecated/,
]
const noise = []
page.on('console', (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return
  const text = m.text()
  if (BENIGN.some((re) => re.test(text))) return
  noise.push({ kind: m.type(), text: text.slice(0, 300) })
})
page.on('pageerror', (e) => { noise.push({ kind: 'pageerror', text: String(e.message).slice(0, 300) }) })

const marks = () => page.evaluate(() => ({ ...document.documentElement.dataset }))

async function tap(key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(60)
}

let shotNo = 0
/**
 * 그림 한 컷 — **사람이 볼 화면 전체와, 판정에 쓸 캔버스만** 둘 다 찍는다.
 *
 * ⚠️ **화면 전체로는 「3D가 그려졌는가」를 못 잰다.** 계기판·대사창·타이틀이
 * 색을 채워서 캔버스가 한 픽셀도 안 나온 컷이 통과한다 — 실측(7판)으로 ⑮가
 * 그렇게 통과했고, 다시 재 보니 계기판만 남긴 컷의 색이 154~198개였다(문턱 64).
 * 그래서 판정은 **계기판을 숨기고 캔버스 요소만 찍은 컷**으로 한다
 * (`tools/e2e/canvasShot.mjs` — `pnpm render:first`와 같은 자를 쓴다).
 *
 * @param world 3D 무대가 서 있는 자리인가. 타이틀에는 캔버스가 아직 없다
 */
async function shot(name, { world = true } = {}) {
  shotNo += 1
  const head = `shots/journey/${String(shotNo).padStart(2, '0')}-${name}`
  const png = await page.screenshot({ path: resolve(ROOT, `${head}.png`) })
  const pix = statsOf(png)
  const one = {
    name, file: `${head}.png`, colors: pix.colors,
    stdev: Number(pix.stdev.toFixed(1)), flat: looksFlat(pix),
  }
  if (world) {
    try {
      const at = `${head}-캔버스.png`
      const cut = await shootCanvas(page, { path: resolve(ROOT, at) })
      one.canvas = {
        file: at, colors: cut.stats.colors, stdev: Number(cut.stats.stdev.toFixed(1)),
        drawn: looksDrawn(cut.stats), steady: cut.steady,
      }
      if (!one.canvas.drawn) {
        console.log(`        ⚠️ ${at} — 3D가 거의 한 색이다 (색 ${String(cut.stats.colors)})`)
      }
    } catch (e) {
      one.canvasWhy = String(e.message ?? e).slice(0, 120)
      console.log(`        ⚠️ ${name} — 캔버스를 못 뗐다: ${one.canvasWhy}`)
    }
  }
  return one
}

/**
 * 지금 상태를 **읽는다** — 배지·자리·파티.
 *
 * ⚠️ 개발 서버에서 모듈을 여는 것은 story.mjs가 확인 지점 표를 읽는 것과 같은
 * 자리다. **읽기만 한다** — 여기서 값을 넣으면 그 순간 이 검사는 뜻을 잃는다
 */
const readSave = () => page.evaluate(async () => {
  const m = await import('/src/state/saveStore.ts')
  const s = m.useSaveStore.getState()
  let badges = 0
  for (let i = 0; i < 8; i++) if ((s.badges >> i) & 1) badges += 1
  return {
    badges,
    party: s.party.length,
    dex: s.trainer.name === '' ? 0 : 1,
    trainer: s.trainer.name,
    playtimeMs: s.trainer.playtimeMs,
    loaded: s.loaded,
  }
})

/** 대사·스크립트가 걷힐 때까지 A를 누른다 */
async function settle(taps = 120) {
  for (let i = 0; i < taps; i++) {
    const m = await marks()
    if (m.scene === 'overworld' && m.talk !== '1' && m.script !== '1' && m.menu === undefined) return true
    await tap('Space')
  }
  return false
}

/**
 * 시작 메뉴에서 **리포트**를 열어 쓴다 — 사람이 하는 그 길이다.
 *
 * ⚠️ **항목 글로 못 찾는다.** 시작 메뉴의 이름표는 롬에서 오므로 판마다 다르다
 * (`ui/menu/StartMenu`의 `label()`). 대신 **차례**로 찾는다 — 리포트는 늘
 * 뒤에서 셋째다(리포트 · 설정 · 닫기). 고르는 줄이 `radiogroup`으로 자기 칸과
 * 커서를 내주므로 거기서 세고, 실제로 열렸는지는 `data-menu`로 확인한다.
 *
 * ⚠️ **눈 감고 A를 연타하지 않는다.** 설정 안에 「리포트를 지우고 처음부터」가
 * 있어서, 아무 칸이나 눌러 보는 방식은 **진행을 지울 수 있다**
 */
async function writeReport(saveAs) {
  await settle()
  await tap('KeyC')
  try {
    await page.waitForSelector('[role="radiogroup"] [role="radio"]', { timeout: 15_000 })
  } catch {
    return { ok: false, why: '시작 메뉴가 안 열렸다' }
  }
  const items = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')]
    return { n: all.length, at: all.findIndex((e) => e.getAttribute('aria-checked') === 'true') }
  })
  const first = await items()
  const want = first.n - 3
  if (want < 0) return { ok: false, why: `시작 메뉴 칸이 ${String(first.n)}개뿐이다` }
  for (let i = 0; i < first.n + 3; i++) {
    const now = await items()
    if (now.at === want) break
    await tap(now.at < want ? 'ArrowDown' : 'ArrowUp')
  }
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }).catch(() => null),
    (async () => {
      await tap('Space') // 리포트를 연다
      for (let i = 0; i < 30; i++) {
        if ((await marks()).menu === 'save') break
        await page.waitForTimeout(200)
      }
      // 「작성할까요?」 · 「덮어써도 괜찮습니까?」 — 기본 칸이 「예」다
      for (let i = 0; i < 20; i++) await tap('Space')
    })(),
  ])
  if (download === null) return { ok: false, why: '리포트를 써도 백업 파일이 안 내려왔다' }
  const at = resolve(SAVES, saveAs)
  await download.saveAs(at)
  // 화면을 닫고 필드로 돌아온다
  for (let i = 0; i < 8 && (await marks()).menu !== undefined; i++) await tap('KeyX')
  return { ok: true, file: `.audit/journey/${saveAs}`, name: download.suggestedFilename() }
}

/** 첫 화면이 뜰 때까지 (cold) */
async function openTitle() {
  const t0 = Date.now()
  // ⚠️ **playwright 기본 30초로는 첫 `goto`가 떨어진다.** vite는 「ready」를
  // 찍은 뒤로도 모듈 그래프를 계속 미리 변환하고, 그동안 첫 `goto`는 붙잡혀
  // 있다 — 실측으로 캐시가 찬 판에서도 34초에 떨어졌다 (`tools/shot/shot.mjs`의
  // 같은 자리)
  await page.goto(url, { waitUntil: 'load', timeout: 180_000 })
  const start = page.getByRole('button', { name: '시작', exact: true })
  await start.waitFor({ timeout: 120_000 })
  return { ms: Date.now() - t0, start }
}

let gpu = null
let backend = null
const story = { }
const timings = {}
const shots = []
let ranToTheEnd = false

try {
  // ── ① 첫 화면 ────────────────────────────────────────────────────────────
  const title = await openTitle()
  timings.coldTitleMs = title.ms
  shots.push(await shot('title', { world: false }))
  add('01', '첫 화면이 뜬다', 'PASS', `${String(title.ms)}ms (cold)`)

  // ── ② 새 게임 → 오프닝을 정상 입력으로 끝낸다 ─────────────────────────────
  const t1 = Date.now()
  await title.start.click({ timeout: 60_000 })
  await page.waitForFunction(() => location.pathname === '/intro', null, { timeout: 60_000 })
  const after = await playOpening(page)
  if (after !== '/play') throw new Error(`오프닝이 안 끝났다 — ${after}`)
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 120_000 })
  timings.openingMs = Date.now() - t1
  gpu = await probeGpu(page)
  backend = (await marks()).backend ?? null
  await settle()
  shots.push(await shot('bedroom'))
  add('02', '새 게임에서 오프닝을 정상 입력으로 끝낸다', 'PASS',
    `${String(Math.round(timings.openingMs / 1000))}초 · ${JSON.stringify(await marks())}`)

  // ── ③ 시작 리포트 ────────────────────────────────────────────────────────
  const startSave = await writeReport('start.rpsave')
  const startState = await readSave()
  add('03', '시작 자리에서 리포트를 쓰고 파일로 받는다', startSave.ok ? 'PASS' : 'FAIL',
    startSave.ok ? `${startSave.file} (${startSave.name}) · ${JSON.stringify(startState)}`
      : String(startSave.why))

  // ── ④~⑦ 파트너·라이벌·야생·상점·트레이너 (이미 있는 드라이버) ────────────
  const log = (line) => { console.log(`    ${line}`) }
  const drive = await driveStory(page, {
    log,
    totalMs: Math.max(600_000, BUDGET_MS - (Date.now() - t1)),
    after: async (api) => {
      const seen = []
      // ⚠️ **여기부터는 소포가 있어야 한다.** 원작이 202번도로 입구에서 막는다 —
      // 소포가 없으면 라이벌이 "가족한테 말은 하고 왔니"라며 되돌려 세우고,
      // 그것도 **들어설 때마다 다시**다 (`Route202_CheckStartCatchingTutorial`).
      // `driveStory`는 트레이너전이 0일 때만 이 걸음을 밟으므로, 라이벌전이
      // 이미 붙은 판에서는 건너뛴다 — 실측으로 축복시티·무쇠시티·탄광 셋이
      // **전부 맵 343에서** 막혔고 로그에 「엄마에게」 줄이 없었다
      await api.getParcel()
      await api.settle()
      log(`소포를 받으러 다녀왔다 — 지금 ${JSON.stringify(await marks())}`)
      // ── 축복시티: 포켓치를 받아 동쪽을 연다 (원작 차례. 위 JUBILIFE 참고) ──
      const poketch = { done: false, why: '' }
      if (api.left() > 0) {
        // ⚠️ 이 한 걸음이 **집(414)에서 축복시티까지**다 — 202번도로를 통째로
        // 지난다. 480초로는 모자랐다 (실측 5판)
        const got = await api.goTo(3, Math.min(900_000, api.left()))
        log(`축복시티(3) → ${got}`)
        if (got !== 'arrived') {
          poketch.why = `축복시티에 못 닿았다 (${got})`
        } else {
          const inSchool = await api.goTo(JUBILIFE.school.map, Math.min(240_000, api.left()))
          const metRival = inSchool === 'arrived'
            && await api.talkToNpc(JUBILIFE.school.map, JUBILIFE.school.rival,
              Math.min(180_000, api.left()))
          await api.clearTalk()
          await api.settle()
          log(`  트레이너 스쿨(${String(JUBILIFE.school.map)}) → ${inSchool}`
            + ` · 라이벌 ${metRival === true ? '에게 소포를 건넸다' : '을 못 만났다'}`)
          const back = await api.goTo(3, Math.min(240_000, api.left()))
          const met = back === 'arrived'
            ? await api.stepOn(3, JUBILIFE.campaign, Math.min(180_000, api.left()))
            : '안 갔다'
          await api.clearTalk()
          await api.settle()
          log(`  사장 앞(${String(JUBILIFE.campaign.x)},${String(JUBILIFE.campaign.z)}) → ${met}`)
          for (const clown of JUBILIFE.clowns) {
            if (api.left() <= 0) break
            const said = await api.talkToNpc(3, clown.script, Math.min(180_000, api.left()))
            await api.clearTalk()
            await api.settle()
            log(`  ${clown.what} → ${said ? '말을 걸었다' : '못 걸었다'}`)
          }
          const gave = api.left() > 0
            && await api.talkToNpc(3, JUBILIFE.president.script, Math.min(180_000, api.left()))
          await api.clearTalk()
          await api.settle()
          // ⚠️ **말을 걸었다가 곧 받았다는 뜻이 아니다.** 쿠폰이 셋 다 있어야
          // 사장이 준다 — 열린 것은 **동쪽으로 한 발**로만 확인되고, 그 판정은
          // 아래 09~11이 한다
          poketch.done = gave === true
          poketch.why = gave === true ? '' : '사장에게 말을 못 걸었다'
          log(`  ${JUBILIFE.president.what} → `
            + `${gave === true ? '말을 걸었다' : '못 걸었다'} · 지금 ${JSON.stringify(await marks())}`)
        }
      }

      for (const stop of AFTER_STOPS) {
        if (api.left() <= 0) { seen.push({ ...stop, verdict: '시간이 다 됐다' }); continue }
        const verdict = await api.goTo(stop.map, Math.min(480_000, api.left()))
        await api.settle()
        const at = await marks()
        log(`${stop.what}(${String(stop.map)}) → ${verdict} · 지금 맵 ${String(at.map)}`)
        seen.push({ ...stop, verdict, at: at.map ?? null })
        if (verdict === 'arrived') {
          shots.push(await shot(`stop-${stop.id}`))
          // 그 자리의 트레이너에게 차례로 말을 건다 — 탄광의 관장이 여기 있다
          for (const t of trainersOn(stop.map)) {
            if (api.left() <= 0) break
            const said = await api.talkTo(stop.map, { x: t.x, z: t.z }, Math.min(150_000, api.left()))
            await api.settle()
            const badges = (await readSave()).badges
            log(`  ${stop.what} 트레이너 ${String(t.x)},${String(t.z)} → `
              + `${said ? '반응했다' : '못 걸었다'} · 배지 ${String(badges)}개`)
            if (badges > 0) break
          }
        }
      }
      return { seen, poketch, badges: (await readSave()).badges }
    },
  })
  Object.assign(story, drive)

  add('04', '파트너를 고르고 라이벌전을 치른다',
    drive.trainer > 0 ? 'PASS' : 'FAIL',
    `트레이너전 ${String(drive.trainer)}회 · 지난 맵 ${String(drive.maps.length)}개`)
  add('05', '야생 배틀이 열린다', drive.wild > 0 ? 'PASS' : 'FAIL', `야생 ${String(drive.wild)}회`)
  add('06', '상점이 열린다', drive.shops > 0 ? 'PASS' : 'FAIL', `상점 ${String(drive.shops)}회`)
  add('07', '202번도로까지 이어진다', drive.maps.includes(343) ? 'PASS' : 'FAIL',
    drive.missed.length === 0 ? '길목을 다 지났다' : `못 지난 길목: ${drive.missed.slice(0, 3).join(' · ')}`)

  const seen = drive.extra?.seen ?? []
  const poketch = drive.extra?.poketch ?? null
  for (const stop of AFTER_STOPS) {
    const got = seen.find((s) => s.id === stop.id)
    // ⚠️ 축복시티 줄에는 **동쪽이 열렸는지**까지 적는다. 「닿았다」만으로는
    // 그다음 셋이 왜 못 갔는지가 이 표에서 안 보인다 (원작의 포켓치 관문)
    const extra = stop.id === '08' && poketch !== null
      ? ` · 포켓치 ${poketch.done ? '받았다' : `못 받았다 (${String(poketch.why)})`}`
      : ''
    add(stop.id, `${stop.what}에 걸어서 닿는다`,
      got?.verdict === 'arrived' ? 'PASS' : 'FAIL',
      `${String(got?.verdict ?? '안 갔다')}${got?.at ? ` · 멈춘 맵 ${String(got.at)}` : ''}${extra}`)
  }

  const badges = (await readSave()).badges
  add('12', '첫 배지를 받는다', badges > 0 ? 'PASS' : 'FAIL', `배지 ${String(badges)}개`)
  shots.push(await shot('after-gym'))

  // ── ⑬ 끝 리포트 ──────────────────────────────────────────────────────────
  const endSave = await writeReport('end.rpsave')
  const endState = await readSave()
  add('13', '끝 자리에서 리포트를 쓰고 파일로 받는다', endSave.ok ? 'PASS' : 'FAIL',
    endSave.ok ? `${endSave.file} (${endSave.name}) · ${JSON.stringify(endState)}`
      : String(endSave.why))

  // ── ⑭ 앱을 다시 켜서 이어하기 ────────────────────────────────────────────
  const before = await marks()
  const t2 = Date.now()
  await page.goto(url, { waitUntil: 'load' })
  const cont = page.getByRole('button', { name: '이어하기', exact: true })
  await cont.waitFor({ timeout: 120_000 })
  await cont.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 120_000 })
  // ⚠️ **첫 프레임이 나온 것과 그 자리에 선 것은 다르다.** `renderer === 'live'`는
  // 무엇이든 한 장 그렸다는 뜻이고, 그때 세계는 아직 비어 있을 수 있다 —
  // 실측(3판)으로 여기서 곧바로 재서 「맵 undefined 칸 0,0」을 게임의 결함으로
  // 적을 뻔했다. 사람이 보는 것은 **맵이 선 화면**이므로 그때까지 센다.
  // 안 서면 그것은 진짜 결함이고, 아래 판정이 그대로 떨어뜨린다
  const stood = await page.waitForFunction(
    () => (document.documentElement.dataset.map ?? '') !== '', null, { timeout: 60_000 },
  ).then(() => true).catch(() => false)
  timings.warmResumeMs = Date.now() - t2
  await settle()
  const back = await marks()
  shots.push(await shot('resumed'))
  const sameMap = back.map === before.map
  add('14', '앱을 다시 켜면 이어하기로 그 자리에 선다', sameMap ? 'PASS' : 'FAIL',
    `${String(Math.round(timings.warmResumeMs / 1000))}초 · 나갈 때 맵 ${String(before.map)} 칸 ${String(before.tile)}`
    + ` → 돌아온 맵 ${String(back.map)} 칸 ${String(back.tile)}`
    + (stood ? '' : ' · 60초를 기다려도 맵이 안 섰다'))

  // ⚠️ **3D가 진짜 그려졌는가.** 계기판을 숨기고 **캔버스만** 잰다 — 화면
  // 전체로 재면 DOM이 문턱을 혼자 넘긴다 (위 `shot`이 왜인지를 적는다).
  //
  // ⚠️ **필요한 자리 목록은 판정 밖에서 온다.** 안에서 「찍은 것만」 세면 한
  // 컷만 찍고도 통과한다. 그리고 그 자리에 **못 간 것**은 앞 줄이 이미
  // 떨어뜨렸으므로 여기서는 FAIL이 아니라 BLOCKED다 — 한 사슬의 실패를
  // 여러 결함처럼 세지 않는다
  const WORLD_NEED = ['bedroom', 'after-gym', 'resumed']
  const short = missingShots(WORLD_NEED, shots.map((one) => one.name))
  const world = shots.filter((one) => one.canvas !== undefined)
  const blank = world.filter((one) => !one.canvas.drawn)
  const shook = world.filter((one) => !one.canvas.steady)
  add('15', '3D 화면이 실제로 그려져 있다 (캔버스만 떼어 잰다)',
    short.length > 0 ? 'BLOCKED' : blank.length === 0 && shook.length === 0 ? 'PASS' : 'FAIL',
    short.length > 0
      ? `${short.join(' · ')} 자리까지 못 갔다 — 앞 줄을 본다`
      : blank.length === 0 && shook.length === 0
        ? world.map((one) => `${one.name} 색 ${String(one.canvas.colors)}`).join(' · ')
        : `${String(blank.length)}/${String(world.length)}컷의 3D가 거의 한 색이다: `
          + blank.map((one) => `${one.name} (색 ${String(one.canvas.colors)}`
            + ` · 흩어짐 ${String(one.canvas.stdev)})`).join(' · ')
          + (shook.length > 0 ? ` · 찍는 동안 흔들린 컷 ${String(shook.length)}개` : '')
          + ` ｜ 같은 컷을 화면 전체로 재면 색 ${world.map((one) => String(one.colors)).join('·')}다`)

  const errors = noise.filter((one) => one.kind !== 'warning')
  add('16', '콘솔이 조용하다', noise.length === 0 ? 'PASS' : 'FAIL',
    noise.length === 0 ? '오류·경고 0건'
      : `오류 ${String(errors.length)} · 경고 ${String(noise.length - errors.length)} — `
        + [...new Set(noise.map((one) => one.text.slice(0, 110)))].slice(0, 3).join(' | '))

  ranToTheEnd = true
  add('99', '검사가 끝까지 갔다', 'PASS', `${String(rows.length)}줄 · 그림 ${String(shots.length)}컷`)
} catch (e) {
  if (!ranToTheEnd) add('99', '검사가 끝까지 갔다', 'FAIL', String(e.message ?? e).slice(0, 400))
} finally {
  // 파일은 맥락이 닫힐 때 쓰인다 — 경로는 그 뒤에야 확실해진다
  const clip = page.video()
  await browser.close()
  if (clip !== null) {
    try {
      video = `shots/journey/video/${(await clip.path()).split(/[\/]/).pop()}`
      console.log(`  영상 ${video}`)
    } catch { video = null }
  }
}

console.log('\n대표 구간 — 새 게임에서 첫 배지까지 (기획서 §7 · G-B)\n')
const counts = ['PASS', 'FAIL', 'BLOCKED']
  .map((s) => `${s} ${String(rows.filter((r) => r.status === s).length)}`).join(' · ')
console.log(`  ${counts}`)
console.log(`  그림 ${SHOTS}`)

mkdirSync(resolve(ROOT, '.audit'), { recursive: true })
// ⚠️ **`executedCases`를 결과 줄에서 뽑지 않는다.** 도중에 터져 여덟 줄만 남은
// 파일과 열일곱 줄을 다 돌린 파일이 똑같아 보이면 안 된다 — 실제로 밟은 목록을
// 여기서 넘기고, 판정은 `validateEvidence`가 정본과 맞대어 한다
writeFileSync(resolve(ROOT, '.audit/journey.json'), `${JSON.stringify(sealEvidence({
  suite: 'journey',
  expectedCases: EXPECTED_CASES,
  executedCases: rows.map((r) => r.id),
  startDigest: START_DIGEST,
  environment: { ...describeEnvironment({ browserVersion, gpu, backend }), view: VIEW },
  results: rows,
  extra: { timings, story, shots, video, noise },
}), null, 1)}\n`)

process.exit(rows.some((r) => r.status === 'FAIL' || r.status === 'BLOCKED') ? 1 : 0)
