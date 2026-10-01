// 인트로 검증.
//
// 이 화면은 글이 전부다. 자리를 하나 틀리면 마박사가 엉뚱한 말을 하는데 **글자는
// 멀쩡히 나오므로** 눈으로는 넘어가기 쉽다. 그래서 뱅크 원문과 맞대 본다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fillMenuText, INTRO_TEXT, UI_BANK } from '../../data/uiText'
import {
  INFO_CHOICES, INFO_CONTROLS, infoLines, INTRO, introOutro, introReturn, nameRetryAt, OUTRO,
  OUTRO_FRAMES, outroLook, RIVAL_NAME_CHOICES, ROWAN_RETURN_FRAMES, rowanReturnLook, SHRINK_HEIGHTS,
} from './beats'
import { controlPages } from './controlText'
import { withData } from '../../data/romData.testkit'

describe('인트로 박자', () => {
  it('원작 상태 기계의 차례 그대로다', () => {
    // `rowan_intro_app.c`의 `RowanIntro_DisplayMessage` 호출 차례. 우리 인사만
    // 원작에 없고 맨 앞에 한 번 든다
    const kinds = INTRO.map((s) => s.kind)
    expect(kinds).toEqual([
      'ours', // 우리 인사 — 세계의 이름 · 만든 사람 · 배포 · 비영리 (`welcomeText`)
      'say', // HelloThere
      'say', // MyNameRowan
      'infoMenu', // 조작 · 모험 · 괜찮다
      'say', // WidelyInhabited
      'pokeBall', // HavePokeBall → 이어롭
      'say', // LiveAlongsidePokemon
      'say', // AboutYourself
      'gender',
      'name', // 주인공
      'say', // SoYoure — 라이벌이 선다
      'name', // 라이벌
      'rowanReturn', // 라이벌이 사라지고 마박사가 다시 선다 — 말이 없다
      'say', // EndDialogue — 마박사의 마지막 말
      'outro', // 마박사가 사라지고 주인공이 작아진다
      'done',
    ])
  })

  it('⚠️ 라이벌을 세우는 말이 라이벌 이름보다 먼저 온다', () => {
    // 이 줄이 없으면 용식이가 아무 소개 없이 툭 나타난다
    const soYoure = INTRO.findIndex((s) => s.kind === 'say' && s.line === INTRO_TEXT.soYoure)
    const rivalName = INTRO.findIndex((s) => s.kind === 'name' && s.who === 'rival')
    expect(soYoure).toBeGreaterThanOrEqual(0)
    expect(soYoure).toBeLessThan(rivalName)
  })

  it('⚠️ 라이벌 이름 뒤에 마박사의 마지막 말이 있다', () => {
    // 없으면 이름을 정하자마자 화면이 끊긴다 (`RI_STATE_DIALOGUE_END`)
    const rivalName = INTRO.findIndex((s) => s.kind === 'name' && s.who === 'rival')
    const end = INTRO.findIndex((s) => s.kind === 'say' && s.line === INTRO_TEXT.end)
    expect(end).toBeGreaterThan(rivalName)
    // 그리고 그것이 마지막 말이다 — 뒤에는 닫는 박자만 남는다
    expect(INTRO.at(-1)?.kind).toBe('done')
    expect(INTRO.at(-2)?.kind).toBe('outro')
    expect(INTRO.at(-3)).toEqual({ kind: 'say', line: INTRO_TEXT.end })
  })

  it('말줄 번호가 뱅크의 그 자리다', () => {
    const lines = INTRO.filter((s) => s.kind === 'say').map((s) => s.line)
    expect(lines).toEqual([
      INTRO_TEXT.hello, INTRO_TEXT.myName, INTRO_TEXT.widelyInhabited,
      INTRO_TEXT.liveAlongside, INTRO_TEXT.aboutYourself,
      INTRO_TEXT.soYoure, INTRO_TEXT.end,
    ])
  })

  it('⚠️ 마박사가 다시 선 뒤에 마지막 말을 한다', () => {
    // `RI_STATE_FADE_OUT_RIVAL` → … → `RI_STATE_DELAY_BEFORE_END_0` → `RI_STATE_DIALOGUE_END`.
    // 없으면 라이벌이 마박사로 한 프레임에 바뀌고 마지막 말이 바로 뜬다
    const rivalName = INTRO.findIndex((s) => s.kind === 'name' && s.who === 'rival')
    expect(INTRO[rivalName + 1]).toEqual({ kind: 'rowanReturn' })
    expect(INTRO[rivalName + 2]).toEqual({ kind: 'say', line: INTRO_TEXT.end })
  })

  it('이름 확인의 「아니오」는 주인공이면 성별부터, 라이벌이면 후보부터 다시 묻는다', () => {
    // `RI_STATE_NAME_CONFIRM_CHOICE_BOX` → `RI_STATE_GENDR_FADE_IN_AVATAR_PREP` ·
    // `RI_STATE_RIVAL_NAME_CONFIRM_CHOICE_BOX` → `RI_STATE_RIVAL_NAME_DIALOGUE`
    expect(INTRO[nameRetryAt('player')]).toEqual({ kind: 'gender' })
    expect(INTRO[nameRetryAt('rival')]).toEqual({ kind: 'name', who: 'rival' })
    // 성별 다음이 곧 주인공 이름이라, 성별을 다시 정하면 이름 자판으로 다시 온다
    expect(INTRO[nameRetryAt('player') + 1]).toEqual({ kind: 'name', who: 'player' })
  })

  it('이름을 묻는 순서가 주인공 먼저다', () => {
    const names = INTRO.filter((s) => s.kind === 'name').map((s) => s.who)
    expect(names).toEqual(['player', 'rival'])
  })

  it('되묻기 세 갈래가 저마다 다른 글을 준다', () => {
    expect(INFO_CHOICES).toHaveLength(3)
    // 조작 설명은 뱅크가 아니라 우리 키에서 온다 (`controlText`)
    expect(INFO_CHOICES[INFO_CONTROLS]?.value).toBe(INFO_CONTROLS)
    expect(infoLines(INFO_CONTROLS)).toEqual([])
    expect(controlPages('ko').length).toBeGreaterThan(0)
    expect(infoLines(1)).toEqual(INTRO_TEXT.adventure)
    // "괜찮다!"는 아무것도 안 듣고 넘어간다
    expect(infoLines(2)).toEqual([])
  })

  it('원작 조작 설명 넷은 한 줄도 안 쓴다', () => {
    // 2·3번은 십자키와 X·Y, 4·5번은 터치스크린 — 우리 화면에 그 넷이 다 없다.
    // 원작 글을 고쳐 쓰지 않고 통째로 뺀 뒤 우리 키로 다시 말한다
    expect(INTRO_TEXT.controlsSkipped).toEqual([2, 3, 4, 5])
    const used = [
      ...INTRO.flatMap((s) => (s.kind === 'say' ? [s.line] : [])),
      ...INFO_CHOICES.map((c) => c.line),
      ...infoLines(0), ...infoLines(1), ...infoLines(2),
    ]
    for (const skipped of INTRO_TEXT.controlsSkipped) {
      expect(used, `${String(skipped)}번을 쓰고 있다`).not.toContain(skipped)
    }
  })
})

describe('닫는 박자 (RI_STATE_FADE_OUT_ROWAN_END → RI_STATE_END)', () => {
  // 마디 끝 프레임. 원작 상태 차례로 더한다
  const avatarIn = OUTRO.layerFade + OUTRO.delay + OUTRO.load
  const shrinkAt = avatarIn + OUTRO.layerFade + OUTRO.delay
  const blackAt = shrinkAt + OUTRO.shrink

  it('마디 길이가 원작 함수를 부르는 횟수다', () => {
    // FadeBgLayer: INIT 1 + 16단 + 0을 본 1 + END 1 · Delay(30): 31 · 그림 넷 × 9 + 끝 1
    expect(OUTRO.layerFade).toBe(1 + 16 + 1 + 1)
    expect(OUTRO.delay).toBe(30 + 1)
    expect(OUTRO.shrink).toBe(4 * OUTRO.shrinkStep + 1)
    expect(OUTRO.shrinkStep).toBe(1 + 8)
    // 19 + 31 + 1 + 19 + 31 + 37 + 1 + 6 — 60프레임에 1초라 2.4초쯤이다
    expect(OUTRO_FRAMES).toBe(145)
  })

  it('마박사가 16단으로 사라지고 그 끝에 대사창이 지워진다', () => {
    expect(outroLook(0, 'boy').rowan).toBe(1)
    expect(outroLook(1, 'boy').rowan).toBe(15 / 16)
    expect(outroLook(16, 'boy').rowan).toBe(0)
    expect(outroLook(OUTRO.layerFade - 2, 'boy').box).toBe(true)
    expect(outroLook(OUTRO.layerFade - 1, 'boy').box).toBe(false)
  })

  it('빈 화면에서 기다린 뒤에야 주인공이 떠오른다', () => {
    // 마박사가 사라진 뒤 Delay(30)과 그림 얹기 동안 주인공은 아직 없다
    expect(outroLook(avatarIn - 1, 'girl').avatar).toBeNull()
    expect(outroLook(avatarIn - 1, 'girl').rowan).toBe(0)
    expect(outroLook(avatarIn, 'girl').avatar).toBe(0)
    expect(outroLook(avatarIn + 8, 'girl').avatar).toBe(0.5)
    expect(outroLook(avatarIn + 16, 'girl').avatar).toBe(1)
  })

  it('머문 뒤 9프레임마다 그림 하나씩 줄어든다', () => {
    const boy = SHRINK_HEIGHTS.boy
    expect(outroLook(shrinkAt - 1, 'boy').scale).toBe(1)
    // 첫 프레임에 바로 42번으로 간다 (`progressCounter++`가 먼저다)
    expect(outroLook(shrinkAt, 'boy').scale).toBeCloseTo(boy[1]! / boy[0]!)
    expect(outroLook(shrinkAt + 8, 'boy').scale).toBeCloseTo(boy[1]! / boy[0]!)
    expect(outroLook(shrinkAt + 9, 'boy').scale).toBeCloseTo(boy[2]! / boy[0]!)
    expect(outroLook(shrinkAt + 27, 'boy').scale).toBeCloseTo(boy[4]! / boy[0]!)
    // 끝 표지를 만나도 마지막 그림은 안 지운다 — 그 위로 검은 페이드가 덮인다
    expect(outroLook(OUTRO_FRAMES, 'boy').scale).toBeCloseTo(boy[4]! / boy[0]!)
  })

  it('남녀 그림이 저마다의 키로 준다', () => {
    expect(SHRINK_HEIGHTS.boy).toHaveLength(5)
    expect(SHRINK_HEIGHTS.girl).toHaveLength(5)
    for (const heights of [SHRINK_HEIGHTS.boy, SHRINK_HEIGHTS.girl]) {
      for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThan(heights[i - 1]!)
    }
    expect(outroLook(OUTRO_FRAMES, 'girl').scale).toBeCloseTo(24 / 116)
  })

  it('줄어든 뒤 6프레임에 검게 닫히고 그때 끝난다', () => {
    expect(outroLook(blackAt, 'boy').black).toBe(0)
    expect(outroLook(blackAt + 3, 'boy').black).toBe(0.5)
    expect(outroLook(blackAt + OUTRO.black, 'boy').black).toBe(1)
    expect(OUTRO_FRAMES).toBe(blackAt + OUTRO.end + OUTRO.black)
  })

  it('시계는 닫는 중이 아닐 때 −1이다', () => {
    expect(introOutro.frame).toBe(-1)
  })
})

describe('마박사가 다시 선다 (RI_STATE_FADE_OUT_RIVAL → RI_STATE_DELAY_BEFORE_END_0)', () => {
  /** 마박사가 떠오르기 시작하는 프레임 — 라이벌 페이드 아웃 19 + 그림 얹기 1 */
  const rowanIn = OUTRO.layerFade + OUTRO.load

  it('마디가 원작 함수를 부르는 횟수다', () => {
    // FadeBgLayer 19 + LoadTilemap 1 + FadeBgLayer 19 + Delay(30) 31 — 1.2초쯤이다
    expect(ROWAN_RETURN_FRAMES).toBe(19 + 1 + 19 + 31)
  })

  it('라이벌이 16단으로 사라지는 동안 마박사는 아직 없다', () => {
    expect(rowanReturnLook(0)).toEqual({ rival: 1, rowan: null })
    expect(rowanReturnLook(1).rival).toBe(15 / 16)
    expect(rowanReturnLook(16).rival).toBe(0)
    expect(rowanReturnLook(rowanIn - 1)).toEqual({ rival: 0, rowan: null })
  })

  it('그림을 얹은 다음 프레임부터 마박사가 16단으로 떠오르고 선 채로 쉰다', () => {
    expect(rowanReturnLook(rowanIn)).toEqual({ rival: 0, rowan: 0 })
    expect(rowanReturnLook(rowanIn + 8).rowan).toBe(0.5)
    expect(rowanReturnLook(rowanIn + 16).rowan).toBe(1)
    // 쉬는 30프레임 동안 그대로 서 있다
    expect(rowanReturnLook(ROWAN_RETURN_FRAMES - 1).rowan).toBe(1)
    expect(ROWAN_RETURN_FRAMES - (rowanIn + OUTRO.layerFade)).toBe(OUTRO.delay)
  })

  it('시계는 그 박자가 아닐 때 −1이다', () => {
    expect(introReturn.frame).toBe(-1)
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
