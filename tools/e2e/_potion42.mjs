// 짧은 재현 — **배틀 안에서 약을 쓰는가** (지시서 JOURNEY_BADGE2 §13.5의 3번)
//
//     node tools/e2e/_potion42.mjs [--headed] [--uses=4] [--click]
//     node tools/e2e/_potion42.mjs --shift     교체 물음 앞에서 **옛 판정**을 그대로 밟는다
//     node tools/e2e/_potion42.mjs --drive     대표 구간의 `fightThrough`로 끝까지 싸운다
//
// `--shift` — 옛 하네스는 「싸운다」가 **든** 칸이 있으면 명령 단으로 읽고 ↓ 결정을
// 눌렀다. 시합규칙 「교체」 물음의 「아니오」 칸 밑줄이 「그대로 싸운다」라서, 그
// 물음 앞에서도 같은 일을 했는지를 잰다 (JOURNEY21_NEXT_DECISIONS §6).
// `--drive` — 고친 `drive.fightThrough`(약 문턱을 높여 **아무 턴에나** 쓰게)로 관장전을
// 끝낸다. 못 본 순간이 있으면 `potions.misses`에 화면과 함께 남는다
//
// ⚠️ **진단이다. 대표 구간의 판정에 안 쓴다.** 확인 지점 `gym2`로 **뛰어들면**
// 관장전이 그 자리에서 열린다(`checkpoints`가 그렇게 만들어 둔 것이다) — 여기서
// 묻는 것은 걸어오는 길이 아니라 **약을 쓰는 손이 먹는가**뿐이라서다.
//
// 재는 것 —
//
//   ① 배틀 체력을 **배틀에게** 물어서 읽는가 (`observe.battleHp`).
//      ⚠️ `partyState`(세이브의 파티)는 배틀이 끝나야 바뀐다 — 실측
//      (2026-09-17 journey16): 유채전 내내 만피로 읽혀 문턱이 한 번도 안 걸렸고
//      산 약 넷을 하나도 못 썼다.
//   ② 문턱 아래로 떨어지면 가방을 열어 **첫 줄의 약**을 쓰는가
//   ③ 쓴 뒤 체력이 실제로 **올랐는가** (「눌렀다」가 아니라 값으로 잰다)
//
// 확인 지점 `gym2`의 가방에는 상처약 여덟이 든다 (`checkpoints`의 `STAGE.badge1`).
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { makeObserver } from './observe.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
/** 몇 번까지 쓸까 — 대표 구간은 **셋째·넷째**에서 「안 보인다」가 났다 (journey20 · 21) */
const USES = Number(args.find((a) => a.startsWith('--uses='))?.slice(7) ?? '4')
/** 기술을 **마우스로** 누른다 — 대표 구간의 `pickMove`가 그렇게 누른다 */
const CLICK = args.includes('--click')
const SHIFT = args.includes('--shift')
const DRIVE = args.includes('--drive')
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '420') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/potion42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 상처약. 확인 지점 가방에 든 회복 도구다 (`items.json` — 20 회복) */
const POTION = 17
const POTION_NAME = '상처약'
/** 체력이 이 몫 아래면 쓴다 */
const FLOOR = 0.6

const out = { stamp: STAMP, steps: [], hp: [], verdict: 'BLOCKED_INFRA' }
const note = (what, how) => {
  out.steps.push({ what, how })
  console.log(`  ${what} → ${how}`)
}

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port)
  browser = await chromium.launch({ headless: !HEADED, args: gpuArgs('gl') })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.setDefaultNavigationTimeout(300_000)
  // 확인 지점 목록은 백틱으로 연다 (`firstPersonAudit.enterCheckpoint`와 같은 길)
  await page.goto(vite.url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 300_000 })
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 60_000 })
  const row = page.locator('[data-checkpoint="gym2"]').first()
  await row.waitFor({ timeout: 60_000 })
  await row.hover()
  await page.waitForTimeout(200)
  await row.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 180_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  note('확인 지점 gym2', '들어갔다')

  const obs = await makeObserver(page, 'dev')
  const tap = async (key, hold = 80) => {
    await page.keyboard.down(key)
    await page.waitForTimeout(hold)
    await page.keyboard.up(key)
    await page.waitForTimeout(60)
  }
  const panel = async () => (await page.locator('button').allInnerTexts())
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t !== '' && !t.startsWith('FPS'))
  const scene = () => page.evaluate(() => document.documentElement.dataset.scene ?? null)

  // ① 배틀이 열릴 때까지 넘긴다
  const till = Date.now() + BUDGET
  let opened = false
  for (let i = 0; i < 120 && Date.now() < till; i++) {
    if (await scene() === 'battle') { opened = true; break }
    await tap('Space', 90)
  }
  note('관장전', opened ? '열렸다' : '안 열렸다')
  if (!opened) throw new Error('배틀이 안 열렸다')

  if (DRIVE) {
    /**
     * **교체 물음이 뜬 순간을 따로 지켜본다.** 그때 화면의 칸으로 옛 판정(「싸운다」가
     * **든** 칸)과 새 판정(「싸운다」·「가방」이 칸 **머리**에)이 무엇이라고 답하는지를
     * 나란히 적는다 — 옛 판정이 참인 순간이 곧 옛 하네스가 교체 화면을 연 자리다
     */
    out.shiftMoments = []
    const watcher = setInterval(() => {
      void (async () => {
        const st = await page.evaluate(async () => {
          const m = await import('/src/state/battleStore.ts')
          const s2 = m.useBattleStore.getState()
          const me = s2.view?.active?.p1a ?? null
          return { ask: s2.shiftAsk, turn: s2.view?.turn ?? null, hp: me?.hp ?? null, max: me?.maxHp ?? null }
        }).catch(() => null)
        if (st === null || st.ask === null) return
        const list = await panel()
        const oldReady = list.some((t) => t.includes('싸운다'))
        const newReady = list.some((t) => t.startsWith('싸운다')) && list.some((t) => t.startsWith('가방'))
        // 같은 턴에서 **판정이 같은 표본**은 한 번만 적는다
        const last = out.shiftMoments.at(-1)
        if (last?.turn === st.turn && last.oldReady === oldReady && last.newReady === newReady) return
        out.shiftMoments.push({
          oldReady, newReady,
          turn: st.turn, hp: st.hp, max: st.max,
          low: typeof st.hp === 'number' && typeof st.max === 'number' && st.hp <= st.max * 0.95,
          panel: list.slice(0, 6),
        })
      })()
    }, 250)

    // 문턱을 거의 만피로 둔다 — 교체 물음과 약 쓸 때가 **자주 겹치게**
    const got = await driveStory(page, {
      log: (l) => { console.log(`    ${l}`) },
      totalMs: BUDGET, skipStory: true, shotDir: OUT,
      after: async (api) => {
        api.usePotions(POTION, POTION_NAME, 0.95, USES)
        return api.fightThrough()
      },
    })
    clearInterval(watcher)
    out.potions = got.potions
    out.fought = got.extra
    out.fights = got.fights
    const spentOk = got.potions.uses.every((u) => u.spent === 1 && u.hpPeak > u.hp)
    out.verdict = got.potions.misses.length > 0 ? 'FAILED_VISUAL'
      : got.potions.used === 0 ? 'CAPTURED · 약을 쓸 때가 안 왔다'
        : spentOk ? 'PASS' : 'FAILED_VISUAL'
    note('교체 물음', `${String(out.shiftMoments.length)}번 · `
      + JSON.stringify(out.shiftMoments.map((m) => `턴${String(m.turn)} 옛${m.oldReady ? '참' : '거짓'}`
        + ` 새${m.newReady ? '참' : '거짓'} 체력${String(m.hp)}/${String(m.max)}`)))
    note('drive', `약 ${String(got.potions.used)}번 · 못 봄 ${String(got.potions.misses.length)} · `
      + JSON.stringify(got.potions.uses))
    throw Object.assign(new Error('끝'), { done: true })
  }

  // ② 명령 단이 설 때까지 넘기고, 체력을 **배틀에게** 읽는다
  let used = 0
  let sawLow = false
  let before = null
  let after = null
  for (let i = 0; i < 400 && Date.now() < till; i++) {
    if (await scene() !== 'battle') break
    const me = await obs.battleHp()
    if (me.known && me.value !== null && typeof me.value.hp === 'number') {
      out.hp.push(me.value)
    }
    const list = await panel()
    if (SHIFT) {
      const asking = await page.evaluate(async () => {
        const m = await import('/src/state/battleStore.ts')
        return m.useBattleStore.getState().shiftAsk
      })
      // 옛 판정 — 「싸운다」가 **든** 칸이 있는가
      if (asking !== null && list.some((t) => t.includes('싸운다'))) {
        out.shift = { panelBefore: list }
        await page.screenshot({ path: resolve(OUT, 'shift-before.png') })
        await tap('ArrowDown', 90)
        await tap('Space', 150)
        await page.waitForTimeout(1500)
        out.shift.panelAfter = await panel()
        out.shift.shiftAskAfter = await page.evaluate(async () => {
          const m = await import('/src/state/battleStore.ts')
          return m.useBattleStore.getState().shiftAsk
        })
        out.shift.potionSeen = out.shift.panelAfter.some((t) => t.includes(POTION_NAME))
        out.shift.switchOpened = out.shift.panelAfter.some((t) => /Lv\./.test(t))
        await page.screenshot({ path: resolve(OUT, 'shift-after.png') })
        note('교체 물음에서 옛 판정', JSON.stringify(out.shift))
        out.verdict = out.shift.switchOpened && !out.shift.potionSeen
          ? 'REPRODUCED · 교체 화면이 열렸다' : 'NOT_REPRODUCED'
        throw Object.assign(new Error('끝'), { done: true })
      }
      if (!list.some((t) => t.startsWith('싸운다'))) { await tap('Space', 90); continue }
      // 명령 단에서는 첫 기술로 민다 — 상대를 쓰러뜨려야 물음이 뜬다
      await tap('Space', 120)
      await tap('Space', 120)
      continue
    }
    const ready = list.some((t) => t.startsWith('싸운다'))
    if (!ready) { await tap('Space', 90); continue }
    const v = me.known ? me.value : null
    if (v !== null && typeof v.max === 'number' && v.hp > 0 && v.hp <= v.max * FLOOR && used < USES) {
      sawLow = true
      before = v.hp
      // 싸운다 → 가방
      await tap('ArrowDown', 90)
      await tap('Space', 150)
      let seen = false
      for (let k = 0; k < 50 && !seen; k++) {
        seen = (await panel()).some((t) => t.includes(POTION_NAME))
        if (!seen) await page.waitForTimeout(200)
      }
      if (!seen) {
        for (let k = 0; k < 4 && !seen; k++) {
          await tap('ArrowRight', 150)
          for (let j = 0; j < 10 && !seen; j++) {
            seen = (await panel()).some((t) => t.includes(POTION_NAME))
            if (!seen) await page.waitForTimeout(200)
          }
        }
      }
      note(`${POTION_NAME} 줄`, seen ? '보인다' : `안 보인다 (${JSON.stringify((await panel()).slice(0, 8))})`)
      if (!seen) {
        await page.screenshot({ path: resolve(OUT, `unseen-${String(used + 1)}.png`) })
        out.unseen = { at: used + 1, panel: await panel(), marks: await page.evaluate(() => ({ ...document.documentElement.dataset })) }
        await tap('KeyX', 90)
        break
      }
      await tap('Space', 250)   // 첫 줄
      await tap('Space', 250)   // 누구에게 — 첫 칸
      used += 1
      // 결말이 날 때까지 넘긴다
      for (let k = 0; k < 60; k++) {
        if (await scene() !== 'battle') break
        if ((await panel()).some((t) => t.startsWith('싸운다'))) break
        await tap('Space', 90)
      }
      const now = await obs.battleHp()
      after = now.known && now.value !== null ? now.value.hp : null
      note(`${POTION_NAME} ${String(used)}번째`, `체력 ${String(before)} → ${String(after)}`)
      continue
    }
    // 기술 고르기 — 첫 칸으로 민다
    if (CLICK) {
      await tap('Space', 120)
      const move = page.locator('button').filter({ hasText: /\d+\/\d+/ }).first()
      if (await move.count() > 0) {
        await move.click({ timeout: 3000 }).catch(() => {})
        continue
      }
    }
    await tap('Space', 120)
  }
  await page.screenshot({ path: resolve(OUT, 'battle.png') })
  const seenHp = out.hp.filter((h) => typeof h.hp === 'number')
  const moved = new Set(seenHp.map((h) => h.hp)).size > 1
  note('배틀 체력 읽기', `${String(seenHp.length)}번 읽었다 · 값이 ${moved ? '움직인다' : '안 움직인다'}`
    + (seenHp.length > 0 ? ` (${String(seenHp[0].hp)}/${String(seenHp[0].max)} → ${String(seenHp.at(-1).hp)})` : ''))
  out.used = used
  out.sawLow = sawLow
  out.healed = before !== null && after !== null && after > before
  out.verdict = !moved ? 'FAILED_VISUAL'
    : used === 0 ? (sawLow ? 'FAILED_VISUAL' : 'CAPTURED · 문턱 아래로 안 떨어졌다')
      : out.healed ? 'PASS' : 'FAILED_VISUAL'
} catch (e) {
  if (e?.done !== true) {
    out.error = String(e?.message ?? e)
    console.log(`  터졌다 — ${out.error}`)
  }
} finally {
  await browser?.close().catch(() => {})
  await vite?.stop?.().catch(() => {})
}

writeFileSync(resolve(OUT, 'run.json'), JSON.stringify(out, null, 1))
console.log(`\n  ${out.verdict} · 약 ${String(out.used ?? 0)}번 · ${OUT}`)
process.exit(out.verdict === 'PASS' || out.verdict.startsWith('REPRODUCED') ? 0 : 1)
