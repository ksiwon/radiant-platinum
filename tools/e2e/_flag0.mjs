// 짧은 재현 — **누가 `FLAG_UNUSED_0x0000`(플래그 0)을 세우는가**
//
//     node tools/e2e/_flag0.mjs [--headed] [--save=.audit/journey/seg-08.rpsave] [--to=45]
//
// ⚠️ **이것이 무쇠 센터에 사람이 하나도 안 서는 까닭이다.** 실측(2026-09-08
// `_nurse42`): 맵 48의 배치표 9명 중 **9명이 전부 숨었고**, 일곱은 `flag: 0`이라
// `hideFlagOf`가 0을 돌려주고 `vars.checkFlag(0)`이 **참**이었다.
//
// 원작에서 0은 `FLAG_UNUSED_0x0000`이다(`generated/vars_flags.txt` 첫 줄).
// 배치표의 「숨김 플래그 없음」이 0으로 적히고, 원작은 그 0을 **그대로 검사한다** —
// `sub_020620C4`가 `FieldSystem_CheckFlag(fieldSystem, objectEvent->hiddenFlag)`
// 를 조건 없이 부른다(`raw/decomp/src/map_object.c` 625줄). 즉 원작에서도 셈은
// 같고, **0이 영영 안 서기 때문에** 아무도 안 숨는다. 우리 쪽에서는 그것이 섰다.
//
// 세이브 바이트가 그 자리를 정확히 가른다 (`payload.flags`의 0번 바이트):
//
//   start   0x00   플래그0 ✗
//   seg-08  0x04   플래그0 ✗   (떡잎시티 · 맵 3)
//   seg-09  0x05   플래그0 **✓** (무쇠시티 · 맵 45)
//
// 그래서 **그 사이를 걸으며** `setFlag`를 지켜본다.
//
// ⚠️ **제품을 안 고치고 잰다.** 브라우저에서 `VarStore.prototype.setFlag`를
// 진단용으로만 감싸고, 원래 것을 **그대로 다시 부른다** — 값도 차례도 안 바뀐다.
// 플래그를 직접 세우거나 지우지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/seg-08.rpsave'
const TO = Number(args.find((a) => a.startsWith('--to='))?.slice(5) ?? '45')
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '600') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/flag0/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, to: TO, steps: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

/**
 * `setFlag`를 감싼다 — **진단용 계측**이다.
 *
 * 0을 세우는 순간의 **호출 스택**과 **그때 도는 롬 스크립트**(파일·pc)를 적는다.
 * 스크립트가 세운 것이면 뒤엣것이 곧 범인이고, 우리 코드가 세운 것이면
 * 앞엣것이 그 줄을 가리킨다
 */
const hook = (page) => page.evaluate(async () => {
  const v = await import('/src/engine/script/vars.ts')
  const f = await import('/src/engine/script/field.ts')
  const w = await import('/src/engine/map/world.ts')
  if (window.__flag0 !== undefined) return 'already'
  window.__flag0 = { hits: [], all0: 0 }
  const orig = v.VarStore.prototype.setFlag
  v.VarStore.prototype.setFlag = function setFlagTraced(id) {
    if (id === 0) {
      window.__flag0.all0++
      if (window.__flag0.hits.length < 12) {
        const ctx = f.fieldScripts.ctx
        window.__flag0.hits.push({
          map: w.world.mapId,
          script: ctx === null ? null : { file: ctx.file, pc: ctx.pointer },
          stack: String(new Error('flag0').stack ?? '').split('\n').slice(1, 10).join('\n'),
        })
      }
    }
    return orig.call(this, id)
  }
  return 'hooked'
})

const flag0 = (page) => page.evaluate(async () => {
  const f = await import('/src/engine/script/field.ts')
  return {
    set: f.fieldScripts.vars.checkFlag(0),
    hits: window.__flag0?.hits ?? [],
    count: window.__flag0?.all0 ?? 0,
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-flag0')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  // 세이브를 붓기 **전에** 건다 — `loadVars`는 바이트를 통째로 쓰므로 이 갈고리를
  // 안 타지만, 그 뒤 한 번이라도 `setFlag(0)`이 돌면 여기 걸린다
  note('갈고리', await hook(page))

  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)
  // 갈고리가 살아 있는지 다시 본다 — 모듈이 다시 평가되면 원래 것으로 돌아간다
  note('갈고리 다시', await hook(page))
  out.atLoad = await flag0(page)
  note('세이브를 부은 직후', `플래그0 ${String(out.atLoad.set)} · setFlag(0) ${String(out.atLoad.count)}회`)

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    verbose: true,
    totalMs: BUDGET,
    skipStory: true,
    after: async (api) => {
      const came = await api.goTo(TO, Math.min(400_000, api.left()))
      note(`맵 ${String(TO)}로 걸어간다`, String(came))
      out.after = await flag0(page)
      note('걸어간 뒤', `플래그0 ${String(out.after.set)} · setFlag(0) ${String(out.after.count)}회`)
      for (const [i, h] of out.after.hits.entries()) {
        console.log(`\n  [${String(i + 1)}] 맵 ${String(h.map)} · 스크립트 ${JSON.stringify(h.script)}`)
        console.log(h.stack.split('\n').map((l) => `      ${l.trim()}`).join('\n'))
      }
      return { came }
    },
  })
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 800)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
