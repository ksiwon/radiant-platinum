// 화면을 열고 확인 지점으로 뛰어들어 **그림을 찍는다.**
//
//     pnpm shot forest                 확인 지점 하나
//     pnpm shot forest --keys=z,z,z    뛰어든 뒤 키를 더 누른다
//     pnpm shot forest --hit=200,300   그림의 그 픽셀에 무엇이 있는지 되묻는다
//     pnpm shot forest --crop=180,260,140,90,5   그 구석만 잘라 다섯 배로 키운다
//     pnpm shot twinleaf --eye=117,6,875 --gaze=117,2,884   건물 뒤로 돌아가 본다
//     pnpm shot wild --tree            배틀 무대 위에 실제로 무엇이 섰는지 늘어놓는다
//     pnpm shot hearthome --bike       자전거에 태워 놓고 찍는다
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
import { deflateSync, inflateSync } from 'node:zlib'
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

const CRC = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return (buf) => {
    let c = -1
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

/** 청크 하나. 길이 · 이름 · 내용 · CRC */
function chunk(name, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(name, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/**
 * 그림의 한 조각을 **정수배로 키워** 다시 PNG로 쓴다.
 *
 * ⚠️ 960×640 한 장만 보고는 구석의 판때기 하나가 무엇인지 못 읽는다. 실제로
 * 영원의 숲의 흰 판을 세 번 다른 데로 짚었고, 그때마다 광선은 엉뚱한 것을
 * 맞혔다 — 눈으로 좌표를 어림한 것이 틀렸던 것이다. 잘라서 키우면 짚을 자리가
 * 눈에 보인다. 늘리는 것은 **최근접**이다: 흐려 놓으면 텍셀 경계가 사라진다
 */
function cropPng(src, x0, y0, w, h, zoom) {
  const out = Buffer.alloc(h * zoom * (w * zoom * 4 + 1))
  let at = 0
  for (let y = 0; y < h * zoom; y++) {
    out[at++] = 0
    const sy = Math.min(src.h - 1, y0 + Math.floor(y / zoom))
    for (let x = 0; x < w * zoom; x++) {
      const sx = Math.min(src.w - 1, x0 + Math.floor(x / zoom))
      const o = (sy * src.w + sx) * src.bpp
      out[at++] = src.pixels[o]
      out[at++] = src.pixels[o + 1]
      out[at++] = src.pixels[o + 2]
      out[at++] = src.bpp === 4 ? src.pixels[o + 3] : 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w * zoom, 0)
  ihdr.writeUInt32BE(h * zoom, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(out)), chunk('IEND', Buffer.alloc(0)),
  ])
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
  // 경고도 줍는다 — three는 스켈레톤이 깨져도 `console.warn`으로만 말한다
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`${m.type()}: ${m.text()}`)
  })
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
    // **아무 데서나 아무 데나 보게 한다** — `--eye=x,y,z --gaze=x,y,z`.
    //
    // ⚠️ 3인칭 카메라는 원작처럼 **남쪽에 고정**이라, 무엇을 찍어도 건물의
    // 남쪽 면과 지붕만 나온다. 옆·뒷면이 어떻게 생겼는지를 화면으로 확인할
    // 길이 아예 없었다 — 1인칭으로 돌려 봐도 눈이 사람 키에 묶여 있어 나무
    // 속이나 벽 안에서 찍히기 일쑤였다.
    //
    // 그래서 **카메라 시스템을 루프에서 뺀다.** 값만 밀어 넣으면 다음 프레임에
    // 추적 카메라가 도로 끌고 간다 — 크리티컬 댐프드라 조용히, 몇 프레임에 걸쳐
    const eye = flag('eye')
    if (eye) {
      await page.evaluate(async ([e, g]) => {
        const loop = (await import('/src/engine/loop/GameLoop.ts')).gameLoop
        const cams = (await import('/src/engine/actor/camera.ts')).cameraSystem
        // `private`은 타입 검사에만 있다. 실행 중에는 그냥 배열이다
        const box = loop
        box.systems = box.systems.filter((s) => s !== cams)
        const w = await import('/src/state/worldState.ts')
        w.worldState.camera.position.set(e[0], e[1], e[2])
        w.worldState.camera.target.set(g[0], g[1], g[2])
      }, [eye.split(',').map(Number), (flag('gaze') ?? '0,0,0').split(',').map(Number)])
      await page.waitForTimeout(Number(flag('lookAfter', 1500)))
    }
    // 자전거에 태운다. 가방에서 꺼내 쓰는 길은 맵마다 탈 수 있느냐가 갈려서
    // 확인 지점을 고를 때마다 걸린다 — 여기서는 상태만 세운다
    if (args.includes('--bike')) {
      await page.evaluate(async () => {
        const w = await import('/src/state/worldState.ts')
        w.worldState.player.cycling = true
      })
      await page.waitForTimeout(600)
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

    // 무엇이 화면을 막고 있는지 씬에 직접 묻는다.
    //
    // 그림만 보고는 "저 판때기가 무엇이냐"를 못 가른다 — 소품인지 지형인지,
    // 흐려진 것인지 원래 저런 것인지. 카메라에서 가까운 순으로 상자와
    // 불투명도를 찍어 주면 그 자리에서 갈린다
    if (args.includes('--peek')) {
      const near = await page.evaluate(async () => {
        const THREE = await import('/node_modules/three/build/three.webgpu.js')
        const refs = await import('/src/scene/sceneRefs.ts')
        const w = await import('/src/state/worldState.ts')
        const world = (await import('/src/engine/map/world.ts')).world
        let root = refs.sceneRefs.player
        while (root?.parent) root = root.parent
        if (!root) return { err: '무대가 없다' }
        const eye = w.worldState.camera.position
        const box = new THREE.Box3()
        const rows = []
        root.traverse((o) => {
          // 인스턴스 메시(나무·풀)는 상자를 재는 값이 비싸고 궁금한 것도 아니다
          if (!o.isMesh || o.isInstancedMesh || !o.geometry) return
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
          if (!o.geometry.boundingBox) return
          box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)
          const s = box.getSize(new THREE.Vector3())
          const mid = box.getCenter(new THREE.Vector3())
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          rows.push({
            d: +box.distanceToPoint(eye).toFixed(2),
            at: [+mid.x.toFixed(1), +mid.y.toFixed(1), +mid.z.toFixed(1)],
            size: [+s.x.toFixed(1), +s.y.toFixed(1), +s.z.toFixed(1)],
            op: +(mats[0]?.opacity ?? 1).toFixed(2),
            vis: o.visible,
          })
        })
        // 인스턴스로 서는 것(나무·풀·꽃)은 상자가 아니라 **몇 개나 섰는지**가
        // 궁금하다. 0이면 그 계층이 통째로 안 도는 것이다
        const swarm = []
        root.traverse((o) => {
          if (o.isInstancedMesh) swarm.push(o.count)
        })
        rows.sort((a, b) => a.d - b.d)
        const p = w.worldState.player.position
        return {
          eye: [+eye.x.toFixed(1), +eye.y.toFixed(1), +eye.z.toFixed(1)],
          // ⚠️ **어느 맵의 어느 칸인지부터 찍는다.** 찍힌 그림이 내가 생각한
          // 자리인지를 눈으로 가릴 수가 없다 — 확인 지점이 다른 데 세워 놓아도
          // 화면은 멀쩡한 마을이라, 엉뚱한 자리를 두고 "고쳤다"고 하기 십상이다
          map: world.mapId,
          tile: [Math.floor(p.x), Math.floor(p.z)],
          meshes: rows.length, near: rows.slice(0, 12),
          swarm: swarm.filter((n) => n > 0).sort((a, b) => b - a),
        }
      })
      console.log(`  ${id} 맵 ${String(near.map)} 칸 ${String(near.tile)}`
        + ` · 카메라 ${String(near.eye)} · 메시 ${String(near.meshes)}`
        + ` · 인스턴스 ${(near.swarm ?? []).join('/')}`)
      for (const r of near.near ?? []) {
        console.log(`     ${String(r.d).padStart(6)}  ${String(r.at).padEnd(22)}`
          + ` 크기 ${String(r.size).padEnd(18)} 불투명 ${r.op}${r.vis ? '' : ' (안 그림)'}`)
      }
    }

    // 찍기 직전에만 키운다. 세 프레임쯤 줘야 새 크기로 다시 그린다
    await page.setViewportSize(VIEWPORT)
    await page.waitForTimeout(Number(flag("grow", 3000)))

    // 화면이 실제로 몇 삼각형인가 (`--perf`).
    //
    // ⚠️ **fps는 여기서 재면 안 된다.** 헤드리스는 WebGPU가 없어 WebGL2 +
    // SwiftShader(소프트웨어)로 떨어지므로 프레임 시간은 이 기계의 것이 아니다.
    // 삼각형과 드로우콜은 다르다 — 무엇을 GPU에 올렸느냐는 백엔드와 무관하게
    // 우리가 정한 값이라, 나무를 굵게 만들면 여기서 곧바로 보인다.
    //
    // 창 크기를 키운 **뒤에** 잰다. 절두체가 넓어지면 걸러지는 나무가 달라진다
    if (args.includes('--perf')) {
      const perf = await page.evaluate(async () => {
        const refs = await import('/src/scene/sceneRefs.ts')
        return { ...refs.perfSnapshot }
      })
      console.log(`  ${id} 삼각형 ${(perf.triangles / 1000).toFixed(1)}k`
        + ` · 드로우콜 ${String(perf.drawCalls)} · ${perf.backend}`
        + ` (fps ${String(perf.fps)} — 소프트웨어 렌더러라 뜻 없음)`)
    }

    // 그림 위의 **한 점**에 광선을 쏘아 거기 무엇이 있는지 되묻는다.
    //
    // `--peek`은 카메라 둘레의 메시를 늘어놓을 뿐이라, 화면 한구석에 뜬 흰
    // 판때기가 그중 무엇인지는 여전히 못 가른다. 실제로 그 판때기를 영원의 숲과
    // 천관산 두 군데에서 보고도 **무엇인지 몰라 손을 못 댔다.** 좌표를 대면
    // 재질 이름(=원작 그림 이름)까지 나온다.
    //
    // ⚠️ 좌표는 찍힌 그림(960×640) 기준이다. 그래서 **키운 뒤에** 잰다 —
    // 몰고 다니는 크기(320×214)에서 쏘면 종횡비가 달라 다른 데를 맞힌다
    const png = await page.screenshot()
    const hits = flag('hit')
    if (hits) {
      // ⚠️ **광선이 맞힌 것과 화면에 뜬 것은 다를 수 있다.** 광선은 알파 테스트를
      // 안 본다 — 그림이 통째로 잘려 안 그려진 판도 그대로 맞힌다. 그래서 그
      // 픽셀이 실제로 무슨 색인지 같이 찍는다. 둘이 어긋나면 그 자체가 답이다
      const shot = decodePng(png)
      for (const spot of hits.split(';')) {
        const [px, py] = spot.split(',').map(Number)
        const found = await page.evaluate(async ([sx, sy, w, h]) => {
          const THREE = await import('/node_modules/three/build/three.webgpu.js')
          const refs = await import('/src/scene/sceneRefs.ts')
          const ws = await import('/src/state/worldState.ts')
          const stage = await import('/src/scene/battle/stageRefs.ts')
          let root = refs.sceneRefs.player
          while (root?.parent) root = root.parent
          if (!root) return { err: '무대가 없다' }
          // ⚠️ **배틀 중에는 카메라가 다른 데 있다.** 오버월드 카메라로 쏘면
          // 배틀 화면을 찍어 놓고 신오 한복판의 지형을 되돌려 준다 — 실제로
          // 체육관 배틀 그림에 대고 쏘았더니 문과 길바닥이 나왔다
          const eye = stage.battleStage.active
            ? stage.battleStage : ws.worldState.camera
          const look = stage.battleStage.active
            ? stage.battleStage.target : ws.worldState.camera.target
          // 카메라를 씬에서 찾을 수 없으므로(R3F는 기본 카메라를 씬에 안 넣는다)
          // 자리·겨눈 곳·화각으로 직접 세운다. 화각은 `Stage.tsx`가 정한 55다
          const cam = new THREE.PerspectiveCamera(55, w / h, 0.1, 400)
          cam.position.copy(eye.position)
          cam.lookAt(look)
          cam.updateMatrixWorld()
          const ray = new THREE.Raycaster()
          ray.setFromCamera(
            new THREE.Vector2((sx / w) * 2 - 1, -((sy / h) * 2 - 1)), cam)
          const list = ray.intersectObject(root, true).slice(0, 4)
          return {
            rows: list.map((it) => {
              const mats = Array.isArray(it.object.material)
                ? it.object.material : [it.object.material]
              const mat = mats[it.face?.materialIndex ?? 0] ?? mats[0]
              return {
                d: +it.distance.toFixed(2),
                mesh: (it.object.name || it.object.type)
                  + (it.object.isInstancedMesh ? `[${String(it.instanceId ?? -1)}/${String(it.object.count)}]` : ''),
                mat: mat?.name || '(이름 없음)',
                map: mat?.map ? '그림' : '정점색',
                // 흰 판때기가 정말 흰지 눈이 아니라 값으로 본다
                rgb: mat?.color ? `#${mat.color.getHexString()}` : '-',
                op: +(mat?.opacity ?? 1).toFixed(2),
                // 그림이 반투명인데 불투명하게 그려지고 있는가. 그림의 알파
                // 최댓값과 재질의 알파 문턱을 나란히 놓으면 그 자리에서 갈린다
                aT: mat?.alphaTest ?? 0,
                tr: mat?.transparent === true,
                maxA: (() => {
                  const d = mat?.map?.image?.data
                  if (!d) return -1
                  let m = 0
                  for (let i = 3; i < d.length; i += 4) if (d[i] > m) m = d[i]
                  return m
                })(),
                at: [+it.point.x.toFixed(1), +it.point.y.toFixed(1), +it.point.z.toFixed(1)],
              }
            }),
          }
        }, [px, py, VIEWPORT.width, VIEWPORT.height])
        const o = (py * shot.w + px) * shot.bpp
        const pixel = `#${[0, 1, 2].map((k) => shot.pixels[o + k].toString(16).padStart(2, '0')).join('')}`
        console.log(`  ${id} (${String(px)},${String(py)}) 화면 ${pixel} ${found.err ?? ''}`)
        for (const r of found.rows ?? []) {
          console.log(`     ${String(r.d).padStart(6)}  ${r.mesh.padEnd(16)}`
            + ` ${r.mat.padEnd(18)} ${r.map} ${r.rgb} 불투명 ${String(r.op)}`
            + ` 문턱 ${String(r.aT)}${r.tr ? '·반투명' : ''} 알파최대 ${String(r.maxA)}`
            + ` @ ${String(r.at)}`)
        }
        if ((found.rows ?? []).length === 0) console.log('     맞은 것이 없다 — 하늘이다')
      }
    }

    // 배틀 무대 아래에 실제로 무엇이 서 있는지 늘어놓는다.
    //
    // ⚠️ **광선으로는 "없는 것"을 못 가린다.** 포켓몬 모델을 처음 세운 날
    // 화면에 아무것도 없었는데, 어디에 쏴도 무대만 맞으니 **안 붙은 것인지
    // 딴 데 선 것인지**를 알 수가 없었다. 이건 씬을 직접 훑는다
    if (args.includes('--tree')) {
      const rows = await page.evaluate(async () => {
        const THREE = await import('/node_modules/three/build/three.webgpu.js')
        const refs = await import('/src/scene/sceneRefs.ts')
        const stage = await import('/src/scene/battle/stageRefs.ts')
        let root = refs.sceneRefs.player
        while (root?.parent) root = root.parent
        if (!root) return []
        const origin = stage.battleStage.active ? stage.STAGE_ORIGIN : new THREE.Vector3()
        const out = []
        const at = new THREE.Vector3()
        const scale = new THREE.Vector3()
        root.traverse((o) => {
          if (!o.isMesh && !o.isSkinnedMesh) return
          o.getWorldPosition(at)
          if (at.distanceTo(origin) > 60) return
          o.getWorldScale(scale)
          const g = o.geometry
          const tris = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count ?? 0) / 3
          let vis = o.visible
          for (let p = o.parent; p && vis; p = p.parent) vis = p.visible
          // ⚠️ **실제로 어디에 그려지는가**를 정점 하나로 되묻는다. 스킨 메시는
          // 뼈가 정점을 옮기므로 노드 자리와 그려지는 자리가 다를 수 있다 —
          // `getVertexPosition`이 셰이더와 같은 셈을 CPU에서 한다
          const tip = new THREE.Vector3()
          try {
            o.getVertexPosition(0, tip)
            o.localToWorld(tip)
          } catch { tip.set(NaN, NaN, NaN) }
          // **자세를 먹인 뒤 얼마나 높은가.** 바인드 포즈의 상자로는 못 잰다 —
          // 대기 동작이 몸을 세우는 종(갸라도스)은 실제로 훨씬 위까지 올라간다.
          // `precise`가 `getVertexPosition`으로 뼈까지 셈에 넣는다
          let high = NaN
          try { high = new THREE.Box3().setFromObject(o, true).max.y - origin.y } catch { /* 못 잰다 */ }
          const sph = { center: tip.clone().sub(origin), radius: 0 }
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          out.push({
            name: o.name || o.type,
            skin: o.isSkinnedMesh === true,
            vis,
            tris: Math.round(tris),
            at: [+(at.x - origin.x).toFixed(2), +(at.y - origin.y).toFixed(2), +(at.z - origin.z).toFixed(2)],
            high: +high.toFixed(2),
            s: +scale.x.toFixed(2),
            cull: o.frustumCulled,
            ball: [+sph.center.x.toFixed(2), +sph.center.y.toFixed(2), +sph.center.z.toFixed(2)],
            mat: mats[0]?.name || mats[0]?.type || '?',
            op: +(mats[0]?.opacity ?? 1).toFixed(2),
            tr: mats[0]?.transparent === true,
            aT: mats[0]?.alphaTest ?? 0,
          })
        })
        return out
      })
      const cam = await page.evaluate(async () => {
        const stage = await import('/src/scene/battle/stageRefs.ts')
        const p = stage.battleStage.position, o = stage.STAGE_ORIGIN
        return [+(p.x - o.x).toFixed(2), +(p.y - o.y).toFixed(2), +(p.z - o.z).toFixed(2),
          +Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z).toFixed(2)]
      })
      console.log(`  ${id} 무대 위 메시 ${String(rows.length)}개 · 카메라 ${String(cam.slice(0, 3))} 거리 ${String(cam[3])}`)
      for (const r of rows.slice(0, 30)) {
        console.log(`     ${r.vis ? ' ' : '×'} ${r.name.slice(0, 24).padEnd(24)}`
          + ` ${r.skin ? '뼈' : '  '} 삼각형 ${String(r.tris).padStart(7)}`
          + ` 배율 ${String(r.s).padStart(5)} 꼭대기 ${String(r.high).padStart(5)} @ ${String(r.at)}`
          + ` 첫정점 ${String(r.ball).slice(0, 24)} ${r.mat.slice(0, 18)}`
          + ` 불투명 ${String(r.op)}${r.tr ? '·반투명' : ''} 문턱 ${String(r.aT)}`
          + `${r.cull ? '' : ' (컬링끔)'}`)
      }
    }

    // 구석을 잘라 키운다. `--crop=x,y,너비,높이[,배율]`
    const crop = flag('crop')
    if (crop) {
      const [cx, cy, cw, ch, zoom = 4] = crop.split(',').map(Number)
      const file = resolve(OUT, `${id}-crop.png`)
      writeFileSync(file, cropPng(decodePng(png), cx, cy, cw, ch, zoom))
      console.log(`  ${id} 자른 그림 ${String(cw)}×${String(ch)} ×${String(zoom)}`
        + `   ${file.replace(ROOT, '.')}`)
    }

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
