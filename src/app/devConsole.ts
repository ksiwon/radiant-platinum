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
import { useBattleStore } from '../state/battleStore'
import { worldState } from '../state/worldState'
import { useSaveStore } from '../state/saveStore'

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

/** 파티에 한 마리 넣는다. 나로 이벤트도 포켓몬센터도 없어서 손으로 꾸려야 한다 */
async function give(species: number, level = 50) {
  const [table, moves] = await Promise.all([loadSpecies(), loadMoves()])
  const sp = table.get(species)
  const save = useSaveStore.getState()
  const mon = createWild({
    species: sp, level, rng: Math.random,
    otId: save.trainer.id, otSecretId: save.trainer.secretId,
  })
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
      { ...m, hp: statsOf(m, table.get(m.species)).hp, status: 'ok' as const }, pp,
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
    HP: `${m.hp}/${statsOf(m, table.get(m.species)).hp}`,
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
    /** 야생전을 연다 */
    wild: (species: number, level = 10) => useBattleStore.getState().startWild({ species, level }),
    find,
    give,
    heal,
    party: show,
    /** 리포트를 지우고 새 판으로. 설정의 "처음부터"와 같은 것이다 */
    reset: () => { void useSaveStore.getState().resetSave() },
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
    '  pt.wild(403, 12)     야생전 시작\n' +
    '  pt.give(392, 50)     파티에 넣기 (종족번호, 레벨)\n' +
    '  pt.heal()            파티 회복\n' +
    '  pt.party()           파티 상태\n' +
    '  pt.reset()           세이브 초기화\n' +
    '\n' +
    '  ` (백틱)             확인 지점 — 보고 싶은 자리로 바로 뛰어든다',
    'font-weight:bold', 'font-weight:normal',
  )
}
