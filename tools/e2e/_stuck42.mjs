// 짧은 재현 — **무쇠 체육관의 둘째 배틀이 왜 안 끝나는가** (후속 지시 §6)
//
//     node tools/e2e/_stuck42.mjs [--headed] [--budget=600]
//
// ⚠️ **막은 것은 간호사가 아니었다.** 실측(2026-09-08 `_heal42`): 부하 둘 다
// **말은 걸렸다**(3243 · 3244 모두 `반응했다`). 첫 배틀은 78초·480탭에 끝났고
// 맵도 안 바뀌었다(이겼다). 그런데 **둘째 배틀이 120초 상한을 일곱 번** 그대로
// 먹었다 — `fightThrough`가 상한에 걸려 나가면 배틀이 그대로 서 있으므로
// 다음 호출이 **같은 판에 다시 들어간다**. 그래서 「트레이너 8회」로 적혔고,
// 예산이 다 떨어져 센터에 못 갔고, 회복이 안 돼서 관장에게 못 갔다.
//
// 여기서 가르려는 것 셋:
//   ① 우리가 전멸했는데 게임이 안 끝내는가 (`phase`/`outcome`/파티 HP)
//   ② 교체 화면에서 고를 수 있는 마리가 없어 커서만 도는가 (하네스의 병)
//   ③ 재생기가 어느 사건에서 멈춰 서 있는가 (`view` vs `truth`)
//
// ⚠️ **읽기만 한다.** HP도 플래그도 배지도 안 쓴다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory, playOpening } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '600') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/stuck42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const GYM = 47
const GRUNTS = [3243, 3244]

const out = { stamp: STAMP, samples: [], steps: [], noise: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

/** 배틀이 지금 어디에 서 있나 + **화면에 실제로 뭐가 보이나**. 읽기만 한다 */
const probe = (page) => page.evaluate(async () => {
  const b = await import('/src/state/battleStore.ts')
  const save = await import('/src/state/saveStore.ts')
  const s = b.useBattleStore.getState()
  const sv = save.useSaveStore.getState()
  const seen = (el) => {
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.02
  }
  return {
    t: Math.round(performance.now()),
    scene: document.documentElement.dataset.scene ?? null,
    phase: s.phase,
    outcome: s.outcome,
    error: s.error,
    canSpendTurn: s.canSpendTurn,
    atSlot: s.atSlot,
    actions: s.actions.map((a) => a.kind ?? String(a.type ?? '?')),
    pending: s.pending.length,
    /** 화면이 접은 데까지 vs sim의 **정본**. 갈리면 여기서 갈린다 */
    viewEvents: s.events.length,
    /** ⚠️ 자리마다 하나다 — `view.active`가 `Record<SlotId, ViewMon|null>`이다 */
    view: s.view === null ? null : {
      turn: s.view.turn, ended: s.view.ended, winner: s.view.winner,
      active: Object.fromEntries(Object.entries(s.view.active)
        .filter(([, m]) => m !== null)
        .map(([k, m]) => [k, `${m.speciesName} L${String(m.level)} ${String(m.hp)}/${String(m.maxHp)}`
          + `${m.fainted ? ' 쓰러짐' : ''}`])),
    },
    truth: s.truth === null ? null : {
      turn: s.truth.turn, ended: s.truth.ended, winner: s.truth.winner,
      active: Object.fromEntries(Object.entries(s.truth.active)
        .filter(([, m]) => m !== null)
        .map(([k, m]) => [k, `${m.speciesName} L${String(m.level)} ${String(m.hp)}/${String(m.maxHp)}`
          + `${m.fainted ? ' 쓰러짐' : ''}`])),
    },
    /** sim의 요청이 그리는 파티 여섯 칸 — 교체 화면이 보는 것과 같다 */
    slots: s.party.map((p) => `${String(p.name ?? p.species ?? '?')} ${String(p.hp)}/${String(p.maxHp)}`
      + `${p.fainted === true ? ' 쓰러짐' : ''}${p.active === true ? ' 나와있음' : ''}`),
    lastEvents: s.events.slice(-8).map((e) => JSON.stringify(e).slice(0, 120)),
    party: sv.party.map((p) => `${String(p.species)} L${String(p.level)} ${String(p.hp)}`),
    /** 지금 눌러서 뭔가 될 만한 것들 */
    buttons: [...document.querySelectorAll('button')].filter(seen)
      .map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 40)).slice(0, 12),
    /** 화면에 뜬 글 — 교체 화면의 「싸울 수 없다」가 여기 있다 */
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-stuck42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { out.noise.push(`pageerror ${String(e.message).slice(0, 200)}`) })
  page.on('console', (m) => {
    if (m.type() === 'error') out.noise.push(`console ${m.text().slice(0, 200)}`)
  })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await playOpening(page)
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 180_000 })
  await page.waitForFunction(() => document.documentElement.dataset.scene === 'overworld',
    null, { timeout: 180_000 })

  const bad = await page.evaluate(async () => {
    const cps = await import('/src/engine/dev/checkpoints.ts')
    const dw = await import('/src/app/devWarp.ts')
    const one = cps.CHECKPOINTS.find((c) => c.id === 'gym1')
    if (!one) return '확인 지점 gym1이 없다'
    const { battle, ...rest } = one
    await dw.warpTo(rest)
    return null
  })
  if (bad !== null) throw new Error(bad)
  await page.waitForFunction(() => document.documentElement.dataset.map === '47'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)

  // 배틀이 도는 내내 2초마다 적는다 — 어디서 서는지는 이 줄들에만 있다
  let sampling = true
  const tick = (async () => {
    while (sampling) {
      try { out.samples.push(await probe(page)) } catch { /* 바쁜 순간 */ }
      await page.waitForTimeout(2000)
    }
  })()

  const result = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    skipStory: true,
    after: async (api) => {
      const rounds = []
      for (const script of GRUNTS) {
        if (api.left() <= 30_000) break
        const spot = await api.npcSpot(GYM, script)
        const t0 = Date.now()
        const said = spot === null ? false
          : await api.talkTo(GYM, spot, Math.min(150_000, api.left()))
        await api.settle()
        const at = await probe(page)
        rounds.push({ script, spot, said, ms: Date.now() - t0, at })
        note(`부하 ${String(script)}`, `${said ? '걸렸다' : '못 걸었다'}`
          + ` · ${String(Math.round((Date.now() - t0) / 1000))}초 · 화면 ${String(at.scene)}`
          + ` · 배틀 ${String(at.phase)}/${String(at.outcome)} · 내 파티 ${JSON.stringify(at.party)}`)
        await page.screenshot({ path: `${OUT}/부하-${String(script)}.png` })
      }
      return { rounds, fights: api.battles }
    },
  })
  sampling = false
  await tick
  out.result = result
  out.last = await probe(page)
  await page.screenshot({ path: `${OUT}/끝.png` })
  note('끝난 자리', JSON.stringify(out.last).slice(0, 500))
} catch (e) {
  out.crash = String(e?.message ?? e).slice(0, 400)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
