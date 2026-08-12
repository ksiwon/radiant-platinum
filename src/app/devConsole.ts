// 개발용 콘솔 손잡이 — `window.pt`
//
// 지금은 오버월드에서 트레이너전으로 들어가는 길이 없다. 그 길은 `scr_seq`
// 스크립트 VM이 필요한데(PLAN §6.5) 아직 없다. 그렇다고 다 만들 때까지 AI를
// 손으로 확인할 수 없으면 안 되므로, 여기서 직접 부를 수 있게 열어 둔다.
//
// **배포 번들에 들어가면 안 된다.** 호출부가 `import.meta.env.DEV`로 감싼
// 동적 import 하나뿐이라, 프로덕션 빌드에서는 그 가지가 통째로 죽고 이 모듈은
// 청크로도 나오지 않는다. 그러니 여기서 무엇을 import 하든 초기 청크는 안 는다.
import { gameLocale } from '../state/optionsStore'
import {
  loadMoveNames, loadMoves, loadSpecies, loadSpeciesNames, loadTrainerClasses, loadTrainerNames,
  loadTrainers,
} from '../data/gameData'
import { createWild, fillPp, statsOf } from '../engine/pokemon/instance'
import { world } from '../engine/map/world'
import { useBattleStore } from '../state/battleStore'
import { worldState } from '../state/worldState'
import { useSaveStore } from '../state/saveStore'
import { activateRoamer } from '../scene/roamers'
import { ROAMER_LEVEL, ROAMER_SPECIES } from '../engine/world/roamer'
import { computeStats } from '../engine/pokemon/stats'
import { LocationEvent } from '../engine/world/journal'
import { POKETCH_APP_COUNT } from '../engine/world/poketch'
import { poketchEnable, poketchRegister } from '../scene/poketch'
import { usePoketchStore } from '../state/poketchStore'
import { fieldScripts } from '../engine/script/field'
import { SYSTEM_FLAG } from '../engine/script/commands'
import {
  journalArrived, journalBeatTrainer, journalGiven, journalGotItem, journalPlain,
  journalUsedMove, journalWildBattle,
} from '../scene/journal'

/** 검색 결과에서 한 번에 보여줄 줄 수. 928명이라 전부 찍으면 콘솔이 막힌다 */
const MAX_ROWS = 40

async function trainerLabels() {
  const [table, names, classes] = await Promise.all([
    loadTrainers(), loadTrainerNames(gameLocale()), loadTrainerClasses(gameLocale()),
  ])
  return { table, label: (id: number) => [classes[table.get(id).class], names[id]].filter(Boolean).join(' ') }
}

/** 이름이나 분류로 트레이너를 찾는다. 번호를 알아야 `pt.trainer()`를 부를 수 있다 */
async function find(query: string) {
  const { table, label } = await trainerLabels()
  const hits = table.all
    .filter((t) => t.party.length && label(t.id).includes(query))
    .map((t) => ({
      번호: t.id,
      이름: label(t.id),
      파티: t.party.map((m) => `L${m.level}`).join(' '),
      AI: `0x${t.ai.toString(16)}`,
      상금: t.party[t.party.length - 1]!.level * 4 * (table.prizeMul[t.class] ?? 0),
    }))
  console.table(hits.slice(0, MAX_ROWS))
  if (hits.length > MAX_ROWS) console.log(`… ${hits.length - MAX_ROWS}명 더 있다`)
  return hits.length
}

/**
 * 파티에 한 마리 넣는다. 나로 이벤트도 포켓몬센터도 없어서 손으로 꾸려야 한다.
 *
 * `form`은 폼을 눈으로 볼 때 쓴다 (PARITY §3.4) — 안농 글자·도롱마담 옷감·
 * 로토무 가전이 아이콘과 능력치에 제대로 걸리는지가 파티·박스 화면에서 보인다
 */
async function give(species: number, level = 50, form = 0) {
  const [table, moves] = await Promise.all([loadSpecies(), loadMoves()])
  const save = useSaveStore.getState()
  const mon = createWild({
    species: table.get(species), level, rng: Math.random,
    otId: save.trainer.id, otSecretId: save.trainer.secretId,
  })
  mon.form = form
  const sp = table.of(mon)
  mon.hp = statsOf(mon, sp).hp
  const party = [...save.party, fillPp(mon, (id) => moves.byId.get(id)?.pp ?? 5)].slice(0, 6)
  useSaveStore.setState({ party })
  await show()
}

/** 파티 전원을 회복시킨다. 포켓몬센터가 생기면 지운다 */
async function heal() {
  const [table, moves] = await Promise.all([loadSpecies(), loadMoves()])
  const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
  useSaveStore.setState({
    party: useSaveStore.getState().party.map((m) => fillPp(
      { ...m, hp: statsOf(m, table.of(m)).hp, status: 'ok' as const }, pp,
    )),
  })
  await show()
}

/** 지금 파티. HP·PP가 배틀 뒤에 제대로 남았는지 보는 자리다 */
async function show() {
  const [table, names, moveNames] = await Promise.all([
    loadSpecies(), loadSpeciesNames(gameLocale()), loadMoveNames(gameLocale()),
  ])
  const save = useSaveStore.getState()
  console.table(save.party.map((m) => ({
    이름: m.nickname ?? names[m.species] ?? `#${m.species}`,
    Lv: m.level,
    HP: `${m.hp}/${statsOf(m, table.of(m)).hp}`,
    상태: m.status,
    기술: m.moves.map((s) => `${moveNames[s.move] ?? s.move}(${s.pp})`).join(' '),
  })))
  console.log(`소지금 ${save.money}엔`)
  return save.party.length
}

export function installDevConsole(): void {
  const pt = {
    /** 트레이너전을 연다. 번호는 `pt.find()`로 찾는다 */
    trainer: (id: number) => useBattleStore.getState().startTrainer(id),
    /** 야생전을 연다. 셋째 값은 폼이다 (PARITY §3.4) */
    wild: (species: number, level = 10, form = 0) =>
      useBattleStore.getState().startWild({ species, level, form }),
    find,
    give,
    heal,
    /**
     * 도감에 「상대해 봤다」로 적는다 (PARITY §2.22).
     *
     * 기술 칸의 상성 표시가 이 값을 본다 — 처음 보는 종에게는 안 뜨므로,
     * 그 화면을 보려면 한 번 쓰러뜨려 보거나 여기서 적어 두어야 한다
     */
    dex: (...species: number[]) => {
      for (const id of species) useSaveStore.getState().markBattled(id)
      return species.length
    },
    /**
     * 배회 포켓몬 한 자리를 열고 그 자리와 곧바로 배틀을 연다 (PARITY §6.3).
     *
     * 이야기로 여는 자리는 예진호수와 만월도뿐이라, 그 앞까지 안 가고
     * 확인하려면 이 길이 있어야 한다. `hp`를 주면 그만큼 깎아 둔 채로 만난다
     */
    roam: async (slot = 0, hp?: number) => {
      const species = ROAMER_SPECIES[slot]
      const level = ROAMER_LEVEL[slot]
      if (species === undefined || level === undefined) return null
      const table = await loadSpecies()
      activateRoamer(slot, (id, at, ivs) => computeStats({
        base: table.get(id).stats, ivs, level: at, speciesId: id,
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, nature: 0,
      }).hp)
      if (hp !== undefined) {
        const roamers = [...useSaveStore.getState().roamers]
        roamers[slot] = { ...roamers[slot]!, hp }
        useSaveStore.setState({ roamers })
      }
      await useBattleStore.getState().startWild({ species, level, roamer: slot })
      return useSaveStore.getState().roamers[slot]
    },
    /**
     * 모험노트를 받고 오늘 쪽을 채운다 (PARITY §7.4).
     *
     * 이야기로 받는 자리는 축복시티 하나뿐이고, 쪽이 채워지려면 그 뒤로 하루를
     * 돌아다녀야 한다. 화면을 확인하려면 이 길이 있어야 한다 — **쓰는 길은
     * 실제 함수 그대로**라 무엇이 어떻게 적히는지도 여기서 갈린다
     */
    note: () => {
      // 스크립트가 세우는 그 비트다 (`ScrCmd_GiveJournal`)
      fieldScripts.vars.setFlag(SYSTEM_FLAG.journalAcquired)
      journalGiven(world.mapId >= 0 ? world.mapId : 411)
      journalArrived(8)
      journalUsedMove(LocationEvent.USED_ROCK_SMASH, 40)
      journalPlain(LocationEvent.USED_PC_BOX)
      journalGotItem(4)
      journalWildBattle({
        result: 'caught', species: 25, gender: 'female',
        timeOfDay: 1, playtimeMs: 12 * 60_000,
      })
      journalBeatTrainer(8, 246)
      return useSaveStore.getState().journal[0]
    },
    /**
     * 포켓치를 켜고 앱을 등록한다 (PARITY §7.3).
     *
     * 번호를 안 주면 **스물다섯 전부**다. 이야기로 받으려면 축복시티부터
     * 신오 곳곳을 돌아야 해서, 화면을 확인하려면 이 길이 있어야 한다
     */
    watch: (...apps: number[]) => {
      poketchEnable()
      const list = apps.length ? apps : [...Array(POKETCH_APP_COUNT).keys()]
      for (const app of list) poketchRegister(app)
      usePoketchStore.getState().setView('large')
      return useSaveStore.getState().poketch.registry.filter(Boolean).length
    },
    /** 포켓치를 그 앱으로 넘긴다 */
    app: (app: number) => {
      const p = useSaveStore.getState().poketch
      useSaveStore.setState({ poketch: { ...p, appIndex: app } })
      return app
    },
    party: show,
    /** 리포트를 지우고 새 판으로. 설정의 "처음부터"와 같은 것이다 */
    // ⚠️ **백업을 건너뛴다.** 개발 중에 리셋을 스무 번 누르면 `.rpsave` 스무 개가
    // 다운로드 폴더에 쌓인다. 개발 모드 예외이므로 경고는 남긴다 (IMPORT.md §11 끝)
    reset: () => {
      console.warn('pt.reset: 리포트를 백업 없이 지운다. 남겨야 하면 pt.backup()을 먼저')
      void useSaveStore.getState().resetSave({ backup: false })
    },
    /** 지금 리포트를 `.rpsave`로 받는다 */
    backup: () => useSaveStore.getState().exportReport(),
    /**
     * 지금 자리를 리포트로 저장한다. 설정의 "리포트에 적기"와 같은 것이다.
     *
     * 돌려주는 `{ saved, backup }`이 **둘 다 따로**인 것이 요점이다 — 내부
     * 저장과 파일 받기는 별개의 성공이다 (IMPORT.md §10). 브라우저 E2E가
     * 다운로드를 막아 놓고 이 값을 본다 (`tools/e2e/run.mjs`)
     */
    report: () => {
      const save = useSaveStore.getState()
      // 맵에 아직 안 들어갔으면(타이틀 화면) 세이브에 적힌 자리를 그대로 쓴다.
      // `world.mapId`가 -1인 채로 넘기면 스키마가 막는다 — 맞는 동작이라
      // 우회하지 않고 **물어볼 자리를 바꾼다**
      const p = worldState.player.position
      const here = world.mapId >= 0
        ? { map: world.mapId, matrix: world.matrix, x: p.x, z: p.z, facing: worldState.player.facing }
        : save.position
      return save.report(here)
    },
    /** 파일 글을 그대로 들인다. 화면의 "리포트 파일 불러오기"와 같은 길이다 */
    bringIn: (text: string) => {
      const preview = useSaveStore.getState().previewImport(text)
      if (!preview.ok) return Promise.resolve({ ok: false as const, why: preview.why })
      return useSaveStore.getState().commitImport(preview)
    },
    /**
     * 시각을 민다. 하늘·조명·안개가 따라오고 시간대 인카운터도 같이 바뀐다.
     *
     * 경계는 원작 `rtc.c`가 정한다 — 0~3 심야 · 4~9 아침 · 10~16 낮 ·
     * 17~19 해질녘 · 20~23 밤 (`map/timeOfDay`)
     */
    hour: (h: number) => {
      worldState.time.gameHour = ((h % 24) + 24) % 24
      return worldState.time.gameHour
    },
  }
  ;(globalThis as unknown as { pt: typeof pt }).pt = pt
  console.log(
    '%cPokémon Radiant Platinum 개발 콘솔%c\n' +
    '  pt.find("관장")      트레이너 찾기 (번호·AI·상금)\n' +
    '  pt.trainer(250)      트레이너전 시작\n' +
    '  pt.wild(403, 12)     야생전 시작 (종족번호, 레벨, 폼)\n' +
    '  pt.give(392, 50)     파티에 넣기 (종족번호, 레벨)\n' +
    '  pt.dex(19, 25)       도감에 「상대해 봤다」로 적기 (상성 표시가 본다)\n' +
    '  pt.roam(0, 60)       배회 포켓몬 열고 만나기 (자리, 남은 체력)\n' +
    '  pt.heal()            파티 회복\n' +
    '  pt.party()           파티 상태\n' +
    '  pt.reset()           세이브 초기화\n' +
    '\n' +
    '  ` (백틱)             확인 지점 — 보고 싶은 자리로 바로 뛰어든다',
    'font-weight:bold', 'font-weight:normal',
  )
}
