import { createTheme } from '@vanilla-extract/css'
import { vars } from './contract.css'

export const dayTheme = createTheme(vars, {
  panel: { bg: 'rgba(15, 20, 32, 0.85)', border: '#2a3550', text: '#e8ecf4' },
  hud: { accent: '#3ddc84', warn: '#ff6b5e' },
  font: {
    ui: "'Segoe UI', 'Malgun Gothic', sans-serif",
    mono: "'Cascadia Mono', 'Consolas', monospace",
  },
})
