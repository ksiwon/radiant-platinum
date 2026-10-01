// 포켓치 앱의 규칙 (`apps.tsx`)
//
// 화면은 사람이 본다. 여기서는 원작 함수를 옮긴 자리만 잰다 — 상성체커의 고르기
// (`matchup_checker/main.c`), 하트 수(`InitAnimationSequence`), 명령표의 프레임과
// 소리(`RunAnimationSequence`), 히스토리 칸 번호, 아이콘을 액정 명암 넷으로
// 떨어뜨리는 규칙(`PoketchTask_MapToActivePaletteFromLuminance`), 직접 부르는 글
// 뱅크와 효과음 번호.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import { bankIndex } from '../../import/platinum/textBanks'
import {
  historyCell, lcdShade, matchupCues, matchupHearts, matchupStart, matchupTurn, paintLcd,
  POKETCH_SE, POKETCH_TEXT_BANK,
} from './apps'

describe('상성체커 — 두 마리 고르기', () => {
  it('왼쪽 0 · 오른쪽 1에서 시작한다. 한 마리면 둘 다 0이다', () => {
    expect(matchupStart(6)).toEqual({ left: 0, right: 1 })
    expect(matchupStart(2)).toEqual({ left: 0, right: 1 })
    expect(matchupStart(1)).toEqual({ left: 0, right: 0 })
  })

  it('두 마리 이하면 바꿀 곳이 없다 — 원작 `UpdateLeftMon`이 FALSE를 낸다', () => {
    expect(matchupTurn({ left: 0, right: 1 }, 'left', 2)).toBeNull()
    expect(matchupTurn({ left: 0, right: 0 }, 'right', 1)).toBeNull()
  })

  it('다음 마리로 돌다가 맞은편이 고른 마리는 건너뛴다', () => {
    // 왼쪽 0 → 1은 오른쪽이 쥐고 있으니 2
    expect(matchupTurn({ left: 0, right: 1 }, 'left', 3)).toEqual({ left: 2, right: 1 })
    // 끝에서 0으로 돌아간다
    expect(matchupTurn({ left: 2, right: 1 }, 'left', 3)).toEqual({ left: 0, right: 1 })
    // 오른쪽 1 → 2 → (0은 왼쪽 것) → 1
    expect(matchupTurn({ left: 0, right: 1 }, 'right', 3)).toEqual({ left: 0, right: 2 })
    expect(matchupTurn({ left: 0, right: 2 }, 'right', 3)).toEqual({ left: 0, right: 1 })
  })

  it('몇 번을 돌아도 두 자리가 겹치지 않는다', () => {
    let pick = matchupStart(6)
    for (let i = 0; i < 40; i++) {
      pick = matchupTurn(pick, i % 3 === 0 ? 'right' : 'left', 6)!
      expect(pick.left).not.toBe(pick.right)
    }
  })

  it('궁합 단계 0(최고)이 하트 셋, 3(안 맞음)이 하트 없음이다', () => {
    expect([0, 1, 2, 3].map(matchupHearts)).toEqual([3, 2, 1, 0])
  })
})

describe('액정 아이콘 — 명암 넷', () => {
  it('검정은 글씨, 흰색은 바탕이다', () => {
    expect(lcdShade(0, 0, 0)).toBe(3)
    expect(lcdShade(255, 255, 255)).toBe(0)
  })

  it('5비트 회색값을 3비트 밀어 자른다 (299·587·114)', () => {
    // 5비트 16 → 회색 16 → 2 → 중간(1)
    expect(lcdShade(128, 128, 128)).toBe(1)
    // 5비트 8 → 1 → 어둠(2)
    expect(lcdShade(64, 64, 64)).toBe(2)
    // 5비트 7 → 0 → 글씨(3). 한 칸 차이로 단계가 갈린다
    expect(lcdShade(56, 56, 56)).toBe(3)
    // 초록이 제일 무겁다: 순수 초록 31 → 18 → 2 · 순수 파랑 31 → 3 → 0
    expect(lcdShade(0, 255, 0)).toBe(1)
    expect(lcdShade(0, 0, 255)).toBe(3)
  })

  it('불투명한 점만 명암 색으로 칠하고 투명한 점은 그대로 둔다', () => {
    const px = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
      12, 34, 56, 0,
    ])
    paintLcd(px, ['#c0d0a0', '#90a070', '#607040', '#203010'])
    expect([...px.slice(0, 4)]).toEqual([0xc0, 0xd0, 0xa0, 255])
    expect([...px.slice(4, 8)]).toEqual([0x20, 0x30, 0x10, 255])
    expect(px[11]).toBe(0)
  })
})

describe('글 뱅크 번호', () => {
  it('미국 롬 이름 순서에서 계산한 자리와 같다', () => {
    expect(POKETCH_TEXT_BANK.history).toBe(bankIndex('poketch_pokemon_history', 'us'))
    expect(POKETCH_TEXT_BANK.linkSearcher).toBe(bankIndex('poketch_link_searcher', 'us'))
  })
})

describe('상성체커 — 명령표의 프레임과 소리', () => {
  const { HEART, SPURN, BEST } = POKETCH_SE

  it('하트 하나마다 16프레임 다가간 그 프레임에 012가 난다', () => {
    expect(matchupCues(2)).toEqual({ sounds: [{ frame: 16, seq: HEART }], flip: null, blink: null, end: 16 })
    expect(matchupCues(1).sounds).toEqual([{ frame: 16, seq: HEART }, { frame: 32, seq: HEART }])
  })

  it('안 맞으면 16 다가가고 17 쉰 뒤 등을 돌리며 013, 16 물러나 49에 끝난다', () => {
    // `ANIM_COMMAND_WAIT`는 타이머가 0이 된 **다음** 프레임에 넘어간다 — 16이 아니라 17
    expect(matchupCues(3)).toEqual({ sounds: [{ frame: 33, seq: SPURN }], flip: 33, blink: null, end: 49 })
  })

  it('최고면 012 셋 · 17 쉬고 014와 깜빡임 · 다시 17 쉬고 끝난다', () => {
    expect(matchupCues(0)).toEqual({
      sounds: [
        { frame: 16, seq: HEART }, { frame: 32, seq: HEART }, { frame: 48, seq: HEART },
        { frame: 65, seq: BEST },
      ],
      flip: null,
      blink: 65,
      end: 82,
    })
  })
})

describe('포켓몬히스토리 — 칸 번호', () => {
  it('넷씩 세 줄, 왼쪽 위가 0이다', () => {
    expect(historyCell(0, 0)).toBe(0)
    expect(historyCell(3, 0)).toBe(3)
    expect(historyCell(0, 1)).toBe(4)
    expect(historyCell(3, 2)).toBe(11)
  })

  it('양끝에서 감긴다', () => {
    expect(historyCell(-1, 0)).toBe(3)
    expect(historyCell(4, 0)).toBe(0)
    expect(historyCell(0, -1)).toBe(8)
    expect(historyCell(0, 3)).toBe(0)
  })
})

const maybe = withData('sound/index.json')

maybe('효과음 번호', () => {
  it('구운 SDAT 목차에서 그 자리가 원작 이름이다', () => {
    const songs = (JSON.parse(readFileSync(resolve(DATA, 'sound/index.json'), 'utf8')) as {
      songs: ({ name: string | null } | null)[]
    }).songs
    expect(songs[POKETCH_SE.BUTTON]?.name).toBe('SEQ_SE_DP_POKETCH_010')
    expect(songs[POKETCH_SE.HEART]?.name).toBe('SEQ_SE_DP_POKETCH_012')
    expect(songs[POKETCH_SE.SPURN]?.name).toBe('SEQ_SE_DP_POKETCH_013')
    expect(songs[POKETCH_SE.BEST]?.name).toBe('SEQ_SE_DP_POKETCH_014')
    expect(songs[POKETCH_SE.BEEP]?.name).toBe('SEQ_SE_DP_BEEP')
  })
})
