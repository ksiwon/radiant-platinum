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
    const party = cp.party.slice(0, 6).map(make)
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

  if (cp.dex) giveDex()
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
