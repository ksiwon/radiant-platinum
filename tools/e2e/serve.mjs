// `dist/`를 **정본 응답 헤더로** 띄우는 시험용 서버 (DEPLOY.md §3)
//
// ⚠️ **이것은 배포 수단이 아니다.** 여기서 헤더가 붙는다고 실제 호스트에서
// 붙는다는 뜻이 아니다 — blocker 2번은 이 서버로 안 풀린다. 이 서버가 재는
// 것은 하나다: **정본 CSP 아래에서 앱이 실제로 도는가.** 정책을 적어 놓고
// 그 아래에서 켜 본 적이 없으면, 첫 배포날 흰 화면을 보게 된다.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { cspHeader, EXTRA_HEADERS } from '../distribution/csp.mjs'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

/**
 * 정적 서버를 연다. `{ url, close() }`를 돌려준다.
 *
 * SPA 폴백을 넣는다 — 없는 경로는 `index.html`이다. 그것이 호스트에 요구하는
 * 조건 둘 중 하나이므로 여기서도 같은 모양이어야 한다
 */
export function serveDist(dist, port = 5199) {
  const root = resolve(dist)
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let rel = decodeURIComponent(url.pathname)
    // 위로 못 올라간다. 시험용이라도 뚫린 서버를 두지 않는다
    const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '')
    let at = join(root, safe)
    if (!existsSync(at) || statSync(at).isDirectory()) {
      at = join(root, 'index.html')
      rel = '/index.html'
    }
    const headers = {
      'Content-Type': TYPES[extname(at)] ?? 'application/octet-stream',
      'Content-Security-Policy': cspHeader(),
      ...EXTRA_HEADERS,
    }
    res.writeHead(200, headers)
    createReadStream(at).pipe(res)
  })
  return new Promise((done) => {
    server.listen(port, '127.0.0.1', () => {
      done({ url: `http://127.0.0.1:${String(port)}`, close: () => { server.close() } })
    })
  })
}
