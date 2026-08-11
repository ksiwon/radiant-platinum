// @ts-nocheck
/**
 * ⚠️ **생성물이다. 손으로 고치지 않는다** — `tools/distribution/mechanics/bake.mjs`가
 * `@pkmn/sim`(MIT, Guangcong Luo 외)의 4세대 표를 평탄화해 구운 것이다.
 *
 * 타입별 상태이상 면역과 파워의 개체값 조합. 18×18 상성 격자는 여기 없다
 *
 * **수치와 이름은 여기 없다.** 그것은 사용자의 롬에서 오고
 * (`src/engine/battle/dex/provider.ts`), 여기 있는 것은 효과 **구현**뿐이다.
 * 왜 그렇게 갈랐는지는 COPYRIGHT.md §2.9 · DEPLOY.md §4.
 */
import type { Mechanics } from '../mechanics'

export const TYPE_MECHANICS: Record<string, Mechanics> = {
  bug: {
    HPivs: {
      atk: 30,
      def: 30,
      spd: 30,
    },
    HPdvs: {
      atk: 13,
      def: 13,
    },
  },
  dark: {
    HPivs: {},
  },
  dragon: {
    HPivs: {
      atk: 30,
    },
    HPdvs: {
      def: 14,
    },
  },
  electric: {
    HPivs: {
      spa: 30,
    },
    HPdvs: {
      atk: 14,
    },
  },
  fighting: {
    HPivs: {
      def: 30,
      spa: 30,
      spd: 30,
      spe: 30,
    },
    HPdvs: {
      atk: 12,
      def: 12,
    },
  },
  fire: {
    damageTaken: {
      brn: 3,
    },
    HPivs: {
      atk: 30,
      spa: 30,
      spe: 30,
    },
    HPdvs: {
      atk: 14,
      def: 12,
    },
  },
  flying: {
    HPivs: {
      hp: 30,
      atk: 30,
      def: 30,
      spa: 30,
      spd: 30,
    },
    HPdvs: {
      atk: 12,
      def: 13,
    },
  },
  ghost: {
    HPivs: {
      def: 30,
      spd: 30,
    },
    HPdvs: {
      atk: 13,
      def: 14,
    },
  },
  grass: {
    HPivs: {
      atk: 30,
      spa: 30,
    },
    HPdvs: {
      atk: 14,
      def: 14,
    },
  },
  ground: {
    damageTaken: {
      sandstorm: 3,
    },
    HPivs: {
      spa: 30,
      spd: 30,
    },
    HPdvs: {
      atk: 12,
    },
  },
  ice: {
    damageTaken: {
      hail: 3,
      frz: 3,
    },
    HPivs: {
      atk: 30,
      def: 30,
    },
    HPdvs: {
      def: 13,
    },
  },
  poison: {
    damageTaken: {
      psn: 3,
      tox: 3,
    },
    HPivs: {
      def: 30,
      spa: 30,
      spd: 30,
    },
    HPdvs: {
      atk: 12,
      def: 14,
    },
  },
  psychic: {
    HPivs: {
      atk: 30,
      spe: 30,
    },
    HPdvs: {
      def: 12,
    },
  },
  rock: {
    damageTaken: {
      sandstorm: 3,
    },
    HPivs: {
      def: 30,
      spd: 30,
      spe: 30,
    },
    HPdvs: {
      atk: 13,
      def: 12,
    },
  },
  steel: {
    damageTaken: {
      psn: 3,
      tox: 3,
      sandstorm: 3,
    },
    HPivs: {
      spd: 30,
    },
    HPdvs: {
      atk: 13,
    },
  },
  water: {
    HPivs: {
      atk: 30,
      def: 30,
      spa: 30,
    },
    HPdvs: {
      atk: 14,
      def: 13,
    },
  },
}
