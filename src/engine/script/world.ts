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
import { MessagePrinter, type PrinterInput } from './printer'
import { MovementRunner, type Movable, type MovementStep, type MovementTable } from './movement'
import type { ApproachingTrainer } from '../actor/approach'
import type { EmoteKind } from '../actor/emote'
import { tickFade } from './fade'
import { MessageSlots } from './text'
import type { VarStore } from './vars'
import type { LotteryEntry } from '../world/gameCorner'

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
/**
 * 상점이 무엇으로 값을 받는가 (`enum MartType`).
 *
 * 원작은 갈래가 넷인데(일반·프런티어·장식·씰) 우리에게 살아 있는 것은
 * **돈과 BP** 둘이다 — 장식은 §12.1에서 돈으로 팔고 씰은 §9다
 */
export type ShopCurrency = 'money' | 'bp'

export interface FieldServices {
  /** 트레이너전을 연다 */
  startTrainerBattle?: (trainerID: number) => void
  /**
   * 머리 위에 표시를 띄운다 (`ov5_021F5D8C`).
   *
   * 눈이 마주친 트레이너의 느낌표가 이 길로 나온다. 화면이 없는 시험에서는
   * 안 붙고, 그때는 표시만 안 뜨고 나머지 차례는 그대로 돈다
   */
  emote?: (localID: number, kind: EmoteKind) => void
  /** 배틀이 끝났으면 결과, 아직이면 `null` */
  battleResult?: () => 'win' | 'loss' | null
  /**
   * 지금 배틀 화면이 떠 있는가.
   *
   * ⚠️ **`battleResult`로는 못 가른다** — 배틀이 도는 중에도, 배틀이 아예 없을
   * 때도 `null`이다. 이걸 따로 두는 이유는 하나다: **배틀 위에 새 스크립트가
   * 시작되면 안 된다.** 원작은 배틀에 들어가면서 필드를 통째로 내리는데 우리는
   * 필드 루프가 그대로 돌아서, 눈이 마주치는 것도 `OnFrame`도 계속 살아 있다 —
   * 실측으로 연고 체육관에서 관장의 인사 대사창이 **배틀 화면 위에** 떴고,
   * 그 창이 키를 먹어 배틀이 한 걸음도 안 나아갔다 (`pnpm story`가 그림에서 잡았다).
   *
   * 이미 도는 스크립트는 **안 끊는다** — 배틀을 연 것이 그 스크립트고,
   * 끝나기를 기다리는 것도 그것이다
   */
  battleUp?: () => boolean
  /**
   * 배틀 결과를 원작의 **비트 마스크**로 (`SCRIPT_MANAGER_BATTLE_RESULT`).
   *
   * `battleResult`는 이겼나 졌나 둘뿐인데 스크립트는 다섯 갈래로 갈린다 —
   * 잡았나, 내가 달아났나, 상대가 달아났나까지 본다 (기라티나가 그렇다).
   * 값은 `BATTLE_RESULT_*`고 **겹친 값**이 있다 (도망 = 포획|승)
   */
  battleMask?: () => number | null
  /**
   * 오리진폼 기라티나와의 야생전 (`Encounter_NewVsGiratinaOrigin`).
   *
   * 전설 조우와 딱 하나 다르다 — 만들어 놓고 **모습을 오리진으로 갈아 끼운다**.
   * 백금옥 없이 그 모습으로 나오는 것은 깨어진 세계 안에서뿐이다
   */
  startGiratinaOriginBattle?: (species: number, level: number) => void
  /**
   * 「운명적인 만남」 조우 (`Encounter_NewFatefulVsSpeciesAtLevel`).
   *
   * 아르세우스가 이 길로 나온다. 잡은 마리에 표시가 남아서 요약 화면의
   * 트레이너 메모가 달라지고, 쉐이미는 이게 있어야 스카이폼이 된다
   */
  startFatefulEncounter?: (species: number, level: number) => void
  /** 깨어진 세계 (PARITY §6.10). 이 세계 안에서만 붙어 있다 */
  distortion?: {
    /** 배치표에 없는 사람을 번호로 세운다 (`DistWorld_AddMapObjectWithLocalID`) */
    addObject: (localID: number) => void
    removeObject: (localID: number) => void
    /** 카메라 각을 0으로 (`DistWorld_ResetPersistedCameraAngles`) */
    resetCamera: () => void
    /** 기라티나 그림자를 띄운다. 번호는 `sGiratinaShadowExternal`의 자리다 */
    startShadow: (index: number) => void
    /** 띄운 그림자를 거둔다 (`DistWorld_FinishGiratinaShadowEvent`) */
    finishShadow: () => void
  }
  /**
   * 꿀 나무 (PARITY §6.6 · `overlay005/honey_tree.c`).
   *
   * 공용 스크립트 8번이 쓰는 넷이다. 지금 선 맵이 스물한 곳 중 하나라는 것은
   * 부르는 쪽이 안다 — 나무가 없는 맵에서는 스크립트 자체가 안 열린다
   */
  honeyTree?: {
    /** `TREE_STATUS_*` — 1 맨 나무 · 2 발라 둠 · 3 붙었다 */
    status: () => number
    /** 꿀을 바른다 (`HoneyTree_SlatherTree`). 무엇이 붙을지가 여기서 정해진다 */
    slather: () => void
    /** 붙은 마리와 싸운다 (`Encounter_NewVsHoneyTree`) */
    startBattle: () => void
    /** 흔들림을 멈춘다 (`HoneyTree_StopShaking`) */
    stopShaking: () => void
  }
  /** 주인공의 세 좌표 (`ScrCmd_GetPlayer3DPos`). y는 이미 타일 단위다 */
  playerPos?: () => { x: number; y: number; z: number }
  /**
   * 그 맵에만 있는 장치 (`dynamic_map_features.c`, PARITY §7.12).
   *
   * 승강판·체육관 장치가 여기로 온다. **한 번에 하나만** 산다 — 맵에 들어설 때
   * 스크립트가 갈래를 못 박고, 그 뒤 통행 판정과 프레임 갱신이 그 갈래로 간다
   */
  mapFeatures?: {
    /** 리그 승강기 다섯·챔피언방·강철섬 셋 */
    initPlatformLift: () => void
    triggerPlatformLift: () => boolean
    platformLiftBusy: () => boolean
    platformLiftNotUsedWhenEnteredMap: () => boolean
    /** 물가시티 체육관의 물바닥 */
    initPastoriaGym: () => void
    /** 밟은 칸의 단추를 누른다. 물이 실제로 움직이면 true */
    pressPastoriaButton: () => boolean
    pastoriaBusy: () => boolean
    /** 선단시티 체육관의 톱니. 방은 셋이고 스크립트가 번호를 준다 */
    initSunyshoreGym: (room: number) => void
    pressSunyshoreButton: (button: number) => boolean
    sunyshoreBusy: () => boolean
    /** 영원시티 체육관의 꽃시계. 상태는 스크립트가 변수에서 읽어 넘긴다 */
    initEternaGym: (state: number) => void
    /** 시계를 한 칸 넘긴다. 넘겼으면 새 상태, 끝까지 갔으면 null */
    advanceEternaClock: () => number | null
    eternaBusy: () => boolean
    /** 운하시티 체육관의 뜨는 판 스물넷. 움직이는 것은 걸음이 맡는다 */
    initCanalaveGym: () => void
    /**
     * 한 걸음 옮겼다 (`Field_ProcessStep`).
     *
     * 지금 선 칸에 판이 있으면 태운다. 밟아서 도는 장치가 이것뿐이라
     * 갈래를 안 나눈다
     */
    stepOnFeature?: () => void
    /** 장막시티 체육관의 뜨는 판… 이 아니라 샌드백. A로 찬다 */
    initVeilstoneGym: () => void
    /**
     * 앞 칸의 샌드백을 찬다 (`VeilstoneGym_HitPunchingBag`).
     *
     * @returns 샌드백이 있어서 찼으면 true — 그러면 말 걸기는 안 돈다
     */
    kickBag?: (tileX: number, tileZ: number, dir: number) => boolean
    /** 연고시티 체육관의 문 고르기. 틀린 문들의 목적지를 되돌린다 */
    initHearthomeGym: () => void
  }
  /**
   * 귀혼동굴의 다음 방을 굴린다 (`ScrCmd_InitTurnbackCave`).
   *
   * 들어온 문만 빼고 **나머지 세 문의 목적지를 전부 같은 방으로** 돌린다
   */
  turnbackCave?: (pillarsSeen: number, roomsVisited: number) => void
  /** 전설을 만나기 전의 미리보기 창 (`ScrCmd_DrawPokemonPreview`) */
  preview?: {
    draw: (species: number, gender: number) => void
    remove: () => void
  }
  /** 트레이너 자료 (더블 여부·대사 색인·갈래) */
  trainer?: (id: number) => {
    double: boolean
    msg: Record<string, number>
    /** 눈이 마주칠 때의 곡을 고르는 데 쓴다 (`trainerEncounterBgm`) */
    class: number
  } | null
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
    /**
     * 「운명적 만남」 표시를 붙여서 한 마리 준다 (SIWON.md).
     *
     * ⚠️ **원작 스크립트는 이 길을 안 쓴다** — 원작에서 그 표시가 붙는 것은
     * 배포로 온 개체와 꽃의 낙원의 쉐이미뿐이다. 배포가 닫혀서 우리가 대신
     * 여는 자리(레지기가스)가 이 길로 온다.
     *
     * 그 표시가 곧 열쇠다 — 유적 셋의 석상과 신수마을의 그라시데아가 그것만 본다
     *
     * @returns 넣었으면 true. 가득 차면 못 준다
     */
    giveFateful: (species: number, level: number) => boolean
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
     * `origin`이면 무조건 오리진이고(깨어진 세계), 아니면 백금옥을 보고 정한다
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
    /** 아는 기술 수. **알은 0이다** (`ScrCmd_GetPartyMonMoveCount`) */
    moveCount: (slot: number) => number
    /** 그 도구를 든 마리가 있는가 (`ScrCmd_CheckPartyHasHeldItem`) */
    hasHeldItem: (item: number) => boolean
    /** 타입 둘 (`MON_DATA_TYPE_1`·`_2`). 한 타입이면 둘이 같다 */
    types: (slot: number) => [number, number]
    /** 그 레벨 **이하**인 알 아닌 마리 수 (`CountPartyMonsBelowLevelThreshold`) */
    countAtOrBelowLevel: (level: number) => number
    /** 남에게 받은 마리인가 — 트레이너 번호만 견준다 (`CheckIsPartyMonOutsider`) */
    isOutsider: (slot: number) => boolean
    /** 노력치 여섯의 합 (`ScrCmd_GetPartyMonEVTotal`) */
    evTotal: (slot: number) => number
    /**
     * 조건에 맞는 첫 자리. 못 찾으면 원작이 주는 값 그대로다 —
     * 기술만 **6**(`MAX_PARTY_SIZE`)이고 나머지는 **0xFF**다. 알은 건너뛴다
     */
    findWithMove: (move: number) => number
    findWithNature: (nature: number) => number
    findWithSpecies: (species: number) => number
    findFateful: (species: number) => number
    /** 기술 한 칸을 비운다 (`Pokemon_ClearMoveSlot`) */
    clearMoveSlot: (slot: number, moveSlot: number) => void
    /** 기술 한 칸을 갈아 끼운다. PP는 새 기술의 최대치로 되돌아간다 */
    setMoveSlot: (slot: number, moveSlot: number, move: number) => void
    /** 크기 대회가 쓰는 값 — 성격값·개체값과 종족의 키 (`size_contest.c`) */
    sizeOf: (slot: number) => { factor: number, heightDm: number } | null
    /** 종족의 키만. 기록과 견줄 때 쓴다 (`BufferSizeContestRecord`) */
    heightOf: (species: number) => number
  }
  /**
   * 스크립트가 여는 「한 마리 골라」 화면
   * (`FieldSystem_OpenPartyMenu_SelectPokemon`).
   *
   * 열고 나면 스크립트가 멈추고, 닫히면 `picked()`가 고른 자리를 준다 —
   * 안 골랐으면 `PARTY_SLOT_NONE`(0xFF)
   */
  chooseMon?: {
    open: () => void
    picked: () => number
  }
  /**
   * NPC 교환 넷 (PARITY §10 · `overlay006/npc_trade.c`).
   *
   * ⚠️ **이 넷이 「말 안 듣기」의 유일한 문이다.** 통신교환이 없으므로 남의
   * 트레이너 번호를 단 포켓몬이 들어오는 길이 이것뿐이다. 안 붙어 있으면
   * `species()`가 0을 주고 스크립트는 늘 "그건 내가 원하던 게 아닌데" 쪽으로
   * 갈라진다 — 교환이 조용히 안 일어난다
   */
  npcTrade?: {
    /** 표 한 벌을 집는다 (`NPCTrade_Init`) */
    init: (tradeId: number) => void
    /** 내주는 종 (`NPCTrade_GetSpecies`) */
    species: () => number
    /** 요구하는 종 (`NPCTrade_GetRequestedSpecies`) */
    requestedSpecies: () => number
    /**
     * 교환 장면을 연다 (`FieldTask_StartNPCTrade`).
     *
     * 여기서 파티가 실제로 바뀐다 — 원작도 장면을 띄우기 **전에**
     * `NPCTrade_ReceiveMon`으로 갈아 끼운다
     */
    start: (partySlot: number) => void
    /** 잡은 것을 놓는다 (`NPCTrade_Free`) */
    free: () => void
  }
  /** 트레이너 정보 · 도감 (`scrcmd_system_flags.c`) */
  trainerInfo?: {
    /** 0 남 · 1 여 (`TrainerInfo_Gender`) */
    gender: () => number
    /** 보이는 다섯 자리 번호 (`TrainerInfo_ID`). 모습 후보가 이 값으로 갈린다 */
    id: () => number
    hasBadge: (badge: number) => boolean
    /** 뱃지 하나를 준다 (`TrainerInfo_SetBadge`) */
    giveBadge: (badge: number) => void
    /** 전국도감을 켰는가. `set`이면 켜고 답은 0이다 */
    nationalDex: (set: boolean) => boolean
    /**
     * 지금까지 본 안농 글자 수 (`Pokedex_NumFormsSeen_Unown`).
     *
     * 매니아터널의 비밀방이 이 수로 열린다 (PARITY §6.8)
     */
    unownFormsSeen: () => number
    /**
     * 도감을 센다 (`Pokedex_CountSeen_*` · `Pokedex_CountCaught_*`).
     *
     * ⚠️ **신오 도감은 목록이 정한다** — 210종의 목록이 `pokedexSort.json`에
     * 있고 그 안에 든 것만 센다. 전국은 493종 전부다
     */
    dexCount: (national: boolean, caught: boolean) => number
    /** 그 도감이 다 찼는가 (`Pokedex_LocalDexCompleted` · `..._NationalDexCompleted`) */
    dexCompleted: (national: boolean) => boolean
    /** 이 종을 본 적이 있는가 (`Pokedex_HasSeenSpecies`) */
    hasSeen: (species: number) => boolean
    /**
     * 본 적 있는 **신오 도감** 종 하나를 아무거나 (`ScrCmd_GetRandomSeenSpecies`).
     *
     * ⚠️ **본 것이 하나도 없으면 피카츄다** — 원작이 그 값을 먼저 넣고
     * 못 찾으면 그대로 둔다. 나눗셈이 0으로 갈리는 자리이기도 하다
     */
    randomSeen: () => number
    /** 폼과 언어를 도감이 세기 시작한다 (`Pokedex_TurnOn*Detection`) */
    turnOnDetection: (kind: 'form' | 'language') => void
  }
  /**
   * 나무열매 밭 118 (PARITY §4.6) — `berry_patch_manager.c`.
   *
   * ⚠️ **밭 번호를 스크립트가 안 준다.** 원작은 말을 건 객체의 `data[0]`을 쓴다
   * (`MapObject_GetDataAt(mapObject, 0)`) — 간판 그림이 그랬던 자리와 같다
   */
  berryPatches?: {
    /** `BERRY_STAGE.*` */
    growthStage: (patch: number) => number
    /** 심긴 열매의 **도구 번호**. 빈 밭이면 0 */
    berryItem: (patch: number) => number
    /** 뿌려 둔 비료의 **도구 번호**. 없으면 0 */
    mulchItem: (patch: number) => number
    /** `SOIL.*` */
    moisture: (patch: number) => number
    /** 지금 열려 있는 개수 */
    yield: (patch: number) => number
    setMulch: (patch: number, mulchItem: number) => void
    plant: (patch: number, berryItem: number) => void
    /** 딴다. 가방에 넣는 것까지 한다 (`Bag_TryAddItem`) */
    harvest: (patch: number) => void
    /**
     * 물뿌리개를 들고 벗는다 (`BerryPatches_StartWatering`·`_EndWatering`).
     *
     * 드는 쪽이 앞의 밭에 물을 주고, 좌우를 누르고 있는 동안 옆 밭으로 이어 준다
     */
    water: (start: boolean) => void
  }
  /**
   * 가방에서 도구 하나를 고르게 한다 (`FieldSystem_CreateBagContext`).
   *
   * ⚠️ **주머니 하나만 보여 준다.** 원작이 목록을 잘라 넘긴다 — 0이 도구
   * 주머니고 4가 열매 주머니다
   */
  chooseItem?: {
    open: (pocket: number) => void
    /** 고른 도구 번호. **0이 「안 고르고 나갔다」**다 */
    picked: () => number
  }
  /**
   * 대습초원 사파리 (PARITY §7.7).
   *
   * ⚠️ **끝낼 때 볼과 걸음을 지운다** — 남은 볼을 들고 나갈 수 없다
   */
  safari?: {
    /** `SAFARI_GAME_ACTIVE`(0)면 시작, `_INACTIVE`(1)면 끝 */
    setActive: (active: boolean) => void
    /** 이번 판에 잡은 마리 (`TVBroadcast_GetSafariGameData`) */
    caught: () => number
    /** 열차를 처음 세운다 (`PersistedMapFeatures_InitForGreatMarsh`) */
    initTram: () => void
    /** 열차를 그 자리로 보낸다. 도착할 때까지 스크립트가 선다 */
    moveTram: (to: number, movement: number) => void
    /** 열차가 도착했는가 */
    tramSettled: () => boolean
    /** 열차가 그 자리에 서 있는가 (`GreatMarshTram_CheckLocation`) */
    tramAt: (location: number) => boolean
  }
  /**
   * VS시커 (PARITY §7.9 · `overlay005/vs_seeker.c`).
   *
   * 재대결 자체는 스크립트가 낸다 — 이 둘은 **훑는 순간**만 맡는다.
   * 표에서 상대를 고르는 일은 명령이 직접 한다(자리 표시가 이동 유형 하나라
   * 바깥에 물어볼 것이 없다)
   */
  vsSeeker?: {
    /** 화면 안을 훑고 느낌표를 세운다. 결과는 `VS_SEEKER_USE_RESULT_*` */
    scan: () => number
    /** 삑 소리와 느낌표 연출이 아직 도는가 */
    busy: () => boolean
  }
  /**
   * 장식 케이스 (PARITY §7.16).
   *
   * ⚠️ **콘테스트는 범위 밖인데 이것만 있다** (§9). 상호교류광장이 주워 온
   * 장식을 넣을 곳이라 뗐다 — 대회·포핀·씰·배경은 없다
   */
  fashionCase?: {
    /** 그만큼 더 들어가는가 (`FashionCase_CanFitAccessoryCount`) */
    canFit: (accessory: number, count: number) => boolean
    /** 넣는다. 넘치면 상한에서 멈춘다 (`FashionCase_AddAccessory`) */
    add: (accessory: number, amount: number) => void
    /** 뺀다 (`FashionCase_RemoveAccessory`) */
    remove: (accessory: number, amount: number) => void
  }
  /** 이름표 — 글 칸을 채우는 데 쓴다 (`BufferMoveName` 등) */
  labels?: {
    move: (move: number) => string
    pocket: (pocket: number) => string
    species: (species: number) => string
    /** 타입 열일곱 (`labels.*.json`의 `types`) */
    type: (type: number) => string
    /** 성격 25 (`TEXT_BANK_NATURE_NAMES`) */
    nature: (nature: number) => string
    /** 트레이너 이름 928 (`TEXT_BANK_NPC_TRAINER_NAMES`) */
    trainer: (id: number) => string
    /** 트레이너 분류 105 (`TEXT_BANK_TRAINER_CLASS_NAMES`) */
    trainerClass: (trainerClass: number) => string
    /** 맵 번호의 지역명 (`MapHeader_LoadName`) */
    map: (mapHeaderId: number) => string
    /** 기술머신이 가르치는 기술의 이름 (`Item_MoveForTMHM`). 머신이 아니면 빈 글 */
    tmMove: (item: number) => string
    /** 도구 이름 그대로. 조사가 안 붙은 판이다 (`TEXT_BANK_ITEM_NAMES`) */
    item: (item: number) => string
    /**
     * 조사가 붙은 판과 복수형.
     *
     * ⚠️ **한국·일본 롬에는 이 표가 없다** — 그쪽에서는 맨 이름을 돌려준다.
     * 없는 표를 억지로 만들지 않는다
     */
    itemWithArticle: (item: number) => string
    itemPlural: (item: number) => string
    speciesWithArticle: (species: number) => string
    trainerClassWithArticle: (trainerClass: number) => string
    /**
     * 나무열매의 이름 (`BerryData_AllocAndGetName`).
     *
     * ⚠️ **도구 이름과 다르다** — 도구는 「체리열매」고 이쪽은 「체리」다.
     * 뱅크가 아예 따로다 (`UI_BANK.berryNames`)
     */
    berry: (item: number) => string
    /**
     * 장식 100가지의 이름 (`TEXT_BANK_CONTEST_ACCESSORY_NAMES`).
     *
     * ⚠️ **조사가 붙은 판은 한국·일본 롬에 없다.** 그쪽을 쓰는
     * `BufferAccessoryNameWithArticle`은 콘테스트 계통이라 안 만든다 (§9)
     */
    accessory: (accessory: number) => string
  }
  /** 보관 시스템. 스크립트가 박스 안을 들여다보는 자리가 몇 군데 있다 */
  boxes?: {
    /**
     * 박스와 자리가 **한 수에 들어 있다** (`boxSlot / 30`, `boxSlot % 30`).
     * 빈 자리면 빈 글 (`ScrCmd_BufferMonNicknameFromPC`)
     */
    nickname: (boxSlot: number) => string
    /**
     * 복권을 맞춰 볼 모든 마리 (PARITY §7.6).
     *
     * 파티와 박스 540칸을 다 훑어야 해서 값만 뽑아 준다 — 스크립트가
     * 「제일 많이 맞은 하나」만 알면 되기 때문이다
     */
    lotteryEntries: () => { party: LotteryEntry[], boxes: (LotteryEntry | null)[] }
  }
  /** 224번도로의 석판 (`MiscSaveBlock_TabletName`, PARITY §6.9) */
  tablet?: {
    /** 새긴 이름. 아직 안 새겼으면 빈 글 */
    name: () => string
    /** 이름 짓기 화면을 연다 (`OpenShayminTabletNamingScreen`) */
    open: () => void
  }
  /**
   * 트레이너의 「모습」 (`appearance.c`, 무쇠시티 포켓몬센터).
   *
   * 통신 대전에서 남에게 보이는 겉모습이다. 후보 넷은 트레이너 번호로 정해지고
   * (`sAppearanceShuffleTable`), 고른 것이 리포트에 남는다
   */
  appearance?: {
    get: () => number
    set: (appearance: number) => void
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
  /**
   * 게임코너의 코인 (`coins.c`).
   *
   * ⚠️ `canAdd`와 `add`의 답이 다를 수 있다 — 규칙은 `engine/world/coins`가 안다
   */
  coins?: {
    get: () => number
    add: (amount: number) => void
    subtract: (amount: number) => void
    canAdd: (amount: number) => boolean
  }
  /**
   * 배틀포인트 (PARITY §12.3).
   *
   * ⚠️ **버는 곳은 배틀팩토리 하나뿐이다** (§9.3). 나머지 넷은 §9라
   * `GiveBattlePoints`가 스크립트에 0회다 — 원작도 시설 코드가 직접 준다
   */
  battlePoints?: {
    get: () => number
    add: (amount: number) => void
    subtract: (amount: number) => void
  }
  /**
   * 게임 기록과 트레이너 스코어 (PARITY §7.5).
   *
   * ⚠️ **스크립트만 올리는 것이 아니다.** 걸음·야생전·잡은 수는 코드가 세고
   * (`scene/records`), 스크립트는 그 밖의 자리를 올린다 — 둘이 같은 칸에 쌓인다
   */
  records?: {
    add: (id: number, amount: number) => void
    score: (event: number) => void
  }
  /**
   * 스크립트가 리포트를 쓴다 (`CommonScript_SaveGame` · PARITY §4.12).
   *
   * ⚠️ **묻고 답하는 것은 전부 원작 스크립트다.** "작성할까요?"도 "덮어써도
   * 괜찮습니까?"도 공용 스크립트 0x7D6이 `ShowYesNoMenu`로 묻는다 — 여기
   * 있는 것은 그 스크립트가 부르는 **밑바닥 넷**뿐이다.
   *
   * ⚠️ **여기가 없으면 배틀프런티어에 못 들어간다.** 로비가 도전 앞에서
   * `Common_SaveGame`을 부르고 그 결과가 0이면 스스로 돌려보내기 때문이다
   */
  saveGame?: {
    /**
     * `SAVE_TYPE_*` — 0 덮어쓸 수 없음 · 1 자료 없음 · 2 전체 저장 · 3 빠른 저장.
     *
     * ⚠️ **우리는 1과 2만 답한다.** 원작의 「빠른 저장」은 플래시의 바뀐 블록만
     * 쓰는 것인데 우리 리포트는 한 덩이라 늘 전체다 — 없는 갈래를 답하면
     * 스크립트가 "조금만 저장합니다"라고 거짓말을 한다
     */
    type: () => number
    /** 요약창 (`OpenSaveInfo` · `CloseSaveInfo`) */
    showInfo: () => void
    hideInfo: () => void
    /** 「저장 중」 표시 (`ShowSavingIcon` · `HideSavingIcon`) */
    showIcon: () => void
    hideIcon: () => void
    /** 쓰기를 시작한다. 이미 쓰는 중이면 아무 일도 안 한다 */
    begin: () => void
    /** 끝났으면 됐는지 아닌지, 아직이면 `null` */
    result: () => boolean | null
  }
  /**
   * 배틀프런티어 시설 장면 (`ScrCmd_LaunchBattleFrontierScene` · PARITY §9.3).
   *
   * ⚠️ **여기서부터는 다른 VM이다.** 원작은 오버레이 104가 **자기 스크립트**를
   * 들고 시설 안을 굴린다 — 필드 스크립트는 장면 번호 하나를 넘기고 끝날
   * 때까지 선다. 우리는 그 안을 네이티브 흐름으로 만들었다
   * (`state/factoryStore`), 그래서 필드 쪽 약속은 이 둘뿐이다
   */
  frontier?: {
    /** `FRONTIER_SCENE_*`. 안 만든 시설이면 아무 일도 안 한다 */
    openScene: (scene: number) => void
    /** 장면이 아직 떠 있는가. 참인 동안 스크립트가 선다 */
    busy: () => boolean
  }
  /**
   * 소지금·코인 창 (`FieldMenu_CreateMoneyWindow` · `FieldMenu_DrawCoinWindow`).
   *
   * 자리는 **타일 좌표**다. ⚠️ 값은 `update`를 부를 때만 다시 찍는다 —
   * 원작이 그렇고, 그래서 돈을 깎은 직후 한순간 옛 숫자가 남는다
   */
  currency?: {
    showMoney: (left: number, top: number) => void
    hideMoney: () => void
    updateMoney: () => void
    showCoins: (left: number, top: number) => void
    hideCoins: () => void
    updateCoins: () => void
    showBP: (left: number, top: number) => void
    hideBP: () => void
    updateBP: () => void
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
  openShop?: (items: readonly number[], currency?: ShopCurrency) => void
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
    /**
     * 지금 서 있는 자리에서 그 기술을 쓴다 (`FieldTask_StartUseSurf` 등).
     *
     * 스크립트가 부르는 길은 **말을 걸어 여는 쪽**이다 — 파도타기·폭포오르기·
     * 록클라임은 물이나 벽에 대고 확인을 누르면 "쓰겠습니까"를 묻고 여기로 온다.
     * 자격은 스크립트가 이미 봤으므로 여기서는 지형만 본다
     *
     * @returns 실제로 썼으면 true
     */
    use: (id: 'surf' | 'waterfall' | 'rockClimb') => boolean
    /** 괴력을 켜고 끄고 묻는다 (`SystemFlag_HandleStrengthActive`) */
    strength: (mode: 'set' | 'clear' | 'check') => boolean
  }
  /** 자전거 (`PlayerAvatar_SetTransitionState`·`_SetOnCyclingRoad`) */
  bike?: {
    riding: () => boolean
    ride: (on: boolean) => void
    /** 자전거로드 위인가. 서 있으면 다리 위에서 못 내린다 */
    setRoad: (on: boolean) => void
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
  /** 배회 포켓몬 (PARITY §6.3) — `RoamingPokemon_ActivateSlot` */
  roamers?: {
    /** 그 자리를 열고 신오 어딘가에 놓는다. 자리 번호는 `RoamerSlot` */
    activate: (slot: number) => void
  }
  /**
   * 포켓치 (PARITY §7.3) — `scrcmd.c`의 여섯 명령.
   *
   * ⚠️ **켜는 명령이 따로 없다.** 원작은 축복시티의 포켓치 화면이 뜰 때
   * `Poketch_Enable`을 부르는데, 그 화면은 스크립트 명령이 아니라 필드 과제다.
   * 우리는 **앱을 처음 등록할 때** 같이 켠다 — 사장이 기계를 주면서 앱도
   * 등록하므로 같은 순간이다
   */
  poketch?: {
    enabled: () => boolean
    /** 등록한다. 이미 있으면 거짓 */
    register: (app: number) => boolean
    has: (app: number) => boolean
    /** 앱 이름 (`poketch_app_names` 뱅크) */
    appName: (app: number) => string
    /** 연출 동안 치운다 (`ScrCmd_HidePoketch`) */
    show: (visible: boolean) => void
  }
  /**
   * 기술 되살리기·기술가르침 (PARITY §5 `move_reminder`).
   *
   * 둘이 **같은 화면**을 쓴다 (`FieldSystem_OpenMoveReminderMenu`) — 다른 것은
   * 목록이 학습표에서 오느냐 한 줄뿐이냐 하나다
   */
  reminder?: {
    /** 그 자리가 되살릴 수 있는 기술 수 */
    count: (partySlot: number) => number
    /** 화면을 연다. `move`를 주면 기술가르침이다 */
    open: (partySlot: number, move?: number) => void
    /** 실제로 배웠는가 (`keepOldMove`) */
    learned: () => boolean
  }
  /**
   * 요약 화면을 **기술 고르기**로 연다
   * (`FieldSystem_OpenSummaryScreenSelectMove` · `…TeachMove`).
   *
   * 되살리기(`reminder`)와 다르다 — 저쪽은 **배울 기술을 고르는** 목록이고
   * 이쪽은 **이 마리의 네 칸 중 하나를 짚는** 화면이다. 기술 삭제사는 지울
   * 칸을, 조각 교사는 덮어쓸 칸을 여기서 고른다
   */
  selectMove?: {
    /** 연다. `move`를 주면 「가르침」이라 목록 끝에 그 기술이 한 줄 더 붙는다 */
    open: (partySlot: number, move?: number) => void
    /**
     * 고른 칸. 아직 안 닫혔으면 `null`이고, 그만뒀으면 네 칸 밖의 자리
     * (`LEARNED_MOVES_MAX`)다 — 그 값의 뜻은 부르는 명령이 진다
     */
    picked: () => number | null
  }
  /** 도감 완성 상장 (PARITY §5 `diploma`) */
  diploma?: { show: (national: boolean) => void }
  /** 방금 있던 맵의 헤더 번호 (`FieldOverworldState_GetPrevLocation`) */
  previousMap?: () => number
  /**
   * 낱말 고르기 (PARITY §4.8).
   *
   * ⚠️ **글자는 여기서만 나온다.** 규칙은 `engine/world/easyChat`가 갖고
   * 있지만 낱말의 글자는 롬 뱅크라, 붙이는 쪽이 그 뱅크를 들고 있다
   */
  easyChat?: {
    allToughUnlocked: () => boolean
    /** 하나를 풀고 그 글자를 준다. 다 풀렸으면 `null` */
    unlockTough: () => { entry: number, text: string } | null
    wordText: (word: number) => string
  }
  /** 지금 이 맵의 날씨 번호 (`FieldOverworldState_GetWeather`) */
  weather?: () => number
  /** 오늘이 무슨 요일인가. 0이 일요일이다 (`RTCDate.week`) */
  dayOfWeek?: () => number
  /** 지금 몇 시인가 0~23 (`FieldSystem_GetHour`) */
  hour?: () => number
  /** 우편함 (PARITY §4.8). PC의 갈래에서 연다 (`ScrCmd_1B3`) */
  mailbox?: {
    /** 지금 든 편지 수 (`Mailbox_CountMail`) */
    count: () => number
    open: () => void
  }
  /** 명예의 전당 (PARITY §7.11) — `ClearGame` · `OpenPCHallOfFameScreen` */
  hallOfFame?: {
    /**
     * 이야기를 끝낸다 (`ClearGame`).
     *
     * 깃발과 전당에 든 날을 먼저 세우고 장면을 연다. 장면이 리포트를 쓰고
     * **타이틀로 나간다** — 그래서 이 뒤의 스크립트 줄은 안 돈다
     */
    clear: () => void
    /** 여태 몇 번 들었는가 (`HallOfFame_GetEntryNum(hof, 0)`) */
    victories: () => number
    /** PC로 다시 보는 화면을 연다 */
    openPC: () => void
  }
  /** 모험노트 (PARITY §7.4) — `ScrCmd_GiveJournal` · `ScrCmd_CreateJournalEvent` */
  journal?: {
    /** 노트를 받는다. 첫 쪽이 여기서 펼쳐진다 */
    give: () => void
    /**
     * 오늘 쪽에 자리 일 하나를 적는다.
     *
     * `param`은 갈래마다 뜻이 다르다 — 도구는 도구 번호, 비전기술은 맵 번호,
     * 나머지는 안 본다 (`ScrCmd_CreateJournalEvent`)
     */
    event: (type: number, param: number) => void
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
   * 갤럭시단아지트의 감금장치 셋
   * (`overlay006/lake_guardian_containment_units.c`).
   *
   * 맵에 들어설 때 `init`이 서고, 시로나가 풀어 주는 자리에서 `open`이 돈다.
   * `settled`가 참이 될 때까지 스크립트가 선다
   */
  lakeGuardianUnits?: {
    /** `freed`는 `FLAG_FREED_GALACTIC_HQ` — 이미 풀어 줬으면 열린 채로 선다 */
    init: (freed: boolean) => void
    open: () => void
    settled: () => boolean
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
   * 스크립트가 세우는 야생 조우 (`Encounter_NewVsSpeciesAtLevel`).
   *
   * 야생과 같은 배틀인데 **종과 레벨을 스크립트가 준다.** 인카운터 표를 안
   * 거치므로 기라티나·디아루가처럼 표에 없는 것이 여기로 나온다.
   *
   * ⚠️ **`StartWildBattle`과 `StartLegendaryBattle` 둘 다 여기로 온다.** 원작에서
   * 그 둘의 차이는 마지막 인자 하나(`isLegendary`)뿐이고, 그것이 바꾸는 것은
   * `BATTLE_STATUS_LEGENDARY` → 컷인 연출과 곡이다. 우리는 곡을 **종족 번호로**
   * 고르므로(`audio/songs`의 `WILD_SONG`, 롬의 `enc_effects.c`에서 뽑은 표)
   * 한 길로 둬도 결과가 원작과 같다 — 이름을 「전설」로 두면 그것이 안 보인다
   */
  startScriptedWildBattle?: (species: number, level: number) => void
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
   * 시원의 배포 (SIWON.md). **원작에 없는 서비스다** — 이 저장소가 덧붙인
   * 사람 하나가 리포트의 두 칸을 읽고 쓴다
   */
  siwon?: {
    /** 여태 준 개수 */
    given: () => number
    /** 하나 줬다 */
    gave: () => void
    /** 리그 복도에서 이미 만났는가 */
    met: () => boolean
    /** 만났다고 적는다. 그 연출은 한 번만 돈다 */
    meet: () => void
  }
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
   * 지금 다가오고 있는 사람 둘 (`ScriptManager`의 `trainers[2]`).
   *
   * ⚠️ **둘이다.** 더블 배틀 한 쌍과, 서로 다른 둘이 동시에 볼 때(VS2)가
   * 여기 들어간다 — 슬롯 하나로 두면 두 번째 사람이 안 걸어온다.
   * ⚠️ **`reset()`이 안 지운다.** 눈이 마주친 것을 적고 나서 스크립트를
   * 시작하는데, 시작이 `reset()`을 부른다
   */
  approaching: (ApproachingTrainer | null)[] = [null, null]

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
  private readonly input: () => PrinterInput
  /** 지금 창이 닫는 누름을 받았는가. `takeAck`가 한 번만 가져간다 */
  private acked = false

  constructor(init: WorldInit) {
    this.vars = init.vars
    this.messages = init.messages ?? []
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
  showMessage(id: number): void {
    this.boxOpen = true
    this.lastMessage = id
    this.acked = false
    this.printer = new MessagePrinter(this.bank[id] ?? '', this.slots)
  }

  /** 트레이너 대사처럼 뱅크가 아니라 다른 데서 온 글을 올린다 */
  showText(text: string): void {
    this.boxOpen = true
    this.acked = false
    this.printer = new MessagePrinter(text, this.slots)
  }

  /**
   * 방금 대사창의 **닫는 누름**을 받았는가. 받았으면 그 표를 가져간다.
   *
   * ⚠️ **원작은 `Message`가 인쇄만 끝나면 곧바로 돌아온다.** 누름을 받는 것은
   * 뒤따르는 `WaitButton`이다. 우리는 `Message`가 직접 받으므로(`printer.ts`)
   * 그대로 두면 `Message` + `WaitButton`이 붙은 자리에서 **같은 창을 두 번**
   * 눌러야 한다 — 이 한 번짜리 표가 그 겹침을 없앤다
   */
  takeAck(): boolean {
    const had = this.acked
    this.acked = false
    return had
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
    this.acked = false
    if (erase) this.printer = null
  }

  /**
   * 조각 값 창 (`FieldMenuManager_NewMoveTutorCostWindow` · PARITY §10).
   *
   * ⚠️ **글이 아니라 수다.** 원작 창은 조각 넷의 값을 아이콘과 숫자로 보여
   * 준다 — 우리가 지어낸 문장이 아니라 도구 번호와 개수라, 화면 쪽이 이름을
   * 붙여 그린다. `null`이면 창이 없다
   */
  shardCost: readonly { name: string, need: number, have: number }[] | null = null

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

  /**
   * 글을 뱅크가 아니라 **그대로** 받는 항목.
   *
   * ⚠️ **뱅크 밖에서 오는 글이 있다.** 기술가르침 목록의 항목이 기술 이름인데
   * 그것은 스크립트 뱅크에도 메뉴 뱅크에도 없고 기술 이름표에 있다 —
   * 원작도 그 자리에서 로더를 갈아 끼운다 (`MoveTutorManager_SetMessageLoader`)
   */
  addMenuEntryText(text: string, value: number): void {
    if (this.builder === null) return
    this.builder.entries.push({ text, value, alt: null })
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
    if (this.printer !== null) {
      const before = this.printer.finished
      this.printer.tick(this.input())
      // 이번 프레임에 **닫는 누름**을 받았다면 표시해 둔다 (`takeAck`)
      if (!before && this.printer.finished) this.acked = true
    }
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
