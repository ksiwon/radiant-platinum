// 포켓몬센터와 전멸 (DATA.md §2.3)
//
// 원작이 이 둘을 한 표로 묶어 놓았다 — `sSpawnLocations` 한 줄에 **전멸했을 때
// 서는 자리**(센터 1층 안)와 **공중날기로 내리는 자리**(그 마을 바깥)가 같이
// 들어 있다. 그래서 여기서도 한 자리에서 다룬다 (`engine/map/spawns`).
//
// 부활 지점이 정해지는 방식이 특이하다. 간호사에게 말을 걸 필요가 없다 —
// 원작은 **맵을 갈아 끼울 때마다** `GetMapBlackOutWarpId`를 돌려서, 새 맵이
// 센터 1층이면 그 자리로 옮긴다(`field_map_change.c` 291줄). 들어서기만 하면 된다.
import { loadDialogueBank, loadMoves, loadSpecies, type SpeciesLookup } from '../data/gameData'
import { fillMenuText } from '../data/uiText'
import { music } from '../engine/audio/music'
import { fieldBgm } from '../engine/audio/songs'
import { shouldPartnerHeal } from '../engine/battle/aftermath'
import { fieldScripts, sayOurs, scriptBusy, start } from '../engine/script/field'
import { SYSTEM_FLAG } from '../engine/script/commands'
import { coverScreen, fadeColor, resetFade, screenTint } from '../engine/script/fade'
import { VAR_PARTNER_TRAINER_ID } from '../engine/script/vars'
import { statsOf, maxPpOf, type PokemonInstance } from '../engine/pokemon/instance'
import { flyUnlockedAt, spawnAt, spawnWarp } from '../engine/map/spawns'
import { mapById, world } from '../engine/map/world'
import { gameLocale } from '../state/optionsStore'
import { useSaveStore } from '../state/saveStore'
import { useBattleStore } from '../state/battleStore'

/** 종족값·기술 표. 회복량을 내려면 둘 다 있어야 한다 */
let species: SpeciesLookup | null = null
let pp: ((move: number) => number) | null = null

export function loadHealTables(): void {
  void loadSpecies().then((t) => { species = t }).catch(() => { /* 회복이 안 될 뿐이다 */ })
  void loadMoves().then((t) => { pp = (move) => t.get(move)?.pp ?? 5 })
    .catch(() => { /* PP만 안 찬다 */ })
}

/**
 * 파티 전원 회복 (`ScrCmd_HealParty`).
 *
 * 표를 아직 못 받았으면 **아무것도 안 한다** — 반쯤 회복시키느니 안 하는 편이
 * 낫다. 표는 필드가 뜰 때 같이 받는다
 */
export function healParty(): void {
  const table = species
  if (!table) return
  useSaveStore.getState().healParty((mon: PokemonInstance) => ({
    hp: statsOf(mon, table.of(mon)).hp,
    pp: mon.moves.map((slot) => (pp ? maxPpOf(slot, pp(slot.move)) : slot.pp)),
  }))
}

// ── 전멸 (`FieldTask_BlackOutFromBattle` · `unk_020528D0.c`) ──────────────────────
//
// 원작 과제의 차례 그대로다:
//
//   0  기라티나를 어나더폼으로(`Party_SetGiratinaForm`) · 부활 자리로 맵을 간다 · 동행을 놓는다
//   1·2  곡을 20프레임에 걸쳐 줄이고(`Sound_FadeOutBGM(0, 20)`) 다 줄면 끊는다(`FieldBGM_Stop`)
//   3  두 화면을 검게 두고 **글 창만 밝혀** 한 쪽을 띄운다 — A·B를 기다린다 (`sub_02052914`)
//   4  맵을 세운다(`FieldTransition_StartMap`) — 화면은 아직 검다
//   5  기본 자리(떡잎마을 집)면 공용 2020, 아니면 2021을 건다. 둘 다 `FadeScreenIn`으로 밝힌다
//
// ⚠️ **회복은 여기서 안 한다.** 깨어난 자리의 스크립트가 한다 — 집은 엄마가 말을 건 뒤 `SEQ_ASA`를 울리고
// `HealParty`, 센터는 간호사가 맡아 회복시킨다 (`scripts_common.s`의 `CommonScript_PlayerHouseBlackOutRecover`
// · `CommonScript_PokecenterBlackOutRecover`). 검은 화면의 글도 「기절한 포켓몬들을 데리고」다.
//
// ⚠️ **검은 판은 페이드 덮개가 아니라 비쳐 보이는 한 겹(`screenTint`)을 쓴다.** 원작은 글 창이 앉은 판(BG3)만
// 밝기에서 빼고 나머지를 검게 한다. 우리 덮개(`FadeOverlay`의 cover)는 대사창 **위**라 그 글까지 가리고, 한 겹은
// 대사창 **아래**다 — 그래서 검은 화면 위에 글이 뜬다. 글은 필드 대사창으로 띄운다(`sayOurs`, 쪽을 통째로)

/** `TEXT_BANK_BLACK_OUT_SCENE`의 미국 번호 (`dialogue/index.json`) */
export const BLACK_OUT_BANK = 373

/**
 * 검은 화면의 줄 (`sub_02052914`). 0~2는 빈 줄이다.
 *
 * ```c
 * if (fieldSystem->location->mapHeaderID == MAP_HEADER_TWINLEAF_TOWN_PLAYER_HOUSE_1F) sub_02052AA4(v0, 4, 0, 0);
 * else sub_02052AA4(v0, 3, 0, 0);
 * ```
 *
 * 0번 칸이 주인공 이름이다 (`StringTemplate_SetPlayerName(…, 0, …)`)
 */
export const BLACK_OUT_TEXT = { pokecenter: 3, home: 4 } as const

/** 깨어난 자리에서 거는 공용 스크립트 (`SCRIPT_ID(COMMON_SCRIPTS, 20)` · `(…, 21)`) */
export const BLACK_OUT_SCRIPT = { home: 2020, pokecenter: 2021 } as const

/** `MAP_HEADER_TWINLEAF_TOWN_PLAYER_HOUSE_1F` (`generated/map_headers.txt`의 줄 − 1) */
const PLAYER_HOUSE_1F = 414
/**
 * `FieldOverworldState_GetDefaultWarpID()`가 1을 돌려준다 — 1부터 센 번호라 우리 자리로는 0이다
 * (`spawn_locations.c`). 새 판의 부활 자리가 이것이고 표의 첫 줄이 떡잎마을 집이다
 */
const DEFAULT_HEAL_SPOT = 0
/** `Sound_FadeOutBGM(0, 20)` */
export const BLACK_OUT_BGM_FADE = 20
/** `Location_InitBlackOut`의 `FACE_UP` — 원작 방향 번호 */
const FACE_UP = 0

/**
 * 어느 줄을 띄우고 어느 스크립트를 거는가.
 *
 * ⚠️ **잣대가 둘이다.** 글은 **도착한 맵**이 집 1층인가를 보고, 스크립트는 **부활 자리**가 기본 자리인가를
 * 본다 — 원작이 그렇게 갈라 적었다. 표의 첫 줄이 집 1층이라 보통은 둘이 함께 간다
 */
export function blackOutScene(healSpot: number, mapId: number): { line: number, script: number } {
  return {
    line: mapId === PLAYER_HOUSE_1F ? BLACK_OUT_TEXT.home : BLACK_OUT_TEXT.pokecenter,
    script: healSpot === DEFAULT_HEAL_SPOT ? BLACK_OUT_SCRIPT.home : BLACK_OUT_SCRIPT.pokecenter,
  }
}

/** 전멸 과제가 손대는 바깥. 시험이 가짜를 끼운다 */
export interface BlackOutHost {
  /** `Party_SetGiratinaForm(party, GIRATINA_FORM_ALTERED)` — 지닌 물건대로 */
  giratinaAltered: () => void
  /** `FieldSystem_ClearPartnerTrainer` */
  clearPartner: () => void
  /** 검은 판을 깐다 · 걷는다 */
  blacken: (on: boolean) => void
  /** 부활 자리로 워프를 건다. 도착할 맵 번호 — 못 걸면 null */
  warp: () => number | null
  /** 곡을 줄인다 (`Sound_FadeOutBGM(0, frames)`) */
  fadeOutBgm: (frames: number) => void
  /** 곡을 끊어 둔다 · 놓는다 (`FieldBGM_Stop` · `FieldTransition_StartMap`) */
  silence: (on: boolean) => void
  /** 맵을 다 갈았고 돌던 스크립트도 끝났다 */
  settled: () => boolean
  /** 검은 화면의 줄. 칸을 다 채운 글 — 뱅크가 없으면 빈 글 */
  line: (index: number) => Promise<string>
  /** 글 한 쪽을 띄우고 A·B를 기다린다 */
  say: (text: string) => Promise<void>
  /** 화면을 검게 덮는다 · 걷는다 — 공용 스크립트가 `FadeScreenIn`으로 밝힌다 */
  cover: (on: boolean) => void
  startScript: (id: number) => boolean
  healParty: () => void
  /** 조건이 설 때까지 프레임마다 묻는다. 과제가 걷혔으면 false로 풀린다 */
  until: (cond: () => boolean) => Promise<boolean>
  /** 프레임 수만큼 기다린다. 걷혔으면 false */
  frames: (count: number) => Promise<boolean>
}

/**
 * 전멸 과제 한 판. 원작 차례대로 돈다 — 위 머리말의 0~5.
 *
 * @returns 끝까지 돌았는가. 도중에 걷히면 false
 */
export async function runBlackOut(host: BlackOutHost, healSpot: number): Promise<boolean> {
  host.giratinaAltered()
  // 배틀 화면이 닫히는 그 프레임부터 검다 — 원작은 배틀을 나올 때 이미 검고, 맵을 가는 동안 필드를 안 그린다
  host.blacken(true)
  const to = host.warp()
  host.clearPartner()
  if (to === null) {
    // 갈 자리를 못 찾았다(표를 아직 못 받았다). 검은 화면에 가두느니 그 자리에서 낫게 하고 놓는다
    host.blacken(false)
    host.healParty()
    return true
  }
  const scene = blackOutScene(healSpot, to)
  // 글은 미리 받아 둔다 — 맵을 다 갈자마자 띄워야 그 사이에 발이 안 풀린다
  const text = host.line(scene.line)
  host.fadeOutBgm(BLACK_OUT_BGM_FADE)
  if (!await host.frames(BLACK_OUT_BGM_FADE)) return false
  if (!await host.until(host.settled)) return false
  // ⚠️ **맵을 간 뒤에 끊는다.** 맵을 갈면 곡 가로채기가 비워진다(`enterMap` · `FieldBGM_ClearOverride`)
  host.silence(true)
  const page = await text
  if (page !== '') await host.say(page)
  host.cover(true)
  host.blacken(false)
  host.silence(false)
  if (!host.startScript(scene.script)) {
    // 스크립트를 못 걸었으면 회복도 밝히기도 우리가 한다 — 기절한 채 검은 화면에 남지 않게
    host.healParty()
    host.cover(false)
  }
  return true
}

/** 지금 도는 전멸 과제의 번호. 걷을 때 올린다 */
let blackOutRun = 0
let blackOutBusy = false

/** 한 프레임 — 그림 고리가 없는 곳(시험)에서는 타이머로 센다 */
function nextFrame(): Promise<void> {
  return new Promise((done) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { done() })
    else setTimeout(done, 1000 / 60)
  })
}

function liveHost(run: number): BlackOutHost {
  const live = (): boolean => run === blackOutRun
  return {
    giratinaAltered: () => { fieldScripts.services.party?.giratinaForm(false) },
    clearPartner: () => {
      fieldScripts.vars.clearFlag(SYSTEM_FLAG.hasPartner)
      fieldScripts.vars.set(VAR_PARTNER_TRAINER_ID, 0)
    },
    blacken: (on) => {
      screenTint.color = fadeColor(0)
      screenTint.alpha = on ? 1 : 0
    },
    warp: () => {
      const at = spawnWarp(useSaveStore.getState().healSpot, 'blackOut')
      if (!at) return null
      // 문·계단 소리는 없다 — 걸어 든 것이 아니다
      world.pending = { ...at, facing: FACE_UP, silent: true }
      return at.to
    },
    fadeOutBgm: (frames) => { music.fadeVolume(0, frames) },
    silence: (on) => { fieldBgm.override = on ? 'stop' : null },
    // ⚠️ **도착한 맵 번호는 안 본다.** 씬이 갈아 끼우다 실패해도 전이는 비운다(`MapStreamer`의 `finally`) —
    // 번호까지 맞기를 기다리면 그 판은 검은 화면에 영영 갇힌다
    settled: () => world.pending === null && !scriptBusy(),
    line: async (index) => {
      try {
        const bank = await loadDialogueBank(gameLocale(), BLACK_OUT_BANK)
        return fillMenuText(bank[index] ?? '', [useSaveStore.getState().trainer.name]).trim()
      } catch {
        return ''
      }
    },
    say: (text) => sayOurs(text),
    cover: (on) => { if (on) coverScreen(0); else resetFade() },
    startScript: (id) => start(id, mapById(world.mapId)?.scripts ?? -1),
    healParty,
    until: async (cond) => {
      while (live() && !cond()) await nextFrame()
      return live()
    },
    frames: async (count) => {
      for (let i = 0; i < count && live(); i++) await nextFrame()
      return live()
    },
  }
}

/**
 * 전멸 (`FieldTask_StartBlackOutFromBattle`).
 *
 * 두 번 불려도 한 판만 돈다 — 스크립트가 연 배틀은 `BlackOutFromBattle` 명령과 배틀이 닫히는 알림
 * (`watchBlackOut`)이 둘 다 부른다. **워프는 부른 그 자리에서 건다** — 돌던 스크립트가 끝나기를
 * 기다리는 동안에도 갈 자리는 이미 정해져 있다 (`blackOutEndsScript.test`)
 */
export function blackOut(): void {
  if (blackOutBusy) return
  blackOutBusy = true
  const run = ++blackOutRun
  void runBlackOut(liveHost(run), useSaveStore.getState().healSpot)
    .catch((e: unknown) => { console.error('전멸 과제 실패', e) })
    .finally(() => { if (run === blackOutRun) blackOutBusy = false })
}

/** 도는 전멸 과제를 걷는다 — 검은 판도 같이. 시험이 끝날 때 */
export function resetBlackOut(): void {
  blackOutRun++
  blackOutBusy = false
  screenTint.alpha = 0
}

/** 전멸 과제가 도는 중인가 */
export function blackOutRunning(): boolean {
  return blackOutBusy
}

/**
 * 맵을 갈아 끼웠다. 부활 지점과 공중날기 자리를 갱신한다.
 *
 * 원작이 맵 전환마다 하는 일 그대로다 — 센터에 들어서면 부활 지점이 옮겨지고,
 * 마을 바깥에 발을 들이면 그 마을이 공중날기 목록에 오른다
 */
export function arriveAt(mapId: number): void {
  const save = useSaveStore.getState()
  const heal = spawnAt(mapId)
  if (heal !== null) save.setHealSpot(heal)
  const fly = flyUnlockedAt(mapId)
  if (fly !== null && (save.flySpots & (1 << fly)) === 0) save.unlockFly(fly)
}

/**
 * 배틀에서 지면 전멸이다.
 *
 * 스크립트가 연 트레이너전은 `BlackOutFromBattle` 명령이 따로 부르지만
 * **야생에게 지는 것**은 명령이 없다 — 원작도 `FieldTask_StartBlackOutFromBattle`이
 * 자동으로 돈다. 두 번 불려도 하는 일이 같아서 탈이 없다.
 *
 * 화면이 닫힌 **뒤에** 옮긴다. 결과가 나오자마자 옮기면 배틀 화면 뒤에서 맵이
 * 갈리고, 돌아왔을 때 어디인지 모르게 된다
 *
 * ⚠️ **배틀팩토리에서 지는 것은 전멸이 아니다.** 원작의 프런티어 갈래는 상대의 한마디만 띄우고 끝난다
 * (`subscript_battle_lost.s`의 `_068`) — 싸운 것은 빌린 셋이고, 뒤처리는 시설 장면과 로비가 한다
 * (`LOAD_ACTION` 3). 여기서 센터로 보내면 로비가 영영 안 열려 도전이 닫히지 않는다 (실측 `_factory.mjs`)
 */
export function watchBlackOut(): () => void {
  let lost = false
  const stop = useBattleStore.subscribe((state, prev) => {
    if (state.outcome === 'loss' && prev.outcome !== 'loss' && state.kind !== 'factory') lost = true
    if (state.phase === 'off' && prev.phase !== 'off' && lost) {
      lost = false
      blackOut()
    }
  })
  // ⚠️ **필드를 걷으면 도는 전멸 과제도 걷는다.** 과제는 프레임을 기다리며 비동기로 돌아서, 남겨 두면 다음에 선
  // 필드의 스크립트 자리를 깨어난 자리 스크립트(2020 · 2021)로 가로챈다 — 시험 한 판의 전멸이 다음 판의 배틀을
  // 막았다 (`battleReload.test`의 진 판 다음 판)
  return () => { stop(); resetBlackOut() }
}

/**
 * **동행이 붙어 있는 동안은 배틀이 끝날 때마다 다 낫는다**
 * (`encounter.c` · 규칙은 `battle/aftermath`의 `shouldPartnerHeal`).
 *
 * 영원의 숲의 모미가 그 자리다 — 원작에서 숲이 험하지 않은 까닭이 이것이고,
 * 이것이 없어서 우리 쪽은 숲에서 전멸을 거듭했다.
 *
 * 전멸과 같은 자리에서 본다 — **화면이 닫힌 뒤에** 손댄다. 결과가 나오자마자
 * 파티를 고치면 배틀 화면이 아직 제 값을 되돌리는 중이라 덮어쓰기가 엇갈린다
 */
export function watchPartnerHeal(): () => void {
  let finish: 'win' | 'loss' | 'caught' | 'fled' | 'foeFled' | null = null
  return useBattleStore.subscribe((state, prev) => {
    if (state.outcome !== null && state.outcome !== prev.outcome) finish = state.outcome
    if (state.phase === 'off' && prev.phase !== 'off') {
      const had = finish
      finish = null
      const partner = fieldScripts.vars?.checkFlag(SYSTEM_FLAG.hasPartner) === true
      if (shouldPartnerHeal(had, partner)) healParty()
    }
  })
}
