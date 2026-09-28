// 페라페에게 들려줄 소리를 받는다 (`Sound_StartRecordingChatotCry` · `Sound_StopRecordingChatotCry`)
//
// 원작은 DS 마이크를 2kHz로 1초 받는다. 브라우저에서는 두 길이 있다:
//
//   ① **마이크** — `getUserMedia`. 처음 한 번 권한을 묻는다
//   ② **게임 소리** — 마이크를 못 쓰면(권한 거절 · 장치 없음 · 보안 출처가 아님) 스피커로 나가는 소리를
//      그대로 받는다(`music.output`). 원작 마이크도 DS 스피커의 곡을 같이 들었다 — 녹음 전에 곡을 끄지 않고
//      42로 줄이기만 한다(`FadeOutBGM 42, 10`). 그래서 마이크가 없어도 **그 자리의 곡을 배운다**
//
// 어느 쪽이든 받은 것을 4비트에 담을 만큼 키우고(`chatotGain`) 2kHz로 내린다(`toChatotSamples`).
//
// ⚠️ **`ScriptProcessorNode`를 쓴다.** 폐기 예정이지만 모든 브라우저에서 돌고, `AudioWorklet`은 모듈을
// 따로 실어야 해서 1초짜리 녹음 하나에 파일이 하나 는다. 받는 쪽은 1초면 끝난다
import { getAudioContext } from './unlock'
import { music } from './music'
import { chatotGain, toChatotSamples } from '../pokemon/chatotCry'

/** 어디서 받았나 — 마이크 또는 게임 소리 */
type ChatotSource = 'mic' | 'game'

interface Take {
  source: ChatotSource
  rate: number
  chunks: Float32Array[]
  length: number
  stop: () => void
}

let take: Take | null = null

/** 마지막으로 받은 것의 모양 — 진단이 읽는다 (`tools/e2e/_chatter`). 받은 적이 없으면 null */
interface ChatotTakeStats {
  source: ChatotSource
  /** 실제로 받은 길이(초) */
  seconds: number
  /** 키우기 전의 가장 큰 샘플(0~1) */
  peak: number
  /** 곱한 배율 (`chatotGain`) */
  gain: number
}
let lastStats: ChatotTakeStats | null = null

/** 마지막으로 받은 것의 모양 */
export function lastChatotTake(): ChatotTakeStats | null {
  return lastStats
}

/** 원작 버퍼가 1초다 (`CHATOT_CRY_WAVE_BUFFER_SIZE` 2000 ÷ 2kHz) */
const MAX_SECONDS = 1
/** 받는 덩이 크기. 48kHz에서 43ms다 */
const BLOCK = 2048

async function micStream(): Promise<MediaStream | null> {
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (media?.getUserMedia === undefined) return null
  try {
    // 원작 마이크는 소리를 다듬지 않는다 — 잡음 제거·반향 제거를 끈다. 크기만 브라우저가 맞춘다
    return await media.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    })
  } catch {
    return null
  }
}

/**
 * 받기 시작한다 (`TryRecordChatotCry`). 어디서 받는지를 돌려주고, 둘 다 안 되면 null이다 —
 * 그러면 원작처럼 「배우지 못했다」로 간다.
 *
 * 마이크 권한을 묻는 동안은 여기서 기다린다 — 원작은 곧바로 받기 시작하지만 브라우저는 사람이
 * 허락해야 한다
 */
export async function startChatotRecording(): Promise<ChatotSource | null> {
  stopTake()
  let ctx: AudioContext
  try { ctx = getAudioContext() } catch { return null }
  try { await ctx.resume() } catch { /* 이미 돈다 */ }

  const stream = await micStream()
  let input: AudioNode | null = null
  let source: ChatotSource
  if (stream !== null) {
    input = ctx.createMediaStreamSource(stream)
    source = 'mic'
  } else {
    input = music.output()
    source = 'game'
  }
  if (input === null) return null

  const node = ctx.createScriptProcessor(BLOCK, 1, 1)
  // 받는 것만 하고 소리는 안 낸다. 그래도 끝에 이어야 돈다
  const mute = ctx.createGain()
  mute.gain.value = 0
  const me: Take = {
    source,
    rate: ctx.sampleRate,
    chunks: [],
    length: 0,
    stop: () => {
      node.onaudioprocess = null
      try { input.disconnect(node) } catch { /* 이미 떨어졌다 */ }
      node.disconnect()
      mute.disconnect()
      for (const t of stream?.getTracks() ?? []) t.stop()
    },
  }
  const cap = ctx.sampleRate * MAX_SECONDS
  node.onaudioprocess = (e) => {
    if (me.length >= cap) return
    const got = e.inputBuffer.getChannelData(0)
    const keep = got.slice(0, Math.min(got.length, cap - me.length))
    me.chunks.push(keep)
    me.length += keep.length
  }
  input.connect(node)
  node.connect(mute)
  mute.connect(ctx.destination)
  take = me
  return source
}

function stopTake(): Take | null {
  const was = take
  take = null
  was?.stop()
  return was
}

/**
 * 받기를 멈추고 2kHz 8비트 2000샘플을 돌려준다 (`StopRecordingChatotCry` → `StoreRecordedChatotCry`).
 * 받는 중이 아니었으면 null이다
 */
export function stopChatotRecording(): Int8Array | null {
  const was = stopTake()
  if (was === null) return null
  const all = new Float32Array(was.length)
  let at = 0
  let peak = 0
  for (const c of was.chunks) { all.set(c, at); at += c.length }
  for (const v of all) if (Math.abs(v) > peak) peak = Math.abs(v)
  const gain = chatotGain(all)
  lastStats = { source: was.source, seconds: was.length / was.rate, peak, gain }
  return toChatotSamples(all, was.rate, gain)
}

/** 지금 받는 중인 곳. 안 받고 있으면 null */
export function chatotRecordingSource(): ChatotSource | null {
  return take?.source ?? null
}
