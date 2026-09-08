// 진단 — **저장한 자리가 이어하기에서 어디서 사라지는가** (REPAIR §42 · 지시 A2).
//
//     node tools/e2e/_resume42.mjs
//     node tools/e2e/_resume42.mjs --headed --keep
//
// ⚠️ **판정기가 아니다.** 관문은 `pnpm journey`의 ⑭고, 이 파일은 경계를 가른다.
//
// 대표 구간은 무쇠까지 40분을 걷고 나서야 이어하기를 밟는다. 같은 경계는
// **침실(맵 415 · 행렬 129)**에서도 밟힌다 — 거기도 실내라 `matrix !== 0`
// 가지를 그대로 탄다. 그래서 여기서는 오프닝만 지나 바로 저장하고 되켠다.
//
// 재는 것은 다섯 경계다 (지시 A2의 표):
//
//   ① 안정된 월드 → 저장 요청   `world`와 `worldState.player.position`
//   ② 요청 → 영속 저장          `useSaveStore.getState().position`
//   ③ 영속 저장 → 되읽기        새로 켠 판의 스토어 `position`
//   ④ 되읽기 → 월드 로딩        `world.mapId/matrix`의 **시간별 자취**
//   ⑤ 로딩 → 첫 안정 프레임     같은 자취의 끝
//
// ④를 자취로 재는 까닭: `MapStreamer`는 오버월드 기본 스폰으로 한 번 세운 뒤
// 실내 격자를 **비동기로** 받아 다시 세운다. 그 둘째가 안 일어나면 값은
// 처음부터 끝까지 기본 스폰이고, 한 번만 재면 그것을 못 가른다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { playOpening } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const HEADED = args.includes('--headed')
const PROFILE = flag('gpu', 'webgpu')
const VIEW = { width: 960, height: 640 }
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/resume42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

let vite = null
let browser = null
const out = { stamp: STAMP, profile: PROFILE, steps: [], notes: [] }

/** 지금 화면이 스스로 말하는 것 */
const marks = (page) => page.evaluate(() => ({ ...document.documentElement.dataset }))

/**
 * 엔진이 들고 있는 **날것의** 자리. DOM의 `data-tile`은 반올림한 값이라
 * 「같은 맵의 엉뚱한 자리」를 못 가른다
 */
const where = (page) => page.evaluate(async () => {
  const w = await import('/src/engine/map/world.ts')
  const s = await import('/src/state/worldState.ts')
  const v = await import('/src/state/saveStore.ts')
  const p = s.worldState.player
  const save = v.useSaveStore.getState()
  return {
    world: { map: w.world.mapId, matrix: w.world.matrix, grid: w.world.grid !== null },
    player: {
      x: Number(p.position.x.toFixed(3)), z: Number(p.position.z.toFixed(3)),
      y: Number(p.position.y.toFixed(3)), facing: Number(p.facing.toFixed(4)),
    },
    save: { ...save.position, loaded: save.loaded },
  }
})

async function tap(page, key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(60)
}

/** 대사·연출이 걷혀 필드에 설 때까지. 고르는 줄은 **마지막 칸**, 단 둘이면 첫 칸 */
async function reachField(page, limit = 300) {
  for (let i = 0; i < limit; i++) {
    if ((await marks(page)).scene === 'overworld') return { ok: true, taps: i }
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
      for (let d = row.at; d < row.n - 1; d++) await tap(page, 'ArrowDown', 40)
    }
    await tap(page, 'Space')
  }
  return { ok: false, taps: limit }
}

/** 대사창이 조용해질 때까지 */
async function settle(page, taps = 60) {
  for (let i = 0; i < taps; i++) {
    const m = await marks(page)
    if (m.talk === undefined && m.script === undefined) return
    await tap(page, 'Space')
  }
}

/** 시작 메뉴의 「리포트에 적기」. `journey`와 같은 손이다 */
async function writeReport(page) {
  await settle(page)
  await tap(page, 'KeyC')
  try {
    await page.waitForSelector('[role="radiogroup"] [role="radio"]', { timeout: 15_000 })
  } catch { return { ok: false, why: '시작 메뉴가 안 열렸다' } }
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
    await tap(page, now.at < want ? 'ArrowDown' : 'ArrowUp')
  }
  await tap(page, 'Space')
  for (let i = 0; i < 30; i++) {
    if ((await marks(page)).menu === 'save') break
    await page.waitForTimeout(200)
  }
  for (let i = 0; i < 20; i++) await tap(page, 'Space')
  for (let i = 0; i < 8 && (await marks(page)).menu !== undefined; i++) await tap(page, 'KeyX')
  return { ok: true }
}

/** 되켠 뒤 **자취**를 뜬다 — 값이 언제 어떻게 바뀌는지 */
async function trail(page, ms = 20_000, every = 400) {
  const seen = []
  const until = Date.now() + ms
  while (Date.now() < until) {
    const now = await where(page).catch(() => null)
    const m = await marks(page).catch(() => ({}))
    const line = now === null ? 'ㅡ'
      : `${String(now.world.map)}/${String(now.world.matrix)} ${String(now.player.x)},${String(now.player.z)}`
        + ` 격자${now.world.grid ? '있다' : '없다'} 세이브${String(now.save.map)}/${String(now.save.matrix)}`
        + ` ${String(now.save.x)},${String(now.save.z)} scene=${String(m.scene)}`
    if (seen.at(-1)?.line !== line) seen.push({ at: Date.now(), line, snap: now })
    await page.waitForTimeout(every)
  }
  return seen
}

try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-resume42')
  browser = await chromium.launch({ args: gpuArgs(PROFILE), headless: !HEADED })
  const page = await browser.newPage({ viewport: VIEW })
  const noise = []
  page.on('pageerror', (e) => { noise.push(`pageerror ${String(e.message).slice(0, 400)}`) })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      noise.push(`${m.type()} ${m.text().slice(0, 400)}`)
    }
  })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })

  // ⚠️ **들인 세이브는 진단용이다.** 대표 구간이 40분을 걸어 남긴 그 자리
  // (맵 414 · 행렬 128)를 다시 걷지 않고 밟으려는 것뿐이고, **정상 플레이의
  // 증거로 세지 않는다.** 최종 판정은 새 게임부터 도는 `pnpm journey`다
  const IMPORT = flag('import')
  if (IMPORT !== null) {
    // ⚠️ **정상 UI로 들인다.** `window.pt`는 타이틀에서 안 열린다 —
    // 사람이 쓰는 길은 「세이브 파일 불러오기」의 파일 고르개다
    await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
    await page.setInputFiles('input[type=file]', resolve(ROOT, IMPORT))
    // 들이면 미리보기가 뜨고, 사람이 그 단추를 눌러야 실제로 들어간다
    const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
    const ok = await bring.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)
    if (ok) {
      await bring.click()
      await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
    }
    out.brought = { ok, why: ok ? null : '미리보기 단추가 안 떴다' }
    console.log(`  세이브를 들였다 ${JSON.stringify(out.brought)}`)
    if (!ok) throw new Error('세이브를 못 들였다')
    out.steps.push({ 경계: '②들인 뒤', ...(await where(page)) })
  } else {

  const start = page.getByRole('button', { name: '시작', exact: true })
  await start.waitFor({ timeout: 120_000 })
  await start.click({ timeout: 60_000 })
  await playOpening(page)
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 180_000 })
  const stood = await reachField(page)
  if (!stood.ok) out.notes.push(`${String(stood.taps)}번 넘겨도 필드에 못 섰다`)
  await page.waitForTimeout(1500)

  // ① 안정된 월드 → 저장 요청
  out.steps.push({ 경계: '①저장 앞', ...(await where(page)) })
  await page.screenshot({ path: `${OUT}/1-저장앞.png` })

  const wrote = await writeReport(page)
  out.wrote = wrote
  await page.waitForTimeout(800)

  // ② 요청 → 영속 저장
  out.steps.push({ 경계: '②저장 뒤', ...(await where(page)) })
  }

  // 되켠다 — 사람이 하는 것과 같다
  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  const cont = page.getByRole('button', { name: '이어하기', exact: true })
  await cont.waitFor({ timeout: 120_000 })
  await cont.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })

  // ③~⑤ 되읽기 → 월드 로딩 → 첫 안정 프레임. **자취로** 뜬다
  out.trail = (await trail(page)).map((t) => t.line)
  out.steps.push({ 경계: '⑤안정 뒤', ...(await where(page)) })
  out.marks = await marks(page)
  await page.screenshot({ path: `${OUT}/2-이어하기.png` })

  // 실내 격자를 **직접** 받아 본다 — `MapStreamer`의 조용한 `catch`가 원인인지
  out.gridFor = await page.evaluate(async () => {
    const w = await import('/src/scene/worldData.ts')
    const t0 = performance.now()
    try {
      const g = await w.gridFor(129)
      return { ok: true, ms: Math.round(performance.now() - t0), w: g.meta?.tileWidth ?? null }
    } catch (e) { return { ok: false, why: String(e?.message ?? e).slice(0, 200) } }
  })

  out.noise = noise.slice(0, 12)
} catch (e) {
  out.crash = String(e?.stack ?? e).slice(0, 600)
} finally {
  await browser?.close()
  if (!args.includes('--keep')) vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
for (const s of out.steps) console.log(`  ${s.경계}  ${JSON.stringify(s)}`)
console.log('\n  자취')
for (const line of out.trail ?? []) console.log(`    ${line}`)
console.log(`\n  gridFor(129) ${JSON.stringify(out.gridFor ?? null)}`)
console.log(`  리포트 ${JSON.stringify(out.wrote ?? null)} · marks ${JSON.stringify(out.marks ?? null)}`)
if (out.noise?.length) console.log(`  잡음 ${JSON.stringify(out.noise)}`)
if (out.crash) console.log(`  터졌다 ${out.crash}`)
console.log(`\n  ${OUT}`)
