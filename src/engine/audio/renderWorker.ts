// 곡을 딴 실에서 편다
//
// 렌더 자체는 빠르지만(2분짜리가 수백 밀리초) 그만큼 메인 실이 멈추면 걸어가던
// 중에 화면이 툭 선다. 맵을 넘을 때마다 그러면 안 되므로 워커로 뺀다.
//
// 결과는 `Float32Array` 둘이라 **옮겨 준다**(transfer). 복사하면 2분짜리가
// 20MB를 두 번 오간다.
/// <reference lib="webworker" />
import { renderSong, type RenderOptions } from './render'

declare const self: DedicatedWorkerGlobalScope

export interface RenderRequest {
  id: number
  seq: ArrayBuffer
  bnk: ArrayBuffer
  wars: (ArrayBuffer | null)[]
  opts: RenderOptions
}

export interface RenderReply {
  id: number
  left: Float32Array
  right: Float32Array
  sampleRate: number
  loopStart: number | null
  loopEnd: number | null
  stolen: number
  error?: string
}

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  const { id, seq, bnk, wars, opts } = e.data
  try {
    const out = renderSong(seq, bnk, wars, opts)
    // subarray는 원래 버퍼를 공유한다. 옮기려면 제 버퍼를 가져야 한다
    const left = new Float32Array(out.left)
    const right = new Float32Array(out.right)
    const reply: RenderReply = {
      id, left, right,
      sampleRate: out.sampleRate,
      loopStart: out.loopStart,
      loopEnd: out.loopEnd,
      stolen: out.stolen,
    }
    self.postMessage(reply, [left.buffer, right.buffer])
  } catch (err) {
    const reply: RenderReply = {
      id, left: new Float32Array(0), right: new Float32Array(0),
      sampleRate: opts.sampleRate, loopStart: null, loopEnd: null, stolen: 0,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(reply)
  }
}
