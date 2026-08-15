import { execFileSync } from 'node:child_process'
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
// @ts-expect-error — 같은 이유
import { pkmnDiet } from './tools/distribution/pkmnDiet.mjs'

const PUBLIC_DIR = resolve(import.meta.dirname, 'public')
const AUDIT_DIR = resolve(import.meta.dirname, '.audit')

/**
 * vitest가 이 설정을 읽고 있는가.
 *
 * ⚠️ **설정을 함수로 바꾸지 않는다.** `defineConfig((env) => …)`로 하면
 * `vitest.shimmed.config.ts`의 `mergeConfig(base, …)`가 함수를 못 합친다.
 * vitest는 설정을 읽기 전에 이 환경변수를 세운다
 */
const TESTING = process.env.VITEST === 'true'

/**
 * 앱의 **판**. SemVer이고 이것만 비교 대상이다.
 *
 * ⚠️ `package.json`을 런타임에 import 하면 그 파일이 통째로 번들에 실린다 —
 * 스크립트 60줄과 의존성 목록까지. 값 하나만 박아 넣는다
 */
function appVersion(): string {
  return (
    JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as
      { version?: string }
  ).version ?? '0.0.0'
}

/**
 * 이 빌드가 **어느 소스에서 나왔는가.** 판이 아니라 신원이다.
 *
 * ⚠️ **판과 섞어 쓰지 않는다.** 한때 `0.1.0+a1b2c3d` 한 문자열만 있었는데,
 * SemVer에서 `+` 뒤는 **빌드 메타데이터라 우선순위를 안 바꾼다** — 즉
 * `0.1.0+dev`와 `0.1.0+a1b2c3d`는 SemVer상 같은 판이다. 호환을 그 문자열로
 * 따지면 "다르게 생겼으니 다른 판"이라고 잘못 읽게 된다. 그래서 둘을 나눈다:
 * 호환 판정은 `APP_VERSION`, 신원은 `BUILD_ID`.
 *
 *   `dev`             로컬 빌드 (git이 없거나 CI가 아님)
 *   `a1b2c3d`         깨끗한 나무에서 나온 빌드
 *   `a1b2c3d-dirty`   커밋 안 한 변경이 섞인 빌드 — 재현이 안 된다
 *
 * `-dirty`는 릴리스에서 막는다 (`check.mjs --release`). 어느 소스에서 나왔는지
 * 말할 수 없는 것을 공개하면 나중에 "그 빌드"를 다시 만들 수가 없다
 */
function buildId(): string {
  const ci = process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? process.env.APP_BUILD_ID
  if (ci?.trim()) return ci.trim().slice(0, 7)
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim()
    if (!/^[0-9a-f]{7}$/.test(sha)) return 'dev'
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
    return dirty ? `${sha}-dirty` : sha
  } catch {
    // git이 없는 clone에서도 빌드는 돼야 한다
    return 'dev'
  }
}

const APP_VERSION: string = appVersion()
const BUILD_ID: string = buildId()

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
 * 이 배포물이 어느 소스에서 나왔는지 적어 둔다.
 *
 * ⚠️ **릴리스 게이트가 지금 나무를 다시 묻지 않게 하려는 것이다.** 빌드하고
 * 검사할 때까지 사이에 파일이 바뀔 수 있으므로, 재야 하는 것은 검사 시점의
 * 나무가 아니라 **`dist/`를 만든 그 나무**다 (`blockers.mjs`의 `release-build`).
 *
 * `.audit/`에 둔다 — 배포물이 아니다
 */
function buildStamp(): Plugin {
  return {
    name: 'radiant-build-stamp',
    apply: 'build',
    writeBundle() {
      mkdirSync(AUDIT_DIR, { recursive: true })
      writeFileSync(
        resolve(AUDIT_DIR, 'build.json'),
        `${JSON.stringify({ version: APP_VERSION, buildId: BUILD_ID }, null, 1)}\n`,
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
  /**
   * 미리 묶어 둔 의존성을 어디에 두는가.
   *
   * ⚠️ **개발 서버 둘이 같은 자리를 쓰면 서로를 무효로 만든다.** 기본값
   * (`node_modules/.vite`)을 두 서버가 나눠 쓰면 한쪽이 다시 묶을 때마다 다른
   * 쪽 페이지가 `504 Outdated Optimize Dep`으로 죽는다 — 실측으로 하네스가
   * 빈 화면 앞에서 2분을 서 있었고, 원인은 옆에서 돌던 다른 개발 서버였다.
   * 하네스는 이 환경변수로 자기 자리를 따로 잡는다 (`tools/devServer.mjs`)
   */
  cacheDir: process.env.VITE_CACHE_DIR,
  plugins: [
    // ⚠️ `pkmnDiet`이 먼저다 — `enforce: 'pre'`로 `resolveId`를 먼저 잡아야
    // 데이터 모듈이 그래프에 들어오기 전에 껍데기로 바뀐다
    pkmnDiet() as Plugin,
    react(),
    // ⚠️ **시험 실행에서는 CSS를 안 굽는다.** 이 플러그인이 시험 시간의 거의
    // 전부였다 — 배틀 시험 27벌 219초 중 183초, 빈 시험 하나도 76초였다
    // (`.css.ts` 하나마다 별도의 vite 실행을 띄운다). 대신 `@vanilla-extract/css`를
    // 대역으로 바꿔 `.css.ts`가 **그대로 실행되게** 둔다 — 이름도 구조도 같고,
    // 굽지만 않는다 (`tools/test/vanillaExtractStub.ts`)
    ...(TESTING ? [] : [vanillaExtractPlugin()]),
    appShellOnly(), bundleProvenance(), buildStamp(), cspMetaTag(),
  ],
  ...(TESTING
    ? {
      resolve: {
        alias: {
          '@vanilla-extract/css': resolve(import.meta.dirname, 'tools/test/vanillaExtractStub.ts'),
        },
      },
    }
    : {}),
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  // 개발 서버에서만 쓴다. 배포 빌드와는 무관하다.
  //
  // 이 목록에 없는 의존성은 vite가 **처음 import되는 순간** 발견해 다시 묶고
  // 페이지를 통째로 새로고침한다. @pkmn/sim은 첫 배틀의 `await import()`에서야
  // 발견되므로, 그대로 두면 첫 배틀에서 반드시 한 번 튕긴다. 미리 묶어 둔다 —
  // 서버 시작이 몇 초 길어지는 대신 배틀 중에 새로고침이 안 난다
  optimizeDeps: {
    // ⚠️ `ts-chacha20`은 sim이 쓰는 **CommonJS** 딸림 꾸러미다 (`sim/prng.mjs`).
    // sim을 미리 묶기에서 빼면 이것도 같이 빠지는데, 브라우저는 CJS를 못 읽어
    // "does not provide an export named 'Chacha20'"으로 배틀이 선다. 이것만
    // 따로 미리 묶어 ESM으로 만들어 둔다
    include: [
      '@pkmn/protocol', '@pkmn/sim > ts-chacha20',
      'idb-keyval', 'zod', 'zustand/middleware',
    ],
    // ⚠️ **@pkmn/sim은 미리 묶지 않는다.** 미리 묶기는 vite의 플러그인 파이프라인
    // 밖에서 도는 별개의 번들이라 위 `pkmnDiet`의 `resolveId`가 안 불린다.
    // 한동안 `optimizeDeps.esbuildOptions.plugins`로 같은 규칙을 걸어 뒀는데,
    // vite 8은 미리 묶기를 rolldown으로 하고 그 칸은 **조용히 무시된다** —
    // 그래서 개발판만 sim의 진짜 표(종족 1,517개)를 들고 돌았다.
    //
    // 그 어긋남이 개발 서버에서 배틀을 통째로 죽였다: 껍데기가 걸린 모듈과 안
    // 걸린 모듈이 섞여 `FormatsData`는 비었는데 `Pokedex`에는 폼이 남았고,
    // `gen4.species.all()`이 로토무 폼에서 "Rotom has no formats-data entry"로
    // 터졌다. 야생도 트레이너도 열리자마자 닫혔다.
    //
    // rolldown용 플러그인을 다시 다는 길도 있지만, 그러면 우리 표(`dex/tables.ts`)가
    // 미리 묶기 번들 **안으로 복사**돼 앱이 채우는 표와 sim이 읽는 표가 딴
    // 객체가 된다. 빼는 편이 맞다 — 개발에서도 배포와 **같은 파이프라인**을
    // 지나가고, sim은 첫 배틀에서 `await import()`로만 들어온다
    exclude: ['@pkmn/sim'],
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
