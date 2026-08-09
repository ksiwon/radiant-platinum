import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
// @ts-expect-error — tools/는 타입 검사 밖의 순수 JS다 (tsconfig include: src)
import { collectShell } from './tools/distribution/appShell.mjs'
// @ts-expect-error — 같은 이유
import { collectProvenance } from './tools/distribution/provenance.mjs'
// @ts-expect-error — 같은 이유
import { cspMeta } from './tools/distribution/csp.mjs'

const PUBLIC_DIR = resolve(import.meta.dirname, 'public')
const AUDIT_DIR = resolve(import.meta.dirname, '.audit')

/**
 * 앱 빌드 번호. 휴대용 리포트 봉투가 이걸 적는다 (`state/save/contract.ts`).
 *
 * ⚠️ **`0.0.0`으로 나가면 안 된다.** `package.json`의 version이 `0.0.0`이던
 * 동안 모든 `.rpsave`가 같은 값을 달고 나왔고, 그러면 "어느 판이 쓴 파일인가"를
 * 물을 수가 없다 — 적어 둔 자리가 있는데 아무것도 안 적힌 것과 같다.
 *
 * 뒤에 표식을 붙여 **로컬과 릴리스를 가른다.** CI가 커밋 해시를 주면 그것을,
 * 없으면 `dev`를 쓴다. `git`이 없는 clone에서도 빌드는 돼야 하므로 실패는
 * `dev`로 떨어진다.
 *
 * ⚠️ `package.json`을 런타임에 import 하면 그 파일이 통째로 번들에 실린다 —
 * 스크립트 60줄과 의존성 목록까지. 값 하나만 박아 넣는다
 */
function appBuild(): string {
  const version = (
    JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as
      { version?: string }
  ).version ?? '0.0.0'
  const ci = process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? process.env.APP_BUILD_ID
  if (ci?.trim()) return `${version}+${ci.trim().slice(0, 7)}`
  return `${version}+dev`
}

const APP_BUILD: string = appBuild()

/**
 * `public/`에서 **앱 셸만** 배포물로 옮긴다 (COPYRIGHT.md §6).
 *
 * ⚠️ Vite의 기본 동작은 `public/`을 통째로 복사하는 것이고, 그것이 리포에
 * 한 바이트도 없는 `data/`(64MB)와 `models/`(581MB)를 `dist/`로 실어 냈다.
 * `.gitignore`는 이걸 못 막는다 — Git 추적 여부를 아예 안 본다.
 *
 * 그래서 `copyPublicDir: false`로 복사를 끄고 허용 목록만 손으로 옮긴다.
 * 금지 목록이 아니라 허용 목록인 이유는, 금지 목록은 새 폴더가 생길 때마다
 * 뚫리지만 허용 목록은 안 뚫리기 때문이다.
 *
 * 개발 서버는 그대로 `public/` 전체를 준다 — 개발판은 기존 raw 산출물을 계속
 * 쓴다 (COPYRIGHT.md §5).
 */
function appShellOnly(): Plugin {
  return {
    name: 'radiant-app-shell-only',
    apply: 'build',
    generateBundle() {
      for (const rel of collectShell(PUBLIC_DIR) as string[]) {
        this.emitFile({
          type: 'asset',
          fileName: rel,
          source: readFileSync(resolve(PUBLIC_DIR, rel)),
        })
      }
    },
  }
}

/**
 * 청크마다 무엇이 들어갔는지 적어 둔다 (COPYRIGHT.md §6 · DEPLOY.md §4).
 *
 * ⚠️ **경로·확장자 검사는 번들 안을 못 본다.** `dist/assets/battle-sim-*.js`는
 * 이름도 `.js`, 자리도 `assets/`라 모든 규칙을 통과하는데 실제로는 6.5MB이고
 * 대부분이 `@pkmn/sim`의 종족·기술·습득기술 표다. 그것을 발견한 것이 이 보고서다.
 *
 * 결과는 `.audit/`에 남긴다 — **`dist/`가 아니다.** 배포물이 아니라 감사 기록이고,
 * 모듈 경로에 개발 기계의 절대 경로가 들어가므로 내보낼 것도 아니다
 */
function bundleProvenance(): Plugin {
  return {
    name: 'radiant-bundle-provenance',
    apply: 'build',
    writeBundle(_options, bundle) {
      const report = collectProvenance(bundle) as unknown
      mkdirSync(AUDIT_DIR, { recursive: true })
      writeFileSync(
        resolve(AUDIT_DIR, 'bundle-provenance.json'),
        `${JSON.stringify(report, null, 1)}\n`,
      )
    },
  }
}

/**
 * CSP를 `<meta http-equiv>`로도 넣는다 (DEPLOY.md §3).
 *
 * ⚠️ **이것으로 CSP가 있다고 세지 않는다.** meta는 `frame-ancestors`를 무시하고,
 * 태그를 파싱하기 전에 시작된 요청도 못 막는다. 정본은 호스트 응답 헤더고
 * `verifyDeploy.mjs`가 그것을 잰다. 여기 넣는 이유는 헤더가 잘못 설정된 채로
 * 올라갔을 때 **아무 방어도 없는 것보다는 낫기** 때문이다
 */
function cspMetaTag(): Plugin {
  return {
    name: 'radiant-csp-meta',
    apply: 'build',
    transformIndexHtml(html: string) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${cspMeta() as string}" />`
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${tag}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin(), appShellOnly(), bundleProvenance(), cspMetaTag()],
  define: { __APP_BUILD__: JSON.stringify(APP_BUILD) },
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
    // ⚠️ 이 한 줄이 배포 경계다. 되돌리면 `tools/distribution/check.mjs`가 선다
    copyPublicDir: false,
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
