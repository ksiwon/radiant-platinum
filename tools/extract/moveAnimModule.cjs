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

/**
 * 태스크 하나가 제 일을 마치고 사라지는 데 더 드는 프레임.
 *
 * 원작 태스크는 상태 기계다 — 보간이 끝난 프레임에 `FALSE`를 한 번 받아 상태를
 * 올리고, 그 다음 프레임에 `BattleAnimSystem_EndAnimTask`로 사라진다.
 * `WaitForAnimTasks`는 **사라질 때까지** 서므로 두 프레임이 더 든다
 */
const TASK_TAIL = 2

/** 한 번 흔들 때 좌우로 꺾는 횟수 (`MAX_CYCLES_PER_SHAKE`) */
const SHAKE_FLIPS = 4

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
/**
 * 입자 이름 → NARC 멤버 번호.
 *
 * 대본이 `tackle_spa`라고 쓰면 자료는 `battle_particles.order`의 `tackle.spa`
 * 줄이다 — **줄 번호가 곧 멤버 번호**다. 이 표가 없으면 우리는 이름만 알고
 * 어느 파일인지를 모른다
 */
const PARTICLE_ORDER = 'res/graphics/battle/particles/battle_particles.order'
let particleIndex = null
function particleMember(symbol) {
  if (particleIndex === null) {
    particleIndex = new Map()
    const lines = read(PARTICLE_ORDER).split(String.fromCharCode(10))
    for (const [i, line] of lines.entries()) {
      const name = line.trim()
      if (name === '') continue
      // `tackle.spa` → `tackle_spa` (대본이 쓰는 꼴)
      particleIndex.set(name.replace(/[.]spa$/, '_spa'), i)
    }
  }
  return particleIndex.get(symbol) ?? null
}

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

/**
 * 대본에서 **실제로 도는 한 줄기**만 뽑는다.
 *
 * ⚠️ **파일을 통째로 훑으면 안 된다.** 대본 468개 중 76개가 갈래를 들고 있다 —
 * 머리에서 `JumpIfFriendlyFire L_1` · `JumpIfContest L_2`로 빠지고 같은 연출이
 * 라벨 밑에 한 벌씩 더 적혀 있다. 다 더하면 길이도 입자 자리도 두세 배가 된다:
 * 차지빔이 85프레임 대신 255프레임(세 벌)이고 이미터가 넷 대신 열셋이었다.
 * 실측 66개가 그렇게 부풀어 있었다.
 *
 * 갈래는 두 꼴이고 **다루는 법이 반대다**:
 *
 *   갈림   `JumpIfContest L_2` … 알맹이 … `End`   ← 점프를 **버린다**
 *   분배   … 알맹이 … `JumpIfBattlerSide …, L_1, L_2` `End`  ← **따라간다**
 *
 * 가르는 잣대는 자리다 — `End` 앞의 **마지막 줄**이 점프면 분배기다. 뿔드릴·
 * 눈보라는 머리에 알맹이를 두고 마지막에 분배하고, 대타출동·공중날기는 머리가
 * 분배 한 줄뿐이다. 「첫 `End`에서 자른다」로 하면 뒤엣것이 통째로 사라지고,
 * 「알맹이가 없을 때만 따라간다」로 하면 앞엣것이 이미터를 잃는다.
 *
 * 짝을 겨누는 갈래도 콘테스트도 우리에게는 없다 (PARITY §9) — 첫 줄기가 곧
 * 우리가 그릴 것이다
 */
function mainPath(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, ''))
  /** 라벨 → 그 밑의 줄들 */
  const blocks = new Map()
  let at = null
  for (const line of lines) {
    const label = /^([A-Za-z_]\w*):/.exec(line)?.[1]
    if (label !== undefined) { at = label; blocks.set(label, []); continue }
    if (at !== null && /^\s+\w/.test(line)) blocks.get(at).push(line)
  }
  if (blocks.size === 0) return lines

  const isJump = (l) => /^\s+Jump/.test(l)
  /**
   * 그 점프가 가리키는 라벨.
   *
   * ⚠️ **첫 낱말이 라벨인 것이 아니다** — `JumpIfBattlerSide
   * BATTLER_ROLE_ATTACKER, L_1, L_2`처럼 조건이 앞에 오는 명령이 있다
   */
  const targetOf = (line, from) =>
    (line.match(/[A-Za-z_]\w*/g) ?? []).find((t) => blocks.has(t) && t !== from)

  /** 무언가를 그리는 줄인가. 뒷정리(`WaitFor…`·`Unload…`)는 아니다 */
  const draws = (l) => /^\s+(CreateEmitter|Delay|Func_|SetVar|Move|Add|Play|Switch|Btl)/.test(l)

  const out = []
  let name = [...blocks.keys()][0]
  const seen = new Set()
  for (let hop = 0; hop < 6; hop += 1) {
    if (name === undefined || seen.has(name)) break
    seen.add(name)
    const rows = blocks.get(name) ?? []
    const stop = rows.findIndex((l) => /^\s+End\b/.test(l))
    const body = stop < 0 ? rows : rows.slice(0, stop)
    for (const l of body) if (!isJump(l)) out.push(l)
    // **뒤에 그리는 것이 남아 있으면 갈림이고, 없으면 분배기다.** 깨트리다는
    // 점프 뒤에 뒷정리 두 줄만 두고 갈라지므로 「마지막 줄이 점프인가」로는
    // 못 가른다 — 그 잣대로는 이미터가 통째로 사라졌다
    let dispatch
    body.forEach((l, i) => {
      if (!isJump(l)) return
      if (body.slice(i + 1).some(draws)) return
      dispatch = l
    })
    if (dispatch === undefined) break
    name = targetOf(dispatch, name)
  }
  return out
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
    loads: [],
    emitters: [],
    frames: 0,
    waits: false,
    unknownWait: false,
    vanish: false,
  }
  /** 지금까지 흐른 프레임. 입자가 언제 붙는지를 여기서 잰다 */
  let clock = 0
  /**
   * `WaitForAnimTasks`가 기다리는 태스크들의 남은 길이 (프레임).
   *
   * 대본의 시계는 `Delay`만으로는 안 흐른다 — 몸통박치기는 `Delay`가 하나도
   * 없고 `Func_MoveBattler … 2` · `WaitForAnimTasks` 두 쌍으로만 되어 있다.
   * 그걸 안 세면 그 대본은 「0프레임짜리」가 된다
   */
  let tasks = []
  /** `Func_FadeBg`는 되돌리는 짝이 늘 뒤에 온다. 제일 진한 것만 남긴다 */
  let peak = -1

  for (const line of mainPath(text)) {
    const name = /^\s+([A-Za-z_]\w*)/.exec(line)?.[1]
    if (name === undefined) continue
    const a = argsOf(line)

    switch (name) {
      case 'Delay':
        clock += typeof a[0] === 'number' ? a[0] : 0
        break

      // 시작해 둔 태스크가 다 끝날 때까지 선다. 제일 긴 것 하나가 길이다
      case 'WaitForAnimTasks':
        // ⚠️ **기다릴 것이 없다면 우리가 모르는 태스크를 기다린 것이다.**
        // 기술 열일곱은 `Func_Growth`·`Func_Minimize`처럼 전용 C 태스크 하나로만
        // 되어 있고 그 길이는 저마다 다른 표에 있다 (`script_funcs_0.c`의
        // `sMeditateScaleTable` 따위). 옮기지 않은 것을 0으로 치면 그 기술들이
        // 「길이 0」이 되므로, **모른다는 사실을 남겨** 부르는 쪽이 바닥을 깐다
        if (tasks.length === 0) out.unknownWait = true
        else clock += Math.max(...tasks)
        tasks = []
        break

      // 이미터가 다 사그라질 때까지 선다. 얼마나 걸리는지는 `.spa`가 알고 있어서
      // 여기서는 **기다린다는 사실만** 적는다 (`engine/battle/moveLength`)
      case 'WaitForAllEmitters':
        out.waits = true
        break

      case 'LoadParticleResource': {
        // `LoadParticleResource ps, 이름` — 입자계 번호와 그 계에 실을 자료다
        const ps = typeof a[0] === 'number' ? a[0] : 0
        const symbol = typeof a[1] === 'string' ? a[1] : null
        if (out.particle === null && symbol !== null) out.particle = symbol
        // ⚠️ **번호까지 적어야 화면에 뜬다.** 이름만 적어 두던 동안 우리는 어느
        // `.spa`의 몇 번 리소스인지를 몰라 그 자리를 도형으로 채우고 있었다 —
        // 대본이 주는 것은 이름이 아니라 **멤버 번호**다 (`battle_particles.order`)
        if (symbol !== null) {
          const member = particleMember(symbol)
          if (member === null) throw new Error(`입자 ${symbol}를 order에서 못 찾았다`)
          out.loads.push({ ps, member })
        }
        break
      }

      case 'Func_FadeBg': {
        // bgType, delay, startAlpha, endAlpha, color
        const alpha = typeof a[3] === 'number' ? a[3] : 0
        // 팔레트 한 단계에 `delay + 1`프레임이다
        // (`palette.c`의 `WaitAndApplyBlendStepToPaletteBuffer`)
        const steps = Math.abs(alpha - (Number(a[2]) || 0))
        tasks.push(steps * ((Number(a[1]) || 0) + 1) + TASK_TAIL)
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
        // 물들었다 돌아온다 — 한 단계에 `fadeStepFrames + 1`프레임이고
        // (`PokemonSpriteManager_Update`의 `fadeDelayCounter`) 그 사이에 머문다
        const step = (Number(a[1]) || 0) + 1
        tasks.push(alpha * step * 2 + (Number(a[5]) || 0) + (Number(a[2]) || 0) + TASK_TAIL)
        if (rgb !== undefined && out.tint === null) {
          out.tint = { who: whoOf(String(a[0])), color: rgb, alpha }
        }
        break
      }

      case 'Func_Shake': {
        // extentX, extentY, interval, amount, targets
        const cycles = typeof a[3] === 'number' ? a[3] : 0
        // `ShakeContext_Update`가 `interval`마다 한 번 꺾고 네 번 꺾여야 한 번을
        // 쓴다 (`MAX_CYCLES_PER_SHAKE` = 4)
        tasks.push((Number(a[2]) || 1) * cycles * SHAKE_FLIPS + TASK_TAIL)
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

      case 'Func_MoveBattler': {
        // target, dx, dy, frames
        const frames = Number(a[3]) || 0
        tasks.push(frames + TASK_TAIL)
        if (out.lunge === null && /ATTACKER/.test(String(a[0]))) {
          out.lunge = { dx: Number(a[1]) || 0, dy: Number(a[2]) || 0, frames }
        }
        break
      }

      // ⚠️ **인자 차례가 `Func_MoveBattler`와 다르다** — `frames, offset, target`이고
      // 가로로만 민다 (`BattleAnimTask_MoveBattlerX`의 `PosLerpContext_Init`이 y를
      // 시작값 그대로 둔다). 같은 갈래로 묶어 두던 동안 86줄이 통째로 버려졌다
      case 'Func_MoveBattlerX':
      case 'Func_MoveBattlerX2': {
        // frames, offset, target
        const frames = Number(a[0]) || 0
        tasks.push(frames + TASK_TAIL)
        if (out.lunge === null && /ATTACKER/.test(String(a[2]))) {
          out.lunge = { dx: Number(a[1]) || 0, dy: 0, frames }
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

      // ⚠️ `CreateEmitterForMove`도 이미터다. 다섯 대본(차지빔·파괴광선·머드숏·
      // 시그널빔·물대포)만 쓰는데, 갈래를 안 가르던 시절에는 옆 갈래의 평범한
      // `CreateEmitter`가 대신 세어져서 빠진 것이 안 보였다
      case 'CreateEmitterForMove':
      case 'CreateEmitter':
      case 'CreateEmitterEx': {
        const cb = a.find((v) => typeof v === 'string' && v.startsWith('EMITTER_CB_'))
        // `CreateEmitter ps, 리소스번호, 콜백` — `Ex`는 인자가 하나 더 붙지만
        // 앞 둘의 뜻이 같다 (`BattleAnimScriptCmd_CreateEmitter`)
        const ps = typeof a[0] === 'number' ? a[0] : 0
        const res = typeof a[1] === 'number' ? a[1] : 0
        out.emitters.push({ at: anchorOf(String(cb ?? '')), at_frame: clock, ps, res })
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
type MoveAnimRgb = readonly [number, number, number]

/** 흔들기·물들이기의 대상 */
type MoveAnimWho = 'attacker' | 'defender' | 'both'

/** 입자를 어디에 붙이는가 (\`EMITTER_CB_*\`) */
type MoveAnimAnchor = 'attacker' | 'defender' | 'center' | 'generic'

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
  /**
   * 어느 \`.spa\`를 어느 입자계에 싣는가 (\`LoadParticleResource\`).
   *
   * \`member\`는 \`battle_particles.order\`의 줄 번호이고, 그것이 곧 우리
   * \`data/particles/waza.bin\`의 멤버 번호다
   */
  loads: { ps: number, member: number }[]
  /**
   * 입자를 붙이는 자리와 그 시점(프레임).
   *
   * \`res\`는 그 입자계에 실린 \`.spa\` 안의 **리소스 번호**다 —
   * \`CreateEmitter ps, res, 콜백\` 그대로다
   */
  emitters: { at: MoveAnimAnchor, at_frame: number, ps: number, res: number }[]
  /**
   * 대본 자체가 도는 프레임 (\`Delay\` + \`WaitForAnimTasks\`가 서는 시간).
   *
   * ⚠️ **이것만으로는 길이가 아니다.** \`WaitForAllEmitters\`를 쓰는 대본은
   * 입자가 다 사그라질 때까지 더 선다 — 그 계산은 \`.spa\`를 읽어야 하므로
   * \`engine/battle/moveLength\`가 \`waits\`와 함께 낸다
   */
  frames: number
  /** \`WaitForAllEmitters\`로 입자가 다 죽기를 기다리는가 (468 중 415) */
  waits: boolean
  /**
   * 길이를 모르는 전용 태스크를 기다리는가 (기술 열일곱).
   *
   * \`Func_Growth\`·\`Func_Minimize\`처럼 대본이 태스크 하나로만 된 자리다.
   * 그 길이는 원작 C 표에 저마다 다른 값으로 있고 아직 안 옮겼다 —
   * \`moveLength\`가 이 표시를 보고 바닥을 깐다
   */
  unknownWait: boolean
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
