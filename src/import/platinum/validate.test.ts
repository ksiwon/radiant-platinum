// Platinum 입력 검증 (IMPORT.md §5)
//
// 두 갈래로 잰다:
//
//   **가짜 롬** — 잘림·다른 게임·손댄 파일 수처럼 **실패해야 하는 것**들.
//                 진짜 롬으로는 못 만드는 상황이라 손으로 짓는다
//   **진짜 롬** — 개발 기계에 있을 때만. 지문 표가 실제와 맞는지 확인한다
//                 (`raw/`는 리포에 없으므로 없는 기계에서는 건너뛴다)
//
// ⚠️ 가짜 롬만 재면 "전부 거절한다"가 통과한다. 진짜 롬 쪽이 그걸 막는다.
import { describe, it, expect } from 'vitest'
import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import { bytesSource, narcCount, openNds, readHeader, type ByteSource } from './nds'
import { explain, SUPPORTED, validatePlatinum } from './validate'
import { withRom, romPath } from '../../data/romData.testkit'

// ── 가짜 롬 ──────────────────────────────────────────────────────────────────

/**
 * 헤더만 그럴듯한 128MB 원본.
 *
 * ⚠️ 실제로 128MB를 만들지 않는다 — 시험 하나에 그걸 열 번 만들면 1.3GB다.
 * `size`만 진짜라고 말하고 조각은 필요할 때 만든다
 */
function fakeRom(head: Partial<{
  title: string; gameCode: string; makerCode: string
  fntOffset: number; fntSize: number; fatOffset: number; fatSize: number
  overlaySize: number
}> = {}, size = SUPPORTED.sizeBytes): ByteSource {
  const header = new Uint8Array(0x200)
  const view = new DataView(header.buffer)
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) header[at + i] = text.charCodeAt(i)
  }
  put(0, head.title ?? SUPPORTED.title)
  put(12, head.gameCode ?? 'CPUE')
  put(16, head.makerCode ?? SUPPORTED.makerCode)
  view.setUint32(0x40, head.fntOffset ?? 0x1000, true)
  view.setUint32(0x44, head.fntSize ?? 0x100, true)
  view.setUint32(0x48, head.fatOffset ?? 0x2000, true)
  view.setUint32(0x4c, head.fatSize ?? 0x100, true)
  view.setUint32(0x50, 0x3000, true)
  view.setUint32(0x54, head.overlaySize ?? 32 * 100, true)

  return {
    size,
    slice(start, end) {
      const out = new Uint8Array(Math.max(0, Math.min(end, size) - start))
      if (start < header.length) out.set(header.subarray(start, Math.min(end, header.length)))
      return Promise.resolve(out)
    },
  }
}

describe('가짜 롬 — 거절해야 하는 것들', () => {
  it('크기가 다르면 한 조각도 안 읽고 거절한다', async () => {
    let read = 0
    const src: ByteSource = {
      size: 1024,
      slice: (s, e) => { read++; return Promise.resolve(new Uint8Array(e - s)) },
    }
    const got = await validatePlatinum(src)
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.step).toBe('size')
    // 128MB짜리를 상대로 하는 일이다. 크기로 걸러지는 것을 읽기 시작하면 안 된다
    expect(read).toBe(0)
  })

  it('다른 게임이면 헤더에서 거절한다', async () => {
    const got = await validatePlatinum(fakeRom({ title: 'MARIOKARTDS' }))
    expect(got.ok).toBe(false)
    if (!got.ok) {
      expect(got.step).toBe('header')
      expect(explain(got)).toContain('Platinum')
    }
  })

  it('오버레이 표가 없으면 거절한다', async () => {
    const got = await validatePlatinum(fakeRom({ overlaySize: 0 }))
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.why).toContain('오버레이')
  })

  it('모르는 지역판은 "잘못된 소유권"이라고 말하지 않는다', async () => {
    // ⚠️ IMPORT.md §5 끝 — 우리가 아는 판이 아닐 뿐이다
    const got = await validatePlatinum(fakeRom({ gameCode: 'CPUF' }))
    expect(got.ok).toBe(false)
    if (!got.ok) {
      expect(got.step).toBe('release')
      expect(got.why).toContain('CPUF')
      expect(got.why).not.toMatch(/불법|해적|소유/)
    }
  })

  it('⚠️ FAT가 파일 밖을 가리키면 헤더에서 선다', async () => {
    // 잘린 파일에서 실제로 나오는 모양이다. 범위를 안 보면 `slice`가 빈 배열을
    // 주고 **FAT 0칸짜리 "정상" 롬**이 만들어진다 — 그 다음 실패는 원인이 안 보인다
    const got = await validatePlatinum(fakeRom({ fatOffset: SUPPORTED.sizeBytes - 4 }))
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.step).toBe('header')
  })

  it('FNT가 자기 자신을 가리켜도 안 멈춘다', async () => {
    // 손상된 파일이 무한 재귀를 만드는 자리. 사용자가 아무 파일이나 고를 수 있다
    const fnt = new Uint8Array(0x100)
    const view = new DataView(fnt.buffer)
    view.setUint32(0, 8, true)       // 루트의 하위 오프셋
    view.setUint16(4, 0, true)
    fnt[8] = 0x81                     // 디렉터리 하나, 이름 1글자
    fnt[9] = 0x61                     // 'a'
    view.setUint16(10, 0xf000, true)  // ⚠️ 자기 자신
    const src: ByteSource = {
      size: SUPPORTED.sizeBytes,
      slice: (start) => Promise.resolve(start === 0x1000 ? fnt : new Uint8Array(0x100)),
    }
    // 헤더는 못 읽으니 openNds가 null을 주거나, 걷더라도 끝나야 한다
    const done = await Promise.race([
      openNds(src).then(() => 'done' as const),
      new Promise<'hung'>((r) => setTimeout(() => { r('hung') }, 2000)),
    ])
    expect(done).toBe('done')
  })
})

describe('NARC 머리 읽기', () => {
  it('NARC가 아니면 null이다', () => {
    expect(narcCount(new Uint8Array(4))).toBeNull()
    expect(narcCount(new Uint8Array(0))).toBeNull()
  })
})

// ── 진짜 롬 ──────────────────────────────────────────────────────────────────

withRom('en', 'ko', 'ja')('진짜 롬 — 지문 표가 실제와 맞는가', () => {
  /** 롬을 통째로 안 올린다. 시험도 브라우저와 같은 방식으로 읽는다 */
  function fileSource(path: string): ByteSource {
    const size = statSync(path).size
    return {
      size,
      slice(start, end) {
        const want = Math.max(0, Math.min(end, size) - start)
        const out = Buffer.alloc(want)
        const fd = openSync(path, 'r')
        try { readSync(fd, out, 0, want, start) } finally { closeSync(fd) }
        return Promise.resolve(new Uint8Array(out.buffer, out.byteOffset, out.byteLength))
      },
    }
  }

  for (const release of SUPPORTED.releases) {
    it(`${release.label}을(를) 통과시킨다`, async () => {
      const got = await validatePlatinum(fileSource(romPath(release.locale)!))
      // 실패했으면 왜인지가 그대로 보여야 한다
      expect(got.ok ? 'ok' : `${got.step}: ${got.why}`).toBe('ok')
      if (!got.ok) return

      expect(got.release.gameCode).toBe(release.gameCode)
      // ⚠️ **언어는 하나다.** 개발 모드에 세 벌이 있다는 이유로 공개판이 세
      // 언어를 기본 제공해서는 안 된다 (IMPORT.md §5)
      expect(got.locales).toEqual([release.locale])
      expect(got.measured.files).toBe(release.fileCount)
      expect(got.measured.overlays).toBeGreaterThan(0)
      expect(got.measured.samples['/msgdata/pl_msg.narc']).toBe(release.messageBanks)
    })
  }

  it('⚠️ 지역판을 대사 뱅크 수로 가른다 — 셋이 서로 다른 수다', () => {
    // 헤더의 게임 코드만 보면 손댄 롬이 통과한다. 안이 실제로 그 지역판인지는
    // 이 수가 말한다 (DATA.md §4.2.1 — us 724 / ko 714 / ja 709)
    const counts = SUPPORTED.releases.map((r) => r.messageBanks)
    expect(new Set(counts).size).toBe(counts.length)
  })

  it('헤더를 0x200바이트만 읽고도 판정에 필요한 것이 다 나온다', async () => {
    const head = await readHeader(fileSource(romPath('en')!))
    expect(head?.title).toBe(SUPPORTED.title)
    expect(head?.gameCode).toBe('CPUE')
    expect(head?.makerCode).toBe(SUPPORTED.makerCode)
  })

  it('바이트 원본과 파일 원본이 같은 것을 준다', async () => {
    // `bytesSource`는 시험·스파이크용이다. 두 원본이 갈리면 시험이 재는 것이
    // 실제와 달라진다
    const path = romPath('en')!
    const fd = openSync(path, 'r')
    const head = Buffer.alloc(0x200)
    readSync(fd, head, 0, 0x200, 0)
    closeSync(fd)
    const a = await readHeader(bytesSource(new Uint8Array(head)))
    const b = await readHeader(fileSource(path))
    expect(a).toEqual(b)
  })
})

describe('지문 표 자체', () => {
  it('세 지역판이 서로 다른 게임 코드를 갖는다', () => {
    const codes = SUPPORTED.releases.map((r) => r.gameCode)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('필수 파일 목록에 중복이 없다', () => {
    expect(new Set(SUPPORTED.requiredFiles).size).toBe(SUPPORTED.requiredFiles.length)
  })

  it('표본은 필수 목록 안에 있다 — 없는 것을 세면 늘 실패한다', () => {
    for (const path of Object.keys(SUPPORTED.sampleCounts)) {
      expect(SUPPORTED.requiredFiles, path).toContain(path)
    }
  })

  it('⚠️ 표에 원본 바이트도 전체 해시도 없다 (COPYRIGHT.md §2)', () => {
    const text = JSON.stringify(SUPPORTED)
    expect(text).not.toMatch(/[0-9a-f]{32,}/i)
    expect(text).not.toContain('.nds')
    expect(existsSync(resolve(__dirname, 'supported.json'))).toBe(true)
  })
})
