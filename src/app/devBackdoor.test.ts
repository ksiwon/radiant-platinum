// 배포본에 **뒷문이 없다**는 것을 소스로 지킨다.
//
// 개발용 셋(확인 지점 표 · 계기판 · `window.pt`)은 개발 서버에서만 붙는다.
// 조건이 `import.meta.env.DEV`라 빌드 상수고, 그래서 배포 빌드에는 그 조각들이
// **안 실린다** — 안 받는 것과 안 실리는 것은 다르다.
//
// ⚠️ **주소로 켜는 손잡이를 다시 두면 그 성질이 통째로 사라진다.** 값이 런타임
// 값이 되는 순간 rollup이 가지를 못 흔들어서, 아무도 안 받는 채로 배포물에
// 남는다. 배포본을 상대로 상황을 보는 일은 세이브 파일이 한다 (`saves/`).
import { describe, expect, it } from 'vitest'

/** `src` 아래 시험 아닌 소스 전부 */
async function sources(): Promise<{ rel: string; text: string }[]> {
  const { readFileSync, readdirSync, statSync } = await import('node:fs')
  const { join, resolve } = await import('node:path')
  const root = resolve(__dirname, '../..')
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const at = join(dir, name)
      if (statSync(at).isDirectory()) walk(at, out)
      else if (/\.tsx?$/.test(name) && !name.includes('.test.')) out.push(at)
    }
    return out
  }
  return walk(resolve(root, 'src')).map((file) => ({
    rel: file.slice(root.length + 1).split(String.fromCharCode(92)).join('/'),
    text: readFileSync(file, 'utf8'),
  }))
}

describe('개발용 연장은 개발 서버에서만', () => {
  it('주소나 저장소로 켜는 손잡이가 없다', async () => {
    const files = await sources()
    const bad: string[] = []
    for (const { rel, text } of files) {
      // 저장소에 기억해 두고 다음 판에도 켜 두는 수법
      if (text.includes('rp.devTools')) bad.push(`${rel} — 저장소 열쇠`)
      // 주소에서 `dev` 칸을 읽는 수법. `?assets=opfs`는 `boot.ts`가 개발
      // 빌드에서만 채우는 다른 칸이라 여기 안 걸린다
      if (/searchParams\s*\)?\s*\.get\(\s*['"]dev['"]/.test(text)) bad.push(`${rel} — 주소 칸`)
    }
    expect(bad, '배포본에 개발 손잡이를 여는 길이 있다').toEqual([])
    // ⚠️ **비어 있으면 뜻이 없다** — 훑기가 깨졌는데 초록으로 지나가면 안 된다
    expect(files.length, 'src를 하나도 못 읽었다').toBeGreaterThanOrEqual(200)
  })

  it('개발 조각을 부르는 자리가 다 빌드 상수 뒤에 있다', async () => {
    const files = await sources()
    /** 개발 서버에서만 받아야 하는 조각들 */
    const CHUNKS = ['./devConsole', '../app/devWarp', '../ui/dev/DevWarpScreen', '../ui/hud/PerfOverlay']
    const bad: string[] = []
    let looked = 0
    for (const { rel, text } of files) {
      const sites = CHUNKS.filter((c) => text.includes(`import('${c}')`)).length
      if (sites === 0) continue
      looked += sites
      // ⚠️ **`devToolsOn()` 같은 함수 호출로 감싸면 안 된다.** 그건 런타임
      // 값이라 rollup이 가지를 못 흔든다 — 조각이 배포물에 그대로 남는다
      if (!text.includes('import.meta.env.DEV')) bad.push(rel)
    }
    expect(bad, '개발 조각을 빌드 상수 없이 받는다').toEqual([])
    // ⚠️ **비어 있으면 뜻이 없다.** 자리를 세는 것이지 파일을 세는 것이 아니다 —
    // 지금 둘(`app/App` · `scene/useDevWarp`)에 넷이 들어 있다
    expect(looked, '개발 조각을 받는 자리를 못 찾았다').toBeGreaterThanOrEqual(4)
  })
})
