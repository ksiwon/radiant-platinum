// 확인 지점으로 뛰어드는 손잡이 — 시험용.
//
// 여기서 하는 일은 둘뿐이다: 확인에 필요한 **조건을 채우고**(파티·가방·소지금),
// 갈 곳을 씬에 **올려 둔다**. 실제로 격자를 갈아 끼우고 세우는 것은 `MapStreamer`가
// 이미 워프를 위해 하고 있는 그 길이다 — 새 길을 내면 그 길만 시험되지 않는다.
//
// **배포 번들에 들어가면 안 된다.** 부르는 쪽이 전부 `import.meta.env.DEV`로 감싼
// 동적 import라, 프로덕션 빌드에서는 이 가지가 통째로 접히고 청크로도 안 나온다.
import { loadItems, loadMoves, loadSpecies } from '../data/gameData'
import { useSaveStore, type PokemonInstance } from '../state/saveStore'
import { addItem } from '../engine/bag/bag'
import { createWild, fillPp, statsOf } from '../engine/pokemon/instance'
import { fieldScripts } from '../engine/script/field'
import { FLAG_HAS_POKEDEX } from '../engine/script/vars'
import { HM_CARRIER, HM_TEACHES, seenAlongTheWay } from '../engine/dev/checkpoints'
import type { EncounterTable } from '../engine/battle/encounter'
import type { Checkpoint, PartySpec } from '../engine/dev/checkpoints'

export const devWarp = {
  /** 씬이 처리해야 할 확인 지점. 처리하고 나면 씬이 null로 되돌린다 */
  pending: null as Checkpoint | null,
}

/** 다친 파티를 만들 때 남기는 비율. 회복이 눈에 보일 만큼 낮아야 한다 */
const HURT_FRACTION = 1 / 3

/**
 * 확인 지점의 조건을 세이브에 채운다.
 *
 * 파티는 야생 개체를 만드는 길을 그대로 쓴다 — 기술도 PP도 종족 표가 정하는
 * 대로 붙는다. 우리가 손으로 기술을 골라 넣으면 그건 원작에 없는 편성이다
 */
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

async function applySetup(cp: Checkpoint): Promise<void> {
  const save = useSaveStore.getState()

  if (cp.party) {
    const [species, moves] = await Promise.all([loadSpecies(), loadMoves()])
    const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
    const make = (spec: PartySpec): PokemonInstance => {
      const sp = species.get(spec.species)
      const mon = fillPp(createWild({
        species: sp, level: spec.level, rng: Math.random,
        otId: save.trainer.id, otSecretId: save.trainer.secretId,
      }), pp)
      const max = statsOf(mon, sp).hp
      return { ...mon, hp: cp.hurt ? Math.max(1, Math.floor(max * HURT_FRACTION)) : max }
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

  if (cp.money !== undefined) useSaveStore.setState({ money: cp.money })
  if (cp.badges !== undefined) useSaveStore.setState({ badges: cp.badges })

  if (cp.dex) {
    giveDex()
    await markSeenAlongTheWay(cp)
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
  const base = import.meta.env.BASE_URL
  const get = async <T,>(name: string): Promise<T> =>
    await (await fetch(`${base}data/${name}`)).json() as T
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
  const flags = Uint8Array.from(useSaveStore.getState().flags)
  flags[FLAG_HAS_POKEDEX >> 3]! |= 1 << (FLAG_HAS_POKEDEX & 7)
  useSaveStore.setState({ flags })
  fieldScripts.vars.setFlag(FLAG_HAS_POKEDEX)
}

/**
 * 이 판 위에서 바로 옮겨 간다. `/play`가 이미 떠 있을 때 쓴다.
 *
 * 이야기 플래그는 안 건드린다 — 순간이동은 길 막은 사람을 그냥 지나치는 것이라
 * 진행도를 꾸며 낼 이유가 없고, 꾸며 내면 여기서 본 판이 진짜와 달라진다
 */
export async function warpTo(cp: Checkpoint): Promise<void> {
  await applySetup(cp)
  devWarp.pending = cp
}
