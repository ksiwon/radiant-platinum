// 진단 — **체육관에서 트레이너 배틀이 왜 되풀이되는가** (야간 실행서 N3)
//
//     node tools/e2e/_fight42.mjs [--headed]
//
// ⚠️ **가설 둘을 한 판에서 가른다.**
//   ① 지고 되돌아오기를 되풀이한다 → 배틀 뒤 **맵이 바뀌고** 파티가 쓰러져 있다
//   ② 이긴 사람이 다시 도전한다 → 맵은 그대로고 **이겼다는 표시가 안 선다**
//      (`engine/actor/sight.ts:164`가 `TRAINER_DEFEATED_FLAGS_START + trainerId`를
//      본다. 그 자리가 안 서면 같은 사람과 끝없이 싸운다)
//
// ⚠️ **읽기만 한다.** 플래그도 파티도 여기서 쓰지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { playOpening } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const HEADED = process.argv.includes('--headed')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/fight42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 무쇠 체육관. 부하 둘은 스크립트 3243·3244 → 트레이너 244·245 */
const GYM = 47
const out = { stamp: STAMP, samples: [], noise: [] }

const marks = (page) => page.evaluate(() => ({ ...document.documentElement.dataset }))
async function tap(page, key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(60)
}

/** 지금 무엇이 서 있나 — 파티·배틀·이겼다는 표시. **읽기만 한다** */
const probe = (page) => page.evaluate(async () => {
  const save = await import('/src/state/saveStore.ts')
  const battle = await import('/src/state/battleStore.ts')
  const field = await import('/src/engine/script/field.ts')
  const cmd = await import('/src/engine/script/commands.ts')
  const world = await import('/src/engine/map/world.ts')
  const s = save.useSaveStore.getState()
  const b = battle.useBattleStore.getState()
  const vars = field.fieldScripts.vars
  /** 체육관 부하 둘과 관장. 스크립트 → 트레이너 번호는 `trainerIdOf`가 안다 */
  const flags = {}
  for (const script of [3243, 3244]) {
    const id = cmd.trainerIdOf(script)
    flags[`trainer${String(id)}`] = vars.checkFlag(cmd.TRAINER_DEFEATED_FLAGS_START + id)
  }
  // 맵 안 번호로 세우는 갈래도 같이 본다 (`SetTargetTrainerDefeated`)
  for (const local of [1, 2, 3, 4, 5]) {
    flags[`local${String(local)}`] = vars.checkFlag(cmd.TRAINER_DEFEATED_FLAGS_START + local)
  }
  return {
    map: world.world.mapId,
    scene: document.documentElement.dataset.scene ?? null,
    phase: b.phase,
    /** 배틀이 어떻게 끝났나 — 스크립트의 `CheckWonBattle`이 보는 값이다 */
    outcome: b.outcome ?? null,
    /** 스크립트가 아직 도는가 · 터진 적이 있는가 */
    script: field.fieldScripts.ctx !== null,
    lastError: field.fieldScripts.lastError === null
      ? null : String(field.fieldScripts.lastError).slice(0, 200),
    /** 파티의 PP — HP가 안 줄어도 이건 준다. 배틀이 실제로 돌았는지가 여기 있다 */
    pp: s.party.map((m) => m.moves.map((slot) => slot.pp)),
    badges: s.badges,
    party: s.party.map((p) => ({ species: p.species, level: p.level, hp: p.hp, status: p.status })),
    flags,
  }
})

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-fight42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  const noise = []
  page.on('pageerror', (e) => {
    noise.push(`pageerror ${String(e.message).slice(0, 200)}`)
    console.error(`  pageerror ${String(e.message).slice(0, 160)}`)
  })
  // ⚠️ **`console.error`도 잡는다.** 배틀을 못 열면 제품이 그것을 콘솔에만
  // 적고 스크립트는 「졌다」로 지나간다 (`scene/fieldServices`의 `startTrainerBattle`)
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    noise.push(`console ${m.text().slice(0, 200)}`)
    console.error(`  console.error ${m.text().slice(0, 160)}`)
  })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await playOpening(page)
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 180_000 })
  await page.waitForFunction(() => document.documentElement.dataset.scene === 'overworld',
    null, { timeout: 180_000 })
  console.log(`  오프닝을 지났다 — ${JSON.stringify(await marks(page))}`)

  await page.evaluate(async () => {
    const cps = await import('/src/engine/dev/checkpoints.ts')
    const dw = await import('/src/app/devWarp.ts')
    const one = cps.CHECKPOINTS.find((c) => c.id === 'gym1')
    const { battle, ...rest } = one
    await dw.warpTo(rest)
  })
  console.log(`  뛰어들라고 올렸다 — ${JSON.stringify(await marks(page))}`)
  await page.waitForFunction(
    (want) => document.documentElement.dataset.map === String(want)
      && document.documentElement.dataset.restoring === undefined,
    GYM, { timeout: 180_000 },
  ).catch(async (e) => {
    console.error(`  맵 ${String(GYM)}에 못 섰다 — 지금 ${JSON.stringify(await marks(page))}`)
    throw e
  })
  await page.waitForTimeout(1500)
  out.start = await probe(page)
  console.log(`  체육관에 섰다 — ${JSON.stringify(out.start)}`)

  /**
   * 북쪽으로 밀면서 **배틀이 열릴 때마다** 앞뒤를 잰다. 여덟 번이면 충분하다 —
   * 체육관에 트레이너는 셋뿐이라, 그보다 많으면 되풀이되는 것이다
   */
  for (let round = 0; round < 4; round++) {
    // 배틀이 열릴 때까지 북으로 민다 (한 판에 최대 40초)
    const till = Date.now() + 40_000
    let opened = null
    while (Date.now() < till) {
      const m = await marks(page)
      if (m.scene === 'battle') { opened = m; break }
      if (m.talk === '1' || m.script === '1' || m.scene === 'menu') { await tap(page, 'Space'); continue }
      await page.keyboard.down('ArrowUp')
      await page.waitForTimeout(500)
      await page.keyboard.up('ArrowUp')
      await page.waitForTimeout(120)
    }
    if (opened === null) {
      console.log(`  ${String(round)}: 40초 동안 배틀이 안 열렸다 — ${JSON.stringify(await marks(page))}`)
      out.samples.push({ round, opened: false, at: await probe(page) })
      break
    }
    const before = await probe(page)
    // 배틀을 끝까지 민다
    for (let i = 0; i < 600; i++) {
      if ((await marks(page)).scene !== 'battle') break
      await tap(page, 'Space', 40)
    }
    await page.waitForTimeout(1200)
    for (let i = 0; i < 40; i++) {
      const m = await marks(page)
      if (m.talk !== '1' && m.script !== '1' && m.scene !== 'menu') break
      await tap(page, 'Space', 40)
    }
    const after = await probe(page)
    out.samples.push({ round, opened: true, before, after })
    console.log(`  ${String(round)}: 맵 ${String(before.map)}→${String(after.map)}`
      + ` · 배지 ${String(after.badges)} · 결말 ${String(after.outcome)}`
      + ` · HP ${JSON.stringify(after.party.map((p) => p.hp))}`
      + ` · PP ${JSON.stringify(after.pp)}`
      + ` · 스크립트 ${String(after.script)} · 오류 ${String(after.lastError)}`
      + ` · 이겼다표시 ${JSON.stringify(after.flags)}`)
  }
  out.noise = noise.slice(0, 20)
  await page.screenshot({ path: `${OUT}/끝.png` })
} catch (e) {
  out.crash = String(e?.message ?? e).slice(0, 400)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
