// 짧은 재현 — **영원의 숲에서 영원시티까지, 그 한 다리** (대표 구간이 30분을
// 조용히 돌던 자리다)
//
//     node tools/e2e/_leg42.mjs [--save=.audit/journey/seg-19.rpsave] [--to=65]
//
// ⚠️ **진단이다. 판정에 안 쓴다.** 대표 구간이 정상 진행으로 적어 둔 그 자리의
// 세이브를 물려, **그 다리 하나만** 말 많은 채로 몬다. 박동(60초)과 `verbose`가
// 함께 켜져 있어서 「걷는 중」과 「문 앞 되돌이」가 로그에서 갈린다.
//
// 재는 것 — ① 닿는가 ② 못 닿으면 **어디서** 되풀이하는가 ③ 몇 초 걸리나
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/seg-19.rpsave'
const TO = Number(args.find((a) => a.startsWith('--to='))?.slice(5) ?? '65')
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '1500') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/leg42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, to: TO, steps: [] }
const note = (what, detail) => { out.steps.push({ what, detail }); console.log(`  · ${what} — ${detail}`) }

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-journey')
  browser = await chromium.launch({ args: gpuArgs('gl') })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 300_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 300_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)

  const drive = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    skipStory: true,
    verbose: true,
    after: async (api) => {
      out.atLoad = { vars: await api.storyVars(), party: await api.partyState(), bag: await api.bagState() }
      note('들인 자리', `${JSON.stringify(out.atLoad.vars)}`
        + ` · 파티 ${JSON.stringify((out.atLoad.party ?? []).map((m) => `${String(m.species)} L${String(m.level)}`))}`)
      const t0 = Date.now()
      const how = await api.goTo(TO, Math.min(1_200_000, api.left()))
      out.leg = { to: TO, how, ms: Date.now() - t0 }
      note(`${String(TO)}번 맵으로`, `${how} · ${String(Math.round(out.leg.ms / 1000))}초`)
      out.end = { vars: await api.storyVars(), party: await api.partyState() }
      // ⚠️ **동행이 붙었는지는 다리가 끝난 뒤에 봐야 안다** — 들어설 때 값은
      // 세이브의 값이고, 모미는 숲 첫 칸(28~29,85)을 밟아야 붙는다
      note('마친 자리', `${JSON.stringify(out.end.vars)}`
        + ` · 파티 ${JSON.stringify((out.end.party ?? []).map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}/${String(m.maxHp ?? '?')}`))}`)
      await page.screenshot({ path: `${OUT}/마친-자리.png` })
      return out
    },
  })
  out.trouble = drive?.trouble ?? null
  out.blocks = drive?.blocks ?? null
  out.episodes = drive?.episodes ?? null
  note('걸린 것', JSON.stringify(out.trouble))
  note('막힌 자리', JSON.stringify(out.blocks).slice(0, 500))
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
