// 세 지역판 롬으로 전체 변환을 돌린다 (`src/import/platinum/localeSweep.test.ts`).
//
//     pnpm verify:locales
//
// ⚠️ **`pnpm check`와 갈라 둔다.** 롬 셋을 훑고 700MB씩 세 번 만드는 일이라
// 십 분 단위로 걸린다. 그래서 그 시험은 `PT_LOCALE_SWEEP=1`일 때만 돌고,
// 그 값을 켜는 자리가 여기다 — PowerShell에는 앞에 붙이는 환경변수 문법이
// 없어서 `tools/requireData.mjs`와 같은 이유로 노드로 감싼다.
import { spawn } from 'node:child_process'

const child = spawn('vitest', ['run', 'src/import/platinum/localeSweep.test.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PT_REQUIRE_DATA: '1', PT_LOCALE_SWEEP: '1' },
})
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 1)
})
