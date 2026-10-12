// 개발 전용 — **실제 배틀 화면에서 기술 연출을 보는 길** (`window.pt.fxBattle` · `pt.fxTurn`).
//
// `/fxlab`은 연출 하나를 따로 틀어 볼 뿐이라 **배틀이 기술을 부르는 길**(발판 높이 · 방향 · 도우미 · 매그니튜드 흔들림처럼
// 사건 로그를 보고서야 정해지는 값)은 못 본다. 여기서는 내 마리 · 기술 · 상대 · 싱글/더블을 정해 실제 배틀(`startFactory` —
// 양쪽 파티를 그대로 받는 길)을 열고, 기술을 골라 한 턴을 돌린다.
//
// 배포본에는 안 실린다 — 부르는 곳이 `devConsole`(`import.meta.env.DEV` 뒤)뿐이다. 세이브 파티는 건드리지 않는다.
import { loadMoves, loadSpecies } from '../data/gameData'
import { createWild, fillPp, statsOf, type PokemonInstance } from '../engine/pokemon/instance'
import { useBattleStore } from '../state/battleStore'
import { playerTrainer, useSaveStore } from '../state/saveStore'

/** 한 마리 지정 — 종족 · 레벨 · 기술(최대 4) · 폼 */
interface FxMon { species: number; level?: number; moves: readonly number[]; form?: number }

async function build(spec: FxMon): Promise<PokemonInstance> {
  const [table, moves] = await Promise.all([loadSpecies(), loadMoves()])
  // ⚠️ 겉 주인이 이 세이브의 주인공이어야 한다(번호 · 이름 · 성별 — `isOriginalTrainer`) — 아니면 레벨 100이 「말을 듣지 않는다」
  const trainer = useSaveStore.getState().trainer
  const mon = createWild({
    species: table.get(spec.species), level: spec.level ?? 100, rng: Math.random, otId: trainer.id, otSecretId: trainer.secretId, trainer: playerTrainer(trainer),
  })
  mon.form = spec.form ?? 0
  mon.moves = spec.moves.slice(0, 4).map((move) => ({ move, pp: 0, ppUps: 0 }))
  mon.heldItem = 0
  mon.hp = statsOf(mon, table.of(mon)).hp
  return fillPp(mon, (id) => moves.byId.get(id)?.pp ?? 5)
}

/**
 * 연출 확인용 배틀을 연다. 상대 AI는 0(무작위)이고, 상대 기술은 주는 대로다 — 안 주면 `속이기`(150) 하나라 아무것도 안 부순다.
 * @param doubles 더블이면 양쪽 둘씩 내보낸다 (각 쪽 앞의 둘)
 */
export async function fxBattle(opts: { mine: readonly FxMon[]; foe: readonly FxMon[]; doubles?: boolean }): Promise<void> {
  const team = await Promise.all(opts.mine.map(build))
  const foe = await Promise.all(opts.foe.map((f) => build({ ...f, moves: f.moves.length > 0 ? f.moves : [150] })))
  await useBattleStore.getState().startFactory({
    team, foe, label: '연출 확인', cls: '연출', name: '확인', ai: 0, doubles: opts.doubles ?? false,
    defeat: null, victory: null,
  })
}

/** 어느 자리가 어떤 기술을 어디로 쓰는가. 기술은 롬 번호, 대상은 상대 쪽 1·2 · 내 쪽 −1·−2 (더블에서 대상이 필요한 기술에만) */
interface FxPick { move: number; target?: number }

/** 입력을 받을 수 있는 때까지 기다린다 — 이전 턴의 사건이 다 재생되고 후보가 선 뒤 */
async function ready(timeoutMs: number): Promise<boolean> {
  const till = Date.now() + timeoutMs
  while (Date.now() < till) {
    const s = useBattleStore.getState()
    if (s.phase === 'running' && s.actions.some((a) => a.type === 'move')) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

/**
 * 한 턴을 낸다 — 자리마다 하나씩 (싱글은 하나, 더블은 앞자리 · 뒷자리 순).
 * 기술이 칸에 없으면 던진다 (`fxBattle`의 `moves`에 넣었는지 확인하라). 입력을 기다리다 시한이 지나면 null, 냈으면 낸 기술의 `롬번호=sim이름` 목록.
 */
export async function fxTurn(...picks: FxPick[]): Promise<string[] | null> {
  if (!(await ready(60_000))) return null
  const named: string[] = []
  for (const pick of picks) {
    const actions = useBattleStore.getState().actions
    const hit = actions.find((a) => a.type === 'move' && a.move === pick.move)
    if (hit === undefined) throw new Error(`기술 ${String(pick.move)}이 이 자리의 후보에 없다: ${JSON.stringify(actions.map((a) => (a.type === 'move' ? a.move : a.type)))}`)
    named.push(`${String(pick.move)}=${hit.type === 'move' ? hit.name : ''}`)
    await useBattleStore.getState().choose(pick.target === undefined || hit.type !== 'move' ? hit : { ...hit, target: pick.target })
  }
  return named
}
