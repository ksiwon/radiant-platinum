// 껍데기를 **낀 채로** 배틀이 도는지 재는 실행 (DEPLOY.md §4)
//
// ⚠️ **보통 시험으로는 이걸 못 잰다.** vitest는 `node_modules`를 SSR 외부화라
// 우리 플러그인이 안 불린다 — 시험 안의 `Dex.forGen(4)`는 진짜 패키지 표를 준다
// (실측: 종족 1517개). 그 덕에 `provider.test.ts`가 오라클로 설 수 있지만,
// **배포판이 실제로 도는지는 그 실행으로 한 번도 안 재진다.**
//
// 그래서 `@pkmn/sim`을 inline으로 끌어들여 껍데기가 걸리게 한 실행을 따로 둔다.
// 여기서 도는 배틀은 배포판과 같은 표를 본다.
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vite.config.ts'

export default mergeConfig(base, defineConfig({
  test: {
    // ⚠️ **이름이 `.test.ts`로 **안 끝난다**.** 기본 실행에서 이 파일을 주우면 반드시
    // 선다(거기서는 진짜 패키지 표가 뜬다). 기본 config의 `exclude`로 빼려고
    // 했더니 `mergeConfig`가 배열을 합쳐 버려 여기서도 빠졌다 — 이름으로 가른다
    include: ['src/engine/battle/dex/shimmed.test.shim.ts'],
    server: { deps: { inline: [/@pkmn[\\/]sim/] } },
  },
}))
