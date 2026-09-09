// 확인 지점마다 **세이브 파일 한 벌**을 굽는다 (PLAN §16.12).
//
//     pnpm saves                     여든여섯 자리 전부
//     pnpm saves --only=eterna,gym1  그 자리만 (번호는 전체 순서를 따른다)
//     pnpm saves --url=http://…      이미 뜬 개발 서버를 쓴다
//
// ⚠️ **좌표를 손으로 안 적는다.** 확인 지점 표는 「몇 번 맵의 몇 번째 워프」만
// 가리키고 실제 칸은 격자를 보고 그때 정한다 (`engine/dev/checkpoints` 머리말).
// 세이브는 칸을 **적어야만** 하므로, 사람이 옮겨 적는 대신 **실제로 그 자리에
// 세운 뒤 그 자리에서 리포트를 뜬다** — 채우는 코드가 한 벌뿐이라 규칙이 두
// 갈래로 안 벌어진다.
//
// ⚠️ **파일을 우리가 조립하지 않는다.** 화면의 「리포트에 적기」가 내보내는 그
// 길(`pt.report()`의 다운로드)을 그대로 받아 적는다 — 봉투·체크섬·코덱이
// 사용자가 받는 파일과 같아야 「배포본에서 불러오기로 시험한다」가 성립한다.
//
// ⚠️ **자리마다 화면을 새로 연다.** 확인 지점은 가방에 도구를 **더한다**
// (`devWarp`의 `addItem`) — 한 화면에서 여든여섯을 몰면 뒤로 갈수록 앞자리의
// 도구·플래그·도감이 쌓인 세이브가 나온다. 리포트도 매번 지우고 시작한다.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import {
  ROOT, argOf, checkpointsOf, marks, openTitle, pushScripts, saveName, settle, warpTo,
  watchNoise,
} from './common.mjs'

const OUT = resolve(ROOT, 'saves')
const ONLY = argOf('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null

// ⚠️ **`--url`로 넘긴 서버가 src 편집을 겪었으면 안 된다.** vite는 고친 모듈을
// `?t=…` 붙은 **새 주소**로 다시 내주는데, 아래에서 가로채는
// `import('/src/app/devWarp.ts')`는 `?t=` 없는 옛 인스턴스를 잡는다 — 그러면
// 앱이 쓰는 것과 갈려서 배틀 막기가 조용히 샌다 (실측: 열다섯 자리가 전부
// 「배틀이 열렸다」로 떨어졌다). 손대고 나면 서버를 새로 띄운다
let vite = null
let url = argOf('url')
if (url === null) {
  const port = await freePort()
  // ⚠️ **묶음 자리를 갈라 쓴다.** 기본 자리를 다른 하네스와 나눠 쓰면 한쪽이
  // 다시 묶을 때 상대가 `504 Outdated Optimize Dep`으로 죽는다 (`devServer`)
  vite = await startVite(port, 'node_modules/.vite-saves')
  url = vite.url
}

const browser = await chromium.launch({ args: gpuArgs('webgpu') })
const context = await browser.newContext({
  viewport: { width: 960, height: 640 }, deviceScaleFactor: 1, acceptDownloads: true,
})

// 표를 한 번 읽는다 — 노드는 `.ts`를 못 읽으므로 화면 안에서 받는다
const first = await context.newPage()
first.setDefaultNavigationTimeout(240_000)
await openTitle(first, url)
const all = await checkpointsOf(first)
await first.close()
console.log(`확인 지점 ${String(all.length)}자리`)

const list = ONLY === null ? all : all.filter((c) => ONLY.includes(c.id))
const gone = (ONLY ?? []).filter((id) => !all.some((c) => c.id === id))
if (gone.length > 0) {
  console.error(`표에 없는 이름이다: ${gone.join(' · ')}`)
  process.exit(2)
}

mkdirSync(OUT, { recursive: true })
if (ONLY === null) {
  // ⚠️ **없어진 자리의 파일을 남겨 두지 않는다.** 표에서 빠진 이름의 `.rpsave`가
  // 남으면 목록과 폴더가 갈라져서, 다음 사람이 안 쓰는 파일을 붙들고 잰다
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.rpsave')) rmSync(resolve(OUT, name))
  }
}

const rows = []
for (const cp of list) {
  const index = all.findIndex((c) => c.id === cp.id)
  const name = saveName(index, cp.id)
  const t0 = Date.now()
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(240_000)
  const noise = watchNoise(page)
  let why = null
  try {
    await openTitle(page, url)
    // 앞자리가 남긴 리포트를 지운다. 화면의 「처음부터」와 같은 길이다
    await page.evaluate(async () => {
      const m = await import('/src/state/saveStore.ts')
      await m.useSaveStore.getState().resetSave({ backup: false })
    })
    await page.waitForFunction(() => 'pt' in globalThis, null, { timeout: 60_000 })
    // ⚠️ **굽는 동안은 배틀을 안 연다.** 확인 지점 열다섯은 도착하자마자 배틀을
    // 여는데(`Checkpoint.battle`) **세이브는 배틀을 못 담는다** — 열린 채로 뜨면
    // 파일이 배틀 화면 뒤의 상태를 적게 된다. 담고 싶은 것은 그 배틀이 열리는
    // **직전의 자리**고, 파일로 열면 사람이 풀에 들어가거나 눈을 마주쳐서 연다.
    // 손잡이를 새로 파지 않고 올라오는 값을 가로챈다
    await page.evaluate(async () => {
      const w = await import('/src/app/devWarp.ts')
      let inner = null
      Object.defineProperty(w.devWarp, 'pending', {
        get: () => inner,
        set: (v) => { inner = v === null ? null : { ...v, battle: undefined } },
        configurable: true,
      })
    })
    await warpTo(page, cp)
    let shape = await settle(page)
    // 도착하면서 걸린 장면을 끝까지 민다 — 세이브는 도는 스크립트를 못 담는다
    const scene = await pushScripts(page)
    if (scene.done) shape = await settle(page)
    const at = await marks(page)
    if (scene.frozen === true) why = `도착 장면이 안 끝난다 (${String(scene.taps)}번 눌렀다 · ${String(scene.at)})`
    else if (scene.battle === true) why = '배틀이 열렸다 — 굽는 동안은 안 열려야 한다'
    else if (!scene.done) why = `도착 장면을 못 끝냈다 (${String(scene.taps)}번 눌렀다)`
    else if (at.map !== cp.map) why = `맵이 ${String(at.map)}다 (${String(cp.map)}이어야 한다)`
    else if (shape.tri === 0) why = '삼각형이 0이다 — 아무것도 안 그려졌다'
    else if (shape.slow === true) why = `화면이 안 돈다 (0.4초에 ${String(shape.frames ?? 0)}프레임)`
    else if (noise.ours.length > 0) why = `콘솔 ${String(noise.ours.length)}건: ${noise.ours[0]}`

    if (why === null) {
      const [download, out] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        page.evaluate(() => globalThis.pt.report()),
      ])
      const tmp = resolve(ROOT, '.audit/saves.tmp', download.suggestedFilename())
      mkdirSync(resolve(ROOT, '.audit/saves.tmp'), { recursive: true })
      await download.saveAs(tmp)
      const text = readFileSync(tmp, 'utf8')
      if (out.saved !== true) why = `내부 저장이 실패했다: ${String(out.why)}`
      else if (text.length === 0) why = '받은 파일이 비어 있다'
      else {
        writeFileSync(resolve(OUT, name), text)
        rows.push({
          ...cp, name, kb: +(Buffer.byteLength(text) / 1024).toFixed(1),
          tile: at.tile, tri: shape.tri, sec: +((Date.now() - t0) / 1000).toFixed(0),
        })
      }
    }
  } catch (e) {
    why = String(e.message ?? e).slice(0, 200)
  }
  await page.close()
  const n = `${String(rows.length + (why === null ? 0 : 1)).padStart(2)}/${String(list.length)}`
  if (why === null) {
    const r = rows[rows.length - 1]
    console.log(`  ✓ ${n} ${cp.id.padEnd(16)} ${name.padEnd(22)} `
      + `${String(r.kb).padStart(5)}kB · 칸 ${r.tile} · ${(r.tri / 1000).toFixed(1)}k · ${String(r.sec)}초`)
  } else {
    console.log(`  ✗ ${n} ${cp.id.padEnd(16)} ${why}`)
    rows.push({ ...cp, name, failed: why })
  }
}

const ok = rows.filter((r) => r.failed === undefined)
console.log(`\n  구웠다 ${String(ok.length)} · 못 구웠다 ${String(rows.length - ok.length)}`
  + ` · 모두 ${(ok.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(1)}MB`)

// 목록을 같이 적는다 — 파일만 여든여섯 개 있으면 무엇이 무엇인지 모른다.
//
// ⚠️ **이 실행에서 구운 것만 적지 않는다.** `--only`로 몇 자리만 다시 구울 때
// 그러면 목록이 그 몇 줄로 줄어든다 — 목록은 **폴더에 있는 것**을 적는 것이다.
// ⚠️ **못 담는 것을 여기 적는다**: 배틀은 세이브가 못 열고(그 자리에 세우기만
// 한다), 시각은 `hourPin`이 담고, 깨어진 세계는 높이까지 담는다
{
  const have = new Set(readdirSync(OUT).filter((n) => n.endsWith('.rpsave')))
  const line = (r, name) => `| ${name} | ${r.label} | ${String(r.map)} | ${r.stage} | `
    + `${r.battle === null ? '' : '⚔ 그 자리에 세우기만 한다 — 풀에 들어가거나 눈을 마주쳐야 열린다. '}`
    + `${r.hour === null ? '' : `🌙 ${String(r.hour)}시로 못 박았다. `}`
    + `${r.try.join(' · ')} |`
  const listed = all
    .map((cp, i) => [cp, saveName(i, cp.id)])
    .filter((row) => have.has(row[1]))
  const missing = all
    .map((cp, i) => saveName(i, cp.id))
    .filter((name) => !have.has(name))
  writeFileSync(resolve(OUT, 'README.md'),
    ['# 확인 지점 세이브',
      '',
      '`pnpm saves`가 굽고 `pnpm saves:check`가 잰다. **손으로 고치지 않는다** —',
      '맵 자료가 바뀌면 좌표가 낡으므로 다시 굽는다 (PLAN §15.1b).',
      '',
      '타이틀에서 「세이브 파일 불러오기」로 하나 고르고 「이 리포트로 이어하기」를',
      '누른다. **개발 손잡이가 하나도 없는 배포본에서도 같은 길이다.**',
      '',
      `${String(listed.length)} / ${String(all.length)}벌.`
        + (missing.length === 0 ? '' : ` 없는 것: ${missing.join(' · ')}`),
      '',
      '| 파일 | 자리 | 맵 | 단계 | 여기서 볼 것 |',
      '|---|---|---|---|---|',
      ...listed.map((row) => line(row[0], row[1])),
      ''].join('\n'))
  console.log(`  목록을 적었다 — saves/README.md (${String(listed.length)}벌`
    + `${missing.length === 0 ? '' : ` · 없는 것 ${String(missing.length)}`})`)
}

await browser.close()
vite?.child.kill()
process.exit(ok.length === list.length ? 0 : 1)
