// 음악 재생 (DATA.md §2.18)
//
// 곡 번호를 받아 소리를 낸다. 번호는 지어낸 것이 아니라 **맵 헤더가 들고 있는
// 것**이다 — `maps.json`의 `bgmDay`·`bgmNight` 1186개가 전부 SDAT의 곡을
// 가리키고 없는 번호가 하나도 없다.
//
// 브라우저는 사용자가 건드리기 전에는 소리를 못 낸다. 그래서 `resume()`을
// 먼저 부르는 것이 아니라 **첫 입력 때 깨운다**.
import { getAudioContext, onAudioUnlock } from './unlock'
import type { RenderReply, RenderRequest } from './renderWorker'

/** 곡 하나를 얼마나 길게 펴 볼 것인가 (초). 도돌이표를 만나면 거기서 멈춘다 */
const MAX_SECONDS = 240
/** 곡을 바꿀 때 겹치는 시간 (초) */
const FADE = 0.6
/** 받아 둔 곡을 몇 개까지 들고 있나. 한 곡이 20MB까지 간다 */
const CACHE = 4

export interface SoundIndex {
  songs: ({ name: string | null; bank: number; volume: number } | null)[]
  banks: ({ wars: (number | null)[] } | null)[]
}

interface Playing {
  song: number
  source: AudioBufferSourceNode
  gain: GainNode
}

const BASE = import.meta.env.BASE_URL

export class Music {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  /** 곡들이 붙는 자리. 여기서 스테레오·모노가 갈린다 */
  private bus: GainNode | null = null
  private mono = false
  private worker: Worker | null = null
  private index: Promise<SoundIndex> | null = null
  private files = new Map<string, Promise<ArrayBuffer>>()
  private buffers = new Map<number, AudioBuffer & { loop?: [number, number] }>()
  private order: number[] = []
  private pending = new Map<number, (r: RenderReply) => void>()
  private seq = 0
  private now: Playing | null = null
  /** 마지막으로 요청된 곡. 렌더가 늦게 끝나도 이 곡이 아니면 버린다 */
  private want: number | null = null
  private volume = 0.7

  /**
   * 소리를 낼 수 있게 만든다.
   *
   * 브라우저는 사용자가 건드리기 전에는 `AudioContext`를 안 돌려 준다.
   * `unlock`이 첫 제스처를 잡고 있으므로 여기 얹기만 한다 — 그 전에 `play()`가
   * 불려도 곡 번호는 기억해 뒀다가 깨어날 때 튼다
   */
  wake(): void {
    if (this.ctx) { void this.ctx.resume(); return }
    this.ctx = getAudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(this.ctx.destination)
    this.bus = this.ctx.createGain()
    this.route()
    if (this.want !== null) void this.play(this.want)
  }

  /**
   * 설정의 **스테레오 · 모노**를 실제로 건다 (원작 옵션 17·18번).
   *
   * 좌우를 반씩 섞어 양쪽에 같은 것을 보낸다. 버퍼를 다시 굽지 않고 그래프만
   * 바꾸는 것은 곡 도중에 설정을 바꿔도 끊기지 않게 하려는 것이다
   */
  setMono(mono: boolean): void {
    if (this.mono === mono) return
    this.mono = mono
    this.route()
  }

  private route(): void {
    const ctx = this.ctx, bus = this.bus, master = this.master
    if (!ctx || !bus || !master) return
    bus.disconnect()
    if (!this.mono) { bus.connect(master); return }
    const split = ctx.createChannelSplitter(2)
    const sum = ctx.createGain()
    sum.gain.value = 0.5
    const merge = ctx.createChannelMerger(2)
    bus.connect(split)
    split.connect(sum, 0)
    split.connect(sum, 1)
    sum.connect(merge, 0, 0)
    sum.connect(merge, 0, 1)
    merge.connect(master)
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
    }
  }

  get awake(): boolean { return this.ctx !== null }

  private getIndex(): Promise<SoundIndex> {
    this.index ??= fetch(`${BASE}data/sound/index.json`).then((r) => r.json() as Promise<SoundIndex>)
    return this.index
  }

  private file(rel: string): Promise<ArrayBuffer> {
    let got = this.files.get(rel)
    if (!got) {
      got = fetch(`${BASE}data/sound/${rel}`).then((r) => {
        if (!r.ok) throw new Error(`${rel}을 못 받았다`)
        return r.arrayBuffer()
      })
      this.files.set(rel, got)
    }
    return got
  }

  private getWorker(): Worker {
    this.worker ??= (() => {
      const w = new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<RenderReply>) => {
        const done = this.pending.get(e.data.id)
        this.pending.delete(e.data.id)
        done?.(e.data)
      }
      return w
    })()
    return this.worker
  }

  /** 곡 하나를 펴서 재생 버퍼로 */
  private async render(song: number): Promise<(AudioBuffer & { loop?: [number, number] }) | null> {
    const cached = this.buffers.get(song)
    if (cached) return cached
    const ctx = this.ctx
    if (!ctx) return null

    const index = await this.getIndex()
    const meta = index.songs[song]
    if (!meta) return null
    const bank = index.banks[meta.bank]
    if (!bank) return null

    const [seq, bnk, ...wars] = await Promise.all([
      this.file(`seq/${String(song)}.bin`),
      this.file(`bnk/${String(meta.bank)}.bin`),
      ...bank.wars.map((w) => (w === null ? Promise.resolve(null) : this.file(`war/${String(w)}.bin`))),
    ])

    const id = ++this.seq
    const reply = await new Promise<RenderReply>((resolve) => {
      this.pending.set(id, resolve)
      const req: RenderRequest = {
        // 워커가 버퍼를 가져가 버리면 캐시가 비므로 복사해서 보낸다
        id, seq: seq.slice(0), bnk: bnk.slice(0),
        wars: wars.map((w) => (w ? w.slice(0) : null)),
        opts: { sampleRate: ctx.sampleRate, maxSeconds: MAX_SECONDS, volume: meta.volume },
      }
      this.getWorker().postMessage(req)
    })
    if (reply.error || reply.left.length === 0) return null

    const buf = ctx.createBuffer(2, reply.left.length, reply.sampleRate) as
      AudioBuffer & { loop?: [number, number] }
    // 워커에서 온 배열은 `ArrayBufferLike`로 잡힌다. 공유 버퍼가 아닌 것을 안다
    buf.copyToChannel(reply.left as Float32Array<ArrayBuffer>, 0)
    buf.copyToChannel(reply.right as Float32Array<ArrayBuffer>, 1)
    if (reply.loopStart !== null && reply.loopEnd !== null && reply.loopEnd > reply.loopStart) {
      buf.loop = [reply.loopStart / reply.sampleRate, reply.loopEnd / reply.sampleRate]
    }

    this.buffers.set(song, buf)
    this.order.push(song)
    while (this.order.length > CACHE) {
      const drop = this.order.shift()
      if (drop !== undefined && drop !== song) this.buffers.delete(drop)
    }
    return buf
  }

  /** 곡을 튼다. 이미 그 곡이면 아무것도 안 한다 */
  async play(song: number): Promise<void> {
    this.want = song
    if (!this.ctx || !this.bus) return
    if (this.now?.song === song) return

    const buf = await this.render(song)
    // 펴는 동안 다른 곡을 요청받았으면 버린다
    if (!buf || this.want !== song || !this.ctx || !this.bus) return
    if (this.now?.song === song) return

    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(this.bus)
    const source = ctx.createBufferSource()
    source.buffer = buf
    if (buf.loop) {
      source.loop = true
      source.loopStart = buf.loop[0]
      source.loopEnd = buf.loop[1]
    }
    source.connect(gain)
    source.start()
    gain.gain.setTargetAtTime(1, ctx.currentTime, FADE / 3)

    this.stopNow(FADE)
    this.now = { song, source, gain }
  }

  /** 지금 곡을 서서히 끈다 */
  private stopNow(fade: number): void {
    const old = this.now
    const ctx = this.ctx
    if (!old || !ctx) return
    this.now = null
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3)
    old.source.stop(ctx.currentTime + fade)
    old.source.onended = () => { old.gain.disconnect() }
  }

  stop(): void {
    this.want = null
    this.stopNow(FADE)
  }
}

/** 게임에 하나뿐이다 */
export const music = new Music()

onAudioUnlock(() => { music.wake() })
