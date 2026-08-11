// @ts-nocheck
/**
 * ⚠️ **생성물이다. 손으로 고치지 않는다** — `tools/distribution/mechanics/bake.mjs`가
 * `@pkmn/sim`(MIT, Guangcong Luo 외)의 4세대 표를 평탄화해 구운 것이다.
 *
 * 기술 효과. 위력·명중률·PP·타입·우선도·범위·플래그는 롬이 준다
 *
 * **수치와 이름은 여기 없다.** 그것은 사용자의 롬에서 오고
 * (`src/engine/battle/dex/provider.ts`), 여기 있는 것은 효과 **구현**뿐이다.
 * 왜 그렇게 갈랐는지는 COPYRIGHT.md §2.9 · DEPLOY.md §4.
 */
import type { Mechanics } from '../mechanics'

export const MOVE_MECHANICS: Record<string, Mechanics> = {
  absorb: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    drain: [1, 2],
    target: "normal",
  },
  acid: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spd: -1,
      },
    },
    target: "allAdjacentFoes",
  },
  acidarmor: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      def: 2,
    },
    target: "self",
  },
  acupressure: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    onHit(target) {
            if (target.volatiles['substitute']) {
                return false;
            }
            const stats = [];
            let stat;
            for (stat in target.boosts) {
                if (target.boosts[stat] < 6) {
                    stats.push(stat);
                }
            }
            if (stats.length) {
                const randomStat = this.sample(stats);
                const boost = {};
                boost[randomStat] = 2;
                this.boost(boost);
            }
            else {
                return false;
            }
        },
    target: "adjacentAllyOrSelf",
  },
  aerialace: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      slicing: 1,
    },
    target: "any",
  },
  aeroblast: {
    flags: {
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      wind: 1,
    },
    critRatio: 2,
    target: "any",
  },
  agility: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      spe: 2,
    },
    target: "self",
  },
  aircutter: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
      wind: 1,
    },
    critRatio: 2,
    target: "allAdjacentFoes",
  },
  airslash: {
    flags: {
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      slicing: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "any",
  },
  amnesia: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      spd: 2,
    },
    target: "self",
  },
  ancientpower: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      self: {
        boosts: {
          atk: 1,
          def: 1,
          spa: 1,
          spd: 1,
          spe: 1,
        },
      },
    },
    target: "normal",
  },
  aquajet: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  aquaring: {
    flags: {
      metronome: 1,
    },
    volatileStatus: "aquaring",
    condition: {
      onStart(pokemon) {
                this.add('-start', pokemon, 'Aqua Ring');
            },
      onResidualOrder: 10,
      onResidual(pokemon) {
                this.heal(pokemon.baseMaxhp / 16);
            },
      onResidualSubOrder: 2,
    },
    target: "self",
  },
  aquatail: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  armthrust: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  aromatherapy: {
    flags: {
      snatch: 1,
      distance: 1,
      metronome: 1,
    },
    onHit(target, source) {
            this.add('-cureteam', source, '[from] move: Aromatherapy');
            const allies = [...target.side.pokemon, ...target.side.allySide?.pokemon || []];
            for (const ally of allies) {
                ally.clearStatus();
            }
        },
    target: "allyTeam",
  },
  assist: {
    flags: {
      noassist: 1,
      failcopycat: 1,
      nosleeptalk: 1,
    },
    onHit(target) {
            const moves = [];
            for (const pokemon of target.side.pokemon) {
                if (pokemon === target)
                    continue;
                for (const moveSlot of pokemon.moveSlots) {
                    const moveid = moveSlot.id;
                    const move = this.dex.moves.get(moveid);
                    if (move.flags['noassist'] ||
                        (this.field.pseudoWeather['gravity'] && move.flags['gravity']) ||
                        (target.volatiles['healblock'] && move.flags['heal'])) {
                        continue;
                    }
                    moves.push(moveid);
                }
            }
            let randomMove = '';
            if (moves.length)
                randomMove = this.sample(moves);
            if (!randomMove) {
                return false;
            }
            this.actions.useMove(randomMove, target);
        },
    callsMove: true,
    target: "self",
  },
  assurance: {
    basePowerCallback(pokemon, target, move) {
            if (target.hurtThisTurn) {
                this.debug('BP doubled on damaged target');
                return move.basePower * 2;
            }
            return move.basePower;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  astonish: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  attackorder: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  attract: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "attract",
    condition: {
      noCopy: true,
      onStart(pokemon, source, effect) {
                if (!(pokemon.gender === 'M' && source.gender === 'F') && !(pokemon.gender === 'F' && source.gender === 'M')) {
                    this.debug('incompatible gender');
                    return false;
                }
                if (!this.runEvent('Attract', pokemon, source)) {
                    this.debug('Attract event failed');
                    return false;
                }
                if (effect.name === 'Cute Charm') {
                    this.add('-start', pokemon, 'Attract', '[from] ability: Cute Charm', `[of] ${source}`);
                }
                else if (effect.name === 'Destiny Knot') {
                    this.add('-start', pokemon, 'Attract', '[from] item: Destiny Knot', `[of] ${source}`);
                }
                else {
                    this.add('-start', pokemon, 'Attract');
                }
            },
      onUpdate(pokemon) {
                if (this.effectState.source && !this.effectState.source.isActive && pokemon.volatiles['attract']) {
                    this.debug(`Removing Attract volatile on ${pokemon}`);
                    pokemon.removeVolatile('attract');
                }
            },
      onBeforeMovePriority: 2,
      onBeforeMove(pokemon, target, move) {
                this.add('-activate', pokemon, 'move: Attract', '[of] ' + this.effectState.source);
                if (this.randomChance(1, 2)) {
                    this.add('cant', pokemon, 'Attract');
                    return false;
                }
            },
      onEnd(pokemon) {
                this.add('-end', pokemon, 'Attract', '[silent]');
            },
    },
    onTryImmunity(target, source) {
            return (target.gender === 'M' && source.gender === 'F') || (target.gender === 'F' && source.gender === 'M');
        },
    target: "normal",
  },
  aurasphere: {
    flags: {
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      bullet: 1,
      pulse: 1,
    },
    target: "any",
  },
  aurorabeam: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        atk: -1,
      },
    },
    target: "normal",
  },
  avalanche: {
    basePowerCallback(pokemon, target, move) {
            const damagedByTarget = pokemon.attackedBy.some(p => p.source === target && p.damage > 0 && p.thisTurn);
            if (damagedByTarget) {
                this.debug(`BP doubled for getting hit by ${target}`);
                return move.basePower * 2;
            }
            return move.basePower;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  barrage: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  barrier: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      def: 2,
    },
    target: "self",
  },
  batonpass: {
    flags: {
      metronome: 1,
    },
    onHit(target) {
            if (!this.canSwitch(target.side) || target.volatiles['commanded']) {
                this.attrLastMove('[still]');
                this.add('-fail', target);
                return this.NOT_FAIL;
            }
        },
    self: {
      onHit(source) {
                source.skipBeforeSwitchOutEventFlag = true;
            },
    },
    selfSwitch: "copyvolatile",
    target: "self",
  },
  beatup: {
    basePowerCallback(pokemon, target, move) {
            if (!move.allies?.length)
                return null;
            return 10;
        },
    flags: {
      protect: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    onModifyMove(move, pokemon) {
            pokemon.addVolatile('beatup');
            move.type = '???';
            move.category = 'Physical';
            move.allies = pokemon.side.pokemon.filter(ally => !ally.fainted && !ally.status);
            move.multihit = move.allies.length;
        },
    target: "normal",
    condition: {
      duration: 1,
      onModifyAtkPriority: -101,
      onModifyAtk(atk, pokemon, defender, move) {
                if (!this.ruleTable.has('beatupnicknamesmod')) {
                    this.add('-activate', pokemon, 'move: Beat Up', '[of] ' + move.allies[0].name);
                }
                this.event.modifier = 1;
                return this.dex.species.get(move.allies.shift().set.species).baseStats.atk;
            },
      onFoeModifyDefPriority: -101,
      onFoeModifyDef(def, pokemon) {
                this.event.modifier = 1;
                return this.dex.species.get(pokemon.set.species).baseStats.def;
            },
    },
  },
  bellydrum: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    onHit(target) {
            if (target.hp <= target.maxhp / 2 || target.boosts.atk >= 6 || target.maxhp === 1) { // Shedinja clause
                return false;
            }
            this.directDamage(target.maxhp / 2);
            this.boost({ atk: 12 }, target);
        },
    target: "self",
  },
  bide: {
    flags: {
      contact: 1,
      protect: 1,
      metronome: 1,
      nosleeptalk: 1,
      failinstruct: 1,
    },
    volatileStatus: "bide",
    ignoreImmunity: true,
    beforeMoveCallback(pokemon) {
            if (pokemon.volatiles['bide'])
                return true;
        },
    condition: {
      duration: 3,
      onLockMove: "bide",
      onStart(pokemon) {
                this.effectState.totalDamage = 0;
                this.add('-start', pokemon, 'move: Bide');
            },
      onDamagePriority: -101,
      onDamage(damage, target, source, move) {
                if (!move || move.effectType !== 'Move' || !source)
                    return;
                this.effectState.totalDamage += damage;
                this.effectState.lastDamageSource = source;
            },
      onBeforeMove(pokemon, target, move) {
                if (this.effectState.duration === 1) {
                    this.add('-end', pokemon, 'move: Bide');
                    if (!this.effectState.totalDamage) {
                        this.add('-fail', pokemon);
                        return false;
                    }
                    target = this.effectState.lastDamageSource;
                    if (!target) {
                        this.add('-fail', pokemon);
                        return false;
                    }
                    if (!target.isActive) {
                        const possibleTarget = this.getRandomTarget(pokemon, this.dex.moves.get('pound'));
                        if (!possibleTarget) {
                            this.add('-miss', pokemon);
                            return false;
                        }
                        target = possibleTarget;
                    }
                    const moveData = {
                        id: 'bide',
                        name: "Bide",
                        accuracy: true,
                        damage: this.effectState.totalDamage * 2,
                        category: "Physical",
                        priority: 1,
                        flags: { contact: 1, protect: 1 },
                        ignoreImmunity: true,
                        effectType: 'Move',
                        type: 'Normal',
                    };
                    this.actions.tryMoveHit(target, pokemon, moveData);
                    pokemon.removeVolatile('bide');
                    return false;
                }
                this.add('-activate', pokemon, 'move: Bide');
            },
      onMoveAborted(pokemon) {
                pokemon.removeVolatile('bide');
            },
      onEnd(pokemon) {
                this.add('-end', pokemon, 'move: Bide', '[silent]');
            },
      onAfterSetStatus(status, pokemon) {
                if (status.id === 'slp' || status.id === 'frz') {
                    pokemon.removeVolatile('bide');
                }
            },
    },
    target: "self",
    basePower: 0,
  },
  bind: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "partiallytrapped",
    target: "normal",
  },
  bite: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bite: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  blastburn: {
    flags: {
      recharge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      volatileStatus: "mustrecharge",
    },
    target: "normal",
  },
  blazekick: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    secondary: {
      chance: 10,
      status: "brn",
    },
    target: "normal",
  },
  blizzard: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      wind: 1,
    },
    onModifyMove(move) {
            if (this.field.isWeather('hail'))
                move.accuracy = true;
        },
    secondary: {
      chance: 10,
      status: "frz",
    },
    target: "allAdjacentFoes",
  },
  block: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    onHit(target, source, move) {
            return target.addVolatile('trapped', source, move, 'trapper');
        },
    target: "normal",
  },
  bodyslam: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "normal",
  },
  boneclub: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  bonemerang: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: 2,
    target: "normal",
  },
  bonerush: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  bounce: {
    flags: {
      contact: 1,
      charge: 1,
      protect: 1,
      mirror: 1,
      gravity: 1,
      distance: 1,
      metronome: 1,
      nosleeptalk: 1,
    },
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            this.add('-prepare', attacker, move.name);
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    condition: {
      duration: 2,
      onInvulnerability(target, source, move) {
                if (['gust', 'twister', 'skyuppercut', 'thunder', 'hurricane', 'smackdown', 'thousandarrows'].includes(move.id)) {
                    return;
                }
                return false;
            },
      onSourceBasePower(basePower, target, source, move) {
                if (move.id === 'gust' || move.id === 'twister') {
                    return this.chainModify(2);
                }
            },
    },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "any",
  },
  bravebird: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
    },
    recoil: [1, 3],
    target: "any",
  },
  brickbreak: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onTryHit(pokemon) {
            // will shatter screens through sub, before you hit
            pokemon.side.removeSideCondition('reflect');
            pokemon.side.removeSideCondition('lightscreen');
            pokemon.side.removeSideCondition('auroraveil');
        },
    target: "normal",
  },
  brine: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onBasePower(basePower, pokemon, target) {
            if (target.hp * 2 <= target.maxhp) {
                return this.chainModify(2);
            }
        },
    target: "normal",
  },
  bubble: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spe: -1,
      },
    },
    target: "allAdjacentFoes",
  },
  bubblebeam: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spe: -1,
      },
    },
    target: "normal",
  },
  bugbite: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onHit(target, source, move) {
            const item = target.getItem();
            if (source.hp && item.isBerry && target.takeItem(source)) {
                this.add('-enditem', target, item.name, '[from] stealeat', '[move] Bug Bite', `[of] ${source}`);
                if (this.singleEvent('Eat', item, target.itemState, source, source, move)) {
                    this.runEvent('EatItem', source, source, move, item);
                    if (item.id === 'leppaberry')
                        target.staleness = 'external';
                }
                if (item.onEat)
                    source.ateBerry = true;
            }
        },
    target: "normal",
  },
  bugbuzz: {
    flags: {
      protect: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spd: -1,
      },
    },
    target: "normal",
  },
  bulkup: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      atk: 1,
      def: 1,
    },
    target: "self",
  },
  bulletpunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    target: "normal",
  },
  bulletseed: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  calmmind: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      spa: 1,
      spd: 1,
    },
    target: "self",
  },
  camouflage: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    onHit(target) {
            if (target.hasType('Normal') || !target.setType('Normal'))
                return false;
            this.add('-start', target, 'typechange', 'Normal');
        },
    target: "self",
  },
  captivate: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    onTryImmunity(pokemon, source) {
            return (pokemon.gender === 'M' && source.gender === 'F') || (pokemon.gender === 'F' && source.gender === 'M');
        },
    boosts: {
      spa: -2,
    },
    target: "allAdjacentFoes",
  },
  charge: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    volatileStatus: "charge",
    condition: {
      onStart(pokemon, source, effect) {
                if (effect && ['Electromorphosis', 'Wind Power'].includes(effect.name)) {
                    this.add('-start', pokemon, 'Charge', this.activeMove.name, '[from] ability: ' + effect.name);
                }
                else {
                    this.add('-start', pokemon, 'Charge');
                }
            },
      onRestart(pokemon, source, effect) {
                if (effect && ['Electromorphosis', 'Wind Power'].includes(effect.name)) {
                    this.add('-start', pokemon, 'Charge', this.activeMove.name, '[from] ability: ' + effect.name);
                }
                else {
                    this.add('-start', pokemon, 'Charge');
                }
            },
      onBasePowerPriority: 9,
      onBasePower(basePower, attacker, defender, move) {
                if (move.type === 'Electric') {
                    this.debug('charge boost');
                    return this.chainModify(2);
                }
            },
      onMoveAborted(pokemon, target, move) {
                if (move.id !== 'charge') {
                    pokemon.removeVolatile('charge');
                }
            },
      onAfterMove(pokemon, target, move) {
                if (move.id !== 'charge') {
                    pokemon.removeVolatile('charge');
                }
            },
      onEnd(pokemon) {
                this.add('-end', pokemon, 'Charge', '[silent]');
            },
    },
    boosts: {
      spd: 1,
    },
    target: "self",
  },
  chargebeam: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 70,
      self: {
        boosts: {
          spa: 1,
        },
      },
    },
    target: "normal",
  },
  charm: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    boosts: {
      atk: -2,
    },
    target: "normal",
  },
  chatter: {
    flags: {
      protect: 1,
      sound: 1,
      distance: 1,
      noassist: 1,
      failcopycat: 1,
      failmefirst: 1,
      nosleeptalk: 1,
      failmimic: 1,
      nosketch: 1,
    },
    secondary: {
      chance: 31,
      volatileStatus: "confusion",
    },
    target: "any",
    onModifyMove(move, pokemon) {
            if (pokemon.species.name !== 'Chatot') {
                const confusion = move.secondaries?.find(secondary => secondary.volatileStatus === 'confusion');
                if (confusion)
                    confusion.chance = 0; // boosted by Sheer Force
            }
        },
  },
  clamp: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "partiallytrapped",
    target: "normal",
  },
  closecombat: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      boosts: {
        def: -1,
        spd: -1,
      },
    },
    target: "normal",
  },
  cometpunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  confuseray: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "confusion",
    target: "normal",
  },
  confusion: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      volatileStatus: "confusion",
    },
    target: "normal",
  },
  constrict: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spe: -1,
      },
    },
    target: "normal",
  },
  conversion: {
    flags: {
      metronome: 1,
    },
    onHit(target) {
            const possibleTypes = target.moveSlots.map(moveSlot => {
                const move = this.dex.moves.get(moveSlot.id);
                if (move.id !== 'conversion' && move.id !== 'curse' && !target.hasType(move.type)) {
                    return move.type;
                }
                return '';
            }).filter(type => type);
            if (!possibleTypes.length) {
                return false;
            }
            const type = this.sample(possibleTypes);
            if (!target.setType(type))
                return false;
            this.add('-start', target, 'typechange', type);
        },
    target: "self",
  },
  conversion2: {
    flags: {
      bypasssub: 1,
      metronome: 1,
    },
    onHit(target, source) {
            if (!target.lastMoveUsed) {
                return false;
            }
            const possibleTypes = [];
            const lastMoveUsed = target.lastMoveUsed;
            const attackType = lastMoveUsed.id === 'struggle' ? 'Normal' : lastMoveUsed.type;
            for (const typeName of this.dex.types.names()) {
                if (source.hasType(typeName))
                    continue;
                const typeCheck = this.dex.types.get(typeName).damageTaken[attackType];
                if (typeCheck === 2 || typeCheck === 3) {
                    possibleTypes.push(typeName);
                }
            }
            if (!possibleTypes.length) {
                return false;
            }
            const randomType = this.sample(possibleTypes);
            if (!source.setType(randomType))
                return false;
            this.add('-start', source, 'typechange', randomType);
        },
    target: "normal",
  },
  copycat: {
    flags: {
      noassist: 1,
      failcopycat: 1,
      nosleeptalk: 1,
    },
    onHit(pokemon) {
            const move = this.lastMove;
            if (!move)
                return;
            if (move.flags['failcopycat'] ||
                (this.field.pseudoWeather['gravity'] && move.flags['gravity']) ||
                (pokemon.volatiles['healblock'] && move.flags['heal'])) {
                return false;
            }
            this.actions.useMove(move.id, pokemon);
        },
    callsMove: true,
    target: "self",
  },
  cosmicpower: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      def: 1,
      spd: 1,
    },
    target: "self",
  },
  cottonspore: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
      powder: 1,
    },
    boosts: {
      spe: -2,
    },
    target: "normal",
  },
  counter: {
    damageCallback(pokemon) {
            if (!pokemon.volatiles['counter'])
                return 0;
            return pokemon.volatiles['counter'].damage || 1;
        },
    flags: {
      contact: 1,
      protect: 1,
      failmefirst: 1,
      noassist: 1,
      failcopycat: 1,
    },
    beforeTurnCallback(pokemon) {
            pokemon.addVolatile('counter');
        },
    onTry(source) {
            if (!source.volatiles['counter'])
                return false;
            if (source.volatiles['counter'].slot === null)
                return false;
        },
    condition: {
      duration: 1,
      noCopy: true,
      onStart(target, source, move) {
                this.effectState.slot = null;
                this.effectState.damage = 0;
            },
      onRedirectTargetPriority: -1,
      onRedirectTarget(target, source, source2, move) {
                if (move.id !== 'counter')
                    return;
                if (source !== this.effectState.target || !this.effectState.slot)
                    return;
                return this.getAtSlot(this.effectState.slot);
            },
      onDamagingHit(damage, target, source, move) {
                if (!source.isAlly(target) && this.getCategory(move) === 'Physical') {
                    this.effectState.slot = source.getSlot();
                    this.effectState.damage = 2 * damage;
                }
            },
    },
    target: "scripted",
    basePower: 0,
  },
  covet: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      failmefirst: 1,
      noassist: 1,
      failcopycat: 1,
    },
    onAfterHit(target, source, move) {
            if (source.item || source.volatiles['gem']) {
                return;
            }
            const yourItem = target.takeItem(source);
            if (!yourItem) {
                return;
            }
            if (!this.singleEvent('TakeItem', yourItem, target.itemState, source, target, move, yourItem) ||
                !source.setItem(yourItem)) {
                target.item = yourItem.id; // bypass setItem so we don't break choicelock or anything
                return;
            }
            this.add('-item', source, yourItem, '[from] move: Covet', `[of] ${target}`);
        },
    target: "normal",
  },
  crabhammer: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  crosschop: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  crosspoison: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    secondary: {
      chance: 10,
      status: "psn",
    },
    critRatio: 2,
    target: "normal",
  },
  crunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bite: 1,
    },
    secondary: {
      chance: 20,
      boosts: {
        def: -1,
      },
    },
    target: "normal",
  },
  crushclaw: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 50,
      boosts: {
        def: -1,
      },
    },
    target: "normal",
  },
  crushgrip: {
    basePowerCallback(pokemon, target) {
            const bp = Math.floor(target.hp * 120 / target.maxhp) + 1;
            this.debug(`BP for ${target.hp}/${target.maxhp} HP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  curse: {
    flags: {
      metronome: 1,
    },
    volatileStatus: "curse",
    onModifyMove(move, source, target) {
            if (!source.hasType('Ghost')) {
                delete move.volatileStatus;
                delete move.onHit;
                move.self = { boosts: { atk: 1, def: 1, spe: -1 } };
                move.target = move.nonGhostTarget;
            }
            else if (target?.volatiles['substitute']) {
                delete move.volatileStatus;
                delete move.onHit;
            }
        },
    onTryHit(target, source, move) {
            if (!source.hasType('Ghost')) {
                delete move.volatileStatus;
                delete move.onHit;
                move.self = { boosts: { spe: -1, atk: 1, def: 1 } };
            }
            else if (move.volatileStatus && target.volatiles['curse']) {
                return false;
            }
        },
    onHit(target, source) {
            this.directDamage(source.maxhp / 2, source, source);
        },
    condition: {
      onStart(pokemon, source) {
                this.add('-start', pokemon, 'Curse', `[of] ${source}`);
            },
      onResidualOrder: 10,
      onResidual(pokemon) {
                this.damage(pokemon.baseMaxhp / 4);
            },
      onResidualSubOrder: 8,
    },
    target: "normal",
    nonGhostTarget: "self",
  },
  cut: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    target: "normal",
  },
  darkpulse: {
    flags: {
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      pulse: 1,
    },
    secondary: {
      chance: 20,
      volatileStatus: "flinch",
    },
    target: "any",
  },
  darkvoid: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    status: "slp",
    target: "allAdjacentFoes",
  },
  defendorder: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      def: 1,
      spd: 1,
    },
    target: "self",
  },
  defensecurl: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      def: 1,
    },
    volatileStatus: "defensecurl",
    condition: {
      noCopy: true,
      onRestart: () => null,
    },
    target: "self",
  },
  defog: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    onHit(pokemon) {
            if (!pokemon.volatiles['substitute'])
                this.boost({ evasion: -1 });
            const sideConditions = ['reflect', 'lightscreen', 'safeguard', 'mist', 'spikes', 'toxicspikes', 'stealthrock'];
            for (const condition of sideConditions) {
                if (pokemon.side.removeSideCondition(condition)) {
                    this.add('-sideend', pokemon.side, this.dex.conditions.get(condition).name, '[from] move: Defog', `[of] ${pokemon}`);
                }
            }
        },
    target: "normal",
  },
  destinybond: {
    flags: {
      bypasssub: 1,
      noassist: 1,
      failcopycat: 1,
    },
    volatileStatus: "destinybond",
    onPrepareHit(pokemon) {
            pokemon.removeVolatile('destinybond');
        },
    condition: {
      noCopy: true,
      onStart(pokemon) {
                this.add('-singlemove', pokemon, 'Destiny Bond');
            },
      onFaint(target, source, effect) {
                if (!source || !effect || target.isAlly(source))
                    return;
                if (effect.effectType === 'Move' && !effect.flags['futuremove']) {
                    if (source.volatiles['dynamax']) {
                        this.add('-hint', "Dynamaxed Pokémon are immune to Destiny Bond.");
                        return;
                    }
                    this.add('-activate', target, 'move: Destiny Bond');
                    source.faint();
                }
            },
      onBeforeMovePriority: -1,
      onBeforeMove(pokemon, target, move) {
                if (move.id === 'destinybond')
                    return;
                this.debug('removing Destiny Bond before attack');
                pokemon.removeVolatile('destinybond');
            },
      onMoveAborted(pokemon, target, move) {
                pokemon.removeVolatile('destinybond');
            },
    },
    target: "self",
  },
  detect: {
    flags: {
      noassist: 1,
      failcopycat: 1,
    },
    stallingMove: true,
    volatileStatus: "protect",
    onPrepareHit(pokemon) {
            return !!this.queue.willAct() && this.runEvent('StallMove', pokemon);
        },
    onHit(pokemon) {
            pokemon.addVolatile('stall');
        },
    target: "self",
  },
  dig: {
    flags: {
      contact: 1,
      charge: 1,
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
      nosleeptalk: 1,
    },
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            this.add('-prepare', attacker, move.name);
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    condition: {
      duration: 2,
      onImmunity(type, pokemon) {
                if (type === 'sandstorm' || type === 'hail')
                    return false;
            },
      onInvulnerability(target, source, move) {
                if (['earthquake', 'magnitude'].includes(move.id)) {
                    return;
                }
                return false;
            },
      onSourceModifyDamage(damage, source, target, move) {
                if (move.id === 'earthquake' || move.id === 'magnitude') {
                    return this.chainModify(2);
                }
            },
    },
    target: "normal",
  },
  disable: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "disable",
    onTryHit(target) {
            if (!target.lastMove || target.lastMove.isZOrMaxPowered || target.lastMove.isMax || target.lastMove.id === 'struggle') {
                return false;
            }
        },
    condition: {
      duration: undefined,
      noCopy: true,
      onStart(pokemon) {
                if (!this.queue.willMove(pokemon)) {
                    this.effectState.duration++;
                }
                if (!pokemon.lastMove) {
                    return false;
                }
                for (const moveSlot of pokemon.moveSlots) {
                    if (moveSlot.id === pokemon.lastMove.id) {
                        if (!moveSlot.pp) {
                            return false;
                        }
                        else {
                            this.add('-start', pokemon, 'Disable', moveSlot.move);
                            this.effectState.move = pokemon.lastMove.id;
                            return;
                        }
                    }
                }
                return false;
            },
      onResidualOrder: 10,
      onEnd(pokemon) {
                this.add('-end', pokemon, 'Disable');
            },
      onBeforeMovePriority: 7,
      onBeforeMove(attacker, defender, move) {
                if (!(move.isZ && move.isZOrMaxPowered) && move.id === this.effectState.move) {
                    this.add('cant', attacker, 'Disable', move);
                    return false;
                }
            },
      onDisableMove(pokemon) {
                for (const moveSlot of pokemon.moveSlots) {
                    if (moveSlot.id === this.effectState.move) {
                        pokemon.disableMove(moveSlot.id);
                    }
                }
            },
      durationCallback() {
                return this.random(4, 8);
            },
      onResidualSubOrder: 13,
    },
    target: "normal",
  },
  discharge: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "allAdjacent",
  },
  dive: {
    flags: {
      contact: 1,
      charge: 1,
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
      nosleeptalk: 1,
    },
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            if (attacker.hasAbility('gulpmissile') && attacker.species.name === 'Cramorant' && !attacker.transformed) {
                const forme = attacker.hp <= attacker.maxhp / 2 ? 'cramorantgorging' : 'cramorantgulping';
                attacker.formeChange(forme, move);
            }
            this.add('-prepare', attacker, move.name);
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    condition: {
      duration: 2,
      onImmunity(type, pokemon) {
                if (type === 'sandstorm' || type === 'hail')
                    return false;
            },
      onInvulnerability(target, source, move) {
                if (['surf', 'whirlpool'].includes(move.id)) {
                    return;
                }
                return false;
            },
      onSourceModifyDamage(damage, source, target, move) {
                if (move.id === 'surf' || move.id === 'whirlpool') {
                    return this.chainModify(2);
                }
            },
    },
    target: "normal",
  },
  dizzypunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    secondary: {
      chance: 20,
      volatileStatus: "confusion",
    },
    target: "normal",
  },
  doomdesire: {
    flags: {
      metronome: 1,
      futuremove: 1,
    },
    onTry(source, target) {
            if (!target.side.addSlotCondition(target, 'futuremove'))
                return false;
            const moveData = {
                name: "Doom Desire",
                basePower: 120,
                category: "Special",
                flags: { metronome: 1, futuremove: 1 },
                willCrit: false,
                type: '???',
            };
            const damage = this.actions.getDamage(source, target, moveData, true);
            Object.assign(target.side.slotConditions[target.position]['futuremove'], {
                duration: 3,
                move: 'doomdesire',
                source,
                moveData: {
                    id: 'doomdesire',
                    name: "Doom Desire",
                    accuracy: 85,
                    basePower: 0,
                    damage,
                    category: "Special",
                    flags: { metronome: 1, futuremove: 1 },
                    effectType: 'Move',
                    type: '???',
                },
            });
            this.add('-start', source, 'Doom Desire');
            return null;
        },
    target: "normal",
  },
  doubleedge: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    recoil: [1, 3],
    target: "normal",
  },
  doublehit: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: 2,
    target: "normal",
  },
  doublekick: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: 2,
    target: "normal",
  },
  doubleslap: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  doubleteam: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      evasion: 1,
    },
    target: "self",
  },
  dracometeor: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      boosts: {
        spa: -2,
      },
    },
    target: "normal",
  },
  dragonbreath: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "normal",
  },
  dragonclaw: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  dragondance: {
    flags: {
      snatch: 1,
      dance: 1,
      metronome: 1,
    },
    boosts: {
      atk: 1,
      spe: 1,
    },
    target: "self",
  },
  dragonpulse: {
    flags: {
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      pulse: 1,
    },
    target: "any",
  },
  dragonrage: {
    damage: 40,
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  dragonrush: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 20,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  drainpunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    drain: [1, 2],
    target: "normal",
  },
  dreameater: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    drain: [1, 2],
    onTryImmunity(target) {
            return target.status === 'slp' && !target.volatiles['substitute'];
        },
    target: "normal",
  },
  drillpeck: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
    },
    target: "any",
  },
  dynamicpunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    secondary: {
      chance: 100,
      volatileStatus: "confusion",
    },
    target: "normal",
  },
  earthpower: {
    flags: {
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spd: -1,
      },
    },
    target: "normal",
  },
  earthquake: {
    flags: {
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    target: "allAdjacent",
  },
  eggbomb: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    target: "normal",
  },
  embargo: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "embargo",
    condition: {
      duration: 5,
      onStart(pokemon) {
                this.add('-start', pokemon, 'Embargo');
                this.singleEvent('End', pokemon.getItem(), pokemon.itemState, pokemon);
            },
      onResidualOrder: 10,
      onEnd(pokemon) {
                this.add('-end', pokemon, 'Embargo');
            },
      onResidualSubOrder: 18,
    },
    target: "normal",
    onTryHit(pokemon) {
            if (pokemon.ability === 'multitype' || pokemon.item === 'griseousorb') {
                return false;
            }
        },
  },
  ember: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "brn",
    },
    target: "normal",
  },
  encore: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
      failencore: 1,
    },
    volatileStatus: "encore",
    condition: {
      duration: undefined,
      noCopy: true,
      onStart(target) {
                let move = target.lastMove;
                if (!move || target.volatiles['dynamax'])
                    return false;
                // Encore only works on Max Moves if the base move is not itself a Max Move
                if (move.isMax && move.baseMove)
                    move = this.dex.moves.get(move.baseMove);
                const moveSlot = target.getMoveData(move.id);
                if (move.isZ || move.isMax || move.flags['failencore'] || !moveSlot || moveSlot.pp <= 0) {
                    // it failed
                    return false;
                }
                this.effectState.move = move.id;
                this.add('-start', target, 'Encore');
                if (!this.queue.willMove(target)) {
                    this.effectState.duration++;
                }
            },
      onOverrideAction(pokemon, target, move) {
                if (move.id !== this.effectState.move)
                    return this.effectState.move;
            },
      onResidualOrder: 10,
      onResidual(target) {
                const moveSlot = target.getMoveData(this.effectState.move);
                if (!moveSlot || moveSlot.pp <= 0) {
                    // early termination if you run out of PP
                    target.removeVolatile('encore');
                }
            },
      onEnd(target) {
                this.add('-end', target, 'Encore');
            },
      onDisableMove(pokemon) {
                if (!this.effectState.move || !pokemon.hasMove(this.effectState.move)) {
                    return;
                }
                for (const moveSlot of pokemon.moveSlots) {
                    if (moveSlot.id !== this.effectState.move) {
                        pokemon.disableMove(moveSlot.id);
                    }
                }
            },
      durationCallback() {
                return this.random(4, 9);
            },
      onResidualSubOrder: 14,
    },
    target: "normal",
  },
  endeavor: {
    damageCallback(pokemon, target) {
            return target.getUndynamaxedHP() - pokemon.hp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      noparentalbond: 1,
    },
    onTryImmunity(target, pokemon) {
            return pokemon.hp < target.hp;
        },
    target: "normal",
    onTry(pokemon, target) {
            if (pokemon.hp >= target.hp) {
                this.add('-fail', pokemon);
                return null;
            }
        },
    basePower: 0,
  },
  endure: {
    flags: {
      noassist: 1,
      failcopycat: 1,
    },
    stallingMove: true,
    volatileStatus: "endure",
    onPrepareHit(pokemon) {
            return !!this.queue.willAct() && this.runEvent('StallMove', pokemon);
        },
    onHit(pokemon) {
            pokemon.addVolatile('stall');
        },
    condition: {
      duration: 1,
      onStart(target) {
                this.add('-singleturn', target, 'move: Endure');
            },
      onDamagePriority: -10,
      onDamage(damage, target, source, effect) {
                if (effect?.effectType === 'Move' && damage >= target.hp) {
                    this.add('-activate', target, 'move: Endure');
                    return target.hp - 1;
                }
            },
    },
    target: "self",
  },
  energyball: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spd: -1,
      },
    },
    target: "normal",
  },
  eruption: {
    basePowerCallback(pokemon, target, move) {
            const bp = move.basePower * pokemon.hp / pokemon.maxhp;
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "allAdjacentFoes",
  },
  explosion: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      noparentalbond: 1,
    },
    selfdestruct: "always",
    target: "allAdjacent",
  },
  extrasensory: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  extremespeed: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  facade: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onBasePower(basePower, pokemon) {
            if (pokemon.status && pokemon.status !== 'slp') {
                return this.chainModify(2);
            }
        },
    target: "normal",
  },
  fakeout: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onTry(source) {
            if (source.activeMoveActions > 1) {
                this.hint("Fake Out only works on your first turn out.");
                return false;
            }
        },
    secondary: {
      chance: 100,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  faketears: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    boosts: {
      spd: -2,
    },
    target: "normal",
  },
  falseswipe: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onDamagePriority: -20,
    onDamage(damage, target, source, effect) {
            if (damage >= target.hp)
                return target.hp - 1;
        },
    target: "normal",
  },
  featherdance: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      dance: 1,
      allyanim: 1,
      metronome: 1,
    },
    boosts: {
      atk: -2,
    },
    target: "normal",
  },
  feint: {
    flags: {
      noassist: 1,
      failcopycat: 1,
    },
    breaksProtect: true,
    target: "normal",
    onTry(source, target) {
            if (!target.volatiles['protect']) {
                this.add('-fail', source);
                return null;
            }
        },
  },
  feintattack: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  fireblast: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "brn",
    },
    target: "normal",
  },
  firefang: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bite: 1,
    },
    secondaries: [
      {
        chance: 10,
        status: "brn",
      },
      {
        chance: 10,
        volatileStatus: "flinch",
      },
    ],
    target: "normal",
  },
  firepunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "brn",
    },
    target: "normal",
  },
  firespin: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "partiallytrapped",
    target: "normal",
  },
  fissure: {
    flags: {
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    ohko: true,
    target: "normal",
    basePower: 0,
  },
  flail: {
    basePowerCallback(pokemon) {
            const ratio = Math.max(Math.floor(pokemon.hp * 64 / pokemon.maxhp), 1);
            let bp;
            if (ratio < 2) {
                bp = 200;
            }
            else if (ratio < 6) {
                bp = 150;
            }
            else if (ratio < 13) {
                bp = 100;
            }
            else if (ratio < 22) {
                bp = 80;
            }
            else if (ratio < 43) {
                bp = 40;
            }
            else {
                bp = 20;
            }
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  flamethrower: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "brn",
    },
    target: "normal",
  },
  flamewheel: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      defrost: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "brn",
    },
    target: "normal",
  },
  flareblitz: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      defrost: 1,
      metronome: 1,
    },
    recoil: [1, 3],
    secondary: {
      chance: 10,
      status: "brn",
    },
    target: "normal",
  },
  flash: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      accuracy: -1,
    },
    target: "normal",
  },
  flashcannon: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spd: -1,
      },
    },
    target: "normal",
  },
  flatter: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    volatileStatus: "confusion",
    boosts: {
      spa: 1,
    },
    target: "normal",
  },
  fling: {
    flags: {
      protect: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
      noparentalbond: 1,
    },
    onPrepareHit(target, source, move) {
            if (source.ignoringItem(true))
                return false;
            const item = source.getItem();
            if (!this.singleEvent('TakeItem', item, source.itemState, source, source, move, item))
                return false;
            if (!item.fling)
                return false;
            move.basePower = item.fling.basePower;
            this.debug(`BP: ${move.basePower}`);
            if (item.isBerry) {
                move.onHit = function (foe) {
                    if (this.singleEvent('Eat', item, source.itemState, foe, source, move)) {
                        this.runEvent('EatItem', foe, source, move, item);
                        if (item.id === 'leppaberry')
                            foe.staleness = 'external';
                    }
                    if (item.onEat)
                        foe.ateBerry = true;
                };
            }
            else if (item.fling.effect) {
                move.onHit = item.fling.effect;
            }
            else {
                if (!move.secondaries)
                    move.secondaries = [];
                if (item.fling.status) {
                    move.secondaries.push({ status: item.fling.status });
                }
                else if (item.fling.volatileStatus) {
                    move.secondaries.push({ volatileStatus: item.fling.volatileStatus });
                }
            }
            source.addVolatile('fling');
        },
    condition: {
      onUpdate(pokemon) {
                const item = pokemon.getItem();
                pokemon.setItem('');
                pokemon.lastItem = item.id;
                pokemon.usedItemThisTurn = true;
                this.add('-enditem', pokemon, item.name, '[from] move: Fling');
                this.runEvent('AfterUseItem', pokemon, null, null, item);
                pokemon.removeVolatile('fling');
            },
    },
    target: "normal",
    basePower: 0,
  },
  fly: {
    flags: {
      contact: 1,
      charge: 1,
      protect: 1,
      mirror: 1,
      gravity: 1,
      distance: 1,
      metronome: 1,
    },
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            this.add('-prepare', attacker, move.name);
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    condition: {
      duration: 2,
      onInvulnerability(target, source, move) {
                if (['gust', 'twister', 'skyuppercut', 'thunder', 'hurricane', 'smackdown', 'thousandarrows'].includes(move.id)) {
                    return;
                }
                return false;
            },
      onSourceModifyDamage(damage, source, target, move) {
                if (move.id === 'gust' || move.id === 'twister') {
                    return this.chainModify(2);
                }
            },
    },
    target: "any",
  },
  focusblast: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spd: -1,
      },
    },
    target: "normal",
  },
  focusenergy: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    volatileStatus: "focusenergy",
    condition: {
      onStart(target, source, effect) {
                if (target.volatiles['dragoncheer'])
                    return false;
                if (effect?.id === 'zpower') {
                    this.add('-start', target, 'move: Focus Energy', '[zeffect]');
                }
                else if (effect && (['costar', 'imposter', 'psychup', 'transform'].includes(effect.id))) {
                    this.add('-start', target, 'move: Focus Energy', '[silent]');
                }
                else {
                    this.add('-start', target, 'move: Focus Energy');
                }
            },
      onModifyCritRatio(critRatio) {
                return critRatio + 2;
            },
    },
    target: "self",
  },
  focuspunch: {
    flags: {
      contact: 1,
      protect: 1,
      punch: 1,
      failmefirst: 1,
      nosleeptalk: 1,
      noassist: 1,
      failcopycat: 1,
      failinstruct: 1,
    },
    condition: {
      duration: 1,
      onStart(pokemon) {
                this.add('-singleturn', pokemon, 'move: Focus Punch');
            },
      onHit(pokemon, source, move) {
                if (move.category !== 'Status') {
                    this.effectState.lostFocus = true;
                }
            },
      onTryAddVolatile(status, pokemon) {
                if (status.id === 'flinch')
                    return null;
            },
    },
    target: "normal",
    beforeTurnCallback(pokemon) {
            pokemon.addVolatile('focuspunch');
        },
    onTry(pokemon) {
            if (pokemon.volatiles['focuspunch']?.lostFocus) {
                this.attrLastMove('[still]');
                this.add('cant', pokemon, 'Focus Punch', 'Focus Punch');
                return null;
            }
        },
  },
  followme: {
    flags: {
      noassist: 1,
      failcopycat: 1,
    },
    volatileStatus: "followme",
    onTry(source) {
            return this.activePerHalf > 1;
        },
    condition: {
      duration: 1,
      onStart(target, source, effect) {
                if (effect?.id === 'zpower') {
                    this.add('-singleturn', target, 'move: Follow Me', '[zeffect]');
                }
                else {
                    this.add('-singleturn', target, 'move: Follow Me');
                }
            },
      onFoeRedirectTargetPriority: 1,
      onFoeRedirectTarget(target, source, source2, move) {
                if (!this.effectState.target.isSkyDropped() && this.validTarget(this.effectState.target, source, move.target)) {
                    if (move.smartTarget)
                        move.smartTarget = false;
                    this.debug("Follow Me redirected target of move");
                    return this.effectState.target;
                }
            },
    },
    target: "self",
  },
  forcepalm: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "normal",
  },
  foresight: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "foresight",
    onTryHit(target) {
            if (target.volatiles['miracleeye'])
                return false;
        },
    condition: {
      noCopy: true,
      onStart(pokemon) {
                this.add('-start', pokemon, 'Foresight');
            },
      onNegateImmunity(pokemon, type) {
                if (pokemon.hasType('Ghost') && ['Normal', 'Fighting'].includes(type))
                    return false;
            },
      onModifyBoost(boosts) {
                if (boosts.evasion && boosts.evasion > 0) {
                    boosts.evasion = 0;
                }
            },
    },
    target: "normal",
  },
  frenzyplant: {
    flags: {
      recharge: 1,
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    self: {
      volatileStatus: "mustrecharge",
    },
    target: "normal",
  },
  frustration: {
    basePowerCallback(pokemon) {
            return Math.floor(((255 - pokemon.happiness) * 10) / 25) || 1;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  furyattack: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  furycutter: {
    basePowerCallback(pokemon, target, move) {
            if (!pokemon.volatiles['furycutter'] || move.hit === 1) {
                pokemon.addVolatile('furycutter');
            }
            const bp = this.clampIntRange(move.basePower * pokemon.volatiles['furycutter'].multiplier, 1, 160);
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    condition: {
      duration: 2,
      onStart() {
                this.effectState.multiplier = 1;
            },
      onRestart() {
                if (this.effectState.multiplier < 16) {
                    this.effectState.multiplier <<= 1;
                }
                this.effectState.duration = 2;
            },
    },
    target: "normal",
  },
  furyswipes: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  futuresight: {
    flags: {
      metronome: 1,
      futuremove: 1,
    },
    ignoreImmunity: true,
    onTry(source, target) {
            if (!target.side.addSlotCondition(target, 'futuremove'))
                return false;
            const moveData = {
                name: "Future Sight",
                basePower: 80,
                category: "Special",
                flags: { metronome: 1, futuremove: 1 },
                willCrit: false,
                type: '???',
            };
            const damage = this.actions.getDamage(source, target, moveData, true);
            Object.assign(target.side.slotConditions[target.position]['futuremove'], {
                duration: 3,
                move: 'futuresight',
                source,
                moveData: {
                    id: 'futuresight',
                    name: "Future Sight",
                    accuracy: 90,
                    basePower: 0,
                    damage,
                    category: "Special",
                    flags: { metronome: 1, futuremove: 1 },
                    effectType: 'Move',
                    type: '???',
                },
            });
            this.add('-start', source, 'Future Sight');
            return null;
        },
    target: "normal",
  },
  gastroacid: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    volatileStatus: "gastroacid",
    onTryHit(target) {
            if (target.getAbility().flags['cantsuppress']) {
                return false;
            }
            if (target.hasItem('Ability Shield')) {
                this.add('-block', target, 'item: Ability Shield');
                return null;
            }
        },
    condition: {
      onStart(pokemon) {
                if (pokemon.hasItem('Ability Shield'))
                    return false;
                this.add('-endability', pokemon);
                this.singleEvent('End', pokemon.getAbility(), pokemon.abilityState, pokemon, pokemon, 'gastroacid');
            },
      onCopy(pokemon) {
                if (pokemon.getAbility().flags['cantsuppress'])
                    pokemon.removeVolatile('gastroacid');
            },
    },
    target: "normal",
  },
  gigadrain: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    drain: [1, 2],
    target: "normal",
  },
  gigaimpact: {
    flags: {
      contact: 1,
      recharge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      volatileStatus: "mustrecharge",
    },
    target: "normal",
  },
  glare: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    status: "par",
    target: "normal",
  },
  grassknot: {
    basePowerCallback(pokemon, target) {
            const targetWeight = target.getWeight();
            let bp;
            if (targetWeight >= 2000) {
                bp = 120;
            }
            else if (targetWeight >= 1000) {
                bp = 100;
            }
            else if (targetWeight >= 500) {
                bp = 80;
            }
            else if (targetWeight >= 250) {
                bp = 60;
            }
            else if (targetWeight >= 100) {
                bp = 40;
            }
            else {
                bp = 20;
            }
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  grasswhistle: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    status: "slp",
    target: "normal",
  },
  gravity: {
    flags: {
      nonsky: 1,
      metronome: 1,
    },
    pseudoWeather: "gravity",
    condition: {
      duration: 5,
      durationCallback(source, effect) {
                if (source?.hasAbility('persistent')) {
                    this.add('-activate', source, 'ability: Persistent', '[move] Gravity');
                    return 7;
                }
                return 5;
            },
      onFieldStart(target, source) {
                if (source?.hasAbility('persistent')) {
                    this.add('-fieldstart', 'move: Gravity', '[persistent]');
                }
                else {
                    this.add('-fieldstart', 'move: Gravity');
                }
                for (const pokemon of this.getAllActive()) {
                    let applies = false;
                    if (pokemon.removeVolatile('bounce') || pokemon.removeVolatile('fly')) {
                        applies = true;
                        this.queue.cancelMove(pokemon);
                        pokemon.removeVolatile('twoturnmove');
                    }
                    if (pokemon.volatiles['skydrop']) {
                        applies = true;
                        this.queue.cancelMove(pokemon);
                        if (pokemon.volatiles['skydrop'].source) {
                            this.add('-end', pokemon.volatiles['twoturnmove'].source, 'Sky Drop', '[interrupt]');
                        }
                        pokemon.removeVolatile('skydrop');
                        pokemon.removeVolatile('twoturnmove');
                    }
                    if (pokemon.volatiles['magnetrise']) {
                        applies = true;
                        delete pokemon.volatiles['magnetrise'];
                    }
                    if (pokemon.volatiles['telekinesis']) {
                        applies = true;
                        delete pokemon.volatiles['telekinesis'];
                    }
                    if (applies)
                        this.add('-activate', pokemon, 'move: Gravity');
                }
            },
      onModifyAccuracy(accuracy) {
                if (typeof accuracy !== 'number')
                    return;
                return this.chainModify([6840, 4096]);
            },
      onDisableMove(pokemon) {
                for (const moveSlot of pokemon.moveSlots) {
                    if (this.dex.moves.get(moveSlot.id).flags['gravity']) {
                        pokemon.disableMove(moveSlot.id);
                    }
                }
            },
      onBeforeMovePriority: 6,
      onBeforeMove(pokemon, target, move) {
                if (move.flags['gravity'] && !move.isZ) {
                    this.add('cant', pokemon, 'move: Gravity', move);
                    return false;
                }
            },
      onModifyMove(move, pokemon, target) {
                if (move.flags['gravity'] && !move.isZ) {
                    this.add('cant', pokemon, 'move: Gravity', move);
                    return false;
                }
            },
      onFieldResidualOrder: 9,
      onFieldResidualSubOrder: undefined,
      onFieldEnd() {
                this.add('-fieldend', 'move: Gravity');
            },
    },
    target: "all",
  },
  growl: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    boosts: {
      atk: -1,
    },
    target: "allAdjacentFoes",
  },
  growth: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      spa: 1,
    },
    target: "self",
  },
  grudge: {
    flags: {
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "grudge",
    condition: {
      onStart(pokemon) {
                this.add('-singlemove', pokemon, 'Grudge');
            },
      onFaint(target, source, effect) {
                if (!source || source.fainted || !effect)
                    return;
                if (effect.effectType === 'Move' && !effect.flags['futuremove'] && source.lastMove) {
                    let move = source.lastMove;
                    if (move.isMax && move.baseMove)
                        move = this.dex.moves.get(move.baseMove);
                    for (const moveSlot of source.moveSlots) {
                        if (moveSlot.id === move.id) {
                            moveSlot.pp = 0;
                            this.add('-activate', source, 'move: Grudge', move.name);
                        }
                    }
                }
            },
      onBeforeMovePriority: 100,
      onBeforeMove(pokemon) {
                this.debug('removing Grudge before attack');
                pokemon.removeVolatile('grudge');
            },
    },
    target: "self",
  },
  guardswap: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      allyanim: 1,
      metronome: 1,
    },
    onHit(target, source) {
            const targetBoosts = {};
            const sourceBoosts = {};
            const defSpd = ['def', 'spd'];
            for (const stat of defSpd) {
                targetBoosts[stat] = target.boosts[stat];
                sourceBoosts[stat] = source.boosts[stat];
            }
            source.setBoost(targetBoosts);
            target.setBoost(sourceBoosts);
            this.add('-swapboost', source, target, 'def, spd', '[from] move: Guard Swap');
        },
    target: "normal",
  },
  guillotine: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    ohko: true,
    target: "normal",
    basePower: 0,
  },
  gunkshot: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "psn",
    },
    target: "normal",
  },
  gust: {
    flags: {
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      wind: 1,
    },
    target: "any",
  },
  gyroball: {
    basePowerCallback(pokemon, target) {
            let power = Math.floor(25 * target.getStat('spe') / Math.max(1, pokemon.getStat('spe'))) + 1;
            if (power > 150)
                power = 150;
            this.debug(`BP: ${power}`);
            return power;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    target: "normal",
    basePower: 0,
  },
  hail: {
    flags: {
      metronome: 1,
    },
    weather: "hail",
    target: "all",
  },
  hammerarm: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    self: {
      boosts: {
        spe: -1,
      },
    },
    target: "normal",
  },
  harden: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      def: 1,
    },
    target: "self",
  },
  haze: {
    flags: {
      bypasssub: 1,
      metronome: 1,
    },
    onHitField() {
            this.add('-clearallboost');
            for (const pokemon of this.getAllActive()) {
                pokemon.clearBoosts();
                pokemon.removeVolatile('focusenergy');
            }
        },
    target: "all",
  },
  headbutt: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  headsmash: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    recoil: [1, 2],
    target: "normal",
  },
  healbell: {
    flags: {
      snatch: 1,
      sound: 1,
      metronome: 1,
    },
    onHit(target, source) {
            this.add('-activate', source, 'move: Heal Bell');
            const allies = [...target.side.pokemon, ...target.side.allySide?.pokemon || []];
            for (const ally of allies) {
                if (ally.hasAbility('soundproof') && !this.suppressingAbility(ally)) {
                    if (ally.isActive)
                        this.add('-immune', ally, '[from] ability: Soundproof');
                    continue;
                }
                ally.cureStatus(true);
            }
        },
    target: "allyTeam",
  },
  healblock: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "healblock",
    condition: {
      duration: 5,
      durationCallback(target, source, effect) {
                if (effect?.name === "Psychic Noise") {
                    return 2;
                }
                if (source?.hasAbility('persistent')) {
                    this.add('-activate', source, 'ability: Persistent', '[move] Heal Block');
                    return 7;
                }
                return 5;
            },
      onStart(pokemon, source) {
                this.add('-start', pokemon, 'move: Heal Block');
                source.moveThisTurnResult = true;
            },
      onDisableMove(pokemon) {
                for (const moveSlot of pokemon.moveSlots) {
                    if (this.dex.moves.get(moveSlot.id).flags['heal']) {
                        pokemon.disableMove(moveSlot.id);
                    }
                }
            },
      onBeforeMovePriority: 6,
      onBeforeMove(pokemon, target, move) {
                if (move.flags['heal'] && !move.isZ && !move.isMax) {
                    this.add('cant', pokemon, 'move: Heal Block', move);
                    return false;
                }
            },
      onModifyMove(move, pokemon) {
                if (move.flags['heal'] && !move.isZ && !move.isMax) {
                    this.add('cant', pokemon, 'move: Heal Block', move);
                    return false;
                }
            },
      onResidualOrder: 10,
      onEnd(pokemon) {
                this.add('-end', pokemon, 'move: Heal Block');
            },
      onTryHeal(damage, pokemon, source, effect) {
                if (effect && (effect.id === 'drain' || effect.id === 'leechseed' || effect.id === 'wish')) {
                    return false;
                }
            },
      onRestart(target, source, effect) {
                if (effect?.name === 'Psychic Noise')
                    return;
                this.add('-fail', target, 'move: Heal Block'); // Succeeds to suppress downstream messages
                if (!source.moveThisTurnResult) {
                    source.moveThisTurnResult = false;
                }
            },
      onResidualSubOrder: 17,
    },
    target: "allAdjacentFoes",
  },
  healingwish: {
    flags: {
      heal: 1,
      metronome: 1,
    },
    onTryHit(source) {
            if (!this.canSwitch(source.side)) {
                this.attrLastMove('[still]');
                this.add('-fail', source);
                return this.NOT_FAIL;
            }
        },
    selfdestruct: "ifHit",
    slotCondition: "healingwish",
    condition: {
      duration: 1,
      onSwitchInPriority: -1,
      onSwitchIn(target) {
                if (target.hp > 0) {
                    target.heal(target.maxhp);
                    target.clearStatus();
                    this.add('-heal', target, target.getHealth, '[from] move: Healing Wish');
                    target.side.removeSlotCondition(target, 'healingwish');
                    target.lastMove = this.lastMove;
                }
                else {
                    target.switchFlag = true;
                }
            },
    },
    target: "self",
    onAfterMove(pokemon) {
            pokemon.switchFlag = true;
        },
  },
  healorder: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    heal: [1, 2],
    target: "self",
  },
  heartswap: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      allyanim: 1,
      metronome: 1,
    },
    onHit(target, source) {
            const targetBoosts = {};
            const sourceBoosts = {};
            let i;
            for (i in target.boosts) {
                targetBoosts[i] = target.boosts[i];
                sourceBoosts[i] = source.boosts[i];
            }
            target.setBoost(sourceBoosts);
            source.setBoost(targetBoosts);
            this.add('-swapboost', source, target, '[from] move: Heart Swap');
        },
    target: "normal",
  },
  heatwave: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      wind: 1,
    },
    secondary: {
      chance: 10,
      status: "brn",
    },
    target: "allAdjacentFoes",
  },
  helpinghand: {
    flags: {
      bypasssub: 1,
      noassist: 1,
      failcopycat: 1,
    },
    volatileStatus: "helpinghand",
    onTryHit(target) {
            if (!target.newlySwitched && !this.queue.willMove(target))
                return false;
        },
    condition: {
      duration: 1,
      onStart(target, source) {
                this.effectState.multiplier = 1.5;
                this.add('-singleturn', target, 'Helping Hand', `[of] ${source}`);
            },
      onRestart(target, source) {
                this.effectState.multiplier *= 1.5;
                this.add('-singleturn', target, 'Helping Hand', `[of] ${source}`);
            },
      onBasePowerPriority: 10,
      onBasePower(basePower) {
                this.debug('Boosting from Helping Hand: ' + this.effectState.multiplier);
                return this.chainModify(this.effectState.multiplier);
            },
    },
    target: "adjacentAlly",
  },
  hiddenpower: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onModifyType(move, pokemon) {
            move.type = pokemon.hpType || 'Dark';
        },
    target: "normal",
    basePowerCallback(pokemon) {
            const bp = pokemon.hpPower || 70;
            this.debug(`BP: ${bp}`);
            return bp;
        },
    basePower: 0,
  },
  hiddenpowerbug: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerdark: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerdragon: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerelectric: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerfighting: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerfire: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerflying: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerghost: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowergrass: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerground: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerice: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerpoison: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerpsychic: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerrock: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowersteel: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  hiddenpowerwater: {
    flags: {
      protect: 1,
      mirror: 1,
    },
    target: "normal",
  },
  highjumpkick: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      gravity: 1,
      metronome: 1,
    },
    hasCrashDamage: true,
    onMoveFail(target, source, move) {
            move.causedCrashDamage = true;
            let damage = this.actions.getDamage(source, target, move, true);
            if (!damage)
                damage = target.maxhp;
            this.damage(this.clampIntRange(damage / 2, 1, Math.floor(target.maxhp / 2)), source, source, move);
        },
    target: "normal",
  },
  hornattack: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  horndrill: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    ohko: true,
    target: "normal",
    basePower: 0,
  },
  howl: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      atk: 1,
    },
    target: "self",
  },
  hydrocannon: {
    flags: {
      recharge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      volatileStatus: "mustrecharge",
    },
    target: "normal",
  },
  hydropump: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  hyperbeam: {
    flags: {
      recharge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      volatileStatus: "mustrecharge",
    },
    target: "normal",
  },
  hyperfang: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bite: 1,
    },
    secondary: {
      chance: 10,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  hypervoice: {
    flags: {
      protect: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    target: "allAdjacentFoes",
  },
  hypnosis: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    status: "slp",
    target: "normal",
  },
  iceball: {
    basePowerCallback(pokemon, target, move) {
            let bp = move.basePower;
            const iceballData = pokemon.volatiles['iceball'];
            if (iceballData?.hitCount) {
                bp *= 2 ** iceballData.contactHitCount;
            }
            if (iceballData && pokemon.status !== 'slp') {
                iceballData.hitCount++;
                iceballData.contactHitCount++;
                if (iceballData.hitCount < 5) {
                    iceballData.duration = 2;
                }
            }
            if (pokemon.volatiles['defensecurl']) {
                bp *= 2;
            }
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      failinstruct: 1,
      bullet: 1,
      noparentalbond: 1,
    },
    onModifyMove(move, pokemon, target) {
            if (pokemon.volatiles['iceball'] || pokemon.status === 'slp' || !target)
                return;
            pokemon.addVolatile('iceball');
            if (move.sourceEffect)
                pokemon.lastMoveTargetLoc = pokemon.getLocOf(target);
        },
    onAfterMove(source, target, move) {
            const iceballData = source.volatiles["iceball"];
            if (iceballData &&
                iceballData.hitCount === 5 &&
                iceballData.contactHitCount < 5
            // this conditions can only be met in gen7 and gen8dlc1
            // see `disguise` and `iceface` abilities in the resp mod folders
            ) {
                source.addVolatile("rolloutstorage");
                source.volatiles["rolloutstorage"].contactHitCount =
                    iceballData.contactHitCount;
            }
        },
    condition: {
      duration: 1,
      onLockMove: "iceball",
      onStart() {
                this.effectState.hitCount = 0;
                this.effectState.contactHitCount = 0;
            },
      onResidual(target) {
                if (target.lastMove && target.lastMove.id === 'struggle') {
                    // don't lock
                    delete target.volatiles['iceball'];
                }
            },
    },
    target: "normal",
  },
  icebeam: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "frz",
    },
    target: "normal",
  },
  icefang: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bite: 1,
    },
    secondaries: [
      {
        chance: 10,
        status: "frz",
      },
      {
        chance: 10,
        volatileStatus: "flinch",
      },
    ],
    target: "normal",
  },
  icepunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "frz",
    },
    target: "normal",
  },
  iceshard: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  iciclespear: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  icywind: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      wind: 1,
    },
    secondary: {
      chance: 100,
      boosts: {
        spe: -1,
      },
    },
    target: "allAdjacentFoes",
  },
  imprison: {
    flags: {
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "imprison",
    condition: {
      noCopy: true,
      onStart(target) {
                this.add('-start', target, 'move: Imprison');
            },
      onFoeDisableMove(pokemon) {
                for (const moveSlot of this.effectState.source.moveSlots) {
                    if (moveSlot.id === 'struggle')
                        continue;
                    pokemon.disableMove(moveSlot.id, true);
                }
                pokemon.maybeDisabled = true;
            },
      onFoeBeforeMovePriority: 4,
      onFoeBeforeMove(attacker, defender, move) {
                if (move.id !== 'struggle' && this.effectState.source.hasMove(move.id) && !move.isZOrMaxPowered) {
                    this.add('cant', attacker, 'move: Imprison', move);
                    return false;
                }
            },
    },
    target: "self",
    onTryHit(pokemon) {
            for (const target of pokemon.foes()) {
                for (const move of pokemon.moves) {
                    if (target.moves.includes(move))
                        return;
                }
            }
            return false;
        },
  },
  ingrain: {
    flags: {
      snatch: 1,
      nonsky: 1,
      metronome: 1,
    },
    volatileStatus: "ingrain",
    condition: {
      onStart(pokemon) {
                this.add('-start', pokemon, 'move: Ingrain');
            },
      onResidualOrder: 10,
      onResidual(pokemon) {
                this.heal(pokemon.baseMaxhp / 16);
            },
      onTrapPokemon(pokemon) {
                pokemon.tryTrap();
            },
      onDragOut(pokemon) {
                this.add('-activate', pokemon, 'move: Ingrain');
                return null;
            },
      onResidualSubOrder: 1,
    },
    target: "self",
  },
  irondefense: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      def: 2,
    },
    target: "self",
  },
  ironhead: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  irontail: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      boosts: {
        def: -1,
      },
    },
    target: "normal",
  },
  judgment: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onModifyType(move, pokemon) {
            if (pokemon.ignoringItem())
                return;
            const item = pokemon.getItem();
            if (item.id && item.onPlate && !item.zMove) {
                move.type = item.onPlate;
            }
        },
    target: "normal",
  },
  jumpkick: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      gravity: 1,
      metronome: 1,
    },
    hasCrashDamage: true,
    onMoveFail(target, source, move) {
            move.causedCrashDamage = true;
            let damage = this.actions.getDamage(source, target, move, true);
            if (!damage)
                damage = target.maxhp;
            this.damage(this.clampIntRange(damage / 2, 1, Math.floor(target.maxhp / 2)), source, source, move);
        },
    target: "normal",
  },
  karatechop: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  kinesis: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      accuracy: -1,
    },
    target: "normal",
  },
  knockoff: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onAfterHit(target, source, move) {
            if (!target.item)
                return;
            const item = target.getItem();
            if (this.runEvent('TakeItem', target, source, move, item)) {
                target.item = '';
                target.itemKnockedOff = true;
                this.add('-enditem', target, item.name, '[from] move: Knock Off', `[of] ${source}`);
                this.hint("In Gens 3-4, Knock Off only makes the target's item unusable; it cannot obtain a new item.", true);
            }
        },
    target: "normal",
  },
  lastresort: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onTry(source) {
            if (source.moveSlots.length < 2)
                return false; // Last Resort fails unless the user knows at least 2 moves
            let hasLastResort = false; // User must actually have Last Resort for it to succeed
            for (const moveSlot of source.moveSlots) {
                if (moveSlot.id === 'lastresort') {
                    hasLastResort = true;
                    continue;
                }
                if (!moveSlot.used)
                    return false;
            }
            return hasLastResort;
        },
    target: "normal",
  },
  lavaplume: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "brn",
    },
    target: "allAdjacent",
  },
  leafblade: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  leafstorm: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      boosts: {
        spa: -2,
      },
    },
    target: "normal",
  },
  leechlife: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    drain: [1, 2],
    target: "normal",
  },
  leechseed: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "leechseed",
    condition: {
      onStart(target) {
                this.add('-start', target, 'move: Leech Seed');
            },
      onResidualOrder: 10,
      onResidual(pokemon) {
                const target = this.getAtSlot(pokemon.volatiles['leechseed'].sourceSlot);
                if (!target || target.fainted || target.hp <= 0) {
                    this.debug('Nothing to leech into');
                    return;
                }
                const damage = this.damage(pokemon.baseMaxhp / 8, pokemon, target);
                if (damage) {
                    this.heal(damage, target, pokemon);
                }
            },
      onResidualSubOrder: 5,
    },
    onTryImmunity(target) {
            return !target.hasType('Grass');
        },
    target: "normal",
  },
  leer: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      def: -1,
    },
    target: "allAdjacentFoes",
  },
  lick: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "normal",
  },
  lightscreen: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    sideCondition: "lightscreen",
    condition: {
      duration: 5,
      durationCallback(target, source, effect) {
                if (source?.hasItem('lightclay')) {
                    return 8;
                }
                return 5;
            },
      onAnyModifyDamage: undefined,
      onSideStart(side) {
                this.add('-sidestart', side, 'move: Light Screen');
            },
      onSideResidualOrder: 2,
      onSideResidualSubOrder: undefined,
      onSideEnd(side) {
                this.add('-sideend', side, 'move: Light Screen');
            },
      onAnyModifyDamagePhase1(damage, source, target, move) {
                if (target !== source && this.effectState.target.hasAlly(target) && this.getCategory(move) === 'Special') {
                    if (!target.getMoveHitData(move).crit && !move.infiltrates) {
                        this.debug('Light Screen weaken');
                        if (target.alliesAndSelf().length > 1)
                            return this.chainModify(2, 3);
                        return this.chainModify(0.5);
                    }
                }
            },
    },
    target: "allySide",
  },
  lockon: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onTryHit(target, source) {
            if (source.volatiles['lockon'])
                return false;
        },
    onHit(target, source) {
            source.addVolatile('lockon', target);
            this.add('-activate', source, 'move: Lock-On', `[of] ${target}`);
        },
    condition: {
      noCopy: false,
      duration: 2,
      onSourceInvulnerabilityPriority: 1,
      onSourceInvulnerability(target, source, move) {
                if (move && source === this.effectState.target && target === this.effectState.source)
                    return 0;
            },
      onSourceAccuracy(accuracy, target, source, move) {
                if (move && source === this.effectState.target && target === this.effectState.source)
                    return true;
            },
    },
    target: "normal",
  },
  lovelykiss: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    status: "slp",
    target: "normal",
  },
  lowkick: {
    basePowerCallback(pokemon, target) {
            const targetWeight = target.getWeight();
            let bp;
            if (targetWeight >= 2000) {
                bp = 120;
            }
            else if (targetWeight >= 1000) {
                bp = 100;
            }
            else if (targetWeight >= 500) {
                bp = 80;
            }
            else if (targetWeight >= 250) {
                bp = 60;
            }
            else if (targetWeight >= 100) {
                bp = 40;
            }
            else {
                bp = 20;
            }
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  luckychant: {
    flags: {
      metronome: 1,
    },
    sideCondition: "luckychant",
    condition: {
      duration: 5,
      onSideStart(side) {
                this.add('-sidestart', side, 'move: Lucky Chant'); // "The Lucky Chant shielded [side.name]'s team from critical hits!"
            },
      onCriticalHit: false,
      onSideResidualOrder: 6,
      onSideResidualSubOrder: undefined,
      onSideEnd(side) {
                this.add('-sideend', side, 'move: Lucky Chant'); // "[side.name]'s team's Lucky Chant wore off!"
            },
    },
    target: "allySide",
  },
  lunardance: {
    flags: {
      heal: 1,
      metronome: 1,
    },
    onTryHit(source) {
            if (!this.canSwitch(source.side)) {
                this.attrLastMove('[still]');
                this.add('-fail', source);
                return this.NOT_FAIL;
            }
        },
    selfdestruct: "ifHit",
    slotCondition: "lunardance",
    condition: {
      duration: 1,
      onSideStart(side) {
                this.debug('Lunar Dance started on ' + side.name);
            },
      onSwitchInPriority: -1,
      onSwitchIn(target) {
                if (target.getSlot() !== this.effectState.sourceSlot) {
                    return;
                }
                if (target.hp > 0) {
                    target.heal(target.maxhp);
                    target.clearStatus();
                    for (const moveSlot of target.moveSlots) {
                        moveSlot.pp = moveSlot.maxpp;
                    }
                    this.add('-heal', target, target.getHealth, '[from] move: Lunar Dance');
                    target.side.removeSlotCondition(target, 'lunardance');
                    target.lastMove = this.lastMove;
                }
                else {
                    target.switchFlag = true;
                }
            },
    },
    target: "self",
    onAfterMove(pokemon) {
            pokemon.switchFlag = true;
        },
  },
  lusterpurge: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 50,
      boosts: {
        spd: -1,
      },
    },
    target: "normal",
  },
  machpunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    target: "normal",
  },
  magicalleaf: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  magiccoat: {
    flags: {
      metronome: 1,
    },
    volatileStatus: "magiccoat",
    condition: {
      duration: 1,
      onStart(target, source, effect) {
                this.add('-singleturn', target, 'move: Magic Coat');
                if (effect?.effectType === 'Move') {
                    this.effectState.pranksterBoosted = effect.pranksterBoosted;
                }
            },
      onTryHitPriority: 2,
      onTryHit(target, source, move) {
                if (target === source || move.hasBounced || !move.flags['reflectable']) {
                    return;
                }
                target.removeVolatile('magiccoat');
                const newMove = this.dex.getActiveMove(move.id);
                newMove.hasBounced = true;
                this.actions.useMove(newMove, target, { target: source });
                return null;
            },
      onAllyTryHitSide: undefined,
    },
    target: "self",
  },
  magmastorm: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "partiallytrapped",
    target: "normal",
  },
  magnetbomb: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    target: "normal",
  },
  magnetrise: {
    flags: {
      gravity: 1,
      metronome: 1,
    },
    volatileStatus: "magnetrise",
    onTry(source, target, move) {
            if (target.volatiles['smackdown'] || target.volatiles['ingrain'])
                return false;
            // Additional Gravity check for Z-move variant
            if (this.field.getPseudoWeather('Gravity')) {
                this.add('cant', source, 'move: Gravity', move);
                return null;
            }
        },
    condition: {
      duration: 5,
      onStart(target) {
                if (target.volatiles['ingrain'] || target.ability === 'levitate')
                    return false;
                this.add('-start', target, 'Magnet Rise');
            },
      onImmunity(type) {
                if (type === 'Ground')
                    return false;
            },
      onResidualOrder: 10,
      onEnd(target) {
                this.add('-end', target, 'Magnet Rise');
            },
      onResidualSubOrder: 16,
    },
    target: "self",
  },
  magnitude: {
    flags: {
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    onModifyMove(move, pokemon) {
            const i = this.random(100);
            if (i < 5) {
                move.magnitude = 4;
                move.basePower = 10;
            }
            else if (i < 15) {
                move.magnitude = 5;
                move.basePower = 30;
            }
            else if (i < 35) {
                move.magnitude = 6;
                move.basePower = 50;
            }
            else if (i < 65) {
                move.magnitude = 7;
                move.basePower = 70;
            }
            else if (i < 85) {
                move.magnitude = 8;
                move.basePower = 90;
            }
            else if (i < 95) {
                move.magnitude = 9;
                move.basePower = 110;
            }
            else {
                move.magnitude = 10;
                move.basePower = 150;
            }
        },
    onUseMoveMessage(pokemon, target, move) {
            this.add('-activate', pokemon, 'move: Magnitude', move.magnitude);
        },
    target: "allAdjacent",
    basePower: 0,
  },
  meanlook: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    onHit(target, source, move) {
            return target.addVolatile('trapped', source, move, 'trapper');
        },
    target: "normal",
  },
  meditate: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      atk: 1,
    },
    target: "self",
  },
  mefirst: {
    flags: {
      protect: 1,
      bypasssub: 1,
      noassist: 1,
      failcopycat: 1,
      failmefirst: 1,
      nosleeptalk: 1,
    },
    onTryHit(target, pokemon) {
            const action = this.queue.willMove(target);
            if (!action)
                return false;
            const move = this.dex.getActiveMove(action.move.id);
            if (action.zmove || move.isZ || move.isMax)
                return false;
            if (target.volatiles['mustrecharge'])
                return false;
            if (move.category === 'Status' || move.flags['failmefirst'])
                return false;
            pokemon.addVolatile('mefirst');
            this.actions.useMove(move, pokemon, { target });
            return null;
        },
    condition: {
      duration: 1,
      onBasePowerPriority: 12,
      onBasePower: undefined,
      onModifyDamagePhase2(damage) {
                return damage * 1.5;
            },
    },
    callsMove: true,
    target: "adjacentFoe",
  },
  megadrain: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    drain: [1, 2],
    target: "normal",
  },
  megahorn: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  megakick: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  megapunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    target: "normal",
  },
  memento: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      atk: -2,
      spa: -2,
    },
    selfdestruct: "ifHit",
    target: "normal",
  },
  metalburst: {
    damageCallback(pokemon) {
            const lastDamagedBy = pokemon.getLastDamagedBy(true);
            if (lastDamagedBy !== undefined) {
                return (lastDamagedBy.damage * 1.5) || 1;
            }
            return 0;
        },
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onTry(source) {
            const lastDamagedBy = source.getLastDamagedBy(true);
            if (!lastDamagedBy?.thisTurn)
                return false;
        },
    onModifyTarget(targetRelayVar, source, target, move) {
            const lastDamagedBy = source.getLastDamagedBy(true);
            if (lastDamagedBy) {
                targetRelayVar.target = this.getAtSlot(lastDamagedBy.slot);
            }
        },
    target: "scripted",
    basePower: 0,
  },
  metalclaw: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      self: {
        boosts: {
          atk: 1,
        },
      },
    },
    target: "normal",
  },
  metalsound: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    boosts: {
      spd: -2,
    },
    target: "normal",
  },
  meteormash: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    secondary: {
      chance: 20,
      self: {
        boosts: {
          atk: 1,
        },
      },
    },
    target: "normal",
  },
  metronome: {
    flags: {
      noassist: 1,
      failcopycat: 1,
      nosleeptalk: 1,
      failmimic: 1,
    },
    onHit(pokemon) {
            const moves = this.dex.moves.all().filter(move => ((!move.isNonstandard || move.isNonstandard === 'Unobtainable') &&
                move.flags['metronome'] &&
                (![2, 4].includes(this.gen) || !pokemon.moves.includes(move.id)) &&
                !(this.field.pseudoWeather['gravity'] && move.flags['gravity']) &&
                !(pokemon.volatiles['healblock'] && move.flags['heal'])));
            let randomMove = '';
            if (moves.length) {
                moves.sort((a, b) => a.num - b.num);
                randomMove = this.sample(moves).id;
            }
            if (!randomMove)
                return false;
            this.actions.useMove(randomMove, pokemon);
        },
    callsMove: true,
    target: "self",
  },
  milkdrink: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    heal: [1, 2],
    target: "self",
  },
  mimic: {
    flags: {
      protect: 1,
      allyanim: 1,
      noassist: 1,
      failcopycat: 1,
      failencore: 1,
      failinstruct: 1,
      failmimic: 1,
    },
    onHit(target, source) {
            if (source.transformed || !target.lastMove || target.volatiles['substitute']) {
                return false;
            }
            if (target.lastMove.flags['failmimic'] || source.moves.includes(target.lastMove.id)) {
                return false;
            }
            const mimicIndex = source.moves.indexOf('mimic');
            if (mimicIndex < 0)
                return false;
            const move = this.dex.moves.get(target.lastMove.id);
            source.moveSlots[mimicIndex] = {
                move: move.name,
                id: move.id,
                pp: Math.min(5, move.pp),
                maxpp: this.calculatePP(move, source.ppUps[mimicIndex] || 0),
                disabled: false,
                used: false,
                virtual: true,
            };
            this.add('-activate', source, 'move: Mimic', move.name);
        },
    target: "normal",
  },
  mindreader: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onTryHit(target, source) {
            if (source.volatiles['lockon'])
                return false;
        },
    onHit(target, source) {
            source.addVolatile('lockon', target);
            this.add('-activate', source, 'move: Mind Reader', `[of] ${target}`);
        },
    target: "normal",
  },
  minimize: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    volatileStatus: "minimize",
    condition: {
      noCopy: true,
      onRestart: () => null,
      onSourceModifyDamage(damage, source, target, move) {
                if (move.flags['minimize']) {
                    return this.chainModify(2);
                }
            },
      onAccuracy: undefined,
    },
    boosts: {
      evasion: 1,
    },
    target: "self",
  },
  miracleeye: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "miracleeye",
    onTryHit(target) {
            if (target.volatiles['foresight'])
                return false;
        },
    condition: {
      noCopy: true,
      onStart(pokemon) {
                this.add('-start', pokemon, 'Miracle Eye');
            },
      onNegateImmunity(pokemon, type) {
                if (pokemon.hasType('Dark') && type === 'Psychic')
                    return false;
            },
      onModifyBoost(boosts) {
                if (boosts.evasion && boosts.evasion > 0) {
                    boosts.evasion = 0;
                }
            },
    },
    target: "normal",
  },
  mirrorcoat: {
    damageCallback(pokemon) {
            if (!pokemon.volatiles['mirrorcoat'])
                return 0;
            return pokemon.volatiles['mirrorcoat'].damage || 1;
        },
    flags: {
      protect: 1,
      failmefirst: 1,
      noassist: 1,
      failcopycat: 1,
    },
    beforeTurnCallback(pokemon) {
            pokemon.addVolatile('mirrorcoat');
        },
    onTry(source) {
            if (!source.volatiles['mirrorcoat'])
                return false;
            if (source.volatiles['mirrorcoat'].slot === null)
                return false;
        },
    condition: {
      duration: 1,
      noCopy: true,
      onStart(target, source, move) {
                this.effectState.slot = null;
                this.effectState.damage = 0;
            },
      onRedirectTargetPriority: -1,
      onRedirectTarget(target, source, source2, move) {
                if (move.id !== 'mirrorcoat')
                    return;
                if (source !== this.effectState.target || !this.effectState.slot)
                    return;
                return this.getAtSlot(this.effectState.slot);
            },
      onDamagingHit(damage, target, source, move) {
                if (!source.isAlly(target) && this.getCategory(move) === 'Special') {
                    this.effectState.slot = source.getSlot();
                    this.effectState.damage = 2 * damage;
                }
            },
    },
    target: "scripted",
    basePower: 0,
  },
  mirrormove: {
    flags: {
      failencore: 1,
      nosleeptalk: 1,
      noassist: 1,
      failcopycat: 1,
      failinstruct: 1,
    },
    callsMove: true,
    target: "self",
    onHit(pokemon) {
            const lastAttackedBy = pokemon.getLastAttackedBy();
            if (!lastAttackedBy?.source.lastMove || !lastAttackedBy.move) {
                return false;
            }
            const noMirror = [
                'acupressure', 'aromatherapy', 'assist', 'chatter', 'copycat', 'counter', 'curse', 'doomdesire', 'feint', 'focuspunch', 'futuresight', 'gravity', 'hail', 'haze', 'healbell', 'helpinghand', 'lightscreen', 'luckychant', 'magiccoat', 'mefirst', 'metronome', 'mimic', 'mirrorcoat', 'mirrormove', 'mist', 'mudsport', 'naturepower', 'perishsong', 'psychup', 'raindance', 'reflect', 'roleplay', 'safeguard', 'sandstorm', 'sketch', 'sleeptalk', 'snatch', 'spikes', 'spitup', 'stealthrock', 'struggle', 'sunnyday', 'tailwind', 'toxicspikes', 'transform', 'watersport',
            ];
            if (noMirror.includes(lastAttackedBy.move) || !lastAttackedBy.source.hasMove(lastAttackedBy.move)) {
                return false;
            }
            this.actions.useMove(lastAttackedBy.move, pokemon);
        },
  },
  mirrorshot: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      boosts: {
        accuracy: -1,
      },
    },
    target: "normal",
  },
  mist: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    sideCondition: "mist",
    condition: {
      duration: 5,
      onTryBoost(boost, target, source, effect) {
                if (effect.effectType === 'Move' && effect.infiltrates && !target.isAlly(source))
                    return;
                if (source && target !== source) {
                    let showMsg = false;
                    let i;
                    for (i in boost) {
                        if (boost[i] < 0) {
                            delete boost[i];
                            showMsg = true;
                        }
                    }
                    if (showMsg && !effect.secondaries) {
                        this.add('-activate', target, 'move: Mist');
                    }
                }
            },
      onSideStart(side) {
                this.add('-sidestart', side, 'Mist');
            },
      onSideResidualOrder: 3,
      onSideResidualSubOrder: undefined,
      onSideEnd(side) {
                this.add('-sideend', side, 'Mist');
            },
    },
    target: "allySide",
  },
  mistball: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    secondary: {
      chance: 50,
      boosts: {
        spa: -1,
      },
    },
    target: "normal",
  },
  moonlight: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    onHit(pokemon) {
            if (this.field.isWeather(['sunnyday', 'desolateland'])) {
                this.heal(pokemon.maxhp * 2 / 3);
            }
            else if (this.field.isWeather(['raindance', 'primordialsea', 'sandstorm', 'hail'])) {
                this.heal(pokemon.baseMaxhp / 4);
            }
            else {
                this.heal(pokemon.baseMaxhp / 2);
            }
        },
    target: "self",
  },
  morningsun: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    onHit(pokemon) {
            if (this.field.isWeather(['sunnyday', 'desolateland'])) {
                this.heal(pokemon.maxhp * 2 / 3);
            }
            else if (this.field.isWeather(['raindance', 'primordialsea', 'sandstorm', 'hail'])) {
                this.heal(pokemon.baseMaxhp / 4);
            }
            else {
                this.heal(pokemon.baseMaxhp / 2);
            }
        },
    target: "self",
  },
  mudbomb: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    secondary: {
      chance: 30,
      boosts: {
        accuracy: -1,
      },
    },
    target: "normal",
  },
  muddywater: {
    flags: {
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      boosts: {
        accuracy: -1,
      },
    },
    target: "allAdjacentFoes",
  },
  mudshot: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 100,
      boosts: {
        spe: -1,
      },
    },
    target: "normal",
  },
  mudslap: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 100,
      boosts: {
        accuracy: -1,
      },
    },
    target: "normal",
  },
  mudsport: {
    flags: {
      nonsky: 1,
      metronome: 1,
    },
    condition: {
      noCopy: false,
      onStart(pokemon) {
                this.add('-start', pokemon, 'Mud Sport');
            },
      onAnyBasePowerPriority: 3,
      onAnyBasePower(basePower, user, target, move) {
                if (move.type === 'Electric') {
                    this.debug('Mud Sport weaken');
                    return this.chainModify(0.5);
                }
            },
    },
    target: "all",
    volatileStatus: "mudsport",
  },
  nastyplot: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      spa: 2,
    },
    target: "self",
  },
  naturalgift: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onModifyType(move, pokemon) {
            if (pokemon.ignoringItem())
                return;
            const item = pokemon.getItem();
            if (!item.naturalGift)
                return;
            move.type = item.naturalGift.type;
        },
    onPrepareHit(target, pokemon, move) {
            if (pokemon.ignoringItem())
                return false;
            const item = pokemon.getItem();
            if (!item.naturalGift)
                return false;
            move.basePower = item.naturalGift.basePower;
            this.debug(`BP: ${move.basePower}`);
            pokemon.setItem('');
            pokemon.lastItem = item.id;
            pokemon.usedItemThisTurn = true;
            this.runEvent('AfterUseItem', pokemon, null, null, item);
        },
    target: "normal",
    basePower: 0,
  },
  naturepower: {
    flags: {
      metronome: 1,
    },
    callsMove: true,
    target: "self",
    onHit(pokemon) {
            this.actions.useMove('triattack', pokemon);
        },
  },
  needlearm: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  nightmare: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "nightmare",
    condition: {
      noCopy: true,
      onStart(pokemon) {
                if (pokemon.status !== 'slp' && !pokemon.hasAbility('comatose')) {
                    return false;
                }
                this.add('-start', pokemon, 'Nightmare');
            },
      onResidualOrder: 10,
      onResidual(pokemon) {
                this.damage(pokemon.baseMaxhp / 4);
            },
      onResidualSubOrder: 7,
    },
    target: "normal",
  },
  nightshade: {
    damage: "level",
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  nightslash: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  octazooka: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    secondary: {
      chance: 50,
      boosts: {
        accuracy: -1,
      },
    },
    target: "normal",
  },
  odorsleuth: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "foresight",
    onTryHit(target) {
            if (target.volatiles['miracleeye'])
                return false;
        },
    target: "normal",
  },
  ominouswind: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      self: {
        boosts: {
          atk: 1,
          def: 1,
          spa: 1,
          spd: 1,
          spe: 1,
        },
      },
    },
    target: "normal",
  },
  outrage: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      failinstruct: 1,
    },
    self: {
      volatileStatus: "lockedmove",
    },
    target: "randomNormal",
  },
  overheat: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      boosts: {
        spa: -2,
      },
    },
    target: "normal",
  },
  painsplit: {
    flags: {
      protect: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    onHit(target, pokemon) {
            const targetHP = target.getUndynamaxedHP();
            const averagehp = Math.floor((targetHP + pokemon.hp) / 2) || 1;
            const targetChange = targetHP - averagehp;
            target.sethp(target.hp - targetChange);
            this.add('-sethp', target, target.getHealth, '[from] move: Pain Split', '[silent]');
            pokemon.sethp(averagehp);
            this.add('-sethp', pokemon, pokemon.getHealth, '[from] move: Pain Split');
        },
    target: "normal",
  },
  payback: {
    basePowerCallback(pokemon, target) {
            if (this.queue.willMove(target)) {
                return 50;
            }
            this.debug('BP doubled');
            return 100;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  payday: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    onHit() {
            this.add('-fieldactivate', 'move: Pay Day');
        },
  },
  peck: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
    },
    target: "any",
  },
  perishsong: {
    flags: {
      sound: 1,
      distance: 1,
      metronome: 1,
    },
    onHitField(target, source, move) {
            let result = false;
            let message = false;
            for (const pokemon of this.getAllActive()) {
                if (this.runEvent('Invulnerability', pokemon, source, move) === false) {
                    this.add('-miss', source, pokemon);
                    result = true;
                }
                else if (this.runEvent('TryHit', pokemon, source, move) === null) {
                    result = true;
                }
                else if (!pokemon.volatiles['perishsong']) {
                    pokemon.addVolatile('perishsong');
                    this.add('-start', pokemon, 'perish3', '[silent]');
                    result = true;
                    message = true;
                }
            }
            if (!result)
                return false;
            if (message)
                this.add('-fieldactivate', 'move: Perish Song');
        },
    condition: {
      duration: 4,
      onEnd(target) {
                this.add('-start', target, 'perish0');
                target.faint();
            },
      onResidualOrder: 12,
      onResidual(pokemon) {
                const duration = pokemon.volatiles['perishsong'].duration;
                this.add('-start', pokemon, `perish${duration}`);
            },
    },
    target: "all",
  },
  petaldance: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      dance: 1,
      metronome: 1,
      failinstruct: 1,
    },
    self: {
      volatileStatus: "lockedmove",
    },
    target: "randomNormal",
  },
  pinmissile: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  pluck: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
    },
    onHit(target, source, move) {
            const item = target.getItem();
            if (source.hp && item.isBerry && target.takeItem(source)) {
                this.add('-enditem', target, item.name, '[from] stealeat', '[move] Pluck', `[of] ${source}`);
                if (this.singleEvent('Eat', item, target.itemState, source, source, move)) {
                    this.runEvent('EatItem', source, source, move, item);
                    if (item.id === 'leppaberry')
                        target.staleness = 'external';
                }
                if (item.onEat)
                    source.ateBerry = true;
            }
        },
    target: "any",
  },
  poisonfang: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bite: 1,
    },
    secondary: {
      chance: 30,
      status: "tox",
    },
    target: "normal",
  },
  poisongas: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    status: "psn",
    target: "normal",
  },
  poisonjab: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "psn",
    },
    target: "normal",
  },
  poisonpowder: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
      powder: 1,
    },
    status: "psn",
    target: "normal",
  },
  poisonsting: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "psn",
    },
    target: "normal",
  },
  poisontail: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    secondary: {
      chance: 10,
      status: "psn",
    },
    target: "normal",
  },
  pound: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  powdersnow: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "frz",
    },
    target: "allAdjacentFoes",
  },
  powergem: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  powerswap: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      allyanim: 1,
      metronome: 1,
    },
    onHit(target, source) {
            const targetBoosts = {};
            const sourceBoosts = {};
            const atkSpa = ['atk', 'spa'];
            for (const stat of atkSpa) {
                targetBoosts[stat] = target.boosts[stat];
                sourceBoosts[stat] = source.boosts[stat];
            }
            source.setBoost(targetBoosts);
            target.setBoost(sourceBoosts);
            this.add('-swapboost', source, target, 'atk, spa', '[from] move: Power Swap');
        },
    target: "normal",
  },
  powertrick: {
    flags: {
      metronome: 1,
    },
    volatileStatus: "powertrick",
    condition: {
      onStart(pokemon) {
                this.add('-start', pokemon, 'Power Trick');
                const newatk = pokemon.storedStats.def;
                const newdef = pokemon.storedStats.atk;
                pokemon.storedStats.atk = newatk;
                pokemon.storedStats.def = newdef;
            },
      onCopy(pokemon) {
                const newatk = pokemon.storedStats.def;
                const newdef = pokemon.storedStats.atk;
                pokemon.storedStats.atk = newatk;
                pokemon.storedStats.def = newdef;
            },
      onEnd(pokemon) {
                this.add('-end', pokemon, 'Power Trick');
                const newatk = pokemon.storedStats.def;
                const newdef = pokemon.storedStats.atk;
                pokemon.storedStats.atk = newatk;
                pokemon.storedStats.def = newdef;
            },
      onRestart(pokemon) {
                pokemon.removeVolatile('Power Trick');
            },
    },
    target: "self",
  },
  powerwhip: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  present: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onModifyMove(move, pokemon, target) {
            const rand = this.random(10);
            if (rand < 2) {
                move.heal = [1, 4];
                move.infiltrates = true;
            }
            else if (rand < 6) {
                move.basePower = 40;
            }
            else if (rand < 9) {
                move.basePower = 80;
            }
            else {
                move.basePower = 120;
            }
        },
    target: "normal",
    basePower: 0,
  },
  protect: {
    flags: {
      noassist: 1,
      failcopycat: 1,
    },
    stallingMove: true,
    volatileStatus: "protect",
    onPrepareHit(pokemon) {
            return !!this.queue.willAct() && this.runEvent('StallMove', pokemon);
        },
    onHit(pokemon) {
            pokemon.addVolatile('stall');
        },
    condition: {
      duration: 1,
      onStart(target) {
                this.add('-singleturn', target, 'Protect');
            },
      onTryHitPriority: 3,
      onTryHit(target, source, move) {
                if (this.checkMoveBypassesProtect(move, source, target))
                    return;
                this.add('-activate', target, 'Protect');
                const lockedmove = source.getVolatile('lockedmove');
                if (lockedmove) {
                    // Outrage counter is NOT reset
                    if (source.volatiles['lockedmove'].trueDuration >= 2) {
                        source.volatiles['lockedmove'].duration = 2;
                    }
                }
                return null;
            },
    },
    target: "self",
  },
  psybeam: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      volatileStatus: "confusion",
    },
    target: "normal",
  },
  psychic: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      boosts: {
        spd: -1,
      },
    },
    target: "normal",
  },
  psychoboost: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      boosts: {
        spa: -2,
      },
    },
    target: "normal",
  },
  psychocut: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  psychoshift: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onTryHit(target, source, move) {
            if (!source.status)
                return false;
            move.status = source.status;
        },
    self: {
      onHit(pokemon) {
                pokemon.cureStatus();
            },
    },
    target: "normal",
  },
  psychup: {
    flags: {
      snatch: 1,
      bypasssub: 1,
      metronome: 1,
    },
    onHit(target, source) {
            let i;
            for (i in target.boosts) {
                source.boosts[i] = target.boosts[i];
            }
            this.add('-copyboost', source, target, '[from] move: Psych Up');
        },
    target: "normal",
  },
  psywave: {
    damageCallback(pokemon) {
            return (this.random(50, 151) * pokemon.level) / 100;
        },
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  punishment: {
    basePowerCallback(pokemon, target) {
            let power = 60 + 20 * target.positiveBoosts();
            if (power > 200)
                power = 200;
            this.debug(`BP: ${power}`);
            return power;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  pursuit: {
    basePowerCallback(pokemon, target, move) {
            // You can't get here unless the pursuit succeeds
            if (target.beingCalledBack || target.switchFlag) {
                this.debug('Pursuit damage boost');
                return move.basePower * 2;
            }
            return move.basePower;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    beforeTurnCallback(pokemon) {
            if (['frz', 'slp'].includes(pokemon.status) ||
                (pokemon.hasAbility('truant') && pokemon.volatiles['truant']))
                return;
            for (const target of pokemon.foes()) {
                target.addVolatile('pursuit');
                const data = target.volatiles['pursuit'];
                if (!data.sources) {
                    data.sources = [];
                }
                data.sources.push(pokemon);
            }
        },
    onModifyMove(move, source, target) {
            if (target?.beingCalledBack || target?.switchFlag)
                move.accuracy = true;
        },
    condition: {
      duration: 1,
      onBeforeSwitchOut(pokemon) {
                this.debug('Pursuit start');
                let alreadyAdded = false;
                for (const source of this.effectState.sources) {
                    if (!this.queue.cancelMove(source) || !source.hp)
                        continue;
                    if (!alreadyAdded) {
                        this.add('-activate', pokemon, 'move: Pursuit');
                        alreadyAdded = true;
                    }
                    // Run through each action in queue to check if the Pursuit user is supposed to Mega Evolve this turn.
                    // If it is, then Mega Evolve before moving.
                    if (source.canMegaEvo || source.canUltraBurst) {
                        for (const [actionIndex, action] of this.queue.entries()) {
                            if (action.pokemon === source && action.choice === 'megaEvo') {
                                this.actions.runMegaEvo(source);
                                this.queue.list.splice(actionIndex, 1);
                                break;
                            }
                        }
                    }
                    const move = this.dex.getActiveMove('pursuit');
                    source.deductPP(move.id);
                    source.moveUsed(move, pokemon.position);
                    if (this.actions.useMove(move, source, { target: pokemon }) && source.getItem().isChoice) {
                        source.addVolatile('choicelock');
                    }
                }
            },
    },
    target: "normal",
  },
  quickattack: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  rage: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      volatileStatus: "rage",
    },
    condition: {
      onStart(pokemon) {
                this.add('-singlemove', pokemon, 'Rage');
            },
      onHit(target, source, move) {
                if (target !== source && move.category !== 'Status') {
                    this.boost({ atk: 1 });
                }
            },
      onBeforeMovePriority: 100,
      onBeforeMove(pokemon) {
                this.debug('removing Rage before attack');
                pokemon.removeVolatile('rage');
            },
    },
    target: "normal",
  },
  raindance: {
    flags: {
      metronome: 1,
    },
    weather: "RainDance",
    target: "all",
  },
  rapidspin: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onAfterHit(target, pokemon, move) {
            if (!move.hasSheerForce) {
                if (pokemon.removeVolatile('leechseed')) {
                    this.add('-end', pokemon, 'Leech Seed', '[from] move: Rapid Spin', `[of] ${pokemon}`);
                }
                const sideConditions = ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'gmaxsteelsurge'];
                for (const condition of sideConditions) {
                    if (pokemon.side.removeSideCondition(condition)) {
                        this.add('-sideend', pokemon.side, this.dex.conditions.get(condition).name, '[from] move: Rapid Spin', `[of] ${pokemon}`);
                    }
                }
                if (pokemon.volatiles['partiallytrapped']) {
                    pokemon.removeVolatile('partiallytrapped');
                }
            }
        },
    onAfterSubDamage(damage, target, pokemon, move) {
            if (!move.hasSheerForce) {
                if (pokemon.hp && pokemon.removeVolatile('leechseed')) {
                    this.add('-end', pokemon, 'Leech Seed', '[from] move: Rapid Spin', `[of] ${pokemon}`);
                }
                const sideConditions = ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'gmaxsteelsurge'];
                for (const condition of sideConditions) {
                    if (pokemon.hp && pokemon.side.removeSideCondition(condition)) {
                        this.add('-sideend', pokemon.side, this.dex.conditions.get(condition).name, '[from] move: Rapid Spin', `[of] ${pokemon}`);
                    }
                }
                if (pokemon.hp && pokemon.volatiles['partiallytrapped']) {
                    pokemon.removeVolatile('partiallytrapped');
                }
            }
        },
    target: "normal",
    self: {
      onHit(pokemon) {
                if (pokemon.removeVolatile('leechseed')) {
                    this.add('-end', pokemon, 'Leech Seed', '[from] move: Rapid Spin', `[of] ${pokemon}`);
                }
                const sideConditions = ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb'];
                for (const condition of sideConditions) {
                    if (pokemon.side.removeSideCondition(condition)) {
                        this.add('-sideend', pokemon.side, this.dex.conditions.get(condition).name, '[from] move: Rapid Spin', `[of] ${pokemon}`);
                    }
                }
                if (pokemon.volatiles['partiallytrapped']) {
                    pokemon.removeVolatile('partiallytrapped');
                }
            },
    },
  },
  razorleaf: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    critRatio: 2,
    target: "allAdjacentFoes",
  },
  razorwind: {
    flags: {
      charge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      nosleeptalk: 1,
      failinstruct: 1,
    },
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            this.add('-prepare', attacker, move.name);
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    critRatio: 2,
    target: "allAdjacentFoes",
  },
  recover: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    heal: [1, 2],
    target: "self",
  },
  recycle: {
    flags: {
      metronome: 1,
    },
    onHit(pokemon, source, move) {
            if (pokemon.item || !pokemon.lastItem)
                return false;
            const item = pokemon.lastItem;
            pokemon.lastItem = '';
            this.add('-item', pokemon, this.dex.items.get(item), '[from] move: Recycle');
            pokemon.setItem(item, source, move);
        },
    target: "self",
  },
  reflect: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    sideCondition: "reflect",
    condition: {
      duration: 5,
      durationCallback(target, source, effect) {
                if (source?.hasItem('lightclay')) {
                    return 8;
                }
                return 5;
            },
      onAnyModifyDamage: undefined,
      onSideStart(side) {
                this.add('-sidestart', side, 'Reflect');
            },
      onSideResidualOrder: 1,
      onSideResidualSubOrder: undefined,
      onSideEnd(side) {
                this.add('-sideend', side, 'Reflect');
            },
      onAnyModifyDamagePhase1(damage, source, target, move) {
                if (target !== source && this.effectState.target.hasAlly(target) && this.getCategory(move) === 'Physical') {
                    if (!target.getMoveHitData(move).crit && !move.infiltrates) {
                        this.debug('Reflect weaken');
                        if (target.alliesAndSelf().length > 1)
                            return this.chainModify(2, 3);
                        return this.chainModify(0.5);
                    }
                }
            },
    },
    target: "allySide",
  },
  refresh: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    onHit(pokemon) {
            if (['', 'slp', 'frz'].includes(pokemon.status))
                return false;
            pokemon.cureStatus();
        },
    target: "self",
  },
  rest: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    onTry(source) {
            if (source.status === 'slp' || source.hasAbility('comatose'))
                return false;
            if (source.hp === source.maxhp) {
                this.add('-fail', source, 'heal');
                return null;
            }
            // insomnia and vital spirit checks are separate so that the message is accurate in multi-ability mods
            if (source.hasAbility('insomnia')) {
                this.add('-fail', source, '[from] ability: Insomnia', `[of] ${source}`);
                return null;
            }
            if (source.hasAbility('vitalspirit')) {
                this.add('-fail', source, '[from] ability: Vital Spirit', `[of] ${source}`);
                return null;
            }
        },
    onHit(target, source, move) {
            const result = target.setStatus('slp', source, move);
            if (!result)
                return result;
            target.statusState.time = 3;
            target.statusState.startTime = 3;
            this.heal(target.maxhp); // Aesthetic only as the healing happens after you fall asleep in-game
        },
    target: "self",
  },
  return: {
    basePowerCallback(pokemon) {
            return Math.floor((pokemon.happiness * 10) / 25) || 1;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  revenge: {
    basePowerCallback(pokemon, target, move) {
            const damagedByTarget = pokemon.attackedBy.some(p => p.source === target && p.damage > 0 && p.thisTurn);
            if (damagedByTarget) {
                this.debug(`BP doubled for getting hit by ${target}`);
                return move.basePower * 2;
            }
            return move.basePower;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  reversal: {
    basePowerCallback(pokemon) {
            const ratio = Math.max(Math.floor(pokemon.hp * 64 / pokemon.maxhp), 1);
            let bp;
            if (ratio < 2) {
                bp = 200;
            }
            else if (ratio < 6) {
                bp = 150;
            }
            else if (ratio < 13) {
                bp = 100;
            }
            else if (ratio < 22) {
                bp = 80;
            }
            else if (ratio < 43) {
                bp = 40;
            }
            else {
                bp = 20;
            }
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  roar: {
    flags: {
      protect: 1,
      mirror: 1,
      sound: 1,
      bypasssub: 1,
      metronome: 1,
    },
    forceSwitch: true,
    target: "normal",
  },
  roaroftime: {
    flags: {
      recharge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      volatileStatus: "mustrecharge",
    },
    target: "normal",
  },
  rockblast: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  rockclimb: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 20,
      volatileStatus: "confusion",
    },
    target: "normal",
  },
  rockpolish: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      spe: 2,
    },
    target: "self",
  },
  rockslide: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "allAdjacentFoes",
  },
  rocksmash: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 50,
      boosts: {
        def: -1,
      },
    },
    target: "normal",
  },
  rockthrow: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  rocktomb: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 100,
      boosts: {
        spe: -1,
      },
    },
    target: "normal",
  },
  rockwrecker: {
    flags: {
      recharge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    self: {
      volatileStatus: "mustrecharge",
    },
    target: "normal",
  },
  roleplay: {
    flags: {
      bypasssub: 1,
      allyanim: 1,
      metronome: 1,
    },
    onTryHit(target, source) {
            if (target.ability === source.ability)
                return false;
            if (target.getAbility().flags['failroleplay'] || source.getAbility().flags['cantsuppress'])
                return false;
        },
    onHit(target, source) {
            const oldAbility = source.setAbility(target.ability, target);
            if (!oldAbility)
                return oldAbility;
        },
    target: "normal",
  },
  rollingkick: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  rollout: {
    basePowerCallback(pokemon, target, move) {
            let bp = move.basePower;
            const rolloutData = pokemon.volatiles['rollout'];
            if (rolloutData?.hitCount) {
                bp *= 2 ** rolloutData.contactHitCount;
            }
            if (rolloutData && pokemon.status !== 'slp') {
                rolloutData.hitCount++;
                rolloutData.contactHitCount++;
                if (rolloutData.hitCount < 5) {
                    rolloutData.duration = 2;
                }
            }
            if (pokemon.volatiles['defensecurl']) {
                bp *= 2;
            }
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      failinstruct: 1,
      noparentalbond: 1,
    },
    onModifyMove(move, pokemon, target) {
            if (pokemon.volatiles['rollout'] || pokemon.status === 'slp' || !target)
                return;
            pokemon.addVolatile('rollout');
            if (move.sourceEffect)
                pokemon.lastMoveTargetLoc = pokemon.getLocOf(target);
        },
    onAfterMove(source, target, move) {
            const rolloutData = source.volatiles["rollout"];
            if (rolloutData &&
                rolloutData.hitCount === 5 &&
                rolloutData.contactHitCount < 5
            // this conditions can only be met in gen7 and gen8dlc1
            // see `disguise` and `iceface` abilities in the resp mod folders
            ) {
                source.addVolatile("rolloutstorage");
                source.volatiles["rolloutstorage"].contactHitCount =
                    rolloutData.contactHitCount;
            }
        },
    condition: {
      duration: 1,
      onLockMove: "rollout",
      onStart() {
                this.effectState.hitCount = 0;
                this.effectState.contactHitCount = 0;
            },
      onResidual(target) {
                if (target.lastMove && target.lastMove.id === 'struggle') {
                    // don't lock
                    delete target.volatiles['rollout'];
                }
            },
    },
    target: "normal",
  },
  roost: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    heal: [1, 2],
    self: {
      volatileStatus: "roost",
    },
    condition: {
      duration: 1,
      onResidualOrder: 25,
      onStart(target) {
                if (target.terastallized) {
                    if (target.hasType('Flying')) {
                        this.add('-hint', "If a Terastallized Pokemon uses Roost, it remains Flying-type.");
                    }
                    return false;
                }
                this.add('-singleturn', target, 'move: Roost');
            },
      onTypePriority: -1,
      onType(types, pokemon) {
                this.effectState.typeWas = types;
                return types.filter(type => type !== 'Flying');
            },
    },
    target: "self",
  },
  sacredfire: {
    flags: {
      protect: 1,
      mirror: 1,
      defrost: 1,
      metronome: 1,
    },
    secondary: {
      chance: 50,
      status: "brn",
    },
    target: "normal",
  },
  safeguard: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    sideCondition: "safeguard",
    condition: {
      duration: 5,
      durationCallback(target, source, effect) {
                if (source?.hasAbility('persistent')) {
                    this.add('-activate', source, 'ability: Persistent', '[move] Safeguard');
                    return 7;
                }
                return 5;
            },
      onSetStatus(status, target, source, effect) {
                if (!effect || !source)
                    return;
                if (effect.id === 'yawn')
                    return;
                if (effect.effectType === 'Move' && effect.infiltrates && !target.isAlly(source))
                    return;
                if (target !== source) {
                    this.debug('interrupting setStatus');
                    if (effect.id === 'synchronize' || (effect.effectType === 'Move' && !effect.secondaries)) {
                        this.add('-activate', target, 'move: Safeguard');
                    }
                    return null;
                }
            },
      onTryAddVolatile(status, target, source, effect) {
                if (!effect || !source)
                    return;
                if (effect.effectType === 'Move' && effect.infiltrates && !target.isAlly(source))
                    return;
                if ((status.id === 'confusion' || status.id === 'yawn') && target !== source) {
                    if (effect.effectType === 'Move' && !effect.secondaries)
                        this.add('-activate', target, 'move: Safeguard');
                    return null;
                }
            },
      onSideStart(side, source) {
                if (source?.hasAbility('persistent')) {
                    this.add('-sidestart', side, 'Safeguard', '[persistent]');
                }
                else {
                    this.add('-sidestart', side, 'Safeguard');
                }
            },
      onSideResidualOrder: 4,
      onSideResidualSubOrder: undefined,
      onSideEnd(side) {
                this.add('-sideend', side, 'Safeguard');
            },
    },
    target: "allySide",
  },
  sandattack: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      accuracy: -1,
    },
    target: "normal",
  },
  sandstorm: {
    flags: {
      metronome: 1,
      wind: 1,
    },
    weather: "Sandstorm",
    target: "all",
  },
  sandtomb: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "partiallytrapped",
    target: "normal",
  },
  scaryface: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    boosts: {
      spe: -2,
    },
    target: "normal",
  },
  scratch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  screech: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    boosts: {
      def: -2,
    },
    target: "normal",
  },
  secretpower: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onModifyMove(move, pokemon) {
            if (this.field.isTerrain(''))
                return;
            move.secondaries = [];
            if (this.field.isTerrain('electricterrain')) {
                move.secondaries.push({
                    chance: 30,
                    status: 'par',
                });
            }
            else if (this.field.isTerrain('grassyterrain')) {
                move.secondaries.push({
                    chance: 30,
                    status: 'slp',
                });
            }
            else if (this.field.isTerrain('mistyterrain')) {
                move.secondaries.push({
                    chance: 30,
                    boosts: {
                        spa: -1,
                    },
                });
            }
            else if (this.field.isTerrain('psychicterrain')) {
                move.secondaries.push({
                    chance: 30,
                    boosts: {
                        spe: -1,
                    },
                });
            }
        },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "normal",
  },
  seedbomb: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    target: "normal",
  },
  seedflare: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 40,
      boosts: {
        spd: -2,
      },
    },
    target: "normal",
  },
  seismictoss: {
    damage: "level",
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  selfdestruct: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      noparentalbond: 1,
    },
    selfdestruct: "always",
    target: "allAdjacent",
  },
  shadowball: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    secondary: {
      chance: 20,
      boosts: {
        spd: -1,
      },
    },
    target: "normal",
  },
  shadowclaw: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  shadowforce: {
    flags: {
      contact: 1,
      charge: 1,
      mirror: 1,
      metronome: 1,
      nosleeptalk: 1,
    },
    breaksProtect: true,
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            this.add('-prepare', attacker, move.name);
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    condition: {
      duration: 2,
      onInvulnerability: false,
    },
    target: "normal",
  },
  shadowpunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    target: "normal",
  },
  shadowsneak: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  sharpen: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      atk: 1,
    },
    target: "self",
  },
  sheercold: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    ohko: true,
    target: "normal",
    basePower: 0,
  },
  shockwave: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  signalbeam: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      volatileStatus: "confusion",
    },
    target: "normal",
  },
  silverwind: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      self: {
        boosts: {
          atk: 1,
          def: 1,
          spa: 1,
          spd: 1,
          spe: 1,
        },
      },
    },
    target: "normal",
  },
  sing: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    status: "slp",
    target: "normal",
  },
  sketch: {
    noPPBoosts: true,
    flags: {
      bypasssub: 1,
      allyanim: 1,
      failencore: 1,
      noassist: 1,
      failcopycat: 1,
      failinstruct: 1,
      failmimic: 1,
      nosketch: 1,
    },
    onHit(target, source) {
            if (source.transformed || !target.lastMove || target.volatiles['substitute']) {
                return false;
            }
            if (target.lastMove.flags['nosketch'] || source.moves.includes(target.lastMove.id)) {
                return false;
            }
            const sketchIndex = source.moves.indexOf('sketch');
            if (sketchIndex < 0)
                return false;
            const move = this.dex.moves.get(target.lastMove.id);
            const sketchedMove = {
                move: move.name,
                id: move.id,
                pp: move.pp,
                maxpp: this.calculatePP(move, source.ppUps[sketchIndex] || 0),
                disabled: false,
                used: false,
            };
            source.moveSlots[sketchIndex] = sketchedMove;
            source.baseMoveSlots[sketchIndex] = sketchedMove;
            this.add('-activate', source, 'move: Mimic', move.name);
        },
    target: "normal",
  },
  skillswap: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      allyanim: 1,
      metronome: 1,
    },
    onHit(target, source, move) {
            return this.skillSwap(source, target);
        },
    target: "normal",
  },
  skullbash: {
    flags: {
      contact: 1,
      charge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      nosleeptalk: 1,
      failinstruct: 1,
    },
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            this.add('-prepare', attacker, move.name);
            this.boost({ def: 1 }, attacker, attacker, move);
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    target: "normal",
  },
  skyattack: {
    flags: {
      charge: 1,
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      nosleeptalk: 1,
      failinstruct: 1,
    },
    critRatio: 2,
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            this.add('-prepare', attacker, move.name);
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "any",
  },
  skyuppercut: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    target: "normal",
  },
  slackoff: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    heal: [1, 2],
    target: "self",
  },
  slam: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    target: "normal",
  },
  slash: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  sleeppowder: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
      powder: 1,
    },
    status: "slp",
    target: "normal",
  },
  sleeptalk: {
    flags: {
      nosleeptalk: 1,
      noassist: 1,
      failcopycat: 1,
    },
    sleepUsable: true,
    onTry(source) {
            return source.status === 'slp' || source.hasAbility('comatose');
        },
    onHit(pokemon) {
            const moves = [];
            for (const moveSlot of pokemon.moveSlots) {
                const moveid = moveSlot.id;
                if (!moveid)
                    continue;
                const move = this.dex.moves.get(moveid);
                if (move.flags['nosleeptalk'] || move.flags['charge'] || (move.isZ && move.basePower !== 1) || move.isMax) {
                    continue;
                }
                moves.push(moveid);
            }
            let randomMove = '';
            if (moves.length)
                randomMove = this.sample(moves);
            if (!randomMove) {
                return false;
            }
            this.actions.useMove(randomMove, pokemon);
        },
    callsMove: true,
    target: "self",
    onTryHit(pokemon) {
            return !pokemon.volatiles['choicelock'] && !pokemon.volatiles['encore'];
        },
  },
  sludge: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "psn",
    },
    target: "normal",
  },
  sludgebomb: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    secondary: {
      chance: 30,
      status: "psn",
    },
    target: "normal",
  },
  smellingsalts: {
    basePowerCallback(pokemon, target, move) {
            if (target.status === 'par') {
                this.debug('BP doubled on paralyzed target');
                return move.basePower * 2;
            }
            return move.basePower;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onHit(target) {
            if (target.status === 'par')
                target.cureStatus();
        },
    target: "normal",
  },
  smog: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 40,
      status: "psn",
    },
    target: "normal",
  },
  smokescreen: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      accuracy: -1,
    },
    target: "normal",
  },
  snatch: {
    flags: {
      bypasssub: 1,
      noassist: 1,
      failcopycat: 1,
    },
    volatileStatus: "snatch",
    condition: {
      duration: 1,
      onStart(pokemon) {
                this.add('-singleturn', pokemon, 'Snatch');
            },
      onAnyPrepareHitPriority: -1,
      onAnyPrepareHit(source, target, move) {
                const snatchUser = this.effectState.source;
                if (snatchUser.isSkyDropped())
                    return;
                if (!move || move.isZ || move.isMax || !move.flags['snatch']) {
                    return;
                }
                snatchUser.removeVolatile('snatch');
                this.add('-activate', snatchUser, 'move: Snatch', `[of] ${source}`);
                // check Pressure
                const ppDrop = this.runEvent('DeductPP', source, snatchUser, this.effectState.sourceEffect);
                const extraPP = ppDrop !== true ? ppDrop : 0;
                if (extraPP > 0) {
                    snatchUser.deductPP(this.effectState.sourceEffect.id, extraPP);
                }
                this.actions.useMove(move.id, snatchUser);
                return null;
            },
    },
    target: "self",
  },
  snore: {
    flags: {
      protect: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    sleepUsable: true,
    onTry(source) {
            return source.status === 'slp' || source.hasAbility('comatose');
        },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  softboiled: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    heal: [1, 2],
    target: "self",
  },
  solarbeam: {
    flags: {
      charge: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      nosleeptalk: 1,
      failinstruct: 1,
    },
    onTryMove(attacker, defender, move) {
            if (attacker.removeVolatile(move.id)) {
                return;
            }
            this.add('-prepare', attacker, move.name);
            if (['sunnyday', 'desolateland'].includes(attacker.effectiveWeather(undefined, true))) {
                this.attrLastMove('[still]');
                this.addMove('-anim', attacker, move.name, defender);
                return;
            }
            if (!this.runEvent('ChargeMove', attacker, defender, move)) {
                return;
            }
            attacker.addVolatile('twoturnmove', defender);
            return null;
        },
    onBasePower(basePower, pokemon, target) {
            const weakWeathers = ['raindance', 'primordialsea', 'sandstorm', 'hail', 'snowscape'];
            if (weakWeathers.includes(pokemon.effectiveWeather())) {
                this.debug('weakened by weather');
                return this.chainModify(0.5);
            }
        },
    target: "normal",
  },
  sonicboom: {
    damage: 20,
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  spacialrend: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  spark: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "normal",
  },
  spiderweb: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    onHit(target, source, move) {
            return target.addVolatile('trapped', source, move, 'trapper');
        },
    target: "normal",
  },
  spikecannon: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: [2, 5],
    target: "normal",
  },
  spikes: {
    flags: {
      metronome: 1,
      mustpressure: 1,
    },
    sideCondition: "spikes",
    condition: {
      onSideStart(side) {
                this.add('-sidestart', side, 'Spikes');
                this.effectState.layers = 1;
            },
      onSideRestart(side) {
                if (this.effectState.layers >= 3)
                    return false;
                this.add('-sidestart', side, 'Spikes');
                this.effectState.layers++;
            },
      onSwitchIn: undefined,
      onEntryHazard(pokemon) {
                if (!pokemon.isGrounded() || pokemon.hasItem('heavydutyboots'))
                    return;
                const damageAmounts = [0, 3, 4, 6]; // 1/8, 1/6, 1/4
                this.damage(damageAmounts[this.effectState.layers] * pokemon.maxhp / 24);
            },
    },
    target: "foeSide",
  },
  spite: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    onHit(target) {
            let move = target.lastMove;
            if (!move || move.isZ)
                return false;
            if (move.isMax && move.baseMove)
                move = this.dex.moves.get(move.baseMove);
            const ppDeducted = target.deductPP(move.id, 4);
            if (!ppDeducted)
                return false;
            this.add("-activate", target, 'move: Spite', move.name, ppDeducted);
        },
    target: "normal",
  },
  spitup: {
    basePowerCallback(pokemon) {
            if (!pokemon.volatiles['stockpile']?.layers)
                return false;
            return pokemon.volatiles['stockpile'].layers * 100;
        },
    flags: {
      protect: 1,
      metronome: 1,
    },
    onTry(source) {
            return !!source.volatiles['stockpile'];
        },
    onAfterMove(pokemon) {
            pokemon.removeVolatile('stockpile');
        },
    target: "normal",
    basePower: 0,
  },
  splash: {
    flags: {
      gravity: 1,
      metronome: 1,
    },
    onTry(source, target, move) {
            // Additional Gravity check for Z-move variant
            if (this.field.getPseudoWeather('Gravity')) {
                this.add('cant', source, 'move: Gravity', move);
                return null;
            }
        },
    onTryHit(target, source) {
            this.add('-nothing');
        },
    target: "self",
  },
  spore: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
      powder: 1,
    },
    status: "slp",
    target: "normal",
  },
  stealthrock: {
    flags: {
      metronome: 1,
      mustpressure: 1,
    },
    sideCondition: "stealthrock",
    condition: {
      onSideStart(side) {
                this.add('-sidestart', side, 'move: Stealth Rock');
            },
      onSwitchIn: undefined,
      onEntryHazard(pokemon) {
                if (pokemon.hasItem('heavydutyboots'))
                    return;
                const typeMod = this.clampIntRange(pokemon.runEffectiveness(this.dex.getActiveMove('stealthrock')), -6, 6);
                this.damage(pokemon.maxhp * 2 ** typeMod / 8);
            },
    },
    target: "foeSide",
  },
  steelwing: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      self: {
        boosts: {
          def: 1,
        },
      },
    },
    target: "normal",
  },
  stockpile: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    onTry(source) {
            if (source.volatiles['stockpile'] && source.volatiles['stockpile'].layers >= 3)
                return false;
        },
    volatileStatus: "stockpile",
    condition: {
      noCopy: true,
      onStart(target) {
                this.effectState.layers = 1;
                this.add('-start', target, 'stockpile' + this.effectState.layers);
                this.boost({ def: 1, spd: 1 }, target, target);
            },
      onRestart(target) {
                if (this.effectState.layers >= 3)
                    return false;
                this.effectState.layers++;
                this.add('-start', target, 'stockpile' + this.effectState.layers);
                this.boost({ def: 1, spd: 1 }, target, target);
            },
      onEnd(target) {
                const layers = this.effectState.layers * -1;
                this.effectState.layers = 0;
                this.boost({ def: layers, spd: layers }, target, target);
                this.add('-end', target, 'Stockpile');
            },
    },
    target: "self",
  },
  stomp: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
      minimize: 1,
    },
    secondary: {
      chance: 30,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  stoneedge: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    critRatio: 2,
    target: "normal",
  },
  strength: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  stringshot: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      spe: -1,
    },
    target: "allAdjacentFoes",
  },
  struggle: {
    noPPBoosts: true,
    flags: {
      contact: 1,
      protect: 1,
      failencore: 1,
      failmefirst: 1,
      noassist: 1,
      failcopycat: 1,
      failinstruct: 1,
      failmimic: 1,
      nosketch: 1,
    },
    onModifyMove(move) {
            move.type = '???';
        },
    struggleRecoil: true,
    target: "randomNormal",
  },
  stunspore: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
      powder: 1,
    },
    status: "par",
    target: "normal",
  },
  submission: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    recoil: [1, 4],
    target: "normal",
  },
  substitute: {
    flags: {
      snatch: 1,
      nonsky: 1,
      metronome: 1,
    },
    volatileStatus: "substitute",
    onTryHit(source) {
            if (source.volatiles['substitute']) {
                this.add('-fail', source, 'move: Substitute');
                return this.NOT_FAIL;
            }
            if (source.hp <= source.maxhp / 4 || source.maxhp === 1) { // Shedinja clause
                this.add('-fail', source, 'move: Substitute', '[weak]');
                return this.NOT_FAIL;
            }
        },
    onHit(target) {
            this.directDamage(target.maxhp / 4);
        },
    condition: {
      onStart(target, source, effect) {
                if (effect?.id === 'shedtail') {
                    this.add('-start', target, 'Substitute', '[from] move: Shed Tail');
                }
                else {
                    this.add('-start', target, 'Substitute');
                }
                this.effectState.hp = Math.floor(target.maxhp / 4);
                if (target.volatiles['partiallytrapped']) {
                    this.add('-end', target, target.volatiles['partiallytrapped'].sourceEffect, '[partiallytrapped]', '[silent]');
                    delete target.volatiles['partiallytrapped'];
                }
            },
      onTryPrimaryHitPriority: -1,
      onTryPrimaryHit(target, source, move) {
                if (target === source || move.flags['bypasssub']) {
                    return;
                }
                let damage = this.actions.getDamage(source, target, move);
                if (!damage && damage !== 0) {
                    this.add('-fail', source);
                    this.attrLastMove('[still]');
                    return null;
                }
                if (damage > target.volatiles['substitute'].hp) {
                    damage = target.volatiles['substitute'].hp;
                }
                target.volatiles['substitute'].hp -= damage;
                source.lastDamage = damage;
                if (target.volatiles['substitute'].hp <= 0) {
                    target.removeVolatile('substitute');
                    target.addVolatile('substitutebroken');
                    if (target.volatiles['substitutebroken'])
                        target.volatiles['substitutebroken'].move = move.id;
                }
                else {
                    this.add('-activate', target, 'Substitute', '[damage]');
                }
                if (move.ohko)
                    this.add('-ohko');
                if (move.recoil && damage) {
                    this.damage(this.actions.calcRecoilDamage(damage, move, source), source, target, 'recoil');
                }
                if (move.drain) {
                    this.heal(Math.ceil(damage * move.drain[0] / move.drain[1]), source, target, 'drain');
                }
                this.runEvent('AfterSubDamage', target, source, move, damage);
                return this.HIT_SUBSTITUTE;
            },
      onEnd(target) {
                this.add('-end', target, 'Substitute');
            },
    },
    target: "self",
  },
  suckerpunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onTry(source, target) {
            const action = this.queue.willMove(target);
            if (!action || action.choice !== 'move' || action.move.category === 'Status' || target.volatiles['mustrecharge']) {
                this.add('-fail', source);
                return null;
            }
        },
    target: "normal",
  },
  sunnyday: {
    flags: {
      metronome: 1,
    },
    weather: "sunnyday",
    target: "all",
  },
  superfang: {
    damageCallback(pokemon, target) {
            return this.clampIntRange(target.getUndynamaxedHP() / 2, 1);
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  superpower: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    self: {
      boosts: {
        atk: -1,
        def: -1,
      },
    },
    target: "normal",
  },
  supersonic: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
    },
    volatileStatus: "confusion",
    target: "normal",
  },
  surf: {
    flags: {
      protect: 1,
      mirror: 1,
      nonsky: 1,
      metronome: 1,
    },
    target: "allAdjacent",
  },
  swagger: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    volatileStatus: "confusion",
    boosts: {
      atk: 2,
    },
    target: "normal",
  },
  swallow: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    onTry(source) {
            return !!source.volatiles['stockpile'];
        },
    onHit(pokemon) {
            const layers = pokemon.volatiles['stockpile']?.layers || 1;
            const healAmount = [0.25, 0.5, 1];
            const success = !!this.heal(this.modify(pokemon.maxhp, healAmount[layers - 1]));
            if (!success)
                this.add('-fail', pokemon, 'heal');
            pokemon.removeVolatile('stockpile');
            return success || null;
        },
    target: "self",
  },
  sweetkiss: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "confusion",
    target: "normal",
  },
  sweetscent: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      evasion: -1,
    },
    target: "allAdjacentFoes",
  },
  swift: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "allAdjacentFoes",
  },
  switcheroo: {
    flags: {
      protect: 1,
      mirror: 1,
      allyanim: 1,
      noassist: 1,
      failcopycat: 1,
    },
    onTryImmunity(target) {
            return !target.hasAbility('stickyhold');
        },
    onHit(target, source, move) {
            const yourItem = target.takeItem(source);
            const myItem = source.takeItem();
            if (target.item || source.item || (!yourItem && !myItem)) {
                if (yourItem)
                    target.item = yourItem.id;
                if (myItem)
                    source.item = myItem.id;
                return false;
            }
            if ((myItem && !this.singleEvent('TakeItem', myItem, source.itemState, target, source, move, myItem)) ||
                (yourItem && !this.singleEvent('TakeItem', yourItem, target.itemState, source, target, move, yourItem))) {
                if (yourItem)
                    target.item = yourItem.id;
                if (myItem)
                    source.item = myItem.id;
                return false;
            }
            this.add('-activate', source, 'move: Trick', `[of] ${target}`);
            if (myItem) {
                target.setItem(myItem);
                this.add('-item', target, myItem, '[from] move: Switcheroo');
            }
            else {
                this.add('-enditem', target, yourItem, '[silent]', '[from] move: Switcheroo');
            }
            if (yourItem) {
                source.setItem(yourItem);
                this.add('-item', source, yourItem, '[from] move: Switcheroo');
            }
            else {
                this.add('-enditem', source, myItem, '[silent]', '[from] move: Switcheroo');
            }
        },
    target: "normal",
  },
  swordsdance: {
    flags: {
      snatch: 1,
      dance: 1,
      metronome: 1,
    },
    boosts: {
      atk: 2,
    },
    target: "self",
  },
  synthesis: {
    flags: {
      snatch: 1,
      heal: 1,
      metronome: 1,
    },
    onHit(pokemon) {
            if (this.field.isWeather(['sunnyday', 'desolateland'])) {
                this.heal(pokemon.maxhp * 2 / 3);
            }
            else if (this.field.isWeather(['raindance', 'primordialsea', 'sandstorm', 'hail'])) {
                this.heal(pokemon.baseMaxhp / 4);
            }
            else {
                this.heal(pokemon.baseMaxhp / 2);
            }
        },
    target: "self",
  },
  tackle: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  tailglow: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      spa: 2,
    },
    target: "self",
  },
  tailwhip: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    boosts: {
      def: -1,
    },
    target: "allAdjacentFoes",
  },
  tailwind: {
    flags: {
      snatch: 1,
      metronome: 1,
      wind: 1,
    },
    sideCondition: "tailwind",
    condition: {
      duration: 3,
      durationCallback(target, source, effect) {
                if (source?.hasAbility('persistent')) {
                    this.add('-activate', source, 'ability: Persistent', '[move] Tailwind');
                    return 5;
                }
                return 3;
            },
      onSideStart(side, source) {
                if (source?.hasAbility('persistent')) {
                    this.add('-sidestart', side, 'move: Tailwind', '[persistent]');
                }
                else {
                    this.add('-sidestart', side, 'move: Tailwind');
                }
            },
      onModifySpe(spe) {
                return spe * 2;
            },
      onSideResidualOrder: 5,
      onSideResidualSubOrder: undefined,
      onSideEnd(side) {
                this.add('-sideend', side, 'move: Tailwind');
            },
    },
    target: "allySide",
  },
  takedown: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    recoil: [1, 4],
    target: "normal",
  },
  taunt: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "taunt",
    condition: {
      duration: undefined,
      onStart(target) {
                this.add('-start', target, 'move: Taunt');
            },
      onResidualOrder: 10,
      onEnd(target) {
                this.add('-end', target, 'move: Taunt');
            },
      onDisableMove(pokemon) {
                for (const moveSlot of pokemon.moveSlots) {
                    if (this.dex.moves.get(moveSlot.id).category === 'Status') {
                        pokemon.disableMove(moveSlot.id);
                    }
                }
            },
      onBeforeMovePriority: 5,
      onBeforeMove(attacker, defender, move) {
                if (move.category === 'Status') {
                    this.add('cant', attacker, 'move: Taunt', move);
                    return false;
                }
            },
      durationCallback() {
                return this.random(3, 6);
            },
      onResidualSubOrder: 15,
    },
    target: "normal",
  },
  teeterdance: {
    flags: {
      protect: 1,
      mirror: 1,
      dance: 1,
      metronome: 1,
    },
    volatileStatus: "confusion",
    target: "allAdjacent",
  },
  teleport: {
    flags: {
      metronome: 1,
    },
    onTry: false,
    selfSwitch: false,
    target: "self",
  },
  thief: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      failmefirst: 1,
      noassist: 1,
      failcopycat: 1,
    },
    onAfterHit(target, source, move) {
            if (source.item || source.volatiles['gem']) {
                return;
            }
            const yourItem = target.takeItem(source);
            if (!yourItem) {
                return;
            }
            if (!this.singleEvent('TakeItem', yourItem, target.itemState, source, target, move, yourItem) ||
                !source.setItem(yourItem)) {
                target.item = yourItem.id; // bypass setItem so we don't break choicelock or anything
                return;
            }
            this.add('-enditem', target, yourItem, '[silent]', '[from] move: Thief', `[of] ${source}`);
            this.add('-item', source, yourItem, '[from] move: Thief', `[of] ${target}`);
        },
    target: "normal",
  },
  thrash: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      failinstruct: 1,
    },
    self: {
      volatileStatus: "lockedmove",
    },
    target: "randomNormal",
  },
  thunder: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onModifyMove(move, pokemon, target) {
            switch (target?.effectiveWeather()) {
                case 'raindance':
                case 'primordialsea':
                    move.accuracy = true;
                    break;
                case 'sunnyday':
                case 'desolateland':
                    move.accuracy = 50;
                    break;
            }
        },
    secondary: {
      chance: 30,
      status: "par",
    },
    target: "normal",
  },
  thunderbolt: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "par",
    },
    target: "normal",
  },
  thunderfang: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      bite: 1,
    },
    secondaries: [
      {
        chance: 10,
        status: "par",
      },
      {
        chance: 10,
        volatileStatus: "flinch",
      },
    ],
    target: "normal",
  },
  thunderpunch: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      punch: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "par",
    },
    target: "normal",
  },
  thundershock: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 10,
      status: "par",
    },
    target: "normal",
  },
  thunderwave: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    status: "par",
    ignoreImmunity: false,
    target: "normal",
  },
  tickle: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    boosts: {
      atk: -1,
      def: -1,
    },
    target: "normal",
  },
  torment: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    volatileStatus: "torment",
    condition: {
      noCopy: true,
      onStart(pokemon, source, effect) {
                if (pokemon.volatiles['dynamax']) {
                    delete pokemon.volatiles['torment'];
                    return false;
                }
                if (effect?.id === 'gmaxmeltdown')
                    this.effectState.duration = 3;
                this.add('-start', pokemon, 'Torment');
            },
      onEnd(pokemon) {
                this.add('-end', pokemon, 'Torment');
            },
      onDisableMove(pokemon) {
                if (pokemon.lastMove && pokemon.lastMove.id !== 'struggle')
                    pokemon.disableMove(pokemon.lastMove.id);
            },
    },
    target: "normal",
  },
  toxic: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    status: "tox",
    target: "normal",
    condition: {
      noCopy: true,
      duration: 1,
      onSourceInvulnerabilityPriority: 1,
      onSourceInvulnerability(target, source, move) {
                if (move && source === this.effectState.target)
                    return 0;
            },
      onSourceAccuracy(accuracy, target, source, move) {
                if (move && source === this.effectState.target)
                    return true;
            },
    },
  },
  toxicspikes: {
    flags: {
      metronome: 1,
      mustpressure: 1,
    },
    sideCondition: "toxicspikes",
    condition: {
      onSideStart(side) {
                this.add('-sidestart', side, 'move: Toxic Spikes');
                this.effectState.layers = 1;
            },
      onSideRestart(side) {
                if (this.effectState.layers >= 2)
                    return false;
                this.add('-sidestart', side, 'move: Toxic Spikes');
                this.effectState.layers++;
            },
      onSwitchIn: undefined,
      onEntryHazard(pokemon) {
                if (!pokemon.isGrounded())
                    return;
                if (pokemon.hasType('Poison')) {
                    this.add('-sideend', pokemon.side, 'move: Toxic Spikes', `[of] ${pokemon}`);
                    pokemon.side.removeSideCondition('toxicspikes');
                }
                else if (pokemon.volatiles['substitute'] || pokemon.hasType('Steel') || pokemon.hasAbility('magicguard')) {
                    // do nothing
                }
                else if (this.effectState.layers >= 2) {
                    pokemon.trySetStatus('tox', pokemon.side.foe.active[0]);
                }
                else {
                    pokemon.trySetStatus('psn', pokemon.side.foe.active[0]);
                }
            },
    },
    target: "foeSide",
  },
  transform: {
    flags: {
      bypasssub: 1,
      metronome: 1,
      failencore: 1,
    },
    onHit(target, pokemon) {
            return pokemon.transformInto(target);
        },
    target: "normal",
  },
  triattack: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 20,
      onHit(target, source) {
                const status = this.sample(['brn', 'par', 'frz']);
                target.trySetStatus(status, source);
            },
    },
    target: "normal",
  },
  trick: {
    flags: {
      protect: 1,
      mirror: 1,
      allyanim: 1,
      noassist: 1,
      failcopycat: 1,
    },
    onTryImmunity(target) {
            return !target.hasAbility('stickyhold');
        },
    onHit(target, source, move) {
            const yourItem = target.takeItem(source);
            const myItem = source.takeItem();
            if (yourItem === false || myItem === false || (!yourItem && !myItem)) {
                if (yourItem)
                    target.item = yourItem.id;
                if (myItem)
                    source.item = myItem.id;
                return false;
            }
            if ((myItem && !this.singleEvent('TakeItem', myItem, source.itemState, target, source, move, myItem)) ||
                (yourItem && !this.singleEvent('TakeItem', yourItem, target.itemState, source, target, move, yourItem))) {
                if (yourItem)
                    target.item = yourItem.id;
                if (myItem)
                    source.item = myItem.id;
                return false;
            }
            this.add('-activate', source, 'move: Trick', `[of] ${target}`);
            if (myItem) {
                target.setItem(myItem);
                this.add('-item', target, myItem, '[from] move: Trick');
            }
            else {
                this.add('-enditem', target, yourItem, '[silent]', '[from] move: Trick');
            }
            if (yourItem) {
                source.setItem(yourItem);
                this.add('-item', source, yourItem, '[from] move: Trick');
            }
            else {
                this.add('-enditem', source, myItem, '[silent]', '[from] move: Trick');
            }
        },
    target: "normal",
  },
  trickroom: {
    flags: {
      mirror: 1,
      metronome: 1,
    },
    pseudoWeather: "trickroom",
    condition: {
      duration: 5,
      durationCallback(source, effect) {
                if (source?.hasAbility('persistent')) {
                    this.add('-activate', source, 'ability: Persistent', '[move] Trick Room');
                    return 7;
                }
                return 5;
            },
      onFieldStart(target, source) {
                if (source?.hasAbility('persistent')) {
                    this.add('-fieldstart', 'move: Trick Room', `[of] ${source}`, '[persistent]');
                }
                else {
                    this.add('-fieldstart', 'move: Trick Room', `[of] ${source}`);
                }
            },
      onFieldRestart(target, source) {
                this.field.removePseudoWeather('trickroom');
            },
      onFieldResidualOrder: 13,
      onFieldResidualSubOrder: undefined,
      onFieldEnd() {
                this.add('-fieldend', 'move: Trick Room');
            },
    },
    target: "all",
  },
  triplekick: {
    basePowerCallback(pokemon, target, move) {
            return 10 * move.hit;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: 3,
    multiaccuracy: true,
    target: "normal",
  },
  trumpcard: {
    basePowerCallback(source, target, move) {
            const callerMoveId = move.sourceEffect || move.id;
            const moveSlot = callerMoveId === 'instruct' ? source.getMoveData(move.id) : source.getMoveData(callerMoveId);
            let bp;
            if (!moveSlot) {
                bp = 40;
            }
            else {
                switch (moveSlot.pp) {
                    case 0:
                        bp = 200;
                        break;
                    case 1:
                        bp = 80;
                        break;
                    case 2:
                        bp = 60;
                        break;
                    case 3:
                        bp = 50;
                        break;
                    default:
                        bp = 40;
                        break;
                }
            }
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  twineedle: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    multihit: 2,
    secondary: {
      chance: 20,
      status: "psn",
    },
    target: "normal",
  },
  twister: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      wind: 1,
    },
    secondary: {
      chance: 20,
      volatileStatus: "flinch",
    },
    target: "allAdjacentFoes",
  },
  uproar: {
    flags: {
      protect: 1,
      mirror: 1,
      sound: 1,
      metronome: 1,
      nosleeptalk: 1,
    },
    self: {
      volatileStatus: "uproar",
    },
    onTryHit(target) {
            const activeTeam = target.side.activeTeam();
            const foeActiveTeam = target.side.foe.activeTeam();
            for (const [i, allyActive] of activeTeam.entries()) {
                if (allyActive && allyActive.status === 'slp')
                    allyActive.cureStatus();
                const foeActive = foeActiveTeam[i];
                if (foeActive && foeActive.status === 'slp')
                    foeActive.cureStatus();
            }
        },
    condition: {
      duration: undefined,
      onStart(target) {
                this.add('-start', target, 'Uproar');
            },
      onResidual(target) {
                if (target.volatiles['throatchop']) {
                    target.removeVolatile('uproar');
                    return;
                }
                if (target.lastMove && target.lastMove.id === 'struggle') {
                    // don't lock
                    delete target.volatiles['uproar'];
                }
                this.add('-start', target, 'Uproar', '[upkeep]');
            },
      onResidualOrder: 10,
      onResidualSubOrder: 11,
      onEnd(target) {
                this.add('-end', target, 'Uproar');
            },
      onLockMove: "uproar",
      onAnySetStatus(status, pokemon) {
                if (status.id === 'slp') {
                    if (pokemon === this.effectState.target) {
                        this.add('-fail', pokemon, 'slp', '[from] Uproar', '[msg]');
                    }
                    else {
                        this.add('-fail', pokemon, 'slp', '[from] Uproar');
                    }
                    return null;
                }
            },
      durationCallback() {
                return this.random(3, 7);
            },
    },
    target: "randomNormal",
  },
  uturn: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    selfSwitch: true,
    target: "normal",
  },
  vacuumwave: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  vinewhip: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  visegrip: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  vitalthrow: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  volttackle: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    recoil: [1, 3],
    secondary: {
      chance: 10,
      status: "par",
    },
    target: "normal",
  },
  wakeupslap: {
    basePowerCallback(pokemon, target, move) {
            if (target.status === 'slp' || target.hasAbility('comatose')) {
                this.debug('BP doubled on sleeping target');
                return move.basePower * 2;
            }
            return move.basePower;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    onHit(target) {
            if (target.status === 'slp')
                target.cureStatus();
        },
    target: "normal",
  },
  waterfall: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 20,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
  watergun: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
  },
  waterpulse: {
    flags: {
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
      pulse: 1,
    },
    secondary: {
      chance: 20,
      volatileStatus: "confusion",
    },
    target: "any",
  },
  watersport: {
    flags: {
      nonsky: 1,
      metronome: 1,
    },
    condition: {
      noCopy: false,
      onStart(pokemon) {
                this.add('-start', pokemon, 'move: Water Sport');
            },
      onAnyBasePowerPriority: 3,
      onAnyBasePower(basePower, user, target, move) {
                if (move.type === 'Fire') {
                    this.debug('Water Sport weaken');
                    return this.chainModify(0.5);
                }
            },
    },
    target: "all",
    volatileStatus: "watersport",
  },
  waterspout: {
    basePowerCallback(pokemon, target, move) {
            const bp = move.basePower * pokemon.hp / pokemon.maxhp;
            this.debug(`BP: ${bp}`);
            return bp;
        },
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "allAdjacentFoes",
  },
  weatherball: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    onModifyType(move, pokemon) {
            switch (pokemon.effectiveWeather()) {
                case 'sunnyday':
                case 'desolateland':
                    move.type = 'Fire';
                    break;
                case 'raindance':
                case 'primordialsea':
                    move.type = 'Water';
                    break;
                case 'sandstorm':
                    move.type = 'Rock';
                    break;
                case 'hail':
                case 'snowscape':
                    move.type = 'Ice';
                    break;
            }
        },
    onModifyMove(move, pokemon) {
            switch (pokemon.effectiveWeather()) {
                case 'sunnyday':
                case 'desolateland':
                    move.basePower *= 2;
                    break;
                case 'raindance':
                case 'primordialsea':
                    move.basePower *= 2;
                    break;
                case 'sandstorm':
                    move.basePower *= 2;
                    break;
                case 'hail':
                case 'snowscape':
                    move.basePower *= 2;
                    break;
            }
            this.debug(`BP: ${move.basePower}`);
        },
    target: "normal",
  },
  whirlpool: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "partiallytrapped",
    target: "normal",
  },
  whirlwind: {
    flags: {
      protect: 1,
      mirror: 1,
      bypasssub: 1,
      metronome: 1,
    },
    forceSwitch: true,
    target: "normal",
  },
  willowisp: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    status: "brn",
    target: "normal",
  },
  wingattack: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      distance: 1,
      metronome: 1,
    },
    target: "any",
  },
  wish: {
    flags: {
      heal: 1,
      metronome: 1,
    },
    slotCondition: "Wish",
    condition: {
      duration: 2,
      onResidualOrder: 7,
      onEnd(target) {
                if (!target.fainted) {
                    const source = this.effectState.source;
                    const damage = this.heal(target.baseMaxhp / 2, target, target);
                    if (damage)
                        this.add('-heal', target, target.getHealth, '[from] move: Wish', '[wisher] ' + source.name);
                }
            },
    },
    target: "self",
  },
  withdraw: {
    flags: {
      snatch: 1,
      metronome: 1,
    },
    boosts: {
      def: 1,
    },
    target: "self",
  },
  woodhammer: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    recoil: [1, 3],
    target: "normal",
  },
  worryseed: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      allyanim: 1,
      metronome: 1,
    },
    onTryImmunity(target) {
            // Truant and Insomnia have special treatment; they fail before
            // checking accuracy and will double Stomping Tantrum's BP
            if (target.ability === 'truant' || target.ability === 'insomnia') {
                return false;
            }
        },
    onTryHit(target) {
            if (target.getAbility().flags['cantsuppress']) {
                return false;
            }
        },
    onHit(target, source) {
            const oldAbility = target.setAbility('insomnia');
            if (!oldAbility)
                return oldAbility;
            if (target.status === 'slp')
                target.cureStatus();
        },
    target: "normal",
  },
  wrap: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "partiallytrapped",
    target: "normal",
  },
  wringout: {
    basePowerCallback(pokemon, target) {
            const bp = Math.floor(target.hp * 120 / target.maxhp) + 1;
            this.debug(`BP for ${target.hp}/${target.maxhp} HP: ${bp}`);
            return bp;
        },
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    target: "normal",
    basePower: 0,
  },
  xscissor: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
      slicing: 1,
    },
    target: "normal",
  },
  yawn: {
    flags: {
      protect: 1,
      reflectable: 1,
      mirror: 1,
      metronome: 1,
    },
    volatileStatus: "yawn",
    onTryHit(target) {
            if (target.status || !target.runStatusImmunity('slp')) {
                return false;
            }
        },
    condition: {
      noCopy: true,
      duration: 2,
      onStart(target, source) {
                this.add('-start', target, 'move: Yawn', `[of] ${source}`);
            },
      onResidualOrder: 10,
      onEnd(target) {
                this.add('-end', target, 'move: Yawn', '[silent]');
                target.trySetStatus('slp', this.effectState.source);
            },
      onResidualSubOrder: 19,
    },
    target: "normal",
  },
  zapcannon: {
    flags: {
      protect: 1,
      mirror: 1,
      metronome: 1,
      bullet: 1,
    },
    secondary: {
      chance: 100,
      status: "par",
    },
    target: "normal",
  },
  zenheadbutt: {
    flags: {
      contact: 1,
      protect: 1,
      mirror: 1,
      metronome: 1,
    },
    secondary: {
      chance: 20,
      volatileStatus: "flinch",
    },
    target: "normal",
  },
}
