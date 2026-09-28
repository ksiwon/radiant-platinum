// 박스 벽지 암호 (`overlay006/wallpaper_passwords.c` · 축복TV 3층)
//
// 낱말 넷이 트레이너 ID(아래 16비트)와 벽지 번호를 싣는다. 낱말은 **암호 낱말표**(`pms_aikotoba.narc`의
// `word_bank`)의 자리로 바뀌고, 이웃한 두 자리의 차(표 길이로 돈다)가 한 바이트씩이다 — 넷이 32비트다.
// 그 32비트를 오른쪽으로 5 돌리고, 넷째 바이트로 앞 셋을 가린 뒤 다시 넷째의 아래 4비트만큼 앞 24비트를
// 돌린다. 풀린 첫 바이트의 위 4비트가 6이고, 둘째 · 셋째를 첫째로 가린 것이 트레이너 ID이고, 넷째가
// `(첫째 + 둘째) × 셋째`의 아래 바이트면 맞는 암호다. 벽지는 첫 바이트의 아래 4비트(0~7)다.
//
// ⚠️ **낱말표는 로케일마다 다르다** — 한국판은 `resource/kor/pms_aikotoba`다. 같은 암호가 롬마다 다른 낱말이다.

/** 여덟까지 풀린다 (`MAX_UNLOCKABLE_WALLPAPERS`) */
export const UNLOCKABLE_WALLPAPERS = 8

/** 큰 끝 비트열 `bytes`를 오른쪽으로 `n` 돌린다 (`RotateBits`) */
function rotateRight(bytes: number[], n: number): void {
  const len = bytes.length
  for (let k = 0; k < n; k++) {
    const bit = bytes[len - 1]! & 1
    for (let i = len - 1; i > 0; i--) bytes[i] = ((bytes[i]! >> 1) | ((bytes[i - 1]! & 1) << 7)) & 0xff
    bytes[0] = ((bytes[0]! >> 1) | (bit << 7)) & 0xff
  }
}

/** `rotateRight`의 거꾸로 */
function rotateLeft(bytes: number[], n: number): void {
  const len = bytes.length
  for (let k = 0; k < n; k++) {
    const bit = (bytes[0]! >> 7) & 1
    for (let i = 0; i < len - 1; i++) bytes[i] = ((bytes[i]! << 1) | (bytes[i + 1]! >> 7)) & 0xff
    bytes[len - 1] = ((bytes[len - 1]! << 1) | bit) & 0xff
  }
}

/**
 * 암호를 푼다 (`CheckPassword`). 맞으면 벽지 번호 0~7, 아니면 −1.
 * @param bank 암호 낱말표 — 낱말 번호의 차례
 * @param trainerId 트레이너 ID의 아래 16비트 (`TrainerInfo_ID_LowHalf`)
 */
export function checkWallpaperPassword(
  bank: readonly number[], trainerId: number, words: readonly [number, number, number, number],
): number {
  const at = words.map((w) => bank.indexOf(w))
  const bits: number[] = []
  for (let i = 0; i < 4; i++) {
    if (at[i]! < 0) return -1
    if (i === 0) {
      if (at[0]! > 0xff) return -1
      bits.push(at[0]!)
      continue
    }
    const diff = at[i]! >= at[i - 1]! ? at[i]! - at[i - 1]! : bank.length - (at[i - 1]! - at[i]!)
    if (diff > 0xff) return -1
    bits.push(diff)
  }
  rotateRight(bits, 5)
  const mask = (bits[3]! >> 4) | (bits[3]! & 0xf0)
  for (let i = 0; i < 3; i++) bits[i] = bits[i]! ^ mask
  const front = bits.slice(0, 3)
  rotateRight(front, bits[3]! & 0xf)
  const [b0, b1raw, b2raw] = front as [number, number, number]
  if ((b0 & 0xf) >= UNLOCKABLE_WALLPAPERS) return -1
  const b1 = b1raw ^ b0, b2 = b2raw ^ b0
  const ok = ((b1 << 8) | b2) === (trainerId & 0xffff) && (b0 & 0xf0) >> 4 === 6
    && bits[3] === (((b0 + b1) * b2) & 0xff)
  return ok ? b0 & 0xf : -1
}

/**
 * 거꾸로 — 그 ID · 그 벽지의 암호 낱말 넷. 풀이의 단계를 하나씩 되감는다. 낱말표가 짧아 자리가 안 나오면 null
 * (시험이 풀이를 되짚는 데 쓴다)
 */
export function wallpaperPasswordFor(
  bank: readonly number[], trainerId: number, wallpaper: number,
): [number, number, number, number] | null {
  const hi = (trainerId >> 8) & 0xff, lo = trainerId & 0xff
  const b0 = 0x60 | (wallpaper & 0xf)
  const b3 = ((b0 + hi) * lo) & 0xff
  const front = [b0, hi ^ b0, lo ^ b0]
  rotateLeft(front, b3 & 0xf)
  const mask = (b3 >> 4) | (b3 & 0xf0)
  const bits = [...front.map((b) => b ^ mask), b3]
  rotateLeft(bits, 5)
  const at: number[] = [bits[0]!]
  for (let i = 1; i < 4; i++) at.push((at[i - 1]! + bits[i]!) % bank.length)
  if (at.some((a) => a >= bank.length)) return null
  return at.map((a) => bank[a]!) as [number, number, number, number]
}
