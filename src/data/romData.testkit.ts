// 롬에서 나온 자료가 있어야 도는 시험 (COPYRIGHT.md §5)
//
// `public/data`는 롬에서 굽는 것이라 없는 환경이 있다. 그래서 시험 파일 95개 중
// **51개**가 파일 유무를 보고 빠진다.
//
// ⚠️ **없을 때 무슨 일이 나는지가 파일마다 달랐다.** 자료를 치우고 재 보면 41개는
// 그 자리에서 터지고 **10개는 조용히 초록으로 끝난다.** 41개가 시끄러운 것은
// 설계가 아니라 우연이다 — vitest는 건너뛰는 묶음도 몸통을 수집하므로, 몸통
// 첫머리에서 파일을 읽는 시험만 `ENOENT`로 터진다. `it` 안에서만 읽으면 안 터진다
// (`trainers.test.ts`의 자료를 치우면 9 skipped · 종료 코드 0이다).
//
// 이 프로젝트는 조용한 통과에 이미 한 번 속았다 — `shell.test.ts`가 색을 손으로
// 만들어 넘기는 바람에 소품 189종이 뚫린 채로 통과하고 있었다(DATA.md §2.2).
//
// 그래서 건너뛰기를 여기 한 군데로 모으고, **`PT_REQUIRE_DATA=1`이면 건너뛰는
// 대신 세운다.** `pnpm check`가 그 값을 켠다 — 개발 중에 하나씩 돌릴 때는
// 예전처럼 조용히 빠진다.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe } from 'vitest'

/** 굽는 자료가 놓이는 자리 */
export const DATA = resolve(__dirname, '../../public/data')

/**
 * 나무 셋. 없을 수 있는 이유가 저마다 달라서 실패 메시지도 달라야 한다.
 *
 * - `data` — 롬에서 굽는다. `public/data`로 갈 것이고, 언젠가 CDN이다
 * - `models` — BDSP·립 모델. 지금도 gitignore라 없는 기계가 있다
 * - `decomp` — `raw/decomp`. 11GB짜리 원본 나무라 애초에 리포에 안 들어간다
 */
const TREE = {
  data: { root: DATA, how: '`pnpm extract`로 만들거나 CDN에서 받는다' },
  models: {
    root: resolve(__dirname, '../../public/models'),
    how: '`pnpm extract:npcModels` 등 모델 파이프라인으로 만든다',
  },
  decomp: {
    root: resolve(__dirname, '../../raw/decomp'),
    how: '디컴프 원본이다. `raw/`는 리포에 안 들어간다 (COPYRIGHT.md §7)',
  },
} as const

type TreeName = keyof typeof TREE

/**
 * 자료가 없으면 건너뛰지 말고 세운다.
 *
 * 모듈을 읽을 때 한 번 보지 않고 **부를 때마다** 본다 — 그래야 이 장치 자체를
 * 시험할 수 있다. 값을 상수로 굳히면 "세운다"는 쪽 길을 아무도 안 밟는다
 */
export function requireData(): boolean {
  return process.env.PT_REQUIRE_DATA === '1'
}

/** 이번 실행에서 자료가 없어 빠진 묶음들. 끝에 한 번 알려 준다 */
const skipped: string[] = []

/** 무엇이 빠졌는지. 리포터가 읽는다 */
export function skippedForMissingData(): readonly string[] {
  return skipped
}

/**
 * 시험 묶음을 여는 함수.
 *
 * `typeof describe`로 안 쓴다 — `describe`와 `describe.skip`은 딸린 것
 * (`each`·`skipIf`…)이 달라서 한쪽으로 못 맞춘다. 부르는 쪽이 쓰는 모양은
 * 이것뿐이라 여기까지만 약속한다
 */
export type SuiteFn = (name: string, body: () => void) => void

function gate(tree: TreeName, files: readonly string[]): SuiteFn {
  const { root, how } = TREE[tree]
  const missing = files.filter((f) => !existsSync(resolve(root, f)))
  if (missing.length === 0) return describe
  if (requireData()) {
    throw new Error(
      `${tree}: 있어야 할 것이 없다 — ${missing.join(' · ')}\n`
      + `  ${root} 아래에 있어야 한다. ${how}.\n`
      + '  (건너뛰고 싶으면 PT_REQUIRE_DATA 없이 돌린다)',
    )
  }
  skipped.push(`${tree}: ${missing.join(' · ')}`)
  return describe.skip
}

/**
 * `public/data` 아래의 그 파일들이 다 있을 때만 도는 `describe`.
 *
 * 경로는 그 뿌리 기준 상대다 — 시험마다 `resolve(__dirname, '../../public/data')`를
 * 다시 적으면 계층이 깊어질 때마다 `../`가 하나씩 어긋난다.
 *
 * 없으면 기본은 건너뛰기고, `PT_REQUIRE_DATA=1`이면 **그 자리에서 세운다** —
 * 무엇이 없어서 안 도는지가 실패 메시지에 그대로 나온다
 */
export function withData(...files: readonly string[]): SuiteFn {
  return gate('data', files)
}

/** 같은 것을 `public/models` 아래로 */
export function withModels(...files: readonly string[]): SuiteFn {
  return gate('models', files)
}

/** 같은 것을 `raw/decomp` 아래로 */
export function withDecomp(...files: readonly string[]): SuiteFn {
  return gate('decomp', files)
}
