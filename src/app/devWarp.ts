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
    useSaveStore.setState({ party: cp.party.slice(0, 6).map(make) })
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
