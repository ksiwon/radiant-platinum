# Castle / Arcade rules from decomp (agent report 2026-09-28, raw/decomp relative)

## Castle
- 7 battles/round, silver 21 gold 49, party 3 (multi 2), CASTLE_MAX_LEVEL 50 (battle_frontier.h:46-60)
- Player mons: >50 → exp set to Lv50, recalc; held items stripped & restored (overlay104/battle_castle.c:111-131). Opponents Lv50 (battle_castle_helpers.c:234-237)
- CP: new streak resets CP/spent/ranks (0/0/1) (battle_castle.c:84-89); +10 CP at challenge start (:99); cap 9999 (:553)
- CP per battle (battle_castle.c:451-547): +3 per survivor; survivor HP: full +3, >=50% +2, <50% +1; +1 per survivor w/o status; PP used ≤5 +8, ≤10 +6, ≤15 +4; +7 per opponent raised +5 lvl; min 1
- Spent CP stat capped 9999 (helpers:373)
- Self app (applications/frontier/battle_castle/self_app.c): heal HP 10 (rank1) PP 8 (rank2) all 12 (rank3) (446-457); rank-up costs healing 100/100, rentals 100/150, summary 50/50, max rank 3 (460-464); rentals berries rank1, items rank2 (2366-2371); berry list 8/8/32 (253), item list 12/12/27 (247); item prices 5-20 CP (147-175), berries 2 CP first six, 5 CP rest (212-245)
- Opponent app (opponent_app.c): costs check 1, level+5 1, level-5 15, stats 2, moves 5, rank up 50 (66-71); levels 45/50/55 via exp (2685-2720); rank1 stats, rank2 moves (765-790)
- Pass not offered vs Brain (frontier_scripts_battle_castle.s:804-808); block 948-981 checks ≥50 CP and spends 50 (unconfirmed = pass)
- Overlay battle_castle_app (main.lsf:1593)
- Trainers: pl_btdtr pools, same as Arcade (helpers:36-79); Darach at 21/49 singles (53-62); AI rounds1-2 none, 3-4 basic, else full; Darach full (292-316)
- BP (battle_castle.c:709-730) solo {0,3,3,4,4,5,5,7,7}; brain 21/49 → 20
- Save BattleCastleSave (include/battle_castle_save.h:18-31); CP/spent/ranks in frontier stats
- No heal between battles: fainted → 1 HP, status cured (helpers:244)

## Arcade
- 7/round, silver 21 gold 49, max lv 50 (battle_frontier.h:62-111)
- Effects 0-31: 0-8 foe (LOWER_FOE_HP, POISON/PARALYZE/BURN/SLEEP/FREEZE_FOE, FOE_GET_BERRY, FOE_GET_ITEM, FOE_LEVEL_UP); 9-17 same for ally; 18-26 env (SUNNY, RAINY, SANDY, HAIL, FOGGY, TRICK_ROOM, SPEED_UP, SLOW_DOWN, RANDOMIZE_CURSOR); 27-31 bonus (SWAP_MONS, GET_1_BP, NO_BATTLE, NO_EVENT, GET_3_BP). category fn battle_arcade_helpers.c:350-363
- Board 4x4 (applications/frontier/battle_arcade/main.c:55-57); availability by round (93-130); per-battle limits (137-145): swap/speed/slow/randomize never battle 7; 1BP battles 1/3/5; no-battle & 3BP battles 2/4/6
- Category weights by tier Foe/Ally/Env/Bonus (157-163): t0 {15,15,40,30} t1 {35,20,30,15} t2 {30,30,35,5} t3 {25,40,30,5} t4 {10,75,10,5}; tier from last performance ≥21 t0, ≥16 t1, ≥10 t2, ≥5 t3, else t4 (165-170, 1335-1340); tile picks category by weight then random effect (1355-1435)
- Performance (overlay104/battle_arcade.c:553-628): statused count {8,6,4,0,0}; fainted {6,4,2,0,0}; turns <3 +10, <5 +6, <7 +4, <9 +2
- Cursor frames per step by speed 0-7 {20,16,8,4,3,2,1,0} (main.c:81); start 3, round≥4 → 4, round≥7 → 5 (battle_arcade.c:234-241,266,342-355); speed up/down ±1 clamp (1283-1295)
- Effects (battle_arcade.c:1028-1318): lower HP → maxHP−20%; statuses skip immune from random slot; sleep 2-5 blocked by Insomnia/Vital Spirit; freeze blocked by Ice/Magma Armor; all immune → flag; berry/item same random item to whole party from 3 tiered pools (rounds 0-2,3-5,6+; 890-990); level up +3; weather/trick room via arcade->weather → battleDTO->fieldWeather (helpers:151); swap parties (helpers:156-159); 1/3 BP via GiveBattlePoints (helpers:45-47,285-306); no battle → script _1FFC (frontier_scripts_battle_arcade.s:1281,2220); effect bg battle_arcade.c:631-655
- Dahlia at 21/49 singles (helpers:48-60)
- BP (battle_arcade.c:1321-1348) solo {0,2,2,2,2,4,4,5,6}; brain → 20
- Save include/battle_arcade_save.h

## Frontier script commands
- include/data/scripts/frscrcmd.h Castle 88-90,159-177; Arcade 192-205; function ids include/constants/battle_castle_functions.h, battle_arcade_functions.h
- Lobby field: Castle ScrCmd_2D2(0-4)/2D3/2D4/2D5 (src/unk_0204FAB4.c, scrcmd.c:2657); Arcade 2D9-2DC (src/unk_0205003C.c, scrcmd.c:2691)

## Tower/Hall (earlier agent)
- Tower: CallBattleTowerFunction 62 sites, InitBattleTower 8, SetBattleTowerNull 3, FreeBattleTower 2, MessageSeenBanlistSpecies 3, JudgeStats, OpenBattleTowerRecordsApp; Wi-Fi stubs 1DF/1E0/1E3/1E4/1E1/1E2/GetCurNetID → 0; unk_02049D08.c party size 3/4/2 (:55) eligibility (:161) dup check (:449) BP 3,3,4,4,5,5,7 Palmer 20 (:750-788) IVs by trainer id (:1032); unk_0204AEE8.c ranges, Palmer 21/49 (:229-279), partner draw (:423). Salon partners BT_PARTNER_CHERYL..BUCK (battle_tower.h:8-13), teams FRONTIER_TRAINER_TRAINER_CHERYL_CHERYL+id (unk_02049D08.c:362-367), mode MULTI ≠ LINK_MULTI, salon gating flags (scripts_battle_tower_battle_salon.s:18-50)
- Hall: 9 BattleHall* cmds; needs battle/b_pl_stage/pl_bsdpm.narc (battle_hall_helpers.c:1393) not extracted (both bakers); classes by rank/type (:42,:145), species/type lists (:168-1128), IVs 8-26 by rank (:1129); level formula fx32 (battle_hall.c:426-488), BP (:342), rank nibbles 17×10 (:368-423); 10/round, silver 50 gold 170, one mon; battle_hall_win_records.c
- Reuse: battleStore.ts:456 rentalParty, :826 startFactory; factoryMon.ts:94 createFactoryMon; factoryTables.ts:44 TRAINER_RANGES; factory.ts:186-228; records.ts:62-95; factoryStore.ts:268 addBattlePoints; data/frontier.json 315 trainers; commands.ts:5505-5536 records machine; fieldServices.ts:1298-1306 openScene only scene 3; factoryStore.ts:153-306
- Missing shared: multi-select party menu with order; banlist; per-facility save; quit-without-save hooks (2C5, 2D5, 2DC, DeleteActiveBattleHallStreak). Factory still hits unimplemented ScrCmd_2C5 (scripts_battle_factory.s:419)
- Arcade blocker: weather/fog/trick room at battle start hook — none in sim/bridge.ts, sim/controller.ts; Gen4 fog not in sim

## Tower detail (agent 2)
- Modes generated/battle_tower_modes.txt: 0 SINGLE 1 DOUBLE 2 MULTI(NPC) 3 LINK_MULTI 4 WIFI 5 downloaded rooms (no BP/records, unk_02049D08.c:596,757) 6 WFC link multi. Party size unk_02049D08.c:53. 7 per round (BattleTower_HasDefeatedSevenTrainers :526)
- Trainers unk_0204AEE8.c:251; ranges :229 (1-6), boss :240 (7th); 8 rooms, ≥7 reuse row 7; Palmer singles room2 7th SILVER (21), room6 7th GOLD (49); frontier_scripts_battle_tower_battle_room.s:376-379 wins==20/48, SET_BEAT_PALMER 1/2 (:585,608); sub_0204A4C8 (unk_02049D08.c:491) 7 or 14 ids no repeats; data pl_btdtr / pl_btdpm (res/trainers/frontier/data 315, pokemon 951 sets); IVs by id band :1032
- Set selection sub_0204B470 (unk_0204AEE8.c:423): no dup species, excluded list (player species / first opponent in multi); dup items rejected first 50 tries then fallback {BrightPowder, Lum Berry, Leftovers, Quick Claw} (:303); PID reroll until nature match & not shiny; EVs 510/flagged (:310); parties ov104_022394A4.c:19
- Level: FieldBattleDTO_NewBattleTower (ov104_0223A0C4.c:890) scale >50 down to 50; battle types ~:960 MULTI = BATTLE_TYPE_FRONTIER_WITH_AI_PARTNER
- Eligibility sub_02049EC4 (unk_02049D08.c:161); banlist 18 (pokemon.c:4995); dup check :449 (1 species, 2 item)
- BP unk_02049D08.c:750 solo {0,3,3,4,4,5,5,7} then 7; Palmer 20
- Save: STAT_TOWER_RECORD/LATEST_STREAK (battle_frontier_stats.h:5-14) mode*2 / mode*2+1; WifiBattleTowerSave in struct_defs/wifi_battle_tower_data.h:45-96
- Salon: lobby "communicate with friend?" No → InitBattleTower 0, MULTI (scripts_battle_tower.s:688-698) heal, save, elevator to salon; BT_FUNC_UNK_56 (salon.s:101) → sub_0204A97C (unk_02049D08.c:728) builds 5 partner parties random from FRONTIER_TRAINER_TRAINER_CHERYL_CHERYL+id (300-304) excluding player species/items; preview GetBattleTowerPartnerSpeciesAndMove (unk_020494DC.c:202); Yes → BT_FUNC_SET_PARTNER_ID (salon.s:176,204,232,259,286); set ids/PIDs saved (unk_02049D08.c:367-371,720-725); gfx list unk_020494DC.c:357
- Scenes: elevator launches FRONTIER_SCENE_TOWER_CORRIDOR / MULTI_CORRIDOR (scripts_battle_tower_elevator.s:49,58,143); logic in frontier_scripts_battle_tower_*.s + FrontierScrCmd_CallBattleTowerFunction (frscrcmd_battle_tower.c:39); field battle_room maps are leftovers (would GF_ASSERT)
- Lobby CallBattleTowerFunction ids: 1,2,3,4,5,6,9,10,11,12,14,15,16,30,31,32,35,39,43,45,48,49,51,52,53,54,57,58,100; salon 50,55,56; elevator 43 (include/constants/battle_tower_functions.h)

## Hall detail (agent 2)
- Singles 1 mon, doubles 2 same species, multi link-only (scripts_battle_hall.s:310-353). Eligibility CheckPartyIsBattleHallEligible (scrcmd_battle_hall.c:130) Lv≥30, no eggs, not banned
- Type select overlay battle_hall_app (applications/frontier/battle_hall/main.c; frscrcmd_battle_hall.c:79); 17 types (helpers:1510); result battle_hall.c:175; max rank 10, 10 battles/round; all 17 at 10 → held at 9 (:405)
- Opponent BattleHall_PickNextOpponentPokemon (helpers:1247) pool :649 + type table :168, 1-based into pl_bsdpm; groups start 1,155,271,376 (:24-27); ranges by rank :1227; must match type, not player's species, not already fought; Argenta silver = player's group, gold = group 4; Argenta rank = level/10 (:1543); IVs {8..26} :1129, Argenta 31 (:1478); AI flags :1557
- Level BattleHall_CalcOpponentsLevel (battle_hall.c:432): ceil(L − 3√L + r·L/(5√L) + 0.5(n−1)), n = types with rank>0 incl selected; cap L and 100; if L/(5√L)<1 rank term = r
- Argenta singles streak 50 / 170 (helpers:1166)
- BP battle_hall.c:339 solo/double {0,1,1,1,2,2,2,3,3,3,4,4,6,6,8,8,10,10,12}; Argenta 20; record keeper milestone BP (scrcmd_battle_hall.c:409)
- Save BattleHallWinRecords u16[MAX_SPECIES] cap 9999; BattleHallSave (battle_hall_save.h:15); ranks nibble pairs STAT_HALL_CURRENT_RANKS_* (battle_hall.c:370)
- Lobby cmds: CallBattleHallLobbyFunction 0-4; GetBattleHallSelectedSlots, CheckBattleHallPartnerUsesDifferentSpecies, DeleteActiveBattleHallStreak, GetBattleHallRecordKeeperStats, GetNumSpeciesWithBattleHallRecords, GetBattleHallTotalSinglesRecord, CheckIfBattleHallStreakIs50
