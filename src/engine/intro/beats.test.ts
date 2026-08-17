// 인트로 검증.
//
// 이 화면은 글이 전부다. 자리를 하나 틀리면 마박사가 엉뚱한 말을 하는데 **글자는
// 멀쩡히 나오므로** 눈으로는 넘어가기 쉽다. 그래서 뱅크 원문과 맞대 본다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fillMenuText, INTRO_TEXT, UI_BANK } from '../../data/uiText'
import { INFO_CHOICES, infoLines, INTRO, RIVAL_NAME_CHOICES } from './beats'
import { withData } from '../../data/romData.testkit'

describe('인트로 박자', () => {
  it('되묻는 자리와 이름 짓기가 원작 순서로 들어 있다', () => {
    const kinds = INTRO.map((s) => s.kind)
    expect(kinds).toEqual([
      'ours', // 우리 인사 — 이 세계가 무엇이고 누가 만들었는지 (`welcomeText`)
      'say', 'say', // 흐음!! 잘 왔다 / 내 이름은 마박사
      'infoMenu',
      'say', // 이 세계에는 포켓몬스터…
      'pokeBall',
      'say', // 우리 인간은 포켓몬과 사이좋게…
      'say', // 이제 슬슬 자네에 대해…
      'gender',
      'name', // 주인공
      'say', // 흐음… 라고 하는가! 이 소년은 자네의 친구였지?
      'name', // 라이벌
      'say', // 이제부터 너만의 이야기가 시작된다!
      'done',
    ])
  })

  it('이름을 묻는 순서가 주인공 먼저다', () => {
    const names = INTRO.filter((s) => s.kind === 'name').map((s) => s.who)
    expect(names).toEqual(['player', 'rival'])
  })

  it('되묻기 세 갈래가 저마다 다른 글을 준다', () => {
    expect(INFO_CHOICES).toHaveLength(3)
    expect(infoLines(0)).toEqual(INTRO_TEXT.controls)
    expect(infoLines(1)).toEqual(INTRO_TEXT.adventure)
    // "괜찮다!"는 아무것도 안 듣고 넘어간다
    expect(infoLines(2)).toEqual([])
  })

  it('터치스크린 설명은 안 쓴다', () => {
    // DS 아래 화면 이야기라 우리에게 해당이 없다. 원작 글을 고쳐 쓰지 않고 뺀다
    for (const skipped of INTRO_TEXT.controlsSkipped) {
      expect(INTRO_TEXT.controls).not.toContain(skipped)
    }
  })
})

const DATA = resolve(__dirname, '../../../public/data/dialogue/ko')
const FILE = resolve(DATA, `${String(UI_BANK.intro)}.json`)
const maybe = withData(`dialogue/ko/${String(UI_BANK.intro)}.json`)

maybe('인트로 글이 제자리에 있다', () => {
  const bank = JSON.parse(readFileSync(FILE, 'utf8')) as string[]
  const at = (i: number): string => bank[i] ?? ''

  it('뱅크가 45줄이다', () => {
    expect(bank).toHaveLength(45)
  })

  it('마박사가 처음 하는 말이 맞다', () => {
    expect(at(INTRO_TEXT.hello)).toContain('포켓몬스터의 세계에 온 것을')
    expect(at(INTRO_TEXT.myName)).toContain('내 이름은 마박사')
  })

  it('되묻기 세 갈래의 글이 맞다', () => {
    expect(INFO_CHOICES.map((c) => at(c.line))).toEqual(['조작 방법이란?', '모험이란?', '괜찮다!'])
  })

  it('성별과 이름을 묻는 순서가 맞다', () => {
    expect(at(INTRO_TEXT.aboutYourself)).toContain('자네에 대해 알아보도록 하지')
    expect(at(INTRO_TEXT.genderAsk)).toContain('남자인가')
    expect(at(INTRO_TEXT.nameAsk)).toContain('자네의 이름은')
    expect(at(INTRO_TEXT.rivalNameAsk)).toContain('그의 이름도')
  })

  it('이름이 들어가는 줄은 칸을 채워야 글이 된다', () => {
    // 25·26은 주인공(0번 칸), 29는 라이벌(1번 칸)이다. 조사 6번이 붙는다
    expect(at(INTRO_TEXT.confirmNameFemale)).toMatch(/^\{STRVAR_1 3, 0, 6\}/)
    expect(at(INTRO_TEXT.confirmRivalName)).toMatch(/^\{STRVAR_1 3, 1, 6\}/)
    expect(fillMenuText(at(INTRO_TEXT.confirmNameFemale), ['빛나', '진철'])).toBe('빛나로구나?\r')
    expect(fillMenuText(at(INTRO_TEXT.confirmRivalName), ['빛나', '진철']))
      .toBe('진철이로군\n이 이름이 맞는가?\r')
  })

  it('마지막 말이 주인공 이름을 부른다', () => {
    expect(fillMenuText(at(INTRO_TEXT.end), ['빛나', '진철'])).toMatch(/^빛나!!/)
  })

  it('라이벌 이름 후보가 여덟이고 전부 글자다', () => {
    expect(RIVAL_NAME_CHOICES).toHaveLength(8)
    for (const i of RIVAL_NAME_CHOICES) {
      expect(at(i)).not.toBe('')
      // 후보는 이름이라 제어 부호가 없어야 한다
      expect(at(i)).not.toContain('{')
    }
    expect(at(INTRO_TEXT.rivalChoiceOwn)).toBe('스스로 결정한다!')
  })
})
