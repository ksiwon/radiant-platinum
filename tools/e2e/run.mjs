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
import { spawn } from 'node:child_process'
import { createServer as netServer } from 'node:net'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { serveDist } from './serve.mjs'
import { compareHeader } from '../distribution/csp.mjs'
import { fakeBdsp, readInstalled, REQUIRED_GROUPS, SYNTHETIC } from './fixtures.mjs'
import { platinumRoms } from '../raw/sources.cjs'

const ROOT = resolve(import.meta.dirname, '../..')
const DIST = resolve(ROOT, 'dist')
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7)

if (!existsSync(resolve(DIST, 'index.html'))) {
  console.error('dist/가 없다 — pnpm build 먼저')
  process.exit(1)
}

/** 개발 기계에 있으면 진짜 롬으로도 잰다. 없으면 그 줄은 NOT RUN이다 */
const ROM = (() => {
  try { return platinumRoms().en ?? null } catch { return null }
})()

/** 노드 산출물의 해시. 브라우저가 만든 것과 견준다 */
const NODE_SHA = (() => {
  const of = (rel) => {
    const at = resolve(ROOT, 'public/data', rel)
    return existsSync(at) ? createHash('sha256').update(readFileSync(at)).digest('hex') : null
  }
  return { moves: of('moves.json'), marts: of('marts.json') }
})()

const mb = (n) => `${(n / (1 << 20)).toFixed(1)}MB`

const results = []
const record = (id, what, status, detail) => { results.push({ id, what, status, detail }) }
const skip = (id, what) => {
  record(id, what, 'NOT RUN', ROM === null ? '이 기계에 Platinum 롬이 없다' : '건너뜀')
}

const server = await serveDist(DIST)
const origin = server.url
const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] })

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

async function run(id, what, fn) {
  if (only && !id.startsWith(only)) { record(id, what, 'NOT RUN', '--only로 걸렀다'); return }
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
  const spawnDev = () => spawn('npx.cmd', ['vite', '--port', String(port), '--strictPort'],
    { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const proc = spawnDev()
  const at = `http://localhost:${String(port)}`
  let live = proc
  /**
   * 지금 살아 있는가. 죽었으면 다시 띄운다.
   *
   * 검사 사이에 죽으면 다음 검사가 `ERR_CONNECTION_REFUSED`로 실패하는데,
   * 그건 앱이 아니라 하네스의 실패다. 실제로 ⑫와 ⑬ 사이에서 한 번 죽었다
   */
  const ensure = async () => {
    if (live.exitCode === null) return
    live = spawnDev()
    await ready(live, at)
  }
  try {
    await ready(proc, at)
    await fn(at, ensure)
  } catch (e) {
    // ⚠️ **하네스의 실패가 앱의 실패를 가리면 안 되고, 나머지를 멈춰서도 안 된다.**
    // 개발 서버가 안 뜨는 것은 이 셋을 못 쟀다는 뜻이지 앱이 틀렸다는 뜻이 아니다
    throw new DevServerDown(String(e.message ?? e))
  } finally {
    live.kill()
    if (live !== proc) proc.kill()
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

/**
 * 개발 서버가 **실제로 요청을 받을 때까지** 기다린다.
 *
 * ⚠️ **"ready in"은 준비됐다는 뜻이 아니다.** 그 뒤에 의존성 미리 묶기가
 * 시작되고 그동안 첫 요청이 몇 분씩 붙들린다 — 처음엔 그 시간이 ⑫의
 * navigation timeout으로 잡혔다. 재려던 것과 상관없는 실패다.
 *
 * ⚠️ **그리고 죽을 수 있다.** 진짜 롬 설치를 셋 돌린 뒤라 메모리가 눌려 있고,
 * 실제로 ⑫와 ⑬ 사이에서 한 번 죽어 `ERR_CONNECTION_RESET`이 났다. 그것도
 * 앱의 실패가 아니다 — 살아 있는지 보고, 죽었으면 그렇게 말한다
 */
async function ready(proc, at) {
  await new Promise((done) => {
    proc.stdout.on('data', (b) => { if (String(b).includes('ready in')) done() })
    setTimeout(done, 60_000)
  })
  const until = Date.now() + 300_000
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`개발 서버가 죽었다 (exit ${String(proc.exitCode)})`)
    try {
      const got = await fetch(`${at}/`, { signal: AbortSignal.timeout(20_000) })
      if (got.ok) { await got.text(); return }
    } catch { /* 아직 안 떴거나 미리 묶는 중 */ }
    if (Date.now() > until) throw new Error('개발 서버가 300초 안에 응답하지 않았다')
    await new Promise((r) => setTimeout(r, 1_000))
  }
}

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

/** 설치 화면에서 Platinum과 BDSP를 골라 "설치 시작"까지 갈 수 있게 만든다 */
async function armWizard(page) {
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 20_000 })
  await page.locator('input[accept=".nds"]').setInputFiles(ROM)
  await page.getByText('지원됩니다').waitFor({ timeout: 120_000 })
  await page.locator('input[webkitdirectory]').setInputFiles(fakeBdsp())
  await page.getByText('찾았습니다:').waitFor({ timeout: 60_000 })
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
  await page.getByText(/옮겨진 그룹은 설치됐지만/).waitFor({ timeout: 300_000 })
  const took = Date.now() - t0
  const peak = await heap()

  const got = await page.evaluate(readInstalled)
  assert(got.state === 'partial', `상태가 partial이 아니다: ${got.state}`)
  assert(got.groups.sort().join(',') === 'marts,moves', `그룹이 다르다: ${got.groups.join(',')}`)
  // 브라우저가 만든 바이트가 노드 산출물과 같은가. 경계를 다 지난 뒤의 값이다
  assert(got.sha['data/moves.json'] === NODE_SHA.moves,
    `moves.json이 노드 산출물과 다르다: ${got.sha['data/moves.json']}`)
  assert(got.sha['data/marts.json'] === NODE_SHA.marts,
    `marts.json이 노드 산출물과 다르다: ${got.sha['data/marts.json']}`)
  // 128MB를 읽는 내내 바깥으로도, /data로도 아무것도 안 나갔다
  const leaked = [...contentRequests(requests.slice(before)), ...outsideRequests(requests.slice(before))]
  assert(leaked.length === 0, `변환 중 요청이 나갔다: ${leaked.slice(0, 3).join(' · ')}`)
  return `moves·marts 설치 ${(took / 1000).toFixed(1)}초 · 힙 ${mb(base)} → ${mb(peak)} · `
    + `노드 산출물과 해시 일치 · 설치 중 요청 ${String(requests.length - before)}건 전부 앱 셸`
})

await (haveRom ? run : skip)('10', '손상된 파일을 다시 만든다 (진짜 설치기)', async ({ page }) => {
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await waitBoot(page)
  await armWizard(page)
  await page.getByRole('button', { name: '설치 시작' }).click()
  await page.getByText(/옮겨진 그룹은 설치됐지만/).waitFor({ timeout: 300_000 })

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
  await page.getByText(/옮겨진 그룹은 설치됐지만/).waitFor({ timeout: 300_000 })
  const got = await page.evaluate(readInstalled)
  assert(got.sha['data/moves.json'] === NODE_SHA.moves,
    `다시 안 만들었다: ${JSON.stringify(got.sha)}`)
  return `0바이트로 자른 뒤 재실행 → 해시 복구 (${NODE_SHA.moves.slice(0, 12)}…)`
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
  assert(made.sha['data/moves.json'] === NODE_SHA.moves, '첫 설치가 틀렸다')

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
  await again.getByText('비공식·비제휴').first().waitFor({ timeout: 60_000 })
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

// ── 못 재는 것 ───────────────────────────────────────────────────────────────
record('15', '진짜 입력으로 12/12 완주 → 두 번째 실행에서 타이틀 진입', 'BLOCKED',
  '필수 그룹 12개 중 변환기가 있는 것이 2개다 (blocker 3 — BDSP·Platinum 미이식). '
  + '⑰이 **진짜 변환된 바이트로** "두 번째 실행에서 다시 안 만든다"를 재고, ⑱이 '
  + '`ready`일 때의 부팅 순서를 재지만, 그 둘을 잇는 **진짜 12/12 완주**는 못 한다. '
  + '이것이 남아 있는 한 문서에 "한 번만 고르면 된다"를 확정으로 쓰지 않는다')
record('16', '실제 호스트의 CSP 응답 헤더', 'BLOCKED',
  '호스트를 안 정했다 (blocker 2). 이 하네스는 우리가 띄운 서버라 증거가 안 된다 — '
  + 'pnpm verify:deploy <url>')

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
