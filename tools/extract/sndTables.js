// 소리 드라이버의 표를 롬에서 뽑는다 (DATA.md §2.18)
//
// 포락선 표는 디컴프에 없다 — Nitro SDK가 ARM7에 넣어 주는 코드라 디컴프는
// `NNS_Snd*`를 부르기만 한다. **기억으로 적으면 안 된다.**
//
// 자리는 바이트열로 찾았다. 어택표 18바이트가 우연히 맞을 수는 없다:
//   `tools/spike/adsr-hunt.js` → ARM7+0xeb20 · 데시벨표 ARM7+0xe90c/0xea0c
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT, sources } = require('./rom')

/** ARM7 정적 바이너리 안에서 표가 앉은 자리 */
const AT = { sin: 0xe8e8, dbSquare: 0xe90c, db: 0xea0c, attack: 0xeb20 }
/** 사인표는 사분주기 33칸(0~127) — 아래에서 닫힌 식과 대조한다 */
const SIN_COUNT = 33
/** 데시벨표는 128칸, 어택표는 19칸이다 — 아래에서 근거를 다시 잰다 */
const DB_COUNT = 128
const ATTACK_COUNT = 19

function main() {
  const rom = fs.readFileSync(sources.requirePlatinumRom('en'))
  const arm7 = rom.subarray(rom.readUInt32LE(0x30), rom.readUInt32LE(0x30) + rom.readUInt32LE(0x3c))

  const s16 = (at, n) => Array.from({ length: n }, (_, i) => arm7.readInt16LE(at + i * 2))
  const dbSquare = s16(AT.dbSquare, DB_COUNT)
  const db = s16(AT.db, DB_COUNT)
  const attack = Array.from({ length: ATTACK_COUNT }, (_, i) => arm7[AT.attack + i])
  const sin = Array.from({ length: SIN_COUNT }, (_, i) => arm7.readInt8(AT.sin + i))

  // ── 뽑은 것이 맞는지 여기서 잰다 ──
  //
  // 표가 **닫힌 식과 정확히 같다.** 0.1dB 단위로 `round(200·log10(진폭))`이고
  // 제곱표는 진폭이 `(x/127)²`, 그냥 표는 `x/127`이다. x=1,2는 바닥(-723)에
  // 눌린 자리라 뺀다
  const check = (table, amp, name) => {
    let bad = 0
    for (let x = 3; x < 128; x++) {
      if (Math.round(200 * Math.log10(amp(x))) !== table[x]) bad++
    }
    console.log(`${name}: 3~127칸 중 식과 어긋남 ${bad}`)
    if (bad > 0) throw new Error(`${name}이 식과 안 맞는다 — 자리를 잘못 짚었다`)
  }
  // 사인표도 닫힌 식과 대조한다. 33칸이 33칸 다 `round(127·sin(i/32·π/2))`이고,
  // **데시벨제곱표 바로 앞(0xe8e8 + 33 = 0xe909, 3바이트 뒤가 0xe90c)**에 앉아
  // 있다 — 이미 확정된 표와 붙어 있는 것이 자리를 짚었다는 두 번째 근거다
  {
    let bad = 0
    for (let i = 0; i < SIN_COUNT; i++) {
      if (Math.round(127 * Math.sin((i / 32) * Math.PI / 2)) !== sin[i]) bad++
    }
    console.log(`사인표: 33칸 중 식과 어긋남 ${bad}`)
    if (bad > 0) throw new Error('사인표가 식과 안 맞는다 — 자리를 잘못 짚었다')
    if (AT.sin + SIN_COUNT > AT.dbSquare) throw new Error('사인표가 데시벨표와 겹친다')
  }
  check(dbSquare, (x) => (x / 127) ** 2, '데시벨제곱표')
  check(db, (x) => x / 127, '데시벨표')

  // 어택표는 19칸이라는 것 자체가 근거다. `a < 109 ? 255-a : 표[127-a]`라면
  // 127-109 = 18까지 쓰므로 19칸이 필요하고, 이음매(a=108→147, a=109→143)가
  // 매끄러워야 한다. 20칸째가 이어지지 않는 것도 함께 본다
  const next = arm7[AT.attack + ATTACK_COUNT]
  const joins = attack[ATTACK_COUNT - 1] < 255 - 108 && attack[ATTACK_COUNT - 1] > 255 - 118
  const monotone = attack.every((v, i) => i === 0 || v > attack[i - 1])
  console.log(`어택표: 19칸 단조증가 ${monotone} · 255-a와 이음매 매끄러움 ${joins}` +
    ` (a=109→${attack[18]}, a=108→${255 - 108}) · 20칸째 ${next} (이어지지 않는다)`)
  if (!monotone || !joins || next > attack[ATTACK_COUNT - 1]) {
    throw new Error('어택표 길이나 이음매가 안 맞는다')
  }

  const list = (a) => a.join(', ').replace(/(.{92,108}?), /g, '$1,\n  ')
  const src = `// 소리 드라이버 표 — 롬에서 뽑은 것이다 (DATA.md §2.18)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm extract:sndTables\`가 ARM7 정적 바이너리에서
// 다시 뽑고, 뽑으면서 표가 닫힌 식과 맞는지 확인한다.
//
// 포락선 표는 디컴프에 없다 — Nitro SDK가 ARM7에 넣는 코드라 디컴프는 \`NNS_Snd*\`를
// 부르기만 한다. 자리는 바이트열로 찾았고(어택표 18바이트), 값이 맞는지는 아래
// 두 표가 **0.1dB 단위 \`round(200·log10 진폭)\`과 한 칸도 안 어긋나는 것**으로 안다.

/** 진폭이 \`(x/127)²\`인 볼륨 손잡이. 세기·볼륨·표현이 전부 이것을 지난다 */
export const DECIBEL_SQUARE: readonly number[] = [
  ${list(dbSquare)},
]

/** 진폭이 \`x/127\`인 손잡이 */
export const DECIBEL: readonly number[] = [
  ${list(db)},
]

/**
 * 어택 세기 \`a\`가 109 이상일 때 쓰는 19칸. \`표[127 - a]\`로 꺼낸다.
 *
 * 19칸인 것이 곧 문턱이 109라는 근거다 — 127-109 = 18이 마지막 색인이고,
 * a=109에서 143, a=108에서 \`255-108 = 147\`이라 이음매가 매끄럽다
 */
export const ATTACK_RATE: readonly number[] = [
  ${list(attack)},
]

/** 볼륨 손잡이의 바닥. 이보다 낮으면 무음이다 */
export const DECIBEL_FLOOR = -723

/**
 * 비브라토가 쓰는 사인 사분주기 33칸 (\`SNDi_SinIdxTable\`).
 *
 * 값이 \`round(127·sin(i/32·π/2))\`과 33칸 다 같다. 자리(ARM7+0xe8e8)는
 * **데시벨제곱표 바로 앞**이라 이미 확정된 표가 이웃으로 붙들어 준다
 */
export const SIN_QUARTER: readonly number[] = [
  ${list(sin)},
]

/**
 * 한 주기(0~0x7f)의 사인. ARM7 0x23841f8을 그대로 옮긴 것이다:
 *
 *     x < 0x20 → T[x]        x < 0x40 → T[0x40 - x]
 *     x < 0x60 → -T[x - 0x40]  그 밖 → -T[0x80 - x]
 */
export function sinIdx(x: number): number {
  if (x < 0x20) return SIN_QUARTER[x]
  if (x < 0x40) return SIN_QUARTER[0x40 - x]
  if (x < 0x60) return -SIN_QUARTER[x - 0x40]
  return -SIN_QUARTER[0x80 - x]
}
`
  const out = path.join(ROOT, 'src/engine/audio/tables.ts')
  fs.writeFileSync(out, src, 'utf8')
  console.log(`→ ${path.relative(ROOT, out).replace(/\\/g, '/')}`)
}

main()
