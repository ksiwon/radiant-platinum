// @ts-nocheck
/**
 * ⚠️ **생성물이다. 손으로 고치지 않는다** — `tools/distribution/mechanics/bake.mjs`가
 * `@pkmn/sim`(MIT, Guangcong Luo 외)의 4세대 표를 평탄화해 구운 것이다.
 *
 * `gen4customgame`이 부르는 다섯 개뿐이다
 *
 * **수치와 이름은 여기 없다.** 그것은 사용자의 롬에서 오고
 * (`src/engine/battle/dex/provider.ts`), 여기 있는 것은 효과 **구현**뿐이다.
 * 왜 그렇게 갈랐는지는 COPYRIGHT.md §2.9 · DEPLOY.md §4.
 */
import type { Mechanics } from '../mechanics'

export const RULESETS: Record<string, Mechanics> = {
  cancelmod: {
    name: "Cancel Mod",
    onBegin() {
            this.supportCancel = true;
        },
  },
  defaultlevel: {
    name: "Default Level",
    hasValue: "positive-integer",
  },
  maxlevel: {
    name: "Max Level",
    hasValue: "positive-integer",
  },
  maxmovecount: {
    name: "Max Move Count",
    hasValue: "positive-integer",
  },
  maxteamsize: {
    name: "Max Team Size",
    hasValue: "positive-integer",
  },
}
