// 서비스 워커 — 껐다 켜도, 인터넷이 없어도 돌게 한다 (PLAN §4.6)
//
// ⚠️ **에셋을 미리 다 받으면 안 된다.** 롬에서 나온 것이 571MB고 그중 포켓몬
// 모델만 423MB다 (`assets-manifest.json`). 설치할 때 그걸 다 끌어오면 브라우저가
// 저장 한도에 부딪히고, 무엇보다 처음 여는 데 몇 분이 걸린다.
//
// 그래서 둘로 나눈다:
//
//   **껍데기**(HTML·JS·CSS·아이콘)  설치할 때 받아 둔다. 이게 있어야 오프라인에서
//                                   화면이라도 뜬다
//   **에셋**(`data/`·`models/`)      쓴 것만 남긴다. 한 번 걸어 본 길은 다음부터
//                                   캐시에서 나오고, 못 받으면 캐시로 떨어진다
//
// ⚠️ **세이브는 여기 없다.** 리포트는 IndexedDB에 있고(`state/saveStore`) 캐시가
// 비워져도 남는다 — 반대로 캐시를 세이브 대용으로 쓰면 브라우저가 조용히 지운다.
const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`

/**
 * 설치할 때 받아 두는 것.
 *
 * 빌드된 js·css는 이름에 해시가 붙어서 여기 적을 수가 없다 — 그건 처음 열 때
 * 런타임 캐시에 들어간다. 여기 적는 것은 **이름이 안 변하는 것**뿐이다
 */
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/radiant-platinum-favicon.png',
  './assets/radiant-platinum-icon.png',
]

/** 이 아래 것은 쓴 것만 남긴다. 통째로는 571MB다 */
const RUNTIME = /\/(data|models|assets)\//

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      // 껍데기 한 조각을 못 받아도 설치는 된다. 오프라인이 안 될 뿐이다
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== SHELL && n !== ASSETS).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 남의 오리진은 안 건드린다. 에셋이 R2로 갈라져도 그쪽은 그쪽 캐시를 쓴다
  if (url.origin !== self.location.origin) return

  // ⚠️ **화면 이동은 네트워크가 먼저다.** 캐시를 먼저 주면 새로 배포한 판이
  // 안 뜬다. 못 받았을 때만 캐시에서 껍데기를 내준다
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          void caches.open(SHELL).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? Response.error())),
    )
    return
  }

  // 에셋은 **캐시가 먼저다.** 롬에서 나온 것은 바뀌지 않고, 청크 하나가 100KB라
  // 매번 물어보면 걸을 때마다 왕복이 생긴다
  if (RUNTIME.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          void caches.open(ASSETS).then((c) => c.put(req, copy))
        }
        return res
      })),
    )
    return
  }

  // 나머지(해시 붙은 js·css)는 네트워크가 먼저고 받은 것을 껍데기에 쌓아 둔다
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          void caches.open(SHELL).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit ?? Response.error())),
  )
})
