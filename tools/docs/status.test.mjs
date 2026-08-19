// 남은 일 대장이 임자 문서와 안 어긋나는가
//
// ⚠️ **대장이 낡는 것이 이 대장의 유일한 실패 방식이다.** 임자 문서에서 일이
// 끝났는데 여기가 그대로면, 「한눈에 보려고」 만든 것이 도리어 틀린 그림을 준다.
// 그래서 커밋된 `docs/STATUS.md`를 **그 자리에서 다시 만들어 맞대 본다** —
// 어긋나면 `pnpm check`가 서고 `pnpm status`로 고친다.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const status = readFileSync(resolve(ROOT, 'docs/STATUS.md'), 'utf8')

describe('남은 일 대장', () => {
  it('임자 문서와 같다', () => {
    // 도구가 스스로 맞대고 다르면 1로 나간다 — 여기서는 그 판정만 받는다
    const run = () => execFileSync(
      process.execPath, [resolve(ROOT, 'tools/docs/status.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    expect(run).not.toThrow()
  })

  // ⚠️ **손으로 고치면 다음 `pnpm status`가 지운다.** 그 사실이 파일 안에 적혀
  // 있어야 한다 — 안 적혀 있으면 누군가 여기에 줄을 더하고 그것이 조용히 사라진다
  it('생성물이라고 제 안에 적혀 있다', () => {
    expect(status).toContain('손으로 고치지 않는다')
    expect(status).toContain('pnpm status')
  })

  // 갈래가 하나 통째로 빠지면 「남은 것이 없다」로 읽힌다. 다섯이 다 있어야 한다
  it('갈래 다섯을 다 싣는다', () => {
    for (const head of [
      '공개 배포를 막을 수 있는 자리',
      '우리가 만든 자리가 어긋난 것',
      '원작에 있는데 우리는 반쯤인 것',
      '화면에 아직 안 서는 것',
      '알고 남겨 둔 것',
    ]) expect(status, head).toContain(head)
  })

  // ⚠️ **기계마다 달라지면 못 맞댄다.** blocker의 지금 상태는 `dist/`·`.audit/`을
  // 읽는데 그 둘은 저장소에 없다 — 대장에 「통과·실패」가 적히기 시작하면 이
  // 시험이 다른 기계에서 선다
  it('지금 통과했는지는 안 적는다', () => {
    for (const word of ['PASS', 'FAIL', '✅', '❌']) {
      expect(status, word).not.toContain(word)
    }
  })
})

// ⚠️ **문서를 옮기거나 지우면 다른 문서의 링크가 조용히 죽는다.** 120개가 서로를
// 걸고 있어서 눈으로는 못 센다 — 특히 「다 하면 이 문서는 지운다」가 적힌
// 문서들(REPAIR)이 그렇다
describe('문서끼리 거는 링크', () => {
  it('가리키는 문서가 다 있다', () => {
    const files = [
      ...readdirSync(resolve(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
      'README.md',
    ]
    const dead = []
    for (const file of files) {
      const from = dirname(resolve(ROOT, file))
      for (const m of readFileSync(resolve(ROOT, file), 'utf8').matchAll(/\]\(([^)#\s]+\.md)(#[^)]*)?\)/g)) {
        // 바깥 주소는 여기서 안 본다 — 인터넷을 타는 시험을 만들지 않는다
        if (/^https?:/.test(m[1])) continue
        if (!existsSync(resolve(from, m[1]))) dead.push(`${file} → ${m[1]}`)
      }
    }
    expect(dead).toEqual([])
  })
})
