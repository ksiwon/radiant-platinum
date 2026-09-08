// 짧은 재현 — **관장에게 정상 입력으로 이기고 첫 배지를 받는다** (야간 실행서 N3)
//
//     node tools/e2e/_gym42.mjs            무쇠 체육관 한 자리만
//     node tools/e2e/_gym42.mjs --headed   눈으로 보면서
//
// ⚠️ **이것은 대표 구간이 아니다.** 여기서 하는 것은 「관장 대화 → 배틀 →
// 배지 → 저장 → 새로고침 → 복원」 **한 구간**을 짧게 닫는 일이다. 새 게임부터
// 걸어온 증거는 `pnpm journey`가 내고, 이 결과를 그 증거에 합산하지 않는다
// (`drive.mjs`의 `skipStory` 머리말이 같은 것을 적는다).
//
// ⚠️ **들어오는 길이 둘이고, 증명하는 것이 다르다.**
//
//   · 확인 지점 `gym1` (기본) — `STAGE.oreburgh`의 편성을 **세워 준다**
//     (나무지기 L14 · 찌르호크 L14 · 콜링크 L13). 여기서 몇 판을 이겨도 그것은
//     **체육관 한 구간의 진단**이지 「정상 여정을 완주했다」가 아니다.
//
//   · `--save=<리포트>` — 정상 여정이 그 자리에서 **정상 UI로 쓴** 리포트를
//     사람이 하는 길(파일 고르기 → 이어하기)로 들여온다. 그러면 파티도 배지도
//     이야기 변수도 **걸어서 만든 것**이라, 여기서 받는 배지는 정상 여정
//     파티의 배지다. 예:
//
//         node tools/e2e/_gym42.mjs --save=.audit/journey/seg-10.rpsave
//
// ⚠️ **그래도 이것은 대표 구간이 아니다.** 어느 길로 들어와도 앞 구간을
// **걸어서 이었다**는 증거는 안 만든다 — 그것은 새 게임부터 도는 `pnpm journey`
// 하나뿐이고, 이 결과를 거기에 합산하지 않는다.
//
// ⚠️ **배지·HP·플래그를 직접 쓰지 않는다.** 여기서 쓰는 뒷문은 **자리로
// 뛰어드는 것 하나**뿐이고(확인 지점 `gym1`, 개발 화면의 백틱과 같은 길),
// 그마저도 **자동 배틀은 떼어 낸다** — 배지를 주는 것은 관장 스크립트의
// `GiveBadge`라, 배틀만 열면 이기고도 배지가 안 나온다. 그것을 재려고 만든
// 재현이므로 반드시 **말을 걸어서** 연다.
//
// ⚠️ **`badges`를 읽기만 한다.** 개발 서버에서 모듈을 열어 세이브를 읽는 것은
// `journey.mjs`가 이미 하는 일이고(읽기), 쓰는 길은 여기 없다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory, playOpening } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit === undefined ? d : hit.slice(n.length + 3)
}
const HEADED = args.includes('--headed')
const BUDGET = Number(flag('budget', '600')) * 1000
/** 정상 여정이 쓴 리포트로 들어온다. 없으면 새 게임 + 확인 지점 `gym1` */
const SAVE = flag('save', null)
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/gym42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 무쇠 체육관 · 관장 로안 — 맵 47의 스크립트 1 (`scripts_oreburgh_city_gym.s`) */
const GYM = 47
const ROARK = 1
/**
 * 무쇠시티 포켓몬센터 1F.
 *
 * ⚠️ **6은 축복시티다** (`maps.json`의 `C01PC0101`). 무쇠는 **48**(`C03PC0101`)이고,
 * 체육관(47)에서 걸어서 몇 칸이다 — 6으로 두면 회복하러 203번도로를 도로 넘어야
 * 해서 예산이 거기서 다 나간다
 */
const CENTER = 48

const out = { stamp: STAMP, steps: [] }
const note = (what, verdict, detail) => {
  out.steps.push({ what, verdict, detail })
  console.log(`  ${verdict === 'PASS' ? '✓' : verdict === 'FAIL' ? '✗' : '·'} ${what} — ${detail}`)
}

const marks = (page) => page.evaluate(() => ({ ...document.documentElement.dataset }))

/** 키 하나. `press`는 프레임 사이로 빠져나간다 (`drive.mjs`의 같은 자리) */
async function tap(page, key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(60)
}

/**
 * 시작 메뉴에서 리포트를 쓴다 — `journey.mjs`의 `writeReport`와 같은 길이다.
 *
 * ⚠️ **눈 감고 A를 연타하지 않는다.** 설정 안에 「리포트를 지우고 처음부터」가
 * 있다. 리포트는 늘 **뒤에서 셋째** 칸이다
 */
async function reportViaMenu(page) {
  await tap(page, 'KeyC')
  try {
    await page.waitForSelector('[role="radiogroup"] [role="radio"]', { timeout: 15_000 })
  } catch {
    return { ok: false, why: '시작 메뉴가 안 열렸다' }
  }
  const items = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')]
    return { n: all.length, at: all.findIndex((e) => e.getAttribute('aria-checked') === 'true') }
  })
  const first = await items()
  const want = first.n - 3
  if (want < 0) return { ok: false, why: `시작 메뉴 칸이 ${String(first.n)}개뿐이다` }
  for (let i = 0; i < first.n + 3; i++) {
    const at = await items()
    if (at.at === want) break
    await tap(page, at.at < want ? 'ArrowDown' : 'ArrowUp', 40)
  }
  await tap(page, 'Space')
  let opened = false
  for (let i = 0; i < 30; i++) {
    if ((await marks(page)).menu === 'save') { opened = true; break }
    await page.waitForTimeout(200)
  }
  if (!opened) return { ok: false, why: '리포트 화면이 안 열렸다' }
  for (let i = 0; i < 20; i++) await tap(page, 'Space', 40)
  for (let i = 0; i < 8 && (await marks(page)).menu !== undefined; i++) await tap(page, 'KeyX')
  return { ok: true }
}

/** 세이브를 **읽는다**. 쓰는 길은 이 파일에 없다 */
const readSave = (page) => page.evaluate(async () => {
  const m = await import('/src/state/saveStore.ts')
  const s = m.useSaveStore.getState()
  let badges = 0
  for (let i = 0; i < 8; i++) if ((s.badges >> i) & 1) badges += 1
  return {
    badgeBits: s.badges,
    badges,
    position: { ...s.position },
    party: s.party.map((p) => ({ species: p.species, level: p.level, hp: p.hp })),
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-gym42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  const noise = []
  page.on('pageerror', (e) => { noise.push(String(e.message).slice(0, 200)) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  if (SAVE !== null) {
    // **정상 여정이 쓴 리포트로 들어온다** — 사람이 하는 길 그대로(파일 고르기
    // → 이어하기). 파티도 이야기 변수도 걸어서 만든 것이 그대로 온다
    await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
    const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
    await bring.waitFor({ timeout: 60_000 })
    await bring.click()
    await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
      && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
    await page.waitForTimeout(1500)
    note('리포트로 들어선다', 'PASS', `${SAVE} → ${JSON.stringify(await marks(page))}`)
  } else {
    await page.getByRole('button', { name: '시작', exact: true }).click()
    // ⚠️ **새 판은 오프닝을 거친다.** 타이틀에서 곧바로 뛰어들 수도 있지만
    // (`ui/dev/DevWarpScreen`의 `jump`가 `startNewGame`을 먼저 부른다) 그러면
    // 이름 짓기와 파트너 고르기가 통째로 안 지나간다 — 사람이 하는 길로 간다
    const afterOpening = await playOpening(page)
    console.log(`  오프닝이 끝났다 (주소 ${String(afterOpening)}) — ${JSON.stringify(await marks(page))}`)
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
      null, { timeout: 180_000 })
    await page.waitForFunction(() => document.documentElement.dataset.scene === 'overworld',
      null, { timeout: 180_000 })
    console.log(`  오프닝을 지났다 — ${JSON.stringify(await marks(page))}`)

    // 확인 지점 `gym1`으로 뛰어들되 **자동 배틀은 뗀다** — 배지를 주는 것은
    // 관장 스크립트지 배틀 자체가 아니다
    const warped = await page.evaluate(async () => {
      const cps = await import('/src/engine/dev/checkpoints.ts')
      const dw = await import('/src/app/devWarp.ts')
      const one = cps.CHECKPOINTS.find((c) => c.id === 'gym1')
      if (!one) return '확인 지점 gym1이 없다'
      const { battle, ...rest } = one
      await dw.warpTo(rest)
      return null
    })
    if (warped !== null) throw new Error(warped)

    await page.waitForFunction(
      (want) => document.documentElement.dataset.map === String(want)
        && document.documentElement.dataset.restoring === undefined,
      GYM, { timeout: 180_000 },
    )
    await page.waitForTimeout(1500)
    note('체육관에 선다', 'PASS', `지금 ${JSON.stringify(await marks(page))}`)
  }
  await page.screenshot({ path: `${OUT}/01-선자리.png` })

  const before = await readSave(page)
  if (before.badges !== 0) {
    note('시작 배지', 'FAIL', `0개여야 하는데 ${String(before.badges)}개다 — 재현이 성립 안 한다`)
    throw new Error('배지가 이미 있다')
  }
  note('시작 배지', 'PASS', `0개 · 파티 ${JSON.stringify(before.party)}`)

  // 여기부터는 `drive.mjs`의 손을 그대로 쓴다 — 사람이 하는 것과 같은 길이다
  const result = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    skipStory: true,
    after: async (api) => {
      /**
       * **도전은 세 번까지다.**
       *
       * ⚠️ **같은 상태로 무한히 다시 걸지 않는다** (실행서 §5). 지면 전멸해서
       * 회복 자리로 돌아가는데, 그대로 또 가면 같은 판이 그대로 반복된다.
       * 그래서 판마다 **회복 결과와 파티 상태를 남기고**, 나아지지 않으면
       * 세 번째에서 그만둔다
       */
      const tries = []
      for (let n = 0; n < 3 && api.left() > 60_000; n++) {
        // ① 회복 계약을 먼저 본다. 못 나으면 **관장에게 안 간다**
        const party = await api.partyState()
        let heal = api.fullyHealed(party)
        if (!heal.ok) {
          const got = await api.healAt(CENTER, Math.min(300_000, api.left()))
          heal = { ok: got.ok, why: got.why }
        }
        if (!heal.ok) { tries.push({ n, stopped: `회복이 안 됐다 (${String(heal.why)})`, party }); break }

        // ② 체육관으로 가서 관장에게 **말을 건다**
        const came = await api.goTo(GYM, Math.min(240_000, api.left()))
        if (came !== 'arrived') { tries.push({ n, stopped: `체육관에 못 갔다 (${came})`, heal }); continue }
        const said = await api.talkToNpc(GYM, ROARK, Math.min(300_000, api.left()))
        await api.settle()
        const after = await api.partyState()
        const badges = await page.evaluate(async () => {
          const m = await import('/src/state/saveStore.ts')
          return m.useSaveStore.getState().badges
        })
        tries.push({ n, said, heal, badges, party: after, battles: { ...api.battles } })
        api.log(`  ${String(n)}번째 도전 → ${said ? '말을 걸었다' : '못 걸었다'}`
          + ` · 배지비트 ${String(badges)}`)
        if (badges !== 0) break
      }
      return { tries, battles: { ...api.battles } }
    },
  })
  out.drive = { plan: result.plan, fights: result.fights, trouble: result.trouble, extra: result.extra }

  const after = await readSave(page)
  await page.screenshot({ path: `${OUT}/02-관장뒤.png` })
  const tries = result.extra?.tries ?? []
  const last = tries.at(-1) ?? null
  if (last?.stopped) {
    note('관장에게 도전', 'FAIL', `${String(tries.length)}번 시도 · ${String(last.stopped)}`)
  } else {
    note('관장에게 말을 건다', tries.some((t) => t.said) ? 'PASS' : 'FAIL',
      `${String(tries.length)}번 시도 · 트레이너전 ${String(result.trainer)}회`)
  }
  note('첫 배지', after.badges > 0 ? 'PASS' : 'FAIL',
    `배지 ${String(after.badges)}개 (비트 ${String(after.badgeBits)})`)

  if (after.badges > 0) {
    // ③ **정상 UI로 저장 → 새로고침 → 이어하기.** 배지와 자리가 그대로여야 한다.
    //
    // ⚠️ **`report()`를 직접 안 부른다.** 사람이 여는 길은 시작 메뉴의
    // 리포트고, 그 길에는 확인 문답과 덮어쓰기가 붙어 있다 — 함수를 직접
    // 부르면 그 길이 안 시험된다 (`journey.mjs`의 `writeReport`와 같은 잣대)
    const saved = await reportViaMenu(page)
    const atSave = await readSave(page)
    note('저장', saved.ok ? 'PASS' : 'FAIL',
      saved.ok ? JSON.stringify(atSave.position) : String(saved.why))

    // ⚠️ **`reload()`는 타이틀로 안 간다.** 지금 주소가 `/play`라 다시 켜도
    // 그 자리로 곧장 들어가고, 「이어하기」 단추는 뜨지 않는다 — 실측(2026-09-08)
    // 으로 여기서 120초를 기다리다 터졌다(그때 화면 `url: /play` · 맵 47).
    // 사람이 앱을 다시 켜는 길은 **뿌리 주소**다 (`journey.mjs`의 ⑭와 같다)
    await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
    const resume = page.getByRole('button', { name: '이어하기' })
    await resume.waitFor({ timeout: 120_000 })
    await resume.click()
    await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
    // ⚠️ **시간이 아니라 상태를 기다린다** (`state/restoreStore`)
    await page.waitForFunction(
      () => document.documentElement.dataset.restoring === undefined
        && document.documentElement.dataset.scene === 'overworld',
      null, { timeout: 180_000 },
    )
    /**
     * ⚠️ **화면이 필드라는 것과 그 자리에 섰다는 것은 다르다.**
     * 실측(2026-09-08 · `_resume42`의 자취): 타이틀 → `scene=overworld`인데
     * `world`는 아직 `-1/0 격자없다`인 구간이 있고, 격자가 붙어야 저장한
     * 맵/행렬이 선다. 여기서 1.2초만 기다렸더니 **맵 -1 · 칸 0,0**을 재고
     * 「이어하기 자리 FAIL」로 적었다 — 사람이 보는 화면은 그때 빈 하늘이다.
     * `journey.mjs`의 ⑭가 재는 것과 같은 조건으로 기다린다. 못 서면 상한에서
     * 마지막으로 본 값을 그대로 판정에 넘긴다 — 봐주는 것이 아니다
     */
    const stoodAt = Date.now()
    await page.waitForFunction((want) => {
      const d = document.documentElement.dataset
      return d.restoring === undefined && d.map === String(want)
    }, atSave.position.map, { timeout: 45_000 }).catch(() => null)
    await page.waitForTimeout(600)
    out.stoodMs = Date.now() - stoodAt
    const back = await readSave(page)
    const where = await page.evaluate(async () => {
      const w = await import('/src/engine/map/world.ts')
      const s = await import('/src/state/worldState.ts')
      const p = s.worldState.player
      // ⚠️ **반올림하지 않는다.** 저장은 `6.128900996878148`을 그대로 적는데
      // 여기서 `toFixed(3)`을 걸면 `6.129`가 되어 **맞게 복원된 자리가 틀리게
      // 보인다** — 실측(2026-09-08)으로 그 한 줄이 「이어하기 자리 FAIL」을
      // 만들었다. 값을 깎는 것은 재는 쪽이 아니라 적는 쪽의 일이다
      return {
        map: w.world.mapId, matrix: w.world.matrix,
        x: p.position.x, z: p.position.z,
        facing: p.facing,
      }
    })
    await page.screenshot({ path: `${OUT}/03-이어하기.png` })
    // ⚠️ **여유를 안 준다.** 저장은 칸 가운데(`칸+0.5`)를 그대로 적고 복원도
    // 그 값을 그대로 넣는다 — 반 칸 여유는 어긋난 것을 덮는다
    const same = where.map === atSave.position.map && where.matrix === atSave.position.matrix
      && where.x === atSave.position.x && where.z === atSave.position.z
    note('이어하기 자리', same ? 'PASS' : 'FAIL',
      `저장 ${JSON.stringify(atSave.position)} · 복원 ${JSON.stringify(where)}`)
    note('이어하기 배지', back.badges === after.badges ? 'PASS' : 'FAIL',
      `저장 ${String(after.badges)}개 → 복원 ${String(back.badges)}개`)
    out.roundTrip = { saved: atSave.position, restored: where, badges: [after.badges, back.badges] }
  }

  out.noise = noise.slice(0, 10)
  out.badges = { before: before.badges, after: after.badges }
} catch (e) {
  out.crash = String(e?.message ?? e).slice(0, 400)
  console.error(`  터졌다 — ${out.crash}`)
  // ⚠️ **어디서 멎었는지를 남긴다.** 「시간이 다 됐다」만 적으면 다음 판에서
  // 같은 자리를 또 처음부터 찾아야 한다
  try {
    out.crashMarks = await page.evaluate(() => ({
      ...document.documentElement.dataset, url: location.pathname,
    }))
    console.error(`  그때 화면 — ${JSON.stringify(out.crashMarks)}`)
    await page.screenshot({ path: `${OUT}/터진자리.png` })
  } catch { /* 페이지가 이미 닫혔으면 그만이다 */ }
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
const bad = out.crash !== undefined || out.steps.some((s) => s.verdict === 'FAIL')
process.exit(bad ? 1 : 0)
