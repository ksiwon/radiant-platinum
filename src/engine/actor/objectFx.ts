// 사람·포켓몬 하나에 거는 연출 둘 (`unk_0205DFC4.c`)
//
// 깜빡임(`MapObject_Flicker`)과 흔들림(`MapObject_Shake`)이다. 둘 다 원작에서
// **필드 과제**라 스크립트가 그 과제가 끝날 때까지 선다 (`ScrCmd_*`가 `TRUE`를
// 낸다). 그래서 여기도 프레임마다 한 걸음씩 나아가고, 스크립트는 `done`을 본다.
//
// 쓰는 자리는 한 곳씩이다 — 만월섬 숲의 크레세리아가 깜빡이며 사라지고
// (`FlickerObject LOCALID_CRESSELIA, 6, 8`), 선단신전 B5F의 레지기가스가
// 흔들린다 (`ShakeObject LOCALID_REGIGIGAS, 8, 90, 3, 0`).
//
// ⚠️ **둘이 겹치지 않는다.** 원작도 과제를 하나씩 걸고 그동안 스크립트가
// 멈춰 있어서 두 연출이 같이 도는 자리가 없다 — 그래서 각각 한 자리만 든다
import type { Movable } from '../script/movement'

/** 흔들림의 세기가 타일이 되는 나눔수. 원작은 `FX32_CONST(칸)`이라 16이 한 타일이다 */
const UNITS_PER_TILE = 16

interface Flicker {
  target: Movable
  /** 남은 뒤집기 수. `times-- == 0`이라 0에서 한 번 더 돌고 끝난다 */
  times: number
  delay: number
  timer: number
  hidden: boolean
}

interface Shake {
  target: Movable
  times: number
  /** 한 프레임에 도는 각(도) */
  speed: number
  x: number
  z: number
  degrees: number
}

let flicker: Flicker | null = null
let shake: Shake | null = null

/** 깜빡이기 시작한다 (`MapObject_Flicker`) */
export function startFlicker(target: Movable, times: number, delay: number): void {
  flicker = { target, times, delay, timer: 0, hidden: false }
}

/** 흔들리기 시작한다 (`MapObject_Shake`) */
export function startShake(
  target: Movable, times: number, speed: number, xOffset: number, zOffset: number,
): void {
  shake = {
    target, times, speed,
    x: xOffset / UNITS_PER_TILE,
    z: zOffset / UNITS_PER_TILE,
    degrees: 0,
  }
}

export function flickerDone(): boolean {
  return flicker === null
}

export function shakeDone(): boolean {
  return shake === null
}

/**
 * 한 프레임.
 *
 * ⚠️ **끝난 자리를 되돌려 놓는다.** 원작이 마지막에 흔들림 어긋남을 0으로
 * 되돌리고(`Task_ShakeMapObject`) 깜빡임은 `hiddenFlag`가 선 채로 끝난다 —
 * 크레세리아가 **사라진 채로** 남는 것이 맞는 결말이다
 */
export function objectFxTick(dt: number): void {
  const steps = dt * 60
  tickFlicker(steps)
  tickShake(steps)
}

function tickFlicker(steps: number): void {
  const run = flicker
  if (run === null) return
  run.target.visible = !run.hidden
  run.timer += steps
  if (run.timer < run.delay) return
  run.hidden = !run.hidden
  run.timer = 0
  if (run.times === 0) {
    run.target.visible = !run.hidden
    flicker = null
    return
  }
  run.times -= 1
}

function tickShake(steps: number): void {
  const run = shake
  if (run === null) return
  const rad = (run.degrees * Math.PI) / 180
  run.target.offsetX = Math.sin(rad) * run.x
  run.target.offsetZ = Math.sin(rad) * run.z
  run.degrees += run.speed * steps
  if (run.degrees < 360) return
  run.degrees = 0
  run.times -= 1
  if (run.times > 0) return
  run.target.offsetX = 0
  run.target.offsetZ = 0
  shake = null
}

/** 맵을 옮기면 걸려 있던 연출은 사라진다 — 대상이 이미 없다 */
export function clearObjectFx(): void {
  if (shake !== null) {
    shake.target.offsetX = 0
    shake.target.offsetZ = 0
  }
  flicker = null
  shake = null
}
