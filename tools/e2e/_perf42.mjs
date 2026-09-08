// 진단 — **Performance.measure 오류가 배포 실행에서도 나는가** (REPAIR §42 · 검토 지시 4).
//
//     node tools/e2e/_perf42.mjs              개발 서버와 배포본을 나란히 잰다
//     node tools/e2e/_perf42.mjs --only=dist  배포본만
//
// ⚠️ **번들에서 글자를 찾는 것으로는 못 말한다.** `dist`에
// `performance.measure`가 0건이라는 것은 정적 사실일 뿐, 그 오류가 배포 실행에서
// 안 난다는 증명이 아니다 — 다른 이름으로 접혔을 수도, 다른 길로 불릴 수도 있다.
// 그래서 **같은 동작을 두 곳에서 실제로 돌린다.**
//
// 같이 잡는 것: 그 오류가 났을 때 **어느 부품의 어느 prop**이 복제를 막았는가.
// `performance.measure`를 감싸 이름과 detail 속성의 **타입 요약만** 적고
// **그대로 다시 던진다** — 삼키지 않는다. 이 래퍼는 하네스 쪽
// `addInitScript`고 제품 코드가 아니다.
//
// ⚠️ **배포본을 자료로 덮어 봐야 소용없다.** 처음엔 `dist/`에 `data/`가 없어서
// 못 가는 줄 알고 `public/`을 겹쳐 줬는데, 그래도 설치 화면에서 섰다. 까닭은
// 파일이 아니라 갈래다 — `app/boot.ts`가 `import.meta.env.DEV`로 가르므로
// **프로덕션 번들은 HTTP `/data`를 아예 안 본다.** 설치 기록이 없으면 무조건
// 설치 화면이고, 그것이 배포된 사용자가 겪는 그대로다.
//
// 그래서 배포 쪽은 **진짜 롬과 BDSP 덤프로 한 번 설치하고** 나서 잰다. 둘 중
// 하나라도 이 기계에 없으면 배포 줄은 「못 쟀다」로 남긴다 — 합성 폴더로
// 바꿔치기하면 재려던 것이 아니라 다른 것을 재게 된다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { serveDist } from './serve.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { playOpening } from './drive.mjs'
import { SPY } from './perfSpy.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const ONLY = flag('only')
/**
 * ⚠️ **포트를 못 박는다.** OPFS는 출처(protocol+host+port)마다 따로라, 빈 포트를
 * 그때그때 잡으면 **설치가 매번 처음부터**다 — 실측으로 한 번에 십수 분이다.
 * 전용 프로필과 못 박은 포트가 한 벌이어야 두 번째 실행이 「이미 설치됨」으로
 * 들어간다
 */
const PORT = Number(flag('port', process.env.PERF42_PORT ?? '4181'))
/**
 * 전용 브라우저 프로필. **사용자 개인 프로필을 안 건드린다.**
 *
 * ⚠️ **한 번에 한 프로세스만 쓴다.** 크로뮴은 프로필을 잠그므로 두 실행이
 * 겹치면 뒤엣것이 못 연다. `.audit/`는 git이 안 본다
 */
const PROFILE = resolve(ROOT, flag('profile', '.audit/overnight-20260908/chrome-profile'))
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/perf42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const require = createRequire(import.meta.url)
const SOURCES = require('../raw/sources.cjs')
const ROM = (() => {
  try { return SOURCES.platinumRoms().en ?? null } catch { return null }
})()
const BDSP = (() => {
  try { return SOURCES.sourceDir('bdsp.root') } catch { return null }
})()

/**
 * 설치 화면을 끝까지 민다 (`tools/e2e/run.mjs`의 ⑮와 같은 길).
 *
 * ⚠️ **`partial` 문구를 기다리면 안 된다.** 완주하면 화면이 다시 안 켜지고
 * 그 자리에서 게임으로 넘어간다 — 둘 중 먼저 오는 쪽을 잡는다
 */
async function installReal(page) {
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 60_000 })
  await page.locator('input[accept=".nds"]').setInputFiles(ROM)
  await page.getByText('지원됩니다').waitFor({ timeout: 180_000 })
  await page.locator('input[webkitdirectory]').setInputFiles(BDSP)
  await page.getByText('찾았습니다:').waitFor({ timeout: 600_000 })
  await page.getByRole('button', { name: '공간 확인하고 자리 잡기' }).click()
  const go = page.getByRole('button', { name: '설치 시작' })
  await go.and(page.locator('button:not([disabled])')).waitFor({ timeout: 60_000 })
  await go.click()
  await Promise.race([
    page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 2_400_000 }),
    page.getByText(/옮겨진 그룹은 설치됐지만/).first().waitFor({ timeout: 2_400_000 })
      .then(() => { throw new Error('필수 그룹이 모자라 partial에서 섰다') }),
  ])
}

/** 한 곳에서 같은 동작을 돌린다 — 켜고, 오프닝을 지나, 필드에 서서 조금 걷는다 */
async function measure(where, url, browser, install = false) {
  // ⚠️ **`BrowserContext.newPage()`는 인자를 안 받는다.** 전용 프로필 쪽은
  // 컨텍스트라 화면 크기를 만들 때 이미 줬다 — 여기서 또 주면 무시되거나 던진다
  const isContext = typeof browser.browser === 'function'
  const page = isContext
    ? await browser.newPage()
    : await browser.newPage({ viewport: { width: 960, height: 640 } })
  const errors = []
  page.on('pageerror', (e) => { errors.push(String(e.message).slice(0, 200)) })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`)
  })
  const out = { where, url, errors: [] }
  try {
    await page.addInitScript(SPY)
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 })
    if (install) {
      const t0 = Date.now()
      await installReal(page)
      out.installMs = Date.now() - t0
      console.log(`  ${where} — 설치에 ${String(Math.round(out.installMs / 1000))}초`)
    }
    const start = page.getByRole('button', { name: '시작', exact: true })
    await start.waitFor({ timeout: 120_000 })
    await start.click({ timeout: 60_000 })
    await playOpening(page)
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
      null, { timeout: 180_000 })
    // 필드에 설 때까지 넘기고 (고르는 줄은 셋 이상일 때만 마지막 칸)
    for (let i = 0; i < 300; i++) {
      const m = await page.evaluate(() => ({ ...document.documentElement.dataset }))
      if (m.scene === 'overworld') break
      const input = page.getByLabel('이름')
      if (await input.count() > 0) {
        await input.fill('레디')
        await page.getByRole('button', { name: '결정' }).click()
        await page.waitForTimeout(200); continue
      }
      const ball = page.getByLabel('몬스터볼')
      if (await ball.count() > 0) { await ball.click(); await page.waitForTimeout(200); continue }
      const row = await page.evaluate(() => {
        const g = document.querySelector('[role="radiogroup"]')
        if (g === null) return null
        const items = [...g.querySelectorAll('[role="radio"]')]
        const at = items.findIndex((e) => e.getAttribute('aria-checked') === 'true')
        return { n: items.length, at: at < 0 ? 0 : at }
      })
      if (row !== null && row.n >= 3) {
        for (let d = row.at; d < row.n - 1; d++) {
          await page.keyboard.down('ArrowDown'); await page.waitForTimeout(40)
          await page.keyboard.up('ArrowDown'); await page.waitForTimeout(60)
        }
      }
      await page.keyboard.down('Space'); await page.waitForTimeout(70)
      await page.keyboard.up('Space'); await page.waitForTimeout(60)
    }
    // 조금 걷고 메뉴를 열었다 닫는다 — React가 다시 그리는 자리를 일부러 만든다
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      await page.keyboard.down(key); await page.waitForTimeout(220)
      await page.keyboard.up(key); await page.waitForTimeout(120)
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('KeyC'); await page.waitForTimeout(70)
      await page.keyboard.up('KeyC'); await page.waitForTimeout(500)
      await page.keyboard.down('KeyX'); await page.waitForTimeout(70)
      await page.keyboard.up('KeyX'); await page.waitForTimeout(500)
    }
    await page.waitForTimeout(2000)
    out.spy = await page.evaluate(() => window.__perfSpy ?? null)
    out.marks = await page.evaluate(() => ({ ...document.documentElement.dataset }))
    await page.screenshot({ path: `${OUT}/${where}.png` })
  } catch (e) {
    out.crash = String(e?.message ?? e).slice(0, 300)
  } finally {
    out.errors = errors.filter((t) => /measure|clone/i.test(t)).slice(0, 8)
    out.allErrors = errors.length
    await page.close()
  }
  return out
}

/**
 * 이 출처에 **이미 설치돼 있는가.** 한 번 열어 보고 「시작」이 뜨면 warm이다.
 *
 * ⚠️ **설치 화면과 시작 화면 중 먼저 오는 쪽을 잡는다.** 둘 다 안 오면 그건
 * 아직 못 정한 것이라 fresh로 친다 — 잘못 warm이라고 하면 아래가 설치 화면
 * 앞에서 「시작」을 기다리다 시간만 태운다
 */
async function alreadyInstalled(context, url) {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 })
    return await Promise.race([
      page.getByRole('button', { name: '시작', exact: true })
        .waitFor({ timeout: 60_000 }).then(() => true),
      page.getByRole('heading', { name: '에셋 설치' })
        .waitFor({ timeout: 60_000 }).then(() => false),
    ])
  } catch {
    return false
  } finally {
    await page.close()
  }
}

let vite = null
let dist = null
let browser = null
let installed = null
const runs = []
try {
  if (ONLY !== 'dist') {
    browser = await chromium.launch({ args: gpuArgs('webgpu') })
    const port = await freePort()
    vite = await startVite(port, 'node_modules/.vite-perf42')
    runs.push(await measure('개발서버', vite.url, browser))
    await browser.close()
    browser = null
    vite.child.kill()
    vite = null
  }
  if (ONLY !== 'dev') {
    if (ROM === null || BDSP === null) {
      runs.push({
        where: '배포본',
        crash: '못 쟀다 — 이 기계에 ' + (ROM === null ? 'Platinum 롬이' : 'BDSP 덤프가') + ' 없다',
        errors: [],
      })
    } else {
      dist = await serveDist(resolve(ROOT, 'dist'), PORT)
      mkdirSync(PROFILE, { recursive: true })
      // ⚠️ **개인 프로필이 아니다.** `userDataDir`가 `.audit/` 아래고, 여기
      // 담기는 것은 이 포트 출처의 OPFS뿐이다
      installed = await chromium.launchPersistentContext(PROFILE, {
        args: gpuArgs('webgpu'),
        viewport: { width: 960, height: 640 },
      })
      // 두 번째 실행부터는 설치 화면이 아예 안 뜬다 — 그때는 설치를 건너뛴다.
      // fresh install과 warm installed를 **가르는 자리**다
      const warm = await alreadyInstalled(installed, dist.url)
      console.log(warm ? '  배포본 — 이미 설치돼 있다 (warm)' : '  배포본 — 처음 설치한다 (fresh)')
      const run = await measure('배포본', dist.url, installed, !warm)
      run.install = warm ? 'warm' : 'fresh'
      run.origin = dist.url
      run.profile = PROFILE
      runs.push(run)
    }
  }
} finally {
  await browser?.close()
  await installed?.close()
  vite?.child.kill()
  dist?.close?.()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify({ stamp: STAMP, runs }, null, 1)}\n`)
for (const r of runs) {
  console.log(`\n=== ${r.where} (${r.url}) ===`)
  console.log(`  performance.measure 호출 ${String(r.spy?.calls ?? '못 읽었다')}회`
    + ` · 터진 것 ${String(r.spy?.fails?.length ?? 0)}건`)
  for (const f of r.spy?.fails ?? []) {
    console.log(`   ✗ ${f.name} — ${f.why}`)
    console.log(`     detail ${JSON.stringify(f.detail).slice(0, 300)}`)
    console.log(`     props  ${JSON.stringify(f.props).slice(0, 300)}`)
  }
  console.log(`  콘솔의 measure/clone 줄 ${JSON.stringify(r.errors)}`)
  console.log(`  전체 오류 ${String(r.allErrors)}건 · 화면 ${JSON.stringify(r.marks ?? null)}`)
  if (r.crash) console.log(`  터졌다 ${r.crash}`)
}
console.log(`\n  ${OUT}`)
