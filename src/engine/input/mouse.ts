// 마우스 — 1인칭 시선과 시점 전환.
//
// 3인칭은 원작처럼 카메라가 북쪽에 고정이고 방향키가 월드 축을 가리킨다. 그
// 화면에서는 돌 카메라가 없으니 마우스도 할 일이 없다.
//
// **1인칭은 다르다.** 눈이 캐릭터 안에 들어가 있는데 W가 늘 북쪽이면, 서쪽을
// 보면서 앞으로 가려고 W를 눌렀는데 옆으로 걷는다. 그래서 1인칭에서는 시선이
// 기준이 되고, 시선은 마우스가 돌린다.
//
// 포인터를 가둔다(Pointer Lock). 안 가두면 커서가 창 밖으로 나가는 순간 시선이
// 멎고, 화면 가장자리에서 더 못 돈다.
import { worldState } from '../../state/worldState'
import { isUiCaptured } from './keyboard'

/**
 * 픽셀 하나에 몇 라디안 도는가.
 *
 * 화면을 한 바퀴 돌리는 데 2500픽셀쯤 든다 — 마우스 감도 보통에서 책상 한 뼘이다
 */
const SENSITIVITY = 0.0025

/**
 * 고개를 들고 숙이는 한계.
 *
 * 90°까지 열면 정수리와 발밑을 보게 되는데, 그 자리에서는 시선의 수평 성분이
 * 0이라 **어느 쪽으로 걸을지가 사라진다.** 조금 남겨 둔다
 */
const PITCH_LIMIT = (75 * Math.PI) / 180

let element: HTMLElement | null = null
let active = false

/** 게임이 도는 동안만. 배틀·메뉴에서는 시선이 멎어야 한다 */
export function setMouseActive(on: boolean): void {
  active = on
  if (!on) exitLook()
}

export function isLooking(): boolean {
  return element !== null && document.pointerLockElement === element
}

/** 시선을 잡는다. 사용자 동작(클릭·휠) 안에서만 브라우저가 허락한다 */
export function requestLook(): void {
  if (!active || element === null) return
  if (worldState.camera.mode !== 'first') return
  if (document.pointerLockElement === element) return
  void element.requestPointerLock()
}

export function exitLook(): void {
  if (document.pointerLockElement !== null) document.exitPointerLock()
}

function onMove(e: MouseEvent): void {
  if (!isLooking() || !active || isUiCaptured()) return
  const cam = worldState.camera
  cam.yaw += e.movementX * SENSITIVITY
  // 화면 위로 밀면 위를 본다 — movementY는 아래가 양수다
  cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch - e.movementY * SENSITIVITY))
}

/**
 * 휠로 시점을 바꾼다. 당기면 멀어지고(3인칭) 밀면 눈으로 들어간다(1인칭).
 *
 * 설정과 V도 같은 값을 만지므로 여기서 스토어를 직접 바꾼다 — 세 곳이 따로
 * 놀면 설정 화면이 실제 시점과 어긋난다
 */
function onWheel(e: WheelEvent, setView: (mode: 0 | 1) => void): void {
  if (!active || isUiCaptured()) return
  const first = e.deltaY < 0
  if ((worldState.camera.mode === 'first') === first) {
    // 이미 그 시점이면 시선만 다시 잡는다 — 풀린 줄 모르고 굴렸을 수 있다
    if (first) requestLook()
    return
  }
  setView(first ? 1 : 0)
  if (first) requestLook()
  else exitLook()
}

/**
 * @param target 포인터를 가둘 요소 (캔버스를 감싼 것)
 * @param setView 설정의 시점 값을 바꾸는 함수. 0이 3인칭, 1이 1인칭이다
 */
export function attachMouse(target: HTMLElement, setView: (mode: 0 | 1) => void): () => void {
  element = target
  const move = (e: MouseEvent): void => { onMove(e) }
  const wheel = (e: WheelEvent): void => { e.preventDefault(); onWheel(e, setView) }
  const down = (): void => { requestLook() }
  // 시선이 풀리면(Esc) 각도는 그대로 둔다 — 다시 잡았을 때 보던 쪽이어야 한다
  document.addEventListener('mousemove', move)
  target.addEventListener('wheel', wheel, { passive: false })
  target.addEventListener('pointerdown', down)
  return () => {
    document.removeEventListener('mousemove', move)
    target.removeEventListener('wheel', wheel)
    target.removeEventListener('pointerdown', down)
    element = null
  }
}

// ── 시선을 방향으로 ──────────────────────────────────────────────────────────
//
// yaw는 **0이 북쪽(−Z)**이고 오른쪽으로 돌면 커진다. 우리 월드는 +Z가 남쪽이라
// (`NPC_FACING`이 남을 0으로 두는 것과 같다) 앞은 −cos다.

/** 시선의 앞쪽 (수평) */
export function lookForward(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) }
}

/**
 * 누른 방향을 시선 기준으로 돌린다.
 *
 * 넣는 값은 3인칭이 쓰는 그대로다 — `x`가 오른쪽, `y`가 아래(남)쪽이 양수.
 * yaw가 0이면 회전이 항등이라 **3인칭과 완전히 같은 값**이 나온다. 그래서 이
 * 함수를 두 시점에 다 걸어도 3인칭 조작은 안 바뀐다
 */
export function moveByYaw(x: number, y: number, yaw: number): { x: number; z: number } {
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  return { x: x * cos - y * sin, z: x * sin + y * cos }
}

/**
 * 시선 방향을 캐릭터의 `facing`으로.
 *
 * `facing`은 `atan2(vx, vz)`라 **0이 남쪽**이다. yaw는 0이 북쪽이라 기준이
 * 반대다: `atan2(sin yaw, −cos yaw)` = `π − yaw`. 검산하면 북 yaw 0 → facing π,
 * 동 yaw π/2 → facing π/2, 남 yaw π → facing 0으로 맞는다
 */
export function facingFromYaw(yaw: number): number {
  return Math.PI - yaw
}
