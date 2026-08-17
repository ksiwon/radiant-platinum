// 필드 스크립트 실행 (DATA.md §2.10) — 오버월드와 VM을 잇는 자리.
//
// 원작의 한 프레임이 그대로 여기 있다. 스크립트가 돌고 있으면 그것을 한 칸
// 굴리고(`ScriptContext_Run`), 아니면 말을 걸었는지 본다. 스크립트가 도는 동안
// **플레이어는 못 움직인다** — 원작도 `LockAll`로 세워 둔다.
//
// 이 모듈은 React를 모른다. 화면은 `world`를 들여다보기만 한다.
import { loadDialogueBank, loadScriptBytes, loadScriptMeta, type DataLocale } from '../../data/gameData'
import { markScript } from '../../app/sceneMark'
import {
  BG_EVENT_DIR, BG_EVENT_TYPE, clearWarpOverrides, hideFlagOf, mapById, npcsOf, NO_SCRIPT,
  signsOf, talkTile, TILE_BEHAVIOR_PC, triggersOf, world as mapWorld, type Npc, type Sign,
} from '../map/world'
import { worldState, type FieldActionFxKind } from '../../state/worldState'
import {
  buildCommands, SCRIPT_ID_OFFSET_SINGLE_BATTLES, SYSTEM_FLAG,
  TRAINER_DEFEATED_FLAGS_START, trainerIdOf, type CommandTable,
} from './commands'
import { ScriptContext, ScriptError, type CommonScripts } from './context'
import { entryOffset, fileBytes, resolveScript, type ScriptData } from './data'
import { resetFade } from './fade'
import {
  clearNpcPlacement, npcActors, npcByMovementType, spawnNpcs, switchMovementType,
} from '../actor/npcs'
import { disguiseOf, setAmbientTables } from '../actor/ambient'
import { frameTableScript, INIT_SCRIPT, parseInitScripts, type InitScripts } from './initScripts'
import { fieldBgm } from '../audio/songs'
import { HONEY_TREE_MODEL } from '../world/honeyTree'
import {
  COMMON_SCRIPT_GIVE_ITEM, EGG_GIVER_TRAVELING_MAN, planSiwonTalk, siwonCameoText,
  VAR_GIVE_COUNT, VAR_GIVE_ITEM,
} from './siwonScene'
import { SIWON_CAMEO_MAP, SIWON_SCRIPT } from '../world/siwonPlace'
import { obstacleAt } from '../actor/obstacles'
import { HOP_TIME } from '../actor/ledge'
import { clearPanelSlide } from '../actor/slidePanel'
import { clearIceSlide } from '../actor/ice'
import {
  FIELD_MOVES, fieldMoveHere, movesUsableHere, whyNot,
  type FieldMoveId, type FieldSpot, type Trainer,
} from './fieldMoves'
import { TRAINER_TYPE, trainerInSight } from '../actor/sight'
import { APPROACH_TYPE, type ApproachingTrainer } from '../actor/approach'
import { DIR, type Movable, type MovementTable } from './movement'
import { TEXT_SPEED, type PrinterInput } from './printer'
import { VarStore, VAR_LAST_TALKED } from './vars'
import { FieldWorld, MENU_CANCEL, MENU_NO, type FieldServices, type NameSource } from './world'

/**
 * 한 프레임에 이만큼 넘게 명령을 밟으면 스크립트가 되돌아 도는 것이다.
 *
 * 원작은 상한이 없다 — 그런 스크립트가 없으니까. 우리는 아직 안 만든 명령을
 * 건너뛰므로 조건이 영영 안 바뀌는 고리가 생길 수 있고, 그때 브라우저 탭이
 * 통째로 멎으면 안 된다
 */
const STEP_CAP = 200_000

export const fieldScripts = {
  data: null as ScriptData | null,
  commands: null as CommandTable | null,
  world: null as FieldWorld | null,
  /** 세이브에 남을 변수·플래그. 지금은 이 자리에만 있다 */
  vars: new VarStore(),
  /** 지금 도는 스크립트. null이면 오버월드가 자유롭다 */
  ctx: null as ScriptContext | null,
  /** 화면에 띄운 마지막 오류. 스크립트가 터져도 게임은 계속 돌아야 한다 */
  lastError: null as string | null,
  /** 지금 받아 둔 대사 뱅크 번호 (맵 헤더의 `msg`) */
  bank: -1,
  /**
   * 대사에 끼워 넣을 이름. 세이브가 로드되면 화면 쪽에서 갈아 끼운다.
   *
   * 함수로 두는 이유는 이름이 세계보다 늦게 정해지기 때문이다 — 세계는 맵이
   * 뜰 때 만들어지고 이름은 세이브가 복원된 뒤에야 나온다
   */
  names: {
    player: () => '',
    rival: () => '',
    counterpart: () => '',
  } as NameSource,
  /**
   * 설정의 글자 속도(글자당 프레임). 설정 화면이 갈아 끼운다.
   *
   * 함수인 이유는 이름과 같다 — 세계가 만들어진 뒤에 설정이 바뀌어도 다음
   * 대사부터 바로 먹어야 한다
   */
  textSpeed: (() => TEXT_SPEED.normal) as () => number,
  /**
   * 스크립트 한 판이 끝날 때 불린다. 세이브에 밀어 넣는 자리다.
   *
   * 매 프레임이 아니라 **판이 끝날 때**만 부른다 — 플래그 하나 세울 때마다
   * IndexedDB에 쓰면 대사 한 번에 수십 번 저장이 나간다
   */
  onScriptEnd: null as ((vars: VarStore) => void) | null,
  /** 바깥 세계에 부탁하는 것들. 씬이 붙인다 (`scene/fieldServices.ts`) */
  services: {} as FieldServices,
  /**
   * 이미 받아 둔 **구역 뱅크**(간판·공용 스크립트가 읽는 글). 맵 뱅크와 다르다.
   *
   * 받아 두면 두 번째부터는 프레임을 안 세운다 — 안 그러면 간판을 읽을 때마다
   * 한 프레임씩 멎는다. 언어가 바뀌면 비운다
   */
  banks: new Map<number, readonly string[]>(),
}

/**
 * 공용 스크립트 (`CallCommonScript` · `ReturnCommonScript`).
 *
 * ⚠️ **이 둘을 안 만들어 두고 건너뛰고 있었다.** 안 만든 명령은 길이만큼
 * 건너뛰는데, 이 명령은 건너뛰면 **하는 일이 통째로 사라진다** — 포켓몬센터
 * 간호사가 그렇다. 그쪽 스크립트는 `SetVar` 하나에 `CallCommonScript 2002`가
 * 전부라, 건너뛰면 말을 걸어도 아무 일이 안 일어난다. 실측으로 NPC 스크립트
 * 3306개 중 **770개(23.3%)**가 이 명령을 거친다.
 *
 * 원작은 스크립트 문맥을 **하나 더 만들어** 돌리고, 부모는 그것이 끝날 때까지
 * 선다(`ScriptContext_WaitSubContext`). 관리자가 매 프레임 문맥 전부를 돌리지만
 * 부모는 서 있으므로 실제로 나아가는 것은 자식 하나다 — 그래서 우리도 자식
 * 하나만 밟는다.
 *
 * ⚠️ **글 뱅크도 같이 갈린다** (`ScriptContext_Load`가 파일과 뱅크를 함께 받는다).
 * 공용 스크립트 안의 `Message 3`은 맵의 3번이 아니라 그 구역 뱅크의 3번이다.
 */
const common = {
  ctx: null as ScriptContext | null,
  /**
   * 부르는 중인가. 뱅크를 **받는 동안에도** 참이다 — 안 그러면 부모가 먼저
   * 깨어나서 자식이 한 마디도 못 하고 끝난 것처럼 보인다
   */
  busy: false,
  /** 부모가 읽던 뱅크. 돌아올 때 이리로 되돌린다 */
  parentBank: null as number | null,
}

/**
 * 글 뱅크를 기다리는 중.
 *
 * 뱅크는 fetch로 온다. 오기 전에 `Message`를 밟으면 **빈 글이 뜨고 그대로
 * 지나가 버리므로**, 올 때까지 스크립트를 한 프레임씩 세워 둔다. 한 번 받은
 * 뱅크는 `gameData`가 들고 있어서 두 번째부터는 안 선다
 */
let bankPending = false

/**
 * 지금 창에 걸린 구역 뱅크. null이면 맵 뱅크 그대로다.
 *
 * **이 값이 없으면 맵 스크립트를 걸 때마다 글을 덮어쓴다** — 맵 뱅크를 아직
 * 안 받은 자리(시험·첫 프레임)에서 멀쩡한 글이 빈 배열로 갈린다
 */
let activeBank: number | null = null

/**
 * 그 구역이 읽는 글로 갈아 끼운다.
 *
 * `msg`가 null이면 맵 뱅크다 — 맵 스크립트가 그 경우다
 */
function switchBank(msg: number | null): void {
  if (msg === activeBank) return
  activeBank = msg
  if (msg === null) { fieldScripts.world?.useBank(null); return }
  const hit = fieldScripts.banks.get(msg)
  if (hit) { fieldScripts.world?.useBank(hit); return }
  bankPending = true
  loadDialogueBank(locale, msg)
    .then((bank) => {
      fieldScripts.banks.set(msg, bank)
      if (activeBank === msg) fieldScripts.world?.useBank(bank)
    })
    .catch(() => { /* 글이 비는 것으로 끝난다 */ })
    .finally(() => { bankPending = false })
}

/**
 * 세이브에서 복원한 변수·플래그를 붓는다.
 *
 * 새 `VarStore`로 갈아 끼우지 않고 **내용만 덮어쓴다** — 이미 만들어진 세계와
 * 실행 문맥이 같은 객체를 들고 있기 때문이다
 */
/**
 * 새 게임의 플래그·변수를 세운다 (`FieldSystem_InitNewGameState`).
 *
 * 원작은 `SCRIPT_ID(INIT_NEW_GAME, 0)`을 **끝까지 한 번에** 돌린다
 * (`ScriptContext_Run`을 while로 감는다). 그 스크립트가 하는 일은 아직 안 나온
 * NPC 130여 명을 숨기는 플래그를 세우는 것이다 — 안 돌리면 마박사도 라이벌도
 * 처음부터 길에 서 있다.
 *
 * **표를 손으로 옮기지 않는다.** 우리가 이미 그 바이트코드를 싣고 있다.
 *
 * @returns 돌렸으면 true. 스크립트를 아직 못 받았으면 false
 */
/**
 * 새 판을 열 때도 살아남아야 하는 플래그 (시험용).
 *
 * 확인 지점이 「전당등록 뒤」처럼 **이야기 단계**를 세워 두는데, 새 판의
 * 초기화가 `vars.reset()`으로 그것을 지운다. 지우면 안 되는 것만 여기 담는다
 */
const forcedFlags = new Set<number>()

/** 플래그와 같은 이유로 살아남아야 하는 변수 (시험용). VS시커 배터리가 그렇다 */
const forcedVars = new Map<number, number>()

/** 확인 지점이 세운 플래그를 새 판 초기화 뒤에도 남긴다 */
export function forceFlag(flag: number): void {
  forcedFlags.add(flag)
  fieldScripts.vars.setFlag(flag)
}

/** 확인 지점이 세운 변수도 같이 남긴다 */
export function forceVar(id: number, value: number): void {
  forcedVars.set(id, value)
  fieldScripts.vars.set(id, value)
}

export function initNewGame(): boolean {
  const { data, commands, vars } = fieldScripts
  if (data === null || commands === null) return false
  const file = data.meta.files.findIndex((f) => f.name === 'scripts_init_new_game')
  if (file < 0) return false

  vars.reset()
  const world = makeWorld(vars)
  const ctx = new ScriptContext(
    { vars, world, commands: commands.map }, fileBytes(data, file), file,
  )
  ctx.start(entryOffset(data, file, 0))
  // 대사도 이동도 없는 스크립트라 한 번에 끝난다. 상한은 되돌아 도는 것을 막는 자리다
  ctx.step(STEP_CAP)
  // ⚠️ **확인 지점이 미리 세워 둔 플래그를 여기서 되살린다.** 위의
  // `vars.reset()`이 그것까지 지우는데, 이 함수는 세이브를 만든 **뒤에** 도는
  // 프레임에서 불린다 — 그래서 전당등록 뒤의 자리로 뛰어들어도 그 플래그가
  // 없는 채로 떴다 (시원이 「아직」이라고 했다). 시험용이고 평소에는 비어 있다
  for (const flag of forcedFlags) vars.setFlag(flag)
  for (const [id, value] of forcedVars) vars.set(id, value)
  // ⚠️ **가방은 스크립트가 안 준다.** 새 판을 여는 코드가 직접 켠다
  // (`game_start.c`의 `StartNewSave`). 스크립트에도 `GiveBag`이 있기는 한데
  // 그 자리는 원본이 안 쓰는 `…_Unused2` 안이라 어디서도 안 불린다 — 이 줄이
  // 없으면 시작 메뉴에 가방이 영영 안 뜬다
  vars.setFlag(SYSTEM_FLAG.bagAcquired)
  return true
}

export function loadVars(saved: Uint16Array, flags: Uint8Array): void {
  const target = fieldScripts.vars
  target.saved.set(saved.subarray(0, target.saved.length))
  target.flags.set(flags.subarray(0, target.flags.length))
}

/** 스크립트가 돌고 있는가. 이동·조우 시스템이 이걸 보고 비켜선다 */
export function scriptBusy(): boolean {
  return fieldScripts.ctx !== null || native !== null
}

// ── 우리 글로 도는 대사 (SIWON.md) ──────────────────────────────────────────
//
// 롬 바이트코드가 아닌 말을 창에 올리는 유일한 길이다. 창을 살리고 인쇄기를
// 굴리는 것은 원작 대사와 **똑같은 부품**을 쓴다 — `showText`는 원작에도 있는
// 길이고(트레이너 대사) 쪽 넘김(`\r`)도 인쇄기가 알아서 한다.
//
// ⚠️ **발을 묶는 것을 잊으면 안 된다.** 스크립트가 도는 동안 원작이 `LockAll`로
// 세워 두는 것과 같은 일을 여기서도 해야 한다 — 안 하면 대사창을 띄운 채로
// 걸어 나갈 수 있다

/** 지금 도는 우리 대사. 끝나면 `after`가 한 번 돈다 */
let native: { after: (() => void) | null } | null = null

/**
 * 우리 글 한 덩이를 창에 올리고, 다 읽고 버튼을 누르면 `after`를 부른다.
 *
 * 여러 쪽은 글 안의 `\r`이 나눈다 — 덩이를 쪼개 놓고 여기서 세지 않는다.
 * 그래야 넘기는 규칙이 원작 대사와 한 벌이다
 */
function showOurText(text: string, after: (() => void) | null): void {
  const { world } = fieldScripts
  if (world === null) { after?.(); return }
  native = { after }
  world.showText(text)
}

/** 우리 대사 한 프레임. 스크립트 VM 자리에서 대신 돈다 */
function stepOurText(world: FieldWorld): void {
  worldState.input.move.set(0, 0)
  worldState.player.velocity.set(0, 0, 0)
  world.tick()
  if (!world.printed || !frameInput.pressed) return
  const done = native
  native = null
  world.closeBox(true)
  done?.after?.()
}

/** 시원이 이번에 할 일을 세우고 밟는다 */
function talkToSiwon(mapFile: number): void {
  const { world, vars, services } = fieldScripts
  if (world === null) return
  const siwon = services.siwon
  const party = services.party
  const bag = services.bag
  if (!siwon || !party || !bag) return

  const plan = planSiwonTalk({
    locale,
    given: siwon.given(),
    probe: {
      flag: (id) => vars.checkFlag(id),
      variable: (id) => vars.get(id),
      rotomForms: () => party.rotomForms(),
    },
    canFitItem: (item) => bag.canFit(item, 1),
    hasPartyRoom: () => party.count() < PARTY_SLOTS,
    giveFateful: (species, level) => { party.giveFateful(species, level) },
    // 화강돌은 원작에서 그냥 잡는 마리라 표시를 안 붙인다 (`world/siwon`)
    giveMon: (species, level) => { party.give(species, level, 0) },
    giveEgg: (species) => { services.giveEgg?.(species, EGG_GIVER_TRAVELING_MAN) },
    setVar: (id, value) => { vars.set(id, value) },
    countGiven: () => { siwon.gave() },
  })

  showOurText(plan.text, () => {
    plan.commit?.()
    // 가방에 넣는 것과 「받았다」는 **원작 공용 스크립트**가 한다. 그래야 그
    // 한 줄이 롬의 글 그대로다 (SIWON.md §4)
    if (plan.giveItem !== null) {
      // ⚠️ **문맥을 세운 뒤에 적는다.** 0x8004·0x8005는 스크립트 **지역** 칸이고
      // `start()`가 첫머리에서 `resetLocals()`로 지역 칸을 통째로 비운다 — 먼저
      // 적어 두면 시작하는 그 순간 0이 된다. 실측: 시원에게 첫 선물을 받으면
      // 「**없음**을 손에 넣었다!」가 뜨고 가방에는 아무것도 안 들어갔다
      if (start(COMMON_SCRIPT_GIVE_ITEM, mapFile)) {
        vars.set(VAR_GIVE_ITEM, plan.giveItem)
        vars.set(VAR_GIVE_COUNT, 1)
      }
    }
  })
}

/** 파티 자리 수. `PARTY_MAX`와 같은 수인데 엔진 안에서 다시 부르지 않는다 */
const PARTY_SLOTS = 6

/**
 * 전당등록 직전, 리그 복도에서의 기습 등장 (SIWON.md §6).
 *
 * ⚠️ **원작 스크립트보다 먼저 선다.** 복도의 `OnFrame`이 시로나와 마박사를
 * 부르는데 그 한복판에는 못 끼우므로(롬 바이트코드다) 그 앞에 세운다
 *
 * @returns 이번 프레임을 우리가 가져갔으면 true
 */
function trySiwonCameo(): boolean {
  const siwon = fieldScripts.services.siwon
  if (!siwon || mapWorld.mapId !== SIWON_CAMEO_MAP || siwon.met()) return false
  siwon.meet()
  showOurText(siwonCameoText(locale), null)
  return true
}

let locale: DataLocale = 'ko'

/**
 * 바이트코드와 명령표를 받는다. 한 번만 하면 된다.
 *
 * 대사 뱅크는 여기서 안 받는다 — 맵마다 다르고 맵이 정해진 뒤에야 알 수 있다
 */
export async function initFieldScripts(which: DataLocale = 'ko'): Promise<void> {
  // 자료는 한 번만 받으면 되지만, 언어는 그 사이에 바뀌었을 수 있다
  if (fieldScripts.data !== null) { setFieldLocale(which); return }
  locale = which
  const [meta, bytes] = await Promise.all([loadScriptMeta(), loadScriptBytes()])
  fieldScripts.data = { meta, bytes }
  fieldScripts.commands = buildCommands(meta.commands)
  // 사람이 혼자 하는 짓도 같은 파일에서 온다. 안 붙이면 온 신오가 마네킹이고
  // `LockAll`이 멈출 것을 못 찾는다
  setAmbientTables(meta)
  fieldScripts.world = makeWorld(fieldScripts.vars)
  // 전역 메뉴가 항목 글을 여기서 읽는다. 맵과 무관하므로 한 번만 받는다
  loadDialogueBank(which, MENU_ENTRIES_BANK)
    .then((bank) => { if (fieldScripts.world) fieldScripts.world.menuEntryTexts = bank })
    .catch(() => { /* 전역 메뉴 글만 빈다 */ })
}

/** `TEXT_BANK_MENU_ENTRIES` — 전역 메뉴가 쓰는 항목 글 280개 (미국 번호) */
export const MENU_ENTRIES_BANK = 361

/**
 * 언어가 바뀌었다.
 *
 * `initFieldScripts`는 두 번째부터 곧바로 돌아오므로(자료는 한 번만 받으면
 * 된다) 그쪽으로는 언어를 못 바꾼다. **지금 서 있는 맵의 글**을 다시 받는 것이
 * 여기서 할 일이다 — 안 그러면 설정에서 바꾼 뒤에도 말을 걸 때까지 옛 언어가
 * 남아 있다가, 맵을 옮기는 순간 갑자기 바뀐다
 */
export function setFieldLocale(which: DataLocale): void {
  if (which === locale) return
  locale = which
  loadDialogueBank(which, MENU_ENTRIES_BANK)
    .then((bank) => { if (fieldScripts.world) fieldScripts.world.menuEntryTexts = bank })
    .catch(() => { /* 전역 메뉴 글만 옛 언어로 남는다 */ })
  // 받아 둔 구역 뱅크는 옛 언어다. 비워야 다음 간판부터 새 언어로 온다
  fieldScripts.banks.clear()
  const bank = fieldScripts.bank
  if (bank < 0) return
  loadDialogueBank(which, bank)
    .then((messages) => {
      if (fieldScripts.bank !== bank) return
      fieldScripts.world?.setMessages(messages)
    })
    .catch(() => { /* 맵 글만 옛 언어로 남는다 */ })
}

/**
 * 세계 하나. 버튼을 이 모듈이 읽는 프레임 입력에 묶는다 —
 * 그 배선이 어긋나면 대사창이 영영 안 넘어간다
 */
export function makeWorld(
  vars: VarStore, messages?: readonly string[], movements?: MovementTable,
): FieldWorld {
  const world = new FieldWorld({
    vars,
    messages,
    movements: movements ?? fieldScripts.data?.meta.movements,
    objects: (localID) => {
      if (localID === LOCALID_PLAYER) return playerMovable
      // ⚠️ **동행에게는 번호가 없다** (`GetLocalMapObjByIndex`). 원작이 이
      // 번호만은 **이동 유형으로** 찾는다 — 셰릴이든 라이벌이든 지금
      // 따라다니고 있는 사람 하나다. 번호로 찾으면 아무도 안 나온다
      if (localID === LOCALID_FOLLOWER) return npcByMovementType(MOVEMENT_FOLLOW_PLAYER)
      return npcActors.byLocalID.get(localID) ?? null
    },
    options: { speed: TEXT_SPEED.normal, canSkip: true, autoScroll: false },
    input: () => frameInput,
    // 이름은 세이브가 복원되면 바뀌므로 그때그때 물어본다. 여기서 값을
    // 붙잡아 두면 세이브보다 먼저 만들어진 세계가 영영 빈 이름을 쓴다
    names: {
      player: () => fieldScripts.names.player(),
      rival: () => fieldScripts.names.rival(),
      counterpart: () => fieldScripts.names.counterpart(),
    },
    services: fieldScripts.services,
  })
  world.speed = () => fieldScripts.textSpeed()
  world.player = playerMovable
  return world
}

/** `constants/scrcmd.h` — 이동 명령이 주인공을 가리키는 번호 */
const LOCALID_PLAYER = 0xff
/** 같은 표의 「지금 따라다니는 사람」. 배치표 번호가 아니다 */
const LOCALID_FOLLOWER = 0xf2
/** `MOVEMENT_TYPE_FOLLOW_PLAYER` (`generated/movement_types.txt` 49번째 줄) */
const MOVEMENT_FOLLOW_PLAYER = 48
/** `MOVEMENT_TYPE_NONE`. 변장이 풀린 사람이 이걸로 갈린다 */
const MOVEMENT_NONE = 0

/**
 * 주인공을 이동 명령이 만질 수 있는 모양으로 감싼다.
 *
 * 좌표계가 다르다 — NPC는 타일 번호로 서 있고 주인공은 타일 **가운데**에 있다.
 * 그래서 0.5를 빼고 더한다. 방향도 다르다: 우리는 라디안이고 원작은 0 북 · 1 남 ·
 * 2 서 · 3 동이다
 */
const playerMovable: Movable = {
  get x() { return worldState.player.position.x - 0.5 },
  set x(v: number) { worldState.player.position.x = v + 0.5 },
  get z() { return worldState.player.position.z - 0.5 },
  set z(v: number) { worldState.player.position.z = v + 0.5 },
  get dir() { return QUARTER_TO_DIR[quarterOf(worldState.player.facing)]! },
  set dir(v: number) { worldState.player.facing = DIR_TO_FACING[v] ?? 0 },
  visible: true,
}

/** 사분면(0 +z · 1 +x · 2 −z · 3 −x) → 원작 방향 */
const QUARTER_TO_DIR = [DIR.south, DIR.east, DIR.north, DIR.west]
/** 원작 방향 → `facing` 라디안. `atan2(vx, vz)`라 0이 +z(남쪽)다 */
const DIR_TO_FACING = [Math.PI, 0, -Math.PI / 2, Math.PI / 2]

/**
 * 맵에 들어섰다. NPC를 세우고 그 맵의 대사 뱅크를 받는다.
 *
 * NPC 세우기는 **동기**여야 한다 — 화면이 같은 프레임에 그 목록을 그린다.
 * 대사는 늦어도 되고, 실패해도 게임은 계속 돈다(글만 빈다)
 */
export function enterMap(mapId: number): void {
  // 맵을 옮기면 창에 걸린 구역 뱅크는 뜻이 없다. 맵 뱅크가 다시 기준이다
  endCommon()
  bankPending = false
  // ⚠️ **도는 스크립트가 있으면 그 뱅크는 그대로 둔다.** `Warp`는 스크립트
  // 한복판에서 걸리고(천계의피리가 그렇다) 워프 뒤에도 같은 스크립트가 제
  // 뱅크로 말을 이어간다 — 여기서 걷으면 「빛의 계단이 나타났다!」가 맵 뱅크의
  // 엉뚱한 문장으로 갈린다.
  //
  // ⚠️ **장부만 비우면 안 된다.** 창에 얹힌 뱅크는 그대로인데 `activeBank`만
  // 비면 다음 `switchBank(null)`이 "이미 맵 뱅크다"라고 보고 그냥 지나간다.
  // 실측: 피리로 시작의 방에 올라가면 아르세우스의 「구콰-쾅!!」 자리에
  // **포켓몬센터 접수원의 인사**가 떴다 (뱅크 213의 0번). 걷는 자리는
  // `finish()`다 — 스크립트가 끝날 때 제 뱅크를 내려놓는다
  if (fieldScripts.ctx === null) switchBank(null)
  // ⚠️ **순서가 뜻을 가진다.** 앞 맵의 배치표 수정을 버리고 → 이 맵의
  // `OnTransition`을 돌려 배치표를 고치고 → 그 결과로 사람을 세운다. 원작도
  // 이 순서다 (`field_map_change.c`가 맵을 올리기 전에 `ON_TRANSITION`을 돈다)
  clearNpcPlacement()
  clearWarpOverrides()
  runFixedInit(mapId, INIT_SCRIPT.onTransition)
  spawnNpcs(mapId, fieldScripts.vars)
  // 맵이 다 올라온 뒤 도는 것. 워프 자리를 옮기는 자리가 여기다
  runFixedInit(mapId, INIT_SCRIPT.onLoad)
  // 스크립트가 가로챈 곡을 놓는다. 안 놓으면 그 방에서 튼 곡이 신오 전역을 따라온다
  fieldBgm.override = null
  // ⚠️ 덮개도 걷는다. 아웃만 걸고 워프하는 스크립트가 있어서, 안 걷으면 도착한
  // 맵이 검은 화면 그대로 남는다
  resetFade()
  // 괴력은 맵마다 다시 쓴다 — 원작도 맵을 옮기면 풀린다
  worldState.player.strength = false
  // 얼음에서 미끄러지던 중에 워프하면 도착한 맵에서도 그 방향으로 밀린다
  // (`actor/ice`). 선단신전은 층마다 얼음이라 실제로 걸리는 자리다
  clearIceSlide()
  // ⚠️ **도는 판도 같이 푼다** (`actor/slidePanel`). 안 풀면 골풀무제철소를
  // 나간 뒤에도 「미끄러지는 중」이 서 있어서, 다음 맵에서 첫 프레임에
  // 「칸이 끝났다」로 읽고 **속도를 0으로 덮어 사람이 안 움직인다**
  clearPanelSlide()
  resetTriggerTile()
  // 맵에 들어선 그 칸에서 곧바로 눈이 마주치면 안 된다 — 문에서 나오자마자
  // 배틀이 시작되면 어디서 걸린 것인지 화면에서 안 보인다
  resetSightTile()
  const header = mapById(mapId)
  if (!header || header.msg === fieldScripts.bank) return
  fieldScripts.bank = header.msg
  // ⚠️ **글이 오기 전에는 맵이 스스로 거는 스크립트를 안 돌린다.** 매 프레임
  // 표는 들어선 **첫 프레임**에 걸리는데(§2.10) 뱅크는 fetch로 오므로, 안 막으면
  // 처음 가는 맵마다 첫 대사가 빈 창으로 지나간다. 좌표 트리거는 몇 프레임 뒤에
  // 밟히므로 이 문제가 거의 안 나던 자리다
  mapBankPending = true
  loadDialogueBank(locale, header.msg)
    .then((bank) => {
      // 받는 사이에 맵이 또 바뀌었으면 늦게 온 것을 버린다
      if (fieldScripts.bank !== header.msg) return
      fieldScripts.world?.setMessages(bank)
    })
    .catch(() => { /* 글이 비는 것으로 끝난다 */ })
    .finally(() => {
      if (fieldScripts.bank === header.msg) mapBankPending = false
    })
}

/** 이 맵의 대사 뱅크가 아직 오는 중인가 */
let mapBankPending = false

// ── 맵 초기화 스크립트 ───────────────────────────────────────────────────────

/** 파일 번호 → 읽어 둔 표. 바이트는 안 바뀌므로 한 번만 읽는다 */
const initCache = new Map<number, InitScripts>()

/** 이 맵의 초기화 표. 맵 헤더의 `initScripts`가 가리키는 파일이다 */
export function initScriptsOf(mapId: number): InitScripts | null {
  const { data } = fieldScripts
  const header = mapById(mapId)
  if (data === null || !header) return null
  const file = header.initScripts
  const hit = initCache.get(file)
  if (hit) return hit
  const info = data.meta.files[file]
  if (!info) return null
  const parsed = parseInitScripts(fileBytes(data, file))
  initCache.set(file, parsed)
  return parsed
}

/**
 * 한 번에 끝나는 초기화 스크립트를 돌린다 (`FieldSystem_RunScript`).
 *
 * 원작도 **한 프레임 안에 끝까지** 돌린다 — 대사도 이동도 없는 스크립트라야
 * 한다는 뜻이다. 그렇지 않은 것이 들어오면 상한에 걸려 예외가 나는데, 그때도
 * 맵에는 들어가야 하므로 여기서 삼키고 오류만 남긴다
 */
function runFixedInit(mapId: number, type: number): void {
  const { data, commands, world, vars } = fieldScripts
  if (data === null || commands === null || world === null) return
  const scriptID = initScriptsOf(mapId)?.fixed.get(type)
  if (scriptID === undefined) return
  const header = mapById(mapId)
  if (!header) return
  const target = resolveScript(data.meta, scriptID, header.scripts)
  if (!target) return
  const info = data.meta.files[target.file]
  if (!info || target.entry >= info.entries) return

  vars.resetLocals()
  const ctx = new ScriptContext(
    { vars, world, commands: commands.map, common: commonScripts },
    fileBytes(data, target.file), target.file,
  )
  ctx.start(entryOffset(data, target.file, target.entry))
  try {
    ctx.step(STEP_CAP)
  } catch (e) {
    fieldScripts.lastError = e instanceof ScriptError ? e.message : String(e)
  }
  vars.resetLocals()
}

/**
 * 매 프레임 표를 본다 (`INIT_SCRIPT_ON_FRAME_TABLE`).
 *
 * ⚠️ **좌표 트리거가 아니다.** 조건은 변수 하나뿐이고 어디에 서 있든 걸린다 —
 * 방에서 일어나 라이벌이 뛰어드는 장면, 예진호수에서 마박사가 돌아보는 장면이
 * 전부 이 길로 온다. 걸린 스크립트가 **스스로 그 변수를 바꾸므로** 한 번만 돈다.
 *
 * 원작도 이것을 다른 무엇보다 먼저 본다 (`FieldInput_Process`의 첫 줄)
 */
function tryFrameTable(): void {
  // 글이 오기 전에 걸면 첫 대사가 빈 창으로 지나간다
  if (mapBankPending) return
  const header = mapById(mapWorld.mapId)
  const init = initScriptsOf(mapWorld.mapId)
  if (!header || init === null || init.frame.length === 0) return
  const script = frameTableScript(init, (id) => fieldScripts.vars.get(id))
  if (script !== null) start(script, header.scripts)
}

// ── 한 프레임 ────────────────────────────────────────────────────────────────

/**
 * 이번 프레임의 버튼. 한 프레임 안에서는 누가 물어도 같은 값이어야 한다 —
 * 인쇄기와 대기 명령이 같은 프레임에 따로 물어보기 때문이다
 */
let frameInput: PrinterInput = { pressed: false, held: false }

/** 눌린 순간만 잡는다. 누르고 있는 동안 계속 참이면 메뉴가 한 번에 지나간다 */
const edges = { a: false, b: false, up: false, down: false }
const last = { a: false, b: false, up: false, down: false }

/** 방향키가 이만큼 기울면 눌린 것으로 본다 */
const STICK = 0.5

function readInput(): void {
  const input = worldState.input
  const now = {
    a: input.interact,
    b: input.cancel,
    up: input.move.y < -STICK,
    down: input.move.y > STICK,
  }
  for (const key of ['a', 'b', 'up', 'down'] as const) {
    edges[key] = now[key] && !last[key]
    last[key] = now[key]
  }
  // A와 B 둘 다 대사창을 넘긴다 (`ScriptContext_CheckABPress`)
  frameInput = { pressed: edges.a || edges.b, held: now.a || now.b }
}

export const scriptSystem = {
  fixedUpdate(): void {
    readInput()

    const { ctx, world } = fieldScripts
    // 스크립트가 도는 중인지를 문서에 적어 둔다 — 읽기 전용이고 `data-boot`과
    // 같은 자리다 (`sceneMark.ts`). 이게 없으면 **발이 묶인 것과 벽에 막힌
    // 것이 밖에서 똑같이 보인다** — 둘 다 대사도 없고 걸음도 없다
    markScript(ctx !== null || native !== null)
    // 우리 글이 도는 중이면 그것이 먼저다. 원작 스크립트와 **같이 돌지 않는다**
    if (native !== null && world !== null) { stepOurText(world); return }
    if (ctx !== null && world !== null) {
      // 스크립트가 도는 동안은 발이 묶인다. 입력 시스템 다음에 돌아야
      // 이 지우기가 이동 시스템보다 먼저다
      worldState.input.move.set(0, 0)
      worldState.player.velocity.set(0, 0, 0)
      if (world.menu !== null) chooseFromMenu(world)
      step(ctx, world)
      return
    }
    // ⚠️ **배틀 위에서는 새 스크립트를 시작하지 않는다.** 원작은 배틀에 들어가며
    // 필드를 내리는데 우리 루프는 계속 돌아서, 눈 마주침도 `OnFrame`도 살아 있다 —
    // 그러면 관장의 인사 대사창이 배틀 화면 **위에** 떠서 키를 먹는다
    // (`FieldServices.battleUp`이 실측을 적어 뒀다). 위의 `ctx` 갈래는 안 막는다:
    // 배틀을 연 것이 그 스크립트고, 끝나기를 기다리는 것도 그것이다
    if (fieldScripts.services.battleUp?.() === true) return
    // ⚠️ **우리 사람이 원작 연출보다 먼저다** (SIWON.md §6). 복도의 `OnFrame`이
    // 시작하면 그 안에는 못 끼어든다
    if (trySiwonCameo()) return
    // 맵이 스스로 거는 것이 제일 먼저다 (`FieldInput_Process`)
    tryFrameTable()
    // ⚠️ **운하시티 체육관의 판이 좌표 트리거보다 먼저다** (`Field_ProcessStep`의
    // 첫 줄). 그 방은 단추도 트리거도 없고 **밟는 것**으로 판이 움직인다 —
    // 태웠으면 그 걸음은 여기서 끝이다
    if (fieldScripts.ctx === null) tryStepFeature()
    // 그 다음이 밟아서 걸리는 것. 원작도 이동이 끝난 자리에서 좌표를 본다
    if (fieldScripts.ctx === null) tryTrigger()
    // 그 다음이 눈이 마주치는 것이다. 내가 A를 누르기 전에 저쪽이 먼저 온다
    if (fieldScripts.ctx === null) trySight()
    if (fieldScripts.ctx === null && edges.a) tryTalk()
  },
}

/**
 * 메뉴 커서.
 *
 * 예/아니오는 B가 곧바로 "아니오"다 — 원작도 B로 물러난다. 목록 메뉴의 B는
 * 취소(−2)고, 그마저 막힌 메뉴가 있어서 세계가 걸러낸다
 */
function chooseFromMenu(world: FieldWorld): void {
  if (edges.up) world.moveCursor(-1)
  if (edges.down) world.moveCursor(1)
  if (world.menu?.kind === 'yesno') {
    if (edges.b) world.choose(MENU_NO)
    else if (edges.a) world.choose(world.menuCursor)
    return
  }
  if (edges.b) world.choose(MENU_CANCEL)
  else if (edges.a) world.chooseAtCursor()
}

function step(ctx: ScriptContext, world: FieldWorld): void {
  try {
    // 글 뱅크가 오는 중이면 아무도 안 밟는다. 창은 계속 살아 있어야 하므로
    // `world.tick()`은 돈다
    if (bankPending) { world.tick(); return }
    // 공용 스크립트가 도는 동안은 그쪽이 먼저다 — 부모는 그것이 끝나기를
    // 기다리는 중이다(`ScriptContext_WaitSubContext`)
    const sub = common.ctx
    if (sub !== null) {
      if (!sub.step(STEP_CAP)) endCommon()
      world.tick()
      return
    }
    if (!ctx.step(STEP_CAP)) {
      finish()
      return
    }
    world.tick()
  } catch (e) {
    // 한 스크립트가 터졌다고 오버월드까지 멎으면 안 된다. 창을 닫고 놓아준다
    fieldScripts.lastError = e instanceof ScriptError ? e.message : String(e)
    finish()
  }
}

/**
 * 공용 스크립트가 끝났다. 부모를 놓아준다.
 *
 * 글은 **부모의 뱅크**로 되돌린다 — 부모도 구역 스크립트일 수 있다
 */
function endCommon(): void {
  if (common.ctx === null && !common.busy) return
  common.ctx = null
  common.busy = false
  switchBank(common.parentBank)
}

function finish(): void {
  endCommon()
  // ⚠️ **끝난 스크립트의 뱅크를 창에 남겨 두지 않는다.** `endCommon`은 **부른**
  // 공용 스크립트만 걷는다 — 도구나 좌표 사건처럼 공용 스크립트를 **바로**
  // 시작한 판은 안 걷힌다. 남으면 다음 스크립트가 남의 뱅크에서 같은 번호를
  // 읽고, 글자는 멀쩡히 나오므로 눈으로는 그냥 지나간다
  switchBank(null)
  fieldScripts.ctx = null
  fieldScripts.world?.closeBox(true)
  fieldScripts.world?.reset()
  fieldScripts.vars.resetLocals()
  fieldScripts.onScriptEnd?.(fieldScripts.vars)
}

/**
 * 도는 스크립트를 **중간에** 끊는다. 시험용 순간이동 전용이다
 * (`app/devWarp` · `engine/dev`).
 *
 * ⚠️ 확인 지점은 새 판을 열고 뛰어드는데, 그때 주인공 방의 TV 방송 스크립트가
 * 이미 돌기 시작한 뒤다. 그냥 옮기면 **딴 맵에서 그 대사창이 뜨고 플레이어가
 * 잠긴 채로 서 있는다** — 걸어도 안 움직이는 것을 "이동이 깨졌다"로 읽기
 * 십상이다. 실제로 컷신 확인 한 판을 그렇게 날렸다.
 *
 * 이야기 진행은 안 건드린다. 끊긴 스크립트가 세운 플래그는 그대로 남는다 —
 * 순간이동이 이미 그런 자리라 여기서만 다르게 굴 이유가 없다
 */
export function abortScript(): void {
  if (fieldScripts.ctx === null && !common.busy) return
  finish()
}

// ── 말 걸기 ──────────────────────────────────────────────────────────────────

/** 바라보는 방향의 단위 벡터. `facing`은 `atan2(vx, vz)`라 0이 +z다 */
const FACING_STEP = [
  { x: 0, z: 1 }, // 0  +z
  { x: 1, z: 0 }, // 1  +x
  { x: 0, z: -1 }, //  2  −z
  { x: -1, z: 0 }, // 3  −x
] as const

/** 지금 바라보는 앞 타일 */
export function tileInFront(x: number, z: number, facing: number): { x: number, z: number } {
  const quarter = ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4
  const step = FACING_STEP[quarter]!
  return { x: Math.floor(x) + step.x, z: Math.floor(z) + step.z }
}

/**
 * 그 자리에 서 있는 NPC.
 *
 * ⚠️ **배치표가 아니라 지금 서 있는 자리를 본다.** 원작도 그렇다 —
 * `sub_0203C9D4`가 `mapObjMan`(살아 있는 객체 관리자)에 좌표를 묻는다. 배치표를
 * 보면 스크립트가 걸어 옮긴 사람에게는 원래 자리에서만 말이 걸리고, 정작 지금
 * 서 있는 자리에서는 안 걸린다.
 *
 * ⚠️ 층 비교(`sub_0203C9B0`)는 **아직 못 옮겼다.** 배치표의 `height`는 층 번호가
 * 아니라 타일 높이라(실측: 같은 체육관에서 0·10·20이 섞여 나온다) 주인공의
 * 층과 곧바로 견줄 수가 없다. 겹친 판에서 아래층 사람에게 말이 걸릴 수 있다.
 *
 * 플래그가 **서 있으면 숨은 것**이라는 규칙은 `spawnNpcs`가 이미 적용했다.
 */
export function npcAt(mapId: number, x: number, z: number, vars: VarStore): Npc | null {
  // 세워 둔 것이 **이 맵의 것일 때만** 쓴다. 아직 안 세웠으면 배치표로 떨어진다
  if (npcActors.mapId === mapId) {
    for (const actor of npcActors.list) {
      if (!actor.visible) continue
      if (Math.round(actor.x) === x && Math.round(actor.z) === z) return actor.info
    }
    return null
  }
  for (const npc of npcsOf(mapId)) {
    if (npc.x !== x || npc.z !== z) continue
    const hide = hideFlagOf(npc)
    if (hide !== null && vars.checkFlag(hide)) continue
    return npc
  }
  return null
}

/**
 * 이 트레이너 종류만 말을 걸어도 자기 스크립트가 안 돌고 0번(아무 일 없음)이 돈다.
 * 원작의 `if (MapObject_GetTrainerType(object) != 0x9)`
 */
const TRAINER_TYPE_NO_TALK = 9

/**
 * 우리 `facing` 사분면 → 원작 방향 번호.
 *
 * `quarterOf`가 0을 +z(남쪽)로 세는데 원작은 북 0 · 남 1 · 서 2 · 동 3이다
 */
const DIR_OF_QUARTER: readonly number[] = [1, 3, 0, 2]

function tryTalk(): void {
  const { world, vars } = fieldScripts
  if (world === null) return
  const header = mapById(mapWorld.mapId)
  if (!header) return

  const p = worldState.player
  const front = tileInFront(p.position.x, p.position.z, p.facing)

  // ⚠️ **장막시티 체육관의 샌드백이 사람보다 먼저다** (`field_control.c` 567줄).
  // 앞 칸에 샌드백이 있으면 말을 거는 대신 그것을 찬다 — 스크립트도 트리거도
  // 없이 A 하나로 도는 자리다
  if (fieldScripts.services.mapFeatures?.kickBag?.(
    front.x, front.z, DIR_OF_QUARTER[quarterOf(p.facing)] ?? 0) === true) return

  // ⚠️ **카운터 너머로 말을 건다** (`map/world`의 `talkTile`)
  const grid = mapWorld.grid
  const reach = grid
    ? talkTile(grid, front, FACING_STEP[quarterOf(p.facing)]!)
    : front

  const npc = npcAt(mapWorld.mapId, reach.x, reach.z, vars)
  if (npc && npc.script !== NO_SCRIPT) {
    // 우리가 얹은 사람은 롬 스크립트가 없다 (SIWON.md). 번호가 표시일 뿐이라
    // `start()`에 넘기면 엉뚱한 자리를 밟는다
    if (npc.script === SIWON_SCRIPT) { talkToSiwon(header.scripts); return }
    const id = npc.trainerType === TRAINER_TYPE_NO_TALK ? 0 : npc.script
    start(id, header.scripts, npc.localID)
    return
  }

  // 사람이 없으면 간판이다. 원작도 이 순서다 (`field_control.c`)
  const sign = signAt(mapWorld.mapId, front.x, front.z, quarterOf(p.facing), vars)
  if (sign) { start(sign.script, header.scripts); return }

  // ⚠️ **꿀 나무가 타일 판정보다 먼저다** (`field_control.c` 293줄) — 사람과
  // 간판 다음, `Field_TileBehaviorToScript` 앞이다
  if (tryHoneyTree(front, header.scripts)) return

  // 그래도 없으면 타일이 하는 말을 본다 (`Field_TileBehaviorToScript`)
  if (tryPC(front, header.scripts)) return
  tryFieldMove(front)
}

/** `SCRIPT_ID(COMMON_SCRIPTS, 8)` — `CommonScript_HoneyTree` */
export const COMMON_SCRIPT_HONEY_TREE = 2008

/**
 * 앞의 꿀 나무에 A를 누른다 (`HoneyTree_TryInteract`).
 *
 * ⚠️ **북쪽을 볼 때만이다.** 원작이 `playerDir == DIR_NORTH`를 먼저 보고
 * 그다음에야 앞 칸의 소품을 찾는다 — 나무는 칸 하나를 통째로 채워서 옆이나
 * 위에서는 손이 안 닿는다. 이 조건이 없으면 나무 옆을 지나다 A를 눌러도
 * 「꿀을 바를까?」가 뜬다.
 *
 * ⚠️ **간판이 아니라 소품이다.** 스물한 그루에는 BG 이벤트가 하나도 안 붙어
 * 있고 배치표의 모델 번호(`honey_tree.nsbmd`)만이 나무를 가린다
 */
function tryHoneyTree(front: { x: number; z: number }, mapFile: number): boolean {
  const grid = mapWorld.grid
  if (!grid) return false
  if (QUARTER_TO_DIR[quarterOf(worldState.player.facing)] !== DIR.north) return false
  if (grid.propModelAt(front.x, front.z) !== HONEY_TREE_MODEL) return false
  return start(COMMON_SCRIPT_HONEY_TREE, mapFile)
}

/** `SCRIPT_ID(COMMON_SCRIPTS, 18)` — 공용 스크립트 표의 `CommonScript_PC` */
export const COMMON_SCRIPT_PC = 2018

/**
 * PC 앞에서 A를 누르면 보관 시스템이 열린다 (`Field_TileBehaviorToScript`).
 *
 * ⚠️ **북쪽을 볼 때만 열린다.** 원작이 `playerDir == DIR_NORTH`를 함께 본다 —
 * PC는 벽에 붙어 있어서 옆이나 아래에서는 화면이 안 보인다. 이 조건이 없으면
 * 책상 옆을 지나다 A를 눌러도 PC가 켜진다.
 *
 * 여는 것은 우리 화면이 아니라 **원작 스크립트**다. 그래야 "어느 PC를
 * 사용하겠습니까?"부터 항목 다섯까지가 롬의 글 그대로 나온다
 */
function tryPC(front: { x: number; z: number }, mapFile: number): boolean {
  const grid = mapWorld.grid
  if (!grid) return false
  if (grid.behavior(front.x, front.z) !== TILE_BEHAVIOR_PC) return false
  if (QUARTER_TO_DIR[quarterOf(worldState.player.facing)] !== DIR.north) return false
  return start(COMMON_SCRIPT_PC, mapFile)
}

/**
 * 앞에 대고 A를 누르면 비전머신이 나간다 (`Field_TileBehaviorToScript`).
 *
 * 원작은 자격을 두 겹으로 본다 — 뱃지 하나와 `Party_HasMonWithMove` 하나다.
 * 둘 다 `engine/script/fieldMoves`에 표로 있고 여기서는 **결과만** 쓴다.
 *
 * ⚠️ 원작이 여는 `FIELD_MOVES` 스크립트(“○○의 파도타기!” 같은 대사와 컷인)는
 * 아직 안 돌린다. 하는 일만 한다 — 대사와 연출이 빠진 것이지 조건이 다른 것은
 * 아니다.
 *
 * ⚠️ **안개제거와 플래시는 걸릴 자리가 없다.** 오버월드 날씨(`OVERWORLD_WEATHER_FOG`
 * · `DARK_FLASH`)를 아직 안 뽑았다 — 맵 헤더의 그 칸이 우리 `maps.json`에 없다.
 * 표에는 있으니 날씨가 들어오면 `FieldSpot`에 `fog`·`dark`를 채우면 된다
 */
function tryFieldMove(front: { x: number; z: number }): void {
  const spot = spotAt(front)
  if (spot === null) return
  const id = fieldMoveHere(spot, trainerNow())
  if (id !== null) runFieldMove(id, front)
}

/** 지금 앞에 무엇이 있는가. 격자가 없거나 뛰는 중이면 null */
function spotAt(front: { x: number; z: number }): FieldSpot | null {
  const p = worldState.player
  if (p.hop.active) return null
  const grid = mapWorld.grid
  if (!grid) return null
  return {
    frontBehavior: grid.behavior(front.x, front.z),
    frontSprite: obstacleAt(front.x, front.z)?.gfx ?? null,
    quarter: quarterOf(p.facing),
    surfing: p.surfing,
  }
}

/** 뱃지와 파티. 세이브에 있는 것이라 서비스로 받는다 */
function trainerNow(): Trainer {
  return {
    badges: fieldScripts.services?.fieldMoves?.badges() ?? 0,
    knows: (move) => fieldScripts.services?.fieldMoves?.knows(move) === true,
  }
}

/** 지금 서 있는 자리에서 앞 칸 */
export function frontTile(): { x: number; z: number } {
  const p = worldState.player
  return tileInFront(p.position.x, p.position.z, p.facing)
}

/** 규칙을 막지 않는 짧은 3D 피드백을 시작한다. */
function showFieldAction(kind: FieldActionFxKind, duration: number): void {
  const fx = worldState.player.fieldAction
  fx.kind = kind
  fx.elapsed = 0
  fx.duration = duration
}

/**
 * 기술 하나를 실제로 쓴다.
 *
 * ⚠️ 원작이 여는 `FIELD_MOVES` 스크립트(컷인과 대사)는 아직 안 돌린다. 하는
 * 일만 한다 — 연출이 빠진 것이지 조건이 다른 것은 아니다
 */
export function runFieldMove(id: FieldMoveId, front: { x: number; z: number }): boolean {
  const p = worldState.player
  const grid = mapWorld.grid
  if (!grid) return false
  const step = FACING_STEP[quarterOf(p.facing)]!
  switch (id) {
    case 'cut':
    case 'rockSmash': {
      // `RemoveObject VAR_LAST_TALKED`. 맵을 다시 들어오면 되살아난다 —
      // 원작도 플래그로 지우지 않는다
      const actor = obstacleAt(front.x, front.z)
      if (!actor) return false
      actor.visible = false
      showFieldAction(id, 0.65)
      return true
    }
    case 'strength':
      // 원작은 여기서 미는 것을 **허락만** 한다. 실제로 미는 것은 걸어가서 하는
      // 일이라 이동 시스템이 가져간다 (`actor/player`)
      p.strength = true
      showFieldAction('strength', 0.8)
      return true
    case 'surf':
      showFieldAction('surf', 0.7)
      p.surfing = true
      hopTo(front.x + 0.5, front.z + 0.5)
      return true
    case 'waterfall':
    case 'rockClimb': {
      // 같은 거동이 이어지는 만큼 올라간다. 그 너머가 막혔으면 안 오른다
      const behavior = grid.behavior(front.x, front.z)
      let x = front.x, z = front.z
      while (grid.behavior(x + step.x, z + step.z) === behavior) { x += step.x; z += step.z }
      const landX = x + step.x, landZ = z + step.z
      if (grid.isBlocked(landX, landZ)) return false
      hopTo(landX + 0.5, landZ + 0.5)
      showFieldAction(id, 1.1)
      return true
    }
    default:
      // 안개제거·플래시는 지울 날씨가 없고, 공중날기는 목적지를 화면이 고른다
      return false
  }
}

/** 기술 창에서 골랐을 때 어떻게 되는가 */
export type FieldMoveVerdict = 'used' | 'fly' | 'badge' | 'party' | 'notHere'

/**
 * 파티 화면의 기술 칸에서 쓴다 (`FieldMoves_Set*Task`).
 *
 * 앞에 대고 A를 누르는 길(`Field_TileBehaviorToScript`)과 **조건이 같다** —
 * 원작도 두 길이 같은 `FieldMoves_Check*`를 지난다. 다른 것은 여기서는
 * "왜 안 되는지"를 돌려준다는 것뿐이다.
 *
 * 공중날기만 여기서 안 끝난다 — 어디로 갈지는 화면이 고른다
 */
export function fieldMoveFromMenu(move: number): FieldMoveVerdict | null {
  const id = (Object.keys(FIELD_MOVES) as FieldMoveId[]).find((k) => FIELD_MOVES[k].move === move)
  if (id === undefined) return null
  const denial = whyNot(id, trainerNow())
  if (denial !== null) return denial
  if (id === 'fly') return 'fly'
  const front = frontTile()
  const spot = spotAt(front)
  if (spot === null || !movesUsableHere(spot).includes(id)) return 'notHere'
  return runFieldMove(id, front) ? 'used' : 'notHere'
}

function hopTo(x: number, z: number): void {
  const p = worldState.player
  p.hop = {
    active: true, t: 0, time: HOP_TIME,
    fromX: p.position.x, fromZ: p.position.z, fromY: p.position.y, toX: x, toZ: z,
  }
}

/**
 * 앞 타일의 간판. 방향이 안 맞으면 없는 것으로 친다.
 *
 * 숨은 도구는 방향을 안 보는 대신 **이미 주웠는지**를 본다 — 그 플래그가
 * scriptID 안에 들어 있다(`Script_GetHiddenItemFlag`)
 */
export function signAt(
  mapId: number, x: number, z: number, facing: number, vars: VarStore,
): Sign | null {
  for (const sign of signsOf(mapId)) {
    if (sign.x !== x || sign.z !== z) continue
    if (sign.type === BG_EVENT_TYPE.hiddenItem) {
      if (vars.checkFlag(hiddenItemFlag(sign.script))) continue
      return sign
    }
    if (facesSign(sign.facing, facing)) return sign
  }
  return null
}

/** `BgEvent_CheckPlayerFacingDirection` */
function facesSign(want: number, facing: number): boolean {
  if (want === BG_EVENT_DIR.all) return true
  const dir = COMPASS[facing]
  if (dir === undefined) return false
  if (want === dir) return true
  if (want === BG_EVENT_DIR.westEast) return dir === BG_EVENT_DIR.west || dir === BG_EVENT_DIR.east
  if (want === BG_EVENT_DIR.northSouth) return dir === BG_EVENT_DIR.north || dir === BG_EVENT_DIR.south
  return false
}

/**
 * 우리 사분면 → 나침반.
 *
 * z가 커지는 쪽이 남쪽이다 — 떡잎마을(z≈875)에서 북쪽 201번도로(z≈856)로
 * 가면 z가 줄어든다. 간판 682개 중 방향이 붙은 것의 최다값이 북쪽인 것도
 * 이 배치와 맞는다(벽에 붙은 간판은 남쪽에 서서 북쪽을 보고 읽는다)
 */
const COMPASS: readonly number[] = [
  BG_EVENT_DIR.south, // 0  +z
  BG_EVENT_DIR.east, //  1  +x
  BG_EVENT_DIR.north, // 2  −z
  BG_EVENT_DIR.west, //  3  −x
]

function quarterOf(facing: number): number {
  return ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4
}

/**
 * 숨은 도구의 "이미 주웠다" 플래그 (`Script_GetHiddenItemFlag`).
 *
 * scriptID가 도구 번호와 플래그를 한 수에 담고 있다 — 8000번대가 그 구역이고
 * 번호 차이가 곧 플래그 순번이다
 */
function hiddenItemFlag(scriptID: number): number {
  return HIDDEN_ITEM_FLAGS_START + (scriptID - SCRIPT_ID_OFFSET_HIDDEN_ITEMS)
}

/** `include/constants/scripts.h` */
const SCRIPT_ID_OFFSET_HIDDEN_ITEMS = 8000
/** `generated/vars_flags.txt`의 `HIDDEN_ITEM_FLAGS_START` */
const HIDDEN_ITEM_FLAGS_START = 730

// 다우징머신도 같은 두 수로 「이미 주웠나」를 본다 (PARITY §7.3) — 베껴 적으면
// 한쪽만 고쳐진다
export { SCRIPT_ID_OFFSET_HIDDEN_ITEMS as HIDDEN_ITEM_SCRIPT_BASE }
export { HIDDEN_ITEM_FLAGS_START as HIDDEN_ITEM_FLAG_BASE }

// ── 좌표 트리거 ──────────────────────────────────────────────────────────────

/** 마지막으로 판정한 칸. 한 칸에 여러 번 돌지 않게 한다 */
let lastTile = { x: Number.NaN, z: Number.NaN }

/**
 * 도착한 칸을 "방금 밟았다"로 친다.
 *
 * 워프로 내린 자리가 트리거 상자 안일 수 있는데, 그걸 밟은 것으로 세면
 * 문에서 나오자마자 이야기가 시작된다. 조우 판정도 같은 이유로 이렇게 한다
 */
export function resetTriggerTile(): void {
  const p = worldState.player.position
  lastTile = { x: Math.floor(p.x), z: Math.floor(p.z) }
}

/**
 * 지금 칸에 걸린 트리거 (`sub_0203CC14`).
 *
 * 상자 안에 있고 그 변수 값이 맞아야 한다. 조건 변수가 있어서 같은 자리를
 * 여러 번 지나도 이야기가 한 번만 돈다
 */
export function triggerAt(mapId: number, x: number, z: number, vars: VarStore): number | null {
  for (const t of triggersOf(mapId)) {
    if (x < t.x || x >= t.x + t.width) continue
    if (z < t.z || z >= t.z + t.length) continue
    if (vars.get(t.var) !== t.value) continue
    return t.script
  }
  return null
}

/**
 * 밟아서 도는 장치 (`Field_ProcessStep`).
 *
 * 지금은 운하시티 체육관의 뜨는 판 하나다. 좌표 트리거와 같은 자리에서
 * 「칸이 바뀌었나」를 보되, 트리거보다 **먼저** 묻는다
 */
function tryStepFeature(): void {
  const p = worldState.player.position
  const x = Math.floor(p.x), z = Math.floor(p.z)
  if (x === lastStepTile.x && z === lastStepTile.z) return
  lastStepTile = { x, z }
  fieldScripts.services.mapFeatures?.stepOnFeature?.()
}

let lastStepTile = { x: Number.NaN, z: Number.NaN }

/** 도착한 칸을 「방금 밟았다」로 친다. 판을 타고 내린 자리에서도 부른다 */
export function resetStepFeatureTile(): void {
  const p = worldState.player.position
  lastStepTile = { x: Math.floor(p.x), z: Math.floor(p.z) }
}

function tryTrigger(): void {
  const header = mapById(mapWorld.mapId)
  if (!header) return
  const p = worldState.player.position
  const x = Math.floor(p.x), z = Math.floor(p.z)
  if (x === lastTile.x && z === lastTile.z) return
  lastTile = { x, z }
  // 한 칸 움직였으면 "그 자리에 서 있다" 표시를 지운다
  // (`FieldInput_Process`가 걸음마다 `SystemFlag_ClearStep`을 부른다)
  fieldScripts.vars.clearFlag(SYSTEM_FLAG.step)
  const script = triggerAt(mapWorld.mapId, x, z, fieldScripts.vars)
  if (script !== null) start(script, header.scripts)
}

/**
 * 눈이 마주쳤는가.
 *
 * ⚠️ **지금까지 트레이너는 내가 먼저 말을 걸어야만 싸웠다.** 원작은 반대라
 * 길에 서 있는 사람이 시야에 들어오면 저쪽이 다가온다 — 그 긴장이 4세대 필드의
 * 절반이다. 규칙은 `engine/actor/sight`가 들고 있고 여기서는 밟은 칸이 바뀔
 * 때마다 한 번 묻는다.
 *
 * ⚠️ **그 사람의 스크립트를 바로 돌리지 않는다.** 원작은 다가오는 자리를
 * 적어 두고 **공용 스크립트**(`SCRIPT_ID(SINGLE_BATTLES, MAX_TRAINERS)` = 3928)를
 * 돌린다 — 그 안에서 곡이 깔리고, 걸어오고, 그다음에 대사가 뜬다.
 * 말을 걸어서 시작하는 길(`Battles_Trainer`)과 **다른 스크립트**다.
 */
function trySight(): void {
  const header = mapById(mapWorld.mapId)
  const grid = mapWorld.grid
  if (!header || !grid) return
  const p = worldState.player.position
  const x = Math.floor(p.x), z = Math.floor(p.z)
  if (x === lastSightTile.x && z === lastSightTile.z) return
  lastSightTile = { x, z }

  const seen = trainerInSight(
    // ⚠️ **배치표가 아니라 지금 선 칸이다** (`MapObject_GetX`). 순회·배회
    // 유형은 걸어 다니므로 처음 섰던 자리에 없다 — 217번도로 아홉 중 넷이
    // 30칸 넘게 떠나 있었고, 그 넷은 배치표 자리에서 허공을 보고 있었다.
    // 칸 사이를 걷는 중이면 반올림한다(`ambient`의 `partnerTile`과 같은 규약)
    npcActors.list.map((a) => ({
      npc: a.info, x: Math.round(a.x), z: Math.round(a.z), facing: a.dir,
    })),
    x, z,
    {
      // 지형·물체·사람이 다 막는다 (`sub_02063E94`의 1·2번 비트)
      blocked: (bx, bz) => grid.isBlocked(bx, bz)
        || obstacleAt(bx, bz) !== null
        || npcActors.list.some((a) =>
          a.visible && Math.round(a.x) === bx && Math.round(a.z) === bz),
      // ⚠️ **판을 고르는 단서는 주인공의 지금 높이다** — 다리와 그 밑처럼
      // 판이 겹치는 자리에서 어느 층을 읽을지 가른다. 씬이 층을 세는 자리도
      // 같은 값이다 (`MapStreamer`의 `Math.round(p.y)`).
      // 높이 자료가 없는 맵이면 온통 0이라 차도 0이 된다
      heightAt: (bx, bz) => grid.heightAtWorld(bx + 0.5, bz + 0.5, p.y) ?? 0,
    },
    // ⚠️ **이미 이긴 트레이너는 안 덤빈다.** 원작이 `Script_IsTrainerDefeated`로
    // 거른다 — 이게 없으면 이긴 사람 앞을 지날 때마다 다시 싸우게 된다.
    // 배틀 스크립트가 아닌 사람(3000 미만)은 애초에 트레이너가 아니다
    (npc) => npc.script === NO_SCRIPT
      || npc.script < SCRIPT_ID_OFFSET_SINGLE_BATTLES
      || fieldScripts.vars.checkFlag(TRAINER_DEFEATED_FLAGS_START + trainerIdOf(npc.script)),
  )
  if (!seen) return

  // ⚠️ **더블 트레이너는 짝과 함께 온다** — 짝을 못 찾으면 혼자 온다.
  // 원작의 `FindTrainerPartner`는 같은 트레이너 번호를 가리키는 다른 객체를
  // 찾는데, 우리 배치표에서는 `trainerType`이 같고 아직 안 이긴 이웃이다
  const world = fieldScripts.world
  if (world === null) return
  const double = fieldScripts.services.trainer?.(trainerIdOf(seen.npc.script))?.double === true
  const first: ApproachingTrainer = {
    localID: seen.npc.localID,
    trainerID: trainerIdOf(seen.npc.script),
    direction: seen.facing,
    sightRange: seen.distance,
    type: double ? APPROACH_TYPE.doubles : APPROACH_TYPE.singles,
  }
  // ⚠️ **적는 것이 스크립트를 시작한 뒤다.** 시작이 `world.reset()`을
  // 부르는데 그 안에서 지우면 첫 명령이 빈 자리를 읽는다
  start(APPROACHING_TRAINER_SCRIPT, header.scripts, seen.npc.localID)
  world.approaching[0] = first
  // ⚠️ **짝은 트레이너 번호가 같은 다른 사람이다** (`FindTrainerPartner`) —
  // 더블 한 쌍은 표에 트레이너 하나로 있고 맵에만 둘이 서 있다. 짝을 못
  // 찾으면 혼자 온다 (원작은 그 자리에서 `GF_ASSERT`로 선다)
  world.approaching[1] = double ? partnerOf(seen.npc, first) : null
  // ⚠️ **머리 위 느낌표가 이 자리에서 뜬다** (`ApproachingTrainerTask_Unk_05`의
  // `ov5_021F5D8C`). 그리는 장치는 진작 있었는데 아무도 안 불러서, 눈이 마주친
  // 트레이너가 말없이 걸어왔다. 걷는 동작 목록이 이 표시의 길이만큼 앞에서
  // 멈춰 서 있다 (`actor/approach`의 `delaySteps(EMOTE_FRAMES)`)
  fieldScripts.services.emote?.(first.localID, 'exclaim')
  const partner = world.approaching[1]
  if (partner !== null) fieldScripts.services.emote?.(partner.localID, 'exclaim')
}

/**
 * 눈이 마주쳤을 때 도는 공용 스크립트 (`SCRIPT_ID(SINGLE_BATTLES, MAX_TRAINERS)`).
 *
 * ⚠️ **트레이너 번호가 아니다.** 928은 트레이너 표의 끝(`MAX_TRAINERS`)이고,
 * 그 자리에 「다가오는 트레이너」 스크립트가 놓여 있다
 */
const APPROACHING_TRAINER_SCRIPT = SCRIPT_ID_OFFSET_SINGLE_BATTLES + 928

/**
 * 더블 한 쌍의 나머지 하나 (`FindTrainerPartner`).
 *
 * ⚠️ **같은 스크립트를 가리키는 다른 객체**다 — 트레이너 번호가 같다.
 * 시야 거리와 방향은 **첫 사람 것을 그대로 쓴다** (`ApproachingTrainer_Init`)
 */
function partnerOf(npc: Npc, first: ApproachingTrainer): ApproachingTrainer | null {
  for (const actor of npcActors.list) {
    if (actor.info.localID === npc.localID) continue
    if (actor.info.script !== npc.script) continue
    const type = actor.info.trainerType
    if (type !== TRAINER_TYPE.normal && type !== TRAINER_TYPE.viewAllDirections) continue
    return { ...first, localID: actor.info.localID }
  }
  return null
}

let lastSightTile = { x: Number.NaN, z: Number.NaN }

export function resetSightTile(): void {
  lastSightTile = { x: Number.NaN, z: Number.NaN }
}

/**
 * 스크립트 하나를 건다.
 *
 * @param scriptID 맵 이벤트가 들고 있는 번호. 2000 이상은 공용 구역이다
 * @param mapFile  지금 맵의 스크립트 파일 (`맵 헤더의 scripts`)
 * @param localID  말을 건 상대. `VAR_LAST_TALKED`로 스크립트가 읽는다
 */
export function start(scriptID: number, mapFile: number, localID = 0): boolean {
  const { data, commands, world, vars } = fieldScripts
  if (data === null || commands === null || world === null) return false

  const target = resolveScript(data.meta, scriptID, mapFile)
  if (!target) return false
  const info = data.meta.files[target.file]
  if (!info || target.entry >= info.entries) return false

  // ⚠️ **변장이 여기서 풀린다** (PARITY §1.15). 원작은 다가오는 연출의 마지막에
  // 이동 유형을 `NONE`으로 갈아 끼운다 (`ApproachingTrainerTask_SwitchMovementTypeNone`)
  // — 그 한 값이 곧 「정체가 드러났다」다. 눈이 마주쳤든 말을 걸었든 그 사람의
  // 스크립트가 도는 순간이므로 자리가 여기 하나면 된다
  if (localID !== 0 && disguiseOf(npcActors.byLocalID.get(localID)) !== null) {
    switchMovementType(localID, MOVEMENT_NONE)
  }

  vars.resetLocals()
  vars.set(VAR_LAST_TALKED, localID)
  world.reset()
  world.target = npcActors.byLocalID.get(localID) ?? null
  world.lastMessage = null
  world.scriptID = scriptID
  world.services = fieldScripts.services

  // ⚠️ **구역마다 글 뱅크가 다르다.** 간판이 대표적이다 — 292개 중 262개가
  // 2500번대(`TEXT_BANK_BG_EVENTS`)라, 맵 뱅크로 읽으면 같은 번호의 엉뚱한
  // 문장이 나온다. 글자는 나오므로 눈으로는 "번역이 이상한가" 싶게 지나간다
  switchBank(target.msg)

  const ctx = new ScriptContext(
    { vars, world, commands: commands.map, common: commonScripts },
    fileBytes(data, target.file), target.file,
  )
  ctx.start(entryOffset(data, target.file, target.entry))
  fieldScripts.ctx = ctx
  fieldScripts.lastError = null
  return true
}

/**
 * `CallCommonScript`가 부르는 손잡이.
 *
 * 명령 표는 스크립트 자료를 모른다(`commands.ts`는 `ctx.host`만 본다). 파일을
 * 찾고 문맥을 만드는 일은 여기서 한다
 */
const commonScripts: CommonScripts = {
  call(id) {
    const { data, commands, world, vars } = fieldScripts
    if (data === null || commands === null || world === null) return false
    const target = resolveScript(data.meta, id, mapWorld.mapId >= 0 ? currentMapFile() : -1)
    if (!target) return false
    const info = data.meta.files[target.file]
    if (!info || target.entry >= info.entries) return false

    common.busy = true
    common.parentBank = activeBank
    switchBank(target.msg)
    const ctx = new ScriptContext(
      { vars, world, commands: commands.map, common: commonScripts },
      fileBytes(data, target.file), target.file,
    )
    ctx.start(entryOffset(data, target.file, target.entry))
    common.ctx = ctx
    return true
  },
  running: () => common.busy,
}

/** 지금 맵의 스크립트 파일. 공용 구역 밖 번호를 부를 때만 쓴다 */
function currentMapFile(): number {
  return mapById(mapWorld.mapId)?.scripts ?? -1
}
