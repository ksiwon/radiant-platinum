// 화면 꾸러미가 쓰는 공용 API의 **겉모양** (SYSTEM §2) — 이름이 사라지거나 모양이 바뀌면 여기서 선다.
//
// 공용 파일은 P0a만 고친다. 화면 꾸러미(P1~P19)가 이 이름을 불러 쓰므로, P0a가 조용히 이름을 바꾸면 스무
// 꾸러미가 같이 깨진다. 시험이 그 겉모양을 소비자로 서서 잠근다 (`pnpm exports:check`도 시험을 소비자로 센다).
import { describe, expect, it } from 'vitest'
import type { BoxWallpapers, ItemIcons } from '../../data/schema'
import { sheetSize } from '../../data/spriteSheet'
import { bagArtAt, bagSheet, pocketIconAt, pocketSheet } from '../menu/bagArt'
import { itemIconAt, itemSheet } from '../menu/itemIcon'
import type { MenuIconKey } from '../menu/menuIcon'
import { wallSheet, wallThumb } from '../menu/pokeIcon'
import * as chrome from '../menu/menuChrome.css'
import type { HoleRect } from '../menu/MenuScreen'
import { BATTLE_LINE } from '../battle/battleScreen.css'
import * as window from '../theme/window.css'
import { frames, HUD, ICON, LINE, NIB, PIXEL, RAIL, TIME } from '../theme/scale'
import type { BadgeSet } from './BadgeRail'
import type { ChoiceItem } from './ChoiceMenu'
import type { HopStyle } from './iconHop'
import type { KeyPart } from './KeyHints'
import type { LearnFlowInput, LearnStage, PickResult } from './learnFlow'
import type { MonDetailData, MonDetailPart } from './MonDetail'
import type { MonViewportProps } from './MonViewport'
import type { MoveCol } from './MoveLine'
import type { PixelCell } from './pixelSprite'
import type { PopPlacement } from './usePopPlacement'
import { CLASS_LINE, type MoveCategory } from './TypeBadge'
import { VALUE_CELL } from './ValueStrip'

describe('숫자 상수 (scale.ts §1.5)', () => {
  it('SYSTEM이 정한 값이다', () => {
    expect(LINE).toMatchObject({ row: 32, rowTall: 44, dock: 26 })
    expect(ICON.cell).toBe(32)
    expect(PIXEL).toEqual({ x1: 1, x2: 2, x3: 3, x4: 4 })
    expect(RAIL.width).toBe(264)
    expect(NIB).toBe(8)
    expect(HUD).toEqual({
      edge: 32, bottom: 24, cmdHeight: 264, plateFoe: 280, plateMine: 312, plateDouble: 288, tray: 28, inward: 12,
    })
    expect(TIME).toMatchObject({ close: '0.08s', slide: '0.10s', page: '0.14s' })
  })

  it('frames(n)은 n/60초다', () => {
    expect(frames(60)).toBe('1s')
    expect(frames(6)).toBe('0.1s')
    expect(frames(16)).toBe('0.2667s')
  })

  it('명령 구역 264 안에 든다 — 뿌리 96 + 8 + 48 그리고 기술 단 56×4 + 6×3 + 22', () => {
    expect(96 + 8 + 48).toBeLessThanOrEqual(HUD.cmdHeight)
    expect(56 * 4 + 6 * 3 + 22).toBeLessThanOrEqual(HUD.cmdHeight)
    expect(48 * 5 + 6 * 4).toBe(HUD.cmdHeight)
  })
})

describe('처방 조각 (window.css.ts §2.1)', () => {
  it('이름이 있다', () => {
    for (const name of ['pickBand', 'pickHalo', 'pickEdgeOnly', 'popover', 'popoverSide', 'scrimSide', 'dockIn',
      'fadeOut', 'riseIn', 'PICKED', 'POPOVER', 'TYPE_PLATE', 'EXP_VARS', 'KEYCAP', 'KEYCAP_DARK', 'HOLE_MASK']) {
      expect(window, name).toHaveProperty(name)
    }
  })

  it('띠는 세로(y)와 가로(x) 둘이다', () => {
    expect(Object.keys(window.pickBand).sort()).toEqual(['x', 'y'])
  })

  it('꼭지는 네 방향이다', () => {
    expect(Object.keys(window.popoverSide).sort()).toEqual(['bottom', 'left', 'right', 'top'])
  })

  it('뜨는 창은 작은 창의 살갗이다', () => {
    expect(window.POPOVER).toMatchObject({ borderRadius: window.WINDOW_SMALL.borderRadius, position: 'absolute' })
  })

  it('키캡은 높이 18 · 최소 폭 18이고 어두운 판 변형이 다르다', () => {
    expect(window.KEYCAP).toMatchObject({ minWidth: 18, height: 18 })
    expect(window.KEYCAP_DARK.color).not.toBe(window.KEYCAP.color)
    expect(window.KEYCAP_DARK.background).not.toBe(window.KEYCAP.background)
  })

  it('구멍 마스크는 두 겹을 exclude로 겹친다', () => {
    expect(window.HOLE_MASK.maskComposite).toBe('exclude')
    expect(window.HOLE_MASK.maskImage.split('),').length).toBe(2)
    expect(window.HOLE_MASK.maskPosition).toContain('--hole-x')
  })

  it('9° 판은 배틀에만 쓰는 기울기다', () => {
    expect(window.TYPE_PLATE.transform).toBe('skewX(-9deg)')
  })

  it('경험치 막대는 HP 막대와 같은 두 변수를 쓴다', () => {
    expect(Object.keys(window.EXP_VARS).sort()).toEqual(['--body', '--lit'])
  })

  it('배틀 글창 처방은 Galmuri11 20이다 (BATTLE_LINE)', () => {
    expect(BATTLE_LINE.fontSize).toBe(20)
    expect(BATTLE_LINE.whiteSpace).toBe('pre-line')
  })
})

describe('메뉴 틀 조각 (menuChrome.css.ts)', () => {
  it('새 이름이 있다', () => {
    for (const name of ['centerWindow', 'screenHole', 'overlayHole', 'headIcon', 'stageSplit', 'sectionHead',
      'ledger', 'ledgerLead', 'ledgerCount', 'choices', 'choiceAsk', 'choice', 'choiceOn']) {
      expect(chrome, name).toHaveProperty(name)
    }
  })

  it('옛 이름은 새 이름의 다시 내보내기다', () => {
    expect(chrome.stage).toBe(chrome.stageSplit)
    expect(chrome.detailHead).toBe(chrome.sectionHead)
  })

  it('파티 화면 css가 갈래 창 처방을 다시 내보낸다 — import가 안 바뀐다', async () => {
    const party = await import('../menu/partyScreen.css')
    expect(party.choices).toBe(chrome.choices)
    expect(party.choiceOn).toBe(chrome.choiceOn)
  })
})

describe('아이콘 시트 (정수배)', () => {
  const items: ItemIcons = { size: 32, cols: 24, rows: 20, count: 468 }
  const walls: BoxWallpapers = { count: 32, cols: 8, rows: 4, width: 168, height: 160 }

  it('도구 · 포켓몬 · 벽지 시트가 자료의 칸 수를 그대로 쓴다', () => {
    expect(sheetSize(itemSheet(items))).toEqual({ w: 768, h: 640 })
    expect(sheetSize(wallSheet(walls))).toEqual({ w: 8 * 168, h: 4 * 160 })
    expect(itemIconAt(items, 25, 2)).toMatchObject({ width: 64, height: 64 })
  })

  it('가방 그림은 64 칸 8×2, 주머니 아이콘은 16 칸 한 줄이다', () => {
    const meta = { size: 64, cols: 8, rows: 2, icon: 16, iconCols: 16 } as const
    expect(sheetSize(bagSheet(meta))).toEqual({ w: 512, h: 128 })
    expect(sheetSize(pocketSheet(meta))).toEqual({ w: 256, h: 16 })
    // 여자 가방은 둘째 줄이다
    expect(bagArtAt(meta, 3, 'girl', 1).backgroundPosition).toBe('-192px -64px')
    expect(bagArtAt(meta, 3, 'boy', 2).backgroundPosition).toBe('-384px -0px')
    // 고른 주머니는 둘째 칸이다 (2p+1)
    expect(pocketIconAt(meta, 2, true, 2).backgroundPosition).toBe('-160px -0px')
    expect(pocketIconAt(meta, 2, false, 2).backgroundPosition).toBe('-128px -0px')
  })

  it('벽지 썸네일은 줄이는 유일한 자리다 — 부드럽게 줄이고 칸 비율을 지킨다', () => {
    const thumb = wallThumb(walls, 9, 84)
    expect(thumb.width).toBe(84)
    expect(thumb.height).toBe(80)
    expect(thumb.imageRendering).toBe('auto')
    expect(thumb.backgroundPosition).toBe('-84px -80px')
  })
})

describe('그 밖의 겉모양', () => {
  it('분류 글 줄은 물리 54 · 변화 55 · 특수 56이다', () => {
    const lines: Record<MoveCategory, number> = CLASS_LINE
    expect(lines).toEqual({ physical: 54, status: 55, special: 56 })
  })

  it('값 줄의 칸 폭은 160이다', () => {
    expect(VALUE_CELL).toBe(160)
  })

  it('타입으로만 쓰는 이름들이 모양을 지킨다', () => {
    const rect: HoleRect = { x: 1, y: 2, w: 3, h: 4 }
    const key: MenuIconKey = 'trainerCard'
    const badges: BadgeSet = [true, false]
    const choice: ChoiceItem = { label: '쓴다', disabled: false }
    const stage: LearnStage = 'confirmGiveUp'
    const picked: PickResult = { kind: 'refused', why: '못 잊는다' }
    const input: LearnFlowInput = { move: 1, slots: [], onAnswer: () => undefined }
    const part: MonDetailPart = 'ability'
    const detail: MonDetailData = { name: '모부기' }
    const viewport: MonViewportProps = { species: 387 }
    const col: MoveCol = 'acc'
    const part2: KeyPart = { key: true, text: 'Z' }
    const hop: HopStyle | null = null
    const pixel: PixelCell | null = null
    const pop: PopPlacement | null = null
    expect([rect.x, key, badges.length, choice.label, stage, picked.kind, input.move, part, detail.name,
      viewport.species, col, part2.text, hop, pixel, pop]).toHaveLength(15)
  })
})
