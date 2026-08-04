import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  build: {
    target: 'es2022',
    // PLAN §10.4 예산: 초기 150 kB / 게임 청크 350 kB (gzip 기준).
    // 경고 한계는 원본 크기 기준이라 넉넉히 잡되, 실제 검증은 gzip 수치로 한다.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // three와 그 위 래퍼(@react-three/*)는 전부 게임 청크로. 순서 중요 —
          // '@react-three/fiber'는 'react'에도 매치되므로 three 검사가 먼저 와야 한다
          if (id.includes('three')) return 'three'
          if (id.includes('react')) return 'react'
        },
      },
    },
  },
})
