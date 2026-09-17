// 짧은 재현 — **영원 체육관의 꽃시계를 걸어서 지나가는가** (지시서 JOURNEY_BADGE2 §3.2)
//
//     node tools/e2e/_clock42.mjs [--headed]
//
// ⚠️ **진단이다. 대표 구간의 판정에 안 쓴다.** 여기서는 확인 지점으로 **뛰어들고**
// 파티도 그 표가 주는 넷을 쓴다 (`checkpoints`의 `eterna-clock` → `STAGE.badge1`:
// 토대부기 18 · 찌르비 16 · 꼬링크 15 · 비버니 14 · 몬스터볼 15 · 상처약 8) —
// 축복시티에서 걸어오는
// 데 한 시간이 드는데, 여기서 묻는 것은 걸어오는 길이 아니라 **방 안에서
// 길이 열리는가**뿐이라서다. 걸어서 이어지는지는 `journey`가 따로 잰다.
//
// ⚠️ **체육관 안으로 뛰어들면 안 된다 — 도시에 서서 걸어 들어간다.**
// 실측(2026-09-16) 두 판이 그것을 가르쳤다:
//
//   · `gym2` 지점은 뛰어드는 즉시 **관장전을 연다**
//     (`battle: { kind: 'trainer', id: 315 }` — 훑기가 배틀 화면을 보려고 그렇게
//     만들어 둔 것이다). 주인공은 문 칸 (11,27)에서 한 발짝도 안 움직였다.
//   · `eterna-clock` 지점은 **시계 한복판 (11,13)**에 세운다. 상태 0에서는 그
//     자리가 사방이 막혀 있어서 — 원작이 그렇게 만든 수수께끼다 — 아무 데로도
//     못 간다. 방 안에 **갇힌 채** 재게 된다.
//
// 그래서 영원시티(`eterna`, 맵 65)로 뛰어들어 **체육관 문으로 걸어 들어간다.**
// 도시 안 한 걸음이라 값이 싸고, 방에 들어서는 자리는 원작과 같다
//
// 재는 것 —
//
//   ① 시계 상태마다 **다음 상대에게 닿는가.** 표로 미리 셈한 답은
//      0→트① · 1→트② · 2→트③ · 3→관장이고, **뛰어넘기 없이도** 닿는다
//      (`ETERNA_CLOCK_COLLISION` + 맵 67 격자로 너비 우선)
//   ② 이길 때마다 `VAR_ETERNA_GYM_TRAINERS_BEATEN`과 시계 상태가 오르는가
//   ③ 관장 유채를 이기면 **배지가 2개**가 되는가
//
// ⚠️ **격자는 이 벽을 모른다.** 상태 0에서 시계가 막는 160칸 중 140칸을
// 격자는 걸을 수 있다고 한다 — 그래서 제품의 `eternaBlockedAt`을 읽어
// `driveStory`의 `obstacles`로 넘긴다. 표를 하네스가 다시 세지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '1500') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/clock42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const GYM = 67
/** 체육관 사람들. **차례가 고정이다** (`VAR_ETERNA_GYM_TRAINERS_BEATEN` 1→2→3) */
const GYM_ORDER = [
  { script: 5, what: '트① 캐롤라인 (14,22)' },
  { script: 6, what: '트② 제나 (20,17)' },
  { script: 7, what: '트③ 앤젤라 (2,7)' },
  { script: 4, what: '관장 유채 (11,3)' },
]

const out = { stamp: STAMP, steps: [], gym: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

const storyNow = (p) => p.evaluate(async () => {
  const f = await import('/src/engine/script/field.ts')
  const w = await import('/src/engine/map/world.ts')
  const st = await import('/src/state/worldState.ts')
  const save = await import('/src/state/saveStore.ts')
  const v = f.fieldScripts.vars
  const pos = st.worldState.player.position
  const s = save.useSaveStore.getState()
  let badges = 0
  for (let i = 0; i < 8; i++) if ((s.badges >> i) & 1) badges += 1
  return {
    map: w.world.mapId,
    tile: { x: Math.floor(pos.x), z: Math.floor(pos.z) },
    badges,
    party: s.party.map((m) => ({ species: m.species, level: m.level, hp: m.hp })),
    /** `VAR_ETERNA_GYM_FLOWER_CLOCK_STATE` · `VAR_ETERNA_GYM_TRAINERS_BEATEN` */
    clock: v.get(16459),
    beaten: v.get(16558),
  }
})

/** **제품이 지금 막고 있는 칸.** 표를 하네스가 다시 세지 않는다 */
const clockWalls = (p) => p.evaluate(async () => {
  const g = await import('/src/scene/eternaGym.ts')
  const list = []
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < 32; x++) if (g.eternaBlockedAt(x, z) === true) list.push(`${x},${z}`)
  }
  return list
})

let vite = null
let browser = null
let page = null
let walls = new Set()
const obstacles = (mapId, x, z) => mapId === GYM && walls.has(`${String(x)},${String(z)}`)

try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-clock42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })

  // ── 확인 지점 `eterna`(영원시티)로 뛰어든다 (진단이라 여기서만 쓴다) ──────
  await page.keyboard.press('Backquote')
  const table = page.getByText('확인 지점').first()
  for (let tries = 0; ; tries++) {
    try { await table.waitFor({ timeout: 10_000 }); break } catch {
      if (tries >= 2) throw new Error('확인 지점 표가 안 열렸다')
      await page.keyboard.press('Backquote')
      await page.waitForTimeout(300)
    }
  }
  const row = page.locator('[data-checkpoint="eterna"]').first()
  await row.hover()
  await page.waitForTimeout(150)
  await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForFunction(async () => {
    const m = await import('/src/engine/map/world.ts')
    return m.world.mapId === 65
  }, null, { timeout: 90_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.waitForTimeout(2000)

  out.atLoad = await storyNow(page)
  note('뛰어든 자리', JSON.stringify(out.atLoad))
  await page.screenshot({ path: `${OUT}/들어온-자리.png` })

  const drive = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    skipStory: true,
    obstacles,
    after: async (api) => {
      // 도시에서 **체육관 문으로 걸어 들어간다** — 여기부터가 원작의 자리다
      const inGym = await api.goTo(GYM, Math.min(300_000, api.left()))
      note('영원 체육관(67)으로', String(inGym))
      if (inGym !== 'arrived') { out.end = await storyNow(page); return out }
      await page.screenshot({ path: `${OUT}/체육관-문.png` })

      for (const who of GYM_ORDER) {
        if (api.left() <= 0) { note(who.what, '시간이 다 됐다'); break }
        // 이긴 뒤마다 표가 바뀐다 — **다시 읽는다**
        const list = await clockWalls(page)
        walls = new Set(list)
        const before = await storyNow(page)
        note(`${who.what} 앞`,
          `시계 ${String(before.clock)} · 이긴 수 ${String(before.beaten)}`
          + ` · 막힌 칸 ${String(list.length)} · 칸 ${JSON.stringify(before.tile)}`)
        const said = await api.talkToNpc(GYM, who.script, Math.min(420_000, api.left()))
        await api.clearTalk()
        await api.settle()
        const after = await storyNow(page)
        out.gym.push({
          who: who.what, said, walls: list.length,
          clock: [before.clock, after.clock], beaten: [before.beaten, after.beaten],
          badges: after.badges, at: after.tile, party: after.party,
        })
        note(`${who.what} → ${said ? '만났다' : '못 만났다'}`,
          `시계 ${String(before.clock)}→${String(after.clock)}`
          + ` · 이긴 수 ${String(before.beaten)}→${String(after.beaten)}`
          + ` · 배지 ${String(after.badges)} · 칸 ${JSON.stringify(after.tile)}`)
        await page.screenshot({ path: `${OUT}/뒤-${String(who.script)}.png` })
        if (after.badges >= 2) break
      }
      out.end = await storyNow(page)
      return out
    },
  })
  out.trouble = drive?.trouble ?? null
  out.fights = drive?.fights ?? null
  out.learnAsks = drive?.learnAsks ?? null
  note('걸린 것', JSON.stringify(out.trouble))
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
console.log(`  배지 ${String(out.end?.badges ?? '?')} · 시계 ${String(out.end?.clock ?? '?')}`)
process.exit(out.crash === undefined ? 0 : 1)
