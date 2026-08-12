// 스크립트가 만지는 바깥 세계 (DATA.md §2.10)
//
// VM은 명령을 읽고 뛰는 것까지만 한다. 창을 열고 글을 찍고 버튼을 받는 일은
// 여기 모아 둔다 — 원작의 `ScriptManager`가 들고 있던 것들이다:
//
//   isMsgBoxOpen · window     대사창이 떠 있는가
//   messageID                 지금 찍는 중인 글
//   strTemplate               `Buffer…` 명령이 채우는 8칸
//   ctrlUI                    예/아니오 같은 메뉴
//
// 한 프레임의 흐름은 이렇다. `ctx.step()`이 명령을 돌리다 `Message`에서 멈추고,
// `world.tick()`이 글자를 한 자 찍고, 다음 프레임에 다시 `step()`이 "다 찍었나"를
// 묻는다. 그래서 이 객체는 **프레임마다 정확히 한 번** tick 되어야 한다.
import {
  DEFAULT_OPTIONS, MessagePrinter, type PrinterInput, type PrinterOptions,
} from './printer'
import { MovementRunner, type Movable, type MovementStep, type MovementTable } from './movement'
import { tickFade } from './fade'
import { MessageSlots } from './text'
import type { VarStore } from './vars'

/** `constants/menu.h` */
export const MENU_YES = 0
export const MENU_NO = 1
export const MENU_NOTHING_CHOSEN = -1
export const MENU_CANCEL = -2

/**
 * `list_menu.h`의 `LIST_MENU_NO_SELECTION_YET`.
 *
 * 메뉴를 열 때 결과 변수를 이 값으로 채워 두고, `ShowMenu`는 값이 바뀔 때까지
 * 선다. 0이나 −1을 쓰면 "예를 골랐다"·"아직이다"와 구분이 안 된다
 */
export const LIST_MENU_NO_SELECTION_YET = 0xeeee

/** 목록 메뉴 항목 하나 */
export interface MenuEntry {
  text: string
  /** 고르면 결과 변수에 들어갈 값. 나열 순서와 다를 수 있다 */
  value: number
  /** 커서를 올리면 아래에 따로 뜨는 설명 (`AddListMenuEntry`의 셋째 인자) */
  alt: string | null
}

/** 지금 답을 기다리는 메뉴 */
export interface PendingMenu {
  /** `yesno`는 창 안에 붙고, `list`는 따로 뜬다 */
  kind: 'yesno' | 'list'
  /** 고른 값이 들어갈 변수 번호 */
  dest: number
  entries: readonly MenuEntry[]
  /** B로 빠져나갈 수 있는가. 못 나가는 메뉴가 실제로 있다 */
  canCancel: boolean
  /** `ShowMenuMultiColumn`. 보통은 1이다 */
  columns: number
}

/**
 * 짓는 중인 메뉴 (`FieldMenuManager`).
 *
 * `Init…`이 만들고 `Add…`가 채우고 `Show…`가 띄운다. 세 명령이 나뉘어 있어서
 * 중간 상태를 어딘가 들고 있어야 한다
 */
interface MenuBuilder {
  dest: number
  cursor: number
  canCancel: boolean
  /** 항목 글을 어디서 읽는가. 지역이면 지금 스크립트의 뱅크다 */
  scope: 'local' | 'global'
  entries: MenuEntry[]
}

/**
 * 대사에 끼워 넣을 이름.
 *
 * 함수로 받는 이유: 주인공 이름은 세이브가 로드된 뒤에 정해지는데, 세계는
 * 그보다 먼저 만들어진다
 */
export interface NameSource {
  player(): string
  rival(): string
  counterpart(): string
}

const UNNAMED: NameSource = {
  player: () => '',
  rival: () => '',
  counterpart: () => '',
}

/**
 * 세계가 혼자 못 하는 일. 배틀 화면·저장된 파티처럼 **엔진 바깥**에 있는 것들이다.
 *
 * 전부 선택이다 — 안 붙으면 그 명령이 조용히 아무 일도 안 하는 것이 아니라,
 * `unsupported`에 이름이 쌓여서 무엇이 빠졌는지 보인다
 */
export interface FieldServices {
  /** 트레이너전을 연다 */
  startTrainerBattle?: (trainerID: number) => void
  /** 배틀이 끝났으면 결과, 아직이면 `null` */
  battleResult?: () => 'win' | 'loss' | null
  /** 트레이너 자료 (더블 여부·대사 색인) */
  trainer?: (id: number) => { double: boolean, msg: Record<string, number> } | null
  /** `TEXT_BANK_NPC_TRAINER_MESSAGES`의 글 하나 */
  trainerMessage?: (index: number) => string
  /** 싸울 수 있는 포켓몬 수 */
  aliveMons?: () => number
  /**
   * 파티 조회 (`scrcmd_party.c`).
   *
   * 스크립트가 여기서 얻은 값으로 **갈라진다** — 몇 마리인지, 그 종이 있는지.
   * 안 붙어 있으면 늘 0이라 한쪽 가지만 돈다
   */
  party?: {
    count: () => number
    /** 그 자리의 종족 번호. 빈 자리면 0 */
    species: (slot: number) => number
    nickname: (slot: number) => string
    hasSpecies: (species: number) => boolean
    /** 그 자리를 빼고 싸울 수 있는 수 (`CountAliveMonsExcept`) */
    aliveExcept: (slot: number) => number
    /**
     * 한 마리를 준다 (`Pokemon_GiveMonFromScript`).
     *
     * ⚠️ **가득 차면 못 준다.** 원작도 `Party_AddPokemon`이 실패하고 0을
     * 돌려준다 — 박스로 안 넘긴다. 스크립트가 그 0을 보고 "가방이 가득 찼다"
     * 쪽으로 갈라진다
     *
     * @returns 넣었으면 true
     */
    give: (species: number, level: number, heldItem: number) => boolean
    level: (slot: number) => number
    /** 성격 번호 (`Pokemon_GetNature`). 자리가 비었으면 0(노력) */
    nature: (slot: number) => number
    friendship: (slot: number) => number
    addFriendship: (slot: number, amount: number) => void
    hasMove: (slot: number, move: number) => boolean
    /** 그 기술칸의 번호. 빈 칸이면 0 */
    move: (slot: number, moveSlot: number) => number
    /** 그 자리의 폼 번호 (`MON_DATA_FORM`). 빈 자리면 0 */
    form: (slot: number) => number
    /**
     * 폼을 갈아 끼운다 (`ScrCmd_SetRotomForm` · `ScrCmd_ChangeDeoxysForm`).
     *
     * 능력치와 로토무 기술칸까지 여기서 맞춘다 (`engine/pokemon/form.changeForm`)
     */
    setForm: (slot: number, form: number, moveSlot?: number) => void
    /**
     * 파티의 기라티나를 한꺼번에 (`Party_SetGiratinaForm`).
     *
     * `origin`이면 무조건 오리진이고(되돌림월드), 아니면 백금옥을 보고 정한다
     */
    giratinaForm: (origin: boolean) => void
    /**
     * 폼이 바뀐 마리를 되돌린다 (`ScrCmd_TryRevertPartyPokemonForms`).
     *
     * 백금옥은 **가방으로 옮긴다** — 자리가 없으면 아무것도 안 하고 0xFF다.
     * `slot`이 없으면 파티 전체
     *
     * @returns 0이면 됐고 0xFF면 가방이 가득 찼다
     */
    revertForms: (slot?: number) => number
    /**
     * 리포트 안의 로토무가 가진 폼 비트 (`SaveData_GetRotomFormsInSave`).
     *
     * ⚠️ **파티만 보지 않는다.** 박스와 육성가까지 훑는다 — 가전 방의 문이
     * 그 비트로 열린다
     */
    rotomForms: () => number
    /** 파티의 로토무 수와 첫 자리 (`ScrCmd_GetPartyRotomCountAndFirst`) */
    rotomCount: () => { count: number, first: number }
  }
  /** 트레이너 정보 · 도감 (`scrcmd_system_flags.c`) */
  trainerInfo?: {
    /** 0 남 · 1 여 (`TrainerInfo_Gender`) */
    gender: () => number
    hasBadge: (badge: number) => boolean
    /** 뱃지 하나를 준다 (`TrainerInfo_SetBadge`) */
    giveBadge: (badge: number) => void
    /** 전국도감을 켰는가. `set`이면 켜고 답은 0이다 */
    nationalDex: (set: boolean) => boolean
  }
  /** 이름표 — 글 칸을 채우는 데 쓴다 (`BufferMoveName` 등) */
  labels?: {
    move: (move: number) => string
    pocket: (pocket: number) => string
    species: (species: number) => string
  }
  /** 가방. 주머니 번호는 아이템 자료가 정하므로 여기서 물어본다 */
  bag?: {
    pocketOf: (item: number) => number
    add: (item: number, count: number) => boolean
    remove: (item: number, count: number) => boolean
    canFit: (item: number, count: number) => boolean
    quantity: (item: number) => number
    pocketHasItems: (pocket: number) => boolean
    name: (item: number) => string
  }
  money?: {
    get: () => number
    add: (amount: number) => void
    spend: (amount: number) => boolean
  }
  /** 시작 메뉴를 연다 (`ShowStartMenu`) */
  openStartMenu?: () => void
  /** 메뉴가 아직 떠 있는가 */
  menuOpen?: () => boolean
  /**
   * 상점을 연다 (`Shop_Start`). `items`는 파는 물건의 아이템 번호다.
   *
   * 재고를 스크립트가 안 준다 — 명령이 뱃지 수나 상점 번호만 주고 실제 목록은
   * 코드에 박혀 있다 (`include/data/mart_items.h`). 그 표를 푸는 것은 붙이는
   * 쪽 일이다
   */
  openShop?: (items: readonly number[]) => void
  /**
   * 보관 시스템을 연다 (`ScrCmd_OpenPokemonStorage`).
   *
   * 갈래는 원작의 인자 그대로다 — 0 맡긴다 · 1 꺼낸다 · 2 옮긴다 · 3 도구 옮긴다
   * · 4 비교한다. 어느 갈래로 들어왔는지가 화면의 첫 손짓을 정한다
   */
  openStorage?: (mode: number) => void
  /** 박스에 남은 자리 수 (`GetPCBoxesFreeSlotCount`) */
  boxFreeSlots?: () => number
  /** 파티에서 싸울 수 있는 수 + 박스에 든 수 (`CountAliveMonsAndBoxMons`) */
  aliveAndBoxMons?: () => number
  /** 상점 재고표 (`include/data/mart_items.h`). 일반 상점은 뱃지 수로 늘어난다 */
  martStock?: {
    common: () => number[]
    specialties: (martID: number) => number[]
  }
  /**
   * 비전머신 자격 (`FieldMoves_Check*`).
   *
   * 원작이 보는 것이 정확히 둘이다 — `PlayerHasRequiredBadge`와
   * `Party_HasMonWithMove`. 둘 다 세이브에 있어서 여기로 받는다
   */
  fieldMoves?: {
    /** 뱃지 비트마스크 */
    badges: () => number
    /** 이 기술을 아는 파티원이 있는가 */
    knows: (move: number) => boolean
  }
  /**
   * 소리 (`scrcmd_sound.c`).
   *
   * 번호는 스크립트가 직접 준다 — SDAT의 SEQ 번호라 이름표를 거칠 것이 없다.
   * `playing`류가 있어야 `WaitSE`·`WaitCry`가 설 수 있다
   */
  sound?: {
    playEffect: (seq: number) => void
    stopEffect: (seq: number) => void
    effectPlaying: (seq: number) => boolean
    playCry: (species: number) => void
    cryPlaying: () => boolean
    /** 팡파르. 끝날 때까지 `WaitFanfare`가 선다 */
    playFanfare: (seq: number) => void
    fanfarePlaying: () => boolean
    /** 필드 곡을 가로챈다. null이면 맵 헤더의 곡으로 되돌린다 */
    setMusic: (seq: number | 'stop' | null) => void
    /** 이 곡이 지금 울리는가 (`IsSequencePlaying`) */
    sequencePlaying: (seq: number) => boolean
    /** 곡을 갈지 않고 소리만 줄였다 키운다. 음량은 원작대로 0~127 */
    fadeVolume: (volume: number, frames: number) => void
  }
  /**
   * 날마다 바뀌는 것 (PARITY §6.11).
   *
   * 씨앗은 세이브에 있고 표는 `encountersEx.json`에 있다 — 둘 다 여기서
   * 직접 못 읽어서 바깥에서 받는다
   */
  daily?: {
    /** 무리를 연다 (`SpecialEncounter_EnableSwarms`) */
    enableSwarms: () => void
    /** 오늘 무리가 뜬 곳과 그 종족. 아직 안 열렸으면 null */
    swarm: () => { map: number, species: number } | null
    /** 트로피가든에 한 마리 더한다 (`TrophyGarden_AddNewMon`) */
    addTrophyMon: () => void
    /** 그 자리의 종족. 없으면 0 */
    trophySpecies: (slot: 0 | 1) => number
  }
  /**
   * 육성가와 알 (PARITY §3.2·§3.3) — `scrcmd_daycare.c`.
   *
   * 규칙은 `engine/pokemon/breeding.ts`에 있고, 여기는 세이브를 만지는 자리다
   */
  daycare?: {
    /** `DAYCARE_*` — 0 없음 · 1 알이 있다 · 2 한 마리 · 3 두 마리 */
    state: () => number
    /** 궁합 말투 0~3. **0이 제일 좋다** */
    compatibility: () => number
    hasEgg: () => boolean
    /** 파티의 그 자리를 맡긴다. 파티에서 빠진다 */
    store: (partySlot: number) => void
    /** 맡긴 것을 찾아온다. 돌려주는 값은 그 종족 번호 */
    withdraw: (slot: number) => number
    /** 찾아갈 때 낼 돈. 오른 레벨 수도 함께 */
    price: (slot: number) => { money: number, levels: number }
    /** 알을 받아 파티에 넣는다. 자리가 없으면 false */
    takeEgg: () => boolean
    /** 알 자리를 비운다 (`Daycare_ResetPersonalityAndStepCounter`) */
    resetEgg: () => void
    /** 맡긴 마리의 별명·레벨·성별 (글 칸을 채우는 데 쓴다) */
    info: (slot: number) => { name: string, level: number, gender: number } | null
  }
  /** 알을 뺀 파티 수·알 수·첫 알 아닌 자리 (`scrcmd_party.c`) */
  eggs?: {
    nonEggs: () => number
    count: () => number
    firstNonEgg: () => number
    /** 첫 알을 즉시 깬다 (`ScrCmd_HatchEgg`) */
    hatchFirst: () => void
  }
  /** 파티 전원 회복 (`ScrCmd_HealParty`). 종족값 표가 필요해서 바깥 일이다 */
  healParty?: () => void
  /** 부활 지점을 옮긴다 (`ScrCmd_SetBlackOutWarpId`). `spawns.json`의 번호다 */
  setHealSpot?: (index: number) => void
  /** 전멸 — 회복하고 부활 지점으로 옮긴다 (`ScrCmd_BlackOutFromBattle`) */
  blackOut?: () => void
  /**
   * 지금 시간대 (`FieldSystem_GetTimeOfDay`).
   *
   * 0 아침 · 1 낮 · 2 해질녘 · 3 밤 · 4 심야 (`generated/time_of_day.txt`)
   */
  timeOfDay?: () => number
  /**
   * 세이브에 붙는 장비 (`scrcmd_system_flags.c`).
   *
   * 가방·모험노트는 플래그 하나라 여기 안 온다 — 그건 `VarStore`가 든다.
   * 러닝슈즈만 `PlayerData`의 칸이라 바깥에 있다
   */
  gear?: {
    giveRunningShoes: () => void
    hasRunningShoes: () => boolean
  }
  /**
   * 워프 자리를 옮긴다 (`MapHeaderData_SetWarpEventPos`).
   *
   * ⚠️ **워프를 지우는 데 쓴다.** 예진호수 입구가 그렇다 — 물이 마른 호수와
   * 아닌 호수로 가는 문이 둘 다 놓여 있고, 안 쓸 쪽을 맵 바깥 좌표(80, 840)로
   * 밀어 버린다. 이걸 안 하면 **한 문에서 두 목적지가 겹친다**
   */
  warpEvents?: {
    setPos: (index: number, x: number, z: number) => void
  }
  /**
   * 문 여닫는 그림 (`ov5_021D431C.c`).
   *
   * `tag`는 스크립트가 정하는 이름표고, 같은 맵에서 문 여럿을 구분한다
   */
  door?: {
    /** 그 칸의 문 모델을 찾아 둔다 (`DoorAnimation_FindDoorAndLoad`) */
    load: (x: number, z: number, tag: number) => void
    open: (tag: number) => void
    close: (tag: number) => void
    /** 아직 도는 중인가. `WaitForAnimation`이 이걸 본다 */
    busy: (tag: number) => boolean
    unload: (tag: number) => void
  }
  /**
   * 파트너를 고르는 장면 (`FieldSystem_LaunchChooseStarterApp`).
   *
   * 스크립트가 아니라 **따로 도는 화면**이다. 열어 두고 `open()`이 끝날 때까지
   * 스크립트가 선다 — 고른 결과는 `chosen()`이 준다
   */
  chooseStarter?: {
    open: () => void
    /** 고른 종족 번호. 아직 안 골랐으면 null */
    chosen: () => number | null
  }
  /**
   * 첫 배틀 (`Encounter_NewVsFirstBattle`).
   *
   * 보통 트레이너전과 **한 가지만 다르다** — `BATTLE_STATUS_FIRST_BATTLE`가
   * 급소를 막는다(`BtlCmd_CalcCrit`가 `criticalMul = 1`로 고정한다). 이길 수도
   * 질 수도 있는 진짜 배틀이다
   */
  startFirstBattle?: (trainerID: number) => void
  /**
   * 전설 조우 (`Encounter_NewVsSpeciesAtLevel`).
   *
   * 야생과 같은 배틀인데 **종과 레벨을 스크립트가 준다.** 인카운터 표를 안
   * 거치므로 기라티나·디아루가처럼 표에 없는 것이 여기로 나온다
   */
  startLegendaryBattle?: (species: number, level: number) => void
  /**
   * 태그 배틀 (`Encounter_NewVsTrainer`에 파트너를 붙인 것).
   *
   * 창기둥에서 라이벌과 함께 마스·쥬피터를 상대한다. 파트너가 붙는 배틀은
   * 아직 없어서, 붙는 날까지 **파트너 없이 2:2로** 연다 — 이야기는 지나가고
   * 없는 것은 옆에 선 사람뿐이다
   */
  startTagBattle?: (partner: number, enemy1: number, enemy2: number) => void
  /**
   * 장애물이 부서지는 연출 (`ov6_0224899C`).
   *
   * ⚠️ **이 자리가 비어 있으면 스크립트가 영영 돈다.** 원작은 답 칸을 0으로
   * 두고 연출이 끝날 때 채우는데, 스크립트가 `WaitTime 1` + `그 칸이 0이면
   * 되돌아가기`로 기다린다 — 채워 주는 사람이 없으면 그대로 무한 고리다.
   * 무쇠탄갱에서 강석이 바위를 깨는 대목이 그것이다
   */
  breakObstacle?: {
    /** 0 나무 · 1 바위 · 2 큰 바위 (`ScrCmd_StartDestroyObstacleAnimation`의 갈래) */
    start: (kind: number) => void
    done: () => boolean
  }
  /** 비전기술 컷인 (`HMCutIn_StartTask`). 파티 자리의 포켓몬이 나와서 쓴다 */
  hmCutIn?: {
    start: (slot: number) => void
    done: () => boolean
  }
  /** 도감에 봤다고 적는다 (`FieldSystem_WriteSpeciesSeen`) */
  seeSpecies?: (species: number) => void
  /**
   * 별명 짓는 화면 (`ScrCmd_OpenPokemonNamingScreen`).
   *
   * 파트너 고르는 장면과 같은 모양이다 — 열어 두고 답이 나올 때까지 스크립트가
   * 선다. `named()`가 `null`이면 아직 짓는 중이다
   */
  naming?: {
    openForParty: (slot: number) => void
    /** 지었으면 이름(안 지었으면 빈 글). 아직이면 null */
    named: () => string | null
  }
  /**
   * 알을 준다 (`Egg_CreateEgg`).
   *
   * `giver`는 특수 만남장소 번호를 고르는 값이다 (`SpecialMetLoc_GetId(1, …)`)
   */
  giveEgg?: (species: number, giver: number) => void
  /**
   * 독으로 쓰러지기 직전 1로 버틴다 (`Pokemon_TrySurvivePoison`).
   *
   * @returns 버텼으면 true
   */
  survivePoison?: (slot: number) => boolean
  /**
   * 자유 카메라 (`AddFreeCamera`·`RestoreCamera`).
   *
   * 원작은 안 보이는 객체를 하나 세워 카메라가 그걸 따라가게 한다. 컷신에서
   * 카메라가 주인공을 떠나 아카기를 비추는 대목이 이것이다
   */
  camera?: {
    free: (x: number, z: number) => void
    restore: () => void
  }
}

export interface WorldInit {
  vars: VarStore
  /** 지금 스크립트가 읽는 뱅크. 없는 번호는 빈 글로 나온다 */
  messages?: readonly string[]
  options?: PrinterOptions
  /** 이번 프레임의 A/B. 대사창이 이걸로 넘어간다 */
  input?: () => PrinterInput
  names?: NameSource
  /** 이동 동작 표 (`scripts.json`의 `movements`) */
  movements?: MovementTable
  /** 번호로 움직일 것을 찾는다. NPC는 맵마다 갈리므로 함수로 받는다 */
  objects?: (localID: number) => Movable | null
  services?: FieldServices
}

const NO_INPUT = (): PrinterInput => ({ pressed: false, held: false })

export class FieldWorld {
  readonly vars: VarStore
  readonly slots = new MessageSlots()

  /** 창이 떠 있는가 (`isMsgBoxOpen`). 닫는 명령까지 계속 떠 있는다 */
  boxOpen = false
  /**
   * 지금 글이 **간판 판**에 떠 있는가 (`Signpost`). null이면 보통 대사창이다.
   *
   * `type`은 `generated/signpost_types.txt`의 줄 번호다 — 0 지도 · 1 화살표 ·
   * 2 명패 · 3 흘림. 마을 이름표와 우편함이 전부 이 길로 뜬다.
   *
   * ⚠️ **넷이 다 나무 판인 것이 아니다.** 원작은 0·1만 판 테두리를 그리고
   * 2·3은 **보통 대사창 테두리**를 쓴다 (`Window_DrawSignpost`가 그 자리에서
   * 갈린다). 실측으로 2번이 77곳 · 3번이 26곳이라 절반이 넘는다
   */
  signpost: { type: number, picture: number } | null = null
  /** 지금 찍는 글. 다 찍어도 창을 닫기 전까지 남아 있다 */
  printer: MessagePrinter | null = null
  /**
   * 마지막으로 올린 글의 번호 (`SCRIPT_MANAGER_MESSAGE_ID`).
   *
   * 창을 닫아도 안 지운다 — 원작도 이 칸은 스크립트가 끝날 때까지 남는다.
   * 화면은 이 값이 바뀌는 것으로 "새 글이 시작됐다"를 안다
   */
  lastMessage: number | null = null
  menu: PendingMenu | null = null
  /** 예/아니오에서 지금 가리키는 칸. 원작도 "예"에서 시작한다 */
  menuCursor = MENU_YES

  readonly names: NameSource

  /**
   * 지금 말을 걸고 있는 상대 (`SCRIPT_MANAGER_TARGET_OBJECT`).
   *
   * `FacePlayer`가 이 사람을 돌려세운다
   */
  target: Movable | null = null

  /** 주인공. `FacePlayer`가 어느 쪽인지 알려면 필요하다 */
  player: Movable | null = null

  /**
   * 스크립트가 요청해 둔 주인공 자세 (`PlayerAvatar_TurnOnRequestStateBit`).
   *
   * `generated/player_transitions.txt`의 줄 번호다. `SetPlayerState`가 적고
   * `ChangePlayerState`가 갈아 끼운다 — 자세 그림이 붙는 날 화면이 여기를 본다
   */
  playerState = 0

  /**
   * 지금 도는 스크립트의 scriptID (`SCRIPT_MANAGER_SCRIPT_ID`).
   *
   * 트레이너전이 이걸 쓴다 — 3000번대 번호에서 1을 빼면 트레이너 번호다
   */
  scriptID = 0

  /** 바깥이 붙여 주는 것들. 안 붙으면 그 명령은 아무 일도 안 한다 */
  services: FieldServices = {}

  /**
   * 도는 중인 이동 (`SCRIPT_MANAGER_MOVEMENT_COUNT`).
   *
   * `WaitMovement`는 이게 0이 될 때까지 선다. 여럿을 동시에 걷게 하고 한 번에
   * 기다리는 스크립트가 많아서 개수로 센다
   */
  private readonly runners: MovementRunner[] = []

  private messages: readonly string[]
  /** 구역 스크립트가 얹은 뱅크. null이면 맵 뱅크다 */
  private override: readonly string[] | null = null
  /**
   * 인쇄기 기본값. **글자 속도는 여기 안 굳는다** — 설정에서 바꾼 값이 다음
   * 대사부터 바로 먹어야 하므로 창을 열 때마다 `speed()`에 물어본다
   */
  private readonly options: PrinterOptions
  /** 지금 설정의 글자당 프레임. 설정 화면이 이걸 갈아 끼운다 */
  speed: () => number = () => this.options.speed
  private readonly input: () => PrinterInput

  constructor(init: WorldInit) {
    this.vars = init.vars
    this.messages = init.messages ?? []
    this.options = init.options ?? DEFAULT_OPTIONS
    this.input = init.input ?? NO_INPUT
    this.names = init.names ?? UNNAMED
    this.movements = init.movements ?? []
    this.objects = init.objects ?? (() => null)
    this.services = init.services ?? {}
  }

  readonly movements: MovementTable
  readonly objects: (localID: number) => Movable | null

  /** `ApplyMovement` — 그 번호의 대상에게 목록을 건다 */
  applyMovement(localID: number, steps: readonly MovementStep[]): boolean {
    const target = this.objects(localID)
    if (target === null) return false
    this.runners.push(new MovementRunner(target, steps, this.movements))
    return true
  }

  /** 아직 걷고 있는 것이 있는가 */
  get moving(): boolean {
    return this.runners.length > 0
  }

  /** 맵이 바뀌면 읽을 뱅크도 바뀐다 */
  setMessages(messages: readonly string[]): void {
    this.messages = messages
  }

  /**
   * 잠깐 다른 뱅크를 읽는다 (`ScriptContext_Load`).
   *
   * ⚠️ **구역 스크립트는 글 뱅크가 맵과 다르다.** 간판은 2500번대라
   * `bg_events`를, 공용 스크립트는 그 구역 뱅크를 읽는다 — 맵 뱅크로 읽으면
   * 같은 번호의 **엉뚱한 문장**이 나온다. 글자는 나오므로 눈으로는 넘어간다.
   *
   * 맵 뱅크를 덮어쓰지 않고 위에 얹는다. `null`이면 맵 뱅크로 돌아간다
   */
  useBank(messages: readonly string[] | null): void {
    this.override = messages
  }

  /** 지금 읽는 글. 구역 뱅크가 얹혀 있으면 그쪽이다 */
  private get bank(): readonly string[] {
    return this.override ?? this.messages
  }

  /**
   * 글 하나를 창에 올린다 (`ScriptMessage_Show`).
   *
   * 창이 닫혀 있으면 **먼저 연다** — `OpenMessage` 없이 `Message`만 쓰는
   * 스크립트가 훨씬 많다
   */
  showMessage(id: number, canSkip = true): void {
    this.boxOpen = true
    this.lastMessage = id
    this.printer = new MessagePrinter(this.bank[id] ?? '', this.slots, {
      ...this.options, speed: this.speed(), canSkip,
    })
  }

  /** 트레이너 대사처럼 뱅크가 아니라 다른 데서 온 글을 올린다 */
  showText(text: string): void {
    this.boxOpen = true
    this.printer = new MessagePrinter(text, this.slots, { ...this.options, speed: this.speed() })
  }

  /** `MessageInstant` — 한 프레임에 다 찍는다 */
  showInstant(id: number): void {
    this.showMessage(id)
    this.printer?.finish()
  }

  /** `ScriptContext_WaitForFinishedPrinting` */
  get printed(): boolean {
    return this.printer === null || this.printer.finished
  }

  openBox(): void {
    this.boxOpen = true
  }

  /** @param erase 창 안의 글까지 지우는가 (`CloseMessageWithoutErasing`은 안 지운다) */
  closeBox(erase: boolean): void {
    this.boxOpen = false
    if (erase) this.printer = null
  }

  openYesNo(dest: number): void {
    this.menu = {
      kind: 'yesno',
      dest,
      entries: [{ text: '예', value: MENU_YES, alt: null }, { text: '아니오', value: MENU_NO, alt: null }],
      canCancel: true,
      columns: 1,
    }
    this.menuCursor = MENU_YES
  }

  // ── 목록 메뉴 ──────────────────────────────────────────────────────────────

  /** 짓는 중인 메뉴. `Init…`과 `Show…` 사이에만 있다 */
  private builder: MenuBuilder | null = null

  /** 전역 메뉴가 읽는 뱅크 (`TEXT_BANK_MENU_ENTRIES`). 없으면 빈 글이 나온다 */
  menuEntryTexts: readonly string[] = []

  /** `InitLocalTextMenu` · `InitGlobalTextMenu` 계열 */
  initMenu(dest: number, cursor: number, canCancel: boolean, scope: 'local' | 'global'): void {
    // 아직 안 골랐다는 표시를 먼저 박는다. `ShowMenu`가 이 값으로 기다린다
    this.vars.set(dest, LIST_MENU_NO_SELECTION_YET)
    this.builder = { dest, cursor, canCancel, scope, entries: [] }
  }

  /** `AddMenuEntry` · `AddListMenuEntry`. `alt`는 목록 메뉴에만 있다 */
  addMenuEntry(stringID: number, value: number, altID: number | null = null): void {
    if (this.builder === null) return
    const bank = this.builder.scope === 'global' ? this.menuEntryTexts : this.bank
    this.builder.entries.push({
      text: bank[stringID] ?? '',
      value,
      alt: altID === null ? null : bank[altID] ?? null,
    })
  }

  /** `ShowMenu` · `ShowListMenu` 계열. 여기서부터 답을 기다린다 */
  showMenu(kind: 'list', columns = 1): void {
    if (this.builder === null) return
    const { dest, cursor, canCancel, entries } = this.builder
    this.builder = null
    this.menu = { kind, dest, entries, canCancel, columns }
    this.menuCursor = Math.min(cursor, Math.max(0, entries.length - 1))
  }

  /** 지금 메뉴가 정말 떠 있는가. 항목이 하나도 없으면 띄울 것이 없다 */
  get menuOpen(): boolean {
    return this.menu !== null && this.menu.entries.length > 0
  }

  /** 메뉴에 답한다. 화면이 부르기도 하고 시험이 부르기도 한다 */
  choose(value: number): void {
    if (this.menu === null || value === MENU_NOTHING_CHOSEN) return
    if (value === MENU_CANCEL && !this.menu.canCancel) return
    this.vars.set(this.menu.dest, value)
    this.menu = null
  }

  /** 커서 자리의 항목을 고른다 */
  chooseAtCursor(): void {
    const entry = this.menu?.entries[this.menuCursor]
    this.choose(entry === undefined ? MENU_NOTHING_CHOSEN : entry.value)
  }

  /** 커서를 움직인다. 끝에서 돌지 않는다 — 원작도 안 돈다 */
  moveCursor(delta: number): void {
    if (this.menu === null) return
    const last = this.menu.entries.length - 1
    this.menuCursor = Math.max(0, Math.min(last, this.menuCursor + delta))
  }

  /** 이번 프레임에 A나 B가 눌렸는가 */
  get pressed(): boolean {
    return this.input().pressed
  }

  /** 한 프레임. 인쇄기와 걷는 것들을 돌린다 */
  tick(): void {
    // 페이드도 세계와 같은 시계를 쓴다 — 원작 인자가 프레임 수다
    tickFade()
    this.printer?.tick(this.input())
    for (let i = this.runners.length - 1; i >= 0; i--) {
      const runner = this.runners[i]!
      runner.tick()
      if (runner.done) this.runners.splice(i, 1)
    }
  }

  /** 스크립트 한 판이 끝났다. 걷다 만 것은 남기지 않는다 */
  reset(): void {
    this.runners.length = 0
    this.target = null
    this.slots.clear()
    this.menu = null
    this.builder = null
    this.signpost = null
  }
}
