// 전설전에서 **져 보고** 그 뒤에 사람이 다시 걸을 수 있는지 잰다
//
//     node tools/e2e/originLoss.mjs                  시작의 방 · WebGPU · 여섯 마리
//     node tools/e2e/originLoss.mjs --lead=1         선두 한 마리만 (반드시 진다)
//     node tools/e2e/originLoss.mjs --gpu=gl --runs=3
//
// ⚠️ **왜 만들었나.** `story.mjs`의 시작의 방(맵 510)이 일곱 판 중 두 판
// 「스크립트가 안 끝난다 (번호 2)」로 떨어졌고, 떨어진 판만 맵 **414**(떡잎마을
// 주인공 집 1층 — `spawnTable`의 기본 전멸 자리)에서 끝났다. 훑기는 배틀에서
// 스페이스만 누르므로 **승패가 난수**라 같은 소스에서 한 번은 되고 한 번은 안 된다.
// 여기서는 체력을 1로 두고 들어가 그 갈래를 일부러 밟는다.
//
// ⚠️ **`--lead=1`이라야 반드시 진다.** 여섯 마리를 다 체력 1로 둬도 한 마리씩
// 나와 한 대씩 때리므로 **이기는 판이 나온다** — 실측으로 세 판 다 이겼다(맵 510).
// 지는 갈래를 보려면 선두 하나만 남긴다.
//
// ⚠️ **이 도구가 아직 훑기의 실패를 재현하지 못했다.** `--lead=1` 세 판에서
// 전멸은 세 판 다 정상이었고 남은 글이 **14번**에 끝났다 — 훑기가 적은 「A를
// 838번 눌러도 안 끝난다」와 다른 그림이다. 세 판 중 한 판만 글이 끝난 뒤에도
// 안 걸었는데, 그 한 판은 아직 **판정 안 한다.**
//
// ⚠️ **글을 먼저 넘기고 걸어 본다** (`pushScript`). 이 단계 없이 방향키만 눌러
// 보면 **열려 있는 대사창을 「발이 묶였다」로 세게 되고**, 실제로 그렇게 읽어
// 「지면 매번 묶인다」는 틀린 결론을 한 번 냈다. 배틀 뒤에 대사가 이어지는 것도,
// 그동안 못 걷는 것도 정상이다.
//
// ⚠️ **제품이 내놓는 것만 읽는다.** 자리와 갈래는 `document.documentElement`의
// 표식(`scene`·`map`·`tile`·`talk`·`script`)이고, 체력은 `saveStore`가, 교체 화면
// 판정은 `battleStore`의 `actions`가 낸다 (`story.mjs`의 `battleBeat`과 같은 식).
// 없는 값을 null로 접지 않는다.
//
// 쓰는 것 — `.audit/origin-loss.json`
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, '.audit')
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}

const CHECKPOINT = flag('cp', 'origin')
const RUNS = Number(flag('runs', '2'))
/** 선두 한 마리만 남길까. 기본은 훑기와 같은 여섯 마리다 */
const LEAD_ONLY = flag('lead', '') === '1'
/** 떡잎마을 주인공 집 1층. `spawnTable` 첫 줄의 전멸 자리다 */
const PLAYER_HOUSE_1F = 414
/**
 * 배틀 한 판에 누르는 최대 횟수. `story.mjs`의 기본값과 같은 800이다 —
 * 여섯 마리로 지는 판이 400번으로는 안 닫혔다 (실측)
 */
const BATTLE_TAPS = 800
/** 전멸한 뒤 걸어 보는 횟수 */
const WALK_TRIES = 12

const tap = async (page, key, ms = 90) => {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
  await page.waitForTimeout(ms)
}

const marks = (page) => page.evaluate(() => ({ ...document.documentElement.dataset }))

/**
 * 파티를 **체력 1**로 만든다. `--lead=1`이면 선두 한 마리만 남긴다.
 *
 * ⚠️ **여섯 마리를 다 1로 두면 배틀이 안 끝난다.** 선두가 쓰러질 때마다
 * 「누구를 내보낼까」가 뜨는데 거기서 스페이스는 (원작처럼) 아무 일도 안 한다 —
 * 실측으로 400번을 눌러도 배틀이 안 닫혔다. 사람이라면 아래를 눌러 성한 마리로
 * 옮길 자리고, `story.mjs`의 `pushBattle`이 그 처리를 갖고 있다. 여기서 재려는
 * 것은 교체가 아니라 **진 뒤**라, 고를 것을 아예 안 만든다.
 *
 * ⚠️ **회복부터 하고 깎는다.** 확인 지점이 준 파티가 이미 다쳐 있으면 판마다
 * 달라져, 「졌다」가 아니라 「원래 죽어 있었다」가 된다
 */
async function makeFrail(page, leadOnly) {
  await page.evaluate(async () => { await globalThis.pt.heal() })
  await page.waitForTimeout(400)
  return page.evaluate(async (one) => {
    const m = await import('/src/state/saveStore.ts')
    const party = m.useSaveStore.getState().party
    const before = party.map((p) => p.hp)
    const kept = one ? party.slice(0, 1) : party
    if (kept.length === 0) return { count: 0, before, kept: 0 }
    m.useSaveStore.setState({ party: kept.map((p) => ({ ...p, hp: 1 })) })
    return { count: before.length, before, kept: kept.length }
  }, leadOnly)
}

/**
 * 「누구를 내보낼까」가 떠 있는가 — `BattleScreen`의 `forced`와 같은 식이고
 * `story.mjs`의 `battleBeat`이 쓰는 것과 같은 판정이다
 */
const forcedSwitch = (page) => page.evaluate(async () => {
  try {
    const m = await import('/src/state/battleStore.ts')
    const s = m.useBattleStore.getState()
    const moves = s.actions.filter((a) => a.type === 'move').length
    const swaps = s.actions.filter((a) => a.type === 'switch').length
    return moves === 0 && swaps > 0
  } catch { return false }
})

/** 지금 배틀인가 */
const inBattle = async (page) => (await marks(page)).scene === 'battle'

/**
 * 컷신을 밀어 배틀을 연다. 배틀이 서면 그때까지 누른 횟수를 돌려준다.
 *
 * ⚠️ **배틀이 안 서면 그렇다고 적는다.** 여기서 못 열면 뒤 판정은 전부 무의미하다
 */
async function openBattle(page, cap = 400) {
  for (let i = 0; i < cap; i++) {
    if (await inBattle(page)) return { opened: true, taps: i }
    await tap(page, 'Space', 60)
  }
  return { opened: false, taps: cap }
}

/**
 * 배틀이 닫힐 때까지 민다.
 *
 * ⚠️ **선두가 쓰러지면 스페이스만으로는 못 지나간다.** 커서가 그 쓰러진 마리에
 * 서 있고 거기서 A는 (원작처럼) 아무 일도 안 한다 — 실측으로 400번을 눌러도
 * 배틀이 안 닫혔다. 사람이라면 아래를 눌러 옮길 자리다 (`story.mjs`의 같은 자리)
 */
async function pushBattle(page) {
  let pick = 1
  for (let i = 0; i < BATTLE_TAPS; i++) {
    if (!await inBattle(page)) return { closed: true, taps: i }
    if (await forcedSwitch(page)) {
      for (let k = 0; k < 6; k++) await tap(page, 'ArrowUp', 35)
      for (let k = 0; k < pick; k++) await tap(page, 'ArrowDown', 35)
      pick = (pick % 5) + 1
      await page.waitForTimeout(200)
    }
    await tap(page, 'Space', 60)
  }
  return { closed: false, taps: BATTLE_TAPS }
}

/**
 * 남은 글과 스크립트를 **끝까지 민다.**
 *
 * ⚠️ **이걸 빼먹으면 정상까지 「발이 묶였다」로 적힌다.** 배틀 뒤에는 대사가
 * 이어지는 것이 정상이고, 그동안 걷지 못하는 것도 정상이다 — 사람이라면 A를 눌러
 * 넘길 자리다. 처음에 이 단계 없이 방향키만 눌러 보고 「전멸하면 매번 발이
 * 묶인다」로 읽었는데, 그것은 **열려 있는 대사창을 못 걷는 것으로 센 것**이었다.
 * 진짜 결함은 「A를 이만큼 눌러도 안 끝난다」 쪽이다
 */
async function pushScript(page, cap = 600) {
  for (let i = 0; i < cap; i++) {
    const m = await marks(page)
    if (m.scene === 'battle') { await tap(page, 'Space', 60); continue }
    if (m.talk === undefined && m.script === undefined) return { done: true, taps: i }
    await tap(page, 'Space', 55)
  }
  const m = await marks(page)
  return { done: false, taps: cap, talk: m.talk ?? null, script: m.script ?? null }
}

/**
 * 걸어 본다. 칸이 한 번이라도 바뀌면 발이 풀린 것이다.
 *
 * ⚠️ **네 방향을 다 눌러 본다.** 한 방향만 눌러서 안 움직이면 벽에 막힌 것과
 * 발이 묶인 것이 안 갈린다
 */
async function canWalk(page) {
  const first = (await marks(page)).tile ?? null
  const keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']
  for (let i = 0; i < WALK_TRIES; i++) {
    await tap(page, keys[i % keys.length], 120)
    const now = (await marks(page)).tile ?? null
    if (now !== null && first !== null && now !== first) return { walked: true, from: first, to: now }
  }
  return { walked: false, from: first, to: (await marks(page)).tile ?? null }
}

async function main() {
  let vite = null
  let url = flag('url')
  if (!url) {
    const port = await freePort()
    vite = await startVite(port)
    url = vite.url
  }
  const gpu = flag('gpu', 'webgpu')
  const browser = await chromium.launch({ args: gpuArgs(gpu) })
  const out = { gpu, checkpoint: CHECKPOINT, runs: [], notes: [] }

  for (let r = 0; r < RUNS; r++) {
    const page = await browser.newPage({
      viewport: { width: 640, height: 428 }, deviceScaleFactor: 1,
    })
    page.setDefaultNavigationTimeout(240_000)
    const noise = []
    page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()) })
    page.on('pageerror', (e) => { noise.push(`pageerror: ${e.message}`) })
    const run = { n: r + 1, noise }

    try {
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.trim().length > 0,
        null, { timeout: 60_000 })
      await page.keyboard.press('Backquote')
      await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
      const row = page.locator(`[data-checkpoint="${CHECKPOINT}"]`).first()
      await row.hover()
      await page.waitForTimeout(200)
      await row.click()
      await page.waitForURL('**/play', { timeout: 60_000 })
      await page.waitForSelector('canvas', { timeout: 120_000 })
      await page.waitForTimeout(6000)

      run.start = await marks(page)
      run.party = await makeFrail(page, LEAD_ONLY)

      // 확인 지점이 좌표 사건 **북쪽** 한 칸에 남쪽을 보고 세운다 — 한 걸음이 곧 사건이다
      await tap(page, 'ArrowDown', 140)
      run.open = await openBattle(page)
      if (!run.open.opened) {
        run.verdict = '배틀이 안 열렸다 — 이 판은 아무것도 안 쟀다'
        out.runs.push(run)
        await page.close()
        continue
      }
      run.battle = await pushBattle(page)
      // 전멸은 화면이 닫힌 **뒤에** 옮긴다 (`scene/pokecenter`의 `watchBlackOut`)
      await page.waitForTimeout(4000)
      run.after = await marks(page)
      // 남은 대사를 사람처럼 끝까지 넘긴 **뒤에** 걸어 본다
      run.push = await pushScript(page)
      run.walk = await canWalk(page)
      run.end = await marks(page)

      const home = Number(run.after.map) === PLAYER_HOUSE_1F
      run.verdict = !home
        ? `전멸을 안 밟았다 (맵 ${String(run.after.map)}) — 이겼거나 다른 갈래다`
        : !run.push.done
          ? `전멸한 뒤에 **스크립트가 안 끝난다** (A를 ${String(run.push.taps)}번 눌렀다 · `
            + `script=${String(run.push.script)} · talk=${String(run.push.talk)})`
          : run.walk.walked
            ? `전멸한 뒤에 걸을 수 있다 (남은 글을 ${String(run.push.taps)}번에 넘겼다)`
            : `글은 끝났는데 **발이 묶였다** (칸 ${String(run.walk.from)} 그대로 · `
              + `script=${String(run.end.script ?? '없다')} · talk=${String(run.end.talk ?? '없다')})`
    } catch (e) {
      run.verdict = `못 쟀다 — ${String(e?.message ?? e)}`
    }
    console.log(`  ${String(r + 1)}번째  ${String(run.verdict)}`)
    out.runs.push(run)
    await page.close()
  }

  const stuck = out.runs.filter((r) => String(r.verdict).includes('안 끝난다')
    || String(r.verdict).includes('발이 묶였다')).length
  const fine = out.runs.filter((r) => String(r.verdict).startsWith('전멸한 뒤에 걸을 수 있다')).length
  const skipped = out.runs.length - stuck - fine
  console.log(`  발이 묶인 판 ${String(stuck)} · 멀쩡한 판 ${String(fine)}`
    + (skipped > 0 ? ` · 못 잰 판 ${String(skipped)}` : ''))

  mkdirSync(OUT, { recursive: true })
  writeFileSync(resolve(OUT, 'origin-loss.json'), JSON.stringify(out, null, 1))
  console.log('  .audit/origin-loss.json')
  await browser.close()
  vite?.child.kill()
  process.exit(stuck > 0 ? 1 : 0)
}

await main()
