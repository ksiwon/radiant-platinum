// @ts-nocheck
/**
 * ⚠️ **생성물이다. 손으로 고치지 않는다** — `tools/distribution/mechanics/bake.mjs`가
 * `@pkmn/sim`(MIT, Guangcong Luo 외)의 4세대 표를 평탄화해 구운 것이다.
 *
 * 도구 효과. 번호·이름·던지기 위력·자연의은혜는 롬이 준다
 *
 * **수치와 이름은 여기 없다.** 그것은 사용자의 롬에서 오고
 * (`src/engine/battle/dex/provider.ts`), 여기 있는 것은 효과 **구현**뿐이다.
 * 왜 그렇게 갈랐는지는 COPYRIGHT.md §2.9 · DEPLOY.md §4.
 */
import type { Mechanics } from '../mechanics'

export const ITEM_MECHANICS: Record<string, Mechanics> = {
  adamantorb: {
    fling: {
      basePower: 60,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && user.species.name === 'Dialga' && (move.type === 'Steel' || move.type === 'Dragon')) {
                return this.chainModify(1.2);
            }
        },
  },
  aguavberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, pokemon.baseMaxhp / 3))
                return false;
        },
    onEat(pokemon) {
            this.heal(pokemon.baseMaxhp / 8);
            if (pokemon.getNature().minus === 'spd') {
                pokemon.addVolatile('confusion');
            }
        },
  },
  apicotberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 &&
                pokemon.hasAbility('gluttony') && pokemon.abilityState.gluttony)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            this.boost({ spd: 1 });
        },
  },
  armorfossil: {
    fling: {
      basePower: 100,
    },
  },
  aspearberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'frz') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'frz') {
                pokemon.cureStatus();
            }
        },
  },
  babiriberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Steel' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  belueberry: {
    isBerry: true,
    onEat: false,
  },
  berry: {
    isBerry: true,
    onResidualOrder: 10,
    onResidual(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, 10))
                return false;
        },
    onEat(pokemon) {
            this.heal(10);
        },
  },
  berryjuice: {
    fling: {
      basePower: 30,
    },
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                if (this.runEvent('TryHeal', pokemon, null, this.effect, 20) && pokemon.useItem()) {
                    this.heal(20);
                }
            }
        },
  },
  berserkgene: {
    onUpdate(pokemon) {
            if (pokemon.useItem()) {
                pokemon.addVolatile('confusion');
            }
        },
    boosts: {
      atk: 2,
    },
  },
  bigroot: {
    fling: {
      basePower: 10,
    },
    onTryHealPriority: 1,
    onTryHeal(damage, target, source, effect) {
            const heals = ['drain', 'leechseed', 'ingrain', 'aquaring'];
            if (heals.includes(effect.id)) {
                return Math.floor(damage * 1.3);
            }
        },
  },
  bitterberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.volatiles['confusion']) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            pokemon.removeVolatile('confusion');
        },
  },
  blackbelt: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Fighting') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  blackglasses: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Dark') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  blacksludge: {
    fling: {
      basePower: 30,
    },
    onResidualOrder: 10,
    onResidualSubOrder: 4,
    onResidual(pokemon) {
            if (pokemon.hasType('Poison')) {
                this.heal(pokemon.baseMaxhp / 16);
            }
            else {
                this.damage(pokemon.baseMaxhp / 8);
            }
        },
  },
  blukberry: {
    isBerry: true,
    onEat: false,
  },
  brightpowder: {
    fling: {
      basePower: 10,
    },
    onModifyAccuracyPriority: 5,
    onModifyAccuracy(accuracy) {
            if (typeof accuracy !== 'number')
                return;
            this.debug('brightpowder - decreasing accuracy');
            return accuracy * 0.9;
        },
  },
  burntberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'frz') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'frz') {
                pokemon.cureStatus();
            }
        },
  },
  charcoal: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Fire') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  chartiberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Rock' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  cheriberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'par') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'par') {
                pokemon.cureStatus();
            }
        },
  },
  cherishball: {
    isPokeball: true,
  },
  chestoberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'slp') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'slp') {
                pokemon.cureStatus();
            }
        },
  },
  chilanberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Normal' &&
                (!target.volatiles['substitute'] || move.flags['bypasssub'] || (move.infiltrates && this.gen >= 6))) {
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  choiceband: {
    fling: {
      basePower: 10,
    },
    onModifyAtkPriority: 1,
    onModifyAtk(atk, pokemon) {
            if (pokemon.volatiles['dynamax'])
                return;
            return this.chainModify(1.5);
        },
    isChoice: true,
    onAfterMove(pokemon) {
            pokemon.addVolatile('choicelock');
        },
  },
  choicescarf: {
    fling: {
      basePower: 10,
    },
    onModifySpe(spe, pokemon) {
            if (pokemon.volatiles['dynamax'])
                return;
            return this.chainModify(1.5);
        },
    isChoice: true,
    onAfterMove(pokemon) {
            pokemon.addVolatile('choicelock');
        },
  },
  choicespecs: {
    fling: {
      basePower: 10,
    },
    onModifySpAPriority: 1,
    onModifySpA(spa, pokemon) {
            if (pokemon.volatiles['dynamax'])
                return;
            return this.chainModify(1.5);
        },
    isChoice: true,
    onAfterMove(pokemon) {
            pokemon.addVolatile('choicelock');
        },
  },
  chopleberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.causedCrashDamage)
                return damage;
            if (move.type === 'Fighting' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'];
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  clawfossil: {
    fling: {
      basePower: 100,
    },
  },
  cobaberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Flying' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  colburberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Dark' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  cornnberry: {
    isBerry: true,
    onEat: false,
  },
  custapberry: {
    isBerry: true,
    onFractionalPriorityPriority: -2,
    onEat() { },
    onBeforeTurn(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 && pokemon.ability === 'gluttony')) {
                const action = this.queue.willMove(pokemon);
                if (!action)
                    return;
                this.queue.insertChoice({
                    choice: 'event',
                    event: 'Custap',
                    priority: action.priority + 0.1,
                    pokemon: action.pokemon,
                    move: action.move,
                    targetLoc: action.targetLoc,
                });
            }
        },
    onCustap(pokemon) {
            const action = this.queue.willMove(pokemon);
            this.debug(`custap action: ${action?.moveid}`);
            if (action && pokemon.eatItem()) {
                this.queue.cancelAction(pokemon);
                this.add('-message', "Custap Berry activated.");
                this.runAction(action);
            }
        },
  },
  damprock: {
    fling: {
      basePower: 60,
    },
  },
  dawnstone: {
    fling: {
      basePower: 80,
    },
  },
  deepseascale: {
    fling: {
      basePower: 30,
    },
    onModifySpDPriority: 2,
    onModifySpD(spd, pokemon) {
            if (pokemon.species.name === 'Clamperl') {
                return this.chainModify(2);
            }
        },
  },
  deepseatooth: {
    fling: {
      basePower: 90,
    },
    onModifySpAPriority: 1,
    onModifySpA(spa, pokemon) {
            if (pokemon.species.name === 'Clamperl') {
                return this.chainModify(2);
            }
        },
  },
  destinyknot: {
    fling: {
      basePower: 10,
    },
    onAttractPriority: -100,
    onAttract(target, source) {
            this.debug(`attract intercepted: ${target} from ${source}`);
            if (!source || source === target)
                return;
            if (!source.volatiles['attract'])
                source.addVolatile('attract', target);
        },
  },
  diveball: {
    isPokeball: true,
  },
  domefossil: {
    fling: {
      basePower: 100,
    },
  },
  dracoplate: {
    onPlate: "Dragon",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Dragon') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Dragon",
  },
  dragonfang: {
    fling: {
      basePower: 70,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Dragon') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  dragonscale: {
    fling: {
      basePower: 30,
    },
  },
  dreadplate: {
    onPlate: "Dark",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Dark') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Dark",
  },
  dubiousdisc: {
    fling: {
      basePower: 50,
    },
  },
  durinberry: {
    isBerry: true,
    onEat: false,
  },
  duskball: {
    isPokeball: true,
  },
  duskstone: {
    fling: {
      basePower: 80,
    },
  },
  earthplate: {
    onPlate: "Ground",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Ground') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Ground",
  },
  electirizer: {
    fling: {
      basePower: 80,
    },
  },
  enigmaberry: {
    isBerry: true,
    onHit(target, source, move) {
            if (move && target.getMoveHitData(move).typeMod > 0) {
                if (target.eatItem()) {
                    this.heal(target.baseMaxhp / 4);
                }
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, pokemon.baseMaxhp / 4))
                return false;
        },
    onEat() { },
  },
  expertbelt: {
    fling: {
      basePower: 10,
    },
    onModifyDamage(damage, source, target, move) {
            if (move && target.getMoveHitData(move).typeMod > 0) {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  fastball: {
    isPokeball: true,
  },
  figyberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, pokemon.baseMaxhp / 3))
                return false;
        },
    onEat(pokemon) {
            this.heal(pokemon.baseMaxhp / 8);
            if (pokemon.getNature().minus === 'atk') {
                pokemon.addVolatile('confusion');
            }
        },
  },
  firestone: {
    fling: {
      basePower: 30,
    },
  },
  fistplate: {
    onPlate: "Fighting",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Fighting') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Fighting",
  },
  flameorb: {
    fling: {
      basePower: 30,
      status: "brn",
    },
    onResidualOrder: 10,
    onResidualSubOrder: 20,
    onResidual(pokemon) {
            pokemon.trySetStatus('brn', pokemon);
        },
  },
  flameplate: {
    onPlate: "Fire",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Fire') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Fire",
  },
  focusband: {
    fling: {
      basePower: 10,
    },
    onDamagePriority: -40,
    onDamage(damage, target, source, effect) {
            if (this.randomChance(1, 10) && damage >= target.hp && effect && effect.effectType === 'Move') {
                this.add("-activate", target, "item: Focus Band");
                return target.hp - 1;
            }
        },
  },
  focussash: {
    fling: {
      basePower: 10,
    },
    onDamagePriority: -40,
    onTryHit(target, source, move) {
            if (target !== source && target.hp === target.maxhp) {
                target.addVolatile('focussash');
            }
        },
    condition: {
      duration: 1,
      onDamage(damage, target, source, effect) {
                if (effect && effect.effectType === 'Move' && damage >= target.hp) {
                    this.effectState.activated = true;
                    return target.hp - 1;
                }
            },
      onAfterMoveSecondary(target) {
                if (this.effectState.activated)
                    target.useItem();
                target.removeVolatile('focussash');
            },
    },
  },
  friendball: {
    isPokeball: true,
  },
  fullincense: {
    fling: {
      basePower: 10,
    },
    onFractionalPriority: -0.2,
    onFractionalPriorityPriority: 1,
  },
  ganlonberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 &&
                pokemon.hasAbility('gluttony') && pokemon.abilityState.gluttony)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            this.boost({ def: 1 });
        },
  },
  goldberry: {
    isBerry: true,
    onResidualOrder: 10,
    onResidual(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, 30))
                return false;
        },
    onEat(pokemon) {
            this.heal(30);
        },
  },
  greatball: {
    isPokeball: true,
  },
  grepaberry: {
    isBerry: true,
    onEat: false,
  },
  gripclaw: {
    fling: {
      basePower: 90,
    },
  },
  griseousorb: {
    fling: {
      basePower: 60,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (user.species.num === 487 && (move.type === 'Ghost' || move.type === 'Dragon')) {
                return this.chainModify(1.2);
            }
        },
    onTakeItem: false,
    forcedForme: "Giratina-Origin",
    onSetAbility: false,
  },
  habanberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Dragon' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  hardstone: {
    fling: {
      basePower: 100,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Rock') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  healball: {
    isPokeball: true,
  },
  heatrock: {
    fling: {
      basePower: 60,
    },
  },
  heavyball: {
    isPokeball: true,
  },
  helixfossil: {
    fling: {
      basePower: 100,
    },
  },
  hondewberry: {
    isBerry: true,
    onEat: false,
  },
  iapapaberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, pokemon.baseMaxhp / 3))
                return false;
        },
    onEat(pokemon) {
            this.heal(pokemon.baseMaxhp / 8);
            if (pokemon.getNature().minus === 'def') {
                pokemon.addVolatile('confusion');
            }
        },
  },
  iceberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'brn') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'brn') {
                pokemon.cureStatus();
            }
        },
  },
  icicleplate: {
    onPlate: "Ice",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Ice') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Ice",
  },
  icyrock: {
    fling: {
      basePower: 40,
    },
  },
  insectplate: {
    onPlate: "Bug",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Bug') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Bug",
  },
  ironball: {
    fling: {
      basePower: 130,
    },
    onModifySpe(spe) {
            return this.chainModify(0.5);
        },
  },
  ironplate: {
    onPlate: "Steel",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Steel') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Steel",
  },
  jabocaberry: {
    isBerry: true,
    onDamagingHit(damage, target, source, move) {
            if (move.category === 'Physical' && !source.hasAbility('magicguard')) {
                if (target.eatItem()) {
                    this.damage(source.baseMaxhp / 8, source, target, null, true);
                }
            }
        },
    onEat() { },
  },
  kasibberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Ghost' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  kebiaberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Poison' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  kelpsyberry: {
    isBerry: true,
    onEat: false,
  },
  kingsrock: {
    fling: {
      basePower: 30,
      volatileStatus: "flinch",
    },
    onModifyMovePriority: -1,
    onModifyMove(move) {
            const affectedByKingsRock = [
                'aerialace', 'aeroblast', 'aircutter', 'airslash', 'aquajet', 'aquatail', 'armthrust', 'assurance', 'attackorder', 'aurasphere', 'avalanche', 'barrage', 'beatup', 'bide', 'bind', 'blastburn', 'bonerush', 'bonemerang', 'bounce', 'bravebird', 'brickbreak', 'brine', 'bugbite', 'bulletpunch', 'bulletseed', 'chargebeam', 'clamp', 'closecombat', 'cometpunch', 'crabhammer', 'crosschop', 'crosspoison', 'crushgrip', 'cut', 'darkpulse', 'dig', 'discharge', 'dive', 'doublehit', 'doublekick', 'doubleslap', 'doubleedge', 'dracometeor', 'dragonbreath', 'dragonclaw', 'dragonpulse', 'dragonrage', 'dragonrush', 'drainpunch', 'drillpeck', 'earthpower', 'earthquake', 'eggbomb', 'endeavor', 'eruption', 'explosion', 'extremespeed', 'falseswipe', 'feintattack', 'firefang', 'firespin', 'flail', 'flashcannon', 'fly', 'forcepalm', 'frenzyplant', 'frustration', 'furyattack', 'furycutter', 'furyswipes', 'gigaimpact', 'grassknot', 'gunkshot', 'gust', 'gyroball', 'hammerarm', 'headsmash', 'hiddenpower', 'highjumpkick', 'hornattack', 'hydrocannon', 'hydropump', 'hyperbeam', 'iceball', 'icefang', 'iceshard', 'iciclespear', 'ironhead', 'judgment', 'jumpkick', 'karatechop', 'lastresort', 'lavaplume', 'leafblade', 'leafstorm', 'lowkick', 'machpunch', 'magicalleaf', 'magmastorm', 'magnetbomb', 'magnitude', 'megakick', 'megapunch', 'megahorn', 'meteormash', 'mirrorshot', 'mudbomb', 'mudshot', 'muddywater', 'nightshade', 'nightslash', 'ominouswind', 'outrage', 'overheat', 'payday', 'payback', 'peck', 'petaldance', 'pinmissile', 'pluck', 'poisonjab', 'poisontail', 'pound', 'powergem', 'powerwhip', 'psychoboost', 'psychocut', 'psywave', 'punishment', 'quickattack', 'rage', 'rapidspin', 'razorleaf', 'razorwind', 'return', 'revenge', 'reversal', 'roaroftime', 'rockblast', 'rockclimb', 'rockthrow', 'rockwrecker', 'rollingkick', 'rollout', 'sandtomb', 'scratch', 'seedbomb', 'seedflare', 'seismictoss', 'selfdestruct', 'shadowclaw', 'shadowforce', 'shadowpunch', 'shadowsneak', 'shockwave', 'signalbeam', 'silverwind', 'skullbash', 'skyattack', 'skyuppercut', 'slam', 'slash', 'snore', 'solarbeam', 'sonicboom', 'spacialrend', 'spikecannon', 'spitup', 'steelwing', 'stoneedge', 'strength', 'struggle', 'submission', 'suckerpunch', 'surf', 'swift', 'tackle', 'takedown', 'thrash', 'thunderfang', 'triplekick', 'trumpcard', 'twister', 'uturn', 'uproar', 'vacuumwave', 'visegrip', 'vinewhip', 'vitalthrow', 'volttackle', 'wakeupslap', 'watergun', 'waterpulse', 'waterfall', 'weatherball', 'whirlpool', 'wingattack', 'woodhammer', 'wrap', 'wringout', 'xscissor', 'zenheadbutt',
            ];
            if (affectedByKingsRock.includes(move.id)) {
                if (!move.secondaries)
                    move.secondaries = [];
                move.secondaries.push({
                    chance: 10,
                    volatileStatus: 'flinch',
                });
            }
        },
  },
  laggingtail: {
    fling: {
      basePower: 10,
    },
    onFractionalPriority: -0.2,
    onFractionalPriorityPriority: 1,
  },
  lansatberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 &&
                pokemon.hasAbility('gluttony') && pokemon.abilityState.gluttony)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            pokemon.addVolatile('focusenergy');
        },
  },
  laxincense: {
    fling: {
      basePower: 10,
    },
    onModifyAccuracyPriority: 5,
    onModifyAccuracy(accuracy) {
            if (typeof accuracy !== 'number')
                return;
            this.debug('lax incense - decreasing accuracy');
            return accuracy * 0.9;
        },
  },
  leafstone: {
    fling: {
      basePower: 30,
    },
  },
  leftovers: {
    fling: {
      basePower: 10,
    },
    onResidualOrder: 10,
    onResidualSubOrder: 4,
    onResidual(pokemon) {
            this.heal(pokemon.baseMaxhp / 16);
        },
  },
  leppaberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (!pokemon.hp)
                return;
            if (pokemon.moveSlots.some(move => move.pp === 0)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            const moveSlot = pokemon.moveSlots.find(move => move.pp === 0) ||
                pokemon.moveSlots.find(move => move.pp < move.maxpp);
            if (!moveSlot)
                return;
            const addedPP = pokemon.hasAbility('ripen') ? 20 : 10;
            moveSlot.pp = Math.min(moveSlot.pp + addedPP, moveSlot.maxpp);
            this.add('-activate', pokemon, 'item: Leppa Berry', moveSlot.move, '[consumed]');
        },
  },
  levelball: {
    isPokeball: true,
  },
  liechiberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 &&
                pokemon.hasAbility('gluttony') && pokemon.abilityState.gluttony)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            this.boost({ atk: 1 });
        },
  },
  lifeorb: {
    fling: {
      basePower: 30,
    },
    onBasePower(basePower, user, target) {
            if (!target.volatiles['substitute']) {
                user.addVolatile('lifeorb');
            }
            return basePower;
        },
    onModifyDamagePhase2(damage, source, target, move) {
            if (!move.flags['futuremove'])
                return damage * 1.3;
        },
    condition: {
      duration: 1,
      onAfterMoveSecondarySelf(source, target, move) {
                if (move && move.effectType === 'Move' && source?.volatiles['lifeorb']) {
                    this.damage(source.baseMaxhp / 10, source, source, this.dex.items.get('lifeorb'));
                    source.removeVolatile('lifeorb');
                }
            },
    },
  },
  lightball: {
    fling: {
      basePower: 30,
      status: "par",
    },
    onModifyAtkPriority: 1,
    onModifySpAPriority: 1,
    onBasePower(basePower, pokemon) {
            if (pokemon.species.name === 'Pikachu') {
                return this.chainModify(2);
            }
        },
  },
  lightclay: {
    fling: {
      basePower: 30,
    },
  },
  loveball: {
    isPokeball: true,
  },
  luckypunch: {
    fling: {
      basePower: 40,
    },
    onModifyCritRatio(critRatio, user) {
            if (user.species.name === 'Chansey') {
                return critRatio + 2;
            }
        },
  },
  lumberry: {
    isBerry: true,
    onAfterSetStatusPriority: -1,
    onAfterSetStatus(status, pokemon) {
            pokemon.eatItem();
        },
    onUpdate(pokemon) {
            if (pokemon.status || pokemon.volatiles['confusion']) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            pokemon.cureStatus();
            pokemon.removeVolatile('confusion');
        },
  },
  lureball: {
    isPokeball: true,
  },
  lustrousorb: {
    fling: {
      basePower: 60,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && user.species.name === 'Palkia' && (move.type === 'Water' || move.type === 'Dragon')) {
                return this.chainModify(1.2);
            }
        },
  },
  luxuryball: {
    isPokeball: true,
  },
  machobrace: {
    ignoreKlutz: true,
    fling: {
      basePower: 60,
    },
    onModifySpe(spe) {
            return this.chainModify(0.5);
        },
  },
  magmarizer: {
    fling: {
      basePower: 80,
    },
  },
  magnet: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Electric') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  magoberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, pokemon.baseMaxhp / 3))
                return false;
        },
    onEat(pokemon) {
            this.heal(pokemon.baseMaxhp / 8);
            if (pokemon.getNature().minus === 'spe') {
                pokemon.addVolatile('confusion');
            }
        },
  },
  magostberry: {
    isBerry: true,
    onEat: false,
  },
  mail: {
    onTakeItem(item, source) {
            if (!this.activeMove)
                return false;
            if (this.activeMove.id !== 'knockoff' && this.activeMove.id !== 'thief' && this.activeMove.id !== 'covet')
                return false;
        },
  },
  masterball: {
    isPokeball: true,
  },
  meadowplate: {
    onPlate: "Grass",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Grass') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Grass",
  },
  mentalherb: {
    fling: {
      basePower: 10,
      effect(pokemon) {
                if (pokemon.removeVolatile('attract')) {
                    this.add('-end', pokemon, 'move: Attract', '[from] item: Mental Herb');
                }
            },
    },
    onUpdate(pokemon) {
            if (pokemon.volatiles['attract'] && pokemon.useItem()) {
                pokemon.removeVolatile('attract');
                this.add('-end', pokemon, 'move: Attract', '[from] item: Mental Herb');
            }
        },
  },
  metalcoat: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Steel') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  metalpowder: {
    fling: {
      basePower: 10,
    },
    onModifyDefPriority: 2,
    onModifyDef(def, pokemon) {
            if (pokemon.species.name === 'Ditto' && !pokemon.transformed) {
                return this.chainModify(2);
            }
        },
  },
  metronome: {
    fling: {
      basePower: 30,
    },
    onStart(pokemon) {
            pokemon.addVolatile('metronome');
        },
    condition: {
      onStart(pokemon) {
                this.effectState.lastMove = '';
                this.effectState.numConsecutive = 0;
            },
      onTryMovePriority: -2,
      onTryMove(pokemon, target, move) {
                if (!pokemon.hasItem('metronome')) {
                    pokemon.removeVolatile('metronome');
                    return;
                }
                if (this.effectState.lastMove === move.id && pokemon.moveLastTurnResult) {
                    this.effectState.numConsecutive++;
                }
                else {
                    this.effectState.numConsecutive = 0;
                }
                this.effectState.lastMove = move.id;
            },
      onModifyDamage: undefined,
      onModifyDamagePhase2(damage, source, target, move) {
                return damage * (1 + (this.effectState.numConsecutive / 10));
            },
    },
  },
  micleberry: {
    isBerry: true,
    onResidual(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 &&
                pokemon.hasAbility('gluttony') && pokemon.abilityState.gluttony)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            pokemon.addVolatile('micleberry');
        },
    condition: {
      duration: 2,
      onSourceAccuracy(accuracy, target, source, move) {
                if (!move.ohko) {
                    this.add('-enditem', source, 'Micle Berry');
                    source.removeVolatile('micleberry');
                    if (typeof accuracy === 'number') {
                        return this.chainModify([4915, 4096]);
                    }
                }
            },
      onSourceModifyAccuracyPriority: 3,
      onSourceModifyAccuracy(accuracy, target, source) {
                this.add('-enditem', source, 'Micle Berry');
                source.removeVolatile('micleberry');
                if (typeof accuracy === 'number') {
                    return accuracy * 1.2;
                }
            },
    },
  },
  mindplate: {
    onPlate: "Psychic",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Psychic') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Psychic",
  },
  mintberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'slp') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'slp') {
                pokemon.cureStatus();
            }
        },
  },
  miracleberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status || pokemon.volatiles['confusion']) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            pokemon.cureStatus();
            pokemon.removeVolatile('confusion');
        },
  },
  miracleseed: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Grass') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  moonball: {
    isPokeball: true,
  },
  moonstone: {
    fling: {
      basePower: 30,
    },
  },
  muscleband: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 16,
    onBasePower(basePower, user, target, move) {
            if (move.category === 'Physical') {
                return this.chainModify([4505, 4096]);
            }
        },
  },
  mysteryberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (!pokemon.hp)
                return;
            const moveSlot = pokemon.lastMove && pokemon.getMoveData(pokemon.lastMove.id);
            if (moveSlot && moveSlot.pp === 0) {
                pokemon.addVolatile('leppaberry');
                pokemon.volatiles['leppaberry'].moveSlot = moveSlot;
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            let moveSlot;
            if (pokemon.volatiles['leppaberry']) {
                moveSlot = pokemon.volatiles['leppaberry'].moveSlot;
                pokemon.removeVolatile('leppaberry');
            }
            else {
                let pp = 99;
                for (const possibleMoveSlot of pokemon.moveSlots) {
                    if (possibleMoveSlot.pp < pp) {
                        moveSlot = possibleMoveSlot;
                        pp = moveSlot.pp;
                    }
                }
            }
            moveSlot.pp += 5;
            if (moveSlot.pp > moveSlot.maxpp)
                moveSlot.pp = moveSlot.maxpp;
            this.add('-activate', pokemon, 'item: Mystery Berry', moveSlot.move);
        },
  },
  mysticwater: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Water') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  nanabberry: {
    isBerry: true,
    onEat: false,
  },
  nestball: {
    isPokeball: true,
  },
  netball: {
    isPokeball: true,
  },
  nevermeltice: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Ice') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  nomelberry: {
    isBerry: true,
    onEat: false,
  },
  occaberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Fire' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  oddincense: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Psychic') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  oldamber: {
    fling: {
      basePower: 100,
    },
  },
  oranberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, 10))
                return false;
        },
    onEat(pokemon) {
            this.heal(10);
        },
  },
  ovalstone: {
    fling: {
      basePower: 80,
    },
  },
  pamtreberry: {
    isBerry: true,
    onEat: false,
  },
  parkball: {
    isPokeball: true,
  },
  passhoberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Water' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  payapaberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Psychic' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  pechaberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'psn' || pokemon.status === 'tox') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'psn' || pokemon.status === 'tox') {
                pokemon.cureStatus();
            }
        },
  },
  persimberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.volatiles['confusion']) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            pokemon.removeVolatile('confusion');
        },
  },
  petayaberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 &&
                pokemon.hasAbility('gluttony') && pokemon.abilityState.gluttony)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            this.boost({ spa: 1 });
        },
  },
  pinapberry: {
    isBerry: true,
    onEat: false,
  },
  pinkbow: {
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Normal') {
                return basePower * 1.1;
            }
        },
  },
  poisonbarb: {
    fling: {
      basePower: 70,
      status: "psn",
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Poison') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  pokeball: {
    isPokeball: true,
  },
  polkadotbow: {
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Normal') {
                return basePower * 1.1;
            }
        },
  },
  pomegberry: {
    isBerry: true,
    onEat: false,
  },
  poweranklet: {
    ignoreKlutz: true,
    fling: {
      basePower: 70,
    },
    onModifySpe(spe) {
            return this.chainModify(0.5);
        },
  },
  powerband: {
    ignoreKlutz: true,
    fling: {
      basePower: 70,
    },
    onModifySpe(spe) {
            return this.chainModify(0.5);
        },
  },
  powerbelt: {
    ignoreKlutz: true,
    fling: {
      basePower: 70,
    },
    onModifySpe(spe) {
            return this.chainModify(0.5);
        },
  },
  powerbracer: {
    ignoreKlutz: true,
    fling: {
      basePower: 70,
    },
    onModifySpe(spe) {
            return this.chainModify(0.5);
        },
  },
  powerherb: {
    onChargeMove(pokemon, target, move) {
            if (pokemon.useItem()) {
                this.debug('power herb - remove charge turn for ' + move.id);
                this.attrLastMove('[still]');
                this.addMove('-anim', pokemon, move.name, target);
                return false; // skip charge turn
            }
        },
    fling: {
      basePower: 10,
    },
  },
  powerlens: {
    ignoreKlutz: true,
    fling: {
      basePower: 70,
    },
    onModifySpe(spe) {
            return this.chainModify(0.5);
        },
  },
  powerweight: {
    ignoreKlutz: true,
    fling: {
      basePower: 70,
    },
    onModifySpe(spe) {
            return this.chainModify(0.5);
        },
  },
  premierball: {
    isPokeball: true,
  },
  protector: {
    fling: {
      basePower: 80,
    },
  },
  przcureberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'par') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'par') {
                pokemon.cureStatus();
            }
        },
  },
  psncureberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'psn' || pokemon.status === 'tox') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'psn' || pokemon.status === 'tox') {
                pokemon.cureStatus();
            }
        },
  },
  qualotberry: {
    isBerry: true,
    onEat: false,
  },
  quickball: {
    isPokeball: true,
  },
  quickclaw: {
    onFractionalPriorityPriority: -2,
    onFractionalPriority(priority, pokemon, target, move) {
            if (move.category === "Status" && pokemon.hasAbility("myceliummight"))
                return;
            if (priority <= 0 && this.randomChance(1, 5)) {
                this.add('-activate', pokemon, 'item: Quick Claw');
                return 0.1;
            }
        },
    fling: {
      basePower: 80,
    },
  },
  quickpowder: {
    fling: {
      basePower: 10,
    },
    onModifySpe(spe, pokemon) {
            if (pokemon.species.name === 'Ditto' && !pokemon.transformed) {
                return this.chainModify(2);
            }
        },
  },
  rabutaberry: {
    isBerry: true,
    onEat: false,
  },
  rarebone: {
    fling: {
      basePower: 100,
    },
  },
  rawstberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.status === 'brn') {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            if (pokemon.status === 'brn') {
                pokemon.cureStatus();
            }
        },
  },
  razorclaw: {
    fling: {
      basePower: 80,
    },
    onModifyCritRatio(critRatio) {
            return critRatio + 1;
        },
  },
  razorfang: {
    fling: {
      basePower: 30,
      volatileStatus: "flinch",
    },
    onModifyMovePriority: -1,
    onModifyMove(move) {
            const affectedByRazorFang = [
                'aerialace', 'aeroblast', 'aircutter', 'airslash', 'aquajet', 'aquatail', 'armthrust', 'assurance', 'attackorder', 'aurasphere', 'avalanche', 'barrage', 'beatup', 'bide', 'bind', 'blastburn', 'bonerush', 'bonemerang', 'bounce', 'bravebird', 'brickbreak', 'brine', 'bugbite', 'bulletpunch', 'bulletseed', 'chargebeam', 'clamp', 'closecombat', 'cometpunch', 'crabhammer', 'crosschop', 'crosspoison', 'crushgrip', 'cut', 'darkpulse', 'dig', 'discharge', 'dive', 'doublehit', 'doublekick', 'doubleslap', 'doubleedge', 'dracometeor', 'dragonbreath', 'dragonclaw', 'dragonpulse', 'dragonrage', 'dragonrush', 'drainpunch', 'drillpeck', 'earthpower', 'earthquake', 'eggbomb', 'endeavor', 'eruption', 'explosion', 'extremespeed', 'falseswipe', 'feintattack', 'firefang', 'firespin', 'flail', 'flashcannon', 'fly', 'forcepalm', 'frenzyplant', 'frustration', 'furyattack', 'furycutter', 'furyswipes', 'gigaimpact', 'grassknot', 'gunkshot', 'gust', 'gyroball', 'hammerarm', 'headsmash', 'hiddenpower', 'highjumpkick', 'hornattack', 'hydrocannon', 'hydropump', 'hyperbeam', 'iceball', 'icefang', 'iceshard', 'iciclespear', 'ironhead', 'judgment', 'jumpkick', 'karatechop', 'lastresort', 'lavaplume', 'leafblade', 'leafstorm', 'lowkick', 'machpunch', 'magicalleaf', 'magmastorm', 'magnetbomb', 'magnitude', 'megakick', 'megapunch', 'megahorn', 'meteormash', 'mirrorshot', 'mudbomb', 'mudshot', 'muddywater', 'nightshade', 'nightslash', 'ominouswind', 'outrage', 'overheat', 'payday', 'payback', 'peck', 'petaldance', 'pinmissile', 'pluck', 'poisonjab', 'poisontail', 'pound', 'powergem', 'powerwhip', 'psychoboost', 'psychocut', 'psywave', 'punishment', 'quickattack', 'rage', 'rapidspin', 'razorleaf', 'razorwind', 'return', 'revenge', 'reversal', 'roaroftime', 'rockblast', 'rockclimb', 'rockthrow', 'rockwrecker', 'rollingkick', 'rollout', 'sandtomb', 'scratch', 'seedbomb', 'seedflare', 'seismictoss', 'selfdestruct', 'shadowclaw', 'shadowforce', 'shadowpunch', 'shadowsneak', 'shockwave', 'signalbeam', 'silverwind', 'skullbash', 'skyattack', 'skyuppercut', 'slam', 'slash', 'snore', 'solarbeam', 'sonicboom', 'spacialrend', 'spikecannon', 'spitup', 'steelwing', 'stoneedge', 'strength', 'struggle', 'submission', 'suckerpunch', 'surf', 'swift', 'tackle', 'takedown', 'thrash', 'thunderfang', 'triplekick', 'trumpcard', 'twister', 'uturn', 'uproar', 'vacuumwave', 'visegrip', 'vinewhip', 'vitalthrow', 'volttackle', 'wakeupslap', 'watergun', 'waterpulse', 'waterfall', 'weatherball', 'whirlpool', 'wingattack', 'woodhammer', 'wrap', 'wringout', 'xscissor', 'zenheadbutt',
            ];
            if (affectedByRazorFang.includes(move.id)) {
                if (!move.secondaries)
                    move.secondaries = [];
                move.secondaries.push({
                    chance: 10,
                    volatileStatus: 'flinch',
                });
            }
        },
  },
  razzberry: {
    isBerry: true,
    onEat: false,
  },
  reapercloth: {
    fling: {
      basePower: 10,
    },
  },
  repeatball: {
    isPokeball: true,
  },
  rindoberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Grass' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  rockincense: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Rock') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  rootfossil: {
    fling: {
      basePower: 100,
    },
  },
  roseincense: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Grass') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  rowapberry: {
    isBerry: true,
    onDamagingHit(damage, target, source, move) {
            if (move.category === 'Special' && !source.hasAbility('magicguard')) {
                if (target.eatItem()) {
                    this.damage(source.baseMaxhp / 8, source, target, null, true);
                }
            }
        },
    onEat() { },
  },
  safariball: {
    isPokeball: true,
  },
  salacberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 &&
                pokemon.hasAbility('gluttony') && pokemon.abilityState.gluttony)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            this.boost({ spe: 1 });
        },
  },
  scopelens: {
    fling: {
      basePower: 30,
    },
    onModifyCritRatio(critRatio) {
            return critRatio + 1;
        },
  },
  seaincense: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Water') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  sharpbeak: {
    fling: {
      basePower: 50,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move && move.type === 'Flying') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  shedshell: {
    fling: {
      basePower: 10,
    },
    onTrapPokemonPriority: -10,
    onTrapPokemon(pokemon) {
            pokemon.trapped = false;
        },
    onMaybeTrapPokemonPriority: -10,
    onMaybeTrapPokemon(pokemon) {
            pokemon.maybeTrapped = false;
        },
  },
  shellbell: {
    fling: {
      basePower: 30,
    },
    onAfterMoveSecondarySelfPriority: -1,
    onAfterMoveSecondarySelf(pokemon, target, move) {
            if (move.totalDamage && !pokemon.forceSwitchFlag) {
                this.heal(move.totalDamage / 8, pokemon);
            }
        },
  },
  shinystone: {
    fling: {
      basePower: 80,
    },
  },
  shucaberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Ground' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  silkscarf: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Normal') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  silverpowder: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Bug') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  sitrusberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, pokemon.baseMaxhp / 4))
                return false;
        },
    onEat(pokemon) {
            this.heal(pokemon.baseMaxhp / 4);
        },
  },
  skullfossil: {
    fling: {
      basePower: 100,
    },
  },
  skyplate: {
    onPlate: "Flying",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Flying') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Flying",
  },
  smoothrock: {
    fling: {
      basePower: 10,
    },
  },
  softsand: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Ground') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  souldew: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onModifySpAPriority: 1,
    onModifySpA(spa, pokemon) {
            if (pokemon.baseSpecies.num === 380 || pokemon.baseSpecies.num === 381) {
                return this.chainModify(1.5);
            }
        },
    onModifySpDPriority: 2,
    onModifySpD(spd, pokemon) {
            if (pokemon.baseSpecies.num === 380 || pokemon.baseSpecies.num === 381) {
                return this.chainModify(1.5);
            }
        },
  },
  spelltag: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Ghost') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  spelonberry: {
    isBerry: true,
    onEat: false,
  },
  splashplate: {
    onPlate: "Water",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Water') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Water",
  },
  spookyplate: {
    onPlate: "Ghost",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Ghost') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Ghost",
  },
  sportball: {
    isPokeball: true,
  },
  starfberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 4 || (pokemon.hp <= pokemon.maxhp / 2 &&
                pokemon.hasAbility('gluttony') && pokemon.abilityState.gluttony)) {
                pokemon.eatItem();
            }
        },
    onEat(pokemon) {
            const stats = [];
            let stat;
            for (stat in pokemon.boosts) {
                if (stat !== 'accuracy' && stat !== 'evasion' && pokemon.boosts[stat] < 6) {
                    stats.push(stat);
                }
            }
            if (stats.length) {
                const randomStat = this.sample(stats);
                const boost = {};
                boost[randomStat] = 2;
                this.boost(boost);
            }
        },
  },
  stick: {
    fling: {
      basePower: 60,
    },
    onModifyCritRatio(critRatio, user) {
            if (user.species.id === 'farfetchd') {
                return critRatio + 2;
            }
        },
  },
  stickybarb: {
    fling: {
      basePower: 80,
    },
    onResidualOrder: 10,
    onResidualSubOrder: 20,
    onResidual(pokemon) {
            this.damage(pokemon.baseMaxhp / 8);
        },
    onHit(target, source, move) {
            if (source && source !== target && !source.item && move && this.checkMoveMakesContact(move, source, target)) {
                const barb = target.takeItem();
                if (!barb)
                    return; // Gen 4 Multitype
                source.setItem(barb);
                // no message for Sticky Barb changing hands
            }
        },
  },
  stoneplate: {
    onPlate: "Rock",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Rock') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Rock",
  },
  sunstone: {
    fling: {
      basePower: 30,
    },
  },
  tamatoberry: {
    isBerry: true,
    onEat: false,
  },
  tangaberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Bug' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  thickclub: {
    fling: {
      basePower: 90,
    },
    onModifyAtkPriority: 1,
    onModifyAtk(atk, pokemon) {
            if (pokemon.species.name === 'Cubone' || pokemon.species.name === 'Marowak') {
                return this.chainModify(2);
            }
        },
  },
  thunderstone: {
    fling: {
      basePower: 30,
    },
  },
  timerball: {
    isPokeball: true,
  },
  toxicorb: {
    fling: {
      basePower: 30,
      status: "tox",
    },
    onResidualOrder: 10,
    onResidualSubOrder: 20,
    onResidual(pokemon) {
            pokemon.trySetStatus('tox', pokemon);
        },
  },
  toxicplate: {
    onPlate: "Poison",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Poison') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Poison",
  },
  twistedspoon: {
    fling: {
      basePower: 30,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Psychic') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  ultraball: {
    isPokeball: true,
  },
  upgrade: {
    fling: {
      basePower: 30,
    },
  },
  wacanberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Electric' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  waterstone: {
    fling: {
      basePower: 30,
    },
  },
  watmelberry: {
    isBerry: true,
    onEat: false,
  },
  waveincense: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Water') {
                return this.chainModify([4915, 4096]);
            }
        },
  },
  wepearberry: {
    isBerry: true,
    onEat: false,
  },
  whiteherb: {
    fling: {
      basePower: 10,
      effect(pokemon) {
                let activate = false;
                const boosts = {};
                let i;
                for (i in pokemon.boosts) {
                    if (pokemon.boosts[i] < 0) {
                        activate = true;
                        boosts[i] = 0;
                    }
                }
                if (activate) {
                    pokemon.setBoost(boosts);
                    this.add('-clearnegativeboost', pokemon, '[silent]');
                }
            },
    },
    onStart(pokemon) {
            this.effectState.boosts = {};
            let ready = false;
            let i;
            for (i in pokemon.boosts) {
                if (pokemon.boosts[i] < 0) {
                    ready = true;
                    this.effectState.boosts[i] = 0;
                }
            }
            if (ready)
                this.effectState.target.useItem();
            delete this.effectState.boosts;
        },
    onAnySwitchInPriority: -2,
    onAnySwitchIn() {
            this.effect.onStart.call(this, this.effectState.target);
        },
    onAnyAfterMega() {
            this.effect.onStart.call(this, this.effectState.target);
        },
    onAnyAfterMove() {
            this.effect.onStart.call(this, this.effectState.target);
        },
    onResidualOrder: 29,
    onResidual(pokemon) {
            this.effect.onStart.call(this, pokemon);
        },
    onUse(pokemon) {
            pokemon.setBoost(this.effectState.boosts);
            this.add('-clearnegativeboost', pokemon, '[silent]');
        },
  },
  widelens: {
    fling: {
      basePower: 10,
    },
    onSourceModifyAccuracyPriority: 4,
    onSourceModifyAccuracy(accuracy) {
            if (typeof accuracy === 'number') {
                return accuracy * 1.1;
            }
        },
  },
  wikiberry: {
    isBerry: true,
    onUpdate(pokemon) {
            if (pokemon.hp <= pokemon.maxhp / 2) {
                pokemon.eatItem();
            }
        },
    onTryEatItem(item, pokemon) {
            if (!this.runEvent('TryHeal', pokemon, null, this.effect, pokemon.baseMaxhp / 3))
                return false;
        },
    onEat(pokemon) {
            this.heal(pokemon.baseMaxhp / 8);
            if (pokemon.getNature().minus === 'spa') {
                pokemon.addVolatile('confusion');
            }
        },
  },
  wiseglasses: {
    fling: {
      basePower: 10,
    },
    onBasePowerPriority: 16,
    onBasePower(basePower, user, target, move) {
            if (move.category === 'Special') {
                return this.chainModify([4505, 4096]);
            }
        },
  },
  yacheberry: {
    isBerry: true,
    onSourceModifyDamage(damage, source, target, move) {
            if (move.type === 'Ice' && target.getMoveHitData(move).typeMod > 0) {
                const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
                if (hitSub)
                    return;
                if (target.eatItem()) {
                    this.debug('-50% reduction');
                    this.add('-enditem', target, this.effect, '[weaken]');
                    return this.chainModify(0.5);
                }
            }
        },
    onEat() { },
  },
  zapplate: {
    onPlate: "Electric",
    onBasePowerPriority: 15,
    onBasePower(basePower, user, target, move) {
            if (move.type === 'Electric') {
                return this.chainModify([4915, 4096]);
            }
        },
    onTakeItem: true,
    forcedForme: "Arceus-Electric",
  },
  zoomlens: {
    fling: {
      basePower: 10,
    },
    onSourceModifyAccuracyPriority: 4,
    onSourceModifyAccuracy(accuracy, target) {
            if (typeof accuracy === 'number' && !this.queue.willMove(target)) {
                this.debug('Zoom Lens boosting accuracy');
                return accuracy * 1.2;
            }
        },
  },
}
