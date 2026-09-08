// 스크립트 변수·플래그 (DATA.md §2.10)
//
// 스크립트가 값을 가리키는 방법은 셋이다. 번호 하나로 구분한다
// (`script_manager.c`의 `FieldSystem_GetVarPointer`):
//
//   0x0000 ~ 0x3FFF   **변수가 아니다.** 그 번호가 곧 값이다
//   0x4000 ~ 0x7FFF   세이브에 남는 변수 292칸
//   0x8000 ~          지금 도는 스크립트만 쓰는 칸 14개
//
// 첫 줄이 중요하다. `SetVar VAR_0x8004, 5`의 5는 변수 5번이 아니라 숫자 5다.
// 어셈블러가 이 경계를 보고 `SetVarFromValue`와 `SetVarFromVar`를 갈라 쓴다.
//
// 플래그는 따로다. 번호 하나가 비트 하나이고 4106개가 세이브에 들어간다.

/** 이 아래는 변수 번호가 아니라 상수다 */
export const VARS_START = 0x4000

/**
 * 깨어진 세계가 어디까지 왔는가 (`VAR_DISTORTION_WORLD_PROGRESS`).
 *
 * ⚠️ **줄 번호가 아니라 C 열거형으로 센 값이다** — `vars_flags.txt`에 별명 줄이
 * 여럿이라 줄로 세면 어긋난다 (`tools/extract/distortion.js`의 계산기가 정본이다)
 */
export const VAR_DISTORTION_WORLD_PROGRESS = 16469
/** 깨어진 세계의 태홍이 어느 자리에 서 있는가 (`…_CYRUS_APPEARANCE`) */
export const VAR_DISTORTION_CYRUS = 16475
/**
 * 배틀팩토리에 어느 도전으로 들어가는가 (PARITY §9.3).
 *
 * 로비 스크립트가 여기에 적고 `LaunchBattleFrontierScene`으로 넘어간다 —
 * 종류 0 싱글 · 1 더블, 레벨 0 레벨50 · 1 오픈레벨.
 *
 * ⚠️ **줄 번호가 아니라 C 열거형 값이다** (`VAR_DISTORTION_WORLD_PROGRESS`와
 * 같은 계산기). `vars_flags.txt`에 `VAR_MAP_LOCAL_0x00 = …` 같은 별명 줄이
 * 있어서 줄로 세면 하나씩 밀린다
 */
export const VAR_BATTLE_FACTORY_CHALLENGE_TYPE = 16568
export const VAR_BATTLE_FACTORY_CHALLENGE_LEVEL = 16569
/**
 * 물가시티가 어디까지 왔는가 (`VAR_SUNYSHORE_CITY_STATE` = 0x407E).
 *
 * 0이면 `SunyshoreCity_OnFrame_Flint`가 매 프레임 걸린다 — 그 스크립트는
 * `LockAll` 뒤에 z가 790이나 791일 때만 갈라지고, 아니면 `ReleaseAll` 없이
 * 끝난다. 원작에서는 222번도로 관문으로 들어오는 길밖에 없어서 그 z가
 * 보장되지만, 다른 자리에 세우면 **영영 묶인다** (`dev/checkpoints`)
 */
export const VAR_SUNYSHORE_CITY_STATE = 0x407e
/**
 * 파이트에리어가 어디까지 왔는가 (`VAR_FIGHT_AREA_STATE` = 0x4081).
 *
 * 0이면 배에서 내리는 장면(`FightArea_OnFrame_Rival`)이 걸린다. 1은 라이벌이
 * 배틀프런티어 관문 앞에 선 사이, 2가 그 장면이 다 끝난 자리다
 */
export const VAR_FIGHT_AREA_STATE = 0x4081
/**
 * 시작의 방 계단이 무장했는가 (`VAR_HALL_OF_ORIGIN_STATE` = 0x4118).
 *
 * 세우는 것은 피리가 아니라 **창기둥의 진입 스크립트**다 —
 * `SpearPillar_TryEnableHallOfOrigin`이 전당등록·전국도감·천계의피리·배포를
 * 다 보고 1을 세운다. 그 한 칸이 (30~32, 35)의 좌표 사건을 무장시킨다
 * (`events_hall_of_origin.json`)
 */
export const VAR_HALL_OF_ORIGIN_STATE = 0x4118
/**
 * 바위 수수께끼를 풀었는가 (`FLAG_DISTORTION_WORLD_PUZZLE_FINISHED`).
 *
 * 이 자리 하나가 다시 들어왔을 때의 바위 자리를 통째로 정한다 —
 * 서 있으면 바위 셋이 이미 웅덩이에 들어 있다 (`world/distortionBoulder`)
 */
export const FLAG_DISTORTION_WORLD_PUZZLE_FINISHED = 2477
/** 여기부터는 스크립트 한 판만 사는 칸이다 */
export const SCRIPT_LOCAL_VARS_START = 0x8000

/** 세이브에 남는 변수 개수 (`VARS_END - VARS_START` = 16672 - 16384) */
export const SAVED_VAR_COUNT = 288
/** 스크립트 지역 변수 0x8000~0x800D */
const LOCAL_VAR_COUNT = 14
/** 세이브에 남는 플래그 개수. `vars_flags.txt`에서 VARS_START 앞까지가 플래그다 */
export const FLAG_COUNT = 4106

/**
 * **0번은 플래그가 아니다** — 세우려 해도 안 서고, 물으면 언제나 거짓이다.
 *
 * 원작이 세 접근자를 한 자리에서 그렇게 막는다 (`vars_flags.c`):
 *
 * ```c
 * u8 *VarsFlags_GetFlagChunk(VarsFlags *varsFlags, u16 flagID) {
 *     if (flagID == 0) { return NULL; }        // ← 여기
 *     ...
 * }
 * ```
 *
 * `CheckFlag`·`SetFlag`·`ClearFlag`가 전부 이 함수를 거치고 널이면 아무 일도
 * 안 한다. 표의 첫 줄 이름도 그 뜻이다 — `FLAG_UNUSED_0x0000`.
 *
 * ⚠️ **이 한 줄이 없으면 게임의 사람이 통째로 사라진다.** 배치표의 「숨김 조건
 * 없음」이 0으로 적혀 있어서(`events.json`의 `flag: 0`), 0이 한 번 서면
 * `spawnNpcs`의 `hideFlagOf(info) !== null && vars.checkFlag(hide)`가 그 사람들
 * 전부에게 참이 된다. 그리고 0을 세우는 길이 실제로 있다 — `RemoveObject`가
 * 지운 사람의 숨김 플래그를 세우는데(`MapObject_SetFlagAndDeleteObject`), 그
 * 사람의 플래그가 0이면 0을 세운다. 원작도 그 줄은 조건 없이 부르고, **막는
 * 자리가 여기**다.
 *
 * 실측(2026-09-08 `_nurse42`): 무쇠시티 포켓몬센터(맵 48)의 배치표 9명 가운데
 * **9명이 전부 숨어** 명부가 비었고, 그래서 간호사에게 영영 말을 못 걸었다 —
 * 일곱이 `flag: 0`이고 나머지 둘은 제 플래그(387·388)가 서 있었다. 세이브
 * 바이트가 그 자리를 가른다: 떡잎시티(`seg-08`)에서 0x04였던 첫 바이트가
 * 무쇠시티(`seg-09`)에서 0x05가 됐다
 */
const NULL_FLAG = 0

/**
 * 도감을 받았는가. 시작 메뉴의 첫 줄이 이 비트 하나로 있고 없다.
 *
 * 번호는 `vars_flags.txt`를 C enum처럼 세어서 나온 값이다(`=` 줄은 세지 않고
 * 이름만 있는 줄이 하나씩 올라간다). 셋이 맞아떨어져야 믿는다 —
 * `FLAG_UNUSED_0x054E`가 0x54E로, `TRAINER_DEFEATED_FLAGS_START`가
 * `commands.ts`의 1360으로, `VARS_START`가 0x4000으로 떨어진다
 */
export const FLAG_HAS_POKEDEX = 144

/** 명령 결과가 들어오는 자리. `GoToIfEq VAR_RESULT, ...`가 이걸 본다 */
export const VAR_RESULT = 0x800c
/** 방금 말을 건 상대의 local ID */
export const VAR_LAST_TALKED = 0x800d

/**
 * 변수·플래그 저장소.
 *
 * 세이브에 남는 부분과 스크립트 지역 부분을 한 객체에 담되 **따로 들고 있는다** —
 * 지역 칸은 스크립트가 끝나면 의미가 없고 세이브에 나가면 안 된다.
 */
export class VarStore {
  readonly saved: Uint16Array
  readonly flags: Uint8Array
  readonly local: Uint16Array

  constructor(saved?: Uint16Array, flags?: Uint8Array) {
    this.saved = saved ?? new Uint16Array(SAVED_VAR_COUNT)
    this.flags = flags ?? new Uint8Array(Math.ceil(FLAG_COUNT / 8))
    this.local = new Uint16Array(LOCAL_VAR_COUNT)
  }

  /**
   * 번호가 가리키는 값.
   *
   * 변수가 아니면 **번호 자체가 값**이다 — 원작의 `FieldSystem_TryGetVar`가
   * 그렇게 한다. 이걸 0으로 떨어뜨리면 상수 인자가 전부 0이 된다
   */
  get(id: number): number {
    if (id < VARS_START) return id
    if (id < SCRIPT_LOCAL_VARS_START) return this.saved[id - VARS_START] ?? 0
    return this.local[id - SCRIPT_LOCAL_VARS_START] ?? 0
  }

  /** 상수 자리에 쓰려 하면 조용히 버린다 — 원작도 널 포인터라 아무 일이 없다 */
  set(id: number, value: number): void {
    const v = value & 0xffff
    if (id < VARS_START) return
    if (id < SCRIPT_LOCAL_VARS_START) {
      const at = id - VARS_START
      if (at < this.saved.length) this.saved[at] = v
      return
    }
    const at = id - SCRIPT_LOCAL_VARS_START
    if (at < this.local.length) this.local[at] = v
  }

  checkFlag(id: number): boolean {
    if (id === NULL_FLAG) return false
    const byte = this.flags[id >> 3]
    return byte !== undefined && (byte & (1 << (id & 7))) !== 0
  }

  setFlag(id: number): void {
    if (id === NULL_FLAG) return
    if (id >> 3 < this.flags.length) this.flags[id >> 3]! |= 1 << (id & 7)
  }

  clearFlag(id: number): void {
    if (id === NULL_FLAG) return
    if (id >> 3 < this.flags.length) this.flags[id >> 3]! &= ~(1 << (id & 7))
  }

  /** 스크립트 한 판이 시작될 때 지역 칸을 비운다 */
  resetLocals(): void {
    this.local.fill(0)
  }

  /** 새 게임. 세 벌을 다 비운다 — 이전 판의 플래그가 한 칸이라도 남으면 안 된다 */
  reset(): void {
    this.saved.fill(0)
    this.flags.fill(0)
    this.local.fill(0)
  }
}
