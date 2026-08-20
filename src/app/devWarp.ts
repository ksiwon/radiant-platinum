// 확인 지점으로 뛰어드는 손잡이 — 시험용.
//
// 여기서 하는 일은 둘뿐이다: 확인에 필요한 **조건을 채우고**(파티·가방·소지금),
// 갈 곳을 씬에 **올려 둔다**. 실제로 격자를 갈아 끼우고 세우는 것은 `MapStreamer`가
// 이미 워프를 위해 하고 있는 그 길이다 — 새 길을 내면 그 길만 시험되지 않는다.
//
// **배포 번들에 들어가면 안 된다.** 부르는 쪽이 전부 `import.meta.env.DEV`로 감싼
// 동적 import라, 프로덕션 빌드에서는 이 가지가 통째로 접히고 청크로도 안 나온다.
import { loadItems, loadMoves, loadSpecies } from '../data/gameData'
import { playerTrainer, useSaveStore, type PokemonInstance } from '../state/saveStore'
import { addItem } from '../engine/bag/bag'
import { createWild, fillPp, statsOf } from '../engine/pokemon/instance'
import { caughtAt, metToday } from '../engine/pokemon/origin'
import { abortScript, fieldScripts, forceFlag, forceVar } from '../engine/script/field'
import { FLAG_HAS_POKEDEX } from '../engine/script/vars'
import {
  SCRIPT_ID_OFFSET_SINGLE_BATTLES, SYSTEM_FLAG, TRAINER_DEFEATED_FLAGS_START, trainerIdOf,
} from '../engine/script/commands'
import {
  FLAG_UNLOCKED_VS_SEEKER_LVL_1, VAR_VS_SEEKER_BATTERY, VS_SEEKER_MAX_BATTERY,
} from '../engine/world/vsSeekerTable'
import { BERRY_STAGE } from '../engine/world/berryPatches'
import { POKETCH_APP_COUNT, registerApp } from '../engine/world/poketch'
import { usePoketchStore } from '../state/poketchStore'
import {
  fliesAlongTheWay, HM_CARRIER, HM_TEACHES, seenAlongTheWay,
} from '../engine/dev/checkpoints'
import type { EncounterTable } from '../engine/battle/encounter'
import type { Checkpoint, PartySpec } from '../engine/dev/checkpoints'
import { assets, readJson } from '../data/providers/assetProvider'

export const devWarp = {
  /** 씬이 처리해야 할 확인 지점. 처리하고 나면 씬이 null로 되돌린다 */
  pending: null as Checkpoint | null,
}

/** 다친 파티를 만들 때 남기는 비율. 회복이 눈에 보일 만큼 낮아야 한다 */
const HURT_FRACTION = 1 / 3

/**
 * 그 시점에 가진 비전머신을 **뮤 한 마리에게** 들려 보낸다.
 *
 * 확인 지점은 도구를 주는데, **도구만으로는 아무것도 안 열린다** — 원작이 보는
 * 것은 `Party_HasMonWithMove`다. 그렇다고 자연 습득기를 덮어쓰면 그 마리로
 * 배틀을 확인할 수가 없어서, 짐꾼을 따로 한 마리 붙인다.
 *
 * 뮤인 이유는 원작에서 **모든 기술을 배우기** 때문이다 (`checkpoints`의 `HM_CARRIER`).
 * 자리는 맨 끝이다 — 선두가 바뀌면 배틀에 엉뚱한 것이 먼저 나간다
 */
function withHmCarrier(
  party: PokemonInstance[], items: readonly (readonly [number, number])[],
  make: (spec: PartySpec) => PokemonInstance, pp: (move: number) => number,
): PokemonInstance[] {
  const learn = [...new Set(items.map(([item]) => HM_TEACHES[item]).filter((m) => m !== undefined))]
  if (learn.length === 0) return party
  // 레벨은 파티에 맞춘다. 5레벨 뮤가 끼면 그 판의 세기가 통째로 어긋나 보인다
  const level = Math.max(5, ...party.map((m) => m.level))
  const mew = make({ species: HM_CARRIER, level })
  // 기술 넉 칸이라 비전머신도 넷까지다. 다섯 번째가 생기면 여기서 잘린다
  const moves = learn.slice(0, 4).map((move) => ({ move, pp: pp(move), ppUps: 0 }))
  return [...party.slice(0, 5), fillPp({ ...mew, moves }, pp)]
}

/**
 * 확인 지점의 조건을 세이브에 채운다.
 *
 * 파티는 야생 개체를 만드는 길을 그대로 쓴다 — 기술도 PP도 종족 표가 정하는
 * 대로 붙는다. 우리가 손으로 기술을 골라 넣으면 그건 원작에 없는 편성이다
 */
async function applySetup(cp: Checkpoint): Promise<void> {
  const save = useSaveStore.getState()

  if (cp.party) {
    const [species, moves, label] = await Promise.all([
      loadSpecies(), loadMoves(), labelOf(cp.map),
    ])
    const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
    const make = (spec: PartySpec): PokemonInstance => {
      const sp = species.get(spec.species)
      const mon = fillPp(createWild({
        species: sp, level: spec.level, rng: Math.random,
        otId: save.trainer.id, otSecretId: save.trainer.secretId,
      }), pp)
      const max = statsOf(mon, sp).hp
      return {
        ...mon,
        hp: cp.hurt ? Math.max(1, Math.floor(max * HURT_FRACTION)) : max,
        // 확인 지점의 파티도 **어디선가 잡은 것**이어야 한다. 안 새기면 요약
        // 화면의 메모가 "수수께끼의 장소에서 Lv.0일 때"로 떠서, 화면이 맞는지를
        // 그 자리에서 못 본다
        origin: caughtAt(playerTrainer(save.trainer), label, spec.level, metToday()),
      }
    }
    const party = withHmCarrier(cp.party.slice(0, 6).map(make), cp.items ?? [], make, pp)
    useSaveStore.setState({ party })
    // 데리고 있는 것은 이미 잡은 것이다. 이걸 안 채우면 도감이 통째로 비어서,
    // 도감 화면을 열어 봐야 210줄이 전부 `----------`이다
    const save2 = useSaveStore.getState()
    for (const mon of party) {
      save2.markSeen(mon.species)
      save2.markCaught(mon.species)
    }
  }

  if (cp.items) {
    const items = await loadItems()
    // 주머니는 아이템 표가 정한다. 우리가 고르면 볼이 회복 주머니에 들어간다
    let bag = useSaveStore.getState().bag
    for (const [item, count] of cp.items) {
      const pocket = items.get(item).pocket
      if (pocket === undefined) continue
      bag = addItem(bag, pocket, item, count) ?? bag
    }
    useSaveStore.setState({ bag })
  }

  // ⚠️ **이야기 칸이 배지보다 먼저다.** 매 프레임 표(`OnFrameTable`)가 이 값을
  // 보고 스크립트를 거는데, 안 채우면 그 스크립트가 `LockAll`만 하고 끝나서
  // 주인공이 영영 묶인다 (`Checkpoint.story`의 실측)
  if (cp.story) for (const [id, value] of cp.story) giveVar(id, value)

  if (cp.money !== undefined) useSaveStore.setState({ money: cp.money })
  if (cp.badges !== undefined) useSaveStore.setState({ badges: cp.badges })
  // 신발이 없으면 Shift를 눌러도 걷는다 (`actor/player`). 도감과 같은 갈래라
  // 뛰어든 자리가 이야기상 신발 뒤면 채워 준다
  if (cp.runningShoes) useSaveStore.setState({ runningShoes: true })

  if (cp.dex) {
    giveDex()
    await markSeenAlongTheWay(cp)
  }

  // ⚠️ **전당등록 뒤의 자리는 그 플래그도 세워 준다.** 배지와 같은 갈래다 —
  // 이야기를 꾸며 내는 것이 아니라 **그 자리를 볼 조건**을 채우는 것이다.
  // 안 세우면 전당등록 뒤에만 도는 것들이(하늘빛 피리·시원의 배포) 뛰어든
  // 자리에서 한 번도 안 열린다
  if (cp.postGame === true) giveFlag(SYSTEM_FLAG.gameCompleted)

  // VS시커를 쓸 수 있는 판으로 맞춘다 (PARITY §7.9). 배지·도감과 같은 갈래다 —
  // 이야기를 꾸며 내는 것이 아니라 **그 자리를 볼 조건**을 채우는 것이다.
  // 걸어서 채우려면 100걸음이고, 재대결은 그 사람들을 **이미 이겨 놨어야** 뜬다
  if (cp.vsSeeker === true) await readyVsSeeker(cp)

  // 포켓치를 켜고 앱을 다 등록한다 (PARITY §7.3). 걸어서 모으려면 스물다섯
  // 자리를 돌아야 해서, 지도 화면 하나를 보려고 게임을 통째로 깨야 한다
  if (cp.poketchApp !== undefined) readyPoketch(cp.poketchApp)
  if (cp.ripeBerries === true) ripenBerries()

  // 지나온 마을은 공중날기가 열려 있다. 안 열면 타운맵이 통째로 회색이다.
  // ⚠️ `spawnTable`을 안 본다 — 타이틀에서 뛰어들면 아직 안 채워져 있다
  try {
    const file = await readJson(assets(), 'data/spawns.json') as {
      spawns: { fly: { map: number }; unlockOnMapEntry: boolean }[]
    }
    const at = (mapId: number): number | null => {
      const i = file.spawns.findIndex((sp) => sp.unlockOnMapEntry && sp.fly.map === mapId)
      return i < 0 ? null : i
    }
    const save3 = useSaveStore.getState()
    for (const index of fliesAlongTheWay(cp.id, at)) save3.unlockFly(index)
  } catch {
    // 타운맵만 회색으로 뜬다. 뛰어드는 것 자체는 막지 않는다
  }
}

/**
 * 그 맵의 지역명 번호.
 *
 * ⚠️ **`world`를 안 본다** — `markSeenAlongTheWay`와 같은 까닭이다. 타이틀에서
 * 뛰어들면 아직 세계가 안 떠 있어서 `world.maps`가 비어 있고, 그러면 잡은
 * 자리가 0이 되어 요약 화면이 "수수께끼의 장소"라고 한다
 */
async function labelOf(mapId: number): Promise<number> {
  try {
    const file = await readJson(assets(), 'data/maps.json') as { maps: { label: number }[] }
    return file.maps[mapId]?.label ?? 0
  } catch {
    return 0
  }
}

/**
 * 지나온 자리의 야생을 도감에 "본 적 있음"으로 찍는다.
 *
 * ⚠️ **`world`를 안 본다.** 타이틀에서 뛰어들면 아직 세계가 안 떠 있어서
 * `world.maps`가 비어 있다. 그래서 두 파일을 직접 받는다 — 어차피 `bootWorld`가
 * 곧 같은 주소를 받으므로 브라우저 캐시에서 나온다. 시험용 코드라 실패하면
 * 도감이 party만 든 채로 뜨는 것이 전부다
 */
async function markSeenAlongTheWay(cp: Checkpoint): Promise<void> {
  const get = async <T,>(name: string): Promise<T> =>
    await readJson(assets(), `data/${name}`) as T
  try {
    const [mapsFile, encFile] = await Promise.all([
      get<{ maps: { encounters: number | null }[] }>('maps.json'),
      get<{ tables: EncounterTable[] }>('encounters.json'),
    ])
    const tableOf = (mapId: number): EncounterTable | null => {
      const at = mapsFile.maps[mapId]?.encounters
      return at === null || at === undefined ? null : encFile.tables[at] ?? null
    }
    const save = useSaveStore.getState()
    for (const species of seenAlongTheWay(cp.id, tableOf)) save.markSeen(species)
  } catch {
    // 도감의 "본 적 있음"만 빈다. 뛰어드는 것 자체는 막지 않는다
  }
}

/**
 * 도감을 켠다.
 *
 * **두 군데에 세워야 한다.** 스크립트 VM은 자기 플래그 배열을 들고 있고
 * (`fieldScripts.vars`), 세이브는 따로 들고 있다가 맵이 뜰 때 `loadVars`로
 * VM에 부어 준다. 한쪽만 세우면 맵을 한 번 갈아탄 뒤에 도감이 사라진다
 */
function giveDex(): void {
  giveFlag(FLAG_HAS_POKEDEX)
}

/**
 * VS시커가 바로 도는 판으로 (PARITY §7.9).
 *
 * 셋을 채운다 — 배터리를 가득(100걸음), 첫 단계를 열고(207번도로에서 받는
 * `FLAG_UNLOCKED_VS_SEEKER_LVL_1`), **이 맵의 트레이너를 다 이긴 것으로** 적는다.
 *
 * ⚠️ **다 이겨 놓지 않으면 재대결이 안 뜬다.** 안 싸운 사람에게는 느낌표가
 * 하나 뜨고 끝이라, 이게 없으면 이 지점에서 볼 수 있는 것이 절반이다
 */
async function readyVsSeeker(cp: Checkpoint): Promise<void> {
  giveFlag(FLAG_UNLOCKED_VS_SEEKER_LVL_1)
  const vars = fieldScripts.vars
  // 플래그와 같은 이유로 `forceVar`다 — 새 판의 초기화가 `vars.reset()`으로
  // 지우고 그 결과를 세이브에 덮어쓴다
  forceVar(VAR_VS_SEEKER_BATTERY, VS_SEEKER_MAX_BATTERY)
  try {
    const events = await readJson(assets(), 'data/events.json') as {
      events: { npcs: { script: number; trainerType: number }[] }[]
    }
    const maps = await readJson(assets(), 'data/maps.json') as { maps: { events: number }[] }
    const file = maps.maps[cp.map]?.events
    for (const npc of (file === undefined ? undefined : events.events[file])?.npcs ?? []) {
      if (npc.trainerType <= 0 || npc.script < SCRIPT_ID_OFFSET_SINGLE_BATTLES) continue
      giveFlag(TRAINER_DEFEATED_FLAGS_START + trainerIdOf(npc.script))
    }
  } catch {
    // 배치표를 못 읽으면 느낌표 하나짜리만 뜬다. 뛰어드는 것 자체는 안 막는다
  }
  useSaveStore.setState({ vars: Uint16Array.from(vars.saved) })
}

/** 포켓치를 켜고 앱 스물다섯을 다 등록한 뒤 하나를 연다 */
function readyPoketch(app: number): void {
  const p = useSaveStore.getState().poketch
  let next = { ...p, enabled: true }
  for (let i = 0; i < POKETCH_APP_COUNT; i++) next = registerApp(next, i)
  useSaveStore.setState({ poketch: { ...next, appIndex: app } })
  usePoketchStore.getState().setView('large')
}

/**
 * 밭을 다 열린 채로 놓는다.
 *
 * ⚠️ **`isGrowing`도 같이 세운다.** 그게 「본 적이 있는가」라, 안 세우면
 * 단계만 올려 놔도 나무열매탐색기가 그 밭을 안 센다 (`GetReadyBerryPatches`)
 */
function ripenBerries(): void {
  useSaveStore.setState({
    berryPatches: useSaveStore.getState().berryPatches.map((p) => (
      p.berryID === 0 ? p : { ...p, growthStage: BERRY_STAGE.fruit, isGrowing: true }
    )),
  })
}

/**
 * 이야기 칸 하나를 세운다. 플래그와 같은 이유로 **두 군데에** 적는다 —
 * VM(`fieldScripts.vars`)과 세이브가 따로 들고 있다
 */
function giveVar(id: number, value: number): void {
  forceVar(id, value)
  useSaveStore.setState({ vars: Uint16Array.from(fieldScripts.vars.saved) })
}

/** 같은 이유로 **두 군데에** 세운다. 한쪽만 세우면 맵을 갈아탈 때 사라진다 */
function giveFlag(flag: number): void {
  const flags = Uint8Array.from(useSaveStore.getState().flags)
  flags[flag >> 3]! |= 1 << (flag & 7)
  useSaveStore.setState({ flags })
  // ⚠️ VM에는 `forceFlag`로 세운다 — 새 판의 초기화가 `vars.reset()`으로
  // 지우고 나서 그 결과를 세이브에 덮어쓰기 때문이다
  forceFlag(flag)
}

/**
 * 그 지점으로 뛰어든다. 타이틀에서도, `/play`가 이미 떠 있을 때도 이 길이다.
 *
 * ⚠️ **조건은 채우고, 이야기는 꾸며 내지 않는다.** 둘이 다르다 — `applySetup`은
 * 도감·배지·전당등록 플래그와 이야기 칸을 실제로 세운다. 그것은 **그 자리에
 * 서려면 이미 지나 있어야 하는 칸**이다 — 안 채우면 매 프레임 표가 건 스크립트가
 * `ReleaseAll` 없이 끝나 주인공이 영영 묶이고(`Checkpoint.story`), 만들어 둔 화면을
 * 여는 길이 아예 없다.
 *
 * 반대로 **그 지점까지 오면서 지나오지 않았을 칸은 안 세운다.** 세우면 길 막은
 * 사람이 사라져 여기서 본 판이 진짜와 달라진다
 */
export async function warpTo(cp: Checkpoint): Promise<void> {
  await applySetup(cp)
  // ⚠️ **돌고 있는 스크립트를 먼저 끊는다.** 타이틀에서 뛰어들면 새 판을
  // 여는데, 그 순간 주인공 방의 TV 방송이 이미 돌기 시작한 뒤다. 안 끊으면
  // 딴 맵에서 그 대사창이 뜨고 **플레이어가 잠긴 채로 선다**
  abortScript()
  devWarp.pending = cp
}
