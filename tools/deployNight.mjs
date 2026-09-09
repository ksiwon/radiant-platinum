// 새벽 창 하나를 사람 없이 완주한다 — `docs/orders/DEPLOY_PHASE_ORDER_20260909.md` §8.
//
//     node tools/deployNight.mjs                 1~7을 차례로
//     node tools/deployNight.mjs --dry-run       push 자리를 건너뛴다 (연습)
//     node tools/deployNight.mjs --only=4        그 단계만
//     node tools/deployNight.mjs --only=4 --suites=story --pass=--only=gym3
//
// ⚠️ **이 파일은 판정을 안 만든다.** 부르고, 받아 적고, 다음으로 간다. 무엇이
// 통과인지는 각 묶음이 제 봉투에 적고(`tools/distribution/evidence.mjs`),
// 실패를 FAIL과 BLOCKED로 가르는 것은 `tools/e2e/budget.mjs`다. 여기서 상태를
// 다시 계산하거나 문턱을 손대면 그 두 자리가 두 벌이 된다.
//
// ⚠️ **금지된 길이 여기 아예 없다** (지시서 §5·§8):
//   · `src`를 안 고친다 — 쓰는 자리가 `.audit/post-overnight-20260909/deploy-phase/`
//     아래뿐이고, 쓰는 세 곳(`write`·`keep`·6의 그림)이 각자 그 밖을 거절한다.
//     그리고 4의 묶음 사이마다
//     `git status -- src`를 다시 읽어 **누가 고쳤으면 거기서 멈춘다.**
//   · push가 **한 번**이다 — `git push` 글자가 이 파일에 `pushOnce()` 안 한 곳뿐이고,
//     그 함수는 두 번째 부름을 던진다.
//   · `reset --hard`·`stash`·`checkout --`·재귀 삭제가 없다.
//   · 실패해도 **안 고친다.** 4의 다섯 묶음은 떨어져도 다음으로 간다.
//
// ⚠️ **1이 떨어지면 push를 안 한다.** 그 자리가 이 스크립트의 유일한 분기다 —
// 나머지는 무엇이 나오든 끝까지 돌고 마지막에 `AUTO.md`로 적는다

import { spawn } from 'node:child_process'
import {
  copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { knock } from './devServer.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const BASE = resolve(ROOT, '.audit/post-overnight-20260909/deploy-phase')

const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const DRY = argv.includes('--dry-run')
const SITE = (() => {
  const u = flag('site', 'https://radiant.siwon.it.kr/')
  return u.endsWith('/') ? u : `${u}/`
})()
const BRANCH = flag('branch', 'hm-cutin-and-warp-fade')
/** Netlify가 굽는 것을 몇 분까지 기다리나. 못 기다리면 「⑯ 미측정」이다 */
const WAIT_MIN = (() => {
  const v = Number(flag('wait', '25'))
  // ⚠️ **NaN을 그대로 두면 상한 비교가 영영 거짓이라 무한히 기다린다.** 무인
  // 창에서 그 자리는 아침까지 아무것도 안 한 판이 된다
  if (!Number.isFinite(v) || v < 0) throw new Error(`--wait이 수가 아니다: ${String(flag('wait'))}`)
  return v
})()
/** 4의 묶음 이름을 좁힌다 (연습용) */
const SUITES_ONLY = (flag('suites', '') || '').split(',').filter((s) => s !== '')
/** 4의 묶음에 그대로 덧붙일 인자 (연습용). `--pass=--only=gym3` */
const PASS = (flag('pass', '') || '').split(' ').filter((s) => s !== '')
/**
 * ⚠️ **연습이 진짜 창의 기록을 안 덮는다.** dry-run이나 `--pass`가 붙으면
 * 로그·봉투 사본이 `-smoke` 자리로 간다 — 아침에 읽는 사람이 「이건 연습이었다」를
 * 파일 이름에서 봐야 한다
 */
const TAG = flag('tag', DRY || PASS.length > 0 || SUITES_ONLY.length > 0 ? 'smoke' : '')
const suffix = TAG === '' ? '' : `-${TAG}`
const LOGS = resolve(BASE, `logs${suffix}`)
const ENVS = resolve(BASE, `envelopes${suffix}`)
const AUTO = resolve(BASE, `AUTO${suffix}.md`)

const STEPS = ['1', '2', '3', '4', '5', '6', '7']
const only = (flag('only', '') || '').split(',').filter((s) => s !== '')
const wants = (id) => only.length === 0 || only.includes(id)

// ── 적는 자리 ───────────────────────────────────────────────────────────────

/**
 * 글 하나를 적는다.
 *
 * ⚠️ **자리를 확인하고 쓴다.** 하네스가 리포를 고치는 길은 「쓰는 함수를 조심해서
 * 부른다」로는 못 막는다 — 부르는 자리마다 뿌리를 확인해야 막힌다. 이 파일에서
 * 파일을 만드는 곳은 셋(`write`·`keep`·6의 그림)이고 셋 다 같은 줄을 갖는다
 */
function write(at, text) {
  const path = resolve(at)
  if (!path.startsWith(BASE)) throw new Error(`밖에 쓰려고 했다: ${path}`)
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, text)
  return path
}

const iso = (t) => new Date(t).toISOString()
const mins = (ms) => `${(ms / 60_000).toFixed(1)}분`
const sleep = (ms) => new Promise((ok) => { setTimeout(ok, ms) })

/** 한 판의 모든 걸음. `AUTO.md`가 이것을 그대로 표로 편다 */
const steps = []
/** 걸음 하나를 적는다. **상태를 여기서 계산하지 않는다** — 종료 코드 그대로다 */
const note = (row) => { steps.push(row); return row }

// ── 부르는 자 ───────────────────────────────────────────────────────────────

/** 지금 무엇을 돌리고 있나. 두 개가 동시에 뜨는 것을 막는다 (지시서 §8 4번) */
let running = null

/**
 * 명령 하나를 돌리고 stdout/stderr를 로그 파일과 화면에 같이 흘린다.
 *
 * ⚠️ **`stdio:'inherit'`을 안 쓴다.** 그러면 화면에는 뜨는데 파일에 안 남아
 * 아침에 읽을 것이 없다. 반대로 파일에만 넣으면 창이 도는 동안 아무것도 안
 * 보인다 — 둘 다 준다
 */
function sh(name, cmd, args, { label = null } = {}) {
  if (running !== null) throw new Error(`${String(running)}가 도는 중에 ${name}을 또 불렀다`)
  running = name
  const at = resolve(LOGS, `${name}.log`)
  mkdirSync(LOGS, { recursive: true })
  const line = `${cmd} ${args.join(' ')}`
  const started = Date.now()
  const log = createWriteStream(at, { flags: 'w' })
  log.write(`# ${label ?? name}\n# ${line}\n# 시작 ${iso(started)}\n\n`)
  console.log(`\n▶ ${name} — ${line}`)
  return new Promise((done) => {
    // ⚠️ 윈도우에서 `pnpm`은 `.cmd`라 셸 없이 spawn하면 EINVAL이다
    const child = spawn(cmd, args, { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const pipe = (s) => { s.on('data', (b) => { log.write(b); process.stdout.write(b) }) }
    pipe(child.stdout); pipe(child.stderr)
    const finish = (code, why) => {
      const ended = Date.now()
      log.write(`\n\n# 끝 ${iso(ended)} · ${mins(ended - started)} · 종료 ${String(code)}`
        + `${why === null ? '' : ` (${why})`}\n`)
      log.end()
      running = null
      console.log(`◀ ${name} — 종료 ${String(code)} · ${mins(ended - started)}`)
      done(note({
        name, label: label ?? name, cmd: line, code, why,
        started: iso(started), ended: iso(ended), ms: ended - started,
        log: `logs${suffix}/${name}.log`,
      }))
    }
    child.on('error', (e) => { finish(null, `spawn 실패: ${e.message}`) })
    child.on('close', (code) => { finish(code, null) })
  })
}

/** 값을 받아 오는 짧은 git 부름. 로그 파일을 안 만든다 */
function git(args) {
  return new Promise((done) => {
    const child = spawn('git', args, { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (b) => { out += b })
    child.stderr.on('data', (b) => { out += b })
    child.on('error', () => { done({ code: null, out }) })
    child.on('close', (code) => { done({ code, out: out.trim() }) })
  })
}

// ── 1. 검사와 빌드 ──────────────────────────────────────────────────────────

async function step1() {
  const check = await sh('01a-check', 'pnpm', ['check'], { label: '1 · pnpm check' })
  const build = await sh('01b-build', 'pnpm', ['build'], { label: '1 · pnpm build' })
  return check.code === 0 && build.code === 0
}

// ── 2. ff-merge와 push (**한 번**) ──────────────────────────────────────────

/**
 * ⚠️ **이 파일에서 `git push`가 나오는 곳은 여기뿐이고, 두 번째는 던진다.**
 * 지시서 §5의 「push를 두 번 하는 것」을 코드 모양으로 막는 자리다
 */
let pushes = 0
async function pushOnce() {
  if (pushes > 0) throw new Error('push는 §8 2번의 한 번뿐이다 — 두 번째를 막았다')
  pushes++
  return sh('02c-push', 'git', ['push', 'origin', 'master'], { label: '2 · push (한 번)' })
}

async function step2() {
  if (DRY) {
    note({ name: '02-push', label: '2 · ff-merge와 push', code: null, why: 'dry-run — 건너뛴다',
      started: iso(Date.now()), ended: iso(Date.now()), ms: 0, log: null })
    return false
  }
  // ⚠️ **더러운 트리에서 갈아타지 않는다.** `checkout`이 반쯤 되면 다음 묶음이
  // 무엇을 잰 것인지 아무도 모른다. 여기서 서는 편이 낫다
  const dirty = await git(['status', '--porcelain'])
  if (dirty.out !== '') {
    note({ name: '02-push', label: '2 · ff-merge와 push', code: 1,
      why: `트리가 더럽다 — 갈아타지 않는다:\n${dirty.out}`,
      started: iso(Date.now()), ended: iso(Date.now()), ms: 0, log: null })
    return false
  }
  const co = await sh('02a-checkout', 'git', ['checkout', 'master'], { label: '2 · master로' })
  if (co.code !== 0) return false
  const mg = await sh('02b-merge', 'git', ['merge', '--ff-only', BRANCH], { label: '2 · ff-merge' })
  if (mg.code !== 0) return false
  const up = await pushOnce()

  /**
   * ⚠️ **갈아타면 `src`의 시각이 전부 지금이 된다 — 그러면 `pnpm e2e`가 안 돈다.**
   *
   * `checkout master`는 뒤에 있는 master의 파일들을 써 넣고, 이어지는 ff-merge가
   * 그것을 도로 써 넣는다. 내용은 1에서 구운 그 나무 그대로인데 **mtime만** 지금이
   * 된다. `run.mjs`는 `src`의 가장 새 mtime이 `dist/index.html`보다 뒤면
   * 「dist가 낡았다」로 **돌기 전에 선다** (실측 근거가 그 자리 주석에 있다) —
   * 그러면 다섯 묶음 중 하나가 통째로 미실행이 된다.
   *
   * ⚠️ **다시 굽는 것이 무엇을 재는지를 안 바꾼다.** `BUILD_ID`가 커밋 sha라
   * 같은 커밋·깨끗한 나무에서는 같은 바이트가 나온다 — 바뀌는 것은 파일 시각뿐이다.
   * 그래서 `verify:deploy`의 묶음 비교도 ⑯의 `buildId` 비교도 그대로 선다
   */
  await sh('02d-rebuild', 'pnpm', ['build'],
    { label: '2 · 갈아탄 뒤 다시 굽는다 (mtime만 바뀐다)' })
  return up.code === 0
}

// ── 3. Netlify를 기다렸다가 verify:deploy ───────────────────────────────────

/**
 * 갓 구운 `dist`의 첫 조각 이름. 내용이 바뀌면 이름이 바뀐다.
 *
 * ⚠️ **이 이름이 배포본과 같아지려면 1의 빌드가 깨끗한 나무에서 나와야 한다.**
 * `BUILD_ID`는 커밋 sha 일곱 자인데(`vite.config.ts`), 나무가 더러우면
 * `-dirty`가 붙고 그 한 글자가 청크 해시를 통째로 바꾼다. 그러면 여기서
 * 기다리는 이름이 **영영 안 온다** — Netlify는 `COMMIT_REF`로 깨끗하게 굽기
 * 때문이다. ⑯(`e2e`)도 같은 자리에서 `buildId`를 견주므로 함께 죽는다.
 * 2의 「트리가 더럽다」 관문이 그것까지 막는 자리다
 */
function distAsset() {
  const at = resolve(ROOT, 'dist/index.html')
  if (!existsSync(at)) return null
  const m = /src="(\/assets\/index-[^"]+\.js)"/.exec(readFileSync(at, 'utf8'))
  return m === null ? null : m[1]
}

/** 지금 배포된 것의 첫 조각 이름 */
async function liveAsset() {
  try {
    const res = await fetch(SITE, { cache: 'no-store', redirect: 'follow' })
    if (!res.ok) return { ok: false, why: `HTTP ${String(res.status)}` }
    const m = /src="(\/assets\/index-[^"]+\.js)"/.exec(await res.text())
    return { ok: true, asset: m === null ? null : m[1], why: null }
  } catch (e) { return { ok: false, why: String(e?.cause?.code ?? e?.message ?? e) } }
}

async function step3(pushed) {
  const want = distAsset()
  // ⚠️ **「밀기 전」은 밀기 전에 읽어야 한다.** 3에서 읽으면 Netlify가 빠른 날에
  // 새 것을 읽고서 「처음부터 같았다」로 적는다 — 그러면 기다림이 통째로 사라진다
  const before = state.liveBefore ?? await liveAsset()
  const started = Date.now()
  let arrived = null
  let why = null

  if (want === null) why = 'dist/index.html에서 첫 조각 이름을 못 읽었다 — 안 기다린다'
  else if (!pushed) why = 'push를 안 했다 — 기다릴 새 빌드가 없다'
  else if (before.ok && before.asset === want) {
    // ⚠️ **이미 같으면 「도착했다」로 안 적는다.** netlify.toml의 `ignore`가
    // 배포물이 안 바뀌면 아예 안 굽는다 — 그때는 기다릴 것이 없고, 「기다려서
    // 왔다」와 「처음부터 같았다」는 다른 사실이다
    arrived = false
    why = `밀기 전부터 배포본이 이미 ${want}였다 — netlify가 안 구웠거나 dist가 안 바뀌었다`
  } else {
    const until = started + WAIT_MIN * 60_000
    for (;;) {
      // 서버가 살아 있는지부터. 죽은 것과 아직 안 구운 것은 다른 병이다
      const alive = await knock(SITE)
      if (alive.ok) {
        const now = await liveAsset()
        if (now.ok && now.asset === want) { arrived = true; break }
        why = now.ok ? `아직 ${String(now.asset)}` : `못 읽었다 — ${String(now.why)}`
      } else why = `안 대답한다 — ${String(alive.why)}`
      if (Date.now() > until) {
        arrived = false
        why = `${String(WAIT_MIN)}분 안에 새 빌드가 안 왔다 (마지막: ${String(why)})`
        break
      }
      await sleep(15_000)
    }
  }

  note({ name: '03a-netlify', label: '3 · Netlify 빌드를 기다린다',
    code: arrived === true ? 0 : null,
    why: arrived === true ? `${String(want)}가 도착했다` : `⑯ 미측정 후보 — ${String(why)}`,
    started: iso(started), ended: iso(Date.now()), ms: Date.now() - started, log: null })

  // ⚠️ **안 기다려졌어도 부른다.** 지금 올라가 있는 것의 헤더는 잴 수 있고,
  // 그 값이 「낡은 배포본의 것」이라는 사실은 위 줄이 적어 준다
  const v = await sh('03b-verify-deploy', 'pnpm', ['verify:deploy', SITE], { label: '3 · verify:deploy' })
  return { arrived, want, before: before.ok ? before.asset : null, verify: v.code }
}

// ── 4. 다섯 묶음 ────────────────────────────────────────────────────────────

/**
 * 도는 차례. **`render:first`가 먼저고 `story`가 끝이다** (지시서 §3·§8).
 * `file`은 그 묶음이 봉투를 쓰는 자리다 (`evidence.mjs`의 `SUITES`)
 */
const SWEEP = [
  { key: 'render-first', script: 'render:first', file: 'renderFirst.json', want: '5/5' },
  { key: 'gpu-loss', script: 'gpu:loss', file: 'gpuLoss.json', want: '9/9' },
  { key: 'journey', script: 'journey', file: 'journey.json', want: '17/17' },
  { key: 'installed-e2e', script: 'e2e', file: 'e2e.json', want: 'PASS 29 · BLOCKED 0' },
  { key: 'story', script: 'story', file: 'story.json', want: '88/88' },
]

/** 봉투 하나를 읽어 상태별로 센다. **여기서 판정을 다시 하지 않는다** */
function readEnvelope(at) {
  try {
    const j = JSON.parse(readFileSync(at, 'utf8'))
    const rows = Array.isArray(j.results) ? j.results : []
    const by = {}
    for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1
    /**
     * ⚠️ **경합만 다시 돈다.** BLOCKED에는 인프라도 관측 불충분도 있고, 그것들은
     * 한 번 더 돈다고 달라지지 않는다. 「기계가 붐볐다」만 창 안에서 재시도한다
     * (지시서 §8) — 글자는 `budget.mjs`의 `classify`가 낸 것이다
     */
    const contended = rows.filter((r) => r.status === 'BLOCKED'
      && /경합|붐볐다/.test(String(r.detail ?? r.why ?? '')))
    return {
      ok: true, by, rows: rows.length, contended,
      contract: j.contractVersion ?? null,
      digests: {
        source: j.sourceDigest ?? null, artifact: j.artifactDigest ?? null,
        harness: j.harnessDigest ?? null, data: j.dataDigest ?? null, roster: j.rosterDigest ?? null,
      },
      buildId: j.buildId ?? null,
      dataChangedDuringRun: j.dataChangedDuringRun ?? null,
      load: j.environment?.load ?? null,
      expected: j.scope?.expectedCases?.length ?? null,
      executed: j.scope?.executedCases?.length ?? null,
      fails: rows.filter((r) => r.status === 'FAIL').map((r) => `${r.id} ${r.what}`),
      blocked: rows.filter((r) => r.status === 'BLOCKED')
        .map((r) => `${r.id} ${r.what} — ${String(r.detail ?? r.why ?? '')}`),
    }
  } catch (e) { return { ok: false, why: String(e?.message ?? e) } }
}

/** 그 봉투 파일이 마지막으로 쓰인 시각. 없으면 0 */
function stampOf(file) {
  const at = resolve(ROOT, '.audit', file)
  return existsSync(at) ? statSync(at).mtimeMs : 0
}

/** 봉투를 사본으로 남긴다 — 다시 돌면 `.audit`의 원본이 덮이기 때문이다 */
function keep(file, as) {
  const from = resolve(ROOT, '.audit', file)
  if (!existsSync(from)) return null
  mkdirSync(ENVS, { recursive: true })
  const to = resolve(ENVS, as)
  if (!to.startsWith(BASE)) throw new Error(`밖에 쓰려고 했다: ${to}`)
  copyFileSync(from, to)
  return to
}

/**
 * ⚠️ **훑는 동안 `src`가 안 바뀌었는가.** 바뀌면 HMR로 앞뒤가 섞여 봉투의
 * 뜻이 사라진다 (지시서 §5). 우리가 안 고치는 것과 **아무도 안 고쳤다**는
 * 다른 말이라 묶음마다 다시 읽는다
 */
async function srcTouched() {
  const s = await git(['status', '--porcelain', '--', 'src'])
  return s.out === '' ? null : s.out
}

/** 이번 판이 **정말 쓴** 봉투만 사본으로 옮겨 읽는다 */
function mine(file, as, before) {
  if (stampOf(file) === before) {
    return { ok: false, why: `.audit/${file}이 이 판에서 안 쓰였다 — 묶음이 결과를 못 남겼다 (미실행)` }
  }
  const kept = keep(file, as)
  return kept === null ? { ok: false, why: `.audit/${file}이 없다 (미실행)` } : readEnvelope(kept)
}

async function step4() {
  const out = []
  const list = SUITES_ONLY.length === 0 ? SWEEP : SWEEP.filter((s) => SUITES_ONLY.includes(s.key)
    || SUITES_ONLY.includes(s.script))
  for (const s of list) {
    const dirt = await srcTouched()
    if (dirt !== null) {
      note({ name: `04-${s.script}`, label: `4 · ${s.script}`, code: null,
        why: `src가 바뀌었다 — 훑기를 여기서 멈춘다:\n${dirt}`,
        started: iso(Date.now()), ended: iso(Date.now()), ms: 0, log: null })
      out.push({ key: s.key, script: s.script, stopped: '훑기 도중 src가 바뀌었다' })
      break
    }
    /**
     * ⚠️ **앞 판이 남긴 봉투를 이 판의 결과로 읽지 않는다.**
     *
     * 묶음이 터져 결과 파일을 못 쓰면 `.audit/<이름>.json`에는 **지난번 것**이
     * 그대로 있다. 그것을 사본으로 옮겨 세면 「안 돌았다」가 「지난번처럼 됐다」로
     * 둔갑한다 — 「건너뛴 것은 미실행이지 통과가 아니다」가 무너지는 자리다.
     * 지우고 시작하는 대신 **쓰인 시각을 앞뒤로 견준다** (남의 파일을 안 지운다)
     */
    const before = stampOf(s.file)
    const run = await sh(`04-${s.key}`, 'pnpm', [s.script, ...PASS], { label: `4 · pnpm ${s.script}` })
    const env = mine(s.file, `${s.key}.json`, before)
    const row = { key: s.key, script: s.script, want: s.want, first: { code: run.code, env }, second: null }

    // BLOCKED(경합)가 있으면 그 묶음만 한 번 더. **두 번째 결과는 그대로 적는다**
    if (env.ok && env.contended.length > 0) {
      console.log(`  ${s.script} — 경합 BLOCKED ${String(env.contended.length)}건, 한 번 더 돈다`)
      const was = stampOf(s.file)
      const again = await sh(`04-${s.key}-2`, 'pnpm', [s.script, ...PASS],
        { label: `4 · pnpm ${s.script} (경합 재시도 · 마지막)` })
      row.second = { code: again.code, env: mine(s.file, `${s.key}-2.json`, was) }
    }
    out.push(row)
  }
  return out
}

// ── 5·6. release:check와 배포 URL 그림 ──────────────────────────────────────

async function step5() {
  return sh('05-release-check', 'pnpm', ['release:check'], { label: '5 · release:check' })
}

/**
 * 배포 URL에서 그림 (지시서 §8 6번).
 *
 * ⚠️ **`pnpm shot`은 배포물을 못 몬다.** 확인 지점으로 뛰어드는 길이 전부
 * `import('/src/...')`이고(`tools/shot/shot.mjs` 스무 곳) 배포물에는 그 길이
 * 없다 — `observe.mjs`의 dist 어댑터가 같은 이유로 값을 안 읽는다. 그래도
 * **지시서대로 불러 본다.** 안 되는 것을 안 해 보고 「안 된다」라고 적지 않는다.
 * 그리고 못 몰아도 **뜨는 첫 화면 한 장**은 남긴다 — 배포가 살아 있다는 그림은
 * 아침에 필요하다
 */
async function step6() {
  const shot = await sh('06a-shot', 'pnpm', ['shot', 'twinleaf', 'wild', `--url=${SITE}`],
    { label: '6 · pnpm shot (배포 URL)' })
  const started = Date.now()
  let title = null
  let why = null
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
      page.setDefaultNavigationTimeout(120_000)
      await page.goto(SITE, { waitUntil: 'load' })
      await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
      // 글이 앉을 때까지 조금. 폰트가 늦으면 빈 상자만 찍힌다
      await page.waitForTimeout(3_000)
      mkdirSync(resolve(BASE, `shots${suffix}`), { recursive: true })
      const at = resolve(BASE, `shots${suffix}/deploy-title.png`)
      if (!at.startsWith(BASE)) throw new Error(`밖에 쓰려고 했다: ${at}`)
      await page.screenshot({ path: at })
      title = `shots${suffix}/deploy-title.png`
    } finally { await browser.close() }
  } catch (e) { why = String(e?.message ?? e) }
  note({ name: '06b-title', label: '6 · 배포 첫 화면 한 장', code: title === null ? null : 0,
    why: title ?? `못 찍었다 — ${String(why)}`,
    started: iso(started), ended: iso(Date.now()), ms: Date.now() - started, log: null })
  return { shot: shot.code, title }
}

// ── 7. 기계가 적는 사실 ─────────────────────────────────────────────────────

const box = (v) => (v === null || v === undefined ? '—' : String(v))

/** fps 분포 한 줄 */
const fpsRow = (what, load) => {
  if (load === null || load === undefined) return `| ${what} | 못 쟀다 | — | — | — | — |`
  const f = load.fps
  if (f === null || f === undefined) return `| ${what} | 표본 ${box(load.n)} · fps 없음 | — | — | — | — |`
  return `| ${what} | ${box(f.n)} | ${box(f.p50)} | ${box(f.p10)} | ${box(f.min)} |`
    + ` ${load.cpu ? `p50 ${box(load.cpu.p50)}% · p90 ${box(load.cpu.p90)}%` : '—'} |`
}

function step7(state) {
  const L = []
  L.push('# 새벽 창 — 기계가 적은 사실 (자동 생성)', '')
  L.push('⚠️ **이 파일은 스크립트가 적었다.** 판정도 해석도 없다 — 무엇을 몇 시에 불렀고')
  L.push('무엇이 나왔는지뿐이다. 여덟 절 보고서는 `REPORT.md`이고, 그 수치의 정본이 여기다.', '')
  L.push(`- 시작 ${state.startedAt} · 끝 ${iso(Date.now())}`)
  L.push(`- 배포 주소 \`${SITE}\` · 가지 \`${BRANCH}\``)
  L.push(`- 시작 HEAD \`${box(state.head)}\` (${box(state.headBranch)})`)
  L.push(`- 훑기 직전 HEAD \`${box(state.headAtSweep)}\``)
  L.push(`- push ${DRY ? '**안 했다 (dry-run)**' : pushes === 1 ? '한 번 했다' : '안 했다'}`)
  L.push(`- 걸린 인자: \`${argv.join(' ') || '(없음)'}\``, '')

  L.push('## 걸음', '', '| 걸음 | 종료 | 걸린 시간 | 로그 | 비고 |', '|---|---|---|---|---|')
  for (const s of steps) {
    L.push(`| ${s.label} | ${s.code === 0 ? '0 ✓' : box(s.code)} | ${mins(s.ms)} |`
      + ` ${s.log === null ? '—' : `\`${s.log}\``} | ${(s.why ?? '').replace(/\n/g, ' · ') || '—'} |`)
  }
  L.push('')

  L.push('## 다섯 묶음', '')
  if (state.sweep.length === 0) L.push('안 돌렸다.', '')
  for (const r of state.sweep) {
    L.push(`### ${r.script}`, '')
    if (r.stopped !== undefined) { L.push(`**멈췄다** — ${r.stopped}`, ''); continue }
    for (const [i, run] of [r.first, r.second].entries()) {
      if (run === null || run === undefined) continue
      const e = run.env
      const head = i === 0 ? '첫 판' : '두 번째 판 (경합 재시도 · 이 결과가 마지막이다)'
      if (!e.ok) { L.push(`- ${head}: 종료 ${box(run.code)} · 봉투를 못 읽었다 — ${box(e.why)}`); continue }
      const counts = Object.entries(e.by).map(([k, v]) => `${k} ${String(v)}`).join(' · ')
      L.push(`- ${head}: 종료 ${box(run.code)} · ${counts || '결과 줄이 없다'} (바라는 것 ${r.want})`)
      L.push(`  - 밟은 자리 ${box(e.executed)} / 정본 ${box(e.expected)} · 계약 판 ${box(e.contract)}`)
      L.push(`  - 다이제스트 source \`${String(e.digests.source).slice(0, 12)}\``
        + ` · artifact \`${String(e.digests.artifact).slice(0, 12)}\``
        + ` · harness \`${String(e.digests.harness).slice(0, 12)}\``
        + ` · data \`${String(e.digests.data).slice(0, 12)}\``)
      L.push(`  - 도는 동안 자료가 바뀌었나: ${e.dataChangedDuringRun === null ? '모른다' : e.dataChangedDuringRun ? '**바뀌었다**' : '아니다'}`)
      if (e.fails.length > 0) L.push(`  - FAIL ${String(e.fails.length)}: ${e.fails.join(' / ')}`)
      if (e.blocked.length > 0) for (const b of e.blocked) L.push(`  - BLOCKED ${b}`)
    }
    L.push('')
  }

  L.push('## §2.1 fps 분포 — 개발 서버와 배포물', '')
  L.push('⚠️ **같은 자로 잰 것이다** — 양쪽 다 브라우저 `requestAnimationFrame`을 초마다 센다')
  L.push('(`tools/e2e/loadSpy.mjs`). 제품 계기판(`obs.perf()`)은 배포물에서 안 읽히므로 안 쓴다.', '')
  L.push('| 잰 곳 | fps 표본 | p50 | p10 | 최저 | CPU |', '|---|---|---|---|---|---|')
  const devLoad = state.load.journey
  const distLoad = state.load.e2e
  L.push(fpsRow('개발 서버 (journey 한 판 전체)', devLoad))
  L.push(fpsRow('배포물 (e2e ㉖ · 로컬 dist)', distLoad))
  L.push('')
  const p10 = distLoad?.fps?.p10 ?? null
  L.push(p10 === null
    ? '**결정 못 함** — 배포물 쪽 fps를 못 쟀다. 문턱(p10 20fps)에 대볼 값이 없다.'
    : p10 < 20
      ? `**제품 일감으로 연다** — 배포물 p10 ${String(p10)}fps < 20fps (지시서 §2.1).`
      : `**안 연다** — 배포물 p10 ${String(p10)}fps ≥ 20fps (지시서 §2.1).`)
  L.push('')

  L.push('## 배포 도착', '')
  const d = state.deploy
  if (d === null) L.push('3을 안 돌렸다.', '')
  else {
    L.push(`- 굽기 전 배포본 \`${box(d.before)}\` → 기다린 것 \`${box(d.want)}\``)
    L.push(`- 도착: ${d.arrived === true ? '왔다' : '**안 왔다 — ⑯은 이 판에서 미측정이다**'}`)
    L.push(`- verify:deploy 종료 ${box(d.verify)}`, '')
  }

  L.push('## 다음 사람에게', '')
  L.push('- 여덟 절 보고서 `REPORT.md`를 이 파일의 수치로 채운다.')
  L.push('- `phase` 읽는 자리 전수는 `PHASE_READERS.md`다 (지시서 §7).')
  L.push('- 봉투 사본은 `' + `envelopes${suffix}/` + '`에 있다. `.audit`의 원본은 다시 돌면 덮인다.')
  L.push('')
  return write(AUTO, `${L.join('\n')}\n`)
}

// ── 순서 ────────────────────────────────────────────────────────────────────

const state = {
  startedAt: iso(Date.now()), head: null, headBranch: null,
  headAtSweep: null, liveBefore: null,
  sweep: [], deploy: null, load: { journey: null, e2e: null },
}

const bad = only.filter((s) => !STEPS.includes(s))
if (bad.length > 0) {
  console.error(`모르는 걸음: ${bad.join(',')} — 쓸 수 있는 것은 ${STEPS.join(',')}`)
  process.exit(2)
}

mkdirSync(LOGS, { recursive: true })
state.head = (await git(['rev-parse', '--short', 'HEAD'])).out
state.headBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out
console.log(`새벽 창 — ${state.startedAt}`)
console.log(`  HEAD ${state.head} (${state.headBranch}) · 배포 ${SITE}`)
console.log(`  ${DRY ? '**dry-run — push 자리를 건너뛴다**' : '진짜 판이다 — push는 한 번이다'}`)
console.log(`  적는 자리 ${LOGS}`)
state.liveBefore = await liveAsset()
console.log(`  지금 올라가 있는 것 ${String(state.liveBefore.asset ?? state.liveBefore.why)}`)

/**
 * 1이 **돌았고 섰는가.** 둘 다여야 민다.
 *
 * ⚠️ **「안 돌렸다」를 「괜찮다」로 접지 않는다.** `--only=2`처럼 1을 거른 판에서
 * 기본값이 참이면 **검사 없이 배포가 나간다** — 건너뛴 것은 미실행이지 통과가
 * 아니다. 그래서 「돌린 사실」과 「선 사실」을 따로 든다
 */
let ran1 = false
let ok1 = false
if (wants('1')) { ran1 = true; ok1 = await step1() }
else console.log('1을 걸렀다 — push 앞의 관문이 없다')

let pushed = false
if (wants('2')) {
  if (!ran1 || !ok1) {
    // ⚠️ **여기가 유일한 분기다** (지시서 §8 1번). 안 선 트리를 안 올린다
    console.log('\n1이 안 섰다 — push를 안 하고 멈춘다')
    note({ name: '02-push', label: '2 · ff-merge와 push', code: null,
      why: ran1 ? '1(check·build)이 안 서서 안 밀었다'
        : '1을 안 돌려서 안 밀었다 — 미실행은 통과가 아니다', started: iso(Date.now()),
      ended: iso(Date.now()), ms: 0, log: null })
  } else pushed = await step2()
}

/** 1을 걸렀으면 3~6은 「연습」으로만 돈다 — `--only`가 있을 때만 열린다 */
const goOn = (ran1 && ok1) || only.length > 0

if (wants('3') && goOn) state.deploy = await step3(pushed)

/**
 * ⚠️ **훑기 전에 나무가 그 나무인지 다시 본다.**
 *
 * 2가 반쯤 될 수 있다 — `checkout master`는 됐는데 `merge --ff-only`가 떨어지면
 * **HEAD가 배포본보다 뒤인 master**에 서 있다. 거기서 다섯 묶음을 돌면 봉투는
 * 멀쩡한 꼴로 나오는데 잰 것은 **다른 나무**다. 그것이 완료 조건 ①의 「같은
 * 다이제스트」를 조용히 거짓으로 만든다 — 그러느니 안 재는 편이 낫다
 */
const nowHead = (await git(['rev-parse', '--short', 'HEAD'])).out
state.headAtSweep = nowHead
const sameTree = nowHead === state.head
if (!sameTree) {
  note({ name: '04-tree', label: '4 · 나무 확인', code: 1,
    why: `HEAD가 ${String(state.head)}에서 ${String(nowHead)}로 바뀌었다 — 훑기를 안 돈다`,
    started: iso(Date.now()), ended: iso(Date.now()), ms: 0, log: null })
}

if (wants('4') && sameTree && goOn) state.sweep = await step4()
if (wants('5') && goOn) await step5()
if (wants('6') && goOn) await step6()

// fps는 봉투에서 줍는다 — 사본이 있으면 사본이 정본이다 (다시 돈 판이 뒤다)
for (const [key, into] of [['journey', 'journey'], ['installed-e2e', 'e2e']]) {
  for (const as of [`${key}-2.json`, `${key}.json`]) {
    const at = resolve(ENVS, as)
    if (!existsSync(at)) continue
    const e = readEnvelope(at)
    if (e.ok && e.load !== null) { state.load[into] = e.load; break }
  }
}

const at = step7(state)
console.log(`\n적었다 — ${at}`)
// ⚠️ **종료 코드로 판정하지 않는다.** 이 스크립트가 끝까지 갔는가만 말한다 —
// 무엇이 떨어졌는지는 `AUTO.md`와 각 봉투가 적는다
process.exit(0)
