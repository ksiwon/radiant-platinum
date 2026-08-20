// 공개판 Provider — 브라우저가 자기 안에 만든 것을 읽는다 (IMPORT.md §7)
//
// ⚠️ **Blob URL은 문서가 닫힐 때까지 안 사라진다.** `URL.createObjectURL`이
// 만드는 것은 문자열이 아니라 **그 Blob에 대한 강한 참조**다. 맵을 열 번 오가며
// 청크 텍스처를 열 벌 만들면 열 벌이 다 남는다 (PLAN §14 "Blob URL 누수").
//
// 그래서 경로마다 **참조 수를 센다.** 같은 그림을 두 화면이 함께 쓰는 일이
// 흔하고(포켓몬 아이콘·아이템 아이콘), 한쪽이 닫혔다고 거두면 남은 쪽이 깨진다.
// 마지막 하나가 놓을 때만 revoke한다.
import { AssetMissing, type AssetPath, type AssetProvider } from './assetProvider'
import type { PackStore } from './packStore'

interface Held {
  url: string
  refs: number
}

interface OpfsProviderStats {
  /** 지금 살아 있는 Blob URL 수. soak test가 이걸 본다 */
  liveUrls: number
  refs: Record<string, number>
}

interface OpfsAssetProvider extends AssetProvider {
  stats(): OpfsProviderStats
  /** 화면을 통째로 접을 때. 남은 참조를 무시하고 전부 거둔다 */
  releaseAll(): void
}

/**
 * 거둔 뒤에 도착한 요청.
 *
 * `objectUrl()`이 바이트를 기다리는 동안 `releaseAll()`이 돌면, 기다리던 쪽이
 * 깨어나 **거둬진 다음에** 새 URL을 `held`에 넣는다 — 그러면 아무도 안 쓰는
 * URL이 영원히 남는다. 그 자리를 오류로 만든다
 */
export class ProviderClosed extends Error {
  constructor(readonly path: AssetPath) {
    super(`${path}: 받는 사이에 Provider가 거둬졌다`)
    this.name = 'ProviderClosed'
  }
}

export function opfsAssetProvider(store: PackStore): OpfsAssetProvider {
  const kind = `opfs:${store.kind}`
  const held = new Map<AssetPath, Held>()
  // ⚠️ **`releaseAll()`마다 오른다.** 이 숫자가 없으면 위 경쟁을 못 잡는다 —
  // `held`가 비어 있다는 사실만으로는 "아직 아무도 안 잡았다"와 "방금 다
  // 거뒀다"를 구별할 수 없기 때문이다
  let generation = 0

  const need = async (path: AssetPath): Promise<Uint8Array> => {
    const bytes = await store.read(path)
    if (bytes === null) throw new AssetMissing(path, kind)
    return bytes
  }

  const toBlob = async (path: AssetPath): Promise<Blob> => {
    const bytes = await need(path)
    return new Blob([bytes as unknown as BlobPart], { type: mimeOf(path) })
  }

  return {
    kind,

    exists: (path) => store.has(path),

    async bytes(path) {
      const view = await need(path)
      // ⚠️ 뷰의 `buffer`를 그대로 주면 안 된다. pack 저장소로 바뀌는 날 그
      // 버퍼는 **여러 파일이 함께 쓰는 큰 덩어리**이고, 받은 쪽이 통째로
      // 붙들거나 잘못된 범위를 읽는다. 자기 몫만 잘라 준다
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
    },

    async text(path) { return new TextDecoder().decode(await need(path)) },

    blob: toBlob,

    async objectUrl(path) {
      const hit = held.get(path)
      if (hit) { hit.refs++; return hit.url }
      const mine = generation
      const url = URL.createObjectURL(await toBlob(path))
      // ⚠️ 기다리는 사이에 `releaseAll()`이 돌았으면 이 URL은 주인이 없다.
      // 넣으면 아무도 안 놓는 것이 하나 생긴다
      if (mine !== generation) { URL.revokeObjectURL(url); throw new ProviderClosed(path) }
      // ⚠️ `await` 사이에 다른 호출이 끼어들 수 있다. 그동안 누가 먼저 만들었으면
      // 방금 만든 것을 버려야 한다 — 안 그러면 지도 하나에 URL이 두 벌 남는다
      const raced = held.get(path)
      if (raced) { URL.revokeObjectURL(url); raced.refs++; return raced.url }
      held.set(path, { url, refs: 1 })
      return url
    },

    releaseObjectUrl(path) {
      const hit = held.get(path)
      if (!hit) return
      hit.refs--
      if (hit.refs > 0) return
      URL.revokeObjectURL(hit.url)
      held.delete(path)
    },

    stats: () => ({
      liveUrls: held.size,
      refs: Object.fromEntries([...held].map(([path, h]) => [path, h.refs])),
    }),

    releaseAll() {
      generation++
      for (const h of held.values()) URL.revokeObjectURL(h.url)
      held.clear()
    },
  }
}

/**
 * 확장자 → MIME.
 *
 * ⚠️ **`Image`와 `GLTFLoader`가 이걸 본다.** 빈 타입으로 만든 Blob URL은
 * 브라우저가 종류를 못 정해서 그림이 안 뜨거나 GLB를 텍스트로 읽는다
 */
function mimeOf(path: AssetPath): string {
  const dot = path.lastIndexOf('.')
  switch (dot < 0 ? '' : path.slice(dot).toLowerCase()) {
    case '.json': return 'application/json'
    case '.png': return 'image/png'
    case '.webp': return 'image/webp'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.glb': return 'model/gltf-binary'
    case '.gltf': return 'model/gltf+json'
    case '.ktx2': return 'image/ktx2'
    case '.wav': return 'audio/wav'
    case '.ogg': return 'audio/ogg'
    default: return 'application/octet-stream'
  }
}
