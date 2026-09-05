// `.spa` 안의 텍스처를 그릴 수 있는 것으로 만든다.
//
// ⚠️ **푸는 법을 여기 다시 안 적는다.** 입자 텍스처도 맵 텍스처와 똑같은 GX
// 일곱 형식이라 `import/platinum/nitrotex`의 `decodeFlat`을 그대로 부른다 —
// 롬 실측으로 형식이 셋뿐이지만(A3I5 1 · 팔레트 4색 2 · A5I3 6), 형식 표를 두
// 군데 적으면 한쪽만 고쳐져 갈린다.
//
// ⚠️ **되풀이와 뒤집기가 두 층이다.** 텍스처가 스스로 갖는 것(`repeatS`·`flipS`,
// GX의 감싸기 방식)과 리소스가 거는 것(`textureTileCountS`·`flipTextureS`, UV를
// 몇 배로 늘리고 부호를 뒤집는가)은 다른 것이다 — 감싸기는 여기서, UV는
// 그리는 쪽에서 건다 (`scene/battle/splParticles`).
import {
  ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter,
  MirroredRepeatWrapping, RepeatWrapping, SRGBColorSpace, type Texture, type Wrapping,
} from 'three'
import { decodeFlat } from '../../../import/platinum/nitrotex'
import type { SplTexture } from './resource'

/** GX의 감싸기 셋 — 안 되풀이하면 가장자리를 늘리고, 뒤집기는 거울 되풀이다 */
const wrap = (repeat: boolean, flip: boolean): Wrapping =>
  !repeat ? ClampToEdgeWrapping : flip ? MirroredRepeatWrapping : RepeatWrapping

/**
 * 텍스처 하나를 RGBA로 편다.
 *
 * @param tex `readSpa`가 읽은 것. `data`와 `palette`는 파일 바이트를 가리키는
 *   조각이라 여기서 새로 자르지 않는다
 */
function splTextureRgba(tex: SplTexture): Uint8Array {
  const data = new DataView(tex.data.buffer, tex.data.byteOffset, tex.data.byteLength)
  const pal = new DataView(tex.palette.buffer, tex.palette.byteOffset, tex.palette.byteLength)
  // `.spa`는 같은 비트를 `palColor0`이라 부른다 — 뜻은 같다 (팔레트 0번이 투명한가)
  return decodeFlat({ ...tex, color0: tex.palColor0 }, data, 0, pal, 0)
}

/**
 * 그릴 수 있는 텍스처로 만든다.
 *
 * ⚠️ **`LinearFilter`다.** 저장소의 다른 곳(타일·도트 그림)은 `NearestFilter`로
 * 4세대의 또렷함을 지키지만, 입자는 32×32짜리 **번지는 얼룩**이라 사정이 반대다 —
 * 원작은 그것을 256×192 화면에 뿌렸고 우리는 같은 얼룩을 열 배 넓은 화면에
 * 올린다. 여기서 보간을 끄면 불꽃 하나가 눈에 보이는 네모 격자가 된다
 */
export function splTexture(tex: SplTexture): Texture {
  const out = new DataTexture(splTextureRgba(tex), tex.width, tex.height)
  out.colorSpace = SRGBColorSpace
  out.wrapS = wrap(tex.repeatS, tex.flipS)
  out.wrapT = wrap(tex.repeatT, tex.flipT)
  out.magFilter = LinearFilter
  out.minFilter = LinearMipmapLinearFilter
  out.generateMipmaps = true
  out.needsUpdate = true
  return out
}
