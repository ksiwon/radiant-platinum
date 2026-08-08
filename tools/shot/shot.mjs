// 화면을 열고 확인 지점으로 뛰어들어 **그림을 찍는다.**
//
//     pnpm shot forest                 확인 지점 하나
//     pnpm shot forest --keys=z,z,z    뛰어든 뒤 키를 더 누른다
//     pnpm shot --list                 확인 지점 목록
//
// ⚠️ **이 프로젝트에는 여태 브라우저 자동화가 없었다.** 그래서 "수치는 맞는데
// 화면은 틀린" 것이 여러 번 지나갔다 — 소품 뒷면, 숲 바닥 감는 방향, 고르는
// 장면의 16배. 마지막 것은 시험 1,056개가 전부 초록인 채로 화면이 비어 있었다.
// 그 구멍을 메우는 도구다.
//
// ⚠️ **찍힌 것이 진짜 그린 그림인지 반드시 잰다.** 헤드리스에서 제일 흔한 실패가
// **까만 그림이 성공으로 찍히는 것**이다. 그래서 픽셀 통계를 같이 내고, 거의
// 한 색이면 종료 코드를 1로 준다 — 그림만 보고 "됐다"고 하지 않기 위해서다.
//
// ⚠️ **WebGPU는 없다.** 헤드리스 크로미움에 없어서 앱이 WebGL2로 폴백한다
// (SwiftShader, 소프트웨어 래스터라이저). 그래서 **화면 배치·모델·텍스처는
// 그대로지만 속도는 실제와 전혀 다르다.** 성능은 여기서 재면 안 된다.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, 'shots')

/** 찍을 때 크기 */
const VIEWPORT = { width: 960, height: 640 }
/**
 * **몰고 다닐 때** 크기.
 *
 * ⚠️ 소프트웨어 래스터라이저라 픽셀 수가 그대로 속도다. 960×640에서 4~7 FPS인데
 * **스크립트가 프레임에 묶여 있다** — 글 한 줄 찍는 데 몇 초, 컷신 하나에 몇 분이
 * 걸린다. 실제로 201번 도로 컷신을 "멈춘 것"으로 잘못 읽을 뻔했다.
 * 작게 몰고 찍기 직전에만 키운다 (픽셀 9분의 1)
 */
const DRIVE = { width: 320, height: 214 }
/** 뛰어든 뒤 청크가 붙기를 기다리는 시간 */
const SETTLE_MS = 6000

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const targets = args.filter((a) => !a.startsWith('--'))
const listing = args.includes('--list')

/**
 * 확인 지점 목록을 **돌고 있는 페이지에서** 받는다.
 *
 * ⚠️ 노드에서 `checkpoints.ts`를 바로 부를 수 없다 — 타입 스트리핑은 확장자
 * 없는 상대 경로를 못 푼다. 그리고 여기서 목록을 따로 적으면 화면이 고르는
 * 차례와 이 도구가 세는 차례가 조용히 갈린다. vite가 그 모듈을 그대로 내주므로
 * **화면이 쓰는 바로 그것**을 받는다
 */
async function checkpointsOf(page) {
  return page.evaluate(async () => {
    const m = await import('/src/engine/dev/checkpoints.ts')
    return m.CHECKPOINTS.map((c) => ({ id: c.id, title: c.label, map: c.map }))
  })
}

async function freePort() {
  return new Promise((ok) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => { ok(port) })
    })
  })
}

/**
 * vite 개발 서버를 띄우고 주소가 뜰 때까지 기다린다.
 *
 * ⚠️ **`npx`가 아니라 vite의 js를 노드로 바로 부른다.** 윈도우에서 `.cmd`를
 * 셸 없이 spawn하면 EINVAL이고, 셸을 끼우면 이번에는 손자 프로세스가 남아
 * 개발 서버가 안 죽는다
 */
async function startVite(port) {
  const child = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  // ⚠️ 출력에서 주소를 긁지 않는다 — vite가 포트에 굵게 표시하는 색 코드를 끼워
  // 넣어서 `localhost:5199`가 통째로 안 잡힌다. 포트는 우리가 정했으니 **열렸는지만**
  // 두드려 본다
  let log = ''
  child.stdout.on('data', (b) => { log += b })
  child.stderr.on('data', (b) => { log += b })
  let dead = null
  child.on('exit', (code) => { dead = code })

  // ⚠️ 127.0.0.1이 아니라 localhost다 — 윈도우에서 vite가 ::1에만 붙는다
  const url = `http://localhost:${String(port)}`
  const until = Date.now() + 180_000
  for (;;) {
    if (dead !== null) throw new Error(`vite가 죽었다 (${String(dead)})\n${log}`)
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (r.ok) break
    } catch { /* 아직 안 떴다 */ }
    if (Date.now() > until) throw new Error(`vite가 안 떴다 (3분)\n${log}`)
    await new Promise((ok) => setTimeout(ok, 400))
  }
  return { child, url }
}

/** 8비트 PNG를 편다. 필터 다섯 가지를 다 푼다 */
function decodePng(buf) {
  let at = 8, w = 0, h = 0, depth = 0, kind = 0
  const idat = []
  while (at < buf.length) {
    const len = buf.readUInt32BE(at)
    const type = buf.subarray(at + 4, at + 8).toString('latin1')
    const data = buf.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; kind = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    at += 12 + len
  }
  const bpp = kind === 6 ? 4 : kind === 2 ? 3 : 0
  if (depth !== 8 || bpp === 0) throw new Error(`못 읽는 PNG (depth ${depth} · type ${kind})`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const out = Buffer.alloc(h * stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[p++]
    for (let x = 0; x < stride; x++) {
      const cur = raw[p + x]
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let v
      switch (filter) {
        case 0: v = cur; break
        case 1: v = cur + a; break
        case 2: v = cur + b; break
        case 3: v = cur + ((a + b) >> 1); break
        default: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
        }
      }
      out[y * stride + x] = v & 0xff
    }
    p += stride
  }
  return { w, h, bpp, pixels: out }
}

/**
 * 찍힌 그림이 정말 그려진 것인가.
 *
 * ⚠️ **캔버스를 `drawImage`로 읽으면 안 된다.** three는
 * `preserveDrawingBuffer: false`라 프레임이 끝나면 버퍼가 비고, 그 캔버스를
 * 2D로 옮기면 **까맣게 나온다.** 실제로 화면이 멀쩡한데 통계만 "색 1 · 밝기 0"이
 * 나왔다 — 하마터면 그린 화면을 못 그렸다고 적을 뻔했다.
 *
 * 그래서 **찍은 PNG를 편다.** 플레이라이트의 스크린샷은 합성기가 뜨는 것이라
 * 그 문제가 없다
 */
function statsOf(png) {
  const { w, h, bpp, pixels } = decodePng(png)
  const colors = new Set()
  let sum = 0, sum2 = 0
  const n = w * h
  for (let i = 0; i < n; i++) {
    const o = i * bpp
    const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2]
    const l = (r * 299 + g * 587 + b * 114) / 1000
    sum += l; sum2 += l * l
    colors.add((r >> 3 << 10) | (g >> 3 << 5) | (b >> 3))
  }
  const mean = sum / n
  return { colors: colors.size, mean, stdev: Math.sqrt(sum2 / n - mean * mean) }
}

async function main() {
  if (targets.length === 0 && !listing) {
    console.error('확인 지점을 하나 이상 대라. 목록: pnpm shot --list')
    process.exit(2)
  }

  let vite = null
  let url = flag('url')
  if (!url) {
    const port = await freePort()
    vite = await startVite(port)
    url = vite.url
  }

  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: DRIVE, deviceScaleFactor: 1 })
  const noise = []
  page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()) })
  page.on('pageerror', (e) => { noise.push(`pageerror: ${e.message}`) })

  await page.goto(url, { waitUntil: 'load' })
  // ⚠️ 타이틀에는 canvas가 없다 — three를 초기 청크에서 빼려고 무대를 늦게
  // 붙인다(PLAN §10.4). 그래서 글이 뜨는 것으로 기다린다
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  const checkpoints = await checkpointsOf(page)
  if (listing) {
    for (const [i, cp] of checkpoints.entries()) {
      console.log(`${String(i).padStart(3)} ${cp.id.padEnd(12)} ${cp.title}`)
    }
    await browser.close()
    vite?.child.kill()
    return
  }
  const unknown = targets.filter((t) => !checkpoints.some((c) => c.id === t))
  if (unknown.length > 0) {
    console.error(`모르는 확인 지점: ${unknown.join(' ')}`)
    await browser.close()
    vite?.child.kill()
    process.exit(2)
  }

  mkdirSync(OUT, { recursive: true })
  let bad = 0
  for (const id of targets) {
    const cp = checkpoints.find((c) => c.id === id)
    await page.setViewportSize(DRIVE)
    await page.goto(url, { waitUntil: 'load' })
    // 타이틀이 뜰 때까지. 여기서 백틱을 눌러야 새 판을 열고 간다
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
    await page.keyboard.press('Backquote')
    await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
    // ⚠️ **↓를 세어서 고르지 않는다.** 목록이 뜬 직후에는 키가 몇 개 흘러서
    // 엉뚱한 줄에서 뛰어드는데, 그래도 화면은 멀쩡히 나오므로 다른 맵을 찍어
    // 놓고 맞다고 하기 십상이다. 실제로 그렇게 두 번 헛돌았다 — 줄을 직접
    // 누르고, 뛰어든 뒤에 **맵 번호를 확인한다**
    const row = page.getByText(cp.title, { exact: true }).first()
    await row.hover()
    await page.waitForTimeout(200)
    await row.click()
    await page.waitForURL('**/play', { timeout: 60_000 })
    await page.waitForFunction(async (want) => {
      const m = await import('/src/engine/map/world.ts')
      return m.world.mapId === want
    }, cp.map, { timeout: 60_000 })
    // 여기서부터는 무대가 있어야 한다
    await page.waitForSelector('canvas', { timeout: 120_000 })
    // ⚠️ **시각을 못 박을 수 있어야 한다.** 하늘도 조명도 실제 시계를 따라가서
    // (`worldState.time.gameHour`), 저녁에 찍은 그림과 낮에 찍은 그림은 지형이
    // 같아도 딴판이다 — 그러면 "어제 것보다 어두워졌다"가 고장인지 시각인지
    // 갈리지 않는다. 안 주면 지금 시각 그대로다
    const hour = flag('hour')
    if (hour !== undefined) {
      await page.evaluate(async (h) => {
        const w = await import('/src/state/worldState.ts')
        w.worldState.time.gameHour = h
      }, Number(hour))
    }
    await page.waitForTimeout(Number(flag('after', SETTLE_MS)))
    // 확인 지점이 세우는 자리 말고 **그 맵의 다른 칸**을 보고 싶을 때.
    // 컷신에만 나오는 사람들이 대개 확인 지점에서 멀리 서 있다
    const at2 = flag('at')
    if (at2) {
      const [x, z] = at2.split(',').map(Number)
      await page.evaluate(async ([tx, tz]) => {
        const w = await import('/src/state/worldState.ts')
        w.worldState.player.position.x = tx + 0.5
        w.worldState.player.position.z = tz + 0.5
        w.worldState.player.prevPosition.copy(w.worldState.player.position)
      }, [x, z])
      await page.waitForTimeout(Number(flag('atAfter', 6000)))
    }
    // 스크립트를 태우지 않고 메뉴 화면 하나를 바로 연다. 고르는 장면처럼
    // 이야기 도중에만 뜨는 화면을 보려면 이 길이 필요하다
    const menu = flag('menu')
    if (menu) {
      await page.evaluate(async (name) => {
        const m = await import('/src/state/menuStore.ts')
        m.useMenuStore.getState().open(name)
      }, menu)
      await page.waitForTimeout(Number(flag('menuAfter', 4000)))
    }
    for (const k of (flag('keys', '') || '').split(',').filter(Boolean)) {
      await page.keyboard.press(k.length === 1 ? `Key${k.toUpperCase()}` : k)
      await page.waitForTimeout(600)
    }

    // 찍기 직전에만 키운다. 세 프레임쯤 줘야 새 크기로 다시 그린다
    await page.setViewportSize(VIEWPORT)
    await page.waitForTimeout(Number(flag("grow", 3000)))
    const png = await page.screenshot()
    const stats = statsOf(png)
    const file = resolve(OUT, `${id}.png`)
    writeFileSync(file, png)
    const flat = stats.colors < 64 || stats.stdev < 3
    if (flat) bad++
    console.log(
      `${flat ? '⚠️' : '  '} ${id.padEnd(12)} 색 ${String(stats.colors ?? 0).padStart(5)}`
      + ` · 밝기 ${(stats.mean ?? 0).toFixed(1)} ±${(stats.stdev ?? 0).toFixed(1)}`
      + `   ${file.replace(ROOT, '.')}`)
    if (flat) console.log("     ⚠️ 거의 한 색이다 — 그린 것이 아닐 수 있다")
  }

  if (noise.length > 0) {
    console.log(`\n브라우저 오류 ${noise.length}건:`)
    for (const m of [...new Set(noise)].slice(0, 12)) console.log(`  ${m.slice(0, 200)}`)
  }
  await browser.close()
  vite?.child.kill()
  process.exit(bad > 0 ? 1 : 0)
}

await main()
