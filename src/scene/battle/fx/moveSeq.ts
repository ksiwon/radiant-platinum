// BDSP 연출 시퀀스 받기 — 기술 · 볼 (BATTLE_FX §4).
//
// `data/fx/index.json`이 표다: `moves[기술 번호].seq` = `ew033` 같은 시퀀스 이름,
// `balls[볼 번호]` = `{ capture, ballout }` 프리팹 이름. 표가 없으면(이펙트 묶음을 안 깔았으면)
// 모든 것이 DS 입자로 떨어진다.
//
// ⚠️ **기술 길이는 동기로 답해야 한다.** 박자(`playback`)가 기술 사건을 꺼내는 그 순간에
// `moveFramesOf`로 길이를 묻는다. 그때 시퀀스를 받고 있으면 늦으므로, 판이 열리면 명부의
// 기술들(`RosterEntry.moves`)을 미리 받아 계획까지 펴 둔다(`preloadMoveSeqs`).
// 못 받은 기술은 DS 길이로 간다 — 그 판의 그 한 번만 DS 연출이 선다.
import { assets, onProviderSwap, readJson } from '../../../data/providers/assetProvider'
import { planSequence, type SeqData, type SeqPlan } from '../../../engine/battle/fx/sequence'
import { loadFxPrefab } from './fxAssets'

interface FxIndex {
  balls: Record<string, { capture: string; ballout: string }>
  moves: Record<string, { seq?: string }>
  prefabs?: string[]
  missingPrefabs?: string[]
}

let index: Promise<FxIndex | null> | null = null
const seqs = new Map<string, Promise<SeqData | null>>()
/** 받아 펴 둔 기술 계획. 열쇠는 `기술:내쪽여부` */
const plans = new Map<string, SeqPlan>()

onProviderSwap(() => {
  index = null
  seqs.clear()
  plans.clear()
})

/** 이펙트 표. 묶음을 안 깔았으면 `null` */
function fxIndex(): Promise<FxIndex | null> {
  index ??= (async () => {
    const provider = assets()
    if (!(await provider.exists('data/fx/index.json'))) return null
    return (await readJson(provider, 'data/fx/index.json')) as FxIndex
  })().catch(() => null)
  return index
}

function loadSeq(name: string): Promise<SeqData | null> {
  let got = seqs.get(name)
  if (!got) {
    got = (readJson(assets(), `data/fx/seq/${name}.json`) as Promise<SeqData>).catch(() => null)
    seqs.set(name, got)
  }
  return got
}

/**
 * 판이 열리면 부른다 — 기술마다 시퀀스를 받아 계획을 펴 두고, 프리팹도 미리 받는다.
 *
 * @param ball 쓰는 볼 번호는 기술과 상관없어 4(몬스터볼 자리표시)로 편다
 */
export async function preloadMoveSeqs(moves: Iterable<number>): Promise<void> {
  const idx = await fxIndex()
  if (!idx) return
  const missing = new Set(idx.missingPrefabs ?? [])
  const todo = [...new Set(moves)].filter((m) => idx.moves[String(m)]?.seq)
  await Promise.all(todo.map(async (move) => {
    const name = idx.moves[String(move)]!.seq!
    const seq = await loadSeq(name)
    if (!seq) return
    for (const mine of [true, false]) {
      const plan = planSequence(seq, { attackerMine: mine })
      // 프리팹이 하나라도 빠졌으면 이 기술은 DS로 간다 — 반쪽짜리 BDSP 연출보다 낫다
      if (plan.particles.some((p) => missing.has(p.prefab))) return
      plans.set(`${move}:${mine ? 1 : 0}`, plan)
    }
    for (const p of plans.get(`${move}:1`)?.particles ?? []) void loadFxPrefab(p.prefab).catch(() => { /* 그릴 때 다시 */ })
  }))
}

/** 받아 둔 기술 계획 (동기). 없으면 DS 연출이다 */
export function moveSeqPlan(move: number | null, attackerMine: boolean): SeqPlan | null {
  if (move === null) return null
  return plans.get(`${move}:${attackerMine ? 1 : 0}`) ?? null
}

/** 볼 번호의 프리팹 둘. 표에 없으면 몬스터볼(4) */
export async function ballPrefabs(ball: number): Promise<{ capture: string; ballout: string } | null> {
  const idx = await fxIndex()
  if (!idx) return null
  return idx.balls[String(ball)] ?? idx.balls['4'] ?? null
}
