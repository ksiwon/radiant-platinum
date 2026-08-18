// 「게임이 읽는 파일」 ↔ 「설치가 만드는 파일」 (IMPORT.md §6 · §8)
//
// ⚠️ **이 짝을 보는 자가 없어서 여덟 파일이 조용히 비어 있었다.** 노드 추출기는
// 굽고 브라우저 변환기(`import/platinum/convert.ts`의 `GROUPS`)에는 짝이 없던
// 자료가 아홉 그룹 · 열다섯 파일이었다. `dist/`에는 자료가 한 조각도 안 실리므로
// (COPYRIGHT §6) **배포본이 갖는 것은 브라우저 변환기가 만든 것뿐**인데, 읽는
// 쪽이 전부 `.catch`로 감싸 두어서 화면은 뜨고 내용만 없었다 — 「고장」이 아니라
// 「이 게임에는 그 기능이 없나 보다」로 보인다.
//
// 있던 문지기는 둘 다 이걸 못 봤다:
//
//   `install/required.ts`   **손으로 적는** 필수 목록이다
//   `convert.test.ts`       그 손 목록이 변환기를 갖는가만 본다
//
// 게임이 실제로 무엇을 읽는지는 아무도 안 봤다. 여기서 본다.
//
// ⚠️ **경로를 소스에서 읽는다.** 런타임에 모으면 그 화면을 열어 본 경로만
// 모인다 — 도감·타운맵·프런티어처럼 e2e가 안 들르는 자리가 정확히 그때 빠진
// 자리다. 그래서 `gameData.ts`를 **글자로** 읽는다.
//
// ⚠️ **못 읽은 자리를 조용히 넘기지 않는다.** 인자를 못 푸는 `pinAtlas` 호출이
// 하나라도 있으면 이 시험이 선다. 넘기면 이 시험이 막으려던 실패가 그대로 돌아온다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ALL_GROUPS } from '../import/groups'

const FILE = resolve(__dirname, 'gameData.ts')
const SRC = readFileSync(FILE, 'utf8')

/**
 * 자리표 한 칸. 로케일·뱅크 번호처럼 **런타임에 정해지는 자리**다.
 *
 * `*`가 아니라 안 쓰이는 글자를 쓰는 이유가 있다 — 정규식으로 바꿀 때 `*`는
 * 자리표에서 온 것인지 원래 경로에 있던 것인지 못 가린다
 */
const HOLE = ''

/** `${…}` 를 자리표로. 중첩 괄호는 이 파일에 없다 (`${String(at)}`가 제일 깊다) */
const holes = (s: string): string => s.replace(/\$\{[^}]*\}/g, HOLE)

/**
 * 소스에서 논리 경로를 걷는다.
 *
 * 세 자리에서만 걷는다 — `fetchJson`의 첫 인자 · `assets().bytes`의 인자 ·
 * `pinAtlas`의 인자. 주석에 적힌 경로까지 주우면 「무엇을 실제로 읽는가」가
 * 아니라 「무엇을 적어 뒀는가」를 재게 된다
 */
function pathsRead(): { paths: Set<string>, unresolved: string[] } {
  const paths = new Set<string>()
  const unresolved: string[] = []

  // `export const NAME = 'data/…'` · `export const fn = (…): string => `data/…``
  const consts = new Map<string, string>()
  for (const m of SRC.matchAll(
    /^export const (\w+)(?::[^=]+)?\s*=\s*(?:\([^)]*\)(?::\s*\w+)?\s*=>\s*)?['`](data\/[^'`]+)['`]/gm,
  )) {
    consts.set(m[1]!, holes(m[2]!))
  }

  // `fetchJson('x.json'` · ``fetchJson(`names/x.${locale}.json``
  for (const m of SRC.matchAll(/\bfetchJson\(\s*['`]([^'`]+)['`]/g)) {
    paths.add(`data/${holes(m[1]!)}`)
  }
  // `assets().bytes('data/scripts.bin')`
  for (const m of SRC.matchAll(/\bassets\(\)\.bytes\(\s*['`]([^'`]+)['`]/g)) {
    paths.add(holes(m[1]!))
  }
  // `pinAtlas(ITEM_ICON_ATLAS)` · `pinAtlas(creditsImage(i))` · `pinAtlas('data/…')`
  for (const m of SRC.matchAll(/\bpinAtlas\(\s*([^)]*\)?)\s*\)/g)) {
    const arg = m[1]!.trim()
    const literal = /^['`](data\/[^'`]+)['`]$/.exec(arg)
    if (literal) { paths.add(holes(literal[1]!)); continue }
    const name = /^(\w+)(?:\(.*\))?$/.exec(arg)?.[1]
    const known = name === undefined ? undefined : consts.get(name)
    if (known === undefined) { unresolved.push(arg); continue }
    paths.add(known)
  }
  return { paths, unresolved }
}

/**
 * 산출물 자리표 하나를 정규식으로.
 *
 * ⚠️ **표기가 두 가지다.** 대개 `{종족}`·`*`를 쓰지만 소리 그룹만
 * `data/sound/seq/N.bin`으로 **맨 `N`**을 쓴다 (`convert.ts` ·
 * `localeSweep.test.ts`의 `literal`이 같은 함정을 밟았다)
 */
function outputRe(pattern: string): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = esc
    .replace(/\\\{[^}]*\\\}/g, '[^/]+')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\/N\\\.bin$/, '/[^/]+\\.bin')
  return new RegExp(`^${body}$`)
}

/** 읽는 경로를 정규식으로. 자리표가 한 칸을 뜻한다 */
function readRe(path: string): RegExp {
  const esc = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${esc.split(HOLE).join('[^/]*')}$`)
}

describe('게임이 읽는 파일을 설치가 만든다', () => {
  const { paths, unresolved } = pathsRead()

  it('⚠️ 인자를 못 푼 자리가 없다 — 넘기면 이 시험이 눈을 감는다', () => {
    expect(unresolved, `${FILE}에서 못 푼 인자`).toEqual([])
  })

  it('경로를 실제로 걷었다 — 정규식이 빗나가면 빈 집합으로 통과한다', () => {
    // 2026-08-19에 서른여섯이었다. 줄어드는 쪽이 위험하다
    expect(paths.size).toBeGreaterThan(30)
    expect(paths).toContain('data/species.json')
    expect(paths).toContain('data/scripts.bin')
    expect(paths).toContain('data/itemIcons.png')
    expect(paths).toContain(`data/dialogue/${HOLE}/${HOLE}.json`)
  })

  /** 그 그룹들이 만드는 것 중 짝이 없는 경로 */
  const orphansAgainst = (
    groups: readonly { convert?: unknown, outputs: string[] }[],
  ): string[] => {
    const made = groups
      .filter((g) => g.convert !== undefined)
      .flatMap((g) => g.outputs)
      .map((o) => ({ pattern: o, re: outputRe(o) }))
    const out: string[] = []
    for (const path of [...paths].sort()) {
      const probe = path.split(HOLE).join('')
      const re = readRe(path)
      // 양쪽으로 본다. 읽는 쪽에만 자리표가 있으면(`credits${n}.png`) 산출물은
      // 낱낱이 적혀 있고, 산출물에만 있으면(`names/x.*.json`) 읽는 쪽이 낱낱이다
      if (!made.some((m) => m.re.test(probe) || re.test(m.pattern))) {
        out.push(path.split(HOLE).join('*'))
      }
    }
    return out
  }

  // ⚠️ **이 시험이 §1을 다시 안 겪게 하는 자다.** 게임이 읽는 논리 경로 하나가
  // 어느 그룹의 산출물도 아니면, 그 파일은 개발 서버에서만 있고 설치본에는
  // 처음부터 없다. 짝이 없으면 **이름을 그대로 찍고** 선다
  it('⚠️ 읽는 경로마다 그것을 만드는 그룹이 있다', () => {
    expect(orphansAgainst(ALL_GROUPS),
      '이 경로를 만드는 브라우저 변환기가 없다 — 설치본에는 없는 파일이다').toEqual([])
  })

  // ⚠️ **이빨이 있는지 여기서 본다.** 위 시험은 통과하는 것이 정상이라, 정규식이
  // 한 군데 어긋나 **아무것도 못 잡는 상태**여도 똑같이 초록이다. 그래서 실제로
  // 빠졌던 자리를 다시 만들어 본다 — 나무열매는 브라우저 쪽에 짝이 없던 아홉
  // 그룹 중 하나였다
  it('그룹 하나를 빼면 그 파일 이름을 찍고 선다', () => {
    const short = ALL_GROUPS.filter((g) => g.name !== 'berries')
    expect(orphansAgainst(short)).toEqual(['data/berries.json'])
  })
})
