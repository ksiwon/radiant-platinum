// 휴대용 세이브 코덱 (PLAN §9.3 · IMPORT.md §10)
//
// ⚠️ **`JSON.stringify(SaveData)`를 그냥 부르면 안 된다.** 도감·플래그·변수가
// TypedArray고, JSON을 거치면 `{"0":1,"1":0,…}`인 **평범한 객체**가 된다. 그러면
// `field[i >> 3] & (1 << (i & 7))`이 `undefined & …`로 조용히 0이 되고, 도감이
// 통째로 비어 보인다. IndexedDB의 structured clone은 이 문제가 없어서 지금까지
// 안 드러났을 뿐이다 — 파일로 나가는 순간 반드시 터진다.
//
// 그래서 봉투 코덱을 명시한다: TypedArray를 `{$ta, $b}`로 바꿔 base64로 싣고,
// 읽을 때 같은 종류로 되돌린다. **코덱 이름을 파일에 적어 두는 것**이 핵심이다 —
// 나중에 코덱을 바꿔도 옛 파일을 어느 규칙으로 읽어야 하는지 알 수 있다.

/** 봉투의 `codec` 값. 바꾸면 옛 파일을 못 읽으므로 새 이름을 쓴다 */
export const CODEC = 'json+base64-typed-arrays'

/** 실을 수 있는 배열 종류. 세이브가 실제로 쓰는 둘 + 여유 */
const KINDS = {
  u8: Uint8Array, u16: Uint16Array, u32: Uint32Array,
  i8: Int8Array, i16: Int16Array, i32: Int32Array,
} as const

type Kind = keyof typeof KINDS

interface Packed { $ta: Kind; $b: string }

function kindOf(v: object): Kind | null {
  for (const [name, ctor] of Object.entries(KINDS)) {
    if (v instanceof ctor) return name as Kind
  }
  return null
}

// ── base64 ───────────────────────────────────────────────────────────────────
//
// ⚠️ **`String.fromCharCode(...bytes)`로 한 번에 못 편다.** 인자를 스택에 쌓는
// 호출이라 배열이 길면 `RangeError: Maximum call stack size exceeded`로 죽는다.
// 지금 제일 긴 것이 플래그 514바이트라 안 걸리지만, 박스가 든 세이브의 다른
// 배열이 커지는 날 **파일 저장에서** 터진다. 조각내서 잇는다

const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// ── 인코딩 ───────────────────────────────────────────────────────────────────

function pack(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const kind = kindOf(value)
  if (kind !== null) {
    const view = value as ArrayBufferView
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    return { $ta: kind, $b: bytesToBase64(bytes) } satisfies Packed
  }
  if (Array.isArray(value)) return value.map(pack)
  // ⚠️ 우리 세이브에는 Map·Set·Date가 없다. 있으면 조용히 `{}`가 되는 것이
  // 아니라 여기서 **드러나야** 하므로, 평범한 객체가 아닌 것은 세운다
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`코덱이 모르는 종류다: ${(value as object).constructor.name}`)
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = pack(v)
  return out
}

function isPacked(v: object): v is Packed {
  return '$ta' in v && '$b' in v && typeof (v as Packed).$b === 'string'
}

function unpack(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(unpack)
  if (isPacked(value)) {
    const ctor = KINDS[value.$ta]
    if (!ctor) throw new Error(`코덱이 모르는 배열 종류다: ${String(value.$ta)}`)
    const bytes = base64ToBytes(value.$b)
    // ⚠️ `new Uint16Array(bytes.buffer)`는 **정렬을 요구하지 않지만** 길이가 홀수
    // 바이트면 던진다. 손상 파일에서 실제로 나오는 모양이라 여기서 잡아 둔다
    if (bytes.byteLength % ctor.BYTES_PER_ELEMENT !== 0) {
      throw new Error(`${value.$ta} 길이가 안 맞는다: ${String(bytes.byteLength)}바이트`)
    }
    return new ctor(bytes.buffer)
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = unpack(v)
  return out
}

/** 세이브 → 문자열. 이것이 봉투의 `payload`이자 체크섬의 대상이다 */
export function encodePayload(save: unknown): string {
  return JSON.stringify(pack(save))
}

/** 문자열 → 세이브 모양. **스키마 검증은 여기서 안 한다** (`save/schema`) */
export function decodePayload(payload: string): unknown {
  return unpack(JSON.parse(payload))
}

// ── 체크섬 ───────────────────────────────────────────────────────────────────

/**
 * FNV-1a 32비트.
 *
 * ⚠️ **보안 서명이 아니다.** 디스크·전송 중에 바이트가 뒤집힌 것을 찾는 장치다.
 * 서명으로 쓰려면 키가 있어야 하는데 클라이언트에만 있는 키는 서명이 아니다 —
 * 그래서 애초에 그런 주장을 안 한다 (COPYRIGHT.md §7)
 */
export function checksum(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    // UTF-16 코드 유닛을 바이트 둘로 나눠 먹인다. 한글 이름이 들어간 세이브에서
    // 상위 바이트를 버리면 이름만 바뀐 손상을 못 잡는다
    h = Math.imul(h ^ (c & 0xff), 0x01000193)
    h = Math.imul(h ^ (c >>> 8), 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
