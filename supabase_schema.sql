-- ============================================================
--  A-MATH — Math Week 2026 — Supabase Schema
--  วิธีใช้: เปิด Supabase Dashboard → SQL Editor → วางทั้งหมดนี้ → Run
-- ============================================================
--  กติกา (พอร์ตจาก Google Apps Script เดิม code.gs):
--  - W=2, T=1, L=0 แต้ม
--  - ผลต่างต่อเกม = clamp(A-B, ±250) ยกเว้นเกมสุดท้าย ±200
--  - ชนะ BYE = ชนะอัตโนมัติ, ผลต่าง = +100
--  - เรียงอันดับ: แต้มสะสม → ผลต่างสะสม(cap) → คะแนนดิบรวม(ก่อน cap)
--  - เกียรติบัตร: ร้อยละ 60 แรก (ปัดขึ้น)
-- ============================================================

-- 1. ผู้เข้าแข่งขัน (ม.ต้น = ทีม 2 คน มี member2 / ม.ปลาย = เดี่ยว)
create table if not exists am_players (
  id          serial primary key,
  code        text not null,            -- รหัสทีม/บุคคล
  name        text not null,            -- ชื่อทีม/ผู้เล่นคนที่ 1
  level       text not null check (level in ('มต้น','มปลาย')),
  school      text default '',          -- โรงเรียน/สถาบัน
  member2     text default '',          -- สมาชิกคนที่ 2 (ทีม ม.ต้น เท่านั้น)
  created_at  timestamptz default now(),
  unique (code, level)
);

-- 2. การจัดคู่แต่ละเกม (1 ต่อ 1) ; player_b_id = null แปลว่าได้ BYE
create table if not exists am_pairings (
  id          serial primary key,
  game        integer not null,
  level       text not null,
  pair_num    integer not null,         -- โต๊ะ/คู่ที่
  player_a_id integer references am_players(id),
  player_b_id integer references am_players(id),
  is_bye      boolean default false,
  created_at  timestamptz default now(),
  unique (game, level, pair_num)
);

-- 3. ผลการแข่งขัน (เก็บคะแนนดิบ) ; bye → score_a = 100, player_b_id = null
create table if not exists am_games (
  id          serial primary key,
  game        integer not null,
  level       text not null,
  pair_num    integer not null,
  player_a_id integer references am_players(id),
  score_a     integer,
  player_b_id integer references am_players(id),
  score_b     integer,
  is_bye      boolean default false,
  updated_at  timestamptz default now(),
  unique (game, level, pair_num)
);

-- 4. ตั้งค่าระบบ (จำนวนเกมทั้งหมด)
create table if not exists am_settings (
  key   text primary key,
  value text not null
);
insert into am_settings (key, value) values ('totalGames', '3')
  on conflict (key) do nothing;

-- 5. แจ้งเตือน realtime (จาก admin → scoring/display)
create table if not exists am_broadcast (
  id          serial primary key,
  type        text not null,            -- 'current_game' | 'result_saved' | 'reset'
  level       text,
  payload     jsonb default '{}',
  created_at  timestamptz default now()
);

-- ============================================================
--  เปิด Realtime
-- ============================================================
-- 6. รอบชิงชนะเลิศ (top 4: อันดับ 1v2 = ชิงชนะเลิศ, อันดับ 3v4 = ชิงที่3)
create table if not exists am_playoffs (
  id          serial primary key,
  level       text not null,
  round       text not null check (round in ('ชิงชนะเลิศ','ชิงที่3')),
  pair_num    integer not null default 1,
  player_a_id integer references am_players(id),
  player_b_id integer references am_players(id),
  score_a     integer,
  score_b     integer,
  created_at  timestamptz default now(),
  unique (level, round, pair_num)
);

alter publication supabase_realtime add table am_games;
alter publication supabase_realtime add table am_pairings;
alter publication supabase_realtime add table am_broadcast;
alter publication supabase_realtime add table am_playoffs;
