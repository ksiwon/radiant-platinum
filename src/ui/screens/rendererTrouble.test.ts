// 그래픽 오류 창의 글 (`RendererTrouble.tsx`의 `troubleView`)
//
// 창이 우리 문장을 「브라우저가 준 말」로 적었고(시간 초과 · 「3D 무대: …」),
// 렌더러 칸에 압축된 클래스 이름(`xG`)이 찍혔고, init 실패에서 할 일이 없어
// 「다시 세우기」와 타이틀 사이를 맴돌았다. 여기서는 그 셋을 글로 잰다
import { describe, expect, it } from 'vitest'
import { RECOVERY_TIMEOUT_MS } from '../../state/rendererStore'
import { troubleView } from './RendererTrouble'

const base = { reason: null, summary: null, api: null, backend: null } as const

describe('원문 칸의 이름', () => {
  it('장치 손실은 브라우저가 준 말이라 「브라우저 메시지」다', () => {
    const v = troubleView({ ...base, fault: 'lost', api: 'WebGPU', backend: 'WebGPU', reason: 'Device was destroyed.' })
    expect(v.seen).toEqual([
      ['그래픽 API', 'WebGPU'],
      ['렌더러', 'WebGPU'],
      ['브라우저 메시지', 'Device was destroyed.'],
    ])
  })

  it('init 실패는 예외라 「오류 메시지」다 — 원문을 다듬지 않는다', () => {
    const v = troubleView({ ...base, fault: 'init', reason: 'No available adapters.' })
    expect(v.seen).toEqual([['오류 메시지', 'No available adapters.']])
  })

  it('시간 초과는 원문 칸이 아니라 제 이름으로, 합니다체로 적는다', () => {
    const v = troubleView({ ...base, fault: 'timeout', backend: 'WebGL' })
    const secs = String(Math.round(RECOVERY_TIMEOUT_MS / 1000))
    expect(v.seen).toEqual([
      ['렌더러', 'WebGL'],
      ['시간 초과', `${secs}초 안에 첫 화면이 나오지 않았습니다`],
    ])
    expect(v.seen.some(([label]) => label.includes('메시지'))).toBe(false)
  })

  it('씬 오류는 우리 한 줄을 먼저 보이고 원문은 접는다', () => {
    const v = troubleView({ ...base, fault: 'scene', summary: '3D 무대에서 오류가 났습니다', reason: 'boom' })
    expect(v.summary).toBe('3D 무대에서 오류가 났습니다')
    expect(v.folded).toBe('boom')
    expect(v.seen).toEqual([])
    // 원문 앞에 우리 말을 잇지 않는다 (지난날의 「3D 무대: boom」)
    expect(v.folded).not.toContain('3D 무대')
  })

  it('한 줄 없이 온 씬 오류(프레임 콜백)는 원문을 펼쳐 「오류 메시지」로 적는다', () => {
    const v = troubleView({ ...base, fault: 'scene', reason: 'render 예외' })
    expect(v.folded).toBeNull()
    expect(v.seen).toEqual([['오류 메시지', 'render 예외']])
  })

  it('빈 원문은 칸을 안 그린다 — 빈 값도 하나의 단정이다', () => {
    expect(troubleView({ ...base, fault: 'lost', reason: '' }).seen).toEqual([])
  })
})

describe('다음에 해 볼 것', () => {
  it('까닭마다 할 일이 있다', () => {
    for (const fault of ['init', 'lost', 'scene', 'timeout'] as const) {
      expect(troubleView({ ...base, fault }).next.length).toBeGreaterThan(0)
    }
  })

  it('init은 하드웨어 가속을 켜는 자리를 주소로 적는다', () => {
    const next = troubleView({ ...base, fault: 'init' }).next.join('\n')
    expect(next).toContain('chrome://settings/system')
    expect(next).toContain('edge://settings/system')
    expect(next).toContain('드라이버')
  })

  it('씬 오류는 타이틀 단추 이름을 글자 그대로 가리킨다', () => {
    // `TitleScreen`의 label과 같아야 사람이 찾는다
    expect(troubleView({ ...base, fault: 'scene' }).next.join('\n')).toContain('「어긋난 에셋 다시 만들기」')
  })
})

describe('나가는 단추', () => {
  it('init에서는 돌아갈 리포트가 없으므로 「타이틀로」다', () => {
    expect(troubleView({ ...base, fault: 'init' }).leave).toBe('타이틀로')
  })

  it('그 밖에서는 「마지막 리포트로 돌아가기」다', () => {
    for (const fault of ['lost', 'scene', 'timeout'] as const) {
      expect(troubleView({ ...base, fault }).leave).toBe('마지막 리포트로 돌아가기')
    }
  })
})

describe('복사할 글', () => {
  it('제목 · 한 줄 · 관찰 · 원문을 한 벌로 담는다', () => {
    const v = troubleView({ ...base, fault: 'scene', summary: '씬에서 오류가 났습니다', reason: 'boom' })
    expect(v.copy).toBe('화면을 그리다 멈췄습니다\n씬에서 오류가 났습니다\n오류 원문: boom')
  })
})
