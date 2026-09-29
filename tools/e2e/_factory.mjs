// 진단 — **배틀팩토리 한 도전** (PARITY §9.3 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_factory.mjs [--headed]
//
// 접수원에게 말을 걸어 싱글 · 레벨50을 고르고 로비 스크립트 그대로 장면에 들어간다. 셋을 빌려 첫 판을 치르고
//   ① 이기면 「쉰다」로 끈다 → 타이틀에서 이어하기 → 로비가 도전을 잇는다 → 「포기한다」
//   ② 지면 로비의 「또 오세요」로 닫힌다 — **첫 도전은 일부러 진다**(빌린 셋의 HP를 1로). 그 뒤는 이길 때까지 세 번 다시 한다
//   ③ 끝으로 한 번 더 들어가 빌리는 화면에서 새로고침한다(저장 안 하고 끔) → 이어하기 → 연승이 끊긴다
// 읽는 것: 문서 표식(`data-map` · `data-talk` · `data-script` · `data-frontier-stage` · `data-scene`)과
// 제품 모듈이 내보내는 값(`fieldScripts.vars` · `useSaveStore` · `useFactoryStore`) — 롬 글은 안 읽는다
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'shots/factory')
mkdirSync(OUT, { recursive: true })
const args = process.argv.slice(2)
const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
const noise = []
page.on('pageerror', (e) => { noise.push(String(e.message).slice(0, 200)) })
page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text().slice(0, 200)) })
const results = []
const verdict = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
let shot = 0
const snap = async (name) => { shot++; await page.screenshot({ path: resolve(OUT, `${String(shot).padStart(2, '0')}-${name}.png`) }) }

const LOAD_ACTION = 16567
const PRINT_STATE = 16464

const tap = async (key = 'KeyZ', ms = 90) => {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(ms)
}

const state = () => page.evaluate(async ([load, print]) => {
  const f = await import('/src/engine/script/field.ts')
  const s = await import('/src/state/saveStore.ts')
  const fs = await import('/src/state/factoryStore.ts')
  const d = document.documentElement.dataset
  const save = s.useSaveStore.getState()
  const fac = fs.useFactoryStore.getState()
  return {
    map: Number(d.map), talk: d.talk === '1', script: d.script === '1', stage: d.frontierStage === '1',
    scene: d.scene ?? null, menu: d.menu ?? null,
    load: f.fieldScripts.vars.get(load), print: f.fieldScripts.vars.get(print),
    phase: fac.phase, battle: fac.round?.battle ?? null, streak: fac.round?.streak ?? null,
    record: save.factory.records[0], suspended: save.factory.suspended !== null, bp: save.battlePoints,
    // 리포트에 **적힌** 값 — 로비 스크립트가 도는 동안 바뀌는 쪽과 가른다 (`VARS_START` = 0x4000)
    savedLoad: save.vars[load - 0x4000],
  }
}, [LOAD_ACTION, PRINT_STATE])

/** 조건이 설 때까지 Z를 누른다 */
async function pushUntil(done, cap = 300, key = 'KeyZ') {
  for (let i = 0; i < cap; i++) {
    const s = await state()
    if (done(s)) return { ok: true, taps: i, s }
    await tap(key)
  }
  return { ok: false, taps: cap, s: await state() }
}

/**
 * 스크립트가 **다 끝날** 때까지 민다.
 *
 * ⚠️ 장면이 끝나고 로비의 `OnFrame`이 걸리기까지 한 틈이 있다 — 그 틈을 「끝났다」로 읽으면 로비가 뒤처리를
 * 하기 전 값을 잰다. 1.5초 동안 조용해야 끝으로 친다
 */
async function pushUntilQuiet(cap = 300) {
  let quietSince = -1
  for (let i = 0; i < cap; i++) {
    const s = await state()
    const quiet = !s.stage && !s.script && !s.talk
    if (quiet && quietSince < 0) quietSince = Date.now()
    if (!quiet) quietSince = -1
    if (quiet && Date.now() - quietSince > 1500) return { ok: true, taps: i, s }
    if (quiet) { await page.waitForTimeout(250); continue }
    // ⚠️ **대사창이 떠 있을 때만 누른다** — 무대가 걷는 동안 누른 Z가 쌓여 있다가 로비에 돌아온 순간 접수원에게 다시
    // 말을 걸어 새 도전을 연다 (복도 · 배틀룸 걸음이 붙은 뒤로 그 틈이 생겼다)
    if (!s.talk) { await page.waitForTimeout(150); continue }
    await tap()
  }
  return { ok: false, taps: cap, s: await state() }
}

/** 대사창에 선택 창이 떴는가 — 예/아니오는 `예 아니오`, 목록은 `선택` (`ui/field/MessageBox`) */
const menuUp = (label) => page.locator(`[role="radiogroup"][aria-label="${label}"]`).count().then((n) => n > 0)

/** 선택 창이 뜰 때까지 글을 넘긴다. **뜬 뒤에는 안 누른다** — 누르면 첫 줄이 골라진다 */
async function pushUntilMenu(label, cap = 120) {
  for (let i = 0; i < cap; i++) {
    if (await menuUp(label)) return true
    await tap()
    await page.waitForTimeout(200)
  }
  return false
}

const settle = async () => {
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(3000)
}

async function toLobbyAttendant() {
  await page.evaluate(async () => {
    const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
    const { warpTo } = await import('/src/app/devWarp.ts')
    const cp = CHECKPOINTS.find((c) => c.id === 'frontier')
    // 접수원은 (21,6)에서 남쪽을 본다 — 한 칸 아래에서 북쪽을 보고 선다
    await warpTo({ ...cp, id: 'factory-attendant', map: 562, spot: { kind: 'tile', x: 21, z: 7, facing: Math.PI } })
  })
  await settle()
}

/** 접수원 → 싱글 · 레벨50 → 저장 → 복도 → 장면 → 빌리는 화면 */
async function startChallenge() {
  const went = await pushUntil((s) => s.phase === 'rental', 400)
  return went
}

/** 빌리는 화면 — 위에서 셋을 빌리고 「예」 */
async function rentThree() {
  for (let i = 0; i < 3; i++) {
    await tap(); await page.waitForTimeout(150)   // 줄 → [대여받는다 · 닫는다]
    await tap(); await page.waitForTimeout(150)   // 대여받는다
    if (i < 2) await tap('ArrowDown')
  }
  await snap('rental-confirm')
  await tap()                                     // 「이상의 3마리로 괜찮겠습니까?」 — 예
  await page.waitForTimeout(500)
  return state()
}

/** 배틀을 끝까지 민다. 선두가 쓰러져 바꾸는 판이면 아래로 옮겨 고른다 */
async function fight() {
  const opened = await pushUntil((s) => s.scene === 'battle', 200)
  if (!opened.ok) return { opened: false }
  await snap('battle')
  let pick = 1
  for (let i = 0; i < 900; i++) {
    const s = await state()
    if (s.phase !== 'battle') return { opened: true, closed: true, taps: i }
    const forced = await page.evaluate(async () => {
      const m = await import('/src/state/battleStore.ts')
      const a = m.useBattleStore.getState().actions
      return a.filter((x) => x.type === 'move').length === 0 && a.some((x) => x.type === 'switch')
    })
    if (forced) {
      for (let k = 0; k < 6; k++) await tap('ArrowUp', 35)
      for (let k = 0; k < pick; k++) await tap('ArrowDown', 35)
      pick = (pick % 2) + 1
    }
    await tap('Space', 60)
  }
  return { opened: true, closed: false }
}

async function continueFromTitle() {
  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  const cont = page.getByRole('button', { name: '이어하기', exact: true })
  await cont.waitFor({ timeout: 180_000 })
  await cont.click()
  await page.waitForFunction(() => location.pathname.endsWith('/play'), null, { timeout: 180_000 })
  await page.mouse.move(2, 2)
  await settle()
}

await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="frontier"]').first()
await row.hover(); await page.waitForTimeout(150); await row.click()
await page.waitForURL('**/play', { timeout: 400_000 })
await page.mouse.move(2, 2)
await settle()

// ── ①·② 이길 때까지 ────────────────────────────────────────────────────────
let won = false
for (let attempt = 0; attempt < 4 && !won; attempt++) {
  await toLobbyAttendant()
  const began = await startChallenge()
  verdict(`${String(attempt + 1)}회 — 접수원에서 빌리는 화면까지`, began.ok && began.s.stage && began.s.load === 0xff, {
    taps: began.taps, stage: began.s.stage, load: began.s.load, phase: began.s.phase,
  })
  if (!began.ok) break
  await snap('rental')
  const rented = await rentThree()
  verdict('셋을 빌리면 장면으로 돌아간다', rented.phase === 'scene', { phase: rented.phase, menu: rented.menu })
  // 패배 갈래를 반드시 밟는다 — 진단만 하는 조작이다
  if (attempt === 0) {
    await page.evaluate(async () => {
      const fs = await import('/src/state/factoryStore.ts')
      fs.useFactoryStore.setState((st) => ({ party: st.party.map((m) => ({ ...m, hp: 1 })) }))
    })
  }
  const f = await fight()
  verdict('첫 판이 열리고 닫힌다', f.opened && f.closed, f)
  if (!f.closed) break
  // 배틀룸을 나와 복도로 돌아온 뒤 첫 말이 뜰 때까지 기다린다 — 판 수는 그때 올라 있다 (상대가 나가고 문을 지나는 동안은 아직이다)
  let s = await state()
  for (let i = 0; i < 60 && !s.talk && s.stage; i++) { await page.waitForTimeout(200); s = await state() }
  // 이기면 장면이 곧바로 판 수를 올린다 (`BF_FUNC_UNK_14`) — 지면 0에 남는다
  if (s.battle === 1) {
    won = true
    verdict('이기면 판 수 1 · 연승 1', s.battle === 1 && s.streak === 1, { battle: s.battle, streak: s.streak })
  } else {
    // 졌다 — 로비의 「또 오세요」까지 밀면 표식이 0으로 돌아와야 한다
    const back = await pushUntilQuiet()
    await snap('lost-lobby')
    verdict('지면 로비가 도전을 닫는다 — 센터로 안 간다 · LOAD_ACTION 3 → 0 · 표식 꺼짐',
      back.ok && back.s.map === 562 && back.s.load === 0 && back.s.record.active === false,
      { map: back.s.map, load: back.s.load, record: back.s.record })
  }
}

if (won) {
  // 「수고하셨습니다」 → 팡파르 → 「다음은 2번째 게임입니다!」 목록 — 아래로 한 칸(쉰다) → 「리포트를 쓰고 종료하겠습니까?」 예
  const listed = await pushUntilMenu('선택')
  await snap('menu')
  await tap('ArrowDown'); await page.waitForTimeout(200)
  await tap()
  const asked = await pushUntilMenu('예 아니오', 20)
  await snap('rest-question')
  verdict('판 사이 목록 → 쉰다 → 예/아니오', listed && asked, { listed, asked })
  await tap()   // 예
  // 저장하고 전원을 끈다 — 타이틀로 돌아가야 한다
  await page.waitForFunction(() => !location.pathname.endsWith('/play'), null, { timeout: 60_000 }).catch(() => {})
  verdict('쉰다 — 저장하고 끈다(타이틀로 간다)', !page.url().endsWith('/play'), { url: page.url(), listed: listed.ok })

  await continueFromTitle()
  let s = await state()
  verdict('이어하면 리포트에 접어 둔 도전이 있고 적힌 LOAD_ACTION은 2', s.suspended && s.savedLoad === 2 && s.map === 562,
    { suspended: s.suspended, savedLoad: s.savedLoad, map: s.map })
  // 로비의 「이어서 도전하기 전에 저장」 → 복도 → 장면이 곧바로 「다음은 2번째」 목록을 띄운다
  const resumed = await pushUntilMenu('선택', 200)
  await snap('resumed-menu')
  s = await state()
  verdict('로비가 도전을 잇는다 — 곧바로 목록 · 판 수 1 · 연승 1 · 접은 판은 지워진다',
    resumed && s.stage && s.battle === 1 && s.streak === 1 && !s.suspended && s.load === 0xff,
    { resumed, stage: s.stage, battle: s.battle, streak: s.streak, suspended: s.suspended, load: s.load })
  // 「포기한다」 — 아래로 두 칸 → 「중지하겠습니까?」(처음은 아니오) → 위로 → 예
  await tap('ArrowDown'); await tap('ArrowDown'); await page.waitForTimeout(200)
  await tap()
  const retireAsked = await pushUntilMenu('예 아니오', 20)
  await snap('retire-question')
  verdict('포기 물음', retireAsked, { retireAsked })
  await tap('ArrowUp'); await tap()
  const ended = await pushUntilQuiet()
  s = ended.s
  verdict('포기 — 로비가 닫고 표식이 꺼진다 · 연승 기록 1 · 최고 1',
    ended.ok && s.load === 0 && s.record.active === false && s.record.streak === 1 && s.record.best === 1,
    { load: s.load, record: s.record })
}

// ── ③ 저장 안 하고 끈다 ──────────────────────────────────────────────────────
await toLobbyAttendant()
const again = await startChallenge()
verdict('다시 들어가 빌리는 화면까지', again.ok, { taps: again.taps, load: again.s.load })
if (again.ok) {
  await page.reload({ waitUntil: 'load' })
  await continueFromTitle()
  const fresh = await state()
  verdict('다시 켜면 적힌 LOAD_ACTION이 0xFF(도전 중)다', fresh.savedLoad === 0xff, { savedLoad: fresh.savedLoad, map: fresh.map })
  const closed = await pushUntilQuiet()
  await snap('didnt-save')
  const s = closed.s
  verdict('로비가 「저장 안 하고 껐다」로 닫는다 — 연승 0 · 표식 꺼짐 · LOAD_ACTION 0 (`ScrCmd_2C5`)',
    closed.ok && s.load === 0 && s.record.streak === 0 && s.record.active === false,
    { load: s.load, record: s.record })
}

console.log(`  잡음 ${String(noise.length)}건${noise.length > 0 ? ` — ${noise.slice(0, 3).join(' | ')}` : ''}`)
const bad = results.filter((r) => !r.ok)
console.log(`\n${String(results.length - bad.length)}/${String(results.length)}`)
await browser.close()
vite.child.kill()
process.exit(bad.length === 0 ? 0 : 1)
