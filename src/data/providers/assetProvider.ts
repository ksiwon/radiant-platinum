// 에셋 접근 계약 (PLAN §4.1 · IMPORT.md §7)
//
// 지금까지 게임은 스무 군데에서 `dataUrl()`·`modelUrl()`로 주소를 만들어
// `fetch`·CSS·`GLTFLoader`에 그대로 넘겼다. 그 전제는 **에셋이 HTTP로 온다**는
// 것이다. 공개판에서는 안 온다 — 사용자의 브라우저가 자기 OPFS에 만든다.
// OPFS는 공개 주소가 없으므로 주소의 뿌리만 바꿔서는 한 줄도 안 돌아간다.
//
// 그래서 **주소가 아니라 바이트를 주는 계약**으로 바꾼다. 주소가 꼭 필요한
// 소비자(CSS 배경, `Image`, `GLTFLoader`)만 Blob URL을 받고, 그 수명을
// Provider가 센다.
//
// ⚠️ **게임 로직은 어느 Provider인지 몰라야 한다.** 알면 그 분기가 스무 군데로
// 번지고, 개발판에서만 도는 길이 생긴다.

/**
 * 논리 경로.
 *
 * `data/species.json` · `models/pokemon/387.glb`처럼 두 나무 아래의 상대
 * 경로다. 개발판은 이것을 HTTP 주소로, 공개판은 OPFS 파일로 푼다 — **같은
 * 문자열이 양쪽에서 같은 것을 가리켜야 한다**는 것이 parity의 정의다
 */
export type AssetPath = string

export interface AssetProvider {
  /** 진단과 시험용. 어느 길로 왔는지 화면에 적을 때 쓴다 */
  readonly kind: string
  exists(path: AssetPath): Promise<boolean>
  bytes(path: AssetPath): Promise<ArrayBuffer>
  text(path: AssetPath): Promise<string>
  blob(path: AssetPath): Promise<Blob>
  /**
   * 주소가 꼭 필요한 소비자용.
   *
   * ⚠️ **받았으면 돌려줘야 한다.** OPFS 쪽은 Blob URL이라 revoke하지 않으면
   * 그 바이트가 문서 수명 내내 메모리에 남는다. 맵을 열 번 오가면 청크
   * 텍스처가 열 벌 쌓인다 (PLAN §14 "Blob URL 누수")
   */
  objectUrl(path: AssetPath): Promise<string>
  releaseObjectUrl(path: AssetPath): void
}

import { httpAssetProvider } from './httpAssetProvider'

/** JSON은 주소를 거치지 않는다 — Provider에서 바로 읽는다 (IMPORT.md §7) */
export async function readJson(provider: AssetProvider, path: AssetPath): Promise<unknown> {
  return JSON.parse(await provider.text(path))
}

export class AssetMissing extends Error {
  constructor(readonly path: AssetPath, readonly kind: string) {
    super(`${path}이(가) 없다 (${kind})`)
    this.name = 'AssetMissing'
  }
}

let current: AssetProvider | null = null

/**
 * 지금 쓰는 Provider.
 *
 * 기본값은 개발판의 HTTP다 — 지금 게임이 그렇게 돌고 있고 **그 동작을 그대로
 * 보존하는 것이 전환의 첫 조건**이다 (IMPORT.md §13-3). 공개 Importer가 설치를
 * 끝내면 `setAssetProvider`로 갈아 끼운다.
 *
 * ⚠️ 기본값을 "없음"으로 두고 부팅 때 세우게 하면, 세우기 전에 도는 코드가
 * 하나만 있어도 게임이 안 뜬다. 시험 110개 중 상당수가 그 자리다
 */
export function assets(): AssetProvider {
  current ??= httpAssetProvider()
  return current
}

/**
 * 갈아 끼울 때 옛 Provider에 묶인 것을 놓는 쪽.
 *
 * ⚠️ **provider에 묶인 상태를 들고 있는 모듈은 전부 여기 등록해야 한다.**
 * 아틀라스 주소, 파싱된 게임 자료, 로더 캐시가 그렇다. 등록을 빠뜨리면
 * 갈아 끼운 뒤에도 옛 것을 계속 쓰거나, 옛 Provider가 만든 Blob URL을
 * **새 Provider에게 놓아 달라고** 하게 된다 — 그러면 아무 일도 안 일어나고
 * 그 URL은 문서가 닫힐 때까지 남는다
 */
type SwapHook = (leaving: AssetProvider) => void
const swapHooks = new Set<SwapHook>()

/** 모듈이 자기 캐시를 비우는 길을 등록한다. 모듈이 읽히는 순간 부른다 */
export function onProviderSwap(hook: SwapHook): void {
  swapHooks.add(hook)
}

/** `releaseAll()`을 가진 Provider인가 */
function canReleaseAll(p: AssetProvider): p is AssetProvider & { releaseAll(): void } {
  return typeof (p as { releaseAll?: unknown }).releaseAll === 'function'
}

/**
 * 갈아 끼운다. `null`이면 기본(개발 HTTP)으로 돌아간다.
 *
 * ⚠️ **순서가 전부다.** 새 것을 먼저 꽂으면, 옛 것이 만든 주소를 놓아 달라는
 * 요청이 새 것에게 간다. 새 것은 그런 주소를 모르므로 조용히 아무것도 안 하고
 * 옛 Blob들은 문서가 닫힐 때까지 산다. 그래서 **놓기 → 거두기 → 꽂기**다
 */
export function setAssetProvider(provider: AssetProvider | null): void {
  const leaving = current
  if (leaving && leaving !== provider) {
    for (const hook of swapHooks) hook(leaving)
    if (canReleaseAll(leaving)) leaving.releaseAll()
  }
  current = provider
}
