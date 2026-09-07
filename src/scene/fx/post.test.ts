// 후처리가 실패했을 때 (기획서 RP-04 · RP-05 · RP-06)
//
// ⚠️ **여기서 재는 것은 「예쁘게 그려지는가」가 아니라 「터졌을 때 게임이 도는가」다.**
// 실제 셰이더가 어느 기계에서 터지는지는 GPU마다 다르지만, 터졌을 때 무엇을
// 해야 하는지는 기계와 무관하다 — 그래서 그 판단만 떼어 여기서 잰다.
import { describe, expect, it, vi } from 'vitest'
import { OrthographicCamera, PerspectiveCamera, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { createPostChain, ladder } from './post'

/** 사다리 한 칸의 대역. 언제 무엇이 불렸는지만 적는다 */
function step(name: 'outline' | 'bloom', opts: { throws?: boolean } = {}) {
  const log = { rendered: 0, synced: 0, disposed: 0 }
  return {
    log,
    built: {
      step: name,
      render() {
        log.rendered++
        if (opts.throws === true) throw new Error(`${name}가 그리다 터졌다`)
      },
      syncSize() { log.synced++ },
      dispose() { log.disposed++ },
    },
  }
}

describe('물러남 사다리', () => {
  it('첫 render가 터지면 아래 칸으로 내려가 그 프레임을 그린다', () => {
    // ⚠️ **이것이 RP-04가 가리키는 자리다.** 셰이더는 게으르게 구워지므로
    // 생성은 멀쩡하고 **첫 `render()`에서** 터진다. 옛 코드는 생성만 감쌌다
    const outline = step('outline', { throws: true })
    const bloom = step('bloom')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const chain = ladder((s) => (s === 'outline' ? outline.built : bloom.built))
      expect(chain).not.toBeNull()
      // 그 프레임이 검게 나가지 않는다 — 아래 칸이 그렸다
      expect(chain?.render()).toBe(true)
      expect(outline.log.rendered).toBe(1)
      expect(bloom.log.rendered).toBe(1)
      // 물러나면서 쥔 것을 놓는다 (RP-05)
      expect(outline.log.disposed).toBe(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('갈 곳이 없으면 false — 부르는 쪽이 기본 렌더를 한다', () => {
    const outline = step('outline', { throws: true })
    const bloom = step('bloom', { throws: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const chain = ladder((s) => (s === 'outline' ? outline.built : bloom.built))
      expect(chain?.render()).toBe(false)
      expect(outline.log.disposed).toBe(1)
      expect(bloom.log.disposed).toBe(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('떨어진 칸을 프레임마다 다시 세우지 않는다', () => {
    // ⚠️ **여기가 「고쳤는데 더 느려졌다」가 되는 자리다.** 프레임마다 다시
    // 만들면 같은 예외를 초당 예순 번 내면서 렌더 타깃을 매번 새로 할당한다
    let builds = 0
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const chain = ladder((s) => { builds++; return step(s, { throws: true }).built })
      for (let i = 0; i < 200; i++) expect(chain?.render()).toBe(false)
      // 윤곽 한 번 · 블룸 한 번. 그 뒤로는 아무것도 안 세운다
      expect(builds).toBe(2)
      // 콘솔도 마찬가지다 — 물러난 두 번과 껐다는 한 번뿐
      expect(warn).toHaveBeenCalledTimes(3)
    } finally {
      warn.mockRestore()
    }
  })

  it('그리기 전에 화면 크기를 맞춘다', () => {
    const outline = step('outline')
    const chain = ladder(() => outline.built)
    chain?.render()
    chain?.render()
    expect(outline.log.synced).toBe(2)
    // 창이 바뀌면 그 프레임을 기다리지 않고 바로 맞춘다 (RP-06)
    chain?.resize()
    expect(outline.log.synced).toBe(3)
  })

  it('dispose 뒤에는 아무것도 안 쥐고 있고 render는 false다', () => {
    const outline = step('outline')
    const chain = ladder(() => outline.built)
    chain?.dispose()
    expect(outline.log.disposed).toBe(1)
    expect(chain?.render()).toBe(false)
    // 두 번 놓아도 두 번 안 놓는다
    chain?.dispose()
    expect(outline.log.disposed).toBe(1)
  })

  it('한 칸도 못 세우면 null이다 — 부르는 쪽이 후처리 없이 간다', () => {
    expect(ladder(() => null)).toBeNull()
  })
})

/** 화면 크기를 몇 번 읽었는지 세는 가짜 렌더러 */
function fakeGl(size: { width: number, height: number }) {
  const reads = { width: 0 }
  const gl = {
    domElement: {
      get width() { reads.width++; return size.width },
      get height() { return size.height },
    },
  }
  return { gl: gl as unknown as WebGPURenderer, reads }
}

describe('진짜 체인 (GPU 없이)', () => {
  it('첫 render가 터져도 예외가 밖으로 안 나간다', () => {
    // ⚠️ **옛 코드에서는 이 예외가 `useFrame` 밖으로 나갔다.** 그러면 프레임
    // 루프째 서고, 화면은 검은 채로 멎으면서 입력만 살아 있다.
    //
    // 가짜 렌더러는 실제 GPU 호출에서 반드시 터지므로, 여기서 재는 것은
    // 「어떤 이유로든 그리다 터졌을 때」의 행동이다
    const { gl } = fakeGl({ width: 960, height: 640 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const chain = createPostChain(gl, new Scene(), new PerspectiveCamera())
      expect(chain).not.toBeNull()
      expect(() => chain?.render()).not.toThrow()
      expect(chain?.render()).toBe(false)
      expect(() => chain?.dispose()).not.toThrow()
    } finally {
      warn.mockRestore()
    }
  })

  it('화소 간격을 만들 때 굽지 않고 지금 타깃에서 낸다', () => {
    // ⚠️ **이것이 RP-06이다.** 한때 `1.4 / domElement.width`를 만들 때 한 번
    // 계산해 **숫자로 박아 넣었다.** 구운 UV 간격은 화소로 치면 창 크기에
    // 끌려간다 — 960에서 구워 1920에서 쓰면 1.4화소가 2.8화소가 되어 선이
    // 굵고 흐려지고, 480에서는 0.7화소가 되어 끊긴다.
    //
    // 밖에서 볼 수 있는 사실은 하나다: **그릴 때마다 지금 크기를 다시 읽는가**
    const { gl, reads } = fakeGl({ width: 960, height: 640 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const chain = createPostChain(gl, new Scene(), new PerspectiveCamera())
      const atBuild = reads.width
      expect(atBuild).toBeGreaterThan(0)
      chain?.resize()
      expect(reads.width).toBeGreaterThan(atBuild)
      chain?.dispose()
    } finally {
      warn.mockRestore()
    }
  })

  it('원근 카메라가 아니면 윤곽을 건너뛰고 블룸으로 선다', () => {
    // 시점 공간 되돌리기(`perspectiveDepthToViewZ`)가 성립하지 않는 카메라다.
    // **그래도 체인은 서야 한다** — 후처리가 아예 없는 것과 윤곽만 없는 것은 다르다
    const { gl } = fakeGl({ width: 960, height: 640 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const chain = createPostChain(gl, new Scene(), new OrthographicCamera(-1, 1, 1, -1))
      expect(chain).not.toBeNull()
      chain?.dispose()
    } finally {
      warn.mockRestore()
    }
  })
})
