// 스크립트가 바깥 세계에 부탁하는 것들 (DATA.md §2.10)
//
// 엔진(`engine/script`)은 React도 zustand도 모른다. 배틀 화면을 열고, 세이브의
// 파티를 세고, 트레이너 자료를 받는 일은 전부 여기서 이어 붙인다.
//
// 배틀 결과를 붙잡는 방식이 조금 특이하다. 배틀 스토어는 화면을 닫을 때
// `outcome`을 지우는데, 스크립트는 **닫힌 뒤에** 결과를 묻는다. 그래서 결과가
// 정해지는 순간 여기서 따로 받아 둔다.
import {
  loadDialogueBank, loadItemNames, loadItems, loadMarts, loadMoveNames, loadSpecies,
  loadSpeciesNames, loadMoves, loadTrainers,
} from '../data/gameData'
import type { DataLocale } from '../data/gameData'
import {
  createWild, fillPp, natureOf, PARTY_MAX, statsOf,
} from '../engine/pokemon/instance'
import { canFit, quantity } from '../engine/bag/bag'
import { commonStock, specialtyStock } from '../engine/bag/mart'
import { fieldScripts } from '../engine/script/field'
import { cameraSystem } from '../engine/actor/camera'
import { BOX_MODE, countAll, freeSlots } from '../engine/pokemon/boxes'
import { music } from '../engine/audio/music'
import { SFX } from '../engine/audio/sfx'
import { fieldBgm } from '../engine/audio/songs'
import { timeOfDayForHour } from '../engine/map/timeOfDay'
import { setWarpEventPos } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { blackOut, healParty, loadHealTables, watchBlackOut } from './pokecenter'
import { useBattleStore } from '../state/battleStore'
import { useMenuStore } from '../state/menuStore'
import { useSaveStore } from '../state/saveStore'
import { naming as namingAnswer } from '../ui/menu/namingAnswer'
import type { ItemTable } from '../data/gameData'
import type { FieldServices } from '../engine/script/world'
import type { MartTable, Trainer } from '../data/schema'

/** `TEXT_BANK_NPC_TRAINER_MESSAGES` — 트레이너 928명의 싸움 전후 대사 */
const TRAINER_MESSAGE_BANK = 617
/** `TEXT_BANK_BAG_POCKET_NAMES` — 주머니 8개 이름 */
const POCKET_NAME_BANK = 395


/** 지금 배틀의 결과. 스크립트가 물어볼 때까지 들고 있는다 */
let battleResult: 'win' | 'loss' | null = null
/** 마지막으로 튼 팡파르. `WaitFanfare`가 이것이 끝나기를 기다린다 */
let fanfare: number | null = null
/** 배틀을 스크립트가 열었는가. 야생 조우까지 여기 걸리면 안 된다 */
let waiting = false

let trainers: { get(id: number): Trainer } | null = null
let trainerMessages: string[] = []
let items: ItemTable | null = null
let itemNames: string[] = []
let speciesNames: string[] = []
let moveNames: string[] = []
/** 주머니 이름 8개 (`TEXT_BANK_BAG_POCKET_NAMES`) */
let pocketNames: string[] = []
let marts: MartTable | null = null

/** 자료가 아직 안 왔으면 도구 주머니로 본다 — 번호 0이 그 자리다 */
const pocketOf = (item: number): number => items?.all[item]?.pocket ?? 0

/** 종족값·기술 표. 개체를 만들려면 둘 다 있어야 한다 */
let speciesTable: Awaited<ReturnType<typeof loadSpecies>> | null = null
let moveTable: Awaited<ReturnType<typeof loadMoves>> | null = null

/**
 * 스크립트가 주는 한 마리 (`Pokemon_GiveMonFromScript`).
 *
 * ⚠️ **표가 안 왔으면 안 준다.** 반쯤 만들어진 개체를 파티에 넣느니 실패를
 * 돌려주는 편이 낫다 — 스크립트는 그것을 "자리가 없다"로 읽고 다시 말을 건다.
 *
 * 원작은 개체값을 굴리고(`INIT_IVS_RANDOM`) 몬스터볼로 잡은 것으로 적는다.
 * 우리 `createWild`가 같은 일을 하는데 **가진 도구까지 굴린다** — 그건 야생
 * 규칙이라 스크립트가 준 것으로 덮어쓴다
 */
function giveMon(species: number, level: number, heldItem: number): boolean {
  const table = speciesTable
  const moves = moveTable
  if (!table || !moves) return false
  const save = useSaveStore.getState()
  if (save.party.length >= PARTY_MAX) return false

  const info = table.get(species)
  const mon = fillPp(createWild({
    species: info, level, rng: Math.random,
    otId: save.trainer.id, otSecretId: save.trainer.secretId,
  }), (id) => moves.byId.get(id)?.pp ?? 5)
  save.addToParty({
    ...mon,
    heldItem,
    // `Pokemon_SetCatchData(..., ITEM_POKE_BALL, ...)` — 받은 것은 몬스터볼이다
    ball: ITEM_POKE_BALL,
    hp: statsOf(mon, info).hp,
  })
  return true
}

/** `generated/items.txt` — 스크립트가 준 포켓몬이 들어 있는 볼 */
const ITEM_POKE_BALL = 4

/** `constants/string.h`의 `MON_NAME_LEN`. 우리가 정한 상한이 아니다 */
const MON_NAME_LEN = 10

/**
 * 배틀 스토어를 지켜본다.
 *
 * `outcome`이 정해지는 순간을 잡는다 — 화면이 닫히면 지워지기 때문이다
 */
function watchBattle(): () => void {
  return useBattleStore.subscribe((state, prev) => {
    if (!waiting) return
    if (state.outcome !== null && prev.outcome === null) {
      battleResult = state.outcome === 'win' ? 'win' : 'loss'
    }
    // 화면이 닫혀야 스크립트를 놓아준다. 결과만 나오고 화면이 떠 있으면
    // 대사창이 배틀 위에 겹친다
    if (state.phase === 'off' && prev.phase !== 'off') waiting = false
  })
}

/** 스크립트가 쓰는 바깥 세계를 붙인다. 정리 함수를 돌려준다 */
export function installFieldServices(locale: DataLocale = 'ko'): () => void {
  void loadTrainers().then((table) => { trainers = table }).catch(() => { /* 이름만 빈다 */ })
  void loadDialogueBank(locale, TRAINER_MESSAGE_BANK)
    .then((bank) => { trainerMessages = bank })
    .catch(() => { /* 대사만 빈다 */ })
  void loadItems().then((table) => { items = table }).catch(() => { /* 주머니가 0으로 뭉친다 */ })
  void loadItemNames(locale).then((names) => { itemNames = names }).catch(() => { /* 이름만 빈다 */ })
  void loadMarts().then((table) => { marts = table }).catch(() => { /* 상점이 빈 채로 뜬다 */ })
  // 글 칸을 채우는 이름표들. 없으면 대사에 빈칸이 남는다
  void loadSpeciesNames(locale).then((names) => { speciesNames = names }).catch(() => { /* 이름만 빈다 */ })
  void loadMoveNames(locale).then((names) => { moveNames = names }).catch(() => { /* 이름만 빈다 */ })
  void loadDialogueBank(locale, POCKET_NAME_BANK)
    .then((bank) => { pocketNames = [...bank] })
    .catch(() => { /* 주머니 이름만 빈다 */ })
  // 회복량은 종족값 표가 있어야 나온다. 전멸은 첫 배틀부터 날 수 있으므로 미리 받는다
  loadHealTables()
  // 스크립트가 주는 포켓몬도 같은 표로 만든다. 못 받으면 `GivePokemon`이
  // 실패를 돌려준다 — 반쯤 만들어진 개체를 파티에 넣지 않는다
  void loadSpecies().then((table) => { speciesTable = table }).catch(() => { /* 못 준다 */ })
  void loadMoves().then((table) => { moveTable = table }).catch(() => { /* 못 준다 */ })

  // 세계가 먼저 만들어져 있을 수 있다. 그 자리에도 넣어 준다
  if (fieldScripts.world !== null) fieldScripts.world.services = services
  fieldScripts.services = services
  const stop = watchBattle()
  const stopBlackOut = watchBlackOut()
  return () => {
    stop()
    stopBlackOut()
    fieldScripts.services = {}
  }
}

const services: FieldServices = {
  startTrainerBattle(trainerID: number): void {
    battleResult = null
    waiting = true
    void useBattleStore.getState().startTrainer(trainerID).catch(() => {
      // 배틀을 못 열면 스크립트가 영영 기다린다. 진 것으로 놓아준다
      battleResult = 'loss'
      waiting = false
    })
  },

  battleResult(): 'win' | 'loss' | null {
    return waiting ? null : battleResult
  },

  trainer(id: number): { double: boolean, msg: Record<string, number> } | null {
    const found = trainers?.get(id)
    return found === undefined ? null : { double: found.double, msg: found.msg }
  },

  trainerMessage(index: number): string {
    return trainerMessages[index] ?? ''
  },

  aliveMons(): number {
    return useSaveStore.getState().party.filter((mon) => mon.hp > 0).length
  },

  /**
   * 파티 조회 (`scrcmd_party.c`).
   *
   * ⚠️ **알은 안 센다.** 원작이 종을 물을 때마다 `MON_DATA_IS_EGG`를 함께 보고
   * 알이면 0을 돌려준다. 우리 개체에 알 표시가 아직 없어서 그 갈래는 늘 거짓이다 —
   * 알을 실을 때 이 세 곳(`species`·`hasSpecies`·`aliveExcept`)에 조건이 붙는다
   */
  party: {
    count: () => useSaveStore.getState().party.length,
    species: (slot) => useSaveStore.getState().party[slot]?.species ?? 0,
    nickname: (slot) => {
      const mon = useSaveStore.getState().party[slot]
      return mon?.nickname ?? speciesNames[mon?.species ?? 0] ?? ''
    },
    hasSpecies: (species) => useSaveStore.getState().party.some((m) => m.species === species),
    aliveExcept: (slot) =>
      useSaveStore.getState().party.filter((m, i) => i !== slot && m.hp > 0).length,
    give: giveMon,
    level: (slot) => useSaveStore.getState().party[slot]?.level ?? 0,
    // 성격은 개체값에서 나온다 (`Pokemon_GetNature` = PID % 25). 빈 자리는
    // 원작이 `NATURE_HARDY`(0)를 준다
    nature: (slot) => {
      const mon = useSaveStore.getState().party[slot]
      return mon === undefined ? 0 : natureOf(mon.pid)
    },
    friendship: (slot) => useSaveStore.getState().party[slot]?.friendship ?? 0,
    addFriendship: (slot, amount) => { useSaveStore.getState().addFriendship(slot, amount) },
    hasMove: (slot, move) =>
      useSaveStore.getState().party[slot]?.moves.some((s) => s.move === move) === true,
    move: (slot, moveSlot) => useSaveStore.getState().party[slot]?.moves[moveSlot]?.move ?? 0,
  },

  trainerInfo: {
    // 원작 번호는 남 0 · 여 1이다 (`TrainerInfo_Gender`)
    gender: () => (useSaveStore.getState().trainer.gender === 'girl' ? 1 : 0),
    hasBadge: (badge) => (useSaveStore.getState().badges & (1 << badge)) !== 0,
    giveBadge: (badge) => { useSaveStore.getState().giveBadge(badge) },
    nationalDex: (set) => {
      if (set) useSaveStore.getState().obtainNationalDex()
      return useSaveStore.getState().nationalDex
    },
  },

  labels: {
    move: (move) => moveNames[move] ?? '',
    pocket: (pocket) => pocketNames[pocket] ?? '',
    species: (species) => speciesNames[species] ?? '',
  },

  /**
   * 비전머신 자격 (`FieldMoves_Check*`).
   *
   * 어느 뱃지에 어느 기술인지는 엔진의 표가 안다 (`engine/script/fieldMoves`).
   * 여기서는 세이브를 읽어 주기만 한다
   */
  fieldMoves: {
    badges: () => useSaveStore.getState().badges,
    knows: (move: number) =>
      useSaveStore.getState().party.some((mon) => mon.moves.some((s) => s.move === move)),
  },

  healParty: () => { healParty() },
  setHealSpot: (index) => { useSaveStore.getState().setHealSpot(index) },
  blackOut: () => { blackOut() },

  bag: {
    pocketOf,
    add: (item, count) => useSaveStore.getState().addItem(pocketOf(item), item, count),
    remove: (item, count) => useSaveStore.getState().removeItem(pocketOf(item), item, count),
    canFit: (item, count) => canFit(useSaveStore.getState().bag, pocketOf(item), item, count),
    quantity: (item) => quantity(useSaveStore.getState().bag, pocketOf(item), item),
    pocketHasItems: (pocket) => (useSaveStore.getState().bag[pocket]?.length ?? 0) > 0,
    name: (item) => itemNames[item] ?? '',
  },

  openStartMenu: () => { useMenuStore.getState().open('start') },
  menuOpen: () => useMenuStore.getState().stack.length > 0,

  openShop: (stock) => { useMenuStore.getState().openShop(stock) },

  /**
   * 보관 시스템 (`OpenPokemonStorage`).
   *
   * ⚠️ **다섯 갈래 중 셋만 연다.** 3(도구 옮긴다)과 4(비교한다)는 아직 화면이
   * 없다 — 여는 시늉을 하고 아무것도 못 하는 것보다 안 여는 편이 낫다.
   * 스크립트는 화면이 안 뜬 것으로 보고 바로 PC 메뉴로 돌아간다
   */
  openStorage: (mode) => {
    if (mode > BOX_MODE.move) return
    useMenuStore.getState().openBox(mode)
  },

  /**
   * 소리 (`scrcmd_sound.c`).
   *
   * ⚠️ **팡파르를 따로 기억해 둔다.** 원작은 "팡파르 때문에 곡이 멎어 있는가"를
   * 보는데(`Sound_IsBGMPausedByFanfare`) 우리는 곡을 멈추지 않으므로, 마지막에
   * 튼 팡파르가 아직 울리는지로 대신한다
   */
  sound: {
    playEffect: (seq) => { void music.playEffect(seq) },
    stopEffect: (seq) => { music.stopEffect(seq) },
    effectPlaying: (seq) => music.isEffectPlaying(seq),
    playCry: (species) => { void music.playCry(species) },
    cryPlaying: () => music.isCryPlaying(),
    playFanfare: (seq) => { fanfare = seq; void music.playEffect(seq) },
    fanfarePlaying: () => fanfare !== null && music.isEffectPlaying(fanfare),
    setMusic: (seq) => { fieldBgm.override = seq },
    sequencePlaying: (seq) => music.playing === seq || music.isEffectPlaying(seq),
    fadeVolume: (volume, frames) => { music.fadeVolume(volume, frames) },
  },

  boxFreeSlots: () => freeSlots(useSaveStore.getState().boxes),

  aliveAndBoxMons: () => {
    const save = useSaveStore.getState()
    return save.party.filter((mon) => mon.hp > 0).length + countAll(save.boxes)
  },

  martStock: {
    // 재고표를 아직 못 받았으면 빈 상점이 뜬다. 물건을 지어내지 않는다
    common: () => (marts ? commonStock(marts, useSaveStore.getState().badges) : []),
    specialties: (martID) => (marts ? specialtyStock(marts, martID) : []),
  },

  money: {
    get: () => useSaveStore.getState().money,
    add: (amount) => { useSaveStore.getState().addMoney(amount) },
    spend: (amount) => useSaveStore.getState().spendMoney(amount),
  },

  timeOfDay: () => timeOfDayForHour(worldState.time.gameHour),

  gear: {
    giveRunningShoes: () => { useSaveStore.setState({ runningShoes: true }) },
    hasRunningShoes: () => useSaveStore.getState().runningShoes,
  },

  warpEvents: { setPos: setWarpEventPos },

  door: {
    load: (x, z, tag) => { door.load(x, z, tag) },
    open: (tag) => { door.open(tag) },
    close: (tag) => { door.close(tag) },
    busy: (tag) => door.busy(tag),
    unload: (tag) => { door.unload(tag) },
  },

  chooseStarter: {
    open: () => {
      starterChoice = null
      useMenuStore.getState().open('chooseStarter')
    },
    chosen: () => starterChoice,
  },

  startFirstBattle: (trainerID) => {
    battleResult = null
    waiting = true
    // ⚠️ 보통 트레이너전과 딱 하나 다르다 — **급소가 안 난다**
    // (`BATTLE_STATUS_FIRST_BATTLE` → `BtlCmd_CalcCrit`이 `criticalMul = 1`)
    void useBattleStore.getState().startTrainer(trainerID, { noCrit: true }).catch(() => {
      battleResult = 'loss'
      waiting = false
    })
  },

  /**
   * 전설 조우 (`Encounter_NewVsSpeciesAtLevel`).
   *
   * 인카운터 표를 안 거치고 종과 레벨을 스크립트가 준다. 곡은 야생과 같은
   * 길로 갈린다 — `wildSongFor`가 종족 번호를 보고 기라티나면 플래티넘
   * 전용 곡을 고른다 (`audio/songs`)
   */
  startLegendaryBattle: (species, level) => {
    battleResult = null
    waiting = true
    void useBattleStore.getState().startWild({ species, level }).catch(() => {
      battleResult = 'loss'
      waiting = false
    })
  },

  /**
   * 태그 배틀 (`ScrCmd_StartTagBattle`).
   *
   * ⚠️ **파트너가 안 붙는다.** 옆에서 같이 싸우는 사람은 배틀 쪽에 자리가
   * 없어서(`@pkmn/sim`은 되지만 우리 컨트롤러가 2인용이다) 지금은 **앞의
   * 상대 하나와 1:1**로 연다. 창기둥에서 마스·쥬피터를 함께 상대하는 장면이
   * 마스 한 명이 된다 — 이야기는 그대로 지나가고 없는 것은 옆에 선 둘이다
   */
  startTagBattle: (_partner, enemy1) => {
    battleResult = null
    waiting = true
    void useBattleStore.getState().startTrainer(enemy1).catch(() => {
      battleResult = 'loss'
      waiting = false
    })
  },

  /** 도감에 봤다고 적는다 (`FieldSystem_WriteSpeciesSeen`) */
  seeSpecies: (species) => { useSaveStore.getState().markSeen(species) },

  /**
   * 별명 짓는 화면 (`ScrCmd_OpenPokemonNamingScreen`).
   *
   * 답을 화면이 `naming.answer`에 적어 두고 여기서 가져간다 — 배틀 결과와 같은
   * 이유다. 화면이 닫히는 프레임에 스토어가 비므로 스크립트가 못 받는다
   */
  naming: {
    openForParty: (slot) => {
      namingAnswer.answer = null
      const mon = useSaveStore.getState().party[slot]
      useMenuStore.getState().openNaming({
        kind: 'pokemon',
        slot,
        // 지금 이름 — 없으면 종족 이름이다. 창의 물음("○○의 이름은?")이 이걸 쓴다
        initial: mon?.nickname ?? speciesNames[mon?.species ?? 0] ?? '',
        max: MON_NAME_LEN,
      })
    },
    named: () => {
      const got = namingAnswer.answer
      if (got === null) return null
      // 지었으면 세이브에 넣는다. 빈 글이면 안 지은 것이라 그대로 둔다
      if (got.name !== '') useSaveStore.getState().renameMon(got.slot, got.name)
      return got.name
    },
  },

  /**
   * 독으로 쓰러지기 직전 1로 버틴다 (`Pokemon_TrySurvivePoison`).
   *
   * 조건이 둘이고 **둘 다** 맞아야 한다 — 독(맹독 포함)이고 체력이 정확히 1.
   * 맞으면 상태를 지우고 참을 돌려준다. 걸어 다니다 독으로 깎이는 마지막
   * 한 칸에서 쓰러지는 대신 독이 풀리는 4세대 규칙이 이것이다
   */
  survivePoison: (slot) => {
    const mon = useSaveStore.getState().party[slot]
    if (!mon || mon.hp !== 1) return false
    if (mon.status !== 'psn' && mon.status !== 'tox') return false
    useSaveStore.getState().setStatus(slot, 'ok')
    return true
  },

  /**
   * 자유 카메라 (`AddFreeCamera`·`RestoreCamera`).
   *
   * 좌표는 타일 번호라 칸 한가운데(+0.5)로 옮긴다 — 배치표의 좌표를 그대로
   * 쓰는 다른 명령들과 같은 셈이다
   */
  camera: {
    free: (x, z) => { cameraSystem.free = { x: x + 0.5, z: z + 0.5 } },
    restore: () => { cameraSystem.free = null },
  },
}

/** 파트너 고르는 화면이 고른 것. 화면이 닫히기 전에 여기 적는다 */
let starterChoice: number | null = null

/** 화면이 부른다. 스크립트는 `chooseStarter.chosen()`으로 이 값을 본다 */
export function setStarterChoice(species: number): void {
  starterChoice = species
}

/**
 * 문 여닫는 그림 (`ov5_021D431C.c`).
 *
 * ⚠️ **아직 그림이 없다.** 소품 590종을 기하와 텍스처로 뽑아 두었지만
 * 애니메이션(NSBCA)은 안 뽑았다. 그래서 여기서 하는 일은 **소리와 시간**뿐이다 —
 * 문이 열릴 때 나는 소리는 원작 그대로고, `WaitForAnimation`이 서는 길이도
 * 원작의 한 바퀴(`MapPropOneShotAnimationManager_IsAnimationLoopFinished`)와
 * 같은 자리에 있다. 문짝이 **움직이는 모습**만 없다.
 *
 * 소리는 문 종류가 정한다 (`DoorAnimation_GetSoundEffectType`):
 * 미닫이는 열 때 `SEQ_SE_DP_DOOR10`·닫을 때 소리 없음, 나머지는
 * `SEQ_SE_DP_DOOR_OPEN`과 `SEQ_SE_DP_DOOR_CLOSE2`다. 어느 쪽인지는 **문 모델
 * 번호**로 갈리는데 그 표를 아직 안 옮겼으므로 여닫이 소리를 쓴다
 */
/** `generated/sdat.txt`. 디컴프가 닫는 소리를 생값 1543으로 적어 둔 것과 맞는다 */
const DOOR_OPEN_SE = SFX.DOOR
const DOOR_CLOSE_SE = 1543

/**
 * 문이 한 바퀴 도는 시간(ms).
 *
 * ⚠️ 원작은 NSBCA 한 바퀴가 끝나기를 기다리는데 그 길이를 우리가 못 읽는다.
 * 열고 닫는 사이가 **눈에 띄게 끊기는** 정도면 되는 자리라 짧게 잡았다
 */
const DOOR_MS = 200

/** 태그 → 이 시각까지 도는 중 */
const doorUntil = new Map<number, number>()

const door = {
  load: (_x: number, _z: number, tag: number): void => { doorUntil.delete(tag) },
  open: (tag: number): void => {
    doorUntil.set(tag, performance.now() + DOOR_MS)
    void music.playEffect(DOOR_OPEN_SE)
  },
  close: (tag: number): void => {
    doorUntil.set(tag, performance.now() + DOOR_MS)
    void music.playEffect(DOOR_CLOSE_SE)
  },
  busy: (tag: number): boolean => performance.now() < (doorUntil.get(tag) ?? 0),
  unload: (tag: number): void => { doorUntil.delete(tag) },
}
