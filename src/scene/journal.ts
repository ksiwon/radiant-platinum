// 모험노트를 세계에 이어 붙인다 (PARITY §7.4)
//
// 규칙은 전부 `engine/world/journal`에 있고, 여기서는 **누가 언제 적는가**만
// 정한다. 원작이 부르는 자리를 그대로 옮긴다:
//
//   맵을 올릴 때   → 쪽을 넘기고 머리글을 적는다 (`sub_02053494`)
//   걸어서 넘었다  → 아직 안 열린 마을이면 「도착!」 (`CreateFlyLocationJournalEvent`)
//   워프했다       → 굴/건물에서 나왔거나 못 이긴 체육관에 들어섰다
//                    (`CreateMapTransitionJournalEvent`)
//   배틀이 끝났다  → 잡은 한 마리 · 쓰러뜨린 다섯째 · 이긴 트레이너
//   그 밖          → 스크립트가 부르는 다섯 갈래 (`ScrCmd_CreateJournalEvent`)
//
// ⚠️ **노트를 받기 전에는 한 줄도 안 적는다.** 축복시티에서 받는다
// (`SystemFlag_HandleJournalAcquired`). 그전에 적으면 노트를 펼치는 순간
// 가 본 적 없는 척하던 곳들이 다 튀어나온다.
import { SYSTEM_FLAG } from '../engine/script/commands'
import { fieldScripts } from '../engine/script/field'
import { mapById } from '../engine/map/world'
import { flyUnlockedAt } from '../engine/map/spawns'
import {
  LocationEvent, MonResult, TrainerKind, checkOpenOnContinue, gymTooTough, journalDate,
  mapTransitionEvent, monVariant, rollPage, saveLocationEvent, saveMon, saveOnline, saveTitle,
  saveTrainer, trainerKind, type JournalEntry, type JournalOnline,
} from '../engine/world/journal'
import { useSaveStore } from '../state/saveStore'

/**
 * 노트를 받았는가 (`SystemFlag_HandleJournalAcquired`).
 *
 * ⚠️ **스크립트 통과에 묻는다.** 세이브의 `flags`는 스크립트 한 판이 끝나야
 * 갱신되므로, 노트를 받은 그 스크립트 안에서 바로 물으면 아직 거짓이다 —
 * 시작 메뉴가 도감 플래그를 보는 것과 같은 자리다
 */
export function journalAcquired(): boolean {
  return fieldScripts.vars.checkFlag(SYSTEM_FLAG.journalAcquired)
}

/** 오늘 쪽에 무언가를 적는다. 안 받았으면 아무 일도 안 한다 */
function write(edit: (entry: JournalEntry) => JournalEntry): void {
  if (!journalAcquired()) return
  const journal = [...useSaveStore.getState().journal]
  const today = journal[0]
  if (!today) return
  const next = edit(today)
  if (next === today) return
  journal[0] = next
  useSaveStore.setState({ journal })
}

/**
 * 맵이 올라왔다 — 쪽을 넘기고 머리글을 적는다.
 *
 * ⚠️ **날이 바뀌었는지를 여기서만 본다.** 하루 종일 걸어 다녀도 쪽은
 * 맵을 올릴 때에만 넘어간다 (`Journal_GetSavedPage`)
 */
export function journalEnterMap(mapId: number, now: Date = new Date()): void {
  const acquired = journalAcquired()
  const save = useSaveStore.getState()
  const today = journalDate(now)
  const rolled = rollPage(save.journal, today, acquired)
  if (!acquired) return
  const journal = rolled.journal
  journal[0] = saveTitle(journal[0]!, { ...today, mapId })
  useSaveStore.setState({ journal })
}

/**
 * 이어하기에서 노트가 저절로 펼쳐지는가 (`Journal_CheckOpenOnContinue`).
 *
 * ⚠️ **쪽을 넘기기 전에 물어야 한다.** 넘기고 나면 첫 쪽이 오늘이 되어
 * 언제나 거짓이 된다
 */
export function journalOpensOnContinue(now: Date = new Date()): boolean {
  return checkOpenOnContinue(useSaveStore.getState().journal, journalDate(now), journalAcquired())
}

/**
 * 새 자리에 발을 들였다 (`CreateFlyLocationJournalEvent`).
 *
 * ⚠️ **아직 공중날기가 안 열린 자리에만 적는다.** 열린 뒤에도 적으면
 * 202번도로를 스무 번 지나는 동안 넉 줄이 「도착!」으로만 찬다.
 * 여는 쪽은 `scene/pokecenter`의 `arriveAt`이라 **그보다 먼저 물어야** 한다.
 *
 * 적었으면 참을 준다 — 원작이 이 값을 보고 맵 전환 일을 건너뛴다
 */
export function journalArrived(mapId: number): boolean {
  const fly = flyUnlockedAt(mapId)
  if (fly === null) return false
  if ((useSaveStore.getState().flySpots & (1 << fly)) !== 0) return false
  write((e) => saveLocationEvent(e, { type: LocationEvent.ARRIVED_IN_LOCATION, locationId: mapId }))
  return true
}

/**
 * 맵을 넘었다 (`CreateMapTransitionJournalEvent`).
 *
 * ⚠️ **먼저 「도착!」을 본다.** 원작이 `if (CreateFlyLocation... == FALSE)`로
 * 갈라서, 처음 온 마을에서는 「나왔다」가 아니라 「도착!」만 적힌다
 */
export function journalChangedMap(prevMapId: number, currMapId: number): void {
  if (prevMapId === currMapId) return
  if (journalArrived(currMapId)) return
  const prev = mapById(prevMapId)
  const curr = mapById(currMapId)
  if (!prev || !curr) return
  const ev = mapTransitionEvent(
    { type: prev.mapType, label: prev.label },
    { type: curr.mapType, label: curr.label },
    prevMapId, currMapId, useSaveStore.getState().badges,
  )
  if (!ev) return
  write((e) => saveLocationEvent(e, ev))
}

/** 하늘을 날았다 */
export function journalFlew(mapId: number): void {
  write((e) => saveLocationEvent(e, { type: LocationEvent.FLEW_TO_LOCATION, locationId: mapId }))
}

/** 순간이동으로 돌아왔다 */
export function journalWarpedByMove(mapId: number): void {
  write((e) => saveLocationEvent(e, { type: LocationEvent.WARPED_TO_LOCATION, locationId: mapId }))
}

/**
 * 필드에서 비전기술을 썼다 (`field_move_tasks.c` · `ScrCmd_CreateJournalEvent`).
 *
 * `type`은 `LocationEvent.USED_*` 그대로다
 */
export function journalUsedMove(type: number, mapId: number): void {
  write((e) => saveLocationEvent(e, { type, locationId: mapId }))
}

/** 도구를 주웠다 (`LOCATION_EVENT_ITEM_WAS_OBTAINED`) */
export function journalGotItem(item: number): void {
  write((e) => saveLocationEvent(e, { type: LocationEvent.ITEM_WAS_OBTAINED, item }))
}

/** 곁값이 없는 일 하나 — 박스를 썼다·게임코너·사파리 … */
export function journalPlain(type: number): void {
  write((e) => saveLocationEvent(e, { type }))
}

/**
 * 노트에 상점 일을 안 적는 자리 셋 (`shop_menu.c`).
 *
 * 장막백화점은 **지역명**으로, 영원시티 허브샵과 무연시읍 북서쪽 집은
 * **맵 번호**로 뺀다 — 원작이 그 셋을 손으로 골라 냈다. 백화점만 지역명인 것은
 * 층이 여럿이라 맵이 여러 개이기 때문이다
 */
export const NO_JOURNAL_SHOP_LABEL = 101
export const NO_JOURNAL_SHOP_MAPS: ReadonlySet<number> = new Set([81, 446])

/**
 * 상점에서 나왔다 (`overlay007/shop_menu.c`).
 *
 * ⚠️ **금액이 아니라 횟수로 가른다.** 산 횟수가 **둘 이상**이면 「많이 샀다」다 —
 * 백만 원짜리를 한 번 사도 그냥 「쇼핑했다」이고, 몬스터볼을 두 번 나눠 사면
 * 「많이」가 된다. 사고 팔았으면 둘을 합쳐 「거래했다」 하나로 묶는다
 */
export function journalShopped(mapId: number, bought: number, sold: number): void {
  const label = mapById(mapId)?.label ?? -1
  if (label === NO_JOURNAL_SHOP_LABEL || NO_JOURNAL_SHOP_MAPS.has(mapId)) return
  if (bought !== 0 && sold !== 0) { journalPlain(LocationEvent.BUSINESS_AT_MART); return }
  if (bought > 1) { journalPlain(LocationEvent.LOTS_OF_SHOPPING); return }
  if (sold > 1) { journalPlain(LocationEvent.SOLD_A_LOT); return }
  if (bought !== 0) { journalPlain(LocationEvent.SHOPPED_AT_MART); return }
  if (sold !== 0) journalPlain(LocationEvent.SOLD_A_LITTLE)
}

/**
 * 지금 맵에서 야생을 몇 마리 이겼는가 (`wildBattleMetadata.wildMonDefeated`).
 *
 * ⚠️ **리포트에 안 남는다.** 원작도 `FieldSystem`에 두고 맵을 갈아 끼울 때마다
 * 0으로 되돌린다 — 세이브에 넣으면 하루를 걸어 다니며 모은 넷이 남아서,
 * 새 맵에서 한 마리만 이겨도 노트에 적힌다
 */
let wildWins = 0

/** 맵을 갈아 끼웠다 (`FieldMapChange_UpdateGameData`) */
export function journalResetWildWins(): void { wildWins = 0 }

/** 다섯째부터 적는다는 것을 시험이 확인할 수 있게 열어 둔다 */
export const WILD_WINS_BEFORE_ENTRY = 5

export type JournalGender = 'male' | 'female' | 'genderless'

const GENDER_ID: Record<JournalGender, number> = { male: 0, female: 1, genderless: 2 }

/**
 * 야생 배틀이 끝났다 (`encounter.c`).
 *
 * ⚠️ **쓰러뜨린 것은 다섯 마리째부터 적힌다.** 이 맵에서 이긴 야생을 세다가
 * 다섯을 넘기면 그때부터 이긴 마리를 적는다 — 그래서 지나가며 한 마리 잡은
 * 것은 노트에 안 남고, 한자리에서 레벨을 올린 날만 남는다
 */
export function journalWildBattle(
  { result, species, gender, timeOfDay, playtimeMs }: {
    result: 'caught' | 'defeated'
    species: number
    gender: JournalGender
    timeOfDay: number
    playtimeMs: number
  },
): void {
  if (result === 'defeated') {
    wildWins++
    if (wildWins < WILD_WINS_BEFORE_ENTRY) return
  }
  write((e) => saveMon(e, {
    result: result === 'caught' ? MonResult.CAUGHT : MonResult.DEFEATED,
    variant: monVariant(Math.floor(playtimeMs / 60_000)),
    timeOfDay, gender: GENDER_ID[gender], species,
  }))
}

/**
 * 트레이너를 이겼다 (`JournalEntry_CreateAndSaveEventTrainer`).
 *
 * 관장·사천왕·챔피언은 **자리 일**로, 보통 트레이너는 **따로 있는 한 줄**로 간다
 */
export function journalBeatTrainer(mapId: number, trainerId: number): void {
  const { kind, gym } = trainerKind(trainerId)
  if (kind === TrainerKind.GYM) {
    write((e) => saveLocationEvent(e, {
      type: LocationEvent.BEAT_GYM_LEADER, locationId: gym, trainerId,
    }))
    return
  }
  if (kind === TrainerKind.ELITE_FOUR) {
    write((e) => saveLocationEvent(e, { type: LocationEvent.BEAT_ELITE_FOUR_MEMBER, trainerId }))
    return
  }
  if (kind === TrainerKind.CHAMPION) {
    write((e) => saveLocationEvent(e, { type: LocationEvent.BEAT_CHAMPION, trainerId }))
    return
  }
  write((e) => saveTrainer(e, { standard: 1, trainerId, mapId }))
}

/** 콘테스트 등수처럼 통신 칸을 쓰는 일 */
export function journalOnline(ev: JournalOnline): void {
  write((e) => saveOnline(e, ev))
}

/**
 * 노트를 받는다 (`ScrCmd_GiveJournal`).
 *
 * 플래그는 스크립트가 세우고, 여기서는 **첫 쪽을 펼치는 일**만 한다 —
 * 받은 그 자리가 첫 머리글이 된다
 */
export function journalGiven(mapId: number, now: Date = new Date()): void {
  const save = useSaveStore.getState()
  const today = journalDate(now)
  const journal = rollPage(save.journal, today, true).journal
  journal[0] = saveTitle(journal[0]!, { ...today, mapId })
  useSaveStore.setState({ journal })
}

/**
 * 지금 맵이 아직 못 이긴 체육관인가. 개발 콘솔과 시험이 본다 —
 * 화면에서 확인하려면 뱃지 없이 체육관에 들어가 봐야 해서 길이 하나 필요하다
 */
export function journalGymTooTough(mapId: number): number {
  return gymTooTough(mapId, useSaveStore.getState().badges)
}
