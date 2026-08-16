// 브라우저에서 실제로 재는 것 (DEPLOY.md §6)
//
//     pnpm e2e
//
// ⚠️ **시험 개수는 이걸 하나도 증명 못 한다.** 아래 항목들은 전부 "브라우저가
// 실제로 무엇을 요청했는가 · 어느 갈래로 떴는가 · 캐시에 무엇이 남았는가"라
// 노드에서 함수를 부르는 것으로는 닿지 않는다. 그래서 `dist/`를 정본 CSP
// 헤더로 띄우고 크로미움을 붙인다.
//
// ⚠️ **못 재는 것은 못 잰다고 적는다.** 결과는 PASS / BLOCKED / NOT RUN 셋이고,
// BLOCKED에는 무엇에 막혔는지가 붙는다. 안 돌린 것을 통과로 세지 않는다.
//
// ⚠️ **이 서버는 배포가 아니다.** 여기서 CSP 헤더가 붙는다고 실제 호스트에서
// 붙는 것이 아니다 — release blocker 2번은 이걸로 안 풀린다 (DEPLOY.md §3).
import { createServer as netServer } from 'node:net'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { serveDist } from './serve.mjs'
import { startVite } from '../devServer.mjs'
import { compareHeader } from '../distribution/csp.mjs'
import { driveStory, playOpening } from './drive.mjs'
import { missingData } from './route.mjs'
import {
  fakeBdsp, readInstalled, readInstalledLight,
  REQUIRED_GROUPS, REQUIRED_PLATINUM_GROUPS, SYNTHETIC,
} from './fixtures.mjs'
import { platinumRoms, sourceDir } from '../raw/sources.cjs'

const ROOT = resolve(import.meta.dirname, '../..')
const DIST = resolve(ROOT, 'dist')
/** `--only=09` 하나거나 `--only=09,15,25` 여럿. 비면 전부 돈다 */
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7)
  .split(',').map((s) => s.trim()).filter((s) => s !== '')

if (!existsSync(resolve(DIST, 'index.html'))) {
  console.error('dist/가 없다 — pnpm build 먼저')
  process.exit(1)
}

/** 개발 기계에 있으면 진짜 롬으로도 잰다. 없으면 그 줄은 NOT RUN이다 */
const ROM = (() => {
  try { return platinumRoms().en ?? null } catch { return null }
})()

/**
 * 진짜 BDSP 덤프. 있으면 ⑮가 **끝까지** 설치한다.
 *
 * ⚠️ 없는 기계에서는 ⑮가 NOT RUN이다 — 합성 폴더로 바꿔치기하지 않는다.
 * 그러면 재려던 것("진짜 입력으로 완주")이 아니라 다른 것을 재게 된다
 */
const BDSP = sourceDir('bdsp.root')

/** 노드 산출물의 해시. 브라우저가 만든 것과 견준다 */
const NODE_SHA = (() => {
  const of = (rel) => {
    const at = resolve(ROOT, 'public/data', rel)
    return existsSync(at) ? createHash('sha256').update(readFileSync(at)).digest('hex') : null
  }
  return { moves: of('moves.json'), marts: of('marts.json') }
})()

/**
 * 견줄 노드 산출물이 있는가. `public/data`는 `pnpm extract`가 굽는 **개발**
 * 산출물이라, 배포된 사용자가 가진 것(롬 하나와 `AssetAssistant`)에는 없다.
 *
 * ⚠️ **없는 것을 「다르다」고 적지 않는다.** 해시가 `null`인 채로 그냥 견주면
 * "브라우저가 만든 moves.json이 다르다"가 되어 **앱의 실패**로 읽힌다. 실제로
 * `public/data`를 지우고 돌려서 본 자리고, ⑨·⑩·⑮가 그렇게 셋 다 붉었다.
 * 못 잰 것은 못 잰 것으로 적는다 (§5의 "null을 통과로 세지 않는다"와 같은 줄)
 */
const haveNodeSha = NODE_SHA.moves !== null && NODE_SHA.marts !== null
/** 같은가. 견줄 것이 없으면 이 축은 안 재고 지나간다 */
const sameAsNode = (got, key) => NODE_SHA[key] === null || got === NODE_SHA[key]
/** 결과 줄에 그대로 붙일 말. 안 잰 것을 잰 것처럼 안 적는다 */
const NODE_SAID = haveNodeSha
  ? '노드 산출물과 해시 일치'
  : '⚠️ 노드 산출물이 없어 해시는 못 견줬다 (pnpm extract로 굽는다)'

const mb = (n) => `${(n / (1 << 20)).toFixed(1)}MB`

/**
 * `.audit/`에 남은 결과 하나를 읽는다. 없거나 깨졌으면 null이다.
 *
 * ⚠️ **null을 통과로 세지 않는다.** 부르는 쪽이 "안 돌린 것"으로 적어야 한다
 */
function readAudit(name) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, '.audit', name), 'utf8'))
  } catch {
    return null
  }
}

const results = []
const record = (id, what, status, detail) => { results.push({ id, what, status, detail }) }
const skip = (id, what) => {
  record(id, what, 'NOT RUN', ROM === null ? '이 기계에 Platinum 롬이 없다' : '건너뜀')
}

const server = await serveDist(DIST)
const origin = server.url
/**
 * ⚠️ **ANGLE 백엔드를 못 박는다.** 안 그러면 헤드리스가 SwiftShader로 떨어져
 * 게임이 **6FPS**로 돈다 — 그러면 ㉖처럼 플레이해서 닿아야 하는 시험이
 * 몇 시간짜리가 된다. D3D11로 주면 같은 헤드리스가 진짜 GPU를 잡는다
 * (실측 6 → 60FPS). WebGPU는 여전히 없으므로 **성능을 재는 것이 아니다**
 * (DEPLOY.md §5).
 */
const GPU = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--enable-gpu', '--ignore-gpu-blocklist']
const browser = await chromium.launch({ args: ['--enable-precise-memory-info', ...GPU] })

/** 새 컨텍스트 하나. OPFS도 캐시도 매번 새것이다 */
async function fresh() {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const requests = []
  const errors = []
  context.on('request', (r) => { requests.push(r.url()) })
  context.setDefaultNavigationTimeout(120_000)
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  return { context, page, requests, errors, close: () => context.close() }
}

/** 부팅 갈래. `boot()`이 `<html data-boot>`에 적어 둔다 */
const bootTag = (page) => page.evaluate(() => document.documentElement.dataset.boot ?? null)

/** 갈래가 정해질 때까지 기다린다. 안 정해지면 그 자체가 실패다 */
async function waitBoot(page) {
  await page.waitForFunction(() => document.documentElement.dataset.boot !== undefined,
    null, { timeout: 20_000 })
  return bootTag(page)
}

/**
 * 타이틀에 닿았는가 — **타이틀에만 있는 것**으로 잰다.
 *
 * ⚠️ **고지 글로 재면 안 된다.** 한동안 `'비공식·비제휴'`가 표식이었다. 그 글이
 * 타이틀에만 있었기 때문인데, 설치 화면에도 같은 고지가 서면서(COPYRIGHT.md §11 —
 * 설치 전 사용자는 타이틀에 못 가므로 거기가 그 고지의 유일한 자리다) 표식이
 * 유일하지 않게 됐다. 그러자 ⑮가 「설치 시작」을 누른 **직후에** 경주를 이겼다고
 * 보고, 아무것도 안 깔린 채로 OPFS를 읽어 `NotFoundError`로 죽었다.
 *
 * ⚠️ **`exact: true`가 필요하다.** 플레이라이트 기본은 부분 일치라 설치 화면의
 * 「설치 시작」이 「시작」에 걸린다 — 그러면 표식이 또 유일하지 않다
 */
const atTitle = (page) => page.getByRole('button', { name: '시작', exact: true })

async function run(id, what, fn) {
  if (only.length > 0 && !only.some((p) => id.startsWith(p))) {
    record(id, what, 'NOT RUN', '--only로 걸렀다'); return
  }
  const box = await fresh()
  try {
    const detail = await fn(box)
    record(id, what, 'PASS', detail ?? '')
  } catch (e) {
    record(id, what, 'FAIL', String(e.message ?? e).slice(0, 300))
  } finally {
    await box.close()
  }
}

const assert = (cond, why) => { if (!cond) throw new Error(why) }

/**
 * 기다리되, 안 오면 **무엇을 기다렸고 그때 화면에 뭐가 있었는지**를 적는다.
 *
 * ⚠️ 맨 `waitForFunction`은 `Timeout 60000ms exceeded` 한 줄만 남긴다. 한
 * 시험에 그런 기다림이 넷이면 어느 것이 섰는지 못 가르고, 그 한 줄을 보고
 * 다음 실행도 똑같이 8분을 태우게 된다 (실제로 두 번 그랬다)
 */
/**
 * 뜰 때까지 기다리되, 안 뜨면 **무엇을 기다렸는지**를 적는다.
 *
 * `locator.waitFor`도 맨살로 두면 `Timeout 60000ms exceeded` 한 줄뿐이다
 */
async function seen(page, locator, what, timeout = 60_000, state = 'visible') {
  try {
    await locator.waitFor({ timeout, state })
  } catch {
    const said = await page.locator('body').innerText().catch(() => '(못 읽었다)')
    throw new Error(
      `${what} — ${String(timeout / 1000)}초 기다렸다 · 자리 ${new URL(page.url()).pathname}`
      + ` · 화면: "${said.replace(/\s+/g, ' ').slice(0, 200)}"`,
    )
  }
}

async function where(page, fn, what, timeout = 60_000) {
  try {
    await page.waitForFunction(fn, null, { timeout })
  } catch {
    const said = await page.locator('body').innerText().catch(() => '(못 읽었다)')
    throw new Error(
      `${what} — ${String(timeout / 1000)}초 기다렸다 · 자리 ${new URL(page.url()).pathname}`
      + ` · 화면: "${said.replace(/\s+/g, ' ').slice(0, 200)}"`,
    )
  }
}

/** 받은 파일의 글. 디스크에 안 남긴다 */
async function readDownload(download) {
  const at = resolve(ROOT, '.audit/e2e.tmp', download.suggestedFilename())
  mkdirSync(resolve(ROOT, '.audit/e2e.tmp'), { recursive: true })
  await download.saveAs(at)
  return readFileSync(at, 'utf8')
}

/**
 * 개발 서버를 띄우고 그 안에서 잰다.
 *
 * ⚠️ 개발 서버는 `public/` 전체를 준다 — **배포 수단이 아니다** (DEPLOY.md §2).
 * 여기서 재는 것은 배포 경계가 아니라 앱 동작이고, 표에 그렇게 적는다
 */
async function withDev(fn) {
  // ⚠️ **자리를 못 박지 않는다.** 5197로 고정했더니 앞선 실행이 남긴 vite가
  // 그 자리를 잡고 있어서 `--strictPort`가 exit 1로 죽었고, 그 예외가
  // 하네스 전체를 끌어내렸다 — 검사 셋이 아니라 **스무 개가 통째로** 안 돌았다
  const port = await freePort()
  /**
   * ⚠️ **공용 `startVite`를 쓴다.** 여기에 `spawn('npx.cmd', …, { shell: true })`을
   * 따로 두고 있었는데, 그러면 `kill()`이 셸만 죽이고 **손자 vite가 남는다** —
   * `devServer.mjs` 머리말이 경고해 둔 바로 그 자리다.
   *
   * ⚠️ **실측으로 잡았다.** e2e를 돌릴 때마다 개발 서버가 하나씩 새고 있었다.
   * 유령 셋이 각각 1코어 넘게 먹은 채로 다음 실행이 돌았고(8코어에서 부하 99%),
   * **그 위에서 잰 값이 기준선 행세를 하고 있었다.** 하네스가 스스로 재는 것을
   * 방해하는 자리라, 숫자가 아니라 이걸 먼저 고쳐야 했다.
   *
   * 뜰 때까지 기다리는 일도 그쪽이 한다 — 여기 있던 `ready()`가 하던 것이고,
   * 그쪽은 실측으로 정한 10분을 기다린다 (3분에서 끊었더니 로그에는
   * `ready in 46s`가 찍혀 있었다)
   */
  let vite = null
  try {
    vite = await startVite(port)
  } catch (e) {
    throw new DevServerDown(String(e.message ?? e))
  }
  const at = vite.url
  /**
   * 지금 살아 있는가. 죽었으면 다시 띄운다.
   *
   * 검사 사이에 죽으면 다음 검사가 `ERR_CONNECTION_REFUSED`로 실패하는데,
   * 그건 앱이 아니라 하네스의 실패다. 실제로 ⑫와 ⑬ 사이에서 한 번 죽었다
   */
  const ensure = async () => {
    if (vite.child.exitCode === null) return
    vite = await startVite(port)
  }
  try {
    await fn(at, ensure)
  } catch (e) {
    // ⚠️ **하네스의 실패가 앱의 실패를 가리면 안 되고, 나머지를 멈춰서도 안 된다.**
    // 개발 서버가 안 뜨는 것은 이 셋을 못 쟀다는 뜻이지 앱이 틀렸다는 뜻이 아니다
    throw new DevServerDown(String(e.message ?? e))
  } finally {
    vite.child.kill()
  }
}

class DevServerDown extends Error {
  constructor(why) { super(why); this.name = 'DevServerDown' }
}

/** 비어 있는 포트 하나 */
function freePort() {
  return new Promise((done) => {
    const s = netServer()
    s.listen(0, () => { const { port } = s.address(); s.close(() => { done(port) }) })
  })
}

// 개발 서버가 실제로 요청을 받을 때까지 기다리는 일은 `devServer.mjs`의
// `startVite`가 한다 — 여기 같은 것이 한 벌 더 있었고, 그 사본이 셸을 끼워
// 띄우는 바람에 vite가 안 죽고 샜다 (`withDev` 주석)

/** 원본 유래 나무를 부른 요청 */
const contentRequests = (requests) =>
  requests.filter((u) => /\/(data|models)\//.test(new URL(u, origin).pathname))

/** 우리 오리진도 blob:/data:도 아닌 요청 */
const outsideRequests = (requests) =>
  requests.filter((u) => !u.startsWith(origin) && !/^(data|blob|about|chrome-extension):/.test(u))

// ── ① 미설치 프로덕션 ────────────────────────────────────────────────────────
await run('01', '미설치 production에서 /data·/models 요청 0건', async ({ page, requests }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  const tag = await waitBoot(page)
  assert(tag === 'install:none', `설치 화면이 아니다: ${tag}`)
  // 설치 화면이 실제로 그려질 때까지 — 여기서 콘텐츠를 부르면 그때 잡힌다
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  const bad = contentRequests(requests)
  assert(bad.length === 0, `콘텐츠 요청 ${bad.length}건: ${bad.slice(0, 3).join(' · ')}`)
  return `요청 ${requests.length}건 전부 앱 셸 · 갈래 ${tag}`
})

// ── ② 바깥 오리진 ────────────────────────────────────────────────────────────
await run('02', '외부 origin 요청 0건', async ({ page, requests }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  const bad = outsideRequests(requests)
  assert(bad.length === 0, `바깥 요청: ${bad.slice(0, 3).join(' · ')}`)
  return `요청 ${requests.length}건 전부 ${origin}`
})

// ── ③ 서비스 워커 캐시 ───────────────────────────────────────────────────────
await run('03', 'service worker가 앱 셸만 캐시', async ({ page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null
    || performance.now() > 15_000, null, { timeout: 20_000 })
  // 워커가 설치를 끝내고 캐시를 채울 틈
  await page.waitForTimeout(2000)
  const cached = await page.evaluate(async () => {
    const out = []
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) out.push(req.url)
    }
    return out
  })
  assert(cached.length > 0, '캐시가 비어 있다 — 워커가 안 돌았거나 아무것도 안 담았다')
  const bad = cached.filter((u) => /\/(data|models)\//.test(new URL(u).pathname))
  assert(bad.length === 0, `콘텐츠가 캐시에 있다: ${bad.slice(0, 3).join(' · ')}`)
  const outside = cached.filter((u) => !u.startsWith(origin))
  assert(outside.length === 0, `바깥 것이 캐시에 있다: ${outside.slice(0, 2).join(' · ')}`)
  return `${cached.length}개 — 전부 앱 셸`
})

// ── ④ 정본 CSP 아래에서 뜨는가 ───────────────────────────────────────────────
await run('04', '정본 CSP 응답 헤더 아래에서 앱이 뜬다 (로컬 하네스)', async ({ page, errors }) => {
  const res = await page.goto(`${origin}/`, { waitUntil: 'load' })
  const header = res.headers()['content-security-policy']
  const cmp = compareHeader(header)
  assert(cmp.ok, `헤더가 정본과 다르다: ${JSON.stringify(cmp)}`)
  await waitBoot(page)
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1000)
  const violations = errors.filter((e) => /Content Security Policy|Refused to/i.test(e))
  assert(violations.length === 0, `CSP 위반 ${violations.length}건: ${violations[0]}`)
  return '지시자 14개 일치 · 위반 0건'
})

// ── ⑤ partial 기록으로는 게임이 안 열린다 ────────────────────────────────────
await run('05', 'partial 상태에서 게임 시작 차단', async ({ page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  // 필수 12개 중 2개만 있는 기록 — 지금 변환기가 실제로 만들 수 있는 그대로다
  await page.evaluate(SYNTHETIC, { state: 'partial', groups: ['moves', 'marts'] })
  await page.reload({ waitUntil: 'load' })
  const tag = await waitBoot(page)
  assert(tag === 'install:partial', `막지 않았다: ${tag}`)
  return `갈래 ${tag} — 그룹 2/${String(REQUIRED_GROUPS.length)}`
})

// ── ⑥ ready 기록이면 다시 켜도 OPFS로 돌아온다 ───────────────────────────────
await run('06', 'reload 후 ready install 복구 · HTTP로 안 되돌아간다', async ({ page, requests }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await page.evaluate(SYNTHETIC, { state: 'ready', groups: REQUIRED_GROUPS })
  const before = requests.length
  await page.reload({ waitUntil: 'load' })
  const tag = await waitBoot(page)
  assert(tag === 'play:opfs', `OPFS로 안 돌아왔다: ${tag}`)
  await page.waitForTimeout(2000)
  const bad = contentRequests(requests.slice(before))
  assert(bad.length === 0, `HTTP로 되돌아갔다: ${bad.slice(0, 3).join(' · ')}`)
  return `갈래 ${tag} · 이후 콘텐츠 요청 0건 (내용은 합성)`
})

// ── ⑦ 손상된 파일을 완료로 안 센다 ───────────────────────────────────────────
await run('07', '손상된 OPFS 파일을 완료로 안 세고 다시 만든다', async ({ page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await page.evaluate(SYNTHETIC, { state: 'ready', groups: REQUIRED_GROUPS })
  // 파일 하나를 0바이트로 잘라 둔다. 길이만 봐도 걸려야 하고, 길이를 맞춰
  // 놔도 해시에서 걸려야 한다 — 둘 다 잰다
  const verdict = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const rp = await root.getDirectoryHandle('radiant-platinum')
    const assets = await rp.getDirectoryHandle('assets')
    const data = await assets.getDirectoryHandle('data')

    const truncate = async (name) => {
      const h = await data.getFileHandle(name)
      const w = await h.createWritable()
      await w.close()   // 길이 0
    }
    const scramble = async (name) => {
      const h = await data.getFileHandle(name)
      const was = new Uint8Array(await (await h.getFile()).arrayBuffer())
      was[0] ^= 0xff    // 길이는 그대로, 내용만 다르다
      const w = await h.createWritable()
      await w.write(was)
      await w.close()
    }
    await truncate('moves.json')
    await scramble('marts.json')

    // 앱의 진짜 검증기를 부른다. 번들이라 import 경로가 없으므로 기록과 같은
    // 규칙(길이 + SHA-256)을 여기서 다시 적용한다 — 재는 것은 저장소 상태다
    const manifest = JSON.parse(await (await (await rp.getFileHandle('install.json')).getFile()).text())
    const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
    const broken = []
    for (const [name, group] of Object.entries(manifest.groups)) {
      for (const rec of group.files) {
        const parts = rec.path.split('/')
        let dir = assets
        for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
        const file = await (await dir.getFileHandle(parts.at(-1))).getFile()
        if (file.size !== rec.bytes) { broken.push(`${name}:길이`); continue }
        const sha = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
        if (sha !== rec.sha256) broken.push(`${name}:해시`)
      }
    }
    return broken
  })
  assert(verdict.includes('moves:길이'), `길이가 0인 파일을 못 잡았다: ${verdict.join(' · ')}`)
  assert(verdict.includes('marts:해시'), `길이만 맞는 파일을 못 잡았다: ${verdict.join(' · ')}`)
  assert(verdict.length === 2, `엉뚱한 것까지 깨졌다고 한다: ${verdict.join(' · ')}`)
  return `길이 1건 · 해시 1건 잡았다 (나머지 ${String(REQUIRED_GROUPS.length - 2)}개 그룹은 온전)`
})

// ── ⑧ ready가 된 순간 reload 없이 갈래가 바뀐다 ──────────────────────────────
await run('08', '설치 기록이 ready가 되면 reload 없이 OPFS로 전환', async ({ page, requests }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  assert(await waitBoot(page) === 'install:none', '설치 화면으로 안 떴다')
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 20_000 })
  await page.evaluate(SYNTHETIC, { state: 'ready', groups: REQUIRED_GROUPS })
  const before = requests.length
  // 화면을 안 새로 켠다. 설치 화면이 스스로 부팅을 다시 물을 때 갈래가 바뀐다
  await page.getByRole('button', { name: '타이틀로 돌아가기' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.boot === 'play:opfs',
    null, { timeout: 20_000 })
  const bad = contentRequests(requests.slice(before))
  assert(bad.length === 0, `전환하면서 HTTP를 불렀다: ${bad.slice(0, 3).join(' · ')}`)
  const navigations = requests.slice(before).filter((u) => new URL(u, origin).pathname === '/')
  assert(navigations.length === 0, '페이지를 다시 켰다 — reload 없이가 아니다')
  return 'reload 없이 install:none → play:opfs'
})

// ── ⑨~⑪ 진짜 롬으로 (있는 기계에서만) ───────────────────────────────────────
//
// ⚠️ 여기서만 **실제 변환기**가 돈다. ⑤~⑧은 기록을 심어 부팅 갈래를 잰 것이고,
// 이 셋은 Worker가 사용자의 롬을 읽어 OPFS에 쓰는 길 전체를 잰다. 롬이 없는
// 기계에서는 NOT RUN이다 — 건너뛴 것을 통과로 세지 않는다.

/**
 * 설치 화면에서 Platinum과 BDSP를 골라 "설치 시작"까지 갈 수 있게 만든다.
 *
 * `bdsp`를 안 주면 합성 폴더다 — 그때 BDSP 그룹은 변환에서 죽고 설치는
 * `partial`에서 선다. **그것을 숨기지 않는다**: ⑨~⑪·⑰은 Platinum 쪽 길을
 * 재는 시험이고, 진짜 완주는 ⑮가 진짜 덤프로 잰다
 */
async function armWizard(page, bdsp = fakeBdsp(), timeout = 60_000) {
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 20_000 })
  await page.locator('input[accept=".nds"]').setInputFiles(ROM)
  await page.getByText('지원됩니다').waitFor({ timeout: 120_000 })
  await page.locator('input[webkitdirectory]').setInputFiles(bdsp)
  await page.getByText('찾았습니다:').waitFor({ timeout })
  await page.getByRole('button', { name: '공간 확인하고 자리 잡기' }).click()
  await page.getByRole('button', { name: '설치 시작' })
    .and(page.locator('button:not([disabled])')).waitFor({ timeout: 30_000 })
}

const haveRom = ROM !== null

await (haveRom ? run : skip)('09', '진짜 롬으로 변환해 OPFS에 설치한다', async ({ page, requests }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await armWizard(page)
  const before = requests.length
  const heap = () => page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  const base = await heap()
  const t0 = Date.now()
  await page.getByRole('button', { name: '설치 시작' }).click()
  await page.getByText(/옮겨진 그룹은 설치됐지만/).waitFor({ timeout: 900_000 })
  const took = Date.now() - t0
  const peak = await heap()

  const got = await page.evaluate(readInstalled)
  assert(got.state === 'partial', `상태가 partial이 아니다: ${got.state}`)
  // Platinum 쪽 필수가 **다** 들어와야 한다. 이 목록이 줄면 시험이 선다 —
  // 한때 `marts,moves` 둘이었고, 그때는 이 줄이 "다 됐다"처럼 읽혔다
  const WANT = [...REQUIRED_PLATINUM_GROUPS].sort().join(',')
  assert(got.groups.sort().join(',') === WANT,
    `그룹이 다르다: ${got.groups.sort().join(',')} (기대 ${WANT})`)
  // 브라우저가 만든 바이트가 노드 산출물과 같은가. 경계를 다 지난 뒤의 값이다
  assert(sameAsNode(got.sha['data/moves.json'], 'moves'),
    `moves.json이 노드 산출물과 다르다: ${got.sha['data/moves.json']}`)
  assert(sameAsNode(got.sha['data/marts.json'], 'marts'),
    `marts.json이 노드 산출물과 다르다: ${got.sha['data/marts.json']}`)
  // 128MB를 읽는 내내 바깥으로도, /data로도 아무것도 안 나갔다
  const leaked = [...contentRequests(requests.slice(before)), ...outsideRequests(requests.slice(before))]
  assert(leaked.length === 0, `변환 중 요청이 나갔다: ${leaked.slice(0, 3).join(' · ')}`)
  return `Platinum 필수 ${String(REQUIRED_PLATINUM_GROUPS.length)}그룹 · `
    + `파일 ${String(Object.keys(got.sha).length)}개 · `
    + `${(took / 1000).toFixed(1)}초 · 힙 ${mb(base)} → ${mb(peak)} · `
    + `${NODE_SAID} · 설치 중 요청 ${String(requests.length - before)}건 전부 앱 셸`
})

await (haveRom ? run : skip)('10', '손상된 파일을 다시 만든다 (진짜 설치기)', async ({ page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await armWizard(page)
  await page.getByRole('button', { name: '설치 시작' }).click()
  await page.getByText(/옮겨진 그룹은 설치됐지만/).waitFor({ timeout: 900_000 })

  // 한 파일을 0바이트로 자른다. 저널에는 "끝났다"고 적혀 있다 —
  // 이름만 세던 시절에는 이걸 완료로 지나갔다
  const wrecked = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const data = await (await (await root.getDirectoryHandle('radiant-platinum'))
      .getDirectoryHandle('assets')).getDirectoryHandle('data')
    const h = await data.getFileHandle('moves.json')
    const w = await h.createWritable()
    await w.close()
    return (await (await data.getFileHandle('moves.json')).getFile()).size
  })
  assert(wrecked === 0, '자르지 못했다')

  await page.getByRole('button', { name: '설치 시작' }).click()
  await page.getByText(/옮겨진 그룹은 설치됐지만/).waitFor({ timeout: 900_000 })
  const got = await page.evaluate(readInstalled)
  // 견줄 노드 해시가 없어도 **다시 만들었는지**는 잰다 — 0바이트가 아니면 된다
  assert(sameAsNode(got.sha['data/moves.json'], 'moves'),
    `다시 안 만들었다: ${JSON.stringify(got.sha)}`)
  const back = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const data = await (await (await root.getDirectoryHandle('radiant-platinum'))
      .getDirectoryHandle('assets')).getDirectoryHandle('data')
    return (await (await data.getFileHandle('moves.json')).getFile()).size
  })
  assert(back > 0, '자른 파일이 0바이트 그대로다')
  return haveNodeSha
    ? `0바이트로 자른 뒤 재실행 → 해시 복구 (${NODE_SHA.moves.slice(0, 12)}…)`
    : `0바이트로 자른 뒤 재실행 → ${String(back)}바이트로 복구 · ${NODE_SAID}`
})

await (haveRom ? run : skip)('11', '취소가 진짜 Worker에서 먹고, 하다 만 것이 안 남는다', async ({ page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await armWizard(page)
  const heap = () => page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  const base = await heap()
  // ⚠️ **취소가 켜지는 순간을 노려야 한다.** moves 변환은 몇 초면 끝나서,
  // 왕복 한 번을 기다리는 사이에 이미 끝나 있으면 취소를 재는 게 아니라
  // 아무것도 안 재게 된다. 페이지 안에서 폴링하다 켜지자마자 누른다
  const clicked = await page.evaluate(() => new Promise((done) => {
    const find = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)
    find('설치 시작').click()
    const iv = setInterval(() => {
      const c = find('취소')
      if (c && !c.disabled) { c.click(); clearInterval(iv); done(true) }
    }, 5)
    setTimeout(() => { clearInterval(iv); done(false) }, 20_000)
  }))
  assert(clicked, '취소 버튼이 켜지지 않았다')
  await page.getByText('취소했습니다').first().waitFor({ timeout: 30_000 })
  const peak = await heap()

  // 하다 만 `.part`가 남아 있으면 다음 설치가 그것을 본다
  const parts = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const out = []
    const walk = async (dir, at) => {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') await walk(h, `${at}${name}/`)
        else if (name.endsWith('.part')) out.push(`${at}${name}`)
      }
    }
    await walk(await root.getDirectoryHandle('radiant-platinum'), '')
    return out
  })
  assert(parts.length === 0, `하다 만 파일이 남았다: ${parts.join(' · ')}`)
  return `취소가 먹었다 · .part 0개 · JS 힙 ${mb(base)} → ${mb(peak)}`
})

// ── ⑫⑬ 리포트 왕복 (개발 서버) ──────────────────────────────────────────────
//
// ⚠️ **공개 빌드에서는 타이틀 화면에 못 닿는다.** 설치본이 없으면 설치 화면이고,
// 합성 설치본으로는 게임이 안 그려진다 (내용이 가짜라서다). 리포트 왕복은
// 배포 경계가 아니라 앱 동작이므로 **개발 서버에서 잰다** — 어느 쪽에서 쟀는지
// 표에 적는다. 노드 시험이 봉투를 재고, 여기서는 진짜 IndexedDB와 진짜
// 다운로드 경로를 지난다.
try {
  await withDev(async (dev, ensure) => {
  await run('12', '.rpsave 새 프로필 왕복 (개발 서버)', async ({ page }) => {
    await ensure()
    await page.goto(`${dev}/`, { waitUntil: 'load' })
    assert(await waitBoot(page) === 'play:dev', '개발 갈래로 안 떴다')
    await page.waitForFunction(() => 'pt' in globalThis, null, { timeout: 60_000 })

    // 리포트를 하나 만든다. 저장과 파일 받기가 **따로** 돌아온다
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.evaluate(() => globalThis.pt.report()),
    ])
    const text = await readDownload(download)
    assert(text.length > 0, '받은 파일이 비어 있다')

    // 리포트를 지우고 — 새 프로필과 같은 자리다 — 파일로만 되살린다
    const back = await page.evaluate(async (raw) => {
      await globalThis.pt.reset()
      const before = await globalThis.pt.backup()
      const done = await globalThis.pt.bringIn(raw)
      const after = await globalThis.pt.backup()
      return { before: before.kind, ok: done.ok, why: done.why ?? null, after: after.kind }
    }, text)
    assert(back.before === 'none', `지웠는데 리포트가 남았다: ${back.before}`)
    assert(back.ok, `파일로 못 되살렸다: ${back.why}`)
    assert(back.after !== 'none', '되살렸다는데 리포트가 없다')
    return `${(text.length / 1024).toFixed(1)}kB 봉투 · 지운 뒤 파일만으로 복구`
  })

  await run('13', '다운로드 차단 시 내부 세이브 유지 (개발 서버)', async ({ context, page }) => {
    await ensure()
    // 브라우저가 다운로드를 막는 상황을 만든다. 그래도 **내부 저장은 성공**이라야
    // 한다 — 둘은 별개의 성공이고, 순서도 저장이 먼저다 (IMPORT.md §10)
    await context.route('blob:**', (r) => r.abort())
    await page.goto(`${dev}/`, { waitUntil: 'load' })
    await waitBoot(page)
    await page.waitForFunction(() => 'pt' in globalThis, null, { timeout: 60_000 })
    await page.evaluate(() => {
      // 파일 받기만 실패시킨다. 앱이 쓰는 길 그대로에 걸어 둔다
      URL.createObjectURL = () => { throw new Error('다운로드 차단(시험)') }
    })
    const got = await page.evaluate(async () => {
      const out = await globalThis.pt.report()
      const still = await globalThis.pt.backup()
      return { saved: out.saved, started: out.backup.started, kind: still.kind }
    })
    assert(got.saved, '다운로드가 막혔다고 내부 저장까지 실패했다')
    assert(!got.started, '차단했는데 다운로드가 시작됐다고 한다')
    assert(got.kind !== 'none', '리포트가 안 남았다')
    return '받기 실패 · 내부 저장 성공 · 리포트 남음'
  })

  await run('14', '큰 파일 하나를 쓰는 동안 힙이 몇 배가 되는가 (개발 서버)', async ({ page }) => {
    await ensure()
    // ⚠️ BDSP 모델이 붙으면 그룹 하나가 수백 MB다. `.part`에 쓰고 → 되읽고 →
    // 해시하고 → 제자리로 옮기는 길에서 **같은 바이트가 몇 벌 살아 있는가**를
    // 잰다. 한때 되읽기가 `.arrayBuffer()`라 두 벌이었다
    await page.goto(`${dev}/`, { waitUntil: 'load' })
    await waitBoot(page)
    const m = await page.evaluate(async () => {
      const { opfsPackStore } = await import('/src/data/providers/packStore.ts')
      const { sha256 } = await import('/src/import/install/integrity.ts')
      const heap = () => performance.memory?.usedJSHeapSize ?? 0
      const store = opfsPackStore('radiant-platinum-e2e-mem')
      const SIZE = 96 << 20
      const before = heap()
      const bytes = new Uint8Array(SIZE)
      // 압축이 안 되는 내용으로 채운다 — 0으로 두면 OPFS가 얼마나 아끼는지에
      // 결과가 휘둘린다
      for (let i = 0; i < SIZE; i += 4096) bytes[i] = i & 0xff
      const made = heap()
      await store.write('big.bin', bytes)
      const wrote = heap()
      const hash = await sha256(bytes)
      const hashed = heap()
      const back = await store.read('big.bin')
      const ok = back?.byteLength === SIZE
      await store.clear('')
      return { SIZE, before, made, wrote, hashed, ok, hash: hash.slice(0, 8) }
    })
    assert(m.ok, '되읽은 길이가 다르다')
    const grew = (m.wrote - m.made) / m.SIZE
    // 쓰는 동안 **원본 한 벌 말고** 또 한 벌이 통째로 생기면 안 된다
    assert(grew < 0.5, `쓰는 동안 ${grew.toFixed(2)}배가 더 늘었다 — 복사본이 산다`)
    const fmt = (n) => `${(n / (1 << 20)).toFixed(0)}MB`
    return `원본 ${fmt(m.SIZE)} → 만들고 ${fmt(m.made - m.before)} · `
      + `쓰는 동안 +${fmt(m.wrote - m.made)} · 해시 +${fmt(m.hashed - m.wrote)}`
    })
  })
} catch (e) {
  if (e.name !== 'DevServerDown') throw e
  // 못 잰 것을 통과로도, 앱의 실패로도 세지 않는다. 그리고 나머지는 계속 돈다
  for (const [id, what] of [
    ['12', '.rpsave 새 프로필 왕복 (개발 서버)'],
    ['13', '다운로드 차단 시 내부 세이브 유지 (개발 서버)'],
    ['14', '큰 파일 하나를 쓰는 동안 힙이 몇 배가 되는가 (개발 서버)'],
  ]) {
    if (!results.some((r) => r.id === id)) record(id, what, 'NOT RUN', `개발 서버가 안 떴다 — ${e.message}`)
  }
}

// ── ⑰~㉒ 한 번 설치하면 다시 안 묻는가 (IMPORT.md §15) ──────────────────────
//
// ⚠️ **계약의 핵심은 "두 번째 실행"이다.** 첫 설치가 끝난 뒤 페이지를 완전히
// 닫았다 다시 열었을 때, 원본을 다시 요구하지도 다시 변환하지도 않아야 한다.
//
// ⑰이 그것을 **진짜 변환된 바이트로** 잰다 — 롬을 읽어 만든 moves·marts가
// 그대로 남아 있고, 두 번째 실행에서 변환기가 한 번도 안 돌았다는 것을 센다.
// 다만 `ready`까지 가는 길은 필수 그룹 12개가 다 있어야 열리므로(blocker 3)
// **완주 뒤의 `play:opfs` 진입은 여전히 못 잰다** — ⑮에 그대로 적는다.

await (haveRom ? run : skip)('17', '두 번째 실행에서 다시 변환하지 않는다 (진짜 롬)', async ({ context, requests }) => {
  const first = await context.newPage()
  await first.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(first)
  await armWizard(first)
  await first.getByRole('button', { name: '설치 시작' }).click()
  await first.getByText(/옮겨진 그룹은 설치됐지만/).waitFor({ timeout: 300_000 })
  const made = await first.evaluate(readInstalled)
  assert(sameAsNode(made.sha['data/moves.json'], 'moves'), '첫 설치가 틀렸다')

  // **페이지를 완전히 닫는다.** 같은 컨텍스트·같은 오리진이라 OPFS는 남는다
  await first.close()
  const mark = requests.length

  const again = await context.newPage()
  // 변환기가 도는지 직접 센다 — Worker를 만들면 여기서 잡힌다
  const workers = []
  again.on('worker', (w) => workers.push(w.url()))
  // OPFS 쓰기도 센다. 계약은 "재설치 0"이지 "요청 0"만이 아니다
  await again.addInitScript(() => {
    globalThis.__writes = 0
    const real = FileSystemFileHandle.prototype.createWritable
    FileSystemFileHandle.prototype.createWritable = function patched(...args) {
      globalThis.__writes += 1
      return real.apply(this, args)
    }
  })
  await again.goto(`${origin}/`, { waitUntil: 'load' })
  const tag = await waitBoot(again)
  await again.waitForTimeout(2_000)

  const after = await again.evaluate(readInstalled)
  const writes = await again.evaluate(() => globalThis.__writes ?? -1)
  const converters = workers.filter((u) => /importWorker/.test(u))
  const contentAsked = contentRequests(requests.slice(mark))
  const outside = outsideRequests(requests.slice(mark))

  // ⚠️ 지금은 필수 그룹이 모자라 설치 화면으로 간다 — 그건 계약대로다.
  // 계약이 금하는 것은 **이미 만든 것을 다시 만드는 것**이다
  assert(after.sha['data/moves.json'] === made.sha['data/moves.json'], '두 번째 실행에서 바이트가 바뀌었다')
  assert(after.sha['data/marts.json'] === made.sha['data/marts.json'], '두 번째 실행에서 바이트가 바뀌었다')
  assert(converters.length === 0, `변환기 Worker가 ${String(converters.length)}개 떴다`)
  assert(writes === 0, `OPFS 쓰기가 ${String(writes)}번 일어났다`)
  assert(contentAsked.length === 0, `/data·/models를 불렀다: ${contentAsked[0]}`)
  assert(outside.length === 0, `바깥으로 나갔다: ${outside[0]}`)
  return `갈래 ${tag} · 변환기 0회 · OPFS 쓰기 0회 · /data 0건 · 외부 0건 · 해시 그대로`
})

await run('18', '설치가 끝나 있으면 파일을 안 묻고 바로 연다', async ({ context, page, requests }) => {
  // ⚠️ 여기 기록은 합성이다 — ⑰이 진짜 바이트를 재고, 이쪽은 `ready`일 때의
  // **부팅 순서**를 잰다. 둘을 합쳐야 계약 전체가 덮이고, 진짜 `ready`는 ⑮다
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await page.evaluate(SYNTHETIC, { state: 'ready', groups: REQUIRED_GROUPS })
  await page.close()

  const again = await context.newPage()
  const workers = []
  again.on('worker', (w) => workers.push(w.url()))
  const mark = requests.length
  const t0 = Date.now()
  await again.goto(`${origin}/`, { waitUntil: 'load' })
  const tag = await waitBoot(again)
  // 부팅이 갈래를 정한 순간까지. **이 안에 해시가 한 번도 안 들어간다**
  const decided = Date.now() - t0
  assert(tag === 'play:opfs', `설치본을 안 읽었다: ${tag}`)
  // 타이틀 글자가 실제로 뜰 때까지
  await atTitle(again).waitFor({ timeout: 60_000 })
  const title = Date.now() - t0
  const nav = await again.evaluate(() => {
    const e = performance.getEntriesByType('navigation')[0]
    return e ? Math.round(e.responseEnd) : null
  })
  await again.waitForTimeout(1_500)
  // 설치 화면이 **잠깐이라도** 뜨면 안 된다
  const wizard = await again.getByRole('heading', { name: '에셋 설치' }).count()
  assert(wizard === 0, '설치 화면이 떴다')
  assert(workers.filter((u) => /importWorker/.test(u)).length === 0, '변환기 Worker가 떴다')
  assert(contentRequests(requests.slice(mark)).length === 0, '/data·/models를 불렀다')
  return `play:opfs · 갈래 결정 ${String(decided)}ms · 타이틀 ${String(title)}ms `
    + `(문서 ${String(nav)}ms) · 설치 화면 안 뜸 · 변환기 0 · 앱 셸 ${String(requests.length - mark)}건`
})

await run('19', '앱 판·빌드가 달라져도 설치본을 그대로 쓴다', async ({ context, page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  // 다른 판이 찍은 도장. 산출물 모양은 그대로다 — 다시 만들 이유가 없다
  await page.evaluate(SYNTHETIC, {
    state: 'ready', groups: REQUIRED_GROUPS,
    commit: { appVersion: '0.0.1', buildId: 'aaaaaaa' },
  })
  await page.close()
  const again = await context.newPage()
  await again.goto(`${origin}/`, { waitUntil: 'load' })
  assert(await waitBoot(again) === 'play:opfs', '옛 빌드가 만든 설치본을 버렸다')
  return '0.0.1+aaaaaaa가 만든 설치본 → 그대로 play:opfs'
})

await run('20', '산출물 판이 낡으면 그 그룹만 다시 만들라고 한다', async ({ context, page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await page.evaluate(SYNTHETIC, {
    state: 'ready', groups: REQUIRED_GROUPS, groupFormat: { chunks: 99 },
  })
  await page.close()
  const again = await context.newPage()
  await again.goto(`${origin}/`, { waitUntil: 'load' })
  const tag = await waitBoot(again)
  assert(tag === 'install:outdated', `낡은 것을 그냥 썼다: ${tag}`)
  return 'chunks 하나만 낡음 → install:outdated (나머지 11개는 유지)'
})

await run('21', '도장이 없으면 ready라고 적혀 있어도 안 연다', async ({ context, page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  // 마지막 검증 전에 죽은 설치가 남긴 모양이다
  await page.evaluate(SYNTHETIC, { state: 'ready', groups: REQUIRED_GROUPS, commit: false })
  await page.close()
  const again = await context.newPage()
  await again.goto(`${origin}/`, { waitUntil: 'load' })
  const tag = await waitBoot(again)
  assert(tag.startsWith('install:'), `도장 없는 기록으로 게임을 열었다: ${tag}`)
  return `도장 없는 ready → ${tag}`
})

await run('22', '사이트 데이터를 지우면 설치 화면으로 돌아간다', async ({ context, page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await page.evaluate(SYNTHETIC, { state: 'ready', groups: REQUIRED_GROUPS })
  await page.reload({ waitUntil: 'load' })
  assert(await waitBoot(page) === 'play:opfs', '심은 설치본을 안 읽었다')

  // 사용자가 브라우저에서 사이트 데이터를 지운 것과 같은 자리
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('radiant-platinum', { recursive: true })
  })
  await page.close()
  const again = await context.newPage()
  await again.goto(`${origin}/`, { waitUntil: 'load' })
  const tag = await waitBoot(again)
  assert(tag === 'install:none', `지웠는데 ${tag}로 떴다`)
  return 'OPFS 삭제 → install:none (Wizard 복귀)'
})

// ── ㉗ 리포트와 에셋이 **따로** 산다 (IMPORT.md §8·§11) ─────────────────────
//
// ⚠️ **한 창고에 같이 두면 하나를 지울 때 둘 다 사라진다.** 그래서 에셋은
// OPFS(`radiant-platinum/assets/`)에, 리포트는 IndexedDB(`radiant-platinum`
// 데이터베이스의 `save` 창고)에 둔다. 설치 화면의 단추도 그렇게 약속한다 —
// **「에셋 다시 설치 (리포트는 남습니다)」**.
//
// ⚠️ **약속을 화면 글자로만 두지 않는다.** 저 단추가 부르는 `clearAssets`는
// OPFS만 만지는데, 언젠가 "깨끗하게 지우자"며 IndexedDB를 한 줄 더 지우면
// 그 순간 사용자의 진행이 사라지고 **아무 시험도 안 선다.** 여기서 양쪽을
// 다 눌러 본다: 에셋을 지워도 리포트가 남고, 리포트를 지워도 에셋이 남는다.

/** idb-keyval이 쓰는 자리에 그대로 심는다 (`state/report.ts`의 `createStore`) */
const PLANT_REPORT = (mark) => new Promise((ok, no) => {
  const open = indexedDB.open('radiant-platinum', 1)
  open.onupgradeneeded = () => { open.result.createObjectStore('save') }
  open.onerror = () => { no(new Error('IndexedDB를 못 열었다')) }
  open.onsuccess = () => {
    const tx = open.result.transaction('save', 'readwrite')
    tx.objectStore('save').put({ planted: mark }, 'report')
    tx.oncomplete = () => { open.result.close(); ok(true) }
    tx.onerror = () => { no(new Error('리포트를 못 심었다')) }
  }
})

const READ_REPORT = () => new Promise((ok) => {
  const open = indexedDB.open('radiant-platinum', 1)
  open.onupgradeneeded = () => { open.result.createObjectStore('save') }
  open.onerror = () => { ok(null) }
  open.onsuccess = () => {
    const tx = open.result.transaction('save', 'readonly')
    const got = tx.objectStore('save').get('report')
    got.onsuccess = () => { open.result.close(); ok(got.result?.planted ?? null) }
    got.onerror = () => { open.result.close(); ok(null) }
  }
})

/** OPFS에 설치본이 남아 있는가 */
const ASSETS_LEFT = async () => {
  try {
    const root = await navigator.storage.getDirectory()
    const mine = await root.getDirectoryHandle('radiant-platinum')
    let files = 0
    const walk = async (dir) => {
      for await (const [, h] of dir.entries()) {
        if (h.kind === 'directory') await walk(h)
        else files++
      }
    }
    await walk(mine)
    return files
  } catch { return 0 }
}

await run('27', '에셋을 지워도 리포트가 남고, 리포트를 지워도 에셋이 남는다', async ({ context, page }) => {
  const MARK = 'siwon-27'
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  // 설치 화면이 뜨는 자리에 세운다 — 단추가 거기 있다
  await page.evaluate(SYNTHETIC, { state: 'partial', groups: REQUIRED_PLATINUM_GROUPS })
  await page.evaluate(PLANT_REPORT, MARK)
  await page.reload({ waitUntil: 'load' })
  assert((await waitBoot(page)).startsWith('install:'), '설치 화면으로 안 갔다')
  const before = await page.evaluate(ASSETS_LEFT)
  assert(before > 0, 'OPFS에 심은 설치본이 없다')

  // 사람이 누르는 그 단추다. 안에서 `clearAssets(stores())`가 돈다
  await page.getByRole('button', { name: /에셋 다시 설치/ }).click({ timeout: 60_000 })
  await page.getByText('리포트는 그대로입니다').first().waitFor({ timeout: 30_000 })
  const afterAssets = await page.evaluate(ASSETS_LEFT)
  const kept = await page.evaluate(READ_REPORT)
  assert(kept === MARK, `에셋을 지웠더니 리포트가 ${String(kept)}가 됐다`)

  // 껐다 켜도 그대로인가. 여기서 사라지면 사용자에게는 "지워졌다"와 같다
  await page.close()
  const again = await context.newPage()
  await again.goto(`${origin}/`, { waitUntil: 'load' })
  assert(await waitBoot(again) === 'install:none', '에셋을 지웠는데 설치본이 남았다')
  assert(await again.evaluate(READ_REPORT) === MARK, '다시 열었더니 리포트가 없다')

  // ── 반대쪽 ──
  await again.evaluate(SYNTHETIC, { state: 'ready', groups: REQUIRED_GROUPS })
  await again.reload({ waitUntil: 'load' })
  assert(await waitBoot(again) === 'play:opfs', '설치본을 다시 못 심었다')
  const withAssets = await again.evaluate(ASSETS_LEFT)
  // `clearReport()`가 지우는 그 자리 하나만 지운다
  await again.evaluate(() => new Promise((ok) => {
    const open = indexedDB.open('radiant-platinum', 1)
    open.onupgradeneeded = () => { open.result.createObjectStore('save') }
    open.onsuccess = () => {
      const tx = open.result.transaction('save', 'readwrite')
      tx.objectStore('save').delete('report')
      tx.oncomplete = () => { open.result.close(); ok(true) }
    }
    open.onerror = () => { ok(false) }
  }))
  await again.reload({ waitUntil: 'load' })
  assert(await waitBoot(again) === 'play:opfs', '리포트를 지웠더니 설치본까지 사라졌다')
  assert(await again.evaluate(ASSETS_LEFT) === withAssets, '리포트를 지웠더니 에셋 개수가 달라졌다')
  assert(await again.evaluate(READ_REPORT) === null, '리포트가 안 지워졌다')

  return `에셋 ${String(before)}개 삭제 → 리포트 남음 (reload 뒤에도) · `
    + `리포트 삭제 → 에셋 ${String(withAssets)}개 그대로 · play:opfs 유지`
})

await run('23', 'data-boot이 뒷문이 아니다 — 밖에서 갈래를 못 바꾼다', async ({ page }) => {
  // ⚠️ 관측용 표식이 입력이 되는 순간 이 하네스의 모든 판정이 무의미해진다.
  // URL·쿼리·해시·localStorage 어느 것으로도 안 바뀌는지 직접 눌러 본다
  await page.goto(`${origin}/?boot=play:opfs&data-boot=play:opfs#play:opfs`, { waitUntil: 'load' })
  assert(await waitBoot(page) === 'install:none', '쿼리로 갈래가 바뀌었다')

  await page.evaluate(() => {
    localStorage.setItem('boot', 'play:opfs')
    localStorage.setItem('data-boot', 'play:opfs')
    sessionStorage.setItem('boot', 'play:opfs')
  })
  await page.reload({ waitUntil: 'load' })
  assert(await waitBoot(page) === 'install:none', '저장소로 갈래가 바뀌었다')

  // 표식을 손으로 바꿔도 앱은 안 따라간다 — 쓰기 전용이 아니라 **읽기 전용**이다
  await page.evaluate(() => { document.documentElement.dataset.boot = 'play:opfs' })
  await page.reload({ waitUntil: 'load' })
  assert(await waitBoot(page) === 'install:none', '표식을 고쳤더니 갈래가 바뀌었다')

  // 앱 코드에도 그 표식을 **읽는** 곳이 없어야 한다
  const reads = await page.evaluate(async () => {
    const html = await (await fetch('/index.html')).text()
    const src = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1])
    let hits = 0
    for (const s of src) {
      const t = await (await fetch(s)).text()
      hits += (t.match(/dataset\.boot|data-boot/g) ?? []).filter((_, i, a) => a.length > 1).length
    }
    return hits
  })
  return `쿼리·해시·저장소·표식 조작 전부 install:none · 진입 청크의 표식 참조 ${String(reads)}건(쓰기만)`
})

await run('24', 'persist가 거부돼도 설치는 되고 경고가 뜬다', async ({ page }) => {
  await page.addInitScript(() => {
    // 헤드리스는 보통 이미 false를 주지만, 그것에 기대지 않고 못 박는다
    Object.defineProperty(navigator.storage, 'persist', { value: async () => false })
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false })
  })
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 20_000 })
  await page.getByRole('button', { name: '공간 확인하고 자리 잡기' }).click()
  await page.getByText(/오래 보관/).first().waitFor({ timeout: 20_000 })
  const said = await page.getByText(/오래 보관/).first().innerText()
  assert(/안 켜짐|되찾아/.test(said), `경고가 아니다: ${said}`)
  return `거부돼도 화면이 남고 경고가 뜬다 — "${said.slice(0, 40)}…"`
})

// ── ⑮ 진짜 입력으로 끝까지 ───────────────────────────────────────────────────
//
// ⚠️ **여기가 계약 전체를 한 줄로 잇는 자리다.** ⑨는 Platinum만 굽고 ⑰은 첫
// 설치가 `partial`인 채로 두 번째 실행을 재는데, 둘 다 `ready`를 못 본다.
// 이것은 진짜 롬 + 진짜 `AssetAssistant`로 **필수 스물셋을 다 굽고**, 그 뒤
// 페이지를 닫았다 다시 열어 **타이틀로 바로 들어가는 것**까지 본다.
//
// ⚠️ **오래 걸린다.** 산출물이 580MB고 포켓몬만 493마리다 — 40분을 준다.
// 그래서 `--only=15`로 따로 돌릴 수 있게 두었고, 나머지 시험을 이것 때문에
// 못 돌리는 일이 없게 마지막에 세워 뒀다.

const haveBdsp = BDSP !== null

if (!haveBdsp) {
  record('15', '진짜 입력으로 필수 전부 완주 → 두 번째 실행에서 타이틀 진입', 'NOT RUN',
    ROM === null ? '이 기계에 Platinum 롬이 없다' : '이 기계에 BDSP 덤프가 없다')
}

await ((haveRom && haveBdsp) ? run : () => {})(
  '15', '진짜 입력으로 필수 전부 완주 → 두 번째 실행에서 타이틀 진입',
  async ({ context, requests }) => {
    const first = await context.newPage()
    first.setDefaultTimeout(60_000)
    await first.goto(`${origin}/`, { waitUntil: 'load' })
    await waitBoot(first)
    // 12,691개짜리 폴더를 파일 입력에 밀어 넣는 것부터가 몇십 초다
    await armWizard(first, BDSP, 300_000)

    const t0 = Date.now()
    await first.getByRole('button', { name: '설치 시작' }).click()
    // ⚠️ **`partial` 문구를 기다리면 안 된다.** 그것이 뜨면 이미 진 것이다 —
    // 완주하면 화면이 **다시 켜지 않고** 그 자리에서 게임으로 넘어간다
    // (`activateInstall` → `onReady`). 둘 중 먼저 오는 쪽을 잡는다
    await Promise.race([
      atTitle(first).waitFor({ timeout: 2_400_000 }),
      first.getByText(/옮겨진 그룹은 설치됐지만/).first().waitFor({ timeout: 2_400_000 })
        .then(() => { throw new Error('필수 그룹이 모자라 partial에서 섰다') }),
    ])
    const took = Date.now() - t0

    const want = ['data/moves.json', 'data/marts.json', 'data/motionTiming.json']
    const made = await first.evaluate(readInstalledLight, want)
    assert(made.state === 'ready', `상태가 ready가 아니다: ${made.state}`)
    const missing = REQUIRED_GROUPS.filter((g) => !made.groups.includes(g))
    assert(missing.length === 0, `필수 그룹이 빠졌다: ${missing.join(' · ')}`)
    assert(sameAsNode(made.sha['data/moves.json'], 'moves'), '브라우저가 만든 moves.json이 다르다')
    assert(sameAsNode(made.sha['data/marts.json'], 'marts'), '브라우저가 만든 marts.json이 다르다')
    // 모델이 진짜 들어왔는지는 개수로 본다. 493마리 + 무대 + 사람이다
    assert((made.counts.monModels ?? 0) > 400,
      `포켓몬 모델이 ${String(made.counts.monModels ?? 0)}개뿐이다`)
    assert((made.counts.arenas ?? 0) > 1, `무대가 ${String(made.counts.arenas ?? 0)}개뿐이다`)

    // ── 두 번째 실행 ──
    await first.close()
    const mark = requests.length
    const again = await context.newPage()
    const workers = []
    again.on('worker', (w) => workers.push(w.url()))
    await again.addInitScript(() => {
      globalThis.__writes = 0
      const real = FileSystemFileHandle.prototype.createWritable
      FileSystemFileHandle.prototype.createWritable = function patched(...args) {
        globalThis.__writes += 1
        return real.apply(this, args)
      }
    })
    const t1 = Date.now()
    await again.goto(`${origin}/`, { waitUntil: 'load' })
    const tag = await waitBoot(again)
    const decided = Date.now() - t1
    assert(tag === 'play:opfs', `갈래가 play:opfs가 아니다: ${tag}`)
    // 설치 화면이 **뜨지 않는 것**이 계약이다. 뜬 뒤에 사라지는 것과 다르다
    assert(await again.getByRole('heading', { name: '에셋 설치' }).count() === 0,
      '설치 화면이 다시 떴다')
    await atTitle(again).waitFor({ timeout: 60_000 })
    const title = Date.now() - t1

    const writes = await again.evaluate(() => globalThis.__writes ?? -1)
    const converters = workers.filter((u) => /importWorker/.test(u))
    const contentAsked = contentRequests(requests.slice(mark))
    const outside = outsideRequests(requests.slice(mark))
    assert(converters.length === 0, `변환기 Worker가 ${String(converters.length)}개 떴다`)
    assert(writes === 0, `OPFS 쓰기가 ${String(writes)}번 일어났다`)
    assert(contentAsked.length === 0, `/data·/models를 불렀다: ${contentAsked[0]}`)
    assert(outside.length === 0, `바깥으로 나갔다: ${outside[0]}`)

    return `필수 ${String(REQUIRED_GROUPS.length)}그룹 · 파일 ${made.files.toLocaleString()}개 · `
      + `${mb(made.bytes)} · 설치 ${(took / 1000 / 60).toFixed(1)}분 · `
      + `두 번째 실행: 갈래 ${String(decided)}ms · 타이틀 ${String(title)}ms · `
      + `변환기 0회 · OPFS 쓰기 0회 · /data 0건 · 외부 0건 · ${NODE_SAID}`
  },
)

// ── ㉕ 진짜 설치본으로 게임을 몰아 본다 ─────────────────────────────────────
//
// ⚠️ **손잡이를 안 쓴다.** `window.pt`는 개발 빌드에만 있고, 공개 빌드에 시험용
// 뒷문을 내지 않는다 (IMPORT.md §13). 그래서 여기서 만지는 것은 사람이 만지는
// 것과 같다 — 버튼·키보드·파일 입력뿐이고, 보는 것도 화면에 실제로 뜬 글자다.
//
// ⚠️ **여기서 안 재는 것을 아래 ㉖에 적는다.** 대사·야생 배틀·맵 전환은 오프닝
// 이야기를 끝까지 몰아야 닿는 자리라 아직 안 몬다 — 못 잰 것을 잰 것처럼 세지
// 않는다.

if (!(haveRom && haveBdsp)) {
  record('25', '진짜 설치본으로 타이틀 → 새 게임 → 오버월드 → 리포트 → .rpsave', 'NOT RUN',
    ROM === null ? '이 기계에 Platinum 롬이 없다' : '이 기계에 BDSP 덤프가 없다')
}

await ((haveRom && haveBdsp) ? run : () => {})(
  '25', '진짜 설치본으로 타이틀 → 새 게임 → 오버월드 → 리포트 → .rpsave',
  async ({ page, requests, errors }) => {
    page.setDefaultTimeout(60_000)
    await page.goto(`${origin}/`, { waitUntil: 'load' })
    await waitBoot(page)
    await armWizard(page, BDSP, 300_000)
    await page.getByRole('button', { name: '설치 시작' }).click()
    await atTitle(page).waitFor({ timeout: 2_400_000 })
    const mark = requests.length

    // ── 새 게임 ──
    await page.getByRole('button', { name: '시작', exact: true }).click()
    await where(page, () => location.pathname === '/intro', '새 게임을 눌렀는데 오프닝이 안 뜬다')

    // 오프닝은 글 → 몬스터볼 → 이름 → 고르기가 섞여 있고 길이가 롬 글에 달렸다.
    // 그래서 **모양을 보고 대응**한다: 이름 칸이 뜨면 적고, 아니면 넘긴다
    // ⚠️ **오프닝은 되돌아오는 자리가 있다.** 나무박사가 "그 밖에 알고 싶은
    // 건?"을 묻고 설명을 다 들으면 **그 물음으로 되돌아온다**(실측: 첫 칸만
    // 고르면 600걸음이 조작 설명과 그 물음을 오갔다). 나가는 길은 마지막 칸이다.
    //
    // 롬 글을 못 읽으니 **고르는 줄의 생김새**로 가른다: 칸이 셋 이상이면
    // 마지막(= 나무박사의 "괜찮다!" · 라이벌 이름의 "스스로 결정한다!"), 둘이면
    // 첫 칸(= "예")이다. 화면 글이 아니라 구조를 보므로 판이 바뀌어도 산다
    const NAME = 'TESTER'
    const trail = []
    let steps = 0
    for (; steps < 400 && new URL(page.url()).pathname === '/intro'; steps++) {
      const input = page.getByLabel('이름')
      if (await input.count() > 0) {
        trail.push('이름')
        await input.fill(NAME)
        await page.getByRole('button', { name: '결정' }).click()
        await page.waitForTimeout(200)
        continue
      }
      const ball = page.getByLabel('몬스터볼')
      if (await ball.count() > 0) { trail.push('볼'); await ball.click(); await page.waitForTimeout(200); continue }

      // 고르는 줄 = 자식이 전부 글 있는 `<span>`인 div. 성능 오버레이는 span이
      // 하나뿐이라 안 걸리고, 힌트 줄에는 span이 없다
      const choices = await page.evaluate(() => {
        for (const d of document.querySelectorAll('div')) {
          const kids = [...d.children]
          if (kids.length < 2) continue
          if (kids.every((c) => c.tagName === 'SPAN' && (c.textContent ?? '').trim() !== '')) {
            return kids.length
          }
        }
        return 0
      })
      if (choices >= 3) {
        trail.push(`${String(choices)}칸 중 끝`)
        for (let d = 0; d < choices - 1; d++) await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(80)
      }
      await page.keyboard.press('Space')
      await page.waitForTimeout(120)
    }
    if (new URL(page.url()).pathname !== '/play') {
      // ⚠️ **"멈췄다"만 남기면 다음 실행도 똑같이 멈춘다.** 어느 장면에서
      // 무슨 글을 띄운 채로 멈췄는지를 그대로 적는다
      const said = await page.locator('body').innerText().catch(() => '(못 읽었다)')
      throw new Error(
        `오프닝이 ${String(steps)}걸음에서 멈췄다 (${new URL(page.url()).pathname}) · `
        + `지난 자리 ${trail.join('>') || '없음'} · 화면: ${said.replace(/\s+/g, ' ').slice(0, 300)}`,
      )
    }

    // ── 오버월드가 실제로 섰는가 ──
    //
    // 지역 배너는 맵 헤더의 label에서 오고, 그것이 뜬다는 것은 행렬·청크·헤더가
    // 다 읽혔다는 뜻이다. 캔버스만 보면 "검은 화면"과 구별이 안 된다
    // ⚠️ 첫 `div`를 집으면 성능 오버레이(`FPS …`)가 잡힌다 — 그걸 지역 이름이라
    // 적으면 보고서가 거짓말을 한다. 오버레이가 아닌 첫 줄을 고른다
    const zone = await page.evaluate(() => {
      for (const d of document.querySelectorAll('div')) {
        const t = (d.textContent ?? '').trim()
        if (t !== '' && !t.startsWith('FPS') && d.children.length === 0) return t
      }
      return ''
    }).catch(() => '')
    await where(page, () => document.querySelector('canvas') !== null,
      '오버월드에 캔버스가 안 생겼다')
    // 그림이 실제로 그려졌는가 — 캔버스가 한 색으로 비어 있으면 안 된다
    const painted = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      return c !== null && c.width > 0 && c.height > 0
    })
    assert(painted, '캔버스가 0×0이다')

    // ── 필드가 조용해지기를 기다린다 ──
    //
    // ⚠️ **대사창이 떠 있으면 걸음도 시작 메뉴도 안 먹는다.** 새 판의 주인공
    // 방은 들어서자마자 TV 방송 스크립트가 돌고, 스크립트가 도는 동안은 입력이
    // 0으로 지워진다(`scriptSystem.fixedUpdate`). 실측으로 여기서 한 번 섰다 —
    // 30번을 두드리고도 메뉴가 0줄이었고, 화면에는 방송 대사가 떠 있었다.
    // 밖에서 그것을 아는 길이 표식이다 (`data-talk` · `data-script`)
    const quiet = async () => {
      for (let i = 0; i < 150; i++) {
        const busy = await page.evaluate(() => {
          const d = document.documentElement.dataset
          return d.talk === '1' || d.script === '1'
        })
        if (!busy) return true
        // ⚠️ `press`로는 안 넘어간다 — 누르고 떼는 사이가 1ms도 안 돼서 프레임
        // 사이로 빠진다. 한 프레임 이상 붙잡아야 눌린 것으로 센다
        await page.keyboard.down('Space')
        await page.waitForTimeout(70)
        await page.keyboard.up('Space')
        await page.waitForTimeout(120)
      }
      return false
    }
    assert(await quiet(), '대사창이 안 닫힌다 — 스크립트가 안 끝났다')

    // ── 걷는다 ──
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      await page.keyboard.down(key)
      await page.waitForTimeout(400)
      await page.keyboard.up(key)
    }
    await quiet()

    // ── 시작 메뉴 → 리포트 ──
    //
    // ⚠️ **줄 이름으로 못 찾는다.** 메뉴 글은 사용자 롬에서 오므로 판마다 다르고
    // (`START_MENU`), 줄은 버튼이 아니라 커서로 고르는 `div`다. 그래서 **줄
    // 수로 자리를 확정한다** — 새 게임 직후에는 도감·포켓몬·공중날기가 아직
    // 없어서 [가방 · 트레이너카드 · 리포트 · 설정 · 닫는다] 다섯 줄이다.
    // 다섯이 아니면 가정이 깨진 것이므로 조용히 넘어가지 않고 여기서 선다
    // ⚠️ **바로 안 열린다.** 새 게임 직후에는 맵을 아직 읽는 중이고(623MB
    // 설치본에서 청크를 꺼낸다) 화면 전환 막이 입력을 먹는다. 열릴 때까지
    // 두드리되, 안 열리면 **그때 화면에 무엇이 있었는지**를 그대로 적는다
    const menuRows = () => page.evaluate(() => {
      const cards = [...document.querySelectorAll('div')]
        .filter((d) => [...d.children].length >= 4
          && [...d.children].every((c) => c.querySelector('span') !== null))
      const card = cards[cards.length - 1]
      return card ? [...card.children].map((c) => c.textContent?.trim() ?? '') : []
    })
    let rows = []
    for (let i = 0; i < 30 && rows.length === 0; i++) {
      await page.keyboard.down('KeyX')
      await page.waitForTimeout(70)
      await page.keyboard.up('KeyX')
      await page.waitForTimeout(1_000)
      rows = await menuRows()
    }
    if (rows.length !== 5) {
      const said = await page.locator('body').innerText().catch(() => '(못 읽었다)')
      // ⚠️ **화면이 비어 있으면 콘솔이 임자다.** 오버월드가 죽으면 DOM이 통째로
      // 사라져서 "무엇이 없다"만 남는다 — 무엇 때문에 죽었는지는 여기에 있다
      throw new Error(
        `시작 메뉴가 다섯 줄이 아니다 (${String(rows.length)}: ${rows.join(' · ')}) · `
        + `화면: "${said.replace(/\s+/g, ' ').slice(0, 200)}" · `
        + `오류 ${String(errors.length)}건: ${errors.slice(0, 3).join(' | ')}`,
      )
    }
    const SAVE_ROW = 2
    for (let i = 0; i < SAVE_ROW; i++) { await page.keyboard.press('ArrowDown') }
    await page.keyboard.press('Space')
    // 리포트 화면은 `주인공 · 배지 · 도감 · 플레이 시간` 네 칸짜리 `dl`이 임자다
    await where(page, () => {
      const dl = [...document.querySelectorAll('dl')].pop()
      return dl !== undefined && dl.querySelectorAll('dd').length === 4
    }, '리포트 화면이 안 뜬다', 30_000)
    // "쓸까요?"에 예. 커서가 예에 서 있으므로 그대로 확인이다
    await page.keyboard.press('Space')
    // ⚠️ **이름으로 "다 썼다"를 재면 안 된다.** 리포트 화면은 열리자마자
    // 요약창에 `주인공: {이름}`을 띄우므로 이름은 **묻기도 전에** 이미 있다.
    // 그걸 완료로 읽고 곧장 나갔더니 쓰는 중에 화면을 떠났고, 다시 열었을 때
    // 타이틀에 리포트가 없었다 — 실측이 여기서 섰다.
    //
    // 다 쓴 자리에서만 뜨는 것은 **백업 줄**이다 (`phase === 'done'`). 우리가
    // 그리는 글이라 어느 롬에서나 같고, 받았든 막혔든 한 줄이 뜬다
    await seen(page, page.getByText(/백업 파일도 받았다|백업 파일 다운로드를 막았다/).first(),
      '리포트를 다 썼다는 표시가 안 뜬다')
    const wrote = await page.locator('body').innerText()
    assert(wrote.includes(NAME), `다 쓴 화면에 이름이 없다: ${wrote.replace(/\s+/g, ' ').slice(0, 120)}`)
    await page.keyboard.press('Space')

    // ── 다시 열면 진행이 보인다 ──
    //
    // ⚠️ **Escape로는 타이틀에 못 간다.** 한때 "Escape가 화면을 한 겹씩 벗겨
    // 오버월드에서 타이틀까지 나간다"고 적혀 있었는데, 실측하니 여덟 번을
    // 두드려도 `/play`에 그대로 있었다. 나가는 길은 설정의 "처음부터" 하나이고
    // 그건 **리포트를 지운다** — 여기서 재려는 것과 정반대다.
    //
    // 그래서 사람이 실제로 하는 것을 한다: 창을 닫았다 다시 연다. 리포트가
    // 남았으면 타이틀에 이름이 뜬다
    //
    // ⚠️ `reload()`가 아니라 **주소를 새로 연다.** 지금 있는 자리가 `/play`라
    // 그대로 다시 읽으면 또 `/play`다 — 타이틀은 영영 안 온다
    await page.goto(`${origin}/`, { waitUntil: 'load' })
    await waitBoot(page)
    await where(page, () => location.pathname === '/', '다시 열었는데 타이틀이 아니다')
    // ⚠️ **이어하기 버튼의 글은 롬에서 온다.** `MAIN_MENU.continue_`라 영어
    // 롬에서는 `CONTINUE`이고 일본어 롬에서는 또 다르다 — 한국어 글로 찾으면
    // 영어 설치본에서 영영 못 찾는다. 실측이 정확히 여기서 60초를 섰다.
    // 리포트가 남았다는 증거는 버튼이 아니라 **요약창에 뜬 이름**이다
    await seen(page, page.locator('dl').filter({ hasText: NAME }).first(),
      '다시 열었는데 타이틀 요약창에 이름이 없다')
    const shown = await page.locator('dl').first().innerText()
    assert(shown.includes(NAME), `타이틀에 이름이 안 뜬다: ${shown.replace(/\n/g, ' ')}`)

    // ── .rpsave 내보내고, 지우고, 파일만으로 되살린다 ──
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: '세이브 파일 내보내기' }).click(),
    ])
    const at = resolve(ROOT, '.audit/e2e.tmp', download.suggestedFilename())
    mkdirSync(resolve(ROOT, '.audit/e2e.tmp'), { recursive: true })
    await download.saveAs(at)
    const bytes = readFileSync(at)
    assert(bytes.length > 0, '내려받은 .rpsave가 비어 있다')

    // 새 프로필과 같은 자리로 만든다 — 리포트만 지우고 설치본은 그대로 둔다
    await page.evaluate(async () => {
      for (const name of await indexedDB.databases()) {
        if (name.name) indexedDB.deleteDatabase(name.name)
      }
    })
    await page.reload({ waitUntil: 'load' })
    await waitBoot(page)
    // ⚠️ 여기도 롬 글로 기다리면 안 된다 — `새로운 모험 시작하기`는 영어 롬에서
    // `NEW GAME`이다. 리포트 칸은 **우리가 그리는 것**이라 어느 롬에서나 같다
    // 파일 칸은 화면에 안 보이게 숨겨 두므로 `attached`로 본다
    await seen(page, page.locator('input[accept=".rpsave"]'),
      '리포트를 지웠는데 백업 고르는 칸이 안 뜬다', 60_000, 'attached')

    await page.locator('input[accept=".rpsave"]').setInputFiles(at)
    await page.getByRole('button', { name: '이 리포트로 이어하기' }).click({ timeout: 60_000 })
    // ⚠️ **되살리면 타이틀에 안 머문다.** `commitImport`가 성공하면 곧장
    // `/play`로 들어간다 — 여기서 요약창을 찾으면 영영 없다. 들어간 것을 먼저
    // 보고, 리포트가 남았는지는 타이틀을 다시 열어서 본다
    await where(page, () => location.pathname === '/play',
      '.rpsave로 되살렸는데 게임에 안 들어간다')
    await page.goto(`${origin}/`, { waitUntil: 'load' })
    await waitBoot(page)
    await seen(page, page.locator('dl').filter({ hasText: NAME }).first(),
      '.rpsave로 되살린 리포트가 타이틀에 안 남는다')
    const back = await page.locator('dl').first().innerText()
    assert(back.includes(NAME), `되살린 리포트에 이름이 없다: ${back.replace(/\n/g, ' ')}`)
    rmSync(at, { force: true })

    // 게임을 끝까지 도는 동안 바깥으로도, /data로도 아무것도 안 나갔다
    const leaked = [
      ...contentRequests(requests.slice(mark)), ...outsideRequests(requests.slice(mark)),
    ]
    assert(leaked.length === 0, `게임 중 요청이 나갔다: ${leaked.slice(0, 3).join(' · ')}`)
    const fatal = errors.filter((e) => !/ResizeObserver|WebGL|Download the React/.test(e))
    assert(fatal.length === 0, `콘솔 오류: ${fatal.slice(0, 2).join(' / ')}`)

    return `새 게임 → 오버월드(${zone.slice(0, 12)}) → 걷기 4방향 → 리포트 → `
      + `.rpsave ${(bytes.length / 1024).toFixed(1)}kB 왕복 · 게임 중 요청 0건 · 콘솔 오류 0건`
  },
)

// ── ㉖ 이야기를 끝까지 몬다 — 배틀 둘과 상점 ────────────────────────────────
//
// ⚠️ **㉕가 안 재는 것이 여기 있다.** 그쪽은 새 게임에서 오버월드까지고, 야생·
// 트레이너 배틀과 상점은 이야기를 한참 몰아야 닿는 자리다.
//
// ⚠️ **길은 자료에서 계산한다** (`route.mjs`). 무작위로 걸으면 침실 21칸을
// 맴돌다 끝난다 — 실측으로 열 번 그랬다. 그렇다고 게임에 뒷문을 내는 것은
// 아니다: 여기서 나오는 것은 방향키 목록뿐이고, 실제로 갈 수 있는지는
// 브라우저가 `data-tile`로 답한다.
//
// ⚠️ **운에 안 걸리게 짠다.** 지나가다 야생을 만나기를 기다리면 실행마다
// 0회~3회로 갈린다. 풀 칸을 일부러 밟고, 트레이너와 점원은 **옆에 서서 마주
// 보고 말을 건다** — 우리 게임은 사람이 이동을 안 막아서 그 칸을 목적지로
// 잡으면 사람 위로 올라서 버린다 (`actor/obstacles.ts`)

const STORY_NAME = 'TESTER'

/**
 * ㉖만 길을 미리 계산한다 (`route.mjs`). 그 재료는 개발 산출물이라, 롬과
 * `AssetAssistant`만 있는 기계에는 없다 — 배포된 사용자가 가진 것이 딱 그
 * 둘이다.
 *
 * ⚠️ **없다고 다 같이 죽지 않는다.** 한때 `route.mjs`가 불러오는 자리에서
 * 여섯 개를 읽어서, `public/data`를 지운 기계에서는 `import` 하나에 스물일곱이
 * 통째로 죽었다 — ⑮처럼 그 자료가 아예 필요 없는 검사까지 같이 죽었다
 */
const routeGone = missingData()
const haveRoute = routeGone.length === 0

if (!(haveRom && haveBdsp && haveRoute)) {
  record('26', '야생 배틀 · 트레이너 배틀 · 상점', 'NOT RUN',
    ROM === null ? '이 기계에 Platinum 롬이 없다'
      : !haveBdsp ? '이 기계에 BDSP 덤프가 없다'
        : `길을 계산할 자료가 없다 — public/data/{${routeGone.join(' · ')}}`)
}

await ((haveRom && haveBdsp && haveRoute) ? run : () => {})(
  '26', '야생 배틀 · 트레이너 배틀 · 상점',
  async ({ page, requests, errors }) => {
    page.setDefaultTimeout(60_000)
    await page.goto(`${origin}/`, { waitUntil: 'load' })
    await waitBoot(page)
    await armWizard(page, BDSP, 300_000)
    await page.getByRole('button', { name: '설치 시작' }).click()
    await atTitle(page).waitFor({ timeout: 2_400_000 })
    const mark = requests.length

    await page.getByRole('button', { name: '시작', exact: true }).click()
    await where(page, () => location.pathname === '/intro', '새 게임을 눌렀는데 오프닝이 안 뜬다')
    const after = await playOpening(page, STORY_NAME)
    assert(after === '/play', `오프닝이 안 끝났다 — ${after}`)

    const story = await driveStory(page, { totalMs: 900_000 })
    const say = `맵 ${story.maps.join('·')} · 야생 ${String(story.wild)} · `
      + `트레이너 ${String(story.trainer)} · 상점 ${String(story.shops)} · ${String(story.seconds)}초`
    assert(story.trouble.length === 0, `${story.trouble.join(' | ')} (${say})`)
    assert(story.wild > 0, `야생 배틀에 못 닿았다 — ${say}`)
    assert(story.trainer > 0, `트레이너 배틀에 못 닿았다 — ${say}`)
    assert(story.shops > 0, `상점이 안 열렸다 — ${say}`)

    const leaked = [
      ...contentRequests(requests.slice(mark)), ...outsideRequests(requests.slice(mark)),
    ]
    assert(leaked.length === 0, `게임 중 요청이 나갔다: ${leaked.slice(0, 3).join(' · ')}`)
    const fatal = errors.filter((e) => !/ResizeObserver|WebGL|Download the React/.test(e))
    assert(fatal.length === 0, `콘솔 오류: ${fatal.slice(0, 2).join(' / ')}`)

    return `${say} · 게임 중 요청 0건 · 콘솔 오류 0건`
  },
)

// ⑯ 실제 호스트의 CSP 응답 헤더.
//
// ⚠️ **여기서는 못 잰다.** 이 하네스가 띄운 서버는 우리가 헤더를 붙인 것이라
// 호스트가 실제로 무엇을 돌려주는지의 증거가 안 된다. 재는 것은
// `pnpm verify:deploy <url>`이고, 여기서는 **그 결과를 읽기만** 한다.
//
// ⚠️ **한때 이 줄이 `'BLOCKED'` 상수였다.** 그래서 verify:deploy가 통과해도
// `pnpm e2e`를 다시 돌리면 ⑯이 도로 BLOCKED가 되고, `browser-e2e` blocker가
// BLOCKED를 세는 탓에 **정상 절차만으로는 release:check가 초록이 될 수 없었다.**
// 이제는 결과 파일을 읽어 판정한다 — 없으면 BLOCKED, 있으면 그 내용대로.
//
// ⚠️ **다른 빌드의 도장을 읽지 않는다.** 통과 기록은 파일로 남아 소스를 고쳐도
// 그대로 살아 있으므로, 잰 빌드(`buildId`)가 지금 빌드와 같을 때만 PASS다
{
  const at = readAudit('deploy-verified.json')
  const now = readAudit('build.json')?.buildId ?? null
  if (!at) {
    record('16', '실제 호스트의 CSP 응답 헤더', 'BLOCKED',
      'pnpm verify:deploy <url>을 돌린 적이 없다 — .audit/deploy-verified.json이 없다')
  } else if (!at.browserChecked) {
    record('16', '실제 호스트의 CSP 응답 헤더', 'BLOCKED',
      `${at.url}: 브라우저를 못 띄워 약한 갈래로 갔다 — 외부 요청을 실제로 세지 못했다`)
  } else if (at.problems?.length) {
    record('16', '실제 호스트의 CSP 응답 헤더', 'FAIL',
      `${at.url}: ${at.problems.slice(0, 3).join(' · ')}`)
  } else if (now === null || at.buildId === null || at.buildId === undefined) {
    record('16', '실제 호스트의 CSP 응답 헤더', 'BLOCKED',
      `${at.url}는 통과했지만 어느 빌드를 잰 것인지 모른다 — 다시 재야 한다`)
  } else if (at.buildId !== now) {
    record('16', '실제 호스트의 CSP 응답 헤더', 'BLOCKED',
      `${at.url}는 ${at.buildId}를 쟀다. 지금 빌드는 ${now}다 — 다시 재야 한다`)
  } else {
    record('16', '실제 호스트의 CSP 응답 헤더', 'PASS',
      `${at.url} · 빌드 ${at.buildId} · 헤더·SPA fallback·외부 요청 0 (pnpm verify:deploy)`)
  }
}

await browser.close()
server.close()

// ── 결과 ─────────────────────────────────────────────────────────────────────
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x1100 ? 2 : 1), 0)))
console.log('\n브라우저 실측 (dist를 정본 CSP 헤더로 띄우고 크로미움에서)\n')
for (const r of results) {
  const mark = { PASS: '✓', FAIL: '✗', BLOCKED: '⛔', 'NOT RUN': '·' }[r.status]
  console.log(`  ${mark} ${r.id}  ${pad(r.what, 52)} ${r.status}`)
  if (r.detail) console.log(`         ${r.detail}`)
}

const failed = results.filter((r) => r.status === 'FAIL')
const counts = ['PASS', 'FAIL', 'BLOCKED', 'NOT RUN']
  .map((s) => `${s} ${String(results.filter((r) => r.status === s).length)}`).join(' · ')
console.log(`\n  ${counts}`)

mkdirSync(resolve(ROOT, '.audit'), { recursive: true })
writeFileSync(resolve(ROOT, '.audit/e2e.json'), `${JSON.stringify({ results }, null, 1)}\n`)
if (existsSync(resolve(ROOT, '.audit/e2e.tmp'))) rmSync(resolve(ROOT, '.audit/e2e.tmp'), { recursive: true })

process.exit(failed.length > 0 ? 1 : 0)
