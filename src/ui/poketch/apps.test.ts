// 포켓치 앱의 규칙 (`apps.tsx`)
//
// 화면은 사람이 본다. 여기서는 원작 함수를 옮긴 자리만 잰다 — 상성체커의 고르기
// (`matchup_checker/main.c`), 하트 수(`InitAnimationSequence`), 아이콘을 액정 명암
// 넷으로 떨어뜨리는 규칙(`PoketchTask_MapToActivePaletteFromLuminance`), 직접 부르는
// 글 뱅크 번호.
import { describe, expect, it, vi } from 'vitest'
import { bankIndex } from '../../import/platinum/textBanks'

// ⚠️ 시험용 `@vanilla-extract/css` 대역(`tools/test/vanillaExtractStub.ts`)에
// `createVar`가 없다. 액정 명암 변수를 쓰는 `poketch.css.ts`가 그것을 부르므로
// 여기서 하나 덧댄다 — 값은 아무 시험도 안 본다
vi.mock('@vanilla-extract/css', async (importOriginal) => {
  let serial = 0
  return {
    ...await importOriginal<Record<string, unknown>>(),
    createVar: () => `var(--poketch-${String(++serial)})`,
  }
})
import {
  lcdShade, matchupHearts, matchupStart, matchupTurn, paintLcd, POKETCH_TEXT_BANK,
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
