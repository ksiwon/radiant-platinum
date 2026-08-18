'use strict'
// 기술 연출 대본 → src/engine/battle/moveAnimTable.ts (PARITY §7.3)
//
//     pnpm gen:moveAnim
//
// 원작은 기술마다 **전용 애니메이션 대본**을 들고 있다 (`res/moves/<이름>/anim.s`,
// 468개 12,514줄). 배경을 무슨 색으로 몇 단계 물들이는지 · 누구를 얼마나
// 흔드는지 · 입자를 어디에 붙이는지 · 쓴 쪽이 달려 나가는지 · 몇 프레임짜리인지가
// 다 적혀 있다.
//
// ⚠️ **왜 소스에 굽는가.** 이 대본은 NARC이 아니라 빌드 때 오버레이 코드로
// 굳는다 — 사용자의 롬 하나로는 못 꺼내므로 브라우저 변환기가 만들 수가 없다.
// 그래서 다른 `gen:*`과 같이 디컴프에서 TS 모듈로 굽는다.
//
// ⚠️ **한때 이것을 기술 번호 산술로 대신했다.** `(id*7)%11` 같은 식으로
// 크기·회전을 흔들어 「471개가 서로 다르다」고 했지만, 서로 다른 것과 **맞는
// 것**은 다르다. 불꽃세례가 붉게 물드는 것도, 번개가 까맣게 죽었다 터지는
// 것도 그 산술에는 없다. 여기서 진짜 값을 읽는다.
//
// ⚠️ **입자 알갱이(.spa)는 안 읽는다.** 그건 롬 안의 그림 자원이라 우리가
// 그리는 도형과 짝이 안 맞는다. 대본이 정한 **색·박자·자리·힘**만 가져오고,
// 그 위에 무엇을 그릴지는 화면 쪽(`scene/battle/MoveVfx`)이 정한다.
//
// ⚠️ **여기 담기는 것은 번호와 수뿐이다.** 기술 이름도 대사도 한 바이트도 안
// 담는다. 담기는 글자는 입자 자원 이름과 우리가 지은 낱말 넷뿐이다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/battle/moveAnimTable.ts')

const MOVES_DIR = path.join(DECOMP, 'res/moves')
const MOVES_ENUM = 'generated/moves.txt'
const ANIM_H = 'include/constants/battle/battle_anim.h'

/** 표의 끝. 기술이 아니라서 `MOVE_` 접두어도 안 붙는다 */
const SENTINEL = 'MAX_MOVES'

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

// ── 상수 표 ──────────────────────────────────────────────────────────────────

/**
 * `BATTLE_COLOR_*` → 0~255 RGB.
 *
 * 헤더가 BGR555 값 옆에 `// RGB(r, g, b)`를 0~31로 적어 둔다. 그 주석을 읽는다 —
 * 16비트 값을 우리가 다시 푸는 것보다 원문이 말한 것을 그대로 쓰는 편이 낫다
 */
function readColors() {
  const text = read(ANIM_H)
  const table = new Map()
  const re = /#define\s+(BATTLE_COLOR_\w+)\s+0x[0-9A-Fa-f]+\s*\/\/\s*RGB\((\d+),\s*(\d+),\s*(\d+)\)/g
  let m
  while ((m = re.exec(text)) !== null) {
    const to8 = (v) => Math.round((Number(v) / 31) * 255)
    table.set(m[1], [to8(m[2]), to8(m[3]), to8(m[4])])
  }
  if (table.size < 20) throw new Error(`BATTLE_COLOR 표가 ${table.size}개뿐이다 — 헤더 배치가 바뀌었다`)
  return table
}

/** 흔들기·물들이기의 대상 상수 → 우리 낱말 */
function whoOf(token) {
  if (/DEFENDER/.test(token)) return 'defender'
  if (/ATTACKER/.test(token)) return 'attacker'
  return 'both'
}

/** 입자를 어디에 붙이는가 (`EMITTER_CB_*`) */
function anchorOf(token) {
  if (/DEFENDER/.test(token)) return 'defender'
  if (/ATTACKER/.test(token)) return 'attacker'
  if (/CENTER|BASED_ON_BATTLERS/.test(token)) return 'center'
  return 'generic'
}

// ── 대본 읽기 ────────────────────────────────────────────────────────────────

/** `a, b, c` 를 토큰으로. 숫자는 숫자로, 이름은 문자열로 */
function argsOf(line) {
  const rest = line.replace(/^\s*\w+\s*/, '').trim()
  if (rest === '') return []
  return rest.split(',').map((a) => {
    const t = a.trim()
    if (/^-?\d+$/.test(t)) return Number(t)
    if (/^0x[0-9A-Fa-f]+$/.test(t)) return Number.parseInt(t, 16)
    return t
  })
}

function parseAnim(text, colors) {
  const out = {
    particle: null,
    flash: null,
    tint: null,
    shake: null,
    camera: null,
    lunge: null,
    arc: null,
    orbit: null,
    squash: null,
    straight: false,
    gray: false,
    emitters: [],
    frames: 0,
    vanish: false,
  }
  /** 지금까지 흐른 프레임. 입자가 언제 붙는지를 여기서 잰다 */
  let clock = 0
  /** `Func_FadeBg`는 되돌리는 짝이 늘 뒤에 온다. 제일 진한 것만 남긴다 */
  let peak = -1

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '')
    const name = /^\s+([A-Za-z_]\w*)/.exec(line)?.[1]
    if (name === undefined) continue
    const a = argsOf(line)

    switch (name) {
      case 'Delay':
        clock += typeof a[0] === 'number' ? a[0] : 0
        break

      case 'LoadParticleResource':
        // 첫 것만. 여러 벌 싣는 기술은 첫 벌이 주된 것이다
        if (out.particle === null && typeof a[1] === 'string') out.particle = a[1]
        break

      case 'Func_FadeBg': {
        // bgType, delay, startAlpha, endAlpha, color
        const alpha = typeof a[3] === 'number' ? a[3] : 0
        const rgb = colors.get(String(a[4]))
        if (rgb !== undefined && alpha > peak) {
          peak = alpha
          out.flash = { color: rgb, alpha }
        }
        break
      }

      case 'Func_FadeBattlerSprite': {
        // battler, fadeStepFrames, endDelay, color, alpha, [holdFrames]
        const rgb = colors.get(String(a[3]))
        const alpha = typeof a[4] === 'number' ? a[4] : 0
        if (rgb !== undefined && out.tint === null) {
          out.tint = { who: whoOf(String(a[0])), color: rgb, alpha }
        }
        break
      }

      case 'Func_Shake': {
        // extentX, extentY, interval, amount, targets
        const cycles = typeof a[3] === 'number' ? a[3] : 0
        // 제일 센 것 하나만 남긴다 — 여러 번 흔드는 기술이 있다
        const power = Math.max(Number(a[0]) || 0, Number(a[1]) || 0) * cycles
        const had = out.shake === null ? -1 : out.shake.power
        if (power > had) {
          out.shake = {
            who: whoOf(String(a[4])),
            x: Number(a[0]) || 0,
            y: Number(a[1]) || 0,
            interval: Number(a[2]) || 1,
            cycles,
            power,
          }
        }
        break
      }

      case 'Func_MoveBattler':
      case 'Func_MoveBattlerX2': {
        // target, dx, dy, frames
        if (out.lunge === null && /ATTACKER/.test(String(a[0]))) {
          out.lunge = {
            dx: Number(a[1]) || 0,
            dy: Number(a[2]) || 0,
            frames: Number(a[3]) || 0,
          }
        }
        break
      }

      case 'Func_MoveEmitterA2BParabolic': {
        // ... startDelay, frames, radius 가 뒤쪽에 온다
        if (out.arc === null) {
          const nums = a.filter((v) => typeof v === 'number')
          out.arc = {
            frames: Number(nums[nums.length - 2]) || 0,
            radius: Number(nums[nums.length - 1]) || 0,
          }
        }
        break
      }

      case 'Func_RevolveEmitter': {
        // sx, ex, sy, ey, rx, ry, frames, mode, particleSystem
        if (out.orbit === null) {
          out.orbit = {
            rx: Number(a[4]) || 0,
            ry: Number(a[5]) || 0,
            frames: Number(a[6]) || 0,
          }
        }
        break
      }

      case 'CreateEmitter':
      case 'CreateEmitterEx': {
        const cb = a.find((v) => typeof v === 'string' && v.startsWith('EMITTER_CB_'))
        out.emitters.push({ at: anchorOf(String(cb ?? '')), at_frame: clock })
        break
      }

      case 'Func_ScaleBattlerSprite': {
        // target, startX, endX, startY, endY, reference, cycles, params
        // 100이 원래 크기다 (`reference`). 눌리거나 부푸는 것이 여기서 나온다
        if (out.squash === null) {
          const ref = Number(a[5]) || 100
          out.squash = {
            who: whoOf(String(a[0])),
            x: (Number(a[2]) || ref) / ref,
            y: (Number(a[4]) || ref) / ref,
          }
        }
        break
      }

      case 'Func_MoveEmitterA2BLinear':
        // 곧게 날아간다. 포물선(`arc`)과 달리 높이가 안 붙는다
        if (out.arc === null) out.straight = true
        break

      case 'Func_SetBgGrayscale':
        if (String(a[0]) === 'TRUE') out.gray = true
        break

      case 'Func_ShakeBg': {
        // extentX, extentY, interval, amount, cycles, [target] — 화면 자체가 흔들린다
        const amount = Number(a[3]) || 0
        const cycles = Math.max(1, Number(a[4]) || 0)
        const power = Math.max(Number(a[0]) || 0, Number(a[1]) || 0) * amount * cycles
        if (out.camera === null || power > out.camera.power) {
          out.camera = {
            x: Number(a[0]) || 0,
            y: Number(a[1]) || 0,
            interval: Number(a[2]) || 1,
            power,
          }
        }
        break
      }

      // ⚠️ 지진·매그니튜드는 전용 함수라 흔들기 명령이 아예 없다. 이걸 안 보면
      // 땅을 흔드는 기술이 화면에서 조용해진다
      case 'Func_Earthquake':
        if (out.camera === null) out.camera = { x: 0, y: 6, interval: 1, power: 96 }
        break

      // ⚠️ 사라지는 것은 `RemovePokemonSprite`가 아니다. 그건 대본이 **더 붙인**
      // 그림을 치우는 것이고, 쓴 쪽이 땅에 숨거나 하늘로 뜨는 것은 이쪽이다
      case 'Func_HideBattler':
        if (String(a[1]) === 'TRUE' && /ATTACKER/.test(String(a[0]))) out.vanish = true
        break

      default:
        break
    }
  }

  out.frames = clock
  return out
}

// ── 내보내기 ─────────────────────────────────────────────────────────────────

function extract() {
  const colors = readColors()
  const names = read(MOVES_ENUM).split(/\r?\n/).filter(Boolean)
  const last = names[names.length - 1]
  if (last !== SENTINEL) throw new Error(`기술 표 끝이 ${last}다 — ${SENTINEL}일 줄 알았다`)

  const moves = []
  let missing = 0
  // 마지막 한 줄은 표의 끝이라 기술이 아니다
  for (let id = 0; id < names.length - 1; id++) {
    const dir = String(names[id]).replace(/^MOVE_/, '').toLowerCase()
    const file = path.join(MOVES_DIR, dir, 'anim.s')
    if (!fs.existsSync(file)) {
      missing++
      moves.push(null)
      continue
    }
    moves.push(parseAnim(fs.readFileSync(file, 'utf8'), colors))
  }
  if (missing > 0) throw new Error(`대본이 없는 기술이 ${missing}개다 — 이름 짝짓기가 깨졌다`)
  return moves
}

function main() {
  const moves = extract()

  // 실측 요약. 「뽑았다」가 아니라 무엇이 몇 개인지를 남긴다
  const has = (k) => moves.filter((m) => m !== null && m[k] !== null && m[k] !== false).length
  const n = {
    moves: moves.length,
    flash: has('flash'),
    tint: has('tint'),
    shake: has('shake'),
    camera: has('camera'),
    lunge: has('lunge'),
    arc: has('arc'),
    orbit: has('orbit'),
    squash: has('squash'),
    straight: moves.filter((m) => m?.straight).length,
    gray: moves.filter((m) => m?.gray).length,
    vanish: moves.filter((m) => m?.vanish).length,
    emitters: moves.reduce((t, m) => t + (m?.emitters.length ?? 0), 0),
    colors: new Set(moves.filter((m) => m?.flash).map((m) => m.flash.color.join(','))).size,
  }

  // ⚠️ **줄마다 `JSON.stringify` 하나다.** 사람이 읽으라고 편 것이 아니라
  // **차례가 곧 기술 번호**여서 한 줄이 한 기술이어야 한다. 예쁘게 펴면 파일이
  // 몇 배가 되고 그만큼이 배틀 청크에 얹힌다
  const rows = moves.map((m) => `  ${JSON.stringify(m)},`).join('\n')

  const out = `// 기술 연출 대본 ${n.moves}개 (PARITY §7.3)
//
// 원작 \`res/moves/<이름>/anim.s\`가 기술마다 배경 색·흔들림·달려 나감·입자 자리를
// 적어 둔 것을 그대로 옮겼다. **색인이 기술 번호**이고, 대본이 없는 자리는 null이다.
//
// ⚠️ **롬에서 못 꺼낸다.** 대본은 빌드 때 오버레이 코드로 굳어서 사용자의 롬
// 하나로는 안 나온다 — 그래서 브라우저 변환기 대신 여기 굽는다.
//
// ⚠️ **정적으로 import 하지 않는다.** 이 파일 하나가 앱 셸 예산(첫 청크 gzip
// 150kB)만 하다. 부르는 자리는 \`loadMoveAnims()\` 하나이고 그것이 배틀에 들어갈
// 때 \`await import\`로 집는다 (\`data/gameData.ts\`).
//
// 실측 — 배경 물들임 ${n.flash}개(색 ${n.colors}가지) · 몸 물들임 ${n.tint} · 흔들림 ${n.shake} ·
// 화면 흔들림 ${n.camera} · 달려 나감 ${n.lunge} · 포물선 ${n.arc} · 공전 ${n.orbit} · 눌림 ${n.squash} ·
// 직선 ${n.straight} · 흑백 ${n.gray} · 사라짐 ${n.vanish} · 입자 붙임 ${n.emitters}
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:moveAnim\`이 디컴프에서 다시 만든다
// (\`tools/extract/moveAnimModule.cjs\`).

/** 0~255 RGB. 헤더가 BGR555 옆에 적어 둔 \`// RGB(r, g, b)\` 주석에서 왔다 */
export type MoveAnimRgb = readonly [number, number, number]

/** 흔들기·물들이기의 대상 */
export type MoveAnimWho = 'attacker' | 'defender' | 'both'

/** 입자를 어디에 붙이는가 (\`EMITTER_CB_*\`) */
export type MoveAnimAnchor = 'attacker' | 'defender' | 'center' | 'generic'

export interface MoveAnim {
  /** 입자 자원 이름. 무엇을 그릴지는 화면이 정하고, 이건 갈래를 가르는 데 쓴다 */
  particle: string | null
  /** 화면 전체가 물드는 색과 진하기(0~16) */
  flash: { color: MoveAnimRgb, alpha: number } | null
  /** 맞는 쪽·쓴 쪽의 몸이 물드는 색 */
  tint: { who: MoveAnimWho, color: MoveAnimRgb, alpha: number } | null
  /** 몸이 떨린다. \`power\`는 진폭×횟수라 세기 비교에 쓴다 */
  shake: {
    who: MoveAnimWho, x: number, y: number,
    interval: number, cycles: number, power: number,
  } | null
  /** 화면(배경)이 통째로 흔들린다 */
  camera: { x: number, y: number, interval: number, power: number } | null
  /** 쓴 쪽이 달려 나간다. 원작 픽셀 단위다 */
  lunge: { dx: number, dy: number, frames: number } | null
  /** 입자가 포물선을 그린다 */
  arc: { frames: number, radius: number } | null
  /** 입자가 상대 둘레를 돈다 */
  orbit: { rx: number, ry: number, frames: number } | null
  /** 몸이 눌리거나 부푼다. 1이 원래 크기다 */
  squash: { who: MoveAnimWho, x: number, y: number } | null
  /** 입자가 곧게 날아간다 */
  straight: boolean
  /** 배경이 흑백이 된다 */
  gray: boolean
  /** 입자를 붙이는 자리와 그 시점(프레임) */
  emitters: { at: MoveAnimAnchor, at_frame: number }[]
  /** 대본이 쉬는 프레임의 합. 연출 길이의 아래끝이다 */
  frames: number
  /** 쓴 쪽이 화면에서 사라진다 (구멍파기·공중날기) */
  vanish: boolean
}

export const MOVE_ANIMS: readonly (MoveAnim | null)[] = [
${rows}
]
`
  fs.writeFileSync(OUT, out, 'utf8')
  console.log(`${path.relative(ROOT, OUT).split(path.sep).join('/')} `
    + `${(Buffer.byteLength(out) / 1024).toFixed(1)}KB`)
  for (const [k, v] of Object.entries(n)) console.log(`  ${k} ${v}`)
}

if (require.main === module) main()
module.exports = { extract, parseAnim, readColors }
