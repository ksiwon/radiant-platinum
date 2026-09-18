// `firstPersonSources.collect.ts`만 도는 vitest 설정 (기획서 FIRST_PERSON §11.1)
//
// ⚠️ 기본 실행이 이 파일을 안 줍게 수집기 이름이 `.test.ts`로 안 끝난다 —
// `vitest.shimmed.config.ts`와 같은 까닭이다
import { defineConfig, mergeConfig } from 'vitest/config'
import base from '../../vite.config.ts'

export default mergeConfig(base, defineConfig({
  test: {
    include: ['tools/audit/firstPersonSources.collect.ts'],
  },
}))
