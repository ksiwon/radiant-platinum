// NSBTP(PAT0) — **재질이 쓰는 그림을 시간에 따라 갈아 끼운다** (DATA.md §2.32)
//
// 포켓몬센터 에스컬레이터·치료기·PC 화면, 야도 체육관 단추 셋, 승강기 문이
// 다 이것이다 (소품 112개 중 **31벌**). 관절도 UV도 안 움직이고 **그림만**
// 바뀐다.
//
// ⚠️ **여기 나오는 그림은 우리 시트에 없다.** 우리 시트는 「재질이 쓰는 것」만
// 굽는데(`wantedItems`) PAT0가 부르는 `esca_up1.2`·`r04_b1.2` 같은 것은 어느
// 재질도 안 가리킨다 — 그래서 `convertProps`가 이 목록을 읽어 시트에 같이
// 넣는다. 안 넣으면 갈아 끼울 그림이 없어 첫 칸에 멈춘 것처럼 보인다.
//
// 자리는 공개 문서(`Pattern Animations`) 그대로고 롬으로 확인했다
// (`.audit/matAnim.mjs` — 트랙 이름 31벌이 31벌 다 소품 재질 이름과 맞는다).
import { readDict } from './nsbmd'

/** 이 프레임부터 이 그림을 쓴다 */
interface PatKey {
  readonly frame: number
  readonly texture: string
  readonly palette: string
}

interface PatTrack {
  /** 이 트랙이 거는 재질 이름 */
  readonly material: string
  /** 프레임 오름차순 */
  readonly keys: readonly PatKey[]
}

export interface PatAnim {
  readonly name: string
  readonly frames: number
  readonly tracks: readonly PatTrack[]
}

/** 이름표 열여섯 바이트 */
function name16(bytes: Uint8Array, at: number): string {
  let s = ''
  for (let i = 0; i < 16; i++) {
    const c = bytes[at + i]
    if (c === undefined || c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

/** `BTP0` 하나를 푼다 */
export function readNsbtp(bytes: Uint8Array): PatAnim[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'BTP0') {
    throw new Error('BTP0가 아니다')
  }
  const out: PatAnim[] = []
  const count = view.getUint16(14, true)
  for (let i = 0; i < count; i++) {
    const pat = view.getUint32(16 + i * 4, true)
    if (String.fromCharCode(...bytes.subarray(pat, pat + 4)) !== 'PAT0') continue
    for (const e of readDict(bytes, view, pat + 8)) {
      const at = pat + view.getUint32(e.at, true)
      const texAt = at + view.getUint16(at + 8, true)
      const palAt = at + view.getUint16(at + 10, true)
      const textures = Array.from({ length: view.getUint8(at + 6) },
        (_, k) => name16(bytes, texAt + k * 16))
      const palettes = Array.from({ length: view.getUint8(at + 7) },
        (_, k) => name16(bytes, palAt + k * 16))
      const tracks: PatTrack[] = []
      for (const t of readDict(bytes, view, at + 12)) {
        const keyAt = at + view.getUint16(t.at + 6, true)
        const keys: PatKey[] = []
        for (let k = 0; k < view.getUint32(t.at, true); k++) {
          const p = keyAt + k * 4
          keys.push({
            frame: view.getUint16(p, true),
            texture: textures[view.getUint8(p + 2)] ?? '',
            palette: palettes[view.getUint8(p + 3)] ?? '',
          })
        }
        tracks.push({ material: t.name, keys })
      }
      out.push({ name: e.name, frames: view.getUint16(at + 4, true), tracks })
    }
  }
  return out
}

/**
 * 이 프레임에 쓰는 그림. 키는 **바뀔 때만** 있으므로 직전 키를 물고 있는다
 */
export function patAt(track: PatTrack, frame: number): PatKey | null {
  let hit: PatKey | null = null
  for (const k of track.keys) {
    if (k.frame > frame) break
    hit = k
  }
  return hit ?? track.keys[0] ?? null
}

/** 이 애니가 부르는 (그림, 팔레트) 짝 전부 — 시트에 같이 구우려고 */
export function patTextures(anims: readonly PatAnim[]): [string, string][] {
  const seen = new Map<string, [string, string]>()
  for (const a of anims) {
    for (const t of a.tracks) {
      for (const k of t.keys) seen.set(`${k.texture} ${k.palette}`, [k.texture, k.palette])
    }
  }
  return [...seen.values()]
}
