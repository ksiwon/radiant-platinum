// 프레임 상태 — React를 절대 건드리지 않는 mutable 싱글톤 (PLAN §3.2 ③)
import { Vector2, Vector3 } from 'three'

/** 켤 때의 시각. 원작이 본체 시계를 읽는 것과 같은 자리다 */
function startHour(): number {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60
}

export const worldState = {
  player: {
    position: new Vector3(0, 0, 0),
    prevPosition: new Vector3(0, 0, 0), // 렌더 보간용
    velocity: new Vector3(),
    facing: 0,
    grounded: true,
    /**
     * 턱을 넘는 중. `t`가 0에서 1까지 가는 동안 입력도 충돌도 안 본다 —
     * 원작도 뛰는 동안은 조작이 안 먹는다 (`actor/ledge`)
     */
    hop: { active: false, t: 0, fromX: 0, fromZ: 0, toX: 0, toZ: 0 },
    /**
     * 파도타기 중인가 (`PLAYER_AVATAR_SURFING`).
     *
     * 물은 이게 서 있을 때만 지나간다 — 원작이 통행 판정에서 그 한 줄로 가른다
     * (`player_move.c` 248줄). 물 타일 자체는 **안 막혀 있다**
     */
    surfing: false,
    /**
     * 괴력을 쓴 상태. 이게 서 있어야 바위가 밀린다 (`FieldMoves_SetStrengthTask`).
     *
     * 맵을 옮기면 풀린다 — 원작도 맵마다 다시 써야 한다
     */
    strength: false,
    /**
     * 러닝슈즈를 받았는가 (`PlayerData_HasRunningShoes`).
     *
     * ⚠️ **이게 없으면 못 뛴다.** 원작도 신발을 받기 전에는 B를 눌러도 걷는다 —
     * 201번도로에서 돌아와 엄마가 줄 때까지다. 세이브의 값을 씬이 여기로 밀어
     * 준다(`MapStreamer`) — 이동 시스템은 세이브를 안 본다
     */
    runningShoes: false,
  },
  camera: {
    position: new Vector3(0, 6, 9),
    target: new Vector3(),
    /**
     * 1인칭 시선의 좌우. **0이 북쪽(−Z)**이고 오른쪽으로 돌면 커진다.
     *
     * 3인칭은 안 본다 — 원작처럼 카메라가 북쪽에 고정이다
     */
    yaw: 0,
    /** 1인칭 시선의 위아래. 위가 양수고 `PITCH_LIMIT`까지만 열린다 */
    pitch: 0,
    distance: 8,
    height: 4,
    /**
     * 3인칭인가 1인칭인가.
     *
     * 조작이 갈린다. 3인칭은 원작대로 방향키가 **월드 축**을 가리키고, 1인칭은
     * **시선이 기준**이다 — 눈이 캐릭터 안에 있는데 W가 늘 북쪽이면 서쪽을 보며
     * 앞으로 가려다 옆으로 걷는다
     */
    mode: 'third' as 'third' | 'first',
  },
  /**
   * 시각. `gameHour`는 0~24 실수고 하늘·조명·인카운터가 이걸 본다.
   *
   * **원작은 본체 시계를 그대로 읽는다**(`rtc.c`의 `GetTimeOfDay` → `GS_RTC_GetTime`).
   * 그래서 여기도 기본값이 실제 시각이다 — 새벽에 켜면 밤 하늘이 뜬다.
   * 시험용으로 흐르게 하려면 `pt.hour(20)`으로 밀 수 있다 (`devConsole`)
   */
  time: { elapsed: 0, gameHour: startHour() },
  // `interact`가 원작의 A, `cancel`이 B다. 대사창은 둘 다로 넘어가고
  // (`ScriptContext_CheckABPress`) 예/아니오는 B가 "아니오"로 간다
  input: { move: new Vector2(), run: false, interact: false, cancel: false },
}

export type WorldState = typeof worldState
