// 테마 컨트랙트 골격 (PLAN §2.3) — 토큰을 먼저 고정
import { createThemeContract } from '@vanilla-extract/css'

export const vars = createThemeContract({
  panel: { bg: null, border: null, text: null },
  hud: { accent: null, warn: null },
  font: { ui: null, mono: null },
})
