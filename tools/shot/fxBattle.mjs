// 실제 배틀 화면에서 기술 연출을 찍는다 — `pt.fxBattle` · `pt.fxTurn` (`src/app/devFxBattle.ts`)을 몬다.
//
//     node tools/shot/fxBattle.mjs --url=http://localhost:5403 --case=helping
//     node tools/shot/fxBattle.mjs --url=... --case=magnitude --frames=24 --every=250
//
// 사례는 아래 `CASES`. 한 턴을 낸 뒤 `--every` ms마다 `--frames`장을 `shots/fxbattle/<사례>/`에 찍고 콘솔 오류 · 경고를 모아 말한다.
// ⚠️ 서버는 부르는 쪽이 띄운다(`--url` 필수) — 포트 하나에 하네스 하나
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (n, d = null) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h === undefined ? d : h.slice(n.length + 3) }
const url = flag('url')
if (url === null) { console.error('--url 필수'); process.exit(2) }

const SPLASH = [150]
/** 종족: 25 피카츄 · 26 라이츄 · 76 딱구리 · 51 닥트리오 · 143 잠만보 · 242 해피너스 · 6 리자몽 · 149 망나뇽 · 248 마기라스 · 68 괴력몬 */
const CASES = {
  helping: { // 도우미 — 더블, 앞자리가 도우미를 쓰고 뒷자리가 십만볼트
    opts: { doubles: true, mine: [{ species: 25, moves: [270, 85] }, { species: 26, moves: [270, 85] }], foe: [{ species: 143, moves: SPLASH }, { species: 242, moves: SPLASH }] },
    turn: [{ move: 270 }, { move: 85, target: 1 }],
  },
  assist: { // 어시스트(274) — 발바닥 열둘이 화면 곳곳에 찍힌다 (`DsBodyFx` AssistPaws)
    opts: { doubles: true, mine: [{ species: 25, moves: [274, 85] }, { species: 26, moves: [85, 87] }], foe: [{ species: 143, moves: SPLASH }, { species: 242, moves: SPLASH }] },
    turn: [{ move: 274 }, { move: 85, target: 1 }],
  },
  magnitude: { // 매그니튜드 — 싱글
    opts: { doubles: false, mine: [{ species: 51, moves: [222] }], foe: [{ species: 143, moves: SPLASH }] },
    turn: [{ move: 222 }],
  },
  magnitudeDouble: {
    opts: { doubles: true, mine: [{ species: 51, moves: [222] }, { species: 76, moves: [222] }], foe: [{ species: 143, moves: SPLASH }, { species: 242, moves: SPLASH }] },
    turn: [{ move: 222 }, { move: 222 }],
  },
  m431: { opts: { mine: [{ species: 76, moves: [431] }], foe: [{ species: 143, moves: SPLASH }] }, turn: [{ move: 431 }] },
  m434: { opts: { mine: [{ species: 149, moves: [434] }], foe: [{ species: 143, moves: SPLASH }] }, turn: [{ move: 434 }] },
  m439: { opts: { mine: [{ species: 248, moves: [439] }], foe: [{ species: 143, moves: SPLASH }] }, turn: [{ move: 439 }] },
  stealth: { opts: { mine: [{ species: 76, moves: [446] }], foe: [{ species: 143, moves: SPLASH }] }, turn: [{ move: 446 }] },
  reflect: { opts: { mine: [{ species: 242, moves: [115, 113] }], foe: [{ species: 143, moves: SPLASH }] }, turn: [{ move: 115 }], turn2: [{ move: 113 }] },
}
const name = flag('case')
const spec = CASES[name]
if (spec === undefined) { console.error(`사례: ${Object.keys(CASES).join(' ')}`); process.exit(2) }
const frames = Number(flag('frames', 16))
const every = Number(flag('every', 400))
const OUT = resolve(ROOT, 'shots/fxbattle', name)
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ args: gpuArgs(flag('gpu', 'webgpu')) })
const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultNavigationTimeout(240_000)
const noise = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') noise.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => { noise.push(`pageerror: ${e.message}`) })

await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
await page.keyboard.press('Backquote')
await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
const row = page.locator('[data-checkpoint="center"]').first()
await row.hover(); await page.waitForTimeout(200); await row.click()
await page.waitForURL('**/play', { timeout: 60_000 })
await page.waitForSelector('canvas', { timeout: 120_000 })
await page.waitForFunction(() => typeof globalThis.pt?.fxBattle === 'function', null, { timeout: 60_000 })
await page.waitForTimeout(4000)

const logText = () => page.evaluate(() => (document.querySelector('[class*="logText"]')?.textContent ?? '').trim())
const shot = async (tag) => { const f = resolve(OUT, `${tag}.png`); writeFileSync(f, await page.screenshot()); return `${tag} | ${await logText()}` }
await page.evaluate((o) => globalThis.pt.fxBattle(o), spec.opts)
// 배틀 입력이 설 때까지 (등장 연출이 끝나야 명령 칸이 선다)
await page.waitForFunction(async () => {
  const m = await import('/src/state/battleStore.ts')
  const s = m.useBattleStore.getState()
  return s.phase === 'running' && s.sceneReady && s.actions.length > 0
}, null, { timeout: 180_000 })
// 등장 대사를 Z로 넘긴다 — 「무엇을 할까?」가 뜰 때까지. 이후는 `fxTurn`이 직접 고른다
for (let i = 0; i < 80 && !(await logText()).includes('무엇을 할까'); i++) { await page.keyboard.press('KeyZ'); await page.waitForTimeout(400) }
await page.waitForTimeout(800)
// 로그 줄이 바뀔 때마다 적는다 (250ms 표본 사이로 빠지는 줄을 잡는다)
await page.evaluate(() => {
  globalThis.__log = []
  const t0 = performance.now()
  setInterval(() => {
    const t = (document.querySelector('[class*="logText"]')?.textContent ?? '').trim()
    if (t !== '' && globalThis.__log.at(-1)?.t !== t) globalThis.__log.push({ ms: Math.round(performance.now() - t0), t })
  }, 30)
})
await shot('00-start')
// 연출이 무대에 거는 값을 매 프레임 적는다 — 그림만으로는 흔들림 · 발판 높이를 못 가른다 (`scene/battle/stageRefs`)
await page.evaluate(async () => {
  const r = await import('/src/scene/battle/stageRefs.ts')
  const rows = (globalThis.__probe = [])
  const t0 = performance.now()
  const tick = () => {
    const bodies = {}
    for (const [slot, b] of Object.entries(r.seqStage.body)) if (b) bodies[slot] = { off: b.offset.map((v) => +v.toFixed(3)), shake: b.shake.map((v) => +v.toFixed(3)), vis: b.visible, f: b.frame }
    rows.push({ log: (document.querySelector('[class*="logText"]')?.textContent ?? '').trim().replace(/s+/g, ' '), ms: Math.round(performance.now() - t0), seq: r.seqStage.running, camShake: +r.seqStage.shake.toFixed(3), impT: +r.moveImpact.t.toFixed(3), impCam: r.moveImpact.camera, impShake: r.moveImpact.shake, bodies })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const ok = await page.evaluate((t) => globalThis.pt.fxTurn(...t), spec.turn)
if (flag('rolls')) {
  // 같은 기술을 여러 번 — 굴림마다 흔들림이 어떻게 갈리는지 (probe.json의 `log`가 "매그니튜드 N"인 구간)
  const n = Number(flag('rolls'))
  for (let i = 1; i < n; i++) {
    for (let w = 0; w < 80 && !(await logText()).includes('무엇을 할까'); w++) await page.waitForTimeout(250)
    await page.evaluate((t) => globalThis.pt.fxTurn(...t), spec.turn)
  }
  await page.waitForTimeout(6000)
}
console.log(`turn1 issued=${JSON.stringify(ok)}`)
// 재생 중 대사는 Z로 넘긴다 (200ms마다)
await page.evaluate(() => { globalThis.__z = setInterval(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true })), 200) })
for (let i = 0; i < frames; i++) { await page.waitForTimeout(every); console.log(await shot(`t1-${String(i).padStart(2, '0')}`)) }
if (spec.turn2) {
  const ok2 = await page.evaluate((t) => globalThis.pt.fxTurn(...t), spec.turn2)
  console.log(`turn2 issued=${JSON.stringify(ok2)}`)
  for (let i = 0; i < frames; i++) { await page.waitForTimeout(every); console.log(await shot(`t2-${String(i).padStart(2, '0')}`)) }
}
writeFileSync(resolve(OUT, 'probe.json'), JSON.stringify(await page.evaluate(() => globalThis.__probe)))
console.log('로그:', JSON.stringify(await page.evaluate(() => globalThis.__log)))
console.log(`콘솔 오류·경고 ${String(noise.length)}건`)
for (const n of [...new Set(noise)].slice(0, 30)) console.log('  ' + n)
await browser.close()
