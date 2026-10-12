// 파이트에리어 라이벌 태그전(`FightArea_Rival` · 맵 188 · 스크립트 201:13)을 **이긴 갈래 · 진 갈래**로 한 번씩 몰아 본다
// (지시 「더블은 반드시 된다」 — 전수 점검에서 이 장면이 돌면 페이지가 타이틀로 떠났다).
//
//     node tools/e2e/tagBattleCheck.mjs [--url=http://localhost:5401]
//
// 하는 일: 확인 지점 `frontier`로 뛰어든 뒤 맵 188에서 그 스크립트를 걸고, 감싼 배틀 결과를 이김 → 짐으로 바꿔 끝까지 민다.
// 읽는 것: 페이지가 떠났는가(`framenavigated`) · 끝났는가 · 마지막 명령 · 콘솔 오류. 배틀 화면은 열지 않는다(스텁).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { openTitle, warpTo, pushScripts } from '../saves/common.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const arg = process.argv.find((a) => a.startsWith('--url='))
const vite = arg ? null : await startVite(5401, 'node_modules/.vite-scripts')
const base = arg ? arg.slice(6) : vite.url
const maps = JSON.parse(readFileSync(resolve(ROOT, 'public/data/maps.json'), 'utf8')).maps
const MAP = 188
const browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: true })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
// 스크립트 점검 훅은 부른 판에서만 달린다 (`src/app/App.tsx`)
await page.addInitScript(() => { globalThis.__wantScriptSweep = true })
page.setDefaultTimeout(180_000)
const navs = []
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()) })
const errors = []
page.on('console', (c) => { if (c.type() === 'error') errors.push(c.text().slice(0, 200)) })
await openTitle(page, base)
await page.evaluate(async () => { const m = await import('/src/state/saveStore.ts'); await m.useSaveStore.getState().resetSave({ backup: false }) })
await page.waitForFunction(() => '__scriptSweep' in globalThis, null, { timeout: 120_000 })
await warpTo(page, { id: 'frontier', map: null })
await pushScripts(page, 120_000)
const results = []
for (const outcome of ['win', 'loss']) {
  navs.length = 0
  await page.evaluate((o) => globalThis.__scriptSweep.setBattleOutcome(o), outcome)
  const g = await page.evaluate(([map]) => globalThis.__scriptSweep.gotoMap(map, { kind: 'open' }, []), [MAP])
  let run = null
  let thrown = null
  try {
    run = await page.evaluate(([site]) => globalThis.__scriptSweep.runSite(site, { round: 0, timeoutMs: 180000, stallMs: 30000 }),
      [{ key: '201:13', kind: 'npc', script: 14, mapFile: maps[MAP].scripts, local: 0, pre: [] }])
  } catch (e) { thrown = String(e.message ?? e).slice(0, 160) }
  results.push({ outcome, entered: g.ok, status: run?.status ?? null, lastOps: run?.lastOps ?? null, thrown, navs: [...navs], errors: errors.slice(-3) })
  console.log(JSON.stringify(results.at(-1)))
  if (thrown !== null) break
}
await browser.close()
vite?.child.kill()
process.exit(results.every((r) => r.thrown === null && r.navs.length === 0) ? 0 : 1)
