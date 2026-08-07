// 첫 배틀은 급소가 안 난다 (`BATTLE_STATUS_FIRST_BATTLE`).
//
// 201번도로에서 라이벌과 처음 붙는 그 판이다. 원작이 보통 트레이너전과 다르게
// 두는 것이 **딱 하나** 있다 — `BtlCmd_CalcCrit`이 이 비트를 보고
// `criticalMul`을 1로 고정한다. 처음 잡아 보는 배틀에서 운으로 지지 않게 하는
// 장치고, 이기고 지는 것 자체는 막지 않는다.
//
// ⚠️ **눈으로 못 보는 종류의 차이다.** 붙였는데 안 먹거나, 안 붙였는데 먹거나
// 해도 화면은 똑같이 굴러간다. 그래서 실제로 급소가 터지는 조건을 만들어 놓고
// **센다** — 안 붙였을 때는 나야 하고 붙였을 때는 한 번도 안 나야 한다.
import { describe, expect, it } from 'vitest'
import { BattleController } from './controller'
import { movesById, rng, spawn } from './fixtures.testkit'
import type { SideMon } from './session'

/** 급소율 한 단계 높은 기술 (`Slash`). 4세대에서 1/8이다 */
const SLASH = 163
/** 아무 일도 안 일어나는 기술. 상대가 방해하지 않게 이것만 들려 보낸다 */
const SPLASH = 150

/** 이브이 5레벨 — 데미지가 얕아야 상대가 안 쓰러진다 */
const ATTACKER = 133
const ATTACKER_LEVEL = 5
/** 럭키 100레벨 — HP가 압도적이라 PP가 마를 때까지 버틴다 */
const DEFENDER = 113
const DEFENDER_LEVEL = 100

function withMove(side: SideMon, move: number): SideMon {
  // 포인트업 세 번을 먹인 최대치로 채운다. 중간에 PP가 마르면 발버둥으로
  // 갈리고, 그건 급소율이 다른 기술이다
  const pp = Math.floor((movesById.get(move)?.pp ?? 10) * 8 / 5)
  return { ...side, mon: { ...side.mon, moves: [{ move, pp, ppUps: 3 }] } }
}

/** 한 판에서 몇 턴 동안 급소가 몇 번 났는가 */
async function countCrits(turns: number, seed: number, noCrit: boolean): Promise<number> {
  const attacker = withMove(spawn(ATTACKER, ATTACKER_LEVEL, seed, 'a'), SLASH)
  const defender = withMove(spawn(DEFENDER, DEFENDER_LEVEL, seed + 7, 'd'), SPLASH)
  const { controller } = await BattleController.start({
    player: { name: '공격', team: [attacker] },
    foe: { name: '방어', team: [defender] },
    random: rng(seed),
    ...(noCrit ? { noCrit: true } : {}),
  })
  let crits = 0
  try {
    for (let t = 0; t < turns; t++) {
      const action = controller.actions[0]
      if (!action) break
      const result = await controller.choose(action)
      crits += result.events.filter((e) => e.kind === 'crit').length
      if (result.events.some((e) => e.kind === 'faint')) break
    }
  } finally {
    controller.destroy()
  }
  return crits
}

/**
 * 한 판에 때릴 수 있는 최대 횟수.
 *
 * 베어가르기의 PP가 포인트업까지 먹여서 32라 여기서 멈춘다. 씨앗 셋을 돌리면
 * 96번을 때리는 셈이고, 1/8짜리가 한 번도 안 날 확률은 사실상 0이다
 */
const TURNS = 32

/** 씨앗을 바꿔 가며 여러 판을 돌린다. 급소가 아예 안 뜨는 판이 있을 수 있다 */
const SEEDS = [20260808, 4242, 777]

async function crits(noCrit: boolean): Promise<number> {
  let total = 0
  for (const seed of SEEDS) total += await countCrits(TURNS, seed, noCrit)
  return total
}

describe('첫 배틀', () => {
  it('평소에는 급소가 난다', async () => {
    // 시험이 헛돌지 않는다는 확인이다 — 여기서 0이 나오면 아래 시험은
    // "원래 안 나는 것"을 보고 통과하는 셈이 된다
    expect(await crits(false)).toBeGreaterThan(0)
  })

  it('첫 배틀에서는 한 번도 안 난다', async () => {
    // 같은 씨앗·같은 개체·같은 기술이다. 다른 것은 이 깃발 하나뿐이다
    expect(await crits(true)).toBe(0)
  })
})
