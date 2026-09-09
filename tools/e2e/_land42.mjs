// 진단 — **지형이 언제 사라지는가, 그리고 무엇이 복제를 막는가** (지시 §2 · §4 · §5)
//
//     node tools/e2e/_land42.mjs [--save=.audit/journey/seg-08.rpsave]
//                                [--maps=3,342] [--laps=12] [--headed]
//
// ⚠️ **판정용 journey의 ⑮가 「긴 판에서만」 떨어졌다.** 새로 들여오면 1초에
// 다 그려지고(`_paint42` 실측), 걸어 나갔다 들어와도 +0ms에 그려진다. 그런데
// 약 30분·맵 전환 스물아홉 번을 돈 판에서는 하늘 한 장이었다. 그러니 재현은
// **같은 왕복을 반복하는 것**이라야 한다 — 한 번으로는 안 난다.
//
// ⚠️ **찍는 시점을 상태로 잡는다.** `goTo`가 `arrived`를 준 것은 맵을 갈아
// 끼우는 쪽의 신호일 뿐이라, 그 직후의 컷은 「덜 기다린 것」과 「못 그린 것」이
// 안 갈린다. `terrainReady()`(제품이 내는 값)를 기다리고, **상한을 넘으면
// 그것을 준비 실패로 적는다** — 기다려서 통과한 것으로 덮지 않는다.
//
// ⚠️ **실패한 실행을 살려 둔다.** 지형이 빈 컷을 만나면 그 자리에서
// 움직이지도, 크기를 흔들지도, 다시 들이지도 않고 0·1·3·10·30초를 잰다.
// 그다음에야 **새 페이지에 같은 세이브**를 들여 견준다. 네 갈래가 갈린다:
//
//   A 같은 실행에서 시간이 지나면 채워진다      → 촬영 준비/전환 지연
//   B 준비 완료를 선언했는데 지형이 늦게 온다   → 준비 신호가 렌더보다 빠르다
//   C 같은 실행은 계속 실패, 새 페이지는 정상   → 저장 안 되는 런타임 상태
//   D 새 페이지도 같은 자리에서 실패            → 씬·카메라·자료 조건
//
// ⚠️ **읽기만 한다.** 청크를 손으로 붙이거나 카메라를 옮기지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { shootCanvas } from './canvasShot.mjs'
import { judgeTerrain, cellGrid } from './terrainJudge.mjs'
import { stageState, waitTerrain } from './stageProbe.mjs'
import { armGeoSpy, readGeoSpy, resetGeoSpy } from './geoSpy.mjs'
import { armTexSpy, readTexSpy, resetTexSpy } from './texSpy.mjs'
import { SPY } from './perfSpy.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit === undefined ? d : hit.slice(n.length + 3)
}
const HEADED = args.includes('--headed')
const SAVE = flag('save', '.audit/journey/seg-08.rpsave')
const MAPS = flag('maps', '3,342').split(',').map((n) => Number(n))
const LAPS = Number(flag('laps', '12'))
/**
 * 어느 렌더 길로 도는가 (`tools/gpuFlags.mjs`).
 *
 * ⚠️ **이름으로 안 믿는다.** 깃발을 줬다고 그 길로 도는 것이 아니라, 화면의
 * `data-backend`가 정본이다 — 아래 `out.backend`에 그것을 적는다
 */
const BACKEND = flag('backend', 'webgpu')
/**
 * **자원만 재고 싶을 때** 첫 이상 컷에서 안 멈춘다.
 *
 * ⚠️ **판정을 무르게 하는 것이 아니다.** 컷 판정은 그대로 적히고, 여기서
 * 바꾸는 것은 「거기서 실험을 끝낼지」뿐이다 — 이 하네스가 재려는 것은
 * 왕복 스무 번의 **생성·해제 잔액**인데, 2바퀴에서 서면 그 수가 없다.
 * 실측(2026-09-09): 정상적으로 그려진 포켓몬센터 실내가 `terrainJudge`에서
 * 2/8로 떨어졌다 — 바닥이 매끄럽고 밝아 칸의 표준편차가 4~7이었다.
 * 릴리스 판정(`journey` ⑮)은 이 깃발을 안 쓴다
 */
const NOBREAK = args.includes('--nobreak')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/land42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, maps: MAPS, laps: LAPS, asked: BACKEND, rows: [], errors: [] }

/** 사람이 세운 페이지 하나 — 같은 세이브를 정상 UI로 들인다 */
async function bringIn(browser, url) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  await page.addInitScript(SPY)
  page.on('pageerror', (e) => {
    out.errors.push(String(e.message).slice(0, 200))
    console.error(`  pageerror ${String(e.message).slice(0, 160)}`)
  })
  page.on('console', (m) => {
    const t = m.text()
    if (t.includes('청크를 못 받아')) {
      out.errors.push(t.slice(0, 300))
      console.error(`  ${t.slice(0, 200)}`)
    }
  })
  await page.goto(url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  return page
}

/** 한 자리에서 한 컷 — 준비를 상태로 기다린 뒤 찍고, 지형 칸으로 판정한다 */
async function measure(page, name) {
  const ready = await waitTerrain(page, 20_000)
  const cut = await shootCanvas(page, { path: `${OUT}/${name}.png` })
  const land = judgeTerrain(cut.png)
  return {
    name, ready, drawn: land.drawn, filled: land.filled,
    colors: cut.stats.colors, stdev: Number(cut.stats.stdev.toFixed(1)),
    cells: cellGrid(land.cells), stage: await stageState(page).catch(() => null),
  }
}

const spy = (page) => page.evaluate(() => window.__perfSpy ?? null).catch(() => null)

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-land42')
  browser = await chromium.launch({ args: gpuArgs(BACKEND), headless: !HEADED })
  const page = await bringIn(browser, vite.url)
  // ⚠️ **깃발이 아니라 화면이 말하는 길을 적는다**
  out.backend = await page.evaluate(() => document.documentElement.dataset.backend ?? null)
  console.log(`  렌더 길 — 부탁한 것 ${BACKEND} · 실제 ${String(out.backend)}`)

  const first = await measure(page, '00-들인직후')
  out.rows.push(first)
  console.log(`  들인 직후 — 지형칸 ${String(first.filled)}/8`
    + ` · ${first.ready.ok ? `${String(first.ready.waitedMs)}ms에 섰다` : `준비 실패: ${String(first.ready.why)}`}`)

  /** 처음으로 무너진 자리. 여기서 실행을 살려 둔 채 이어서 잰다 */
  let broke = null
  /**
   * ⚠️ **예열 뒤에 건다.** 처음 들일 때 만드는 것까지 세면 「전환당 증가」가
   * 안 보인다. 첫 바퀴가 끝나면 셈을 0으로 돌린다
   */
  out.geoArm = await armGeoSpy(page)
  console.log(`  기하 감시자 — ${JSON.stringify(out.geoArm)}`)
  // ⚠️ **기하를 닫았다고 그림이 닫힌 것이 아니다** (후속 §5). 둘을 따로 센다
  out.texArm = await armTexSpy(page)
  console.log(`  그림 감시자 — ${JSON.stringify(out.texArm)}`)

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: 25 * 60_000,
    skipStory: true,
    after: async (api) => {
      for (let lap = 1; lap <= LAPS && broke === null; lap++) {
        for (const map of MAPS) {
          if (api.left() <= 0 || broke !== null) break
          const went = await api.goTo(map, Math.min(180_000, api.left()))
          if (went !== 'arrived') {
            console.log(`  ${String(lap)}바퀴 맵 ${String(map)} → ${went}`)
            out.rows.push({ name: `${String(lap)}-${String(map)}`, went })
            continue
          }
          const row = await measure(page, `${String(lap).padStart(2, '0')}-맵${String(map)}`)
          row.lap = lap; row.map = map; row.went = went
          row.spy = await spy(page)
          row.geo = await readGeoSpy(page)
          row.tex = await readTexSpy(page)
          out.rows.push(row)
          const r = row.stage?.resources ?? null
          console.log(`  ${String(lap)}바퀴 맵 ${String(map)} — 지형칸 ${String(row.filled)}/8`
            + ` · ${row.ready.ok ? `${String(row.ready.waitedMs)}ms` : `준비실패(${String(row.ready.why)})`}`
            + ` · 기하 ${String(r?.geometries)} 그림 ${String(r?.textures)}`
            + ` · 메시 ${String(row.stage?.scene?.meshes)}`
            + ` · 힙 ${String(Math.round((row.stage?.heap ?? 0) / 1e6))}MB`
            + ` · measure 실패 ${String(row.spy?.fails?.length ?? 0)}`
            + ` · 기하잔액 ${String(row.geo?.live)}(만든 ${String(row.geo?.born)}/버린 ${String(row.geo?.freed)})`
            + ` · 그림잔액 ${String(row.tex?.live)}(만든 ${String(row.tex?.born)}/버린 ${String(row.tex?.freed)})`)
          if (!row.drawn || !row.ready.ok) {
            if (!NOBREAK) { broke = row; break }
            out.oddCuts = (out.oddCuts ?? 0) + 1
            console.log(`    (이상 컷 ${String(out.oddCuts)}개째 — 자원 측정을 이어 간다)`)
          }
        }
        // 첫 바퀴는 예열이다. 그 뒤부터의 잔액만 「전환당 증가」로 읽는다
        if (lap === 1) {
          await resetGeoSpy(page)
          await resetTexSpy(page)
          console.log('  (예열 끝 — 기하·그림 셈을 0으로 돌린다)')
        }
      }
      return { broke: broke?.name ?? null }
    },
  })

  if (broke === null) {
    console.log(`\n  ${String(LAPS)}바퀴를 돌도록 안 무너졌다 — 이 축으로는 재현 못 했다`)
    out.verdict = '재현 못 함'
  } else {
    // ── 그 실행을 살려 둔 채 이어서 본다 ──────────────────────────────────
    console.log(`\n  ${broke.name}에서 무너졌다 — 같은 페이지·같은 자리에서 30초를 더 본다`)
    out.after = []
    const t0 = Date.now()
    for (const sec of [0, 1, 3, 10, 30]) {
      const wait = sec * 1000 - (Date.now() - t0)
      if (wait > 0) await page.waitForTimeout(wait)
      const c = await shootCanvas(page, { path: `${OUT}/무너진뒤-${String(sec).padStart(2, '0')}초.png` })
      const j = judgeTerrain(c.png)
      const s = await stageState(page).catch(() => null)
      out.after.push({ sec, drawn: j.drawn, filled: j.filled, colors: c.stats.colors, stage: s })
      console.log(`   +${String(sec)}초 — 지형칸 ${String(j.filled)}/8`
        + ` · 준비 ${String(s?.ready?.ok)} (${String(s?.ready?.why)})`
        + ` · 세운 땅 ${String(s?.ready?.have?.placed)}/${String(s?.ready?.have?.want)}`)
    }
    out.spyAtBreak = await spy(page)
    out.traceAtBreak = broke.stage?.trace ?? null
    out.geoAtBreak = await readGeoSpy(page)
    if (out.traceAtBreak) {
      console.log(`
  ── 요청 자국 (마지막 40줄) ──`)
      for (const r of out.traceAtBreak) {
        console.log(`   ${String(r.t).padStart(8)}ms  #${String(r.req).padStart(3)}  ${r.step.padEnd(12)} ${r.note}`)
      }
    }

    // ── 그다음에야 새 페이지 ──────────────────────────────────────────────
    console.log(`\n  이제 **새 페이지**에 같은 세이브를 들인다`)
    const fresh = await bringIn(browser, vite.url)
    const freshAt = await measure(fresh, '새페이지-들인직후')
    out.fresh = freshAt
    console.log(`  새 페이지 — 지형칸 ${String(freshAt.filled)}/8`
      + ` · ${freshAt.ready.ok ? '섰다' : `준비 실패: ${String(freshAt.ready.why)}`}`)
    await fresh.close()

    const late = out.after.some((r) => r.drawn)
    out.geoEnd = await readGeoSpy(page)
    out.verdict = late ? 'A/B — 같은 실행에서 시간이 지나 채워졌다'
      : freshAt.drawn ? 'C — 같은 실행은 계속 실패, 새 페이지는 정상 (저장 안 되는 런타임 상태)'
        : 'D — 새 페이지도 실패 (씬·카메라·자료 조건)'
    console.log(`\n  갈래 → ${out.verdict}`)
  }
  out.spy = await spy(page)
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
