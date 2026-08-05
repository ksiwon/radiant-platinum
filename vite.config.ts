import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  // 개발 서버에서만 쓴다. 배포 빌드와는 무관하다.
  //
  // 이 목록에 없는 의존성은 vite가 **처음 import되는 순간** 발견해 다시 묶고
  // 페이지를 통째로 새로고침한다. @pkmn/sim은 첫 배틀의 `await import()`에서야
  // 발견되므로, 그대로 두면 첫 배틀에서 반드시 한 번 튕긴다. 미리 묶어 둔다 —
  // 서버 시작이 몇 초 길어지는 대신 배틀 중에 새로고침이 안 난다
  optimizeDeps: {
    include: ['@pkmn/sim', '@pkmn/protocol', 'idb-keyval', 'zod', 'zustand/middleware'],
  },
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
          // 배틀 시뮬레이터. brotli 715 kB로 신오 전체 데이터(165 kB)의 4배가 넘는다.
          // 별도 청크로 떼어 **첫 배틀에서만** 받게 한다 — src/engine/battle/sim/은
          // 정적 import 하지 않는 것이 그 전제다
          if (id.includes('@pkmn')) return 'battle-sim'
        },
      },
    },
  },
})
