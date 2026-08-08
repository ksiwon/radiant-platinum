// 에셋 주소를 만드는 단 한 군데 (COPYRIGHT.md §6)
//
// ⚠️ **앱 셸과 에셋은 곧 오리진이 갈린다.** 지금은 둘 다 `import.meta.env.BASE_URL`
// 아래에 있어서 구별할 이유가 없지만, 셸을 Pages·에셋을 R2에 두는 순간
// `${BASE_URL}data/…`는 전부 404가 된다. 그때 고칠 곳이 스무 군데면 하나는 반드시
// 빠뜨린다 — 그래서 갈리기 **전에** 모은다.
//
// 그 밖에서 `import.meta.env.BASE_URL`을 쓰는 것은 lint가 막는다. 안 막으면
// 화면 하나 붙일 때마다 도로 는다 (`eslint.config.js`의 `BASE_URL_FORBIDDEN`).

/**
 * 앱 셸의 뿌리. **에셋이 아니다.**
 *
 * 페이지 자체의 주소라 CDN으로 안 옮겨 간다 — `location.assign`처럼 앱으로
 * 되돌아가는 데만 쓴다. 파일을 받을 때 이걸 쓰면 오리진이 갈리는 날 깨진다
 */
export const APP_ROOT = import.meta.env.BASE_URL

/**
 * 실제로 쓸 에셋 뿌리를 고른다.
 *
 * `VITE_ASSET_BASE`가 있으면 그쪽, 없으면 앱 셸과 같은 자리다. 기본값이 앱 셸인
 * 덕에 개발·현재 배포는 설정 없이 그대로 돌고, 버킷을 붙이는 날 환경변수 하나만
 * 넣으면 된다.
 *
 * 함수로 떼어 둔 것은 **시험할 수 있게** 하려는 것이다. 모듈이 읽힐 때 한 번
 * 정해지는 값이라 환경변수를 바꿔 가며 재현할 수가 없다
 */
export function resolveBase(configured: string | undefined, appBase: string): string {
  const picked = configured?.trim() ? configured.trim() : appBase
  // 뒤에 슬래시가 없으면 `…r2.devdata/maps.json`처럼 붙는다. 환경변수는 사람이
  // 손으로 넣는 값이라 이 실수가 반드시 한 번은 난다
  return picked.endsWith('/') ? picked : `${picked}/`
}

/** 롬에서 나온 것들이 놓인 뿌리. 언젠가 R2다 (COPYRIGHT.md §5) */
export const ASSET_BASE = resolveBase(import.meta.env.VITE_ASSET_BASE, APP_ROOT)

/**
 * 에셋 하나의 주소.
 *
 * 앞의 `/`는 떼어 낸다 — 안 떼면 `https://cdn//data/…`가 되고, 오리진에 따라
 * 404가 되거나 캐시가 두 벌로 갈린다
 */
export function assetUrl(path: string): string {
  return ASSET_BASE + path.replace(/^\/+/, '')
}

/** `public/data` 아래의 것 — 추출기가 굽는 롬 유래 자료 전부 */
export function dataUrl(path: string): string {
  return assetUrl(`data/${path}`)
}

/** `public/models` 아래의 것 — glb 모델 */
export function modelUrl(path: string): string {
  return assetUrl(`models/${path}`)
}
