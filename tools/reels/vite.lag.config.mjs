// 끊김 탐침용 빌드 — 프로덕션 번들(최소화) + DEV 켜짐. 개발 훅(pt)이 필요해서
import { mergeConfig } from 'vite'
import base from '../../vite.config.ts'
export default mergeConfig(base, {
  define: { 'import.meta.env.DEV': 'true', 'import.meta.env.PROD': 'false' },
  build: { outDir: '.audit/dist-lag', emptyOutDir: true, minify: process.env.NOMIN ? false : 'oxc' },
})
