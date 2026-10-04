// 노이즈 모듈의 장(場) — 값 노이즈 3D.
//
// 유니티는 컬 없는 스칼라 노이즈 셋(축마다)을 쓴다. 정확한 장을 맞출 수는 없고
// (구현이 비공개다) 맞출 이유도 적다 — 이펙트에서 노이즈는 세기 0.1~0.3의 떨림이다.
// 그래서 **싼 값 노이즈**로 대신한다: 격자 꼭짓점 해시 + 다섯 차 부드러운 보간.
// 출력은 [−1, 1]이고, 세 축은 좌표를 멀리 옮겨 서로 다른 값을 쓴다.

function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f)
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  return ((h >>> 0) / 4294967296) * 2 - 1
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/** [−1, 1] 값 노이즈 */
function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = fade(xf), v = fade(yf), w = fade(zf)
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
  const x00 = lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u)
  const x10 = lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u)
  const x01 = lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u)
  const x11 = lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u)
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w)
}

/**
 * 옥타브를 겹친 노이즈 벡터.
 *
 * @param octaves 겹 수 · `mul` 겹마다 세기 배율 · `scale` 겹마다 주파수 배율 (유니티 이름 그대로)
 */
export function noiseVec(
  x: number, y: number, z: number, octaves: number, mul: number, scale: number, out: Float64Array,
): void {
  let ax = 0, ay = 0, az = 0, amp = 1, f = 1, norm = 0
  const n = Math.max(1, Math.min(4, octaves | 0))
  for (let o = 0; o < n; o++) {
    ax += valueNoise3(x * f, y * f, z * f) * amp
    ay += valueNoise3(x * f + 31.7, y * f - 17.3, z * f + 9.1) * amp
    az += valueNoise3(x * f - 23.9, y * f + 41.3, z * f - 5.7) * amp
    norm += amp
    amp *= mul
    f *= scale
  }
  out[0] = ax / norm; out[1] = ay / norm; out[2] = az / norm
}
