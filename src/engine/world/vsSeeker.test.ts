// VS시커 (PARITY §7.9)
//
// ⚠️ **표는 디컴프에서 구운 것이다** (`pnpm gen:vsseeker`). 여기서 못 박는 것은
// **규칙**이지 줄 하나하나가 아니다 — 값은 굽는 쪽이 책임진다.
import { describe, expect, it } from 'vitest'
import {
  adjustRematchLevel, batteryMissing, currentRematchLevel, inSearchRange, isViable,
  pickRematchTrainers, rematchIndexOf, rematchTrainerID, viableTrainers, vsSeekerStep,
  vsSeekerUsable, TRAINER_NONE, VsSeekerResult, type SeekerTrainer,
} from './vsSeeker'
import {
  MOVEMENT_TYPE_VS_SEEKER_SPIN, REMATCH_END, REMATCH_NONE, VS_SEEKER_MAX_ACTIVE_STEPS,
  VS_SEEKER_MAX_BATTERY, VS_SEEKER_MAX_REMATCHES, VS_SEEKER_REMATCHES, VS_SEEKER_SEARCH,
} from './vsSeekerTable'

/** 훑기에 드는 보통 트레이너 하나 */
function trainer(over: Partial<SeekerTrainer> = {}): SeekerTrainer {
  return { localID: 1, trainerID: 100, trainerType: 1, movementType: 2, x: 10, z: 10, ...over }
}

describe('표의 모양', () => {
  it('240줄이고 한 줄이 여섯 칸이다', () => {
    expect(VS_SEEKER_REMATCHES).toHaveLength(240)
    for (const row of VS_SEEKER_REMATCHES) expect(row).toHaveLength(VS_SEEKER_MAX_REMATCHES)
  })

  it('0번 칸이 겹치지 않는다 — 조회가 앞엣것만 찾는다', () => {
    const firsts = VS_SEEKER_REMATCHES.map((r) => r[0])
    expect(new Set(firsts).size).toBe(firsts.length)
    for (const id of firsts) expect(id).toBeGreaterThan(0)
  })

  it('⚠️ 끝 칸이 「없음」인 줄이 없다 — 있으면 65535번 트레이너와 싸우게 된다', () => {
    // 1~5에 `END`가 하나도 없는 줄만 5단계까지 간다 (`currentRematchLevel`의 마지막 줄)
    const openEnded = VS_SEEKER_REMATCHES.filter((r) => !r.slice(1).includes(REMATCH_END))
    expect(openEnded.length).toBeGreaterThan(0)
    for (const row of openEnded) expect(row[5]).not.toBe(REMATCH_NONE)
  })
})

describe('훑는 범위', () => {
  it('⚠️ 아래가 한 칸 좁다 — 위 7 · 아래 6이다', () => {
    expect(VS_SEEKER_SEARCH.up).toBe(7)
    expect(VS_SEEKER_SEARCH.down).toBe(6)
    expect(inSearchRange(20, 20, 20, 13)).toBe(true)
    expect(inSearchRange(20, 20, 20, 12)).toBe(false)
    expect(inSearchRange(20, 20, 20, 26)).toBe(true)
    expect(inSearchRange(20, 20, 20, 27)).toBe(false)
  })

  it('좌우는 일곱씩이다', () => {
    expect(inSearchRange(20, 20, 13, 20)).toBe(true)
    expect(inSearchRange(20, 20, 12, 20)).toBe(false)
    expect(inSearchRange(20, 20, 27, 20)).toBe(true)
    expect(inSearchRange(20, 20, 28, 20)).toBe(false)
  })

  it('⚠️ 왼쪽·위만 0에서 잘린다 — 그만큼 네모가 좁아진다', () => {
    // 주인공이 (3, 3)에 서 있으면 왼쪽은 −4가 아니라 0에서 시작한다.
    // 음수 칸에는 사람이 없으니 눈에는 안 보이지만, 오른쪽·아래는 안 자른다
    expect(inSearchRange(3, 3, 0, 0)).toBe(true)
    expect(inSearchRange(3, 3, 10, 9)).toBe(true)
    expect(inSearchRange(3, 3, 11, 9)).toBe(false)
  })

  it('⚠️ 유형 3번만 빠져 있다 — 1·2·4~8만 든다', () => {
    for (const t of [1, 2, 4, 5, 6, 7, 8]) {
      expect(isViable(trainer({ trainerType: t }), 10, 10), `유형 ${String(t)}`).toBe(true)
    }
    for (const t of [0, 3, 9, 10, 11]) {
      expect(isViable(trainer({ trainerType: t }), 10, 10), `유형 ${String(t)}`).toBe(false)
    }
  })

  it('변장한 사람은 안 든다', () => {
    expect(isViable(trainer({ movementType: 54 }), 10, 10)).toBe(false)
    expect(isViable(trainer({ movementType: 51 }), 10, 10)).toBe(false)
  })

  it('멀리 선 사람은 목록에서 빠진다', () => {
    const all = [trainer({ localID: 1, x: 10 }), trainer({ localID: 2, x: 30 })]
    expect(viableTrainers(all, 10, 10).map((t) => t.localID)).toEqual([1])
  })
})

describe('쓸 수 있는가', () => {
  it('⚠️ 배터리가 「가득」이어야 한다 — 99에서도 못 쓴다', () => {
    expect(vsSeekerUsable(VS_SEEKER_MAX_BATTERY, 1)).toBe(VsSeekerResult.ok)
    expect(vsSeekerUsable(VS_SEEKER_MAX_BATTERY - 1, 1)).toBe(VsSeekerResult.noBattery)
    expect(vsSeekerUsable(0, 1)).toBe(VsSeekerResult.noBattery)
  })

  it('가득이어도 사람이 없으면 안 돈다', () => {
    expect(vsSeekerUsable(VS_SEEKER_MAX_BATTERY, 0)).toBe(VsSeekerResult.noTrainers)
  })

  it('모자란 걸음을 대사에 그대로 넘긴다', () => {
    expect(batteryMissing(37)).toBe(63)
    expect(batteryMissing(VS_SEEKER_MAX_BATTERY)).toBe(0)
  })
})

describe('걸음', () => {
  it('⚠️ 가방에 있어야 찬다', () => {
    expect(vsSeekerStep(10, 0, false, true).battery).toBe(11)
    expect(vsSeekerStep(10, 0, false, false).battery).toBe(10)
  })

  it('가득 차면 더 안 는다', () => {
    expect(vsSeekerStep(VS_SEEKER_MAX_BATTERY, 0, false, true).battery).toBe(VS_SEEKER_MAX_BATTERY)
  })

  it('안 썼으면 느낌표 걸음이 안 돈다', () => {
    const got = vsSeekerStep(0, 0, false, true)
    expect(got.steps).toBe(0)
    expect(got.expired).toBe(false)
  })

  it('100걸음째에 꺼진다 — 99까지는 서 있다', () => {
    let steps = 0
    for (let i = 1; i < VS_SEEKER_MAX_ACTIVE_STEPS; i++) {
      const got = vsSeekerStep(VS_SEEKER_MAX_BATTERY, steps, true, true)
      expect(got.expired, `${String(i)}걸음째`).toBe(false)
      steps = got.steps
    }
    expect(steps).toBe(VS_SEEKER_MAX_ACTIVE_STEPS - 1)
    const last = vsSeekerStep(VS_SEEKER_MAX_BATTERY, steps, true, true)
    expect(last.expired).toBe(true)
    expect(last.steps).toBe(0)
  })

  it('⚠️ 배터리와 느낌표가 따로 돈다 — 안 가지고 있어도 걸음은 준다', () => {
    const got = vsSeekerStep(30, VS_SEEKER_MAX_ACTIVE_STEPS - 1, true, false)
    expect(got.battery).toBe(30)
    expect(got.expired).toBe(true)
  })
})

describe('세우기', () => {
  const never = (): boolean => false
  const always = (): boolean => true

  it('⚠️ 안 싸운 사람에게는 느낌표 하나다 — 이동 유형이 안 바뀐다', () => {
    const one = trainer({ localID: 5 })
    const got = pickRematchTrainers({
      visible: [one], all: [one], defeated: never, isDouble: never, roll: () => 0,
    })
    expect(got.marks).toEqual([{ localID: 5, mark: 'single' }])
    expect(got.spin).toEqual([])
    expect(got.any).toBe(true)
  })

  it('이긴 사람은 절반이 응한다 — 굴림 49는 서고 50은 안 선다', () => {
    const one = trainer({ localID: 5 })
    const lucky = pickRematchTrainers({
      visible: [one], all: [one], defeated: always, isDouble: never, roll: () => 49,
    })
    expect(lucky.spin).toEqual([5])
    expect(lucky.marks).toEqual([{ localID: 5, mark: 'double' }])
    const miss = pickRematchTrainers({
      visible: [one], all: [one], defeated: always, isDouble: never, roll: () => 50,
    })
    expect(miss.spin).toEqual([])
    expect(miss.any).toBe(false)
  })

  it('⚠️ 이미 서 있는 사람에게도 주사위를 굴린다 — 난수 소비가 같아야 한다', () => {
    const spun = trainer({ localID: 5, movementType: MOVEMENT_TYPE_VS_SEEKER_SPIN })
    let rolls = 0
    const got = pickRematchTrainers({
      visible: [spun], all: [spun], defeated: always, isDouble: never,
      roll: () => { rolls++; return 0 },
    })
    expect(rolls).toBe(1)
    expect(got.spin).toEqual([])
    expect(got.any).toBe(false)
  })

  it('⚠️ 안 싸운 사람이 하나라도 있으면 "아무도 없다"가 안 나온다', () => {
    const fresh = trainer({ localID: 1, trainerID: 100 })
    const beaten = trainer({ localID: 2, trainerID: 200 })
    const got = pickRematchTrainers({
      visible: [fresh, beaten], all: [fresh, beaten],
      defeated: (id) => id === 200, isDouble: never, roll: () => 99,
    })
    expect(got.spin).toEqual([])
    expect(got.any).toBe(true)
  })

  it('더블은 짝도 같이 돈다 — 트레이너 번호가 같은 다른 사람이다', () => {
    const a = trainer({ localID: 1, trainerID: 300 })
    const b = trainer({ localID: 2, trainerID: 300 })
    const got = pickRematchTrainers({
      visible: [a, b], all: [a, b], defeated: always, isDouble: always, roll: () => 0,
    })
    // 첫 사람이 짝까지 세우고, 두 번째 차례에는 이미 서 있어서 지나간다
    expect(got.spin).toEqual([1, 2])
    expect(got.marks).toEqual([
      { localID: 1, mark: 'double' }, { localID: 2, mark: 'double' },
    ])
  })

  it('짝이 없으면 혼자 선다', () => {
    const a = trainer({ localID: 1, trainerID: 300 })
    const other = trainer({ localID: 2, trainerID: 301 })
    const got = pickRematchTrainers({
      visible: [a], all: [a, other], defeated: always, isDouble: always, roll: () => 0,
    })
    expect(got.spin).toEqual([1])
  })
})

describe('재대결 상대', () => {
  /** 재대결이 세 단계인 줄 하나 */
  const three = VS_SEEKER_REMATCHES.findIndex(
    (r) => r.slice(1).filter((t) => t !== REMATCH_NONE && t !== REMATCH_END).length === 3,
  )
  const row = VS_SEEKER_REMATCHES[three]!

  it('표에 없는 트레이너는 재대결이 없다', () => {
    expect(rematchIndexOf(0)).toBe(null)
    expect(rematchIndexOf(99999)).toBe(null)
    expect(rematchIndexOf(row[0]!)).toBe(three)
  })

  it('⚠️ 회전하고 있어야 한다 — 느낌표가 없으면 TRAINER_NONE이다', () => {
    const args = { trainerID: row[0]!, defeated: () => true, unlocked: () => true }
    expect(rematchTrainerID({ ...args, spinning: false })).toBe(TRAINER_NONE)
    expect(rematchTrainerID({ ...args, spinning: true })).not.toBe(TRAINER_NONE)
  })

  it('안 이긴 첫 상대가 지금 단계다', () => {
    const levels = row.map((_, i) => i).filter((i) => i > 0
      && row[i] !== REMATCH_NONE && row[i] !== REMATCH_END)
    expect(currentRematchLevel(three, () => false)).toBe(levels[0])
    // 첫 단계를 이기면 그다음으로 넘어간다
    expect(currentRematchLevel(three, (id) => id === row[levels[0]!])).toBe(levels[1])
  })

  it('⚠️ 다 이겨도 마지막 단계에서 멈춘다 — 제일 센 팀과 계속 싸운다', () => {
    const levels = row.map((_, i) => i).filter((i) => i > 0
      && row[i] !== REMATCH_NONE && row[i] !== REMATCH_END)
    const last = currentRematchLevel(three, () => true)
    expect(last).toBe(levels[levels.length - 1])
    expect(row[last]).not.toBe(REMATCH_NONE)
    expect(row[last]).not.toBe(REMATCH_END)
  })

  it('⚠️ 안 열린 단계는 한 칸만 내려간다 — 되풀이가 아니다', () => {
    const levels = row.map((_, i) => i).filter((i) => i > 0
      && row[i] !== REMATCH_NONE && row[i] !== REMATCH_END)
    const top = levels[levels.length - 1]!
    // 「없음」 칸은 건너뛰고 실제로 상대가 있는 자리로 내려간다
    const down = adjustRematchLevel(three, top, () => false)
    expect(down).toBe(levels[levels.length - 2])
    // 열려 있으면 그대로 둔다
    expect(adjustRematchLevel(three, top, () => true)).toBe(top)
    // 0단계는 안 내려간다 — 원래 트레이너다
    expect(adjustRematchLevel(three, 0, () => false)).toBe(0)
  })

  it('안 열린 단계 아래에 아무것도 없으면 원래 트레이너로 돌아간다', () => {
    // 재대결이 한 단계뿐인 줄. 그 하나가 안 열려 있으면 0번 칸이다
    const one = VS_SEEKER_REMATCHES.findIndex(
      (r) => r[1] !== REMATCH_NONE && r[1] !== REMATCH_END && r[1] !== r[0],
    )
    expect(one).toBeGreaterThanOrEqual(0)
    expect(adjustRematchLevel(one, 1, () => false)).toBe(0)
  })

  it('⚠️ 160줄은 재대결이 같은 사람이다 — 팀만 그대로 다시 싸운다', () => {
    const same = VS_SEEKER_REMATCHES.filter((r) => r[1] === r[0] && r[2] === REMATCH_END)
    expect(same).toHaveLength(160)
    const id = same[0]![0]!
    expect(rematchTrainerID({
      spinning: true, trainerID: id, defeated: () => true, unlocked: () => true,
    })).toBe(id)
  })
})
