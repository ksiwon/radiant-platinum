// 박자 상수(`captureTiming`)가 구운 BDSP 시퀀스와 같은지 — 무대가 트는 계획(`fx/ballPlans`)을 같은 규칙으로 다시 펴서 맞대 본다.
// 시퀀스 · 규칙 · 상수 중 하나만 바뀌면 여기서 붉어진다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import { CAPTURE_SEQ_FRAMES, captureDuration, captureResolveAt } from './captureTiming'
import {
  capturePlan, faintSeqName, introFrame, returnPlan, sendOutPlan, sendOutSeqName, vanishFrame, type BallMeta,
} from './fx/ballPlans'
import { cameraEnd, type SeqData } from './fx/sequence'

const maybe = withData('fx/index.json', 'fx/seq/ee101.json', 'fx/seq/ee620.json')

const seq = (name: string): SeqData => JSON.parse(readFileSync(resolve(DATA, 'fx/seq', `${name}.json`), 'utf8')) as SeqData

maybe('볼 연출 박자 = BDSP 시퀀스', () => {
  const meta = (JSON.parse(readFileSync(resolve(DATA, 'fx/index.json'), 'utf8')) as { ballModel: BallMeta }).ballModel
  const seqs: Record<string, SeqData> = {}
  for (const n of ['ee101', 'ee102', 'ee103', 'ee104', 'ee105', 'ee106', 'ee107', 'ee108', 'ee109']) seqs[n] = seq(n)

  it('포획 — 흔들림 0~3번 · 잡힘의 결과 글 · 끝', () => {
    for (const [shakes, caught] of [[0, false], [1, false], [2, false], [3, false], [4, true]] as const) {
      const c = capturePlan(seqs, { ball: 4, shakes, caught, meta })!
      expect(captureResolveAt(shakes, caught) * 30).toBeCloseTo(c.messageAt, 2)
      if (!caught) expect(captureDuration(shakes, caught) * 30).toBeCloseTo(c.length, 2)
    }
    const once = capturePlan(seqs, { ball: 4, shakes: 0, caught: false, meta })!
    expect(once.resultAt).toBeCloseTo(CAPTURE_SEQ_FRAMES.THROW, 2)
  })

  it('내보내기 — 두 쪽 다 몸이 27프레임에 나타난다', () => {
    for (const side of ['p1', 'p2'] as const) {
      const plan = sendOutPlan(seq(sendOutSeqName(side)), { side, ball: 4, moveType: 0, doubles: false, meta })
      expect(introFrame(plan)).toBe(CAPTURE_SEQ_FRAMES.SEND_OUT_INTRO)
    }
  })

  it('거두기 · 기절 — 사라지는 프레임 · 카메라 끝', () => {
    expect(vanishFrame(returnPlan(seq('ee610'), { mine: true, camera: false }))).toBe(CAPTURE_SEQ_FRAMES.RECALL_VANISH)
    for (const wild of [false, true]) {
      const plan = returnPlan(seq(faintSeqName(wild)), { mine: false, camera: true })
      const want = CAPTURE_SEQ_FRAMES.FAINT[wild ? 'wild' : 'trainer']
      expect(vanishFrame(plan)).toBe(want.vanish)
      expect(cameraEnd(plan)).toBe(want.camera)
    }
  })
})
