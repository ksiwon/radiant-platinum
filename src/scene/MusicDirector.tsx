// 어느 곡을 틀 것인가 (DATA.md §2.18)
//
// **곡 번호는 지어내지 않는다.** 맵 헤더가 `bgmDay`·`bgmNight`를 들고 있고,
// 헤더 593개가 내놓는 번호 1186개가 **전부** SDAT의 곡을 가리킨다(없는 번호 0개).
// 여기서 할 일은 지금 선 맵의 헤더에서 낮/밤을 고르고, 원작이 그 위에 얹는 것(파도타기 · 이야기 깃발 ·
// 자전거로드 · 가로채기)을 원작 차례로 얹는 것이다 (`audio/songs`의 `songForMap`).
//
// 낮/밤 경계는 하늘과 같은 표를 쓴다(`map/timeOfDay`) — 원작 `rtc.c`의 24칸이다.
// 다만 **하늘처럼 섞지 않는다.** 곡은 섞을 수 없으니 경계에서 갈아탄다.
//
// 배틀에 들어가면(조우 컷인의 첫 틱 — `scene/encounterCutIn`의 `cutInSong`) 필드 곡을 멈추고 배틀 곡으로 바꾼다. 나오면 되돌린다 —
// 필드 곡은 처음부터 다시 시작한다(원작도 그렇다).
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { music } from '../engine/audio/music'
import { SFX } from '../engine/audio/sfx'
import { songForMap } from '../engine/audio/songs'
import { battleSongFor } from '../engine/audio/battleSongs'
import { world } from '../engine/map/world'
import { useBattleStore } from '../state/battleStore'
import { useIntroStageStore } from '../state/introStageStore'
import { useOptionsStore } from '../state/optionsStore'
import { useSaveStore } from '../state/saveStore'
import { decodeChatotCry } from '../engine/pokemon/chatotCry'
import { worldState } from '../state/worldState'
import { fieldScripts } from '../engine/script/field'
import { previousMap } from './fieldServices'
import { cutInSong } from './encounterCutIn'

/** 몇 초마다 곡을 다시 고를지. 맵과 시간대만 보므로 자주 볼 이유가 없다 */
const CHECK_SECONDS = 1

export function MusicDirector() {
  /**
   * 오프닝이 서 있는 동안은 곡을 안 고른다.
   *
   * ⚠️ **오프닝 곡이 1초 만에 필드 곡에 덮였다.** 이 지휘자는 화면이 무엇이든
   * 맵 헤더만 보고 고르는데, 오프닝 뒤에서는 세계가 이미 흐르고 있어서
   * (`WorldLoader`는 같은 캔버스에 계속 떠 있다) **박사가 말하는 동안 그 맵의
   * 곡이 흘렀다.** 맵이 바뀔 때마다 또 갈아탔다 — 「배경음이 자꾸 바뀐다」는
   * 보고가 이것이다. 오프닝의 곡은 오프닝이 정한다 (`SEQ_OPENING`)
   */
  const intro = useIntroStageStore((s) => s.scene !== 'off')
  const phase = useBattleStore((s) => s.phase)
  /**
   * 무대가 다 섰는가 (`battleStore`의 `sceneReady`).
   *
   * ⚠️ **배틀 곡을 `phase`만 보고 틀면 빈 화면에서 먼저 난다.** 모델이 오기까지
   * 몇 초가 걸려서 곡·조우 연출·포켓몬이 따로 놀았다. 그동안은 **걷던 곳의
   * 곡을 그대로 둔다** — 컷인을 거치는 배틀은 컷인 첫 틱에 이미 배틀 곡이라(원작 `FieldTask_RunEncounterEffect`) 이 기다림이
   * 곡을 안 바꾸고, 컷인 없이 열리는 배틀만 여기서 기다린다
   */
  const sceneReady = useBattleStore((s) => s.sceneReady)
  const kind = useBattleStore((s) => s.kind)
  // 야생은 **누가 나왔는지**가 곡을 정한다. 기라티나는 전용 곡이다 (`songs.ts`)
  const foeSpecies = useBattleStore((s) => s.view?.active.p2a?.species ?? null)
  // 첫 상대의 분류가 배틀 곡을 고른다 (`EncEffects_GetEffectPair`) — 태그 배틀은 첫 상대다
  const foeClass = useBattleStore((s) => s.foes[0]?.classId ?? s.trainerClass)
  const doubles = useBattleStore((s) => s.doubles)
  const victorySong = useBattleStore((s) => s.victorySong)
  const sound = useOptionsStore((s) => s.sound)
  const since = useRef(0)
  const last = useRef<number | null>(null)

  // 원작 옵션 17·18번 (스테레오 · 모노)
  useEffect(() => { music.setMono(sound === 1) }, [sound])

  // 페라페가 배운 말 — 소리 체계가 세이브의 것을 가리킨다 (`SoundSystem_Init(chatotCry, …)`)
  const chatot = useSaveStore((s) => s.chatotCry)
  useEffect(() => { music.setChatotCry(decodeChatotCry(chatot)) }, [chatot])

  // 메뉴 소리는 미리 펴 둔다. 안 그러면 첫 커서 이동에서 452KB를 받느라 소리가 늦다
  useEffect(() => { void music.prewarm([SFX.MENU]) }, [])

  useFrame((_, delta) => {
    // 오프닝이 끝나면 필드 곡을 **다시 고르게** 남겨 둔다 — 마지막에 고른 것을
    // 그대로 들고 있으면 같은 곡이라는 이유로 안 틀고 오프닝 곡이 계속 흐른다
    if (intro) { last.current = null; return }
    // 조우 컷인이 돌면 **그 첫 틱에** 배틀 곡으로 갈아탄다 (`FieldTask_RunEncounterEffect`) — 1초 간격을 안 기다린다
    const pending = cutInSong.now
    if (pending !== null && phase === 'off') {
      if (last.current !== pending) { last.current = pending; void music.play(pending) }
      return
    }
    since.current += delta
    if (since.current < CHECK_SECONDS) return
    since.current = 0

    // 준비하는 동안은 아무것도 안 고른다 — 지금 흐르던 곡이 그대로 흐른다
    if (phase !== 'off' && !sceneReady) return
    const want = phase === 'off'
      ? songForMap(world.mapId, new Date().getHours(), {
        // 파도타기 곡 · 이야기 깃발의 곡 · 자전거로드 곡 (`FieldBGM_GetEffective`)
        surfing: worldState.player.surfing,
        flag: (id) => fieldScripts.vars?.checkFlag(id) === true,
        prevMapId: previousMap(),
        x: Math.floor(worldState.player.position.x),
        z: Math.floor(worldState.player.position.z),
      })
      : victorySong ?? battleSongFor({ kind, trainerClass: foeClass, doubles, foeSpecies: foeSpecies ?? 0, mapId: world.mapId })

    if (want === last.current) return
    last.current = want
    if (want === null) music.stop()
    else void music.play(want)
  })

  return null
}
