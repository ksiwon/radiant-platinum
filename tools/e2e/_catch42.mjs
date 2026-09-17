// 짧은 재현 — **볼을 던져 파티를 늘리는가** (지시서 JOURNEY_BADGE2 §3.3 (나))
//
//     node tools/e2e/_catch42.mjs [--headed] [--map=345] [--want=2]
//
// 첫 배지 자리의 세이브를 열어 재면 파티가 **모부기 한 마리**고 가방에
// **몬스터볼 여섯**이 들어 있다 (`.audit/journey/end.rpsave`를 뜯어 실측).
// 한 마리로 영원시티까지 걸으면 도중에 전멸한다 — 실측(`_eter42` 3판)으로
// 험한 샛길에서 쓰러져 무쇠 센터(48)로 되돌려 보내졌다.
//
// 원작이 준 답은 **잡는 것**이다. 204번도로 남쪽(345)에는 찌르꼬·꼬링크가
// 4~6레벨로 나오고, 찌르꼬는 비행이라 유채의 풀에 2배다.
//
// 여기서 재는 것 —
//
//   ① 배틀에서 **가방 → 볼 주머니 → 첫 줄**이 실제로 열리고 볼이 나가는가
//   ② 잡히면 파티가 정말 느는가 (화면 글이 아니라 **세이브의 파티**로 본다)
//   ③ 볼 여섯으로 몇 마리가 잡히는가 — 모자라면 마트에서 사는 걸음이 필요하다
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
const WANT = Number(args.find((a) => a.startsWith('--want='))?.slice(7) ?? '2')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/catch42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, map: MAP, want: WANT, steps: [], tries: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

/** 파티와 **볼 개수**. 볼 번호는 도구 번호와 같다 (몬스터볼이 4다) */
const bagNow = (p) => p.evaluate(async () => {
  const m = await import('/src/state/saveStore.ts')
  const s = m.useSaveStore.getState()
  const balls = s.bag.flat().filter((one) => one.item <= 16)
  return {
    party: s.party.map((x) => ({ species: x.species, level: x.level, hp: x.hp })),
    balls: balls.map((b) => ({ item: b.item, count: b.count })),
    money: s.money,
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-catch42')
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

  out.atLoad = await bagNow(page)
  note('들인 자리', JSON.stringify(out.atLoad))

  const drive = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: 1_200_000,
    skipStory: true,
    after: async (api) => {
      const came = await api.goTo(MAP, Math.min(300_000, api.left()))
      note(`${String(MAP)}번 맵으로`, String(came))
      if (came !== 'arrived') return out

      for (let n = 0; n < WANT && api.left() > 120_000; n++) {
        const before = await bagNow(page)
        const got = await api.catchInGrass(MAP, Math.min(420_000, api.left()))
        const after = await bagNow(page)
        out.tries.push({ n, got, before, after })
        note(`${String(n + 1)}마리째`,
          `${got.ok ? '**잡았다**' : `못 잡았다 (${String(got.why)})`}`
          + ` · 던진 볼 ${String(got.thrown ?? 0)}`
          + ` · 파티 ${JSON.stringify(after.party)}`
          + ` · 남은 볼 ${JSON.stringify(after.balls)}`)
        const saw = got.saw ?? out.tries.at(-1)?.got?.saw ?? null
        if (saw !== null) note('볼을 고르던 화면', JSON.stringify(saw.slice(0, 10)))
        await page.screenshot({ path: `${OUT}/${String(n + 1)}마리째.png` })
        if (!got.ok && String(got.why).startsWith('가방에 몬스터볼이')) break
      }
      out.end = await bagNow(page)
      return out
    },
  })
  out.trouble = drive?.trouble ?? null
  out.learnAsks = drive?.learnAsks ?? null
  note('걸린 것', JSON.stringify(out.trouble))
  note('배우기 물음', String(out.learnAsks))
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
console.log(`  파티 ${String(out.end?.party.length ?? '?')}마리`)
process.exit(out.crash === undefined ? 0 : 1)
