// 포켓몬 배틀 그림 (DATA.md §2.17)
//
// 4세대 배틀은 3D가 아니다. 무대와 카메라만 3D고 포켓몬은 **80×80 도트 한 장**이다.
// 원작 그림을 그대로 세운다 — 여기서 3D 모델을 지어내면 원작이 아니라 다른 게임이
// 된다. 도감 그림과 배틀 그림이 같아야 하는 이유이기도 하다.
//
// 그림이 도트라 **확대 보간을 끈다**(`NearestFilter`). 켜면 흐려져서 4세대 화풍이
// 통째로 사라진다.
//
// 크기는 종마다 다르다. 잉어킹과 딱구리를 같은 크기로 세울 수 없으므로, 추출 때
// 잰 **실제로 칠해진 상자**(`index.json`의 `x/y/w/h`)로 발밑을 맞추고 키를 잰다.
import {
  ClampToEdgeWrapping, NearestFilter, SRGBColorSpace, TextureLoader, type Texture,
} from 'three'
import { assets, onProviderSwap, readJson } from '../../data/providers/assetProvider'

/** 그림에서 실제로 칠해진 자리. 이것이 없으면 발밑이 안 맞는다 */
export interface SpriteBox { x: number; y: number; w: number; h: number }
export interface SpriteIndex {
  /** 한 컷의 변 (픽셀). 80이다 */
  size: number
  sprites: Record<string, { front?: SpriteBox; back?: SpriteBox }>
}

let index: Promise<SpriteIndex> | null = null

export function loadSpriteIndex(): Promise<SpriteIndex> {
  index ??= readJson(assets(), 'data/pokemon/index.json') as Promise<SpriteIndex>
  return index
}

const loader = new TextureLoader()
const textures = new Map<string, Promise<Texture>>()

// 갈아 끼우면 캐시는 옛 설치본의 그림이다 — 종족 번호는 같아도 바이트가 다르다
onProviderSwap(() => { textures.clear(); index = null })

/**
 * 한 종족의 앞모습 또는 뒷모습.
 *
 * 같은 종을 여럿 데리고 있어도 그림은 한 벌이면 되므로 캐시한다 — 배틀마다 다시
 * 받으면 등판할 때마다 한 프레임씩 끊긴다.
 *
 * ⚠️ **`id`는 종 번호가 아니라 그림 이름이다** (`engine/pokemon/form.spriteKey`).
 * 폼이 있으면 `479-2`고 알은 `494`다 — 번호로 받으면 폼이 통째로 사라진다
 */
export function loadMonSprite(id: string, back: boolean): Promise<Texture> {
  const key = `${id}/${back ? 'back' : 'front'}`
  let got = textures.get(key)
  if (!got) {
    // ⚠️ **로더가 다 읽으면 주소를 바로 놓는다.** 파싱된 `Texture`는 Blob과
    // 따로 사는 GPU 자원이라, 주소를 붙들어 봐야 얻는 것이 없고 원본 바이트만
    // 문서 수명 내내 남는다. 성공·실패 양쪽에서 놓는다
    const path = `data/pokemon/${key.replace('/', '_')}.png`
    const provider = assets()
    got = provider.objectUrl(path).then((url) => new Promise<Texture>((resolve, reject) => {
      const done = <T,>(fn: (v: T) => void) => (v: T) => { provider.releaseObjectUrl(path); fn(v) }
      loader.load(
        url,
        done((tex: Texture) => {
          // 도트는 보간하면 안 된다. 밉맵도 안 만든다 — 한 장을 화면에 크게
          // 띄우는 것이라 축소가 없다
          tex.magFilter = NearestFilter
          tex.minFilter = NearestFilter
          tex.generateMipmaps = false
          tex.wrapS = ClampToEdgeWrapping
          tex.wrapT = ClampToEdgeWrapping
          tex.colorSpace = SRGBColorSpace
          resolve(tex)
        }),
        undefined,
        done((e: unknown) => {
          textures.delete(key)
          reject(e instanceof Error ? e : new Error(String(e)))
        }),
      )
    }))
    got.catch(() => { textures.delete(key) })
    textures.set(key, got)
  }
  return got
}

/**
 * 그림을 세울 크기와 높이 (월드 단위).
 *
 * 판은 80×80 전체를 쓴다 — 상자만 잘라 쓰면 종마다 UV를 따로 만들어야 하고,
 * 판 하나로 두는 편이 싸다. 대신 **칠해진 자리의 아래끝이 발판에 오도록** 올린다.
 *
 * 판 한 변을 `tall`로 고정하면 종마다 크기 차이가 원작 그대로 남는다. 원작 그림은
 * 80×80 안에서 종마다 다르게 차지한다 — 딱구리는 꽉 차고 잉어킹은 구석에 작다.
 * 상자에 맞춰 늘리면 그 차이가 사라져서 전부 같은 덩치가 된다
 */
export function spriteFit(
  box: SpriteBox | undefined, size: number, tall: number,
): { scale: number; lift: number } {
  if (!box) return { scale: tall, lift: tall / 2 }
  // 판 아래끝에서 칠해진 자리 아래끝까지의 거리 (판 좌표)
  const below = ((size - box.y - box.h) / size) * tall
  return { scale: tall, lift: tall / 2 - below }
}
