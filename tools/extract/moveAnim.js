// 기술 연출 대본 (PARITY §7.3) — `res/moves/<이름>/anim.s`
//
// 원작은 기술마다 **전용 애니메이션 대본**을 들고 있다. 468개 12,514줄이고,
// 배경을 무슨 색으로 몇 단계 물들이는지 · 누구를 얼마나 흔드는지 · 입자를
// 어디에 붙이는지 · 쓴 쪽이 달려 나가는지 · 몇 프레임짜리인지가 다 적혀 있다.
//
// ⚠️ **한때 이것을 기술 번호 산술로 대신했다.** `(id*7)%11` 같은 식으로
// 크기·회전을 흔들어 「471개가 서로 다르다」고 했지만, 서로 다른 것과 **맞는
// 것**은 다르다. 불꽃세례가 붉게 물드는 것도, 번개가 까맣게 죽었다 터지는
// 것도 그 산술에는 없다. 여기서 진짜 값을 읽는다.
//
// ⚠️ **입자 알갱이(.spa)는 안 읽는다.** 그건 롬 안의 그림 자원이라 우리가
// 그리는 도형과 짝이 안 맞는다. 대본이 정한 **색·박자·자리·힘**만 가져오고,
// 그 위에 무엇을 그릴지는 화면 쪽(`scene/battle/MoveVfx`)이 정한다.
'use strict'
const fs = require('fs')
const path = require('path')
const { writeJson } = require('./rom')
const sources = require('../raw/sources.cjs')

const DECOMP = sources.requireDir('references.decomp')
const MOVES_DIR = path.join(DECOMP, 'res/moves')
const MOVES_ENUM = path.join(DECOMP, 'generated/moves.txt')
const ANIM_H = path.join(DECOMP, 'include/constants/battle/battle_anim.h')

/** 표의 끝. 기술이 아니라서 `MOVE_` 접두어도 안 붙는다 */
const SENTINEL = 'MAX_MOVES'

// ── 상수 표 ──────────────────────────────────────────────────────────────────

/**
 * `BATTLE_COLOR_*` → 0~255 RGB.
 *
 * 헤더가 BGR555 값 옆에 `// RGB(r, g, b)`를 0~31로 적어 둔다. 그 주석을 읽는다 —
 * 16비트 값을 우리가 다시 푸는 것보다 원문이 말한 것을 그대로 쓰는 편이 낫다
 */
function readColors() {
  const text = fs.readFileSync(ANIM_H, 'utf8')
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

function main() {
  const colors = readColors()
  const names = fs.readFileSync(MOVES_ENUM, 'utf8').split(/\r?\n/).filter(Boolean)
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

  // 실측 요약. 「뽑았다」가 아니라 무엇이 몇 개인지를 남긴다
  const has = (k) => moves.filter((m) => m !== null && m[k] !== null && m[k] !== false).length
  const report = {
    기술: moves.length,
    배경물들임: has('flash'),
    몸물들임: has('tint'),
    흔들림: has('shake'),
    화면흔들림: has('camera'),
    달려나감: has('lunge'),
    포물선: has('arc'),
    공전: has('orbit'),
    눌림: has('squash'),
    직선: moves.filter((m) => m?.straight).length,
    흑백: moves.filter((m) => m?.gray).length,
    사라짐: moves.filter((m) => m?.vanish).length,
    입자붙임: moves.reduce((n, m) => n + (m?.emitters.length ?? 0), 0),
    색가짓수: new Set(moves.filter((m) => m?.flash).map((m) => m.flash.color.join(','))).size,
  }
  const { rel, kb } = writeJson('moveAnim.json', { moves })
  console.log(`${rel} ${kb}KB`)
  for (const [k, v] of Object.entries(report)) console.log(`  ${k} ${v}`)
}

main()
