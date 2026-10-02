// 깊은 진흙에 붙들린 횟수를 기록에 쌓는다 (PARITY §7.5)
//
// 원작은 붙들리는 과제를 세우는 자리에서 곧바로 하나 올린다
// (`FieldSystem_CreateTaskStuckInDeepMud`, `ov5_021DFB54.c` 886줄). 붙들린 뒤 버둥거린 수나
// 빠져나왔는지는 안 본다 — **붙들릴 때마다 한 번**이다.
//
// ⚠️ 엔진은 세이브를 못 만진다(PLAN §3.2). 그래서 `engine/actor/player`가 다리(`deepMud.onStuck`)만
// 두고 여기서 채운다 — 걸은 수(`stepSystem`의 `RECORD_STEPS`)와 같은 모양이다
import { deepMud } from '../engine/actor/player'
import { addRecord, RECORD_TIMES_STUCK_IN_DEEP_MUD } from '../engine/world/gameRecords'
import { useSaveStore } from '../state/saveStore'

/** 붙들릴 때마다 기록을 올린다. 돌려준 함수가 다리를 비운다 */
export function installDeepMudRecord(): () => void {
  deepMud.onStuck = () => {
    useSaveStore.setState((st) => ({ records: addRecord(st.records, RECORD_TIMES_STUCK_IN_DEEP_MUD) }))
  }
  return () => {
    deepMud.onStuck = null
  }
}
