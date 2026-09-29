// 창기둥 영상 — 도는 한 벌 (`engine/world/spearPillarMovie` · `ScrCmd_2FB`)
//
// 차례는 엔진 쪽이 한 틱씩 돌고, 여기는 그 차례가 부르는 것을 게임에 잇는다:
//
//   글       창기둥 뱅크(234)를 필드 대사창에 올린다(`sayOurs`) — 쪽마다 A를 기다리는 것도 원작 글과 같다.
//            마지막 대사(26)는 누름을 안 기다리고 영상이 스스로 내린다(`dropOurs` · `Text_RemovePrinter`)
//   페이드   두 화면 밝기(`StartScreenFade`)는 페이드 덮개 — 글창까지 덮인다
//   밝기     3D · 바탕만의 밝기(`G2_SetBlendBrightness`)는 비쳐 보이는 한 겹(`screenTint`) — 글창 밑이다
//   소리     효과음 · 울음소리는 좌우와 높낮이까지, 곡은 필드 곡을 가로챈다(`fieldBgm.override`)
//
// 시계는 필드 틱이다(`MapStreamer`) — 페이드도 같은 틱으로 구른다. 그림은 `SpearPillarMovieStage`가 `movieLive.movie.shown`을
// 읽어 그린다. 모델을 받는 동안(최대 `READY_WAIT`)은 시작을 미룬다 — 원작은 세우는 틱에 다 싣는다
import {
  MOVIE_TEXT_BANK, MOVIE_TEXT_PLAYER, spearPillarMovieStart, spearPillarMovieTick, type MovieHost, type SpearPillarMovie,
} from '../engine/world/spearPillarMovie'
import { fadeColor, fadeDone, screenTint, startFade } from '../engine/script/fade'
import { dropOurs, sayOurs } from '../engine/script/field'
import { music } from '../engine/audio/music'
import { fieldBgm } from '../engine/audio/songs'
import { loadDialogueBank, type DataLocale } from '../data/gameData'
import { fillMenuText } from '../data/uiText'
import { useSaveStore } from '../state/saveStore'
import { useSpearPillarMovieStore } from '../state/spearPillarMovieStore'

/** 모델을 기다리는 가장 긴 틱 — 못 받아도 영상의 길이와 글은 원작대로 흐른다 */
const READY_WAIT = 300
const WHITE = fadeColor(0x7fff)
const BLACK = fadeColor(0)

export const movieLive: {
  movie: SpearPillarMovie | null
  /** 모델을 다 받았는가 (`SpearPillarMovieStage`) · 기다린 틱 */
  ready: boolean
  waited: number
  acc: number
} = { movie: null, ready: false, waited: 0, acc: 0 }

let bank: readonly string[] | null = null
let pendingText: number | null = null
let textOn = false
let textSerial = 0
let playerName = ''

function show(id: number): void {
  const raw = bank?.[id] ?? ''
  const text = id === MOVIE_TEXT_PLAYER ? fillMenuText(raw, [playerName]) : raw
  const serial = ++textSerial
  textOn = true
  void sayOurs(text).then(() => { if (serial === textSerial) textOn = false })
}

const host: MovieHost = {
  text: (id) => {
    if (bank === null) { pendingText = id; textOn = true; return }
    show(id)
  },
  textActive: () => textOn,
  textClose: () => {
    if (!textOn) return
    textSerial++
    textOn = false
    pendingText = null
    dropOurs()
  },
  fade: (steps, perStep, out, white) => { startFade(steps, perStep, out ? 0 : 1, white ? 0x7fff : 0) },
  fadeDone: () => fadeDone(),
  se: (seq, pan = 0, pitch = 0) => { void music.playEffect(seq, 1, { pan, pitch }) },
  cry: (species, pan, volume) => { void music.playCry(species, { pan, volume }) },
  bgm: (seq) => { fieldBgm.override = seq },
  bgmFade: (volume, frames) => { music.fadeVolume(volume, frames) },
}

/** 앱을 세운다 (`sub_020985E4`) — 필드가 이미 검게 닫혀 있다(붉은 사슬의 끝) */
export function startSpearPillarMovie(locale: DataLocale): void {
  const trainer = useSaveStore.getState().trainer
  playerName = trainer.name
  bank = null
  pendingText = null
  textOn = false
  loadDialogueBank(locale, MOVIE_TEXT_BANK)
    .then((b) => { bank = b })
    .catch(() => { bank = [] })
  // `FieldMap_FadeScreen(FADE_TYPE_BRIGHTNESS_OUT)` — 이미 검다
  startFade(6, 1, 0, 0)
  movieLive.movie = null
  movieLive.ready = false
  movieLive.waited = 0
  movieLive.acc = 0
  useSpearPillarMovieStore.getState().start()
}

function finish(): void {
  movieLive.movie = null
  screenTint.alpha = 0
  // 필드가 다시 서면 맵 곡으로 돌아간다 (`FieldSystem_StartFieldMap`)
  fieldBgm.override = null
  useSpearPillarMovieStore.getState().finish()
}

/** 필드 틱 — 도는 동안만 */
export function spearPillarMovieFrameTick(dt: number): void {
  if (!useSpearPillarMovieStore.getState().on) return
  movieLive.acc += Math.min(dt, 0.25) * 60
  let ticks = Math.floor(movieLive.acc)
  movieLive.acc -= ticks
  while (ticks-- > 0) {
    if (movieLive.movie === null) {
      // 앞 페이드(검정)가 끝나고 모델이 서면 앱을 연다
      if (!fadeDone()) continue
      if (!movieLive.ready && ++movieLive.waited < READY_WAIT) continue
      movieLive.movie = spearPillarMovieStart(host, useSaveStore.getState().trainer.gender === 'girl')
      continue
    }
    if (pendingText !== null && bank !== null) {
      const id = pendingText
      pendingText = null
      show(id)
    }
    if (!spearPillarMovieTick(movieLive.movie, host)) { finish(); return }
    const b = movieLive.movie.bright
    screenTint.alpha = Math.abs(b) / 16
    screenTint.color = b >= 0 ? WHITE : BLACK
  }
}
