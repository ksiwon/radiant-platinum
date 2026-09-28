// 일그러진 창기둥의 호수 구슬 셋 (`ScrCmd_20D` 4 · 6 → `ov6_0223FCCC` · `overlay006/ov6_0223E140.c`)
//
// 유크시 · 아그놈 · 엠라이트의 빛 구슬이 차례로 날아와 한가운데로 뛰어들고, 뛰어들 때마다 화면이 **하얗게** 된다
// (`GX_SetMasterBrightness` 0~16 — 양수가 흰 쪽이다). 셋째 엠라이트는 한 번 모습을 드러냈다가(지역 번호 1) 도로
// 구슬이 되어 사라진다. 그동안 난천(지역 번호 0)과 주인공이 두리번거린다.
//
// 자리는 **월드 유닛의 fx32**다 — 원작과 같은 정수 셈을 그대로 한다(`FX_Mul` · `FX_Div`의 버림, `CalcCosineDegrees`).
// 각도 인자도 원작처럼 **정수 나눗셈**이다(`180 / 32` = 5 · `360 / 32` = 11 · `90 / 20` = 4).
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)

const FX = 4096
const fx = (units: number): number => units * FX

/** 원작 코사인표(fx32) — 정수 도 */
function cosDeg(deg: number): number {
  return Math.round(Math.cos(((deg % 360) * Math.PI) / 180) * FX)
}

/** `ov6_0223FD0C` · `ov6_0223FD18` — 시작 · 차이 · 길이의 곧은 옮김 */
interface Lerp { cur: number, start: number, delta: number, frames: number }
const lerp = (from: number, to: number, frames: number): Lerp => ({ cur: from, start: from, delta: to - from, frames })
function lerpAt(l: Lerp, t: number): boolean {
  const v = Math.min(t, l.frames)
  l.cur = l.start + Math.trunc((l.delta * v) / l.frames)
  return t >= l.frames
}

/** 구슬 셋의 차례 · 소리 (`v3` 표 · `Sound_PlayPokemonCryEx`) */
export const ORB_ORDER = ['orbUxie', 'orbAzelf', 'orbMesprit'] as const
const SPECIES = [480, 482, 481] as const
/** 나타나는 x (`v4`) · 높이 99 · z 320 (월드 유닛) */
const SPAWN_X = [504, 504, 435] as const
/** 하얘지기 시작하는 틱 (`v3` — 68 · 38 · 390) */
const WHITEN_AFTER = [68, 38, 390] as const
/** 엠라이트의 마지막 자리 (`Unk_ov6_02248EA8[2]`) */
const MESPRIT_END = [0x1f8, 0x14a] as const
/** `SEQ_SE_DP_CLIMAX10` — 뛰어드는 소리 */
const SE_CLIMAX10 = 1750

/** 이 틱에 밖으로 알릴 것 */
export type OrbEvent =
  | { kind: 'cry', species: number }
  | { kind: 'se', seq: number }
  /** 엠라이트(지역 번호 1)를 보인다 · 숨긴다 (`MapObject_SetHidden`) */
  | { kind: 'mesprit', visible: boolean }
  /** 난천(지역 번호 0)과 주인공이 돌아본다 — 원작 방향 번호(0 북 · 1 남 · 2 서 · 3 동) */
  | { kind: 'face', cynthia: number, player: number }

export interface LakeOrbs {
  /** 0 기다림 · 1 날기 · 2 하얘지기 · 3 끝의 기다림 · 6 끝 (`unk_00`) */
  state: number
  /** 몇째 구슬 (`unk_10`) · 3이면 셋 다 끝났다 */
  orb: number
  /** 길의 큰 단계 (`unk_14`) · 작은 단계 (`unk_18`) · 틱 (`unk_D0`) */
  leg: number
  step: number
  t: number
  /** 흰 밝기 0~16 (`unk_0C`) */
  bright: number
  /** 하얘지기를 세는 틱 (`unk_20`) · 두리번거림 틱 (`unk_1C`) */
  count: number
  turn: number
  /** 구슬 자리 (fx32 월드 유닛) · 보이는가 */
  x: number
  y: number
  z: number
  visible: boolean
  /** 구슬 애니 프레임 — 한 틱에 하나, 돈다 (12프레임) */
  anim: number
  d4: number
  d8: number
  dc: number
  e0: number
  lx: Lerp
  lz: Lerp
}

/** 세운다 (`ov6_0223EB4C`) — 첫 구슬(유크시)을 싣고 30틱을 기다린다 */
export function lakeOrbsStart(): LakeOrbs {
  return {
    state: 0, orb: 0, leg: 0, step: 0, t: 30, bright: 0, count: 0, turn: 0,
    x: 0, y: 0, z: 0, visible: true, anim: 0, d4: 0, d8: 0, dc: 0, e0: 0,
    lx: lerp(0, 0, 1), lz: lerp(0, 0, 1),
  }
}

/** 유크시 (`ov6_0223EBDC`) */
function uxie(o: LakeOrbs, ev: OrbEvent[]): boolean {
  switch (o.step) {
    case 0:
      o.t = 0; o.d4 = fx(573); o.d8 = fx(330 + 30)
      o.lx = lerp(o.x, o.d4, 20); o.lz = lerp(o.z, o.d8, 20)
      o.step++
      return false
    case 1: {
      o.t++
      const a = lerpAt(o.lx, o.t), b = lerpAt(o.lz, o.t)
      o.x = o.lx.cur; o.z = o.lz.cur
      if (a && b) { ev.push({ kind: 'cry', species: SPECIES[0] }); o.step++ }
      return false
    }
    case 2:
      o.t = 0; o.d4 = fx(444); o.d8 = fx(330 + 30)
      o.lx = lerp(o.x, o.d4, 20)
      o.step++
      return false
    case 3: {
      const a = lerpAt(o.lx, o.t)
      o.d8 += cosDeg(o.t * Math.trunc(180 / 20)) * 3
      o.t++
      o.x = o.lx.cur; o.z = o.d8
      if (a) o.step++
      return false
    }
    case 4:
      o.t = 0; o.d4 = fx(507); o.d8 = fx(330 + 30)
      o.lx = lerp(o.x, o.d4, 20)
      o.step++
      return false
    case 5: {
      const a = lerpAt(o.lx, o.t)
      o.d8 -= cosDeg(o.t * Math.trunc(90 / 20)) * 3
      o.t++
      o.x = o.lx.cur; o.z = o.d8
      if (a) o.step = 99
      return false
    }
    default:
      o.step = 0
      return true
  }
}

/** 아그놈 (`ov6_0223F744`) — 8틱씩 셋, 그리고 16틱 */
function azelf(o: LakeOrbs, ev: OrbEvent[]): boolean {
  const legTo = (x: number, z: number): void => {
    o.t = 0; o.d4 = fx(x); o.d8 = fx(z)
    o.lx = lerp(o.x, o.d4, 8); o.lz = lerp(o.z, o.d8, 8)
    o.step++
  }
  const move = (): boolean => {
    o.t++
    const a = lerpAt(o.lx, o.t), b = lerpAt(o.lz, o.t)
    o.x = o.lx.cur; o.z = o.lz.cur
    return a && b
  }
  switch (o.step) {
    case 0: legTo(606, 340 + 30); return false
    case 1: if (move()) o.step++; return false
    case 2: legTo(438, 412 + 30); return false
    case 3: if (move()) { ev.push({ kind: 'cry', species: SPECIES[1] }); o.step++ } return false
    case 4: legTo(504, 307 + 30); return false
    case 5: if (move()) o.step++; return false
    case 6: if (++o.t > 15) o.step = 99; return false
    default: o.step = 0; return true
  }
}

/** 엠라이트 (`ov6_0223EE5C`) — 가장 길다. 한 번 모습을 드러낸다 */
function mesprit(o: LakeOrbs, ev: OrbEvent[]): boolean {
  let done = false
  const both = (): boolean => {
    const a = lerpAt(o.lx, o.t), b = lerpAt(o.lz, o.t)
    return a && b
  }
  switch (o.step) {
    case 0:
      o.t = 0; o.d4 = fx(555); o.d8 = fx(317 + 30); o.e0 = 0
      o.lx = lerp(o.x, o.d4, 32); o.lz = lerp(o.z, o.d8, 32)
      o.step++
      break
    case 1: {
      const ok = both()
      o.t++
      o.x = o.lx.cur; o.z = o.lz.cur + o.e0
      if (ok) o.step++
      break
    }
    case 2:
      o.t = 0; o.d4 = fx(507); o.d8 = fx(317 + 30)
      o.lx = lerp(o.x, o.d4, 32)
      o.step++
      break
    case 3: {
      const a = lerpAt(o.lx, o.t)
      o.d8 += cosDeg(o.t * Math.trunc(180 / 32)) * 3
      o.t++
      o.x = o.lx.cur; o.z = o.d8
      if (a) o.step++
      break
    }
    case 4:
    case 5:
      if (o.step === 4) { o.t = 0; o.d8 = o.z; o.step = 5 }
      o.d8 -= cosDeg(o.t * Math.trunc(360 / 32)) * 2
      o.t++
      o.z = o.d8
      if (o.t >= 32 * 2) { o.t = 0; o.step++ }
      break
    case 6:
      o.t = 0; o.d4 = fx(465); o.d8 = fx(468 + 30); o.dc = 0
      o.lx = lerp(o.x, o.d4, 32); o.lz = lerp(o.z, o.d8, 32)
      o.step++
      break
    case 7: {
      const ok = both()
      o.t++
      o.dc -= cosDeg((o.t + 1) * Math.trunc(180 / 32)) * 4
      o.x = o.lx.cur + o.dc; o.z = o.lz.cur
      if (ok) o.step++
      break
    }
    case 8:
    case 9:
      if (o.step === 8) {
        o.t = 0
        ev.push({ kind: 'face', cynthia: 2, player: 2 })
        o.d8 = o.z
        o.step = 9
      }
      o.d8 += cosDeg(o.t * Math.trunc(360 / 32)) * 1
      o.t++
      o.z = o.d8
      if (o.t >= 32) { o.turn = 1; o.t = 0; o.step++ }
      break
    case 10:
      o.t = 0; o.d4 = fx(503); o.d8 = fx(475 + 30); o.e0 = 0
      o.lx = lerp(o.x, o.d4, 32); o.lz = lerp(o.z, o.d8, 32)
      o.step++
      break
    case 11: {
      const ok = both()
      o.e0 += cosDeg(o.t * Math.trunc(180 / 32)) * 2
      o.t++
      o.x = o.lx.cur; o.z = o.lz.cur + o.e0
      if (ok) o.step++
      break
    }
    case 12:
      o.t = 0; o.d4 = fx(503); o.d8 = fx(454 + 30)
      o.lx = lerp(o.x, o.d4, Math.trunc(32 / 4)); o.lz = lerp(o.z, o.d8, Math.trunc(32 / 4))
      o.step++
      break
    case 13: {
      const ok = both()
      o.t++
      if (o.t >= 4 && o.bright < 16) o.bright += 2
      o.x = o.lx.cur; o.z = o.lz.cur
      if (ok) o.step++
      break
    }
    case 14:
      if (o.bright < 16) { o.bright += 2; break }
      ev.push({ kind: 'mesprit', visible: true })
      o.visible = false
      o.step++
      break
    case 15:
      if (o.bright > 0) { o.bright -= 1; break }
      o.t = 0
      ev.push({ kind: 'cry', species: SPECIES[2] })
      o.step++
      break
    case 16:
      if (++o.t < 60) break
      o.step++
      break
    case 17:
      if (o.bright < 16) { o.bright += 2; break }
      ev.push({ kind: 'mesprit', visible: false })
      o.visible = true
      // 18로 떨어진다 — 거기서 한 번 더 넘긴다
      o.step = 19
      break
    case 18:
      o.step++
      break
    case 19:
      o.t = 0; o.d8 = fx(319 + 30); o.dc = 0; o.d4 = o.x
      o.lz = lerp(o.z, o.d8, 32)
      o.step++
      break
    case 20: {
      const a = lerpAt(o.lz, o.t)
      o.t++
      if (o.bright > 0) o.bright -= 1
      o.dc += cosDeg((o.t + 1) * Math.trunc(180 / 32)) * 8
      o.x = o.d4 + o.dc; o.z = o.lz.cur
      if (a) o.step = 99
      break
    }
    case 99:
      o.t = 0; o.d4 = fx(MESPRIT_END[0]); o.d8 = fx(MESPRIT_END[1])
      o.lx = lerp(o.x, o.d4, 20); o.lz = lerp(o.z, o.d8, 20)
      o.step++
      break
    case 100: {
      const ok = both()
      o.t++
      o.x = o.lx.cur; o.z = o.lz.cur
      if (ok) o.step++
      break
    }
    default:
      o.step = 0
      done = true
  }
  if (!done && o.turn !== 0) {
    if (o.turn === 20) ev.push({ kind: 'face', cynthia: 1, player: 1 })
    if (o.turn === 40) ev.push({ kind: 'face', cynthia: 2, player: 3 })
    if (o.turn === 50) ev.push({ kind: 'face', cynthia: 0, player: 0 })
    o.turn++
  }
  return done
}

/** 구슬 하나의 길 전체 (`ov6_0223F9F4`) — 제 길 → 한가운데(504, 439)로 6틱에 뛰어든다 */
function path(o: LakeOrbs, ev: OrbEvent[]): boolean {
  if (o.leg === 0) {
    const done = o.orb === 0 ? uxie(o, ev) : o.orb === 1 ? azelf(o, ev) : mesprit(o, ev)
    if (done) o.leg++
    return false
  }
  if (o.leg === 1) {
    o.d4 = fx(504); o.d8 = fx(439); o.t = 0
    o.lx = lerp(o.x, o.d4, 6); o.lz = lerp(o.z, o.d8, 6)
    o.leg++
    return false
  }
  if (o.leg === 2) {
    const a = lerpAt(o.lx, o.t), b = lerpAt(o.lz, o.t)
    o.t++
    o.x = o.lx.cur; o.z = o.lz.cur
    if (a && b) o.leg++
    return false
  }
  return true
}

/** 한 틱 (`ov6_0223FAF8`) — 알릴 것을 돌려준다 */
export function lakeOrbsTick(o: LakeOrbs): OrbEvent[] {
  const ev: OrbEvent[] = []
  if (o.state === 0) {
    if (o.t !== 0) o.t--
    else if (o.bright > 0) o.bright -= 1
    else {
      o.x = fx(SPAWN_X[o.orb]!); o.y = fx(99); o.z = fx(290 + 30)
      o.visible = true
      o.count = 0
      o.state = 1
    }
  } else if (o.state === 1 || o.state === 2) {
    let fall = o.state === 2
    if (o.state === 1) {
      if (path(o, ev)) {
        ev.push({ kind: 'se', seq: SE_CLIMAX10 })
        o.count = 0
        o.state = 2
        fall = true
      } else {
        o.count++
        if (WHITEN_AFTER[o.orb]! < o.count) {
          if (o.bright !== 16) o.bright += 2
          else o.count = 0
        }
      }
    }
    if (fall) {
      if (o.bright !== 16) o.bright += 2
      else {
        o.orb++
        o.leg = 0
        o.t = 30
        o.state = o.orb !== 3 ? 0 : 3
      }
    }
  } else if (o.state !== 6) {
    if (o.t !== 0) o.t--
    else if (o.bright > 0) o.bright -= 1
    else o.state = 6
  }
  if (o.orb !== 3) o.anim++
  return ev
}

/** fx32 월드 유닛 → 칸 */
export const orbTiles = (v: number): number => v / FX / 16
