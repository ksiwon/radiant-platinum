// 깨어진 세계 소품 ↔ 노드 산출물 parity (DATA.md §2.2 · DEPLOY §5 ⑨)
//
// ⚠️ **이 시험이 없어서 낡은 산출물이 새어 나갔다.** 조각을 제 노드 자리에
// 놓는 고침이 들어간 날, `pnpm extract:distortionProps`를 안 돌린 개발 나무가
// 그대로 남아 `38.bin` 하나가 브라우저 변환기와 달랐다 — 그걸 잡은 것은 e2e
// 전체(25분)였다. 청크·소품·텍스처에는 이런 시험이 있는데(`chunks.test.ts`)
// 깨어진 세계 소품에만 없었다.
import { it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds } from './nds'
import { convertDistortionProps } from './distortionProps'
import { SUPPORTED } from './validate'
import { DATA, withRom, romPath, fileSource } from '../../data/romData.testkit'

const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!

withRom('en')('깨어진 세계 소품 — 굽는 쪽 둘이 바이트로 같다', () => {
  it('⚠️ 소품 39개가 다 같다', async () => {
    if (!existsSync(resolve(DATA, 'distortionProps/index.json'))) {
      expect.unreachable('public/data/distortionProps가 없다 — pnpm extract:distortionProps')
      return
    }
    const fs = await openNds(fileSource(romPath('en')!))
    const out = await convertDistortionProps({ fs: fs!, locale: 'en', release: EN })

    const diff: string[] = []
    let same = 0
    for (const [path, bytes] of out) {
      // 그림은 시트라 여기서 안 잰다 — 기하와 목차만 본다
      if (!path.endsWith('.bin') && !path.endsWith('.json')) continue
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) { diff.push(`${path}: 노드 쪽에 없다`); continue }
      const expected = readFileSync(file)
      if (expected.byteLength !== bytes.byteLength) {
        diff.push(`${path}: ${String(bytes.byteLength)}B ≠ ${String(expected.byteLength)}B`)
        continue
      }
      if (Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).equals(expected)) same++
      else diff.push(`${path}: 크기는 같은데 내용이 다르다`)
    }
    expect(diff.slice(0, 5), `${String(diff.length)}개가 어긋난다`).toEqual([])
    // 소품 39 + 목차
    expect(same).toBe(40)
  }, 300_000)
})
