// 짧은 재현 — **축복시티 북쪽 다리**: 볼을 사고 · 갤럭시단을 치고 · 잡는다
//
//     node tools/e2e/_north42.mjs [--headed] [--save=…]
//
// ⚠️ **진단이다. 대표 구간의 판정에 안 쓴다.** 여기서는 첫 배지 자리의 세이브를
// 물려(`.audit/journey/probe-jubilife.rpsave`) **그 다리 하나만** 잰다 — 새 게임부터
// 걸어오는 데 한 시간이 드는데, 묻는 것은 걸어오는 길이 아니라 세 걸음이 서는가다.
//
// 재는 것 — 셋 다 `journey`에 새로 붙인 코드다:
//
//   ① `buyAt` — 마트 점원(스크립트 1)에게 걸어 상점을 열고 **몬스터볼을 산다.**
//      줄 번호를 짐작하지 않고 `menuStore.shopStock`에서 **그 줄까지** 내려간다.
//      산 것은 글이 아니라 **가방**으로 확인한다.
//   ② `storyVars` — `VAR_JUBILIFE_CITY_STATE`가 3 → **4**로 오르는가.
//      그 값이 4가 되는 자리는 갤럭시단 둘을 이기는 것 하나뿐이다.
//   ③ `catchInGrass` — 204번도로 남쪽에서 파티가 정말 느는가.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
/** 바위만 잰다 — 볼 사기와 잡기를 건너뛴다 (걸음 하나를 따로 볼 때 쓴다) */
const CAVE_ONLY = args.includes('--cave')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7)
  ?? '.audit/journey/probe-jubilife.rpsave'
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '1800') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/north42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 축복 마트 · 몬스터볼 · 갤럭시단 칸 · 잡을 풀밭 — `journey.mjs`와 같은 값이다 */
const MART = 4
const POKE_BALL = 4
const TILE = { x: 173, z: 743 }
const GRASS = 345

const out = { stamp: STAMP, save: SAVE, steps: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-north42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
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
    after: async (api) => {
      out.atLoad = {
        vars: await api.storyVars(), bag: await api.bagState(), party: await api.partyState(),
      }
      note('들인 자리', JSON.stringify(out.atLoad?.vars) + ' · '
        + JSON.stringify(out.atLoad?.bag?.items) + ` · ${String(out.atLoad?.party?.length)}마리`)

      // ⓪ **기술 칸이 다 찬 마리에게 가르친다.** 들인 자리의 모부기는 넷을
      //    채우고 있다 — 원작의 「무엇을 잊을까」가 없으면 여기서 막힌다
      out.taughtFirst = await api.teachHm(425, 249, Math.min(240_000, api.left()))
      note('먼저 모부기에게 가르쳐 본다', JSON.stringify(out.taughtFirst))
      await page.screenshot({ path: `${OUT}/가르친-뒤.png` })

      // ① 산다
      if (!CAVE_ONLY) {
        out.bought = await api.buyAt(MART, POKE_BALL, 10, Math.min(420_000, api.left()))
        note('몬스터볼 열 개', JSON.stringify(out.bought))
        await page.screenshot({ path: `${OUT}/산-뒤.png` })
      }

      // ② 갤럭시단
      const before = await api.storyVars()
      const came = await api.goTo(3, Math.min(240_000, api.left()))
      const stood = came === 'arrived'
        ? await api.stepOn(3, TILE, Math.min(300_000, api.left())) : `못 갔다 (${came})`
      await api.clearTalk()
      await api.settle()
      const after = await api.storyVars()
      out.galactic = { stood, was: before?.jubilife ?? null, now: after?.jubilife ?? null }
      note('갤럭시단 장면', JSON.stringify(out.galactic))
      await page.screenshot({ path: `${OUT}/갤럭시단-뒤.png` })

      // ③ 잡는다 — **누구를** 잡을지 고른다 (찌르꼬 · 비버니)
      out.caught = []
      for (const who of CAVE_ONLY ? [] : [{ what: '찌르꼬', species: [396] }, { what: '비버니', species: [399] }]) {
        if (api.left() < 180_000) break
        // 상한 마리로 풀밭을 돌면 전멸한다 — 잡으러 가기 전에 낫는다
        const hurt = await api.partyState()
        if (!api.fullyHealed(hurt).ok) {
          const healed = await api.healAt(6, Math.min(240_000, api.left()))
          note('잡기 전 회복', healed.ok ? '나았다' : String(healed.why))
        }
        const go = await api.goTo(GRASS, Math.min(240_000, api.left()))
        if (go !== 'arrived') { out.caught.push({ ok: false, why: `풀밭에 못 갔다 (${go})` }); break }
        const got = await api.catchInGrass(GRASS, Math.min(600_000, api.left()), 12, who.species)
        out.caught.push({ what: who.what, ...got })
        note(who.what, `${got.ok ? '잡았다' : `못 잡았다 (${String(got.why)})`}`
          + ` · 파티 ${JSON.stringify(((await api.partyState()) ?? []).map((one) => one.species))}`)
      }
      // ④ 비전머신06을 가르치고 ⑤ 험한 샛길의 바위를 깬다
      out.taught = await api.teachHm(425, 249, Math.min(240_000, api.left()))
      note('바위깨기를 가르친다', JSON.stringify(out.taught))
      const inCave = await api.goTo(254, Math.min(300_000, api.left()))
      note('험한 샛길(254)로', String(inCave))
      if (inCave === 'arrived') {
        out.smash = await api.smashWay(254, 346, Math.min(600_000, api.left()))
        note('바위를 깨고 꽃향기로', JSON.stringify(out.smash))
        await page.screenshot({ path: `${OUT}/바위-뒤.png` })
      }

      out.end = {
        vars: await api.storyVars(), bag: await api.bagState(), party: await api.partyState(),
      }
      await page.screenshot({ path: `${OUT}/마친-자리.png` })
      return out
    },
  })
  out.trouble = drive?.trouble ?? null
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
console.log(`  도시단계 ${String(out.end?.vars?.jubilife ?? '?')}`
  + ` · 파티 ${String(out.end?.party?.length ?? '?')}마리`
  + ` · 가방 ${JSON.stringify(out.end?.bag?.items ?? null)}`)
process.exit(out.crash === undefined ? 0 : 1)
