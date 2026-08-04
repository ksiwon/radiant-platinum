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

export default tseslint.config(
  { ignores: ['dist/**', 'raw/**', 'tools/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
    },
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
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 테스트는 추출물을 디스크에서 직접 읽는다 — 유일하게 노드 API가 허용되는 곳
      'no-restricted-imports': 'off',
    },
  },
)
