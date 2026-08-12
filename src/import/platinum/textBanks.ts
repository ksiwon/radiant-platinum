// 텍스트 뱅크 자리 찾기 (DATA.md §2.11 · COPYRIGHT.md §6)
//
// pl_msg.narc의 뱅크 순서는 지역마다 다르다 (us 724 / ko 714 / ja 709개). 인덱스를
// 코드에 박으면 로케일을 바꾸는 순간 엉뚱한 글이 나온다. 그래서 **이름으로 부르고
// 자리는 사용자의 롬에서 계산한다.**
//
// ⚠️ **여기에는 롬에서 읽은 값이 하나도 없다.** 예전에는 `src/data/textBanks.json`이
// 뱅크 724개의 **암호화 키(u16)** 와 로케일별 인덱스·엔트리 수를 통째로 들고 있었다.
// 그건 사용자 롬에서 읽은 정확한 값이라 공개 저장소에 둘 것이 아니다 — 지웠다.
//
// 남은 것은 셋뿐이고 전부 **이름**이다:
//
//   ① `BANK_ORDER` — 디컴프 `generated/text_banks.txt`의 줄 순서 그대로인 식별자
//      목록. us 롬의 뱅크 순서가 이 순서다. 줄 번호가 곧 인덱스라 숫자가 없다
//   ② `KO_ABSENT`·`JA_ABSENT` — CJK 롬에 아예 없는 뱅크 이름
//   ③ `INSERTED_BEFORE` — CJK 롬이 자기 뱅크를 하나 끼워 넣는 자리의 이름
//
// 이 셋으로 로케일별 인덱스를 **계산**한다. 계산이 맞는지는 사용자의 롬이 직접
// 답한다 — `readBankLayout`이 narc의 실제 뱅크 수와 대조하고 어긋나면 던진다.
// 값을 저장하지 않으므로 표가 낡을 일도 없다.

/** 우리가 다루는 세 지역판 */
export type Locale = 'us' | 'ko' | 'ja'

export const LOCALES: readonly Locale[] = ['us', 'ko', 'ja']

/** 글 뱅크가 들어 있는 NARC */
export const MSG_NARC = '/msgdata/pl_msg.narc'

/**
 * us 롬의 뱅크 순서. **자리 = 배열 인덱스**다.
 *
 * 디컴프가 빌드 때 만드는 `generated/text_banks.txt`의 줄 순서고, us 롬의 narc
 * 순서가 정확히 그것이다. 이름만 있고 숫자가 없는 것이 요점이다
 */
export const BANK_ORDER: readonly string[] = [
  'moves_used_in_battle', 'diploma', 'battle_bag', 'battle_party', 'unk_0004', 'unk_0005',
  'unk_0006', 'bag', 'unk_0008', 'unk_0009', 'unk_0010', 'communication_club', 'ball_seal_names',
  'ball_seal_names_plural', 'main_menu_alerts', 'unk_0015', 'battle_frontier_records',
  'bg_events', 'pokemon_storage_system', 'box_messages', 'unk_0020', 'frontier_trainer_names',
  'battle_tower_records_app', 'jubilife_city', 'jubilife_city_mart',
  'unused_jubilife_city_house_1', 'jubilife_city_pokecenter_1f', 'poketch_co_1f', 'poketch_co_2f',
  'poketch_co_3f', 'jubilife_tv_1f', 'jubilife_tv_2f', 'jubilife_tv_3f', 'jubilife_tv_4f',
  'jubilife_tv_2f_gallery', 'jubilife_tv_3f_global_ranking_room',
  'jubilife_tv_3f_group_ranking_room', 'jubilife_tv_elevator', 'jubilife_city_south_house_1f',
  'jubilife_city_south_house_2f', 'unused_jubilife_city_south_house_3f',
  'unused_jubilife_city_house_2', 'jubilife_city_condominiums_1f',
  'jubilife_city_condominiums_2f', 'unused_jubilife_city_condominiums_3f',
  'unused_jubilife_city_condominiums_4f', 'global_terminal_1f', 'global_terminal_2f',
  'global_terminal_3f', 'trainers_school', 'jubilife_city_southwest_house_1f',
  'jubilife_city_southwest_house_2f', 'unused_jubilife_city_house_3',
  'unused_jubilife_city_house_4', 'canalave_city', 'canalave_city_mart', 'canalave_city_gym',
  'canalave_city_pokecenter_1f', 'canalave_library_1f', 'canalave_library_2f',
  'canalave_library_3f', 'canalave_city_southeast_house', 'canalave_city_east_house',
  'canalave_city_harbor_inn', 'canalave_city_sailor_eldritch_house', 'oreburgh_city',
  'oreburgh_city_mart', 'oreburgh_city_gym', 'oreburgh_city_pokecenter_1f',
  'oreburgh_city_pokecenter_b1f', 'oreburgh_city_northwest_house_1f',
  'oreburgh_city_northwest_house_2f', 'unused_oreburgh_city_northwest_house_3f',
  'unused_oreburgh_city_northwest_house_4f', 'oreburgh_city_north_house_1f',
  'oreburgh_city_north_house_2f', 'unused_oreburgh_city_north_house_3f',
  'unused_oreburgh_city_north_house_4f', 'oreburgh_city_middle_house', 'mining_museum',
  'oreburgh_city_west_house', 'oreburgh_city_east_house_1f', 'oreburgh_city_east_house_2f',
  'unused_oreburgh_city_east_house_3f', 'oreburgh_city_south_house', 'eterna_city',
  'eterna_city_mart', 'eterna_city_gym', 'eterna_city_dp_gym', 'eterna_city_pokecenter_1f',
  'eterna_city_pokecenter_2f', 'cycle_shop', 'team_galactic_eterna_building_1f',
  'team_galactic_eterna_building_2f', 'team_galactic_eterna_building_3f',
  'team_galactic_eterna_building_4f', 'rotoms_room', 'eterna_city_condominiums_1f',
  'eterna_city_condominiums_2f', 'eterna_city_condominiums_3f',
  'unused_eterna_city_condominiums_4f', 'route_206_cycling_road_north_gate',
  'eterna_city_herb_shop', 'eterna_city_south_house', 'eterna_city_east_house',
  'eterna_city_underground_man_house', 'hearthome_city', 'hearthome_city_mart',
  'hearthome_city_gym_entrance_room', 'hearthome_city_gym_leader_room',
  'hearthome_city_dp_gym_elevator_room_1', 'hearthome_city_dp_gym_elevator_room_2',
  'hearthome_city_dp_gym_leader_room', 'hearthome_city_pokecenter_1f',
  'hearthome_city_southeast_house_1f', 'hearthome_city_southeast_house_2f',
  'hearthome_city_southeast_house_elevator', 'hearthome_city_pokemon_fan_club',
  'hearthome_city_west_gate_to_amity_square', 'hearthome_city_east_gate_to_amity_square',
  'route_208_gate_to_hearthome_city', 'route_209_gate_to_hearthome_city',
  'route_212_gate_to_hearthome_city', 'hearthome_city_northeast_house_1f',
  'hearthome_city_northeast_house_2f', 'hearthome_city_northeast_house_elevator',
  'hearthome_city_northwest_house', 'poffin_house', 'contest_hall_lobby',
  'contest_hall_stage_no_contest', 'foreign_building', 'pastoria_city', 'pastoria_city_mart',
  'pastoria_city_gym', 'pastoria_city_pokecenter_1f', 'pastoria_city_pokecenter_2f',
  'pastoria_city_observatory_gate_1f', 'pastoria_city_observatory_gate_2f',
  'pastoria_city_southwest_house', 'pastoria_city_middle_house', 'pastoria_city_east_house',
  'pastoria_city_north_house', 'pastoria_city_northeast_house', 'veilstone_city',
  'veilstone_city_gym', 'veilstone_city_pokecenter_1f', 'veilstone_city_pokecenter_b1f',
  'game_corner', 'veilstone_store_1f', 'veilstone_store_2f', 'veilstone_store_3f',
  'veilstone_store_4f', 'veilstone_store_5f', 'veilstone_store_elevator', 'veilstone_store_b1f',
  'veilstone_city_galactic_warehouse', 'veilstone_city_prize_exchange',
  'veilstone_city_southeast_house', 'veilstone_city_northwest_house',
  'veilstone_city_northeast_house', 'veilstone_city_southwest_house',
  'route_215_gate_to_veilstone_city', 'sunyshore_city', 'sunyshore_city_mart',
  'sunyshore_city_gym_room_1', 'sunyshore_city_gym_room_3', 'sunyshore_city_pokecenter_1f',
  'sunyshore_market', 'sunyshore_city_northeast_house', 'sunyshore_city_west_house',
  'sunyshore_city_northwest_house', 'unused_sunyshore_city_house_1',
  'unused_sunyshore_city_house_2', 'sunyshore_city_east_house', 'vista_lighthouse',
  'sunyshore_city_east_house_unused', 'snowpoint_city', 'snowpoint_city_mart',
  'snowpoint_city_gym', 'snowpoint_city_pokecenter_1f', 'snowpoint_city_west_house',
  'snowpoint_city_east_house', 'pokemon_league', 'pokemon_league_south_pokecenter_1f',
  'pokemon_league_north_pokecenter_1f', 'pokemon_league_aaron_room', 'pokemon_league_bertha_room',
  'pokemon_league_flint_room', 'pokemon_league_lucian_room', 'pokemon_league_champion_room',
  'pokemon_league_hallway_to_hall_of_fame', 'pokemon_league_hall_of_fame', 'fight_area',
  'fight_area_mart', 'fight_area_pokecenter_1f', 'unused_battle_park_gate_to_fight_area',
  'route_225_gate_to_fight_area', 'fight_area_middle_house', 'fight_area_south_house',
  'battle_castle_self_app', 'battle_castle_scene', 'battle_castle_opponent_app', 'nature_names',
  'pokemon_center_daily_trainers', 'contest_text', 'contest_opponent_names',
  'contest_dance_competition', 'contest_judge_names', 'link_contest_records',
  'contest_visual_competition', 'contest_effects', 'contest_acting_competition', 'unk_0212',
  'common_strings', 'network_errors', 'dummy_0215', 'dummy_0216', 'contest_common',
  'contest_results', 'status_condition_names', 'options_menu', 'pokemon_center_2f_common',
  'oreburgh_mine_b1f', 'oreburgh_mine_b2f', 'valley_windworks_outside',
  'valley_windworks_building', 'eterna_forest_outside', 'eterna_forest',
  'fuego_ironworks_outside', 'fuego_ironworks_building', 'mt_coronet_1f_south', 'mt_coronet_2f',
  'mt_coronet_1f_tunnel_room', 'mt_coronet_1f_north_room_1', 'spear_pillar',
  'spear_pillar_distorted', 'hall_of_origin', 'spear_pillar_dialga', 'spear_pillar_palkia',
  'great_marsh_1_unused', 'great_marsh_1', 'great_marsh_2', 'great_marsh_3', 'great_marsh_4',
  'great_marsh_5', 'great_marsh_6', 'solaceon_ruins_maniac_tunnel_room', 'solaceon_ruins_room_1',
  'solaceon_ruins_room_2', 'solaceon_ruins_room_7', 'victory_road_1f', 'victory_road_1f_room_2',
  'pal_park', 'amity_square', 'unk_0254', 'floaroma_meadow', 'floaroma_meadow_house',
  'oreburgh_gate_1f', 'oreburgh_gate_b1f', 'fullmoon_island', 'fullmoon_island_forest',
  'stark_mountain_outside', 'stark_mountain_room_1', 'stark_mountain_room_2',
  'stark_mountain_room_3', 'sendoff_spring', 'turnback_cave_entrance',
  'turnback_cave_pillar_room', 'turnback_cave_giratina_room', 'flower_paradise',
  'snowpoint_temple_1f', 'snowpoint_temple_b5f', 'wayward_cave_1f', 'ruin_maniac_cave_short',
  'ruin_maniac_cave_long', 'maniac_tunnel', 'iron_island', 'iron_island_b2f_left_room',
  'iron_island_house', 'old_chateau', 'old_chateau_side_rooms',
  'old_chateau_back_middle_west_room', 'galactic_hq_1f', 'galactic_hq_2f', 'galactic_hq_3f',
  'galactic_hq_4f', 'galactic_hq_b1f', 'galactic_hq_b2f', 'galactic_hq_control_room',
  'galactic_hq_laboratory', 'galactic_hq_hall', 'lake_verity_low_water', 'lake_verity',
  'verity_cavern', 'lake_valor_drained', 'lake_valor', 'valor_cavern', 'lake_acuity_low_water',
  'lake_acuity', 'acuity_cavern', 'newmoon_island', 'newmoon_island_forest', 'unused_battle_park',
  'unused_battle_park_exchange_service_corner', 'battle_tower', 'battle_tower_battle_room',
  'battle_tower_multi_battle_room', 'battle_tower_battle_salon', 'battle_frontier',
  'battle_frontier_gate_to_fight_area', 'battle_factory', 'battle_hall', 'battle_castle',
  'battle_arcade', 'distortion_world_1f', 'distortion_world_b1f', 'distortion_world_b2f',
  'distortion_world_b3f', 'distortion_world_b6f', 'distortion_world_b7f',
  'distortion_world_giratina_room', 'distortion_world_turnback_cave_room', 'iron_ruins',
  'iceberg_ruins', 'rock_peak_ruins', 'unk_0325', 'unk_0326', 'unk_0327', 'unk_0328', 'unk_0329',
  'unk_0330', 'unk_0331', 'unk_0332', 'unk_0333', 'unk_0334', 'unk_0335', 'unk_0336', 'unk_0337',
  'unk_0338', 'unk_0339', 'unk_0340', 'unk_0341', 'unk_0342', 'unk_0343', 'unk_0344', 'unk_0345',
  'unk_0346', 'unk_0347', 'unk_0348', 'dummy_0349', 'trade', 'hall_of_fame', 'pc_hall_of_fame',
  'unk_0353', 'unk_0354', 'dummy_0355', 'unk_0356', 'egg_hatch', 'unk_0358', 'unk_0359',
  'unk_0360', 'menu_entries', 'dummy_0362', 'battle_factory_ot_name', 'battle_factory_app',
  'battle_factory_scene', 'journal_entries', 'start_menu', 'battle_strings', 'visible_items',
  'npc_trade_names', 'furniture_names', 'mystery_gift_phrase', 'black_out_scene',
  'group_connection', 'unk_0375', 'spin_trade', 'unk_0377', 'gym_names',
  'mystery_gift_deliveryman', 'hidden_items', 'field_moves', 'wifi_plaza_entrance',
  'pokedex_ratings', 'unk_0384', 'unk_0385', 'contest_accessory_names',
  'contest_accessory_names_with_articles', 'contest_backdrop_names', 'rowan_intro', 'dummy_0390',
  'item_descriptions', 'item_names', 'item_names_with_articles', 'item_names_plural',
  'bag_pocket_names', 'bag_pocket_names_with_icons', 'berry_trees', 'berry_tags',
  'verity_lakefront', 'unused_verity_lakefront_house', 'valor_lakefront', 'restaurant',
  'grand_lake_valor_lakefront_east_house', 'grand_lake_valor_lakefront_west_house',
  'acuity_lakefront', 'save_corrupted', 'unk_0407', 'mailbox', 'mail', 'unk_0410', 'unk_0411',
  'species_name', 'species_name_with_articles', 'month_names', 'tv_programs_interviews',
  'tv_programs_trainer_sightings', 'tv_programs_records', 'tv_programs_sinnoh_now',
  'tv_programs_variety_hour', 'unk_0420', 'mystery_gift_menu', 'naming_screen',
  'berry_descriptions', 'berry_names', 'drawing', 'dummy_0426', 'generic_names', 'unk_0428',
  'follower_partners', 'pokemon_center_b1f_common', 'record_chatot_cry', 'poffin_common',
  'location_names', 'mystery_gift_event_names', 'special_met_location_names', 'easy_chat_groups',
  'easy_chat', 'unk_0438', 'trainer_words', 'people_words', 'greetings', 'lifestyle_words',
  'feelings', 'tough_words', 'union_words', 'loss_sentences', 'general_sentences',
  'pre_battle_sentences', 'union_room_sentences', 'win_sentences', 'unk_0451', 'unk_0452',
  'party_menu', 'migrate_from_gba', 'pokemon_summary_screen', 'poketch_move_tester',
  'poketch_app_names', 'poketch_pokemon_history', 'poketch_berry_searcher', 'dummy_0460',
  'poketch_link_searcher', 'poffin_cutscene', 'poffin_case', 'poffin_making', 'poffin_types',
  'route_201', 'route_202', 'route_203', 'route_204_south', 'route_204_north', 'route_205_south',
  'route_205_house', 'route_205_north', 'route_206', 'route_206_cycling_road_south_gate',
  'unused_gate_between_eterna_city_route_206', 'route_207', 'route_208', 'route_208_house',
  'route_209', 'route_209_lost_tower_1f', 'route_209_lost_tower_5f', 'route_210_south', 'cafe',
  'route_210_north', 'route_210_grandma_wilma_house', 'route_211_west', 'route_211_east',
  'route_212_north', 'pokemon_mansion', 'pokemon_mansion_maids_room', 'pokemon_mansion_office',
  'route_212_south', 'route_212_house', 'route_213', 'route_213_gate_to_pastoria_city',
  'footstep_house', 'grand_lake_route_213_lobby', 'grand_lake_route_213_east_house',
  'grand_lake_route_213_northwest_house', 'grand_lake_route_213_northeast_house', 'route_214',
  'route_214_gate_to_veilstone_city', 'route_215', 'route_216', 'route_216_house', 'route_217',
  'route_217_west_house', 'route_217_northeast_house', 'route_218',
  'route_218_gate_to_jubilife_city', 'route_218_gate_to_canalave_city', 'route_219', 'route_221',
  'pal_park_lobby', 'route_221_house', 'route_222', 'route_222_west_house',
  'route_222_east_house', 'route_222_gate_to_sunyshore_city', 'route_224', 'route_225',
  'route_225_house', 'unk_0524', 'route_227', 'route_227_house', 'route_228',
  'route_228_gate_to_route_226', 'route_228_north_house', 'route_228_south_house', 'route_229',
  'rankings_machine', 'unk_0533', 'save_info_window', 'ribbon_names', 'dummy_0536',
  'battle_arcade_scene', 'safari_game', 'vs_seeker', 'unk_0540', 'scratch_off_cards', 'unk_0542',
  'unk_0543', 'unk_0544', 'seq_names', 'unk_0546', 'day_care_common', 'unk_0548',
  'battle_hall_scene', 'main_menu_options', 'pokemon_stat_names', 'counterpart_talk',
  'counterpart_names', 'twinleaf_town', 'twinleaf_town_rival_house_1f',
  'twinleaf_town_rival_house_2f', 'twinleaf_town_player_house_1f',
  'twinleaf_town_player_house_2f', 'twinleaf_town_northeast_house',
  'twinleaf_town_southwest_house', 'sandgem_town', 'sandgem_town_mart',
  'sandgem_town_pokecenter_1f', 'sandgem_town_pokecenter_2f', 'sandgem_town_pokemon_research_lab',
  'sandgem_town_counterpart_house_1f', 'sandgem_town_counterpart_house_2f', 'sandgem_town_house',
  'floaroma_town', 'floaroma_town_mart', 'floaroma_town_pokecenter_1f', 'flower_shop',
  'floaroma_town_southeast_house', 'floaroma_town_middle_house', 'solaceon_town',
  'solaceon_town_mart', 'solaceon_town_pokecenter_1f', 'pokemon_day_care',
  'solaceon_town_northeast_house', 'solaceon_town_pokemon_news_press',
  'solaceon_town_north_house', 'solaceon_town_east_house', 'celestic_town',
  'celestic_town_pokecenter_1f', 'celestic_town_north_house', 'celestic_town_northwest_house',
  'celestic_town_northeast_house', 'celestic_town_southwest_house', 'celestic_town_cave',
  'survival_area', 'survival_area_mart', 'survival_area_pokecenter_1f', 'battleground',
  'survival_area_south_house', 'survival_area_north_house', 'resort_area',
  'unused_resort_area_mart', 'resort_area_pokecenter_1f', 'resort_area_ribbon_syndicate_1f',
  'resort_area_ribbon_syndicate_2f', 'resort_area_ribbon_syndicate_elevator', 'villa',
  'villa_furniture_names', 'resort_area_house', 'battle_video', 'flavor_names',
  'rowan_intro_tv_app', 'times_of_day', 'title_screen', 'ability_names',
  'ability_names_uppercase', 'ability_descriptions', 'unk_0613', 'frontier_trainer_messages',
  'town_map', 'trainer_card', 'npc_trainer_messages', 'npc_trainer_names', 'trainer_class_names',
  'trainer_class_names_with_articles', 'tv_reporter_interviews', 'tv_programs', 'tv_commercials',
  'pokemon_type_names', 'underground', 'underground_goods', 'underground_goods_with_articles',
  'underground_items', 'underground_item_names_with_articles', 'underground_traps',
  'underground_trap_names_with_articles', 'underground_answers', 'underground_questions',
  'underground_common', 'union_room', 'underground_npcs', 'underground_base_decoration',
  'underground_capture_flag', 'underground_pc', 'underground_records', 'dummy_0641', 'route_226',
  'route_226_house', 'route_230', 'move_reminder', 'move_descriptions', 'move_names',
  'move_names_uppercase', 'plaza_event_names', 'unk_0650', 'plaza_minigame_names',
  'plaza_item_names', 'unk_0653', 'unk_0654', 'unk_0655', 'unk_0656', 'unk_0657', 'unk_0658',
  'unk_0659', 'unk_0660', 'unk_0661', 'unk_0662', 'greetings_en', 'greetings_fr', 'greetings_de',
  'greetings_it', 'greetings_jp', 'greetings_es', 'dummy_0669', 'unk_0670', 'gts', 'unk_0672',
  'unk_0673', 'unk_0674', 'unk_0675', 'country_region_names_argentina',
  'country_region_names_australia', 'country_region_names_brazil', 'country_region_names_canada',
  'country_region_names_china', 'country_region_names_germany', 'country_region_names_spain',
  'country_region_names_finland', 'country_region_names_france', 'country_region_names_england',
  'country_region_names_india', 'country_region_names_italy', 'country_region_names_japan',
  'country_region_names_norway', 'country_region_names_poland', 'country_region_names_russia',
  'country_region_names_sweden', 'country_region_names_united_states', 'country_names',
  'unk_0695', 'unk_0696', 'pokedex', 'species_pokedex_entry_diamond',
  'species_pokedex_entry_pearl', 'species_pokedex_entry_unused', 'species_pokedex_entry_fr',
  'species_pokedex_entry_de', 'species_pokedex_entry_it', 'species_pokedex_entry_es',
  'species_pokedex_entry_jp', 'species_pokedex_entry_en', 'species_weight', 'species_weight_gira',
  'species_height', 'species_height_gira', 'species_category',
  'species_name_with_natdex_number_en', 'species_name_with_natdex_number_fr',
  'species_name_with_natdex_number_de', 'species_name_with_natdex_number_it',
  'species_name_with_natdex_number_es', 'species_name_with_natdex_number_jp',
  'species_category_en', 'species_category_fr', 'species_category_de', 'species_category_it',
  'species_category_es', 'species_category_jp',
]

/** 한국어판에 없는 뱅크 — 관사·복수형·대문자는 그 언어에 없는 문법이다 */
const KO_ABSENT: readonly string[] = [
  'ball_seal_names_plural',
  'contest_accessory_names_with_articles',
  'item_names_with_articles',
  'item_names_plural',
  'species_name_with_articles',
  'ability_names_uppercase',
  'trainer_class_names_with_articles',
  'underground_goods_with_articles',
  'underground_item_names_with_articles',
  'underground_trap_names_with_articles',
  'move_names_uppercase',
]

/** 일본어판에 없는 뱅크. 문법용에 더해 게임코너·달 이름 몇 개가 더 빠진다 */
const JA_ABSENT: readonly string[] = [
  'ball_seal_names_plural',
  'game_corner',
  'contest_accessory_names_with_articles',
  'item_names_with_articles',
  'item_names_plural',
  'species_name_with_articles',
  'month_names',
  'ability_names_uppercase',
  'trainer_class_names_with_articles',
  'underground_goods_with_articles',
  'underground_item_names_with_articles',
  'underground_trap_names_with_articles',
  'move_names_uppercase',
  'species_pokedex_entry_jp',
  'species_name_with_natdex_number_jp',
  'species_category_jp',
]

const ABSENT: Record<Exclude<Locale, 'us'>, readonly string[]> = { ko: KO_ABSENT, ja: JA_ABSENT }

/**
 * CJK 롬이 자기 뱅크를 하나 끼워 넣는 자리. **이 이름부터 뒤가 한 칸씩 밀린다.**
 *
 * 한국어판은 인사말이 en·fr·de·it·jp 다음에 하나 더 붙는다. 끼워 넣기는 로케일당
 * 딱 하나뿐이라 이름 하나로 족하고, 둘 이상이면 `bankLayout`의 검산이 어긋나서
 * 즉시 드러난다
 */
const INSERTED_BEFORE: Record<Exclude<Locale, 'us'>, string> = {
  ko: 'greetings_es',
  ja: 'veilstone_store_1f',
}

/** 그 로케일 롬에 뱅크가 몇 개 있어야 하는가 */
export function bankCount(locale: Locale): number {
  if (locale === 'us') return BANK_ORDER.length
  return BANK_ORDER.length - ABSENT[locale].length + 1
}

const layouts = new Map<Locale, ReadonlyMap<string, number>>()

/**
 * 이름 → 그 로케일의 뱅크 인덱스. 그 롬에 없는 뱅크는 표에 없다.
 *
 * 순서는 보존된다 — 빠지거나 끼어들 뿐 뒤집히지 않는다. 그래서 남은 것을 순서대로
 * 세면서 끼워 넣기 자리에서 한 칸 건너뛰면 그것이 곧 인덱스다
 */
export function bankLayout(locale: Locale): ReadonlyMap<string, number> {
  const cached = layouts.get(locale)
  if (cached) return cached

  const out = new Map<string, number>()
  if (locale === 'us') {
    BANK_ORDER.forEach((name, i) => out.set(name, i))
  } else {
    const gone = new Set(ABSENT[locale])
    const insertAt = INSERTED_BEFORE[locale]
    let i = 0
    for (const name of BANK_ORDER) {
      if (gone.has(name)) continue
      if (name === insertAt) i++
      out.set(name, i++)
    }
    if (i !== bankCount(locale)) {
      throw new Error(`${locale} 뱅크 배치가 ${i}개로 끝났다 — ${bankCount(locale)}개여야 한다`)
    }
  }
  layouts.set(locale, out)
  return out
}

/** 이름 → 인덱스. 그 롬에 없는 뱅크면 null. 모르는 이름이면 던진다 */
export function bankIndex(name: string, locale: Locale): number | null {
  const at = bankLayout(locale).get(name)
  if (at !== undefined) return at
  if (bankLayout('us').has(name)) return null
  throw new Error(`알 수 없는 텍스트 뱅크: ${name}`)
}

/** 뱅크 헤더 — u16 엔트리 수, u16 암호화 키 */
export interface BankHead { entries: number, key: number }

/** 뱅크 하나의 머리. 4바이트가 안 되면 null */
export function bankHead(bytes: Uint8Array): BankHead | null {
  if (bytes.byteLength < 4) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { entries: view.getUint16(0, true), key: view.getUint16(2, true) }
}

/** 롬이 계산과 다르게 생겼을 때 */
export class BankLayoutError extends Error {
  constructor(message: string) { super(message); this.name = 'BankLayoutError' }
}

/** NARC를 읽는 두 함수. 시험이 인공 narc를 끼울 수 있게 인자로 받는다 */
export interface NarcReader {
  count(bytes: Uint8Array): number | null
  entry(bytes: Uint8Array, index: number): Uint8Array | null
}

/**
 * 사용자의 롬에서 뱅크 배치를 확정한다.
 *
 * 계산한 배치를 그냥 믿지 않는다 — 롬을 열어 **실제 뱅크 수**와 대조하고 머리가
 * 전부 읽히는지 본다. 고른 파일이 우리가 아는 판이 아니면 여기서 멈춘다.
 * 여기서 읽은 값은 그 자리에서 쓰고 버린다 — 저장하지도 기록하지도 않는다
 */
export async function readBankLayout(
  read: (path: string) => Promise<Uint8Array | null>,
  locale: Locale,
  narc: NarcReader,
): Promise<ReadonlyMap<string, number>> {
  const bytes = await read(MSG_NARC)
  if (!bytes) throw new BankLayoutError(`${MSG_NARC}이 롬에 없다`)

  const found = narc.count(bytes)
  if (found === null) throw new BankLayoutError(`${MSG_NARC}을 NARC로 못 읽는다`)
  const want = bankCount(locale)
  if (found !== want) {
    throw new BankLayoutError(`${locale} 롬의 뱅크가 ${found}개다 — ${want}개여야 한다`)
  }

  const layout = bankLayout(locale)
  const heads: BankHead[] = []
  for (const at of layout.values()) {
    const bank = narc.entry(bytes, at)
    const head = bank && bankHead(bank)
    if (!head) throw new BankLayoutError(`뱅크 #${at}의 머리를 못 읽는다`)
    heads.push(head)
  }

  // 이름을 확정하는 근거가 (키, 엔트리 수) 쌍의 유일성이다. **표를 보고 답하지
  // 않는다** — 사용자의 롬을 그 자리에서 세서 답한다
  const dup = duplicatePairs(heads)
  if (dup.length) {
    throw new BankLayoutError(`뱅크 머리가 ${dup.length}쌍 겹친다 — 아는 판이 아니다`)
  }
  return layout
}

/** (키, 엔트리 수)가 겹치는 뱅크. 겹치면 로케일 간 대조 근거가 무너진다 */
export function duplicatePairs(banks: readonly BankHead[]): string[] {
  const seen = new Set<string>()
  const dup: string[] = []
  for (const b of banks) {
    const pair = `${b.key}/${b.entries}`
    if (seen.has(pair)) dup.push(pair)
    seen.add(pair)
  }
  return dup
}

/**
 * 코드가 실제로 부르는 뱅크. 목록에는 724개가 다 있지만, 이름을 오타로 적어도
 * 런타임까지 안 터지면 곤란하므로 쓰는 것만 여기에 못 박는다
 */
export const TEXT_BANK_NAMES = [
  'species_name', 'species_category', 'species_pokedex_entry_diamond', 'species_height',
  'species_weight', 'move_names', 'move_descriptions', 'ability_names', 'ability_descriptions',
  'item_names', 'item_descriptions', 'pokemon_type_names', 'nature_names', 'location_names',
  'npc_trainer_names', 'npc_trainer_messages', 'trainer_class_names', 'generic_names',
  'start_menu', 'menu_entries', 'bag', 'bag_pocket_names', 'party_menu', 'pokedex',
  'options_menu', 'save_info_window', 'main_menu_options', 'common_strings', 'rowan_intro',
  'naming_screen', 'pokemon_storage_system', 'box_messages',
  'pokemon_summary_screen', 'special_met_location_names', 'month_names', 'town_map',
] as const

export type TextBankName = (typeof TEXT_BANK_NAMES)[number]
