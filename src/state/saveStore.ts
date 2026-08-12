// 세이브 상태 (PLAN §3.2 ①). React 리렌더는 저빈도라 zustand로 충분하다.
// 프레임 단위 값(좌표 등)은 절대 여기 넣지 않는다. worldState가 담당한다.
//
// ⚠️ **저절로 저장되지 않는다.** 예전에는 zustand persist가 값이 바뀔 때마다
// IndexedDB에 썼는데, 그러면 "리포트"라는 것이 의미가 없다 — 리포트를 안 쓰고
// 꺼도 다음에 켜면 걸어 둔 자리에 그대로 서 있다. 원작은 리포트를 쓴 그 순간만
// 남긴다. 디스크로 나가는 문은 `report()` 하나뿐이다 (`state/report.ts`).
import { create } from 'zustand'
import {
  backupReport, clearReport, readReport, readReportDetailed, writeReportVerified,
} from './report'
import { downloadPortable, saveFileName, type DownloadOutcome } from './save/download'
import {
  buildPortable, buildPortableRaw, explainFailure, parsePortable, type PortableSave,
} from './save/portable'
import { compareContract, type Compatibility } from './save/contract'
import { migrateSave } from './save/migrate'

// 도감 비트필드는 엔진이 갖는다 — 세이브 스키마가 그 크기를 알아야 하는데
// 여기서 가져가면 `saveStore → report → slots → schema → saveStore` 고리가
// 생기고 ESM이 상수를 TDZ로 만든다. 부르는 쪽이 안 바뀌게 그대로 다시 내보낸다
export { DEX_BYTES, dexHas, dexSet } from '../engine/pokemon/dex'
export type { DexField } from '../engine/pokemon/dex'
import { DEX_BYTES, dexSet, type DexField } from '../engine/pokemon/dex'
import { dayNumber, newDaily, type DailyState } from '../engine/world/daily'
import { newDaycare, type DaycareState } from '../engine/pokemon/breeding'
import {
  newRecentRoutes, newRoamers, type RecentRoutes, type Roamer,
} from '../engine/world/roamer'
import { newJournal, type JournalEntry } from '../engine/world/journal'

/** 스크립트 플래그 4106개를 담는 바이트 수 */
export const FLAG_BYTES = Math.ceil(FLAG_COUNT / 8)

export interface TrainerInfo {
  name: string
  gender: 'boy' | 'girl'
  id: number
  secretId: number
  playtimeMs: number
}

/**
 * 개체에 새길 원래 트레이너.
 *
 * ⚠️ 낱말이 다르다. 주인공은 `boy`/`girl`인데(주인공 모델을 가르는 값이다)
 * 개체에 들어가는 것은 `MON_DATA_OT_GENDER`, 즉 `GENDER_MALE`/`GENDER_FEMALE`다.
 * 요약 화면이 그 값으로 이름 색을 가른다 — 남자 파랑, 여자 빨강
 */
export function playerTrainer(info: TrainerInfo): { name: string; gender: 'male' | 'female' } {
  return { name: info.name, gender: info.gender === 'boy' ? 'male' : 'female' }
}

// 개체 모델은 엔진이 갖는다 — 능력치·경험치 계산이 붙어 있고 배틀에서도 같은 것을
// 쓴다. 여기서 다시 정의하면 두 벌이 어긋난다.
import { PARTY_MAX, type PokemonInstance, type Status } from '../engine/pokemon/instance'

import {
  clampFriendship, NO_EGG_LOCATION, withFriendshipBonus,
} from '../engine/pokemon/friendship'
import { FLAG_COUNT, SAVED_VAR_COUNT } from '../engine/script/vars'

/**
 * 친밀도가 오를 때 얹는 보정 중 **개체가 모르는 것**.
 *
 * 볼과 알 자리는 개체에 있지만 지금 어느 맵인지와 소지품의 홀드 효과는
 * 세이브 스토어가 알 수 없다 — 도구표도 월드도 여기서 안 본다
 */
export interface FriendshipContext {
  /** 지금 맵 헤더 번호. 알을 받은 자리와 같으면 +1 */
  mapId?: number
  /** 평온의방울(`HOLD_EFFECT_FRIENDSHIP_UP`)을 들고 있는가 — 1.5배 */
  soothing?: boolean
}

export type { PokemonInstance }

// 가방은 사전이 아니라 **주머니 8개 × 칸**이다. 원작이 그렇고, 그 모양이
// 화면에도 그대로 드러난다 (칸 수 상한·번호순 정렬)
import { addItem, emptyBag, removeItem, type Pockets } from '../engine/bag/bag'

// 보관 시스템도 엔진이 갖는다 — 18 × 30이라는 모양과 "지금 박스에서 시작해
// 한 바퀴"라는 규칙이 원작 코드에서 나온 것이라, 스토어가 다시 적으면 두 벌이 된다
import {
  BOX_COUNT, defaultWallpaper, emptyBoxes, store as storeInBox, swapSlots, withSlot,
  type Boxes, type BoxSpot,
} from '../engine/pokemon/boxes'

/**
 * 스크립트 플래그·변수 (DATA.md §2.10).
 *
 * 이름표 붙은 불리언 묶음이 아니라 **원작과 같은 번호 공간**이다. 스크립트가
 * `SetFlag 342`처럼 번호로 쓰고, 그 번호가 NPC의 등장 조건이기도 하다 —
 * 우리가 이름을 새로 지으면 그 고리가 끊긴다.
 */
export type SaveFlags = Uint8Array<ArrayBuffer>
export type SaveVars = Uint16Array<ArrayBuffer>

export interface SaveData {
  version: number
  trainer: TrainerInfo
  /** 라이벌 이름. 대사에 끼워 넣는다 (`BufferRivalName`) */
  rivalName: string
  party: PokemonInstance[]
  /** 보관 시스템 18박스 × 30칸. 빈 자리는 null이다 (`engine/pokemon/boxes`) */
  boxes: Boxes
  /**
   * 지금 열려 있는 박스 (`PCBoxes.currentBoxID`).
   *
   * 장식이 아니다 — 잡은 포켓몬이 **여기부터** 자리를 찾는다. 박스를 옮겨 두면
   * 잡히는 자리도 따라 옮겨진다
   */
  currentBox: number
  /** 박스마다의 벽지 번호 (`PCBoxes.wallpapers`) */
  wallpapers: number[]
  bag: Pockets
  badges: number // 비트마스크
  /**
   * 도감 비트필드.
   *
   * `battled`는 원작에 없는 칸이다 — **BDSP의 상성 표시**가 그걸 본다
   * (PARITY §2.22). 「효과가 굉장함」은 아무 때나 뜨지 않고, 잡았거나 쓰러뜨려
   * 본 종에게만 뜬다. `seen`으로는 못 가른다 — 지금 눈앞의 상대는 이미
   * 본 것이다
   */
  pokedex: { seen: DexField; caught: DexField; battled: DexField }
  /**
   * 전국도감을 켰는가 (`Pokedex_IsNationalDexObtained`).
   *
   * 스크립트가 `GetSetNationalDexEnabled`로 켜고 묻는다 — 마박사의 PC가 뭘로
   * 뜨는지, 파크에 들어갈 수 있는지가 이 값으로 갈린다
   */
  nationalDex: boolean
  /** 스크립트 플래그 4106개 */
  flags: SaveFlags
  /** 스크립트 변수 288칸 */
  vars: SaveVars
  /**
   * 지금 서 있는 자리. 리포트를 쓸 때 여기 값이 남는다.
   *
   * 엔진과 **같은 번호 체계**다 — `map`은 맵 헤더 번호, `matrix`는 그 맵이 선
   * 격자 번호다. 워프가 쓰는 것과 같은 짝이라 되돌아갈 때 그대로 넘겨주면 된다
   */
  position: { map: number; matrix: number; x: number; z: number; facing: number }
  money: number
  /**
   * 전멸했을 때 깨어날 자리 (`FieldOverworldState_SetBlackOutWarpId`).
   *
   * `spawns.json`의 번호다. 포켓몬센터에 **들어서면** 여기가 갈린다 —
   * 간호사에게 말을 걸 필요가 없다(`FieldMapChange_UpdateGameData`)
   */
  healSpot: number
  /** 열린 공중날기 자리들. `spawns.json`의 번호를 비트로 든다 */
  flySpots: number
  /**
   * 러닝슈즈를 받았는가 (`PlayerData_HasRunningShoes`).
   *
   * ⚠️ **플래그가 아니다.** 이것만 `PlayerData`의 칸이라 스크립트 플래그 배열에
   * 없다. 엄마가 201번도로에서 돌아온 뒤에 준다 — 그전에는 못 뛴다
   */
  runningShoes: boolean
  /**
   * 걸음이 쌓이는 자리 (PARITY §1.1) — `Field_ProcessStep`.
   *
   * 친밀도 걸음은 여기 없다. 원작이 그것만 스크립트 변수로 두었고
   * (`VAR_FRIENDSHIP_INCREMENT_STEP_COUNTER`) 우리도 같은 칸을 쓴다 —
   * 새 칸을 만들면 같은 값이 두 군데 생긴다
   */
  steps: {
    /** 0~3. 0으로 돌아오는 걸음마다 독이 1씩 깎는다 */
    poison: number
    /** 남은 리펠 걸음 */
    repel: number
  }
  /**
   * 동굴탈출로프가 데려다 놓을 자리 (`FieldOverworldState_GetExitLocation`).
   *
   * **오버월드에서 굴로 들어선 그 칸**이다. 원작은 행렬 0(신오 본판)에 있다가
   * 아닌 맵으로 넘어갈 때 그 자리를 적어 둔다 (`Field_TrySetMapConnection`).
   * 아직 한 번도 안 들어갔으면 null이고, 그때는 로프를 못 쓴다
   */
  exit: { map: number; matrix: number; x: number; z: number; facing: number } | null
  /**
   * 불어 둔 피리 (PARITY §1.22) — 0 없음 · 1 검은(÷2) · 2 하얀(×1.5).
   *
   * ⚠️ **걸음이 아니라 맵으로 끝난다.** 워프 한 번이면 풀린다
   */
  flute: number
  /**
   * 날마다 바뀌는 것 (PARITY §6.11) — 빈티나 칸·무리·대습초원·트로피가든.
   *
   * 씨앗 하나가 넷을 다 정한다. 새 게임에서 뽑고, 날이 넘어갈 때만 굴린다
   */
  daily: DailyState
  /**
   * 육성가 (PARITY §3.3). 두 자리와 알 하나.
   *
   * 맡긴 마리는 파티에서 **빠진다** — 원작도 그렇고, 그래서 한 마리만 남기고
   * 맡기려 하면 막힌다
   */
  daycare: DaycareState
  /**
   * 배회 포켓몬 여섯 자리 (PARITY §6.3). 신오에서 실제로 도는 것은 둘이다.
   *
   * 자리마다 개체가 통째로 들어 있다 — 도망친 배회는 **맞은 만큼을 들고**
   * 다른 도로에서 다시 나온다
   */
  roamers: Roamer[]
  /** 방금 떠나온 맵. 배회가 그리로는 안 간다 (`PlayerRecentRoutes`) */
  recentRoutes: RecentRoutes
  /**
   * 모험노트 열 쪽 (PARITY §7.4). 0번이 오늘이고 뒤로 갈수록 옛날이다.
   *
   * ⚠️ **노트를 받기 전에는 아무것도 안 적힌다.** 자리는 새 게임부터 있지만
   * 축복시티에서 받기 전까지 `journalAcquired` 플래그가 안 서 있어서 비어 있다
   */
  journal: JournalEntry[]
}

export const SAVE_VERSION = 16

/** 원작 상한. 이걸 넘으면 돈이 안 늘어난다 */
export const MAX_MONEY = 999999

/**
 * 새 게임이 시작되는 자리 (`src/location.c`의 `sPlayerStartLocation`).
 *
 * 떡잎마을 주인공 집 2층. 맵 번호는 디컴프의 `map_headers.txt` 줄 순서와 우리
 * 표가 411~418에서 그대로 겹쳐서 확정된다 (411 T01 = TWINLEAF_TOWN,
 * 415 T01R0202 = TWINLEAF_TOWN_PLAYER_HOUSE_2F).
 *
 * ⚠️ 좌표와 방향은 **우리 단위로 옮긴 값이다.** 원작은 `x = 4, z = 6,
 * faceDirection = FACE_UP`인데,
 *
 *   · 우리 좌표는 칸의 **가운데**를 가리킨다 — 워프도 `x + 0.5`로 세운다
 *   · 우리 `facing`은 라디안이고 `atan2(vx, vz)`라 0이 남쪽이다. 북쪽이 π다
 *
 * 그대로 두면 주인공이 칸 모서리에 서서 **문 쪽(남쪽)을 보고** 시작한다
 */
export const START_LOCATION = {
  map: 415, matrix: 129, x: 4.5, z: 6.5, facing: Math.PI,
} as const

export function createNewSave(): SaveData {
  return {
    version: SAVE_VERSION,
    // 이름은 비워 둔다. 원작은 인트로에서 짓게 하고, 그 화면이 붙기 전까지는
    // 씬이 롬의 제안 이름 첫 줄을 넣어 준다 (`MapStreamer`) — 우리가 이름을
    // 지어내지 않으려는 것이다.
    //
    // 트레이너 번호는 진짜 난수여야 한다. 0으로 두면 잡은 포켓몬이 전부 "다른
    // 사람이 잡은 것"이 아니라 같은 번호를 갖게 되고, 이로치 판정도 한쪽으로 쏠린다
    trainer: {
      name: '',
      gender: 'girl',
      id: Math.floor(Math.random() * 0x10000),
      secretId: Math.floor(Math.random() * 0x10000),
      playtimeMs: 0,
    },
    rivalName: '',
    party: [],
    boxes: emptyBoxes(),
    currentBox: 0,
    wallpapers: Array.from({ length: BOX_COUNT }, (_, i) => defaultWallpaper(i)),
    // 원작도 빈 가방으로 시작한다. 몬스터볼은 예진호수에서 마박사가 준다
    bag: emptyBag(),
    badges: 0,
    pokedex: {
      seen: new Uint8Array(DEX_BYTES),
      caught: new Uint8Array(DEX_BYTES),
      battled: new Uint8Array(DEX_BYTES),
    },
    nationalDex: false,
    flags: new Uint8Array(FLAG_BYTES),
    vars: new Uint16Array(SAVED_VAR_COUNT),
    position: { ...START_LOCATION },
    money: 3000,
    // 0번이 떡잎마을 주인공 집이다 — 원작도 센터에 가기 전엔 집에서 깨어난다
    healSpot: 0,
    flySpots: 0,
    // 러닝슈즈는 201번도로에서 돌아온 뒤 엄마가 준다 (`GiveRunningShoes`)
    runningShoes: false,
    steps: { poison: 0, repel: 0 },
    exit: null,
    flute: 0,
    // 씨앗은 새 게임에서 한 번만 뽑는다 (`game_start.c`의 `MTRNG_Next()`).
    // 그 뒤로는 날이 넘어갈 때만 굴러간다 (PARITY §6.11)
    daily: newDaily(Math.floor(Math.random() * 0x100000000), dayNumber(new Date())),
    daycare: newDaycare(),
    roamers: newRoamers(),
    recentRoutes: newRecentRoutes(),
    journal: newJournal(),
  }
}

interface SaveStore extends SaveData {
  /** 리포트를 한 번 찾아봤는가. IndexedDB가 비동기라 첫 프레임에는 아직이다 */
  hydrated: boolean
  /** 이 판이 리포트에서 이어 온 것인가. 타이틀이 "이어하기"를 띄울지 정한다 */
  loaded: boolean
  /**
   * 필드가 뜨면 `scripts_init_new_game`을 돌려야 한다.
   *
   * 인트로가 세우고 `MapStreamer`가 내린다. 스크립트 자료는 필드가 뜰 때 오므로
   * 인트로 화면에서는 아직 못 돌린다
   */
  pendingInit: boolean
  markSeen: (dexNo: number) => void
  markCaught: (dexNo: number) => void
  /** 쓰러뜨려 봤다고 적는다. 상성 표시가 이걸 본다 */
  markBattled: (dexNo: number) => void
  /** 전국도감을 켠다 (`Pokedex_ObtainNationalDex`) */
  obtainNationalDex: () => void
  /** 스크립트 한 판이 끝날 때 그 결과를 통째로 받는다 */
  commitScriptState: (vars: ArrayLike<number>, flags: ArrayLike<number>) => void
  addPlaytime: (ms: number) => void
  /** 넣는다. 자리가 없으면 false — 스크립트가 그 결과로 갈린다 */
  addItem: (pocket: number, item: number, count: number) => boolean
  removeItem: (pocket: number, item: number, count: number) => boolean
  addMoney: (amount: number) => void
  /** 낸다. 모자라면 false */
  spendMoney: (amount: number) => boolean
  /**
   * 파티 두 마리의 자리를 바꾼다.
   *
   * 맨 앞이 **선두**다 — 배틀에 먼저 나가고 야생 조우의 레벨 판정도 그 마리가
   * 기준이라, 순서는 화면 장식이 아니다
   */
  swapParty: (a: number, b: number) => void
  /**
   * 파티 뒤에 한 마리를 붙인다 (`Party_AddPokemon`).
   *
   * ⚠️ **가득 차 있으면 부르는 쪽이 먼저 막아야 한다.** 원작도 여기서 실패를
   * 돌려주고 스크립트가 그 값으로 갈라진다 — 박스로 넘기지 않는다
   */
  addToParty: (mon: PokemonInstance) => void
  /**
   * 친밀도를 올린다. 0~255에서 멈춘다 (`MAX_FRIENDSHIP_VALUE`).
   *
   * 올라갈 때는 보정 셋이 붙는다 — 럭셔리볼 · 알을 받은 자리 · 평온의방울
   * (`pokemon/friendship`). 볼과 알 자리는 여기 개체가 알고 있지만 **지금 맵과
   * 소지품의 홀드 효과는 모르므로** 부르는 쪽이 넘긴다 (`scene/fieldServices`)
   */
  addFriendship: (slot: number, amount: number, bonus?: FriendshipContext) => void
  /** 뱃지 하나 (`TrainerInfo_SetBadge`). 비전머신 자격이 여기 걸려 있다 */
  giveBadge: (badge: number) => void
  /** 박스를 넘긴다. 잡은 포켓몬이 이 박스부터 자리를 찾는다 */
  setCurrentBox: (box: number) => void
  /**
   * 파티 한 마리를 박스로 보낸다 (`CommonScript_DepositPokemon`).
   *
   * ⚠️ **마지막 한 마리는 못 맡긴다.** 파티가 비면 야생과 마주쳤을 때 내보낼
   * 것이 없다 — 원작이 "싸울 포켓몬이 없어집니다!"로 막는 자리다.
   * 자리가 없거나 그 한 마리면 null
   */
  depositMon: (index: number) => BoxSpot | null
  /** 박스 한 마리를 파티로 꺼낸다. 파티가 6마리면 false */
  withdrawMon: (at: BoxSpot) => boolean
  /** 박스 안에서, 또는 박스끼리 자리를 바꾼다 */
  swapBoxSlots: (a: BoxSpot, b: BoxSpot) => void
  /** 부활 지점을 옮긴다. 포켓몬센터에 들어서면 씬이 부른다 */
  setHealSpot: (index: number) => void
  /** 공중날기 자리를 연다 */
  unlockFly: (index: number) => void
  /**
   * 파티 전원을 회복한다 — 포켓몬센터가 하는 일이다.
   *
   * HP 최댓값은 종족값 표가 있어야 나오고 그 표는 비동기로 온다. 그래서
   * **계산은 바깥이 하고** 여기서는 받은 값을 넣기만 한다
   */
  healParty: (full: (mon: PokemonInstance) => { hp: number; pp: number[] }) => void
  /**
   * 그 자리의 상태이상만 바꾼다 (`Pokemon_SetValue(MON_DATA_STATUS)`).
   *
   * 필드에서 독이 풀리는 자리가 여기다 (`Pokemon_TrySurvivePoison`) —
   * 배틀은 제 상태를 따로 들고 끝날 때 여기로 되돌려 놓는다
   */
  setStatus: (slot: number, status: Status) => void
  /**
   * 별명을 바꾼다 (`OpenPokemonNamingScreen`).
   *
   * 빈 이름은 **안 지은 것**이다 — 원작도 이름을 비우면 종족 이름으로
   * 되돌리므로, 우리 개체의 `nickname`을 지워 두면 화면이 종족 이름을 쓴다
   */
  renameMon: (slot: number, nickname: string) => void
  /**
   * 리포트를 쓴다. **디스크로 나가는 유일한 문이다.**
   *
   * 자리는 인자로 받는다 — 좌표는 프레임 상태(`worldState`)에 있고 이 스토어가
   * 그것을 알면 저빈도/고빈도 경계가 무너진다
   */
  report: (position: SaveData['position']) => Promise<ReportOutcome>
  /** 리포트를 읽어 그 자리에서 이어한다. 없으면 false */
  loadReport: () => Promise<boolean>
  /**
   * 지금 리포트를 `.rpsave` 파일로 받는다.
   *
   * 못 읽는 리포트여도 **원본 그대로** 내보낸다 — 버리는 것보다 낫다
   */
  exportReport: () => Promise<ExportOutcome>
  /** 파일을 열어 보기만 한다. 아직 아무것도 안 바꾼다 */
  previewImport: (text: string) => ImportPreview
  /** 미리 본 것을 실제로 들인다. 실패하면 기존 리포트는 그대로다 */
  commitImport: (preview: ImportPreview & { ok: true }) => Promise<ImportOutcome>
  /**
   * 처음부터. 리포트도 같이 지운다 — 안 지우면 다음에 켤 때 옛 판이 되살아난다.
   *
   * ⚠️ **지우기 전에 백업을 시도한다** (IMPORT.md §11 끝). 파일 다운로드와
   * IndexedDB 백업 슬롯 둘 다 — 둘 중 하나는 남을 확률을 올린다
   */
  resetSave: (options?: { backup?: boolean }) => Promise<void>
}

/** 리포트 한 번의 결과. **내부 저장과 파일 백업이 따로다** (IMPORT.md §10) */
export interface ReportOutcome {
  saved: boolean
  /** 내부 저장이 실패한 이유. 성공이면 없다 */
  why?: string
  /** 파일 다운로드를 시작했는가. 막혀도 위의 `saved`를 취소하지 않는다 */
  backup: DownloadOutcome
  fileName: string
}

export type ExportOutcome =
  | { kind: 'none' }
  | { kind: 'done'; outcome: DownloadOutcome; fileName: string; raw: boolean }

export type ImportPreview =
  | { ok: false; why: string }
  | {
      ok: true
      envelope: PortableSave
      save: SaveData
      migrated: boolean
      contract: Compatibility
    }

export type ImportOutcome =
  | { ok: true; backedUp: DownloadOutcome }
  | { ok: false; why: string }

/**
 * 인트로가 끝났다. 이름·성별·라이벌 이름을 적고 판을 연다.
 *
 * 플래그는 **여기서 안 세운다** — 필드가 뜰 때 `scripts_init_new_game`이 돈다
 * (`MapStreamer`). 그 표를 손으로 옮기면 130여 줄을 베끼는 것이고, 우리는 이미
 * 그 바이트코드를 싣고 있다
 */
export function startNewGame(
  who: { name: string; gender: TrainerInfo['gender']; rivalName: string },
): void {
  const fresh = createNewSave()
  useSaveStore.setState({
    ...fresh,
    trainer: { ...fresh.trainer, name: who.name, gender: who.gender },
    rivalName: who.rivalName,
    hydrated: true,
    loaded: false,
    /** 필드가 뜨면 새 게임 초기화를 돌려야 한다 */
    pendingInit: true,
  })
}

/**
 * 이 한 마리를 빼면 싸울 것이 없어지는가 (`BoxAppMan_OnLastAliveMon`).
 *
 * ⚠️ **마릿수가 아니라 살아 있는 수를 센다.** "여섯 마리 중 다섯이 기절"이면
 * 남은 하나를 못 맡긴다. 거꾸로 **기절한 마리는 하나뿐이어도 맡길 수 있다** —
 * 원작이 옮기려는 그 마리의 HP까지 함께 보기 때문이다
 */
function lastAliveMon(party: readonly PokemonInstance[], index: number): boolean {
  if ((party[index]?.hp ?? 0) <= 0) return false
  return party.filter((mon) => mon.hp > 0).length < 2
}

/** 상태 필드만. 액션은 저장하지 않는다 */
function snapshot(s: SaveStore, position: SaveData['position']): SaveData {
  return {
    version: SAVE_VERSION,
    trainer: s.trainer,
    rivalName: s.rivalName,
    party: s.party,
    boxes: s.boxes,
    currentBox: s.currentBox,
    wallpapers: s.wallpapers,
    bag: s.bag,
    badges: s.badges,
    pokedex: s.pokedex,
    nationalDex: s.nationalDex,
    flags: s.flags,
    vars: s.vars,
    position,
    money: s.money,
    healSpot: s.healSpot,
    flySpots: s.flySpots,
    runningShoes: s.runningShoes,
    steps: s.steps,
    exit: s.exit,
    flute: s.flute,
    daily: s.daily,
    daycare: s.daycare,
    roamers: s.roamers,
    recentRoutes: s.recentRoutes,
    journal: s.journal,
  }
}

export const useSaveStore = create<SaveStore>()(
    (set) => ({
      ...createNewSave(),
      hydrated: false,
      loaded: false,
      pendingInit: false,

      markSeen: (dexNo) =>
        set((s) => ({ pokedex: { ...s.pokedex, seen: dexSet(s.pokedex.seen, dexNo) } })),

      obtainNationalDex: () => { set({ nationalDex: true }) },

      markCaught: (dexNo) =>
        set((s) => ({
          pokedex: {
            seen: dexSet(s.pokedex.seen, dexNo), // 잡았으면 본 것이기도 하다
            caught: dexSet(s.pokedex.caught, dexNo),
            // 잡은 것도 「상대해 봤다」다. BDSP의 상성 표시가 그 둘을 같이 본다
            battled: dexSet(s.pokedex.battled, dexNo),
          },
        })),

      markBattled: (dexNo) =>
        set((s) => ({
          pokedex: {
            seen: dexSet(s.pokedex.seen, dexNo),
            caught: s.pokedex.caught,
            battled: dexSet(s.pokedex.battled, dexNo),
          },
        })),

      // 복사해서 넣는다 — 엔진 쪽 배열은 프레임마다 제자리에서 바뀌므로
      // 그대로 두면 스토어가 변화를 못 보고 저장도 안 된다
      commitScriptState: (vars, flags) =>
        set({ vars: Uint16Array.from(vars), flags: Uint8Array.from(flags) }),

      addPlaytime: (ms) =>
        set((s) => ({ trainer: { ...s.trainer, playtimeMs: s.trainer.playtimeMs + ms } })),

      addItem: (pocket, item, count) => {
        const next = addItem(useSaveStore.getState().bag, pocket, item, count)
        if (next === null) return false
        set({ bag: next })
        return true
      },

      removeItem: (pocket, item, count) => {
        const next = removeItem(useSaveStore.getState().bag, pocket, item, count)
        if (next === null) return false
        set({ bag: next })
        return true
      },

      addMoney: (amount) =>
        set((s) => ({ money: Math.min(MAX_MONEY, s.money + amount) })),

      swapParty: (a, b) =>
        set((st) => {
          if (a === b || a < 0 || b < 0 || a >= st.party.length || b >= st.party.length) return st
          const party = [...st.party]
          const held = party[a]!
          party[a] = party[b]!
          party[b] = held
          return { party }
        }),

      setCurrentBox: (box) => {
        set({ currentBox: ((box % BOX_COUNT) + BOX_COUNT) % BOX_COUNT })
      },

      depositMon: (index) => {
        const st = useSaveStore.getState()
        const mon = st.party[index]
        if (!mon || lastAliveMon(st.party, index)) return null
        const put = storeInBox(st.boxes, st.currentBox, mon)
        if (put === null) return null
        set({ boxes: put.boxes, party: st.party.filter((_, i) => i !== index) })
        return put.at
      },

      withdrawMon: (at) => {
        const st = useSaveStore.getState()
        const mon = st.boxes[at.box]?.[at.slot]
        if (!mon || st.party.length >= PARTY_MAX) return false
        set({ boxes: withSlot(st.boxes, at, null), party: [...st.party, mon] })
        return true
      },

      swapBoxSlots: (a, b) => {
        set((st) => ({ boxes: swapSlots(st.boxes, a, b) }))
      },

      addToParty: (mon) => {
        set((st) => (st.party.length >= PARTY_MAX ? st : { party: [...st.party, mon] }))
      },

      renameMon: (slot, nickname) => {
        set((st) => ({
          party: st.party.map((mon, i) => (
            i === slot ? { ...mon, nickname: nickname || null } : mon)),
        }))
      },

      setStatus: (slot, status) => {
        set((st) => ({
          party: st.party.map((mon, i) => (i === slot ? { ...mon, status, statusTurns: 0 } : mon)),
        }))
      },

      addFriendship: (slot, amount, bonus) => {
        set((st) => ({
          party: st.party.map((mon, i) => {
            if (i !== slot) return mon
            // 보정은 `Pokemon_UpdateFriendship` 그대로다 — 올라갈 때만 붙는다
            const delta = withFriendshipBonus(amount, {
              ball: mon.ball,
              eggLocation: NO_EGG_LOCATION,
              mapId: bonus?.mapId ?? -1,
              soothing: bonus?.soothing ?? false,
            })
            return { ...mon, friendship: clampFriendship(mon.friendship + delta) }
          }),
        }))
      },

      giveBadge: (badge) => { set((st) => ({ badges: st.badges | (1 << badge) })) },

      setHealSpot: (index) => { set({ healSpot: index }) },

      unlockFly: (index) =>
        set((st) => ({ flySpots: st.flySpots | (1 << index) })),

      healParty: (full) =>
        set((st) => ({
          party: st.party.map((mon) => {
            const { hp, pp } = full(mon)
            return {
              ...mon,
              hp,
              status: 'ok' as const,
              moves: mon.moves.map((slot, i) => ({ ...slot, pp: pp[i] ?? slot.pp })),
            }
          }),
        })),

      spendMoney: (amount) => {
        const { money } = useSaveStore.getState()
        if (money < amount) return false
        set({ money: money - amount })
        return true
      },

      report: async (position) => {
        const data = snapshot(useSaveStore.getState(), position)
        const at = new Date()
        const fileName = saveFileName(data.trainer.name, at)

        const written = await writeReportVerified(data)
        if (!written.ok) {
          return { saved: false, why: written.why, backup: { started: false, why: 'blocked' }, fileName }
        }
        set({ position, loaded: true })

        // ⚠️ **내부 저장이 끝난 뒤에 받는다.** 순서를 뒤집으면 다운로드가 막혔을 때
        // 리포트까지 실패한 것처럼 보인다 — 둘은 별개의 성공이다 (IMPORT.md §10)
        return { saved: true, backup: downloadPortable(buildPortable(data, at), fileName), fileName }
      },

      loadReport: async () => {
        const data = await readReport(SAVE_VERSION)
        set({ hydrated: true })
        if (!data) return false
        set({ ...data, loaded: true })
        return true
      },

      exportReport: async () => {
        const got = await readReportDetailed(SAVE_VERSION)
        if (got.kind === 'none') return { kind: 'none' }
        const at = new Date()
        if (got.kind === 'ok') {
          const name = saveFileName(got.save.trainer.name, at)
          return {
            kind: 'done', fileName: name, raw: false,
            outcome: downloadPortable(buildPortable(got.save, at), name),
          }
        }
        // 못 읽는 리포트도 **버리지 않는다.** 원본 그대로 파일로 돌려준다
        const found = got.reason.kind === 'invalid' ? (got.reason.found ?? 0) : got.reason.found
        const name = saveFileName('복구', at)
        return {
          kind: 'done', fileName: name, raw: true,
          outcome: downloadPortable(buildPortableRaw(got.raw, found, at), name),
        }
      },

      previewImport: (text) => {
        const parsed = parsePortable(text)
        if (!parsed.ok) return { ok: false, why: explainFailure(parsed.fail) }

        const moved = migrateSave(parsed.data, SAVE_VERSION)
        if (moved.kind === 'too-new') {
          return { ok: false, why: '더 새로운 판에서 만든 리포트입니다. 그 판에서 열어 주세요' }
        }
        if (moved.kind === 'unsupported-old') {
          return {
            ok: false,
            why: `너무 옛 리포트라 옮길 수 없습니다 (판 ${String(moved.found)}). `
              + '원본 파일은 그대로 보관해 주세요',
          }
        }
        if (moved.kind === 'invalid') return { ok: false, why: `내용이 어긋납니다 — ${moved.why}` }

        return {
          ok: true,
          envelope: parsed.envelope,
          save: moved.save,
          migrated: moved.migrated,
          contract: compareContract(parsed.envelope.contentContract),
        }
      },

      commitImport: async (preview) => {
        // ⚠️ **덮기 전에 지금 것을 먼저 받는다** (IMPORT.md §11-8). 여기서
        // 실패해도 들이는 것을 막지는 않는다 — 막으면 다운로드가 차단된 브라우저에서
        // 영영 못 들인다
        const backedUp = await backupBeforeOverwrite()

        const written = await writeReportVerified(preview.save)
        // 실패하면 기존 리포트는 **한 바이트도 안 바뀐 채로** 남는다
        if (!written.ok) return { ok: false, why: written.why }

        set({ ...preview.save, hydrated: true, loaded: true, pendingInit: false })
        return { ok: true, backedUp }
      },

      resetSave: async (options) => {
        if (options?.backup !== false) await backupBeforeOverwrite()
        await clearReport()
        set({ ...createNewSave(), hydrated: true, loaded: false })
      },
    }),
)

/**
 * 지우거나 덮기 직전의 백업 (IMPORT.md §11-8).
 *
 * 두 벌을 남긴다 — 파일과 IndexedDB 백업 슬롯. 파일이 최종 보험이지만
 * 브라우저가 반복 다운로드를 막을 수 있고, 백업 슬롯은 사이트 데이터를 통째로
 * 지우면 같이 사라진다. 둘 다 완전하지 않아서 둘 다 한다
 */
async function backupBeforeOverwrite(): Promise<DownloadOutcome> {
  const got = await readReportDetailed(SAVE_VERSION)
  if (got.kind === 'none') return { started: false, why: 'no-dom' }
  await backupReport().catch(() => false)
  const at = new Date()
  if (got.kind === 'ok') {
    return downloadPortable(buildPortable(got.save, at), saveFileName(got.save.trainer.name, at))
  }
  const found = got.reason.kind === 'invalid' ? (got.reason.found ?? 0) : got.reason.found
  return downloadPortable(buildPortableRaw(got.raw, found, at), saveFileName('복구', at))
}
