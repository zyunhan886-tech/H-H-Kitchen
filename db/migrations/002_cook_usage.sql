-- 002：「炒好啦」记住每道菜上次每样食材用了多少，下次弹框默认填这个量。
-- 在 CloudBase 控制台 → PostgreSQL 数据库 → SQL 编辑器 执行一次即可，可重复执行。
-- 不执行也能用「炒好啦」，只是每次默认用量都从 1 开始。
alter table public.dishes
  add column if not exists last_usage jsonb not null default '{}'::jsonb;   -- { "洋葱": { "qty": 0.25, "unit": "个" } }
