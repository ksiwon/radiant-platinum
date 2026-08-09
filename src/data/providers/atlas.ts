// 세션 내내 살아 있는 그림 — 아틀라스 (IMPORT.md §7)
//
// 도구 아이콘 468칸, 포켓몬 아이콘, 박스 벽지, 간판 그림. 전부 **한 장**이고
// 게임이 켜져 있는 동안 계속 쓰인다. CSS `background-image`가 소비자라 주소가
// 꼭 필요하다.
//
// ⚠️ **여기만 참조를 안 놓는다.** 화면이 열릴 때마다 잡고 닫힐 때마다 놓으면
// 목록을 스크롤하는 동안 Blob을 만들고 거두기를 반복하게 되고, 그 사이에
// 브라우저가 그림을 다시 디코드한다. 세션 하나에 몇 장뿐이라 붙들고 있는 편이
// 맞다 — Provider를 갈아 끼울 때 `unpinAll()`이 한 번에 거둔다.
//
// 순수 함수(`itemIcon` 등)가 주소를 **동기로** 물어볼 수 있어야 해서 캐시가
// 모듈에 있다. 아직 안 왔으면 빈 글자를 주고, 그 자리는 그림 없는 칸이 된다 —
// 아틀라스 **크기 자료**도 같은 비동기 파도로 오므로 화면 쪽은 이미 그 상태를
// 다룰 줄 안다.
import { assets, type AssetPath } from './assetProvider'

const pinned = new Map<AssetPath, string>()
const asking = new Map<AssetPath, Promise<string>>()

/**
 * 그림을 잡아 둔다. 이미 잡았으면 그대로 준다.
 *
 * 아틀라스의 **크기 자료를 받는 로더가 함께 부른다** (`data/gameData.ts`) —
 * `itemIcons.json`과 `itemIcons.png`는 한 짝이고, 따로 두면 한쪽만 온 상태가
 * 화면에 남는다.
 *
 * ⚠️ **같은 경로에는 늘 같은 약속을 준다.** 이미 받아 둔 값을
 * `Promise.resolve(값)`으로 감싸 주면 렌더마다 **새 약속**이 나오고,
 * `use()`가 그것을 "캐시되지 않은 약속"으로 보고 화면을 계속 서스펜드한다 —
 * 실제로 그렇게 나왔다:
 *
 *     error: A component was suspended by an uncached promise.
 */
export function pinAtlas(path: AssetPath): Promise<string> {
  let hit = asking.get(path)
  if (!hit) {
    hit = assets().objectUrl(path).then((url) => { pinned.set(path, url); return url })
    hit.catch(() => { asking.delete(path) }) // 실패를 캐시하면 재시도가 막힌다
    asking.set(path, hit)
  }
  return hit
}

/** 잡아 둔 주소. 아직이면 빈 글자 — 그 자리는 그림 없는 칸이 된다 */
export function atlasUrl(path: AssetPath): string {
  return pinned.get(path) ?? ''
}

/** Provider를 갈아 끼울 때. 남은 주소를 전부 거둔다 */
export function unpinAll(): void {
  const provider = assets()
  for (const path of pinned.keys()) provider.releaseObjectUrl(path)
  pinned.clear()
  asking.clear()
}
