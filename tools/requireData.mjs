// 넘겨받은 명령을 `PT_REQUIRE_DATA=1`로 돌린다 (COPYRIGHT.md §5).
//
//     node tools/requireData.mjs vitest run
//
// ⚠️ `PT_REQUIRE_DATA=1 vitest run`으로 못 쓴다 — 이 프로젝트의 주 셸이
// PowerShell이라 앞에 붙이는 환경변수 문법이 없다. 그래서 노드로 감싼다.
//
// 켜면 롬에서 굽는 자료가 없을 때 시험이 **건너뛰는 대신 선다.** 자료를 CDN으로
// 옮기고 나면(COPYRIGHT.md §5) 그게 없는 것과 다 통과한 것을 가르는 유일한 표시다.
import { spawn } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('쓸 명령이 없다: node tools/requireData.mjs <명령> [인자...]')
  process.exit(2)
}

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PT_REQUIRE_DATA: '1' },
})
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 1)
})
