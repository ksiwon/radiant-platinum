// **지닌 도구가 배틀에 들어가는가** (PARITY §2 · REPAIR §7)
//
// ⚠️ **오래 안 들어갔다.** `session.ts`가 sim에 넘기는 팀 항목에서 `item`이
// 빈 문자열로 못 박혀 있었다. 그래서 트레이너 개체 1,878 중 **59가 열매를 들고
// 있는데 한 번도 안 터졌고**(오랭열매 56 · 오랭 1 · 이상한사탕 2, 난천의 여섯째도
// 그중 하나다), 구애머리띠·목탄 같은 위력 보정도 통째로 없었다.
//
// 「도구를 넘긴다」는 고침은 배틀 안에서만 보이므로, 여기서 **실제로 한 판을
// 굴려** 열매가 터지는지 본다. 어림값 쪽은 `damage.test.ts`가 맡는다.
import { describe, expect, it } from 'vitest'
import { BattleController } from './controller'
import { itemsById, movesById, rng, spawn } from './fixtures.testkit'
import type { SideMon } from './session'

/** 오랭열매 — HP가 절반 밑으로 내려가면 30을 채운다 (`HOLD_EFFECT_HP_RESTORE`) */
const SITRUS_BERRY = 158
/** 물장구 — 아무 일도 안 일어난다. 상대가 방해하지 않게 이것만 들려 보낸다 */
const SPLASH = 150
/** 지진 */
const EARTHQUAKE = 89

function withMove(side: SideMon, move: number): SideMon {
  const pp = movesById.get(move)?.pp ?? 10
  return { ...side, mon: { ...side.mon, moves: [{ move, pp, ppUps: 0 }] } }
}

const withItem = (side: SideMon, item: number): SideMon =>
  ({ ...side, mon: { ...side.mon, heldItem: item } })

/**
 * 한 판을 열어 몇 턴 때린다. 열매가 터졌는지와 그때 회복이 있었는지를 준다.
 *
 * `pass`면 도구 표를 안 넘긴다 — 고치기 전과 같은 상태다
 */
async function hit(item: number, turns: number, pass: boolean): Promise<{
  fired: boolean, healed: boolean,
}> {
  // ⚠️ **한 방에 쓰러지면 열매가 터질 틈이 없다.** 때리는 쪽을 낮은 레벨로,
  // 맞는 쪽을 높은 레벨에 튼튼한 종으로 잡아 여러 대를 견디게 한다
  const attacker = withMove(spawn(95, 22, 91, 'a'), EARTHQUAKE)
  const defender = withItem(withMove(spawn(59, 50, 97, 'd'), SPLASH), item)

  const { controller } = await BattleController.start({
    player: { name: '공격', team: [attacker] },
    foe: { name: '방어', team: [defender] },
    random: rng(91),
    ...(pass ? { itemName: (id: number) => itemsById.get(id)?.name } : {}),
  })
  try {
    let fired = false
    let healed = false
    for (let t = 0; t < turns; t++) {
      const action = controller.actions[0]
      if (!action) break
      const result = await controller.choose(action)
      // 열매가 터지면 회복 줄이 온다 (`|-heal|p2a: …|[from] item: Sitrus Berry`)
      for (const e of result.events) {
        if (e.kind === 'heal' && e.actor.side === 'p2') { fired = true; healed = true }
      }
      if (result.events.some((e) => e.kind === 'faint' || e.kind === 'win')) break
    }
    return { fired, healed }
  } finally {
    controller.destroy()
  }
}

describe('지닌 도구가 배틀에 들어간다', () => {
  it('⚠️ 오랭열매가 실제로 터진다', async () => {
    const got = await hit(SITRUS_BERRY, 6, true)
    expect(got.fired, '열매가 안 터졌다 — sim에 도구가 안 들어간 것이다').toBe(true)
  }, 60_000)

  // ⚠️ **이빨이 있는지 여기서 본다.** 위 시험만 두면 「원래부터 터지고 있었다」와
  // 구별이 안 된다. 도구 표를 안 넘기면(고치기 전과 같은 상태) 안 터져야 한다
  it('⚠️ 도구 표를 안 넘기면 안 터진다 — 그것이 고치기 전이었다', async () => {
    const got = await hit(SITRUS_BERRY, 6, false)
    expect(got.fired).toBe(false)
  }, 60_000)

  it('도구를 안 들면 당연히 안 터진다', async () => {
    const got = await hit(0, 6, true)
    expect(got.fired).toBe(false)
  }, 60_000)
})
