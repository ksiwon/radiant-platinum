// 아무것도 없는 Provider (IMPORT.md §7 · §13-3)
//
// ⚠️ **공개판에 설치본이 없을 때 HTTP로 되돌아가면 안 된다.** 기본 Provider가
// `httpAssetProvider()`라, 설치 화면이 떠 있는 동안 어느 코드 한 줄이라도
// 자료를 물으면 `/data/…`·`/models/…`로 요청이 나간다. 공개 서버에는 그런
// 것이 없으므로 404 무더기가 되고 — 그 404 목록이 곧 **우리가 무엇을 굽는지
// 적은 목록**이라 서버 로그에 남는다.
//
// 그래서 그 자리에 이것을 꽂는다. 물으면 즉시 없다고 답한다. 네트워크를
// 아예 안 건드리는 것이 요점이다.
import { AssetMissing, type AssetPath, type AssetProvider } from './assetProvider'

export function absentAssetProvider(reason = '아직 설치되지 않았습니다'): AssetProvider {
  const kind = 'absent'
  const nope = <T>(path: AssetPath): Promise<T> =>
    Promise.reject(new AssetMissing(path, `${kind}: ${reason}`))
  return {
    kind,
    exists: () => Promise.resolve(false),
    bytes: nope,
    text: nope,
    blob: nope,
    objectUrl: nope,
    releaseObjectUrl: () => { /* 잡은 것이 없다 */ },
  }
}
