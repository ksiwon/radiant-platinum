// 이펙트 자료 받기 — 프리팹 JSON · 그림 · 그림 표 (`public/data/fx/`).
//
// 굽는 쪽은 `import/bdsp/fx.ts` 하나다. 개발판은 HTTP, 설치판은 OPFS지만 여기서는
// 몰라도 된다 — `assets()`가 같은 논리 경로를 푼다.
//
// ⚠️ **그림은 버리지 않는다.** 649장 모두 256px 이하이고 이펙트는 배틀 내내 다시
// 쓴다. 버리는 순간을 잘못 잡으면 아직 그리는 그림을 버린다(`scene/retireTexture`
// 머리말) — 캐시에 두고 Provider를 갈아 끼울 때만 놓는다.
import {
  ClampToEdgeWrapping, MirroredRepeatWrapping, NoColorSpace, RepeatWrapping, SRGBColorSpace,
  TextureLoader, type Texture, type Wrapping,
} from 'three'
import { assets, onProviderSwap, readJson } from '../../../data/providers/assetProvider'
import type { FxPrefab } from '../../../engine/battle/fx/schema'

/** `tex/index.json`의 한 줄 */
interface TexInfo {
  size: [number, number]
  wrap: [string, string]
  srgb: boolean
}

let texIndex: Promise<Record<string, TexInfo>> | null = null
const prefabs = new Map<string, Promise<FxPrefab>>()
const textures = new Map<string, Promise<Texture>>()
const loader = new TextureLoader()

onProviderSwap(() => {
  texIndex = null
  prefabs.clear()
  for (const t of textures.values()) void t.then((x) => { x.dispose() }, () => { /* 이미 실패 */ })
  textures.clear()
})

export function loadFxPrefab(name: string): Promise<FxPrefab> {
  // ⚠️ **파일 이름은 소문자다** (`import/bdsp/fx.ts`가 번들 경로를 소문자로 찾아 쓴다). 시퀀스는 원래 대소문자로
  // 부른다 — `ew416_bulletBody` · `ew063_Blur` 등 일곱. 대소문자를 가리는 배포 서버 · OPFS에서 못 찾았다
  const key = name.toLowerCase()
  let got = prefabs.get(key)
  if (!got) {
    got = readJson(assets(), `data/fx/prefab/${key}.json`) as Promise<FxPrefab>
    got.catch(() => { prefabs.delete(key) })
    prefabs.set(key, got)
  }
  return got
}

function wrapOf(w: string | undefined): Wrapping {
  if (w === 'clamp') return ClampToEdgeWrapping
  // 「한 번 거울」은 three에 없다 — 거울로 대신한다 (0~1 밖을 쓰는 재질이 드물다)
  if (w === 'mirror' || w === 'mirrorOnce') return MirroredRepeatWrapping
  return RepeatWrapping
}

/**
 * 그림 한 장. 감김(clamp/repeat/mirror)과 색 공간은 그림 표를 따른다.
 *
 * ⚠️ **감김이 그림의 일부다.** `fxpt_1_circle005_m`은 원의 4분의 1만 그려 두고
 * 거울 감김 + 타일링 2로 온 원을 만든다 — 감김을 잃으면 점이 한 귀퉁이에 박힌다
 */
export function loadFxTexture(name: string): Promise<Texture> {
  let got = textures.get(name)
  if (!got) {
    texIndex ??= readJson(assets(), 'data/fx/tex/index.json') as Promise<Record<string, TexInfo>>
    const path = `data/fx/tex/${name}.png`
    const provider = assets()
    got = texIndex.then((index) => provider.objectUrl(path).then((url) => new Promise<Texture>((resolve, reject) => {
      const info = index[name]
      loader.load(url, (tex) => {
        provider.releaseObjectUrl(path)
        tex.name = `fx ${name}`
        tex.wrapS = wrapOf(info?.wrap[0])
        tex.wrapT = wrapOf(info?.wrap[1])
        tex.colorSpace = info?.srgb === false ? NoColorSpace : SRGBColorSpace
        tex.needsUpdate = true
        resolve(tex)
      }, undefined, (e: unknown) => {
        provider.releaseObjectUrl(path)
        reject(e instanceof Error ? e : new Error(String(e)))
      })
    })))
    got.catch(() => { textures.delete(name) })
    textures.set(name, got)
  }
  return got
}
