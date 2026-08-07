// 몸 색이 롬 데이터와 맞는가.
//
// 무대의 임시 도형 색이라 "틀려도 안 죽는" 자리처럼 보이지만, 색 번호를 잘못
// 읽으면 화면 전체가 조용히 어긋난다 — 그리고 자리표시자일수록 눈으로는
// 안 잡힌다. 원작이 정해 둔 열 가지 색을 대조로 고정한다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BODY_COLORS, bodyColor } from './bodyColor'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('species.json')

describe('몸 색 표', () => {
  it('4세대 색 분류 열 가지다', () => {
    expect(BODY_COLORS).toHaveLength(10)
  })

  it('표 밖은 회색으로 떨어진다', () => {
    // 색 번호를 못 읽었을 때 화면이 빈칸이 되면 안 된다
    expect(bodyColor(-1)).toBe(BODY_COLORS[7])
    expect(bodyColor(10)).toBe(BODY_COLORS[7])
    expect(bodyColor(99)).toBe(BODY_COLORS[7])
  })
})

maybe('롬 대조', () => {
  const species = JSON.parse(readFileSync(resolve(DATA, 'species.json'), 'utf8'))
    .species as { id: number; color: number }[]
  const byId = new Map(species.map((s) => [s.id, s]))
  const colorOf = (id: number) => byId.get(id)!.color

  it('원작이 정한 색과 번호가 맞는다', () => {
    // 눈으로 확인 가능한 여덟 종. 하나라도 어긋나면 +25 오프셋이 밀린 것이다
    expect(colorOf(387), '모부기 초록').toBe(3)
    expect(colorOf(393), '팽도리 파랑').toBe(1)
    expect(colorOf(25), '피카츄 노랑').toBe(2)
    expect(colorOf(94), '팬텀 보라').toBe(6)
    expect(colorOf(143), '잠만보 검정').toBe(4)
    expect(colorOf(396), '찌르꼬 갈색').toBe(5)
    expect(colorOf(390), '불꽃숭이 갈색').toBe(5)
    expect(colorOf(19), '꼬렛 보라').toBe(6)
  })

  it('색 번호 열 가지가 508종을 거의 다 덮는다', () => {
    // 10을 쓰는 두 종은 데이터가 빈 자리다. 그 밖의 값이 나오면 필드가 틀렸다
    const outside = species.filter((s) => s.color < 0 || s.color > 10)
    expect(outside, `범위 밖 ${outside.length}종`).toHaveLength(0)
    expect(species.filter((s) => s.color === 10)).toHaveLength(2)
  })
})
