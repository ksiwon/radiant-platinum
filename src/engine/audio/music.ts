// 음악 재생 (DATA.md §2.18)
//
// 곡 번호를 받아 소리를 낸다. 번호는 지어낸 것이 아니라 **맵 헤더가 들고 있는
// 것**이다 — `maps.json`의 `bgmDay`·`bgmNight` 1186개가 전부 SDAT의 곡을
// 가리키고 없는 번호가 하나도 없다.
//
// 브라우저는 사용자가 건드리기 전에는 소리를 못 낸다. 그래서 `resume()`을
// 먼저 부르는 것이 아니라 **첫 입력 때 깨운다**.
import { getAudioContext, onAudioUnlock } from './unlock'
import { RingCounter, type Ring } from './ringing'
import { assets, readJson } from '../../data/providers/assetProvider'
import type { RenderReply, RenderRequest } from './renderWorker'

/** 곡 하나를 얼마나 길게 펴 볼 것인가 (초). 도돌이표를 만나면 거기서 멈춘다 */
const MAX_SECONDS = 240
/** 효과음·울음소리는 짧다. 도돌이표가 없으니 표본이 떨어지면 거기서 끝난다 */
const SHORT_SECONDS = 8

/**
 * 울음소리는 곡 하나를 **파형 창고만 갈아 끼워** 낸다.
 *
 * `Sound_PlayPokemonCry`가 `NNS_SndArcPlayerStartSeqEx(…, waveID, …, SEQ_PV)`를
 * 부른다 — 악보는 늘 `SEQ_PV`(곡 2)이고 창고 번호에 **종족 번호를 그대로** 넣는다.
 * 실제로 SDAT의 `WAVE_ARC_PV001`이 색인 1이고, 창고 1~494가 전부 표본 하나짜리다.
 *
 * 악보는 음 하나뿐이다: 템포 100 · 악기 0 · 볼륨 127 · 팬 64 · **음 60, 길이 0**.
 * 길이 0은 "표본이 끝날 때까지"라는 뜻이라 게이트로 끊지 않는다
 */
const CRY_SEQ = 2
const CRY_BANK = 1
/** 종족 번호가 이 위로 가면 창고가 없다 */
export const MAX_CRY_SPECIES = 494
/**
 * 기절할 때 낮추는 반음 수.
 *
 * `sound_playback.c`의 `POKECRY_FAINT`가 `SOUND_SEMITONES(-3.5)`를 건다
 */
export const FAINT_SEMITONES = -3.5
/** 곡을 바꿀 때 겹치는 시간 (초) */
const FADE = 0.6
/**
 * 소리 하나를 "아직 울리는 중"으로 셀 수 있는 최대 시간 (ms).
 *
 * 펴는 데 걸리는 시간 + 소리 길이(`SHORT_SECONDS`)를 넉넉히 덮는다. 소리
 * 길이를 알게 되면 곧바로 그 값으로 줄인다 (`ring`의 `by`) — 이 값은 **길이를
 * 알기 전에 죽는 경우**만을 위한 것이다
 */
const RING_CAP_MS = 15_000
/**
 * 받아 둔 것을 몇 개까지 들고 있나.
 *
 * BGM과 짧은 소리를 따로 세는 이유: BGM 하나가 2분이면 20MB인데 효과음·울음소리는
 * 한 개에 수십~수백 KB다. 한 통에 넣고 4개로 끊으면 **메뉴 소리가 곡 하나에
 * 밀려 나가서** 누를 때마다 452KB짜리 창고를 다시 받는다
 */
const CACHE = 3
const SHORT_CACHE = 32

interface SoundIndex {
  songs: ({ name: string | null; bank: number; volume: number } | null)[]
  banks: ({ wars: (number | null)[] } | null)[]
}

interface Playing {
  song: number
  source: AudioBufferSourceNode
  gain: GainNode
}

export class Music {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  /** 곡들이 붙는 자리. 여기서 스테레오·모노가 갈린다 */
  private bus: GainNode | null = null
  private mono = false
  private worker: Worker | null = null
  private index: Promise<SoundIndex> | null = null
  private files = new Map<string, Promise<ArrayBuffer>>()
  private buffers = new Map<string, AudioBuffer & { loop?: [number, number] }>()
  private order: string[] = []
  private pending = new Map<number, (r: RenderReply) => void>()
  private seq = 0
  private now: Playing | null = null
  /** 마지막으로 요청된 곡. 렌더가 늦게 끝나도 이 곡이 아니면 버린다 */
  private want: number | null = null
  /** 깨어나기 전에 들어온 미리 펴기 요청 */
  private warmQueue = new Set<number>()
  private volume = 0.7
  /**
   * 지금 울리고 있는 한 번짜리 소리들.
   *
   * 스크립트가 `WaitSE`로 **소리가 끝날 때까지 선다**(`Sound_IsEffectPlaying`).
   * 그 물음에 답하려면 무엇이 울리는 중인지 알아야 한다. 같은 번호가 겹쳐 날 수
   * 있으므로 수를 센다 — 두 번 낸 소리 하나가 끝났다고 "끝났다"고 하면 안 된다.
   *
   * ⚠️ 시간 상한이 왜 붙어 있는지는 `ringing.ts` 머리말에 있다 — 없으면
   * 소리 하나가 안 끝나는 것으로 **게임이 멈춘다**
   */
  private readonly ringing = new RingCounter(RING_CAP_MS)
  /** 울음소리도 같은 함정이 있다 (`WaitCry`). 번호가 없으므로 한 칸만 쓴다 */
  private readonly cries = new RingCounter(RING_CAP_MS)

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
    if (this.warmQueue.size > 0) {
      const queued = [...this.warmQueue]
      this.warmQueue.clear()
      void this.prewarm(queued)
    }
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
    this.index ??= readJson(assets(), 'data/sound/index.json') as Promise<SoundIndex>
    return this.index
  }

  private file(rel: string): Promise<ArrayBuffer> {
    let got = this.files.get(rel)
    if (!got) {
      got = assets().bytes(`data/sound/${rel}`)
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

  /**
   * 곡 하나를 펴서 재생 버퍼로.
   *
   * `warOverride`가 있으면 악기표가 가리키는 창고 대신 그것을 쓴다 —
   * 울음소리가 이 길로 간다
   */
  private async render(
    key: string, song: number,
    extra?: { warOverride?: number; maxSeconds?: number; transpose?: number },
  ): Promise<(AudioBuffer & { loop?: [number, number] }) | null> {
    const cached = this.buffers.get(key)
    if (cached) return cached
    const ctx = this.ctx
    if (!ctx) return null

    const index = await this.getIndex()
    const meta = index.songs[song]
    if (!meta) return null
    const bank = index.banks[meta.bank]
    if (!bank) return null
    const wars = extra?.warOverride === undefined
      ? bank.wars
      : [extra.warOverride, null, null, null]

    const [seq, bnk, ...war] = await Promise.all([
      this.file(`seq/${String(song)}.bin`),
      this.file(`bnk/${String(meta.bank)}.bin`),
      ...wars.map((w) => (w === null ? Promise.resolve(null) : this.file(`war/${String(w)}.bin`))),
    ])

    const id = ++this.seq
    const reply = await new Promise<RenderReply>((resolve) => {
      this.pending.set(id, resolve)
      const req: RenderRequest = {
        // 워커가 버퍼를 가져가 버리면 캐시가 비므로 복사해서 보낸다
        id, seq: seq.slice(0), bnk: bnk.slice(0),
        wars: war.map((w) => (w ? w.slice(0) : null)),
        opts: {
          sampleRate: ctx.sampleRate,
          maxSeconds: extra?.maxSeconds ?? MAX_SECONDS,
          volume: meta.volume,
          transpose: extra?.transpose,
        },
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

    this.buffers.set(key, buf)
    this.order.push(key)
    this.evict(key)
    return buf
  }

  /** 종류별로 따로 센다 */
  private evict(keep: string): void {
    for (const [prefix, limit] of [['bgm:', CACHE], ['se:', SHORT_CACHE], ['cry:', SHORT_CACHE]] as const) {
      const mine = this.order.filter((k) => k.startsWith(prefix))
      for (let i = 0; i < mine.length - limit; i++) {
        const drop = mine[i]!
        if (drop === keep) continue
        this.buffers.delete(drop)
        this.order.splice(this.order.indexOf(drop), 1)
      }
    }
  }

  /** 곡을 튼다. 이미 그 곡이면 아무것도 안 한다 */
  async play(song: number): Promise<void> {
    this.want = song
    if (!this.ctx || !this.bus) return
    if (this.now?.song === song) return

    const buf = await this.render(`bgm:${String(song)}`, song)
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

  /**
   * 한 번 울리고 마는 소리. BGM 위에 겹쳐 난다.
   *
   * 여러 개가 동시에 나도 되므로 붙였다 끝나면 떼기만 한다 — BGM처럼 하나만
   * 살아 있을 이유가 없다
   */
  private oneShot(buf: AudioBuffer, gain: number, tag?: Ring): void {
    const ctx = this.ctx, bus = this.bus
    if (!ctx || !bus) { tag?.release(); return }
    const g = ctx.createGain()
    g.gain.value = gain
    g.connect(bus)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(g)
    src.onended = () => { g.disconnect(); tag?.release() }
    src.start()
    // ⚠️ **`onended`만 믿으면 안 된다.** 문맥이 멈춰 있으면(`suspended`) 소스가
    // 영영 안 끝나고, 그러면 아래 `isEffectPlaying`이 영영 참이다. 소리 길이는
    // 이미 알고 있으므로 그만큼 지나면 끝난 것으로 센다
    tag?.by((buf.duration + 0.5) * 1000)
  }

  /** 이 소리가 아직 울리는가 (`Sound_IsEffectPlaying`) */
  isEffectPlaying(song: number): boolean {
    return this.ringing.has(song)
  }

  /** 울음소리가 아직 울리는가 (`Sound_IsPokemonCryPlaying`) */
  isCryPlaying(): boolean {
    return this.cries.has(CRY_SEQ)
  }

  /** 지금 트는 곡. 없으면 null */
  get playing(): number | null {
    return this.now?.song ?? null
  }

  /**
   * 지금 곡의 소리만 줄였다 키운다 (`Sound_FadeOutBGM` · `Sound_FadeInBGM`).
   *
   * 곡을 갈지 않는다 — 컷신이 "곡이 잦아들었다가 되살아난다"를 만드는 자리라
   * 도중에 다시 시작하면 안 된다. 원작 음량은 0~127이다
   *
   * @param volume 0~127
   * @param frames 60분의 1초 단위
   */
  fadeVolume(volume: number, frames: number): void {
    const ctx = this.ctx
    if (!ctx || !this.now) return
    const seconds = Math.max(1, frames) / 60
    // `setTargetAtTime`은 지수라 시상수의 세 배쯤에서 거의 다 간다
    this.now.gain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, volume / 127)), ctx.currentTime, seconds / 3,
    )
  }

  /**
   * 나중에 쓸 소리를 미리 펴 둔다.
   *
   * 메뉴 소리가 뱅크 700을 쓰는데 그 창고가 452KB다 — 처음 커서를 움직일 때
   * 받기 시작하면 **첫 소리를 놓친다.** 나머지 여덟은 창고를 나눠 써서 4KB씩이다
   */
  async prewarm(songs: readonly number[]): Promise<void> {
    // 아직 안 깨어났으면 적어 뒀다가 깨울 때 한다 — 타이틀에서 미리 부를 수 있다
    if (!this.ctx) { for (const s of songs) this.warmQueue.add(s); return }
    for (const song of songs) {
      await this.render(`se:${String(song)}`, song, { maxSeconds: SHORT_SECONDS })
    }
  }

  /** 효과음 하나 */
  async playEffect(song: number, gain = 1): Promise<void> {
    if (!this.ctx) return
    const done = this.ringing.start(song)
    // ⚠️ **터져도 놓아 준다.** 여기서 던지면 `void`로 부른 쪽은 아무것도 못
    // 하고, 센 것이 안 돌아와 `WaitSE`가 영영 선다
    let buf = null
    try {
      buf = await this.render(`se:${String(song)}`, song, { maxSeconds: SHORT_SECONDS })
    } catch { /* 소리만 빠진다 — 게임은 계속 돈다 */ }
    if (!buf) { done.release(); return }
    this.oneShot(buf, gain, done)
  }

  /** 나는 중인 소리를 끊는다 (`Sound_StopEffect`) */
  stopEffect(song: number): void {
    // 이미 붙은 소스를 되찾을 길이 없다. 끝난 것으로만 표시해 `WaitSE`가 안 멎게 한다
    this.ringing.clear(song)
  }

  /**
   * 울음소리 하나.
   *
   * `SEQ_PV`에 창고만 종족 것으로 갈아 끼운다. 기절할 때는 원작대로 3.5반음
   * 내린다
   */
  async playCry(species: number, opts?: { faint?: boolean }): Promise<void> {
    if (!this.ctx) return
    if (species < 1 || species > MAX_CRY_SPECIES) return
    const faint = opts?.faint === true
    const cry = this.cries.start(CRY_SEQ)
    let buf = null
    try {
      buf = await this.render(
        `cry:${String(species)}${faint ? ':faint' : ''}`, CRY_SEQ,
        {
          warOverride: species,
          maxSeconds: SHORT_SECONDS,
          transpose: faint ? FAINT_SEMITONES : undefined,
        },
      )
    } catch { /* 울음소리만 빠진다 */ }
    if (!buf) { cry.release(); return }
    this.oneShot(buf, 1, cry)
  }
}

/** 울음소리가 쓰는 악보와 악기표. 시험이 본다 */
export const CRY_SOURCE = { seq: CRY_SEQ, bank: CRY_BANK }

/** 게임에 하나뿐이다 */
export const music = new Music()

onAudioUnlock(() => { music.wake() })
