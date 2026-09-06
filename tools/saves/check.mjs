// 구운 세이브를 **진짜 불러오기 길로** 들여서 잰다 (PLAN §16.12).
//
//     pnpm saves:check                 폴더에 있는 것 전부
//     pnpm saves:check --only=12-eterna
//     pnpm saves:check --url=http://…  이미 뜬 개발 서버를 쓴다
//
// ⚠️ **파일을 코드로 밀어 넣지 않는다.** 타이틀의 숨은 `<input type="file">`에
// 실제 파일을 얹고, 뜬 확인 창의 「이 리포트로 이어하기」를 누른다 — 사용자가
// 배포본에서 하는 그 길이다. 여기서 통과한 것만 「불러오기로 시험할 수 있다」다.
//
// 네 가지를 잰다. 「열리더라」로 넘어가지 않는다:
//   ① 리포트가 가리키는 맵에 실제로 섰는가
//   ② 삼각형이 붙고 **화면이 도는가**
//   ③ 한 칸이라도 걸어지는가 (막힌 칸에 세워 놓고 통과시키지 않는다)
//   ④ 콘솔이 조용한가
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import {
  ROOT, argOf, canWalk, marks, openTitle, pushScripts, settle, watchNoise,
} from './common.mjs'

const DIR = resolve(ROOT, 'saves')
const ONLY = argOf('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null

const files = readdirSync(DIR).filter((n) => n.endsWith('.rpsave')).sort()
  .filter((n) => ONLY === null || ONLY.some((o) => n.startsWith(o) || n === `${o}.rpsave`))
if (files.length === 0) {
  console.error(`잴 것이 없다 — ${DIR}에 .rpsave가 없다. \`pnpm saves\`로 먼저 굽는다`)
  process.exit(2)
}

/** 봉투 안의 자리. **화면을 안 열고** 알 수 있어야 기대값이 된다 */
function wants(text) {
  const env = JSON.parse(text)
  const data = JSON.parse(env.payload)
  return { map: data.position?.map ?? -1, trainer: env.summary?.trainer ?? '' }
}

let vite = null
let url = argOf('url')
if (url === null) {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-saves')
  url = vite.url
}

const browser = await chromium.launch({ args: gpuArgs('webgpu') })
const context = await browser.newContext({
  viewport: { width: 960, height: 640 }, deviceScaleFactor: 1, acceptDownloads: true,
})

console.log(`세이브 ${String(files.length)}벌을 불러오기 길로 잰다 — 파일마다 새 화면\n`)
const rows = []
for (const name of files) {
  const at = resolve(DIR, name)
  const want = wants(readFileSync(at, 'utf8'))
  const t0 = Date.now()
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(240_000)
  const noise = watchNoise(page)
  let why = null
  let note = ''
  try {
    await openTitle(page, url)
    // ⚠️ **앞 파일이 남긴 리포트를 지운다.** 안 지우면 「덮기 전에 파일로 받는다」가
    // 돌면서 다운로드가 끼고, 무엇을 재는지가 흐려진다
    await page.evaluate(async () => {
      const m = await import('/src/state/saveStore.ts')
      await m.useSaveStore.getState().resetSave({ backup: false })
    })
    // ⚠️ **자리를 좁혀서 고른다.** 설치 마법사에도 파일 칸이 둘 있어서
    // (`import/ui/ImportWizard`) 넓게 고르면 어느 칸에 얹었는지가 흔들린다.
    // 타이틀의 그것은 `.rpsave`만 받는 칸이다
    await page.setInputFiles('input[type=file][accept=".rpsave"]', at)
    const go = page.getByRole('button', { name: '이 리포트로 이어하기' })
    await go.waitFor({ timeout: 30_000 })
    // 계약이 다르면 화면이 한 줄 더 적는다 — 막지는 않지만 표에 남긴다
    if (await page.getByText('콘텐츠 계약이 다릅니다').count() > 0) note = '계약 다름'
    await go.click()
    await page.waitForURL('**/play', { timeout: 60_000 })
    await page.waitForSelector('canvas', { timeout: 120_000 })
    await page.waitForFunction(async (m) => {
      const w = await import('/src/engine/map/world.ts')
      return w.world.mapId === m
    }, want.map, { timeout: 120_000 })
    let shape = await settle(page)
    // ⚠️ **들어서면서 걸린 장면을 먼저 민다.** 그동안 주인공은 묶여 있어서
    // 방향키를 눌러도 `worldState.input.move`가 0이다 — 안 밀고 재면 멀쩡한
    // 자리가 「네 방향 다 못 걸었다」로 적힌다 (실측: 깨어진 세계 1F)
    const scene = await pushScripts(page)
    if (scene.done) shape = await settle(page)
    const now = await marks(page)
    const walk = scene.done ? await canWalk(page) : { moved: null }
    if (scene.frozen === true) why = `들어서며 걸린 장면이 안 끝난다 (${String(scene.taps)}번 눌렀다)`
    else if (!scene.done) why = `들어서며 걸린 장면을 못 끝냈다 (${String(scene.taps)}번 눌렀다)`
    else if (now.map !== want.map) why = `맵이 ${String(now.map)}다 (${String(want.map)}이어야 한다)`
    else if (shape.tri === 0) why = '삼각형이 0이다'
    else if (shape.slow === true) why = `화면이 안 돈다 (0.4초에 ${String(shape.frames ?? 0)}프레임)`
    else if (walk.moved !== true) why = `네 방향 다 못 걸었다 (칸 ${String(walk.from)})`
    else if (noise.ours.length > 0) why = `콘솔 ${String(noise.ours.length)}건: ${noise.ours[0]}`
    rows.push({
      name, ok: why === null, why, map: now.map, tri: shape.tri,
      walk: walk.moved === true ? `${String(walk.from)}→${String(walk.to)}` : '못 걸었다',
      taps: scene.taps ?? 0,
      note, sec: +((Date.now() - t0) / 1000).toFixed(0),
    })
  } catch (e) {
    rows.push({ name, ok: false, why: String(e.message ?? e).slice(0, 200), note })
  }
  await page.close()
  const r = rows[rows.length - 1]
  console.log(r.ok
    ? `  ✓ ${name.padEnd(24)} 맵 ${String(r.map).padStart(3)} · ${(r.tri / 1000).toFixed(1)}k · `
      + `걷기 ${r.walk} · ${String(r.sec)}초`
      + `${r.taps ? ` · 장면 ${String(r.taps)}탭` : ''}${r.note ? ` · ${r.note}` : ''}`
    : `  ✗ ${name.padEnd(24)} ${r.why}`)
}

const bad = rows.filter((r) => !r.ok)
console.log(`\n  통과 ${String(rows.length - bad.length)} · 떨어짐 ${String(bad.length)}`)
for (const r of bad) console.log(`    ${r.name} — ${r.why}`)

await browser.close()
vite?.child.kill()
process.exit(bad.length === 0 ? 0 : 1)
