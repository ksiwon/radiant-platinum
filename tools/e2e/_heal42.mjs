// 짧은 재현 — **모미가 정말 고쳐 주는가** (지시서 JOURNEY_BADGE2 §9)
//
//     node tools/e2e/_heal42.mjs [--save=.audit/journey/seg-19.rpsave] [--rounds=6]
//
// ⚠️ **진단이다. 판정에 안 쓴다.** 규칙 함수(`shouldPartnerHeal`)는 시험으로
// 잠갔지만, 「배틀이 닫힐 때 그 규칙이 **정말 불리는가**」는 시험이 못 본다 —
// 그것이 배선이라서다. 그래서 실제 여행에서 잰다.
//
// 재는 것 — 숲에 들어가 동행 플래그가 서는지, 그리고 **한 판을 이긴 직후**
// 파티가 만땅인지. 배틀 전후의 HP를 짝지어 남긴다:
//
//   · 붙었나 — partner true · cheryl 1
//   · 1판 이김 — 전 [31/66, 0/17, 9/19] → 후 [66/66, 17/17, 19/19]   ← 들었다
//   · 1판 이김 — 전 [31/66, 0/17, 9/19] → 후 [31/66, 0/17, 9/19]     ← 안 들었다
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/seg-19.rpsave'
const FOREST = Number(args.find((a) => a.startsWith('--map='))?.slice(6) ?? '203')
const ROUNDS = Number(args.find((a) => a.startsWith('--rounds='))?.slice(9) ?? '6')
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '1500') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/heal42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, map: FOREST, rounds: [] }
const note = (what, detail) => { console.log(`  · ${what} — ${detail}`) }
/** 파티를 「남은 것/만땅」으로 한 줄에 적는다 */
const hp = (party) => JSON.stringify((party ?? []).map(
  (m) => `${String(m.hp)}/${String(m.max ?? '?')}`))
/** 전원이 만땅인가 — 모미의 계약이 이것이다 (`Party_HealAllMembers`) */
const full = (party) => Array.isArray(party) && party.length > 0
  && party.every((m) => m.max !== null && m.max !== undefined && m.hp === m.max)

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

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    skipStory: true,
    after: async (api) => {
      note('들인 자리', `${JSON.stringify(await api.storyVars())} · ${hp(await api.partyState())}`)
      // 숲으로 들어간다 — 모미는 남쪽 문 한 칸 북(28~29,85)을 **밟아야** 붙는다
      const went = await api.goTo(FOREST, Math.min(600_000, api.left()))
      const joined = await api.storyVars()
      out.joined = joined
      note('숲에 들어갔다', `${went} · ${JSON.stringify(joined)}`)

      for (let i = 0; i < ROUNDS && api.left() > 0; i++) {
        /**
         * ⚠️ **배틀 **직전**을 재야 한다.** 걷는 동안 회복이 될 일은 없지만,
         * 「이긴 뒤」만 재면 원래 만땅이었는지 나아서 만땅인지 안 갈린다
         */
        let before = null
        // ⚠️ **전멸하면 숲 밖(428)으로 밀려난다** — 그 자리에서 풀을 찾으면
        // 「배틀이 안 붙었다」만 쌓인다. 판마다 숲으로 돌아가서 센다
        const back = await api.goTo(FOREST, Math.min(300_000, api.left()))
        if (back !== 'arrived') { note(`${String(i + 1)}회`, `숲으로 못 돌아갔다 (${back})`); continue }
        const how = await api.grindForWild(FOREST, Math.min(240_000, api.left()), async () => {
          before = await api.partyState()
          await api.fightThrough()
        })
        if (before === null) { note(`${String(i + 1)}회`, `배틀이 안 붙었다 (${how})`); continue }
        await api.settle()
        const after = await api.partyState()
        const vars = await api.storyVars()
        const row = { i: i + 1, before: hp(before), after: hp(after), full: full(after), vars }
        out.rounds.push(row)
        note(`${String(i + 1)}판`, `전 ${row.before} → 후 ${row.after}`
          + ` · ${row.full ? '만땅이다 — 들었다' : '안 찼다'}`
          + ` · 동행 ${String(vars?.partner)} (${String(vars?.cheryl)})`)
      }
      return out
    },
  })
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await page?.screenshot({ path: `${OUT}/마친-자리.png` }).catch(() => {})
  await browser?.close()
  vite?.child.kill()
}

const healed = out.rounds.filter((r) => r.full).length
console.log(`\n  이긴 판 ${String(out.rounds.length)} · 만땅으로 끝난 판 ${String(healed)}`)
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
