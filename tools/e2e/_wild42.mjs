// 짧은 재현 — **안 끝나는 야생 배틀** (지시서 JOURNEY_BADGE2 §4의 곁가지)
//
//     node tools/e2e/_wild42.mjs [--headed] [--map=345]
//                                [--save=.audit/journey/probe-jubilife.rpsave]
//
// 실측(`_eter42` 두 판): 첫 배지 뒤 파티가 **모부기 한 마리**인 채로 204번도로
// 남쪽(345) 풀밭에 들어서면 야생 배틀이 **800탭 123초 동안 안 끝난다.**
// 트레이너전은 같은 판에서 8~13초에 끝났다. 그래서 「배틀이 느리다」가 아니라
// **그 배틀만 결말이 안 난다**가 맞는 말이다.
//
// 여기서는 그 배틀을 열어 두고 **열 초마다 상태를 적는다** — 단계·결말·
// 나와 있는 마리·화면의 단추. 그래야 셋을 가른다:
//
//   ① 한 마리가 쓰러졌는데 **교체 화면이 떠서** 아무도 못 고른다
//      (한 마리뿐이면 원작은 교체를 안 묻고 전멸로 끝낸다)
//   ② 배틀은 끝났는데 **씬 표식이 안 내려간다**
//   ③ 서로 못 쓰러뜨려 정말 안 끝난다 (기술 고르기가 상태기술만 고른다)
//
// ⚠️ **읽기만 한다.** 고치지 않고, 무엇이 맞는지만 적는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7)
  ?? '.audit/journey/probe-jubilife.rpsave'
const MAP = Number(args.find((a) => a.startsWith('--map='))?.slice(6) ?? '345')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/wild42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, map: MAP, steps: [], watch: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

/** 지금 배틀이 어떤 꼴인가 — **제품이 내놓는 것만 읽는다** */
const battleNow = (p) => p.evaluate(async () => {
  const b = await import('/src/state/battleStore.ts')
  const save = await import('/src/state/saveStore.ts')
  const s = b.useBattleStore.getState()
  const party = save.useSaveStore.getState().party
  const texts = [...document.querySelectorAll('button')]
    .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t !== '')
  return {
    phase: s.phase,
    kind: s.kind,
    outcome: s.outcome,
    error: s.error ?? null,
    foeName: s.foeName,
    /** 우리 파티가 세이브에서는 어떤 꼴인가 — 쓰러졌는지가 여기 있다 */
    party: party.map((m) => ({ species: m.species, level: m.level, hp: m.hp, status: m.status })),
    /** 화면에 뜬 단추 — 명령 단인지 교체 화면인지가 이것으로 갈린다 */
    buttons: texts.slice(0, 16),
    /** 지금 화면에 보이는 글 (대사창 포함) */
    screen: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 400),
    marks: { ...document.documentElement.dataset },
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-wild42')
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
  out.atLoad = await battleNow(page)
  note('들인 자리', JSON.stringify({ party: out.atLoad.party, marks: out.atLoad.marks }))

  const drive = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: 900_000,
    skipStory: true,
    after: async (api) => {
      const came = await api.goTo(MAP, Math.min(300_000, api.left()))
      note(`${String(MAP)}번 맵으로`, String(came))
      if (came !== 'arrived') return out

      /**
       * **하네스에게 몰게 하고, 못 끝내면 그 순간을 찍는다.**
       *
       * 앞 판에서 아무 키도 안 누르고 110초를 봤더니 배틀은 **명령을 기다리며
       * 멀쩡히 서 있었다** — 스페이스 열한 번에 끝났다. 그러니 멎은 것은
       * 게임이 아니라 **누르는 쪽**이다. 여기서는 `fightThrough`에게 그대로
       * 맡기고, 거짓을 돌려준 자리에서 화면을 통째로 적는다
       */
      for (let n = 0; n < 4 && api.left() > 60_000; n++) {
        const how = await api.grindForWild(MAP, Math.min(240_000, api.left()), async () => {
          const t0 = Date.now()
          const ok = await api.fightThrough()
          const b = await battleNow(page)
          const row = { n, ok, sec: Math.round((Date.now() - t0) / 1000), ...b }
          out.watch.push(row)
          console.log(`    [${String(n)}] fightThrough ${ok ? '끝냈다' : '**못 끝냈다**'}`
            + ` · ${String(row.sec)}초 · 단계 ${b.phase} · 파티 ${JSON.stringify(b.party)}`)
          if (!ok) {
            console.log(`        단추 ${JSON.stringify(b.buttons)}`)
            console.log(`        화면 ${b.screen.slice(0, 240)}`)
            await page.screenshot({ path: `${OUT}/못끝낸-${String(n)}.png` })
          }
        })
        if (how !== 'battle') { note(`${String(n)}번째 풀밭`, String(how)); break }
      }
      return out
    },
  })
  out.movePicks = drive?.movePicks ?? null
  out.fights = drive?.fights ?? null
  out.trouble = drive?.trouble ?? null
  note('기술을 무엇으로 골랐나', JSON.stringify(out.movePicks))
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
process.exit(out.crash === undefined ? 0 : 1)
