// 회복 도구가 **첫 줄이 아닐 때** 제대로 골라 쓰는가 (지시서 2026-09-20 §6-3 / R7).
//
//     pnpm potionrow                    기본: 여섯을 앞에 넣어 목표를 **둘째 쪽**으로
//     pnpm potionrow --gpu=webgpu       사용자가 타는 길로
//
// ⚠️ **한 줄짜리 가방으로는 이 조건을 못 잰다.** 앞선 판의 관장전은 회복 주머니가
// 한 줄뿐이라(`total: 1`) 화면 줄과 세이브 순번이 어긋날 수가 없었다. 여기서는
// 회복 도구 여섯을 먼저 넣어 목표를 **일곱째 줄(둘째 쪽)** 에 세우고, 커서를
// 실제로 옮겨 쓴 뒤 도구 수량·HP를 전후로 남긴다.
//
// 읽는 값은 전부 제품이 화면에 적어 둔 것이다 — `BattleBag`의 `data-item-*`와
// 체력창의 숫자. 스토어를 직접 집지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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

const CHECKPOINT = flag('cp', 'gym3')
/**
 * 써 볼 도구. **둘째 줄 이하**, 그리고 되도록 **둘째 쪽**에 서야 한다.
 *
 * ⚠️ 좋은상처약(26)으로는 이 조건을 못 만든다 — 이 확인 지점의 가방에 이미
 * 열두 개가 들어 있어서 무엇을 더 넣어도 그것이 첫 줄이다(실측 `total: 2`,
 * `screenRow: 0`). 가방은 세이브 순서를 그대로 두고 거르기만 하므로
 * (`BattleBag`의 `list`) **나중에 넣은 것이 아래 줄**이다. 그래서 하이퍼포션을
 * 제일 마지막에 넣어 일곱째 줄에 세운다
 */
const TARGET = Number(flag('item', '25'))
/**
 * 그 앞에 세울 도구들. 전부 회복(HP) 주머니다 —
 * 상처약·후레쉬워터·소다수·레몬에이드·무우무우밀크·에너지가루.
 *
 * ⚠️ 여섯을 넣는 까닭은 **쪽이 넘어가는 자리**를 같이 밟기 위해서다. 한 쪽은
 * 여섯 줄이라(`BattleBag`의 `PER_PAGE`) 일곱째 도구는 지금 화면에 아예 없다 —
 * 「보이는 줄에서 찾기」로는 못 집는 경우가 이것이다
 */
const AHEAD = (flag('ahead', '17,30,31,32,33,34')).split(',').map(Number)
/**
 * 아무 배틀도 안 열려 있을 때 불러올 상대. 단단해서 한 방에 안 죽고 때려 준다.
 *
 * ⚠️ **확인 지점이 이미 배틀을 열어 두는 수가 있다** — `gym3`은
 * `battle: { kind: 'trainer', id: 318 }`이라 뛰어드는 순간 멜리사 관장전이 선다.
 * 그럴 때는 이 값이 안 쓰인다. 무엇과 싸웠는지는 짐작하지 말고 화면에서 읽는다
 * (아래 `foeLabel`)
 */
const FOE = (flag('foe', '95:28:0')).split(':').map(Number)
/** 몇 번 써 볼 것인가 (지시서: 같은 전투 2~4회 연속) */
const TIMES = Number(flag('times', '3'))

const tap = async (page, key, ms = 140) => {
  await page.keyboard.press(key)
  await page.waitForTimeout(ms)
}

/** 배틀 가방이 줄마다 적어 두는 읽기 전용 표시 (`ui/battle/BattleBag`) */
function readBag() {
  const list = document.querySelector('[data-battle-bag="items"]')
  if (list === null) return null
  return {
    pocket: Number(list.getAttribute('data-pocket')),
    cursor: Number(list.getAttribute('data-cursor')),
    total: Number(list.getAttribute('data-items')),
    rows: [...list.querySelectorAll('[data-item-id]')].map((el) => ({
      item: Number(el.getAttribute('data-item-id')),
      row: Number(el.getAttribute('data-item-row')),
      count: Number(el.getAttribute('data-item-count')),
      on: el.getAttribute('aria-selected') === 'true',
      label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  }
}

/** 내 쪽 체력창의 숫자. 화면에 적힌 그대로다 */
function readHp() {
  const card = document.querySelector('[class*="cardMine"]')
  const text = card?.querySelector('[class*="hpText"]')?.textContent ?? ''
  const m = /(\d+)\s*\/\s*(\d+)/.exec(text.replace(/\s+/g, ' '))
  if (!m) return null
  return { hp: Number(m[1]), max: Number(m[2]) }
}

/** 상대 쪽 체력창의 이름. **무엇과 싸우는지는 화면에서 읽는다** */
function readFoe() {
  const card = document.querySelector('[class*="cardFoe"]')
  return (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
}

/** 글창에 떠 있는 줄 */
function readLog() {
  return (document.querySelector('[class*="logText"]')?.textContent ?? '').trim()
}

/** 명령 단이 서 있는가 — 「싸운다」가 보이면 우리 차례다 */
async function commandReady(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, [role="button"]')]
    .some((el) => (el.textContent ?? '').trim().startsWith('싸운다')))
}

/** 명령 단이 설 때까지 넘긴다 */
async function waitCommand(page, ms = 40_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await commandReady(page)) return true
    await tap(page, 'Space', 120)
  }
  return false
}

/** 한 턴 싸운다 — 「싸운다 → 첫 기술」. 글이 바뀐 것으로 확인한다 */
async function fightOnce(page) {
  for (let i = 0; i < 20; i++) {
    await tap(page, 'Space', 260)
    const line = await page.evaluate(readLog)
    if (line !== '' && !line.includes('가랏') && !line.includes('나와라')) return true
  }
  return false
}

/** 명령 단에서 회복 주머니를 연다. 못 읽으면 null */
async function openBag(page) {
  await tap(page, 'ArrowDown', 120)   // 싸운다 → 가방
  await tap(page, 'Space', 400)
  for (let i = 0; i < 40; i++) {
    const seen = await page.evaluate(readBag)
    if (seen !== null) return seen
    await page.waitForTimeout(150)
  }
  return null
}

/** 가방을 닫고 명령 단으로 돌아간다 */
async function backOff(page) {
  for (let i = 0; i < 6 && !(await commandReady(page)); i++) await tap(page, 'KeyX', 160)
}

/**
 * 목표 도구가 선 줄까지 커서를 옮긴다. 선 줄을 돌려준다.
 *
 * ⚠️ **줄 수를 세어 누르고 끝내지 않는다** — 누른 뒤에 **선 줄의 도구 번호**를
 * 다시 읽는다. 한 쪽이 여섯 줄이라(`BattleBag`의 `PER_PAGE`) 일곱째 도구는 지금
 * 화면에 아예 없다. 커서가 더 안 내려가면 목록 끝이므로 거기서 멈춘다
 */
async function walkTo(page, seen, item) {
  let stood = seen.rows.find((r) => r.on) ?? null
  let where = seen.cursor
  for (let i = 0; i <= (Number.isFinite(seen.total) ? seen.total : 40); i++) {
    if (stood !== null && stood.item === item) return stood
    await tap(page, 'ArrowDown', 90)
    const next = await page.evaluate(readBag)
    if (next === null) return null
    if (next.cursor === where) return next.rows.find((r) => r.on) ?? null
    where = next.cursor
    stood = next.rows.find((r) => r.on) ?? null
  }
  return stood
}

/**
 * 지금 그 도구가 몇 개 남았는가 — **그 줄까지 걸어가서** 읽는다.
 *
 * ⚠️ 첫 쪽만 보고 세면 둘째 쪽의 도구는 영영 `null`이다 (실측 2026-09-20)
 */
async function countOf(page, item) {
  const seen = await openBag(page)
  if (seen === null) { await backOff(page); return null }
  const stood = await walkTo(page, seen, item)
  const count = stood !== null && stood.item === item ? stood.count : null
  await backOff(page)
  return count
}

/**
 * 가방을 열고 **목표 도구가 선 줄까지 커서를 옮겨** 쓴다.
 *
 * ⚠️ 줄 수를 세어 누르고 끝내지 않는다 — 누른 뒤에 **선 줄의 도구 번호**를 다시
 * 읽는다. 안 맞으면 결정을 안 누르고 물러난다
 */
async function usePotion(page, note) {
  const before = await page.evaluate(readHp)
  const seen = await openBag(page)
  if (seen === null) { note.why = '회복 주머니 목록을 못 읽었다'; return null }
  const startedAt = seen.cursor
  const stood = await walkTo(page, seen, TARGET)
  if (stood === null || stood.item !== TARGET) {
    note.why = `커서가 목표 줄에 안 섰다 (선 줄 ${JSON.stringify(stood?.label ?? null)})`
    await backOff(page)
    return null
  }
  await tap(page, 'Space', 320)   // 그 약
  await tap(page, 'Space', 320)   // 「누구에게?」 첫 칸 — 선두
  /**
   * ⚠️ **끝값만 보면 「안 나았다」로 적힌다.** 약은 턴을 쓰므로 같은 턴에 상대가
   * 때린다 — 회복이 먹었는지는 **봉우리**로 본다
   */
  let peak = before?.hp ?? 0
  for (let i = 0; i < 80; i++) {
    const now = await page.evaluate(readHp)
    if (now && now.hp > peak) peak = now.hp
    if (await commandReady(page)) break
    await tap(page, 'Space', 110)
  }
  const hpAfter = await page.evaluate(readHp)
  const countAfter = await countOf(page, TARGET)
  return {
    screenRow: stood.row,
    total: seen.total,
    pocket: seen.pocket,
    cursorFrom: startedAt,
    item: stood.item,
    label: stood.label,
    // ⚠️ **선 줄에서 읽는다.** 첫 쪽 목록에서 찾으면 둘째 쪽 도구가 null이 된다
    countBefore: stood.count,
    countAfter,
    foeLabel: await page.evaluate(readFoe),
    hpBefore: before,
    hpPeak: peak,
    hpAfter,
    page1: seen.rows.map((r) => [r.row, r.item, r.count]),
  }
}

async function main() {
  let vite = null
  let url = flag('url')
  if (!url) {
    const port = await freePort()
    vite = await startVite(port)
    url = vite.url
  }
  const gpu = flag('gpu', 'software')
  const browser = await chromium.launch({ args: gpuArgs(gpu) })
  const page = await browser.newPage({ viewport: { width: 640, height: 428 }, deviceScaleFactor: 1 })
  page.setDefaultNavigationTimeout(240_000)
  const noise = []
  page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()) })
  page.on('pageerror', (e) => { noise.push(`pageerror: ${e.message}`) })

  const out = {
    gpu, checkpoint: CHECKPOINT, target: TARGET, ahead: AHEAD, foe: FOE,
    noise, uses: [], notes: [],
  }
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  const row = page.locator(`[data-checkpoint="${CHECKPOINT}"]`).first()
  await row.hover()
  await page.waitForTimeout(200)
  await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.waitForTimeout(6000)
  await page.evaluate(async () => { await globalThis.pt.heal() })
  // ⚠️ 넣는 **차례가 곧 줄 차례다** — 배틀 가방은 세이브 가방의 순서를 그대로 두고
  // `battlePocket` 비트로 거르기만 한다 (`BattleBag`의 `list`)
  for (const ahead of AHEAD) {
    await page.evaluate(async (i) => { await globalThis.pt.item(i, 3) }, ahead)
    await page.waitForTimeout(350)
  }
  await page.evaluate(async (i) => { await globalThis.pt.item(i, 4) }, TARGET)
  await page.waitForTimeout(600)

  let damaged = false
  for (let battle = 0; battle < 4 && !damaged; battle++) {
    // 이미 배틀이 서 있으면(확인 지점이 연 관장전) 그대로 그 배틀에서 잰다
    const already = await page.evaluate(() => document.querySelector('[class*="cardFoe"]') !== null)
    if (!already) {
      await page.evaluate(async (f) => { await globalThis.pt.wild(f[0], f[1], f[2]) }, FOE)
      await page.waitForTimeout(9000)
    }
    if (!(await waitCommand(page))) { out.notes.push('명령 단이 안 섰다'); break }
    for (let turn = 0; turn < 10; turn++) {
      const hp = await page.evaluate(readHp)
      if (hp && hp.hp < hp.max) { damaged = true; break }
      if (!(await fightOnce(page))) break
      if (!(await waitCommand(page))) break
    }
    if (!damaged) out.notes.push(`배틀 ${String(battle + 1)}에서 피해를 못 받았다`)
  }
  out.damaged = damaged

  if (damaged) {
    for (let i = 0; i < TIMES; i++) {
      if (!(await waitCommand(page))) { out.notes.push('명령 단이 안 서서 멈췄다'); break }
      const note = {}
      const used = await usePotion(page, note)
      if (used === null) { out.notes.push(note.why ?? '약을 못 썼다'); break }
      out.uses.push(used)
      if (used.hpAfter && used.hpAfter.hp >= used.hpAfter.max) {
        out.notes.push('체력이 다 차서 더 안 쓴다')
        break
      }
    }
  }

  mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: resolve(OUT, 'potion-row.png') })
  await browser.close()
  vite?.child.kill()

  writeFileSync(resolve(OUT, 'potion-row.json'), JSON.stringify(out, null, 2))
  let bad = 0
  for (const [i, u] of out.uses.entries()) {
    // 조건은 셋이다: **둘째 줄 이하**에서 골랐고, 수량이 하나 줄었고, 체력이 늘었다
    const rowOk = u.screenRow > 0
    const paged = u.screenRow >= 6
    const spent = u.countBefore !== null && u.countAfter !== null && u.countBefore - u.countAfter === 1
    const healed = u.hpBefore !== null && u.hpPeak > u.hpBefore.hp
    const ok = rowOk && spent && healed
    if (!ok) bad++
    console.log(`  ${ok ? '✓' : '✗'} ${String(i + 1)}회  줄 ${String(u.screenRow)}/${String(u.total)} · `
      + `도구 ${String(u.item)} ${String(u.countBefore)}→${String(u.countAfter)} · `
      + `HP ${String(u.hpBefore?.hp)}→봉우리 ${String(u.hpPeak)}/${String(u.hpBefore?.max)}`
      + (paged ? ' · 둘째 쪽' : '') + ` · 상대 ${String(u.foeLabel)}`)
  }
  for (const n of out.notes) console.log(`  · ${n}`)
  if (out.uses.length === 0) { console.log('  ⛔ 한 번도 못 썼다'); bad++ }
  console.log('  .audit/potion-row.json')
  process.exit(bad === 0 ? 0 : 1)
}

await main()
