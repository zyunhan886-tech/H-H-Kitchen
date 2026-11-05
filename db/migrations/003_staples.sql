-- 003：冰箱页「常买的菜」清单，按家庭保存（全家共用）。
-- 在 CloudBase 控制台 → PostgreSQL 数据库 → SQL 编辑器 执行一次即可，可重复执行。
-- 不执行也能用常买清单，只是用的是默认清单，改单位/增删不会保存到云端。
alter table public.families
  add column if not exists staples jsonb;   -- [{ "name": "五花肉", "unit": "条", "emoji": "🥩" }]，null 表示用默认清单
