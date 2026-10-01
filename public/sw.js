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
//
// ⚠️ **판 이름은 빌드가 박는다.** 아래 한 줄을 `vite.config.ts`의 `appShellOnly`가
// 그 빌드의 `BUILD_ID`로 바꿔 싣는다 — 그래서 배포마다 이 파일의 바이트가 바뀌고,
// 브라우저가 새 워커를 깔고, 셸 캐시가 판마다 따로 선다. 이름이 늘 같던 동안은
// 옛 청크가 한 캐시에 끝없이 쌓였다. 소스에 남은 값은 개발 서버의 것이다 —
// 개발 중에는 워커를 안 켠다(`app/offline.ts`)
const VERSION = 'dev'
const SHELL = `shell-${VERSION}`
/** 셸 캐시의 머리. 이것으로 시작하는 캐시만 「앞 판」으로 센다 */
const SHELL_PREFIX = 'shell-'

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
]
// ⚠️ **타이틀 배경과 앱 아이콘은 여기 안 적는다.** 앱이 도는 데 필요한 것만
// 미리 받는다. 배경(`radiant-platinum-intro.webp`, 403KB)이 안 오면
// `titleScreen.css`의 그라디언트가 그대로 보이고 — 화면은 안 비어 있다 —
// 아이콘(254KB)은 **설치를 물어볼 때** 브라우저가 읽는 그림이라 오프라인에서
// 쓸 일이 없다. 아이콘이 이 목록에 있던 동안은 1.2MB짜리였고, 그때는 처음
// 오는 사람마다 화면에 한 번도 안 뜨는 그림을 통째로 받아 갔다

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      // 껍데기 한 조각을 못 받아도 설치는 된다. 오프라인이 안 될 뿐이다
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

/**
 * 활성화할 때 남길 캐시 — 지금 판과 **바로 앞 판 하나.**
 *
 * ⚠️ **앞 판을 바로 지우지 않는다.** 새 워커는 `clients.claim()`으로 열려 있던
 * 탭까지 곧바로 맡는데, 그 탭은 아직 옛 `index.html`이 가리키는 옛 청크 이름을
 * 부른다. 호스트에는 그 이름이 이미 없다 — 앞 판 캐시에 남아 있는 것이 그
 * 탭이 받을 수 있는 유일한 사본이다. 두 판 앞부터는 지운다. 열어 둔 탭이 두
 * 배포를 건너 살아 있는 일은 드물고, 남기면 판마다 수 MB씩 쌓인다.
 *
 * 「바로 앞」은 **만든 차례**로 가른다. `caches.keys()`는 만든 차례로 이름을
 * 준다(Cache Storage의 이름 표가 순서 있는 표다)
 */
function keepOnActivate(names) {
  const older = names.filter((n) => n.startsWith(SHELL_PREFIX) && n !== SHELL)
  const previous = older[older.length - 1]
  return new Set(previous === undefined ? [SHELL] : [SHELL, previous])
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // ⚠️ 옛 판이 만든 런타임 에셋 캐시(`assets-v1`)도 여기서 지워진다. 수백 MB가
      // 주인 없이 남아 사용자의 할당량을 먹고 있을 자리다
      .then((names) => {
        const keep = keepOnActivate(names)
        return Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)))
      })
      .then(() => self.clients.claim()),
  )
})

/**
 * 해시 붙은 빌드 청크인가 — `/assets/*.js`·`/assets/*.css`.
 *
 * ⚠️ **확장자로 가른다.** 같은 폴더에 이름이 안 변하는 셸 그림 넷이 같이 산다
 * (`public/_headers`가 `immutable`을 확장자로 가른 것과 같은 까닭이다). 그림을
 * 캐시 먼저로 주면 그림을 고쳐도 다녀간 사람에게는 옛 그림이 뜬다
 */
function isBuiltChunk(url) {
  return /\/assets\/[^/]+\.(?:js|css)$/.test(url.pathname)
}

/**
 * 받은 것이 정말 스크립트·스타일인가.
 *
 * ⚠️ **`res.ok`만 보면 안 된다.** 호스트는 없는 경로에 SPA 대체로 `index.html`을
 * **200으로** 준다(`wrangler.jsonc`의 `not_found_handling`). 그것을 청크 주소로
 * 캐시에 넣으면 그 이름은 그 뒤로 영영 HTML이다
 */
function isCode(res) {
  const type = res.headers.get('content-type') ?? ''
  return res.ok && /javascript|ecmascript|text\/css/i.test(type)
}

/** 지금 판 캐시에서 먼저 찾고, 없으면 남은 캐시 전부에서 찾는다 */
function fromShell(req) {
  return caches.open(SHELL)
    .then((c) => c.match(req))
    .then((hit) => hit ?? caches.match(req))
}

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
          // 오류 쪽지를 껍데기로 담으면 오프라인에서 그 쪽지가 뜬다
          if (res.ok) {
            const copy = res.clone()
            void caches.open(SHELL).then((c) => c.put('./index.html', copy))
          }
          return res
        })
        // ⚠️ **지금 판의 껍데기가 먼저다.** 앞 판 캐시에도 `index.html`이 있고
        // `caches.match`는 만든 차례로 찾으므로, 그냥 찾으면 옛 판이 뜬다
        .catch(() => fromShell('./index.html').then((hit) => hit ?? Response.error())),
    )
    return
  }

  // 해시 붙은 청크는 **캐시가 먼저다.** 이름에 내용의 해시가 있으니 같은 이름이면
  // 같은 바이트다(`public/_headers`가 1년 `immutable`을 거는 까닭과 같다).
  //
  // ⚠️ **네트워크가 먼저이던 동안은 캐시에 든 옛 청크가 한 번도 안 쓰였다.** 배포로
  // 옛 이름이 사라지면 호스트는 404나 `index.html`을 주는데, 둘 다 `fetch`를
  // 거부하지 않으므로 `catch`의 캐시 갈래까지 안 갔다. 그래서 못 받은 응답이
  // 오면 캐시를 한 번 더 찾는다 — 그래도 없으면 그 응답을 그대로 넘기고,
  // 화면의 청크 경계가 받는다(`ui/screens/ChunkBoundary.tsx`)
  if (isBuiltChunk(url)) {
    e.respondWith(
      fromShell(req).then((hit) => hit ?? fetch(req)
        .then((res) => {
          if (isCode(res)) {
            const copy = res.clone()
            void caches.open(SHELL).then((c) => c.put(req, copy))
            return res
          }
          return caches.match(req).then((late) => late ?? res)
        })
        .catch(() => caches.match(req).then((late) => late ?? Response.error()))),
    )
    return
  }

  // 나머지(우리가 만든 아이콘, 글꼴)는 네트워크가 먼저고 받은 것을 껍데기에 쌓아
  // 둔다. **여기 원본 유래 파일은 애초에 오지 않는다**
  //
  // 글꼴은 미리 받는 목록(`SHELL_FILES`)에 없다 — 처음 쓸 때 여기로 들어온다.
  // 안 와도 화면은 폴백 글꼴로 서므로 설치를 1MB 무겁게 할 이유가 없다
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
