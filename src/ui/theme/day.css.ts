import { createTheme } from '@vanilla-extract/css'
import { vars } from './contract.css'

export const dayTheme = createTheme(vars, {
  panel: { bg: 'rgba(15, 20, 32, 0.85)', border: '#2a3550', text: '#e8ecf4' },
  hud: { accent: '#3ddc84', warn: '#ff6b5e' },
  // ⚠️ **한자 글꼴은 순서가 곧 나라다.** 브라우저는 글자마다 앞에서부터 그 글자를
  // 가진 글꼴을 찾으므로, 일본어 글꼴(Yu Gothic)을 한국어 글꼴(맑은 고딕)보다
  // 앞에 두면 **한자만** 일본 자형으로 간다. 한글은 맑은 고딕에만 있어서 그대로
  // 오고, 일본어 본문은 가나·한자가 다 Yu Gothic으로 온다. 반대로 두면 일본어
  // 한자가 한국 자형으로 나온다 — 같은 코드포인트라 눈으로만 갈린다
  font: {
    ui: "'Segoe UI', 'Yu Gothic UI', 'Malgun Gothic', 'Meiryo', sans-serif",
    mono: "'Cascadia Mono', 'Consolas', 'Yu Gothic UI', 'Malgun Gothic', monospace",
  },
})
