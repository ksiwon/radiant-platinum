import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// ⚠️ 플랫 설정에서 같은 규칙을 두 블록에 쓰면 뒤가 앞을 통째로 덮는다.
// no-restricted-imports를 계층별로 따로 선언하면 마지막 블록만 살아남아
// 앞선 경계가 조용히 죽는다 — 실제로 한 번 그렇게 죽었다. 그래서 조각을
// 상수로 두고 각 블록이 필요한 것을 전부 합쳐서 쓴다.

/** 브라우저 번들에는 노드 API가 들어갈 수 없다. @types/node는 테스트용이다 */
const NODE_FORBIDDEN = [
  {
    group: ['node:*', 'fs', 'path', 'crypto'],
    message: '브라우저 번들에 노드 API가 들어갈 수 없다. 데이터는 fetch로 받는다 (DATA.md §3.2).',
  },
]

/** 엔진 계층에서 금지되는 임포트 (PLAN §3.2 ③, §15) */
const ENGINE_FORBIDDEN = {
  paths: [
    {
      name: 'react',
      message: 'src/engine은 React를 몰라야 한다 (PLAN §15). 씬 연결은 src/scene이 담당한다.',
    },
    {
      name: 'react-dom',
      message: 'src/engine은 React를 몰라야 한다 (PLAN §15).',
    },
    {
      name: 'react-router',
      message: 'src/engine은 라우팅을 몰라야 한다 (PLAN §15).',
    },
    {
      name: 'zustand',
      message:
        '엔진/프레임 상태는 zustand에 넣지 않는다 (PLAN §3.2). 초당 60회 setState는 R3F 프로젝트가 죽는 1번 원인이다.',
    },
  ],
  patterns: [
    {
      group: ['@react-three/*'],
      message: 'src/engine은 R3F를 몰라야 한다 (PLAN §15). 렌더 연결은 src/scene이 담당한다.',
    },
    {
      group: ['**/sessionStore', '**/saveStore', '**/*.css'],
      message: 'src/engine은 UI 상태·스타일에 의존하지 않는다 (PLAN §3.2).',
    },
    ...NODE_FORBIDDEN,
  ],
}

/**
 * 에셋 주소를 만드는 곳은 `data/assetBase` 하나다 (COPYRIGHT.md §6).
 *
 * ⚠️ 앱 셸을 Pages, 에셋을 R2에 두는 순간 `${BASE_URL}data/…`는 전부 404가 된다.
 * 지금은 두 오리진이 같아서 **틀려도 안 깨지고**, 그래서 새로 쓰는 자리마다
 * 도로 늘어난다. 갈리는 날 스무 군데를 다시 찾는 대신 여기서 막는다
 */
const BASE_URL_FORBIDDEN = {
  selector:
    "MemberExpression[object.object.type='MetaProperty']"
    + "[object.property.name='env'][property.name='BASE_URL']",
  message:
    '에셋 주소는 data/assetBase의 dataUrl·modelUrl로 만든다 (COPYRIGHT.md §6). '
    + '앱 셸로 돌아가는 것뿐이라면 같은 모듈의 APP_ROOT다.',
}

/**
 * 자료가 없어서 건너뛰는 것은 `data/romData.testkit` 한 군데를 거친다.
 *
 * ⚠️ 손으로 `describe.skip`을 적으면 `PT_REQUIRE_DATA`가 그 파일을 못 봐서,
 * 자료를 못 받은 것과 다 통과한 것이 화면에서 똑같이 초록이 된다
 * (COPYRIGHT.md §5 — 시험 파일 95개 중 51개가 그 자리였다)
 */
const DESCRIBE_SKIP_FORBIDDEN = {
  selector: "MemberExpression[object.name='describe'][property.name='skip']",
  message:
    '자료 유무로 건너뛸 때는 withData/withModels/withDecomp를 쓴다 (COPYRIGHT.md §5). '
    + '손으로 적으면 PT_REQUIRE_DATA가 그 파일을 못 본다.',
}

export default tseslint.config(
  { ignores: ['dist/**', 'raw/**', 'tools/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 서비스 워커는 브라우저도 노드도 아닌 제3의 자리에서 돈다 —
    // `self`·`caches`·`clients`가 거기 산다 (`public/sw.js`)
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': ['error', { patterns: [...NODE_FORBIDDEN] }],
      'no-restricted-syntax': ['error', BASE_URL_FORBIDDEN],
    },
  },
  {
    // 그 하나. 여기서만 `import.meta.env.BASE_URL`을 읽는다
    files: ['src/data/assetBase.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // 상태 3분할 경계 강제 — 엔진과 프레임 상태는 React를 몰라야 한다
    files: ['src/engine/**/*.ts', 'src/state/worldState.ts'],
    rules: {
      'no-restricted-imports': ['error', ENGINE_FORBIDDEN],
    },
  },
  {
    // UI 계층은 three를 직접 만지지 않는다 — sceneRefs를 통해서만 씬에 닿는다
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'three',
              message:
                'UI는 three를 직접 임포트하지 않는다 (PLAN §15). 초기 청크에 three가 실려 §10.4 예산이 깨진다.',
            },
          ],
          patterns: [
            { group: ['three/*', '@react-three/*'], message: 'UI는 렌더러를 몰라야 한다 (PLAN §15).' },
            ...NODE_FORBIDDEN,
          ],
        },
      ],
    },
  },
  {
    // `.testkit.ts`는 여러 테스트가 나눠 쓰는 준비 코드다. 테스트와 같은 규칙을
    // 받되 이름으로 구분되어, 앱 코드가 실수로 가져다 쓰면 바로 눈에 띈다
    files: ['**/*.test.ts', '**/*.testkit.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 테스트는 추출물을 디스크에서 직접 읽는다 — 유일하게 노드 API가 허용되는 곳
      'no-restricted-imports': 'off',
    },
  },
  {
    // ⚠️ 시험 파일도 `src/**`에 걸리므로 위 블록의 `no-restricted-syntax`를 덮는다.
    // 조각을 **둘 다** 넣지 않으면 시험에서만 BASE_URL 금지가 조용히 죽는다
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': ['error', BASE_URL_FORBIDDEN, DESCRIBE_SKIP_FORBIDDEN],
    },
  },
)
