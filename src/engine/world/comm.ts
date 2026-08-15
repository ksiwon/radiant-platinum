// 통신은 없다 (PARITY §9.4)
//
// 상대가 있어야 성립하는 것은 전부 범위 밖이다 — 통신교환·통신대전·유니온룸·
// GTS·Wi-Fi 광장·미스터리기프트·팔파크. 문제는 **없는 것과 안 되는 것이
// 다르다**는 점이다. 원작 스크립트는 접수원에게 말을 걸면 메뉴를 띄우고,
// 「예」를 고르면 저장까지 하고 문을 연다. 그 문 너머에 우리는 아무것도 안
// 붙였으니, 안 막으면 **카운터 뒤에 갇힌다** (실측: 유니온룸 갈래가 주인공을
// 통행 불가인 카운터 줄 너머 (8,2)로 걸어 보낸다).
//
// ⚠️ **문을 새로 잠그지 않는다.** 원작에는 통신이 실패했을 때의 말이 이미
// 있다 — 「통신 오류. 처음부터 다시…」와 「또 오세요」다. 우리가 하는 일은
// **그 답을 하게 만드는 것**뿐이고, 지어낸 글은 한 줄도 없다. 리본신드롬을
// 닫은 방법과 같다 (§9.2).
//
// 여기 있는 것은 그 답의 값과, 답이 없는 자리 하나의 이름표다.

/**
 * 통신 클럽이 스크립트에 돌려주는 값 (`COMM_CLUB_RET_*`).
 *
 * `StartBattleClient`·`StartBattleServer`가 `VAR_RESULT`에 적고, 스크립트가
 * 그 값으로 갈린다. **`ERROR`가 우리 답이다** — 원작이 제 대사로 닫는다.
 */
export const COMM_CLUB_RET = {
  /** 아직 안 끝났다. 이 값이면 스크립트가 계속 기다린다 — 우리는 안 쓴다 */
  pending: 0,
  cancel: 1,
  unused2: 2,
  error: 3,
  visitAgain: 4,
} as const

/**
 * 유니온룸 접수원의 scriptID (`SCRIPT_ID(POKEMON_CENTER_2F_COMMON, 3)`).
 *
 * ⚠️ **여기 한 자리만 답할 명령이 없다.** 콜로세움은 `StartBattleClient`가,
 * GTS는 `TryStartGTSApp`이, 팔파크는 `GetGBACartridgeVersion`이 「안 된다」를
 * 말할 자리인데, 유니온룸은 문 여는 조건이 **저장이 끝났는가**뿐이다:
 *
 *     SetFlag FLAG_COMMUNICATION_CLUB_ACCESSIBLE
 *     Common_SaveGame
 *     SetVar VAR_RESULT, VAR_MAP_LOCAL_0x00
 *     GoToIfEq VAR_RESULT, 1, EnterUnionRoom   ← 여기가 열리면 갇힌다
 *     SetVar VAR_COMMUNICATION_LOAD_ACTION, 0
 *     ClearFlag FLAG_COMMUNICATION_CLUB_ACCESSIBLE
 *     GoTo Exit                                ← 「또 오세요」
 *
 * 그래서 **이 스크립트가 부른 저장만** 「안 됐다」로 답한다 (`TrySaveGame`).
 * 리포트는 진짜로 쓴다 — 거짓말이 아니라 넘겨주지 않는 것이다. 그러면 원작이
 * 깃발을 스스로 내리고 제 대사로 돌려보낸다.
 *
 * ⚠️ **깃발로 재지 않는다.** 바로 위의 `SetFlag`를 보면 될 것 같지만,
 * 깃발은 **리포트에 남는 상태**라 어디선가 세워 둔 채 끝나면 그때부터 저장이
 * 통째로 막힌다 — 통신 콘테스트 문도 같은 깃발을 세운다
 * (`scripts_contests.s`의 `Contests_LinkContestDoor`). 지금 도는 스크립트
 * 번호는 남지 않으므로 그런 사고가 날 수 없다.
 */
export const SCRIPT_UNION_ROOM_ATTENDANT = 9003

/**
 * 통신 전용 맵 — 우리가 절대 안 들어가는 곳.
 *
 * 걸어서 닿을 수 없다는 것을 `comm.test.ts`가 잰다. 목록을 두는 이유는
 * 「없다」가 아니라 **「어디가 없는지」**를 적어 두기 위해서다.
 */
export const COMM_MAPS = {
  unionRoom: 466,
  wifiPlazaEntrance: 586,
} as const

/** 팔파크는 GBA 팩을 꽂아야 열린다. 꽂힌 팩이 없다 (`gSystem.gbaCartridgeVersion`) */
export const GBA_CARTRIDGE_NONE = 0
