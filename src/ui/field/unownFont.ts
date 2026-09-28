// 안농 글꼴로 찍는 글 (PARITY §6.8 · `ScrCmd_MessageUnown`)
//
// 글은 보통 글자로 온다(「TOP RIGHT」). 글자마다 아틀라스의 칸을 찾아 그 그림을 원작 너비만큼 놓는다 —
// 원작 인쇄기도 글리프 너비만큼 커서를 민다(`GlyphWidthFunc_VariableWidth`). 글꼴에 없는 글자는 원작처럼
// `?` 칸으로 떨어진다(`FontManager_TryLoadGlyph`의 `CHAR_QUESTION`)
import type { CSSProperties } from 'react'
import { loadUnownFont, UNOWN_FONT_ATLAS } from '../../data/gameData'
import type { UnownFont } from '../../data/schema'
import { atlasUrl } from '../../data/providers/atlas'

/** 도트를 이만큼 키운다 — 대사창 글자와 같은 배율이다 */
const SCALE = 2

let font: UnownFont | null = null
let slots: Map<string, number> | null = null
let asked = false

/** 글꼴을 받아 둔다. 안 오면 보통 글자로 뜬다 */
export function loadUnownGlyphs(): void {
  if (asked) return
  asked = true
  void loadUnownFont().then((v) => {
    font = v
    slots = new Map(v.glyphs.map(([char], i) => [char, i]))
  }).catch(() => { /* 보통 글자로 남는다 */ })
}

/** 받아 둔 글꼴이 있는가. 없으면 부르는 쪽이 보통 글자로 그린다 */
export function unownReady(): boolean {
  return font !== null
}

/** 글자 하나의 그림. 글꼴이 아직 없으면 null */
export function unownGlyph(char: string): CSSProperties | null {
  if (font === null || slots === null) return null
  const at = slots.get(char) ?? slots.get('?') ?? 0
  const width = font.glyphs[at]?.[1] ?? font.size
  return {
    display: 'inline-block',
    width: width * SCALE,
    height: font.size * SCALE,
    backgroundImage: `url(${atlasUrl(UNOWN_FONT_ATLAS)})`,
    backgroundPosition: `${String(-at * font.size * SCALE)}px 0`,
    backgroundSize: `${String(font.glyphs.length * font.size * SCALE)}px ${String(font.size * SCALE)}px`,
    imageRendering: 'pixelated',
    verticalAlign: 'middle',
  }
}
