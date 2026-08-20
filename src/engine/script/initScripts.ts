// 맵 초기화 스크립트 (DATA.md §2.10)
//
// ⚠️ **맵마다 스크립트 파일이 둘이다.** 하나는 말을 걸면 도는 바이트코드고,
// 다른 하나는 여기서 읽는 **작은 표**다(`scripts_init_*`, 대개 10~40바이트).
// 그 표가 "맵에 들어설 때 몇 번을 돌려라 · 매 프레임 이 변수를 보다가 값이
// 맞으면 몇 번을 걸어라"를 담고 있다.
//
// 이 표를 안 읽으면 **오프닝이 한 걸음도 안 나간다.** 침대에서 일어나 문 쪽으로
// 걸어가면 라이벌이 뛰어 들어오는 그 장면이 좌표 트리거가 아니라 이 표다.
// 실측으로 맵 593개 중 표를 든 것이 많고, 떡잎마을 집 2층의 표는 이렇다:
//
//   02 05 00 00 00   맵에 들어설 때 5번 (`OnTransition`)
//   01 01 00 00 00   매 프레임 표 — 여기서 1바이트 뒤
//   00               표 끝
//   f9 40 00 00 03 00   VAR_PLAYER_HOUSE_SPECIAL_PROGRAM_STATE가 0이면 3번
//   00 00            매 프레임 표 끝
//
// 형식은 `script_manager.c`의 `FieldSystem_GetFixedInitScriptID`와
// `FieldSystem_GetFrameTableInitScriptID` 그대로다. 머리 항목은 종류에 관계없이
// **5바이트 고정**이라(1+2+2 또는 1+4) 모르는 종류도 건너뛸 수 있다.

/** `constants/init_script_types.h` */
export const INIT_SCRIPT = {
  /** 매 프레임 본다. 값이 맞으면 그 스크립트를 **건다** */
  frameTable: 1,
  /** 맵에 들어설 때. 사람을 세우기 **전에** 돈다 — 배치표를 고치는 자리다 */
  onTransition: 2,
  /** 배틀·메뉴에서 필드로 돌아올 때 */
  onResume: 3,
  /** 맵이 다 올라온 뒤 */
  onLoad: 4,
} as const

/** 매 프레임 표의 한 줄. 두 값이 같으면 그 스크립트를 건다 */
interface FrameCheck {
  /** 왼쪽 — 대개 변수 번호다 */
  left: number
  /** 오른쪽 — 대개 상수다 */
  right: number
  script: number
}

export interface InitScripts {
  /** 종류 → scriptID. 매 프레임 표는 여기 없다 */
  readonly fixed: ReadonlyMap<number, number>
  /** 앞에서부터 처음 맞는 줄이 이긴다 */
  readonly frame: readonly FrameCheck[]
}

const EMPTY: InitScripts = { fixed: new Map(), frame: [] }

/**
 * 초기화 표 하나를 읽는다.
 *
 * 못 읽는 바이트가 나오면 **거기서 멈춘다.** 초기화 표는 맵에 들어설 때마다
 * 도는 자리라, 터뜨리면 그 맵에 아예 못 들어간다
 */
export function parseInitScripts(bytes: Uint8Array): InitScripts {
  if (bytes.byteLength === 0) return EMPTY
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const fixed = new Map<number, number>()
  let frame: FrameCheck[] = []

  // ── 머리 ──
  let at = 0
  while (at < bytes.byteLength) {
    const type = view.getUint8(at)
    if (type === 0) break
    if (at + 5 > bytes.byteLength) break
    if (type === INIT_SCRIPT.frameTable) {
      // 오프셋 기준은 **이 4바이트 바로 뒤**다 (`.long \name-.-4`)
      const offset = view.getInt32(at + 1, true)
      if (offset !== 0) frame = readFrameTable(view, at + 5 + offset, bytes.byteLength)
    } else if (!fixed.has(type)) {
      fixed.set(type, view.getUint16(at + 1, true))
    }
    at += 5
  }
  return { fixed, frame }
}

function readFrameTable(view: DataView, from: number, end: number): FrameCheck[] {
  const rows: FrameCheck[] = []
  for (let at = from; at + 6 <= end; at += 6) {
    const left = view.getUint16(at, true)
    // 왼쪽이 0이면 표의 끝이다 (`InitScriptFrameTableEnd`)
    if (left === 0) break
    rows.push({
      left,
      right: view.getUint16(at + 2, true),
      script: view.getUint16(at + 4, true),
    })
  }
  return rows
}

/**
 * 지금 걸어야 할 매 프레임 스크립트. 없으면 null.
 *
 * @param read 변수 번호를 값으로. 상수 구간(0x4000 미만)은 그 수가 곧 값이다
 */
export function frameTableScript(init: InitScripts, read: (id: number) => number): number | null {
  for (const row of init.frame) {
    if (read(row.left) === read(row.right)) return row.script
  }
  return null
}
