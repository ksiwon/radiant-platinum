// 어느 곡을 틀 것인가 (DATA.md §2.18)
//
// **곡 번호는 지어내지 않는다.** 맵 헤더가 `bgmDay`·`bgmNight`를 들고 있고,
// 헤더 593개가 내놓는 번호 1186개가 **전부** SDAT의 곡을 가리킨다(없는 번호 0개).
// 그래서 여기서 할 일은 지금 선 맵의 헤더를 보고 낮/밤을 고르는 것뿐이다.
//
// 낮/밤 경계는 하늘과 같은 표를 쓴다(`map/timeOfDay`) — 원작 `rtc.c`의 24칸이다.
// 다만 **하늘처럼 섞지 않는다.** 곡은 섞을 수 없으니 경계에서 갈아탄다.
//
// 배틀에 들어가면 필드 곡을 멈추고 배틀 곡으로 바꾼다. 나오면 되돌린다 —
// 필드 곡은 처음부터 다시 시작한다(원작도 그렇다).
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { music } from '../engine/audio/music'
import { SFX } from '../engine/audio/sfx'
import { TRAINER_BATTLE, songForMap, wildSongFor } from '../engine/audio/songs'
import { world } from '../engine/map/world'
import { useBattleStore } from '../state/battleStore'
import { useOptionsStore } from '../state/optionsStore'

/** 몇 초마다 곡을 다시 고를지. 맵과 시간대만 보므로 자주 볼 이유가 없다 */
const CHECK_SECONDS = 1

export function MusicDirector() {
  const phase = useBattleStore((s) => s.phase)
  const kind = useBattleStore((s) => s.kind)
  // 야생은 **누가 나왔는지**가 곡을 정한다. 기라티나는 전용 곡이다 (`songs.ts`)
  const foeSpecies = useBattleStore((s) => s.view?.active.p2a?.species ?? null)
  const sound = useOptionsStore((s) => s.sound)
  const since = useRef(0)
  const last = useRef<number | null>(null)

  // 원작 옵션 17·18번 (스테레오 · 모노)
  useEffect(() => { music.setMono(sound === 1) }, [sound])

  // 메뉴 소리는 미리 펴 둔다. 안 그러면 첫 커서 이동에서 452KB를 받느라 소리가 늦다
  useEffect(() => { void music.prewarm([SFX.MENU]) }, [])

  useFrame((_, delta) => {
    since.current += delta
    if (since.current < CHECK_SECONDS) return
    since.current = 0

    const want = phase === 'off'
      ? songForMap(world.mapId, new Date().getHours())
      : kind === 'trainer' ? TRAINER_BATTLE
        : wildSongFor(foeSpecies ?? 0, world.mapId)

    if (want === last.current) return
    last.current = want
    if (want === null) music.stop()
    else void music.play(want)
  })

  return null
}
