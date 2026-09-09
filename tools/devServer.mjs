// 개발 서버 하나를 띄운다 — `shot.mjs`와 `story.mjs`가 같이 쓴다.
//
// ⚠️ **개발 서버는 배포가 아니다.** `public/` 전체를 그대로 내주므로 여기서
// 재는 것은 배포 경계가 아니라 **앱 동작**이다 (DEPLOY.md §2). 경계는
// `tools/e2e/run.mjs`가 `dist/`를 정본 CSP 헤더로 띄워서 잰다.
import { spawn } from 'node:child_process'
import { createServer, connect as netConnect } from 'node:net'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/** 비어 있는 자리 하나. 못 박으면 앞선 실행이 남긴 vite와 부딪친다 */
export async function freePort() {
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
/**
 * @param port  들을 자리
 * @param cache 미리 묶은 의존성을 둘 자리.
 *
 * ⚠️ **자리를 따로 잡는다.** 기본 `node_modules/.vite`를 `pnpm dev`나 다른
 * 하네스와 나눠 쓰면, 한쪽이 다시 묶을 때마다 **상대 페이지가
 * `504 Outdated Optimize Dep`으로 죽는다** — 실측으로 하네스가 빈 화면 앞에서
 * 2분을 서 있었고 범인은 옆에서 돌던 개발 서버였다.
 *
 * ⚠️ **자리 이름에 포트를 넣지 않는다.** 넣으면 실행마다 새 자리라 매번 처음부터
 * 다시 묶는다 (실측 5분). 하네스 둘을 동시에 돌릴 때만 이름을 갈라 준다
 */
export async function startVite(port, cache = 'node_modules/.vite-harness') {
  const child = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_CACHE_DIR: cache } })
  // ⚠️ 출력에서 주소를 긁지 않는다 — vite가 포트에 굵게 표시하는 색 코드를 끼워
  // 넣어서 `localhost:5199`가 통째로 안 잡힌다. 포트는 우리가 정했으니 **열렸는지만**
  // 두드려 본다
  let log = ''
  child.stdout.on('data', (b) => { log += b })
  child.stderr.on('data', (b) => { log += b })
  let dead = null
  child.on('exit', (code) => { dead = code })
  // ⚠️ **`exit`만 들으면 안 뜬 것을 못 본다.** spawn 자체가 실패하면(`ENOENT` 등)
  // `exit`가 아니라 `error`가 온다 — 그때 `dead`가 계속 null이라 **없는 서버를
  // 10분 꽉 채워 기다렸다.** 프로세스 목록에 vite가 아예 없는데 로그에는
  // "아직 답이 없다"만 찍히던 자리다
  child.on('error', (e) => { dead = `spawn 실패: ${e.message}` })

  // ⚠️ 127.0.0.1이 아니라 localhost다 — 윈도우에서 vite가 ::1에만 붙는다
  const url = `http://localhost:${String(port)}`
  const started = Date.now()

  /**
   * ① **듣기 시작했는가.** 이건 싸다 — 연결만 열어 본다.
   *
   * 여기서 HTTP를 쓰지 않는 이유가 아래 ②다.
   *
   * ⚠️ **`127.0.0.1`이 아니라 `localhost`다.** 윈도우에서 vite는 `[::1]`에만
   * 붙는다 — IPv4로 두드리면 서버가 멀쩡히 답하고 있는데도 **영영 연결이
   * 안 된다.** 실측으로 이 자리에 IPv4를 적었다가 10분을 통째로 태웠고,
   * 그동안 그 vite는 `localhost`로 0.08초에 200을 주고 있었다. 바로 위 `url`
   * 주석이 경고하던 그 함정이다
   */
  const accepting = () => new Promise((ok) => {
    const s = netConnect({ port, host: 'localhost' })
    const done = (v) => { s.destroy(); ok(v) }
    s.once('connect', () => { done(true) })
    s.once('error', () => { done(false) })
    setTimeout(() => { done(false) }, 2_000)
  })

  /**
   * ⚠️ **죽으면서 제가 띄운 것을 데려간다.** 여기서 그냥 던지면 spawn된 vite가
   * **주인 없이 남는다** — 실측으로 한 판에서 30분을 떠 있었고, 그동안 1코어를
   * 먹은 채 다음 검사의 기준선을 흐렸다. `withDev`의 `finally`는 `startVite`가
   * 값을 **돌려준 뒤에만** 돌므로 여기를 못 덮는다
   */
  const give = (why) => {
    child.kill()
    return new Error(`${why}
${log}`)
  }

  const until = Date.now() + 600_000
  for (;;) {
    if (dead !== null) throw give(`vite가 죽었다 (${String(dead)})`)
    if (await accepting()) break
    if (Date.now() > until) throw give(`vite(${String(port)})가 10분 안에 안 떴다`)
    await new Promise((ok) => setTimeout(ok, 400))
  }

  /**
   * ② **첫 요청 하나를 끊지 않고 기다린다.**
   *
   * ⚠️ **여기가 "개발 서버가 안 뜬다"의 진짜 자리였다.** vite는 뜨자마자
   * 앱 모듈 그래프를 미리 변환하고(`preTransformRequests`), 이 프로젝트에서는
   * 그것이 **실측 168초**다 (`.audit/probe/viteFirst.mjs`: ready 6.2초 · `/` 응답
   * 174.3초 · 그 요청 하나가 168.1초). 그동안 첫 요청은 붙잡혀 있다.
   *
   * 예전에는 두드릴 때마다 30초에 끊고 다시 두드렸다. 그렇게도 결국 뜨기는
   * 했지만(실측 e2e 한 판이 ⑫⑬⑭㉙까지 전부 PASS), 끊긴 요청마다 vite가 그
   * 일을 다시 잡는 값이 붙고 로그에는 "아직 답이 없다"만 남아 **멀쩡한
   * 기다림과 진짜 고장이 같은 모양**이 됐다.
   *
   * 그래서 **한 번만 걸고 기다린다.** 남은 예산을 통째로 그 요청에 주고,
   * 준비되면 몇 초 걸렸는지 적는다 — 그 숫자가 있어야 다음 사람이 "느린 것"과
   * "안 뜬 것"을 안 헷갈린다
   */
  const left = Math.max(30_000, until - Date.now())
  if (Date.now() - started > 20_000) {
    console.log(`  개발 서버(${port}) 첫 요청을 기다린다 — 모듈 그래프를 미리 변환하는 동안이다 (실측 ~170초)`)
  }
  /**
   * ⚠️ **기다리는 동안 죽었는지도 같이 본다.** 요청만 붙들고 있으면 vite가
   * 그 사이에 죽어도 남은 예산(최대 10분)을 다 태운 뒤에야 알게 된다. 죽은
   * 것과 느린 것은 다른 병이고, 죽은 쪽은 기다릴 이유가 없다.
   *
   * 곁들여 본 것: 포트를 **연결은 받지만 답은 안 하는** 소켓이 잡고 있으면
   * `accepting()`이 통과해 버리고 첫 요청이 305초를 끈다 (실측). 하네스는
   * `freePort()`로 빈 자리를 잡으므로 그 자리는 안 생긴다
   */
  const watch = { timer: null }
  const died = new Promise((_, no) => {
    watch.timer = setInterval(() => { if (dead !== null) no(new Error(`vite가 죽었다 (${String(dead)})`)) }, 250)
  })
  try {
    const r = await Promise.race([fetch(url, { signal: AbortSignal.timeout(left) }), died])
    if (!r.ok) throw new Error(`첫 요청이 ${String(r.status)}`)
  } catch (e) {
    if (dead !== null) throw give(`vite가 죽었다 (${String(dead)})`)
    throw give(`vite(${String(port)})가 첫 요청에 안 답했다 — ${String(e.message ?? e)}`)
  } finally {
    if (watch.timer) clearInterval(watch.timer)
  }
  console.log(`  개발 서버(${port}) 준비됐다 — ${((Date.now() - started) / 1000).toFixed(0)}초`)

  return { child, url }
}
