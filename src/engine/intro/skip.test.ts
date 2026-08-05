// 인트로 건너뛰기 검증.
//
// 시험용 손잡이라도 **화면에 뜨는 이름은 진짜여야 한다.** 우리가 아무 글자나
// 박으면 원작에 없는 이름이 게임 안을 돌아다니고, 나중에 그것이 어디서 왔는지
// 아무도 모른다. 그래서 롬 뱅크에서 온 값인지 여기서 못 박는다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GENERIC_NAMES_BANK, namesOf } from '../../data/genericNames'
import { UI_BANK } from '../../data/uiText'
import { RIVAL_NAME_CHOICES } from './beats'
import { chooseFrom } from './skip'

const DIR = resolve(__dirname, '../../../public/data/dialogue/ko')
const files = [`${String(GENERIC_NAMES_BANK)}.json`, `${String(UI_BANK.intro)}.json`]
  .map((f) => resolve(DIR, f))
const maybe = files.every(existsSync) ? describe : describe.skip

maybe('건너뛰기가 고르는 값', () => {
  const [generic, intro] = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as string[])
  const bank = { generic: generic ?? [], intro: intro ?? [] }

  it('두 번 불러도 같은 값이다', () => {
    expect(chooseFrom(bank.generic, bank.intro)).toEqual(chooseFrom(bank.generic, bank.intro))
  })

  it('주인공 이름이 롬의 제안 목록 첫 번째다', () => {
    const suggested = namesOf(bank.generic, 'playerMale')
    expect(chooseFrom(bank.generic, bank.intro).name).toBe(suggested[0])
  })

  it('라이벌 이름이 마박사가 내미는 첫 후보다', () => {
    const first = RIVAL_NAME_CHOICES[0]
    expect(first).toBeDefined()
    expect(chooseFrom(bank.generic, bank.intro).rivalName).toBe(bank.intro[first as number])
  })

  it('빈 이름이나 제어 부호를 내보내지 않는다', () => {
    const choice = chooseFrom(bank.generic, bank.intro)
    for (const name of [choice.name, choice.rivalName]) {
      expect(name).not.toBe('')
      // `{STRVAR…}`나 `\r`가 섞여 나오면 이름표가 아니라 대사를 집은 것이다
      expect(name).not.toMatch(/[{}\r\f\n]/)
    }
    expect(choice.gender).toBe('boy')
  })
})
