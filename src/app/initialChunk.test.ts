// 초기 청크 경계 (PLAN §10.4)
//
// **타이틀 화면은 three.js 없이 떠야 한다.** three/webgpu는 혼자 427KB gz라,
// 초기 그래프에 한 번이라도 들어오면 150KB 예산이 3.6배로 깨진다.
//
// ⚠️ 이 경계는 눈으로 지킬 수 없다. 실제로 한 번 깨졌다 — 타이틀에 설정 화면을
// 붙이면서 `menuStore`를 잡았는데, 그것이 `input/keyboard` → `worldState` →
// three로 이어졌다. 빌드는 통과하고 화면도 멀쩡하니 아무 데서도 안 걸린다.
// 그래서 import 그래프를 직접 걷는다.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'

/**
 * 이 이름으로 시작하는 모듈이 초기 그래프에 있으면 안 된다.
 *
 * ⚠️ **zod가 여기 든 것은 크기 때문이다.** 혼자 gzip 19.4kB고, 세 갈래로
 * 부팅 그래프에 들어와 첫 화면을 149.4kB까지 밀어 올리고 있었다 (실측 —
 * 빼고 121.6kB). 스키마는 **읽을 때** 받으면 되고, 상수 하나 때문에 딸려
 * 오던 자리는 상수를 따로 뺐다 (`data/pockets.ts` · `import/install/installContract.ts`)
 */
const FORBIDDEN = /^(three|@react-three|@pkmn|zod)/

/**
 * `import type ...`은 컴파일에서 지워지므로 그래프에 안 남는다.
 * 그 외의 `import ... from '…'`과 `import '…'`만 센다
 */
const IMPORT = /^\s*import\s+(?!type\s)(?:[^;'"]*?from\s*)?'([^']+)'/gm

const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(from), spec)
  for (const ext of EXTS) {
    const p = base + ext
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

/** main.tsx에서 정적으로 닿는 모든 파일. `import()`는 청크가 갈리므로 안 따라간다 */
function walk(entry: string): { seen: Set<string>; hits: string[][] } {
  const seen = new Set<string>()
  const hits: string[][] = []
  const visit = (file: string, trail: string[]) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const m of source.matchAll(IMPORT)) {
      const spec = m[1]!
      if (FORBIDDEN.test(spec)) {
        hits.push([...trail, file].map((f) => relative(process.cwd(), f)).concat(spec))
        continue
      }
      const next = resolveLocal(file, spec)
      if (next !== null) visit(next, [...trail, file])
    }
  }
  visit(entry, [])
  return { seen, hits }
}

describe('초기 청크', () => {
  const entry = resolve('src/main.tsx')
  const { seen, hits } = walk(entry)

  it('타이틀 그래프에 three·R3F·sim·zod가 없다', () => {
    // 실패하면 어느 길로 들어왔는지가 그대로 나온다
    expect(hits.map((h) => h.join(' → '))).toEqual([])
  })

  it('그래프를 실제로 걸었다 — 정규식이 죽으면 0개가 되어 위 시험이 공짜로 통과한다', () => {
    expect(seen.size).toBeGreaterThan(20)
    expect(seen).toContain(resolve('src/ui/screens/TitleScreen.tsx'))
    expect(seen).toContain(resolve('src/state/menuStore.ts'))
  })

  it('무거운 것은 지연 로드라 걷지 않는다', () => {
    // `Stage`는 `lazy(() => import(...))`다. 정적으로 닿으면 위 시험이 터진다
    expect(seen).not.toContain(resolve('src/scene/Stage.tsx'))
  })

  /**
   * ⚠️ **배틀 UI도 첫 화면 밖이다.**
   *
   * `App`이 `<BattleScreen />`을 늘 그려 두고 있었다 — 안에서 `phase === 'off'`면
   * null을 내므로 화면에는 아무 문제가 없었는데, **모듈 그래프에는 서른 개가
   * 그대로 들어와 있었다**(`battleStore`·`aftermath`·`capture`·`reward`·`view`·
   * `playback`·`BattleBag`·`SwitchScreen`…). 첫 화면 gzip 138.7kB 중 18kB가
   * 그것이었다. 지금은 `sessionStore.battleScreen`이 켜질 때 받는다
   */
  it('배틀 UI는 첫 화면 그래프에 없다', () => {
    for (const at of ['src/ui/battle/BattleScreen.tsx', 'src/state/battleStore.ts',
      'src/engine/battle/view.ts', 'src/engine/battle/playback.ts',
      'src/engine/battle/meta/capture.ts']) {
      expect(seen, at).not.toContain(resolve(at))
    }
    // 스위치는 남아야 한다 — 그것이 없으면 배틀이 켜져도 아무도 안 받는다
    expect(seen).toContain(resolve('src/state/sessionStore.ts'))
  })

  /**
   * ⚠️ **소리 뭉치도 첫 화면 밖이다.** 타이틀이 `music`을 정적으로 잡고 있었고,
   * 그것이 sseq·swar·렌더 워커까지 끌고 와서 첫 화면 gzip에 11.1kB를 더했다 —
   * 예산(150kB)은 안 넘어서 아무 데서도 안 걸렸고, 내부 목표 135kB만 조용히
   * 넘고 있었다. 쓰는 자리는 둘 다 그려진 **뒤**에 도는 `useEffect`다
   */
  it('소리 뭉치는 첫 화면 그래프에 없다', () => {
    for (const at of ['src/engine/audio/music.ts', 'src/engine/audio/sfx.ts',
      'src/engine/audio/sseq.ts', 'src/engine/audio/render.ts']) {
      expect(seen, at).not.toContain(resolve(at))
    }
    // 깨우기는 남는다 — 첫 제스처를 놓치면 소리가 영영 안 난다 (§11.1)
    expect(seen).toContain(resolve('src/engine/audio/unlock.ts'))
  })
})
