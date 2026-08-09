// 개발판 Provider — 지금 그대로 HTTP로 받는다 (IMPORT.md §7 · §9)
//
// `raw → tools/extract → public/data·models` 경로를 살린다. 전환의 첫 조건이
// **기존 게임의 동작과 시험을 그대로 보존하는 것**이라, 여기서는 아무것도
// 새로 하지 않는다 — 계약만 씌운다.
//
// ⚠️ **프로덕션 배포물에는 그 파일들이 없다.** `dist/`에는 앱 셸만 들어간다
// (`tools/distribution`). 그러니 공개판에서 이 Provider가 서 있으면 전부 404다 —
// 그것이 정상이고, Importer가 끝나면 `OpfsAssetProvider`로 갈아 끼운다.
//
// `objectUrl`은 **이미 있는 주소를 그대로 돌려준다.** Blob으로 한 번 더 받으면
// 같은 바이트가 메모리에 두 벌 남고, 브라우저 캐시도 안 탄다
import { dataUrl, modelUrl } from '../assetBase'
import { AssetMissing, type AssetPath, type AssetProvider } from './assetProvider'

/**
 * 논리 경로 → HTTP 주소.
 *
 * ⚠️ 두 나무만 안다. 다른 접두사를 조용히 앱 셸 아래로 붙이면, 오타 하나가
 * `index.html`을 JSON으로 받아 오는 결과가 된다 — 그 실패는 스키마 오류로
 * 나와서 원인이 안 보인다
 */
export function httpUrlFor(path: AssetPath): string {
  if (path.startsWith('data/')) return dataUrl(path.slice(5))
  if (path.startsWith('models/')) return modelUrl(path.slice(7))
  throw new Error(`논리 경로는 data/ 나 models/ 로 시작해야 한다: ${path}`)
}

export function httpAssetProvider(): AssetProvider {
  const kind = 'dev-http'

  const grab = async (path: AssetPath): Promise<Response> => {
    const res = await fetch(httpUrlFor(path))
    if (!res.ok) throw new AssetMissing(path, `${kind} HTTP ${String(res.status)}`)
    return res
  }

  return {
    kind,

    async exists(path) {
      try {
        // HEAD가 막힌 정적 서버가 있어서 GET으로 물어본다. 개발 서버 한정이라
        // 비용을 따질 자리가 아니다
        const res = await fetch(httpUrlFor(path))
        return res.ok
      } catch { return false }
    },

    async bytes(path) { return (await grab(path)).arrayBuffer() },
    async text(path) { return (await grab(path)).text() },
    async blob(path) { return (await grab(path)).blob() },

    objectUrl(path) { return Promise.resolve(httpUrlFor(path)) },
    releaseObjectUrl() { /* 우리가 만든 주소가 아니다 */ },
  }
}
