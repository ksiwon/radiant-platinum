// 개발 서버 하나를 띄운다 — `shot.mjs`와 `story.mjs`가 같이 쓴다.
//
// ⚠️ **개발 서버는 배포가 아니다.** `public/` 전체를 그대로 내주므로 여기서
// 재는 것은 배포 경계가 아니라 **앱 동작**이다 (DEPLOY.md §2). 경계는
// `tools/e2e/run.mjs`가 `dist/`를 정본 CSP 헤더로 띄워서 잰다.
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
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

  // ⚠️ 127.0.0.1이 아니라 localhost다 — 윈도우에서 vite가 ::1에만 붙는다
  const url = `http://localhost:${String(port)}`
  // ⚠️ **10분이 과해 보여도 그렇지 않다.** vite 둘이 같은 `node_modules/.vite`를
  // 두고 겹쳐 뜨면 의존성 최적화가 처음부터 다시 돌고, 그동안 첫 요청이 통째로
  // 멎는다 — 3분에서 끊었더니 "vite가 안 떴다"로 죽었는데 로그에는 `ready in
  // 46s`가 찍혀 있었다. 서버는 멀쩡했고 끊은 것은 우리 쪽이었다
  const until = Date.now() + 600_000
  const started = Date.now()
  let said = false
  for (;;) {
    if (dead !== null) throw new Error(`vite가 죽었다 (${String(dead)})\n${log}`)
    try {
      // ⚠️ **두드리는 시간이 넉넉해야 한다.** 첫 요청은 vite가 index.html을
      // 변환하면서 답하므로 기계가 바쁘면 몇 초가 걸린다 — 2초에서 끊으면
      // 서버는 멀쩡히 떠 있는데 내내 "안 떴다"로 돌다가 죽는다
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (r.ok) break
    } catch { /* 아직 안 떴다 */ }
    if (!said && Date.now() - started > 60_000) {
      said = true
      console.log(`  개발 서버(${port})가 아직 답이 없다 — 의존성 최적화 중일 수 있다. 기다린다`)
    }
    if (Date.now() > until) throw new Error(`vite(${String(port)})가 10분 안에 안 떴다\n${log}`)
    await new Promise((ok) => setTimeout(ok, 400))
  }
  return { child, url }
}
