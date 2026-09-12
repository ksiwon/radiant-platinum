// 사람 판때기 그림 하나 — **두 자리가 같은 캐시를 쓴다** (REPAIR §9)
//
// `data/npc/<gfx>.png`를 받아 오는 자리가 `NpcSprites`와 `BerryPatchProps` 둘로
// 갈려 있었다. 메모리 문제는 아니었다 — gfx 대역이 갈려 있어(열매는
// `BERRY_GFX_SPROUT` 4096부터, 사람은 그 아래) 같은 PNG를 두 번 올릴 일이 없다.
// **어긋날 위험**이 문제다: 한쪽에 색공간이나 필터를 붙이면 다른 쪽은 안 따라온다.
import { NearestFilter, SRGBColorSpace, Texture, TextureLoader } from 'three'
import { assets, onProviderSwap } from '../data/providers/assetProvider'

const loader = new TextureLoader()
const textures = new Map<number, Texture>()

// 갈아 끼우면 사람 그림은 옛 설치본 것이다. 표를 비워 다시 받게 한다.
//
// ⚠️ **버리지 않는다 (`dispose()`를 안 부른다).** 갈아 끼우는 순간에도 아직
// 제출 중인 프레임이 있어서, 버리면 그 프레임이 없는 텍스처를 제출한다 —
// `Destroyed texture [Texture (unlabeled 32x32 px, …)] used in a submit`.
// 사람 판때기 356장 중 196장이 정확히 32×32고, 이 자리가 그 크기를 만드는
// 유일한 자리다(`disguise.png` 64×16 · `emote.png` 32×16은 아니다).
// 같은 꼴의 캐시 `battle/monSprite` · `battle/monModel`도 `clear()`만 한다.
//
// 값: 안 버리면 옛 텍스처는 GC가 놓을 때까지 GPU에 남는다. 갈아 끼우기는
// 설치 흐름에서 한 판에 한 번이라 그 값이 깨진 프레임보다 싸다.
onProviderSwap(() => { textures.clear() })

/**
 * 그 그림 번호의 텍스처.
 *
 * ⚠️ **빈 텍스처를 먼저 돌려주고 주소가 오면 채운다.** 부르는 자리가 매 프레임
 * 도는 곳이라 비동기로 바꿀 수 없다 — 대신 그림이 늦게 오면 `needsUpdate`로
 * 한 번 더 올린다.
 *
 * ⚠️ **다 읽으면 주소를 놓는다.** 그림은 이 표가 들고 있고 Blob 원본은 더 안
 * 쓴다. 사람이 470종이라 붙들면 그만큼 남는다
 */
export function npcTexture(gfx: number): Texture {
  const had = textures.get(gfx)
  if (had !== undefined) return had
  const tex = new Texture()
  // 이름은 **GPU 라벨로 그대로 간다** — three가 `texture.name`을 쓴다
  // (`WebGPUTextureUtils`). 안 붙이면 드라이버 오류가 `unlabeled`라고만 말해서
  // 임자를 못 짚는다 (REPAIR §48)
  tex.name = `npc ${String(gfx)}`
  const path = `data/npc/${String(gfx)}.png`
  const provider = assets()
  void provider.objectUrl(path)
    .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
    .then((loaded) => {
      tex.image = loaded.image as Texture['image']
      tex.needsUpdate = true
    })
    .catch(() => { /* 그림이 없으면 빈 판으로 선다 */ })
  // 도트를 뭉개지 않는다. 원작이 16텍셀 격자라 보간하면 윤곽이 흐려진다
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = SRGBColorSpace
  textures.set(gfx, tex)
  return tex
}
