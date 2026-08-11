// 서비스 워커 — **앱 셸만** 캐시한다 (COPYRIGHT.md §6 · IMPORT.md §8)
//
// ⚠️ **예전에는 `/data`·`/models`를 런타임 캐시했다.** 그때는 공개 서버가 롬에서
// 나온 것을 직접 서빙하는 구조였다. 지금은 아니다 — 공개 서버는 HTML·JS·CSS와
// 우리가 만든 아이콘만 준다. 변환 에셋은 사용자의 브라우저가 자기 OPFS에 만든다.
//
// 그러면 여기서 그걸 또 캐시할 이유가 없다. 두 곳에 두면 두 가지가 나빠진다:
//
//   · 같은 수 GB를 Cache Storage와 OPFS에 이중으로 들고, 할당량을 두 배로 먹는다
//   · 어느 쪽이 최신인지 아무도 모르게 된다 — 설치 저널은 OPFS에만 있다
//
// ⚠️ **세이브는 여기 없다.** 리포트는 IndexedDB에 있고(`state/report.ts`) 캐시가
// 비워져도 남는다. 반대로 캐시를 세이브 대용으로 쓰면 브라우저가 조용히 지운다.
const VERSION = 'v2'
const SHELL = `shell-${VERSION}`

/**
 * 설치할 때 받아 두는 것.
 *
 * 빌드된 js·css는 이름에 해시가 붙어서 여기 적을 수가 없다 — 그건 처음 열 때
 * 런타임에 셸 캐시로 들어간다. 여기 적는 것은 **이름이 안 변하는 것**뿐이다
 */
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/radiant-platinum-favicon.svg',
  './assets/radiant-platinum-favicon.png',
  './assets/radiant-platinum-icon.png',
]
// ⚠️ 타이틀 배경(`radiant-platinum-intro.png`, 2.3MB)은 **여기 안 적는다.**
// 설치할 때 받는 것이 셋에서 넷으로 늘면서 3.6MB가 된다. 오프라인에서 그림이
// 안 오면 `titleScreen.css`의 그라디언트가 그대로 보인다 — 화면은 안 비어 있다

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
      // ⚠️ 옛 판이 만든 런타임 에셋 캐시(`assets-v1`)도 여기서 지워진다. 수백 MB가
      // 주인 없이 남아 사용자의 할당량을 먹고 있을 자리다
      .then((names) => Promise.all(names.filter((n) => n !== SHELL).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 남의 오리진은 안 건드린다. 애초에 붙을 곳이 없어야 맞다 (CSP connect-src 'self')
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

  // 나머지(해시 붙은 js·css, 우리가 만든 아이콘)는 네트워크가 먼저고 받은 것을
  // 껍데기에 쌓아 둔다. **여기 원본 유래 파일은 애초에 오지 않는다**
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
