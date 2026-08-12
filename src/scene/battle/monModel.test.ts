// 배틀 모델 목록 (DATA.md §2.17.2 · PARITY §3.4)
//
// 모델 자체는 여기서 못 연다(glb 557개, 400MB 남짓). 여기서 재는 것은 **목록이
// 무엇을 담고 있는가**다 — 폼 모델을 안 구우면 로토무 다섯 가전이 전부 같은
// 모습으로 서고, 그건 화면을 열기 전까지 아무 데서도 안 걸린다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { withData } from '../../data/romData.testkit'
import { posedHeight, type MonIndex } from './monModel'
import { FORM_COUNT } from '../../engine/pokemon/form'

const DATA = resolve(__dirname, '../../../public')
const maybe = withData('../models/pokemon/index.json')


maybe('배틀 모델 목록', () => {
  const idx = JSON.parse(
    readFileSync(resolve(DATA, 'models/pokemon/index.json'), 'utf8'),
  ) as MonIndex

  it('493종이 다 있다', () => {
    const base = Object.keys(idx.pokemon).filter((k) => !k.includes('-')).map(Number)
    expect(base).toHaveLength(493)
    expect(Math.min(...base)).toBe(1)
    expect(Math.max(...base)).toBe(493)
  })

  it('폼도 다 있다 — 종마다 폼 수만큼', () => {
    const missing: string[] = []
    for (const [species, forms] of FORM_COUNT) {
      // 알(494)은 배틀에 안 나온다
      if (!idx.pokemon[String(species)]) continue
      for (let form = 1; form < forms; form++) {
        const key = `${String(species)}-${String(form)}`
        if (!idx.pokemon[key]) missing.push(key)
      }
    }
    expect(missing).toEqual([])
  })

  /**
   * ⚠️ **폼 모델이 기본형 파일을 가리키면 안 된다.** 번들을 못 열었을 때
   * 조용히 기본형으로 떨어지면 목록만 보고는 구별이 안 된다 — 파일 이름이
   * 다른지로 잰다
   */
  it('폼마다 제 파일이다', () => {
    for (const key of Object.keys(idx.pokemon).filter((k) => k.includes('-'))) {
      expect(idx.pokemon[key]!.file, key).toBe(`${key}.glb`)
    }
  })

  /**
   * ⚠️ **폼끼리도 키가 다르다.** 원작 도감은 로토무 여섯을 다 0.3m라고 적지만
   * (크기 표를 종 번호로만 읽는다 — DATA §2.5) BDSP 모델은 가전을 실제 물건
   * 크기로 만들어 두었다. 오븐이 0.59m고 세탁기가 0.97m다. **그 차이를 눌러
   * 맞추지 않는다** — 무대에 서는 크기는 모델이 임자고, 원작 수치는 저울질과
   * 풀묶기가 본다
   */
  it('폼마다 화면에 서는 크기가 다르다', () => {
    const posed = (k: string) => posedHeight(idx.pokemon[k]!)
    // 로토무 오븐 < 세탁기
    expect(posed('479-1')).toBeLessThan(posed('479-2'))
    // 기라티나 오리진이 어나더보다 길다
    expect(posed('487-1')).toBeGreaterThan(posed('487'))
    // 아르세우스는 열여덟 판이 다 같은 몸이다 — 색만 다르다
    expect(posed('493-10')).toBeCloseTo(posed('493'), 2)
  })
})
