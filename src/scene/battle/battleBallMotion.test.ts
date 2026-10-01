import { describe, expect, it } from 'vitest'
import {
  CAPTURE_SEAL_TIME,
  CAPTURE_THROW_TIME,
  ballPalette,
  ballShakeAngle,
  captureBodyScale,
  captureResolveAt,
  recallsBody,
  throwArc,
  throwerOf,
  TRAINER_GONE_AT,
  TRAINER_SLIDE_SPEED,
  trainerSlide,
  trainerStandAt,
  trainerThrowOrigin,
} from './battleBallMotion'
import { ARENA, cameraFit } from '../../engine/battle/arena'
import { battleNdc, CAMERA, PAIR_DIR, pairOffset, SLOT, viewDepth } from '../../engine/battle/shots'

describe('battle ball motion', () => {
  it('keeps the throw endpoints exact and raises the midpoint', () => {
    const from = trainerThrowOrigin('p1a')
    const to = [1, 1, -2] as const
    expect(throwArc(from, to, 0)).toEqual([...from])
    expect(throwArc(from, to, 1)).toEqual([...to])
    expect(throwArc(from, to, 0.5)[1]).toBeGreaterThan(2)
  })

  it('shakes only for the number of completed checks', () => {
    expect(ballShakeAngle(0.2, 3)).toBe(0)
    expect(Math.abs(ballShakeAngle(1.02, 3))).toBeGreaterThan(0.1)
    expect(ballShakeAngle(captureResolveAt(3), 3)).toBe(0)
  })

  it('seals the target in the ball and releases it only after a failed catch', () => {
    expect(captureBodyScale(CAPTURE_THROW_TIME, 2, false)).toBe(1)
    expect(captureBodyScale(CAPTURE_SEAL_TIME, 2, false)).toBe(0)
    expect(captureBodyScale(captureResolveAt(2) + 0.3, 2, false)).toBe(1)
    expect(captureBodyScale(captureResolveAt(4) + 3, 4, true)).toBe(0)
  })

  it('uses distinct official ball color families and falls back to a Poke Ball', () => {
    expect(ballPalette(1)).not.toEqual(ballPalette(4))
    expect(ballPalette(13).bottom).toBe('#16191a')
    expect(ballPalette(999)).toEqual(ballPalette(4))
  })
})

describe('짝으로 선 트레이너 (REPAIR §123)', () => {
  /** 카메라에서 본 시선 좌우 값 ÷ 깊이 — 화면 x에 비례한다 */
  const screenX = (p: readonly [number, number, number]): number =>
    ((p[0] - CAMERA.position[0]) * PAIR_DIR[0] + (p[2] - CAMERA.position[2]) * PAIR_DIR[2]) / viewDepth(p)

  it('원작처럼 제 포켓몬 발판과 같은 화면 x에 선다 — 원작에는 트레이너만의 좌표가 없다', () => {
    for (const paired of [false, true]) {
      for (const slot of ['p1a', 'p1b', 'p2a', 'p2b'] as const) {
        const side = slot.startsWith('p1') ? 'p1' : 'p2'
        const off = paired ? pairOffset(slot) : 0
        const pad = [SLOT[side].x + PAIR_DIR[0] * off, 0, SLOT[side].z + PAIR_DIR[2] * off] as const
        const stand = trainerStandAt(slot, paired)
        // 땅 위 반직선이라 수평 화면 x는 같다
        expect(screenX(stand)).toBeCloseTo(screenX(pad), 6)
        // 카메라가 내려다보므로 실제 화면 x는 조금 어긋난다 — 실측 최대 0.026 (편 b)
        const ndcPad = battleNdc(pad, 1.6)[0]
        const ndcStand = battleNdc([stand[0], 0, stand[2]], 1.6)[0]
        expect(Math.abs(ndcStand - ndcPad)).toBeLessThan(0.03)
      }
    }
  })

  it('상대는 BDSP 트레이너 깊이(−5.8), 우리는 발판보다 안쪽에 선다', () => {
    expect(trainerStandAt('p2a', false)[2]).toBe(-5.8)
    expect(trainerStandAt('p1a', false)[2]).toBeLessThan(SLOT.p1.z)
  })
})

describe('등장 장면의 트레이너 (트레이너전에 상대도 주인공도 화면에 안 서던 것)', () => {
  /** 등장 장면의 카메라 배율. 몸이 아직 안 서서 키가 0이다 (`BattleStage.useBattleCamera`) */
  const fits = (doubles: boolean): number[] => [
    ...new Set(ARENA.map((arena) => cameraFit(arena, 0) * (doubles ? 1.35 : 1))),
  ]
  /** 찍는 창 960×640 · 노트북 16:10 · 16:9 (모바일은 범위 밖) */
  const ASPECTS = [1.5, 1.6, 16 / 9]

  it('고정 카메라의 화면 안에 선다 — 발끝부터 머리끝까지, 제일 다가선 실내 무대에서도', () => {
    // 실내 무대(반지름 6)에서 카메라가 0.88까지 다가선다 — 그 값이 표에 있어야 이 시험이 뜻이 있다
    expect(Math.min(...fits(false))).toBeLessThan(0.9)
    for (const paired of [false, true]) {
      for (const slot of ['p1a', 'p1b', 'p2a', 'p2b'] as const) {
        if (!paired && slot.endsWith('b')) continue
        const [x, , z] = trainerStandAt(slot, paired)
        // 짝을 서는 판은 늘 더블이다 — 편이 있는 태그 배틀도, 상대가 둘인 판도
        for (const fit of fits(paired)) {
          for (const aspect of ASPECTS) {
            for (const y of [0, 1.65]) {
              const [nx, ny] = battleNdc([x, y, z], aspect, fit)
              expect(Math.abs(nx), `${slot} ${paired} ${fit} ${aspect}`).toBeLessThan(0.95)
              expect(ny, `${slot} ${paired} ${fit} ${aspect} y${y}`).toBeLessThan(0.97)
              expect(ny).toBeGreaterThan(-0.9)
            }
          }
        }
      }
    }
  })

  it('예전 자리(볼 출발점)는 화면 밖이다 — 물러난 뒤의 볼만 거기서 온다', () => {
    // 손으로 잰 지적값: 상대 깊이 9m에서 오른쪽 7.1m · 우리 깊이 2.3m에서 왼쪽 6.8m
    expect(battleNdc(trainerThrowOrigin('p2a'), 1.6)[0]).toBeGreaterThan(1)
    expect(battleNdc(trainerThrowOrigin('p1a'), 1.6)[0]).toBeLessThan(-1)
  })

  it('원작 걸음 그대로 미끄러져 나간다 — 프레임마다 5px, 그림이 40px 밖으로 나가면 지운다', () => {
    expect(TRAINER_SLIDE_SPEED).toBeCloseTo((5 / 128) * 60, 9)
    expect(TRAINER_GONE_AT).toBeCloseTo(168 / 128, 9)
    // 싱글 상대는 192px(NDC 0.5)에 서고 296px에서 지워진다 — 104px ÷ 5 = 20.8프레임
    const from = (192 - 128) / 128
    expect(trainerSlide(from, TRAINER_GONE_AT, 20 / 60).done).toBe(false)
    expect(trainerSlide(from, TRAINER_GONE_AT, 21 / 60)).toEqual({ at: TRAINER_GONE_AT, done: true })
    // 우리 쪽은 왼쪽으로 — 64px에서 −40px까지
    const mine = trainerSlide((64 - 128) / 128, -TRAINER_GONE_AT, 10 / 60)
    expect(mine.at).toBeCloseTo(-0.5 - (50 / 128), 9)
    // 다시 들어올 때는 거꾸로 가서 선 자리에 멈춘다 (`Task_SlideTrainerIn`)
    expect(trainerSlide(TRAINER_GONE_AT, from, 1)).toEqual({ at: from, done: true })
    expect(trainerSlide(from, TRAINER_GONE_AT, -1)).toEqual({ at: from, done: false })
  })

  it('한 쪽에 한 사람이면 둘째 마리도 그 사람이 던진다', () => {
    expect(throwerOf('p1b', false)).toBe('p1a')
    expect(throwerOf('p2b', false)).toBe('p2a')
    expect(throwerOf('p1b', true)).toBe('p1b')
  })
})

describe('앞 몸을 거두는가 (`RecallPokemon`)', () => {
  it('서 있던 다른 마리로 바뀔 때만 거둔다', () => {
    expect(recallsBody({ key: 'p1: 모부기', alive: true }, 'p1: 찌르꼬')).toBe(true)
    // 비는 자리도 거둔다 (밀려나는 기술)
    expect(recallsBody({ key: 'p1: 모부기', alive: true }, null)).toBe(true)
  })

  it('변신은 열쇠가 같아 안 거둔다 — 종만 바뀐다', () => {
    expect(recallsBody({ key: 'p2: 메타몽', alive: true }, 'p2: 메타몽')).toBe(false)
  })

  it('쓰러진 뒤의 교체와 첫 등판은 거두지 않는다', () => {
    expect(recallsBody({ key: 'p1: 모부기', alive: false }, 'p1: 찌르꼬')).toBe(false)
    expect(recallsBody({ key: null, alive: false }, 'p1: 찌르꼬')).toBe(false)
  })
})
