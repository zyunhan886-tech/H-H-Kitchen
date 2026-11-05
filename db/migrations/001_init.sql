
-- ============================================================
-- H&H Kitchen
-- File: db/migrations/001_init.sql
-- Database: Tencent CloudBase PostgreSQL
--
-- 创建四张表：
--   1. families    家庭
--   2. members     家庭成员
--   3. dishes      菜谱
--   4. fridge_items 冰箱食材
--
-- 权限：
--   小程序不直接读写数据库
--   所有操作通过云函数 api
--   anon / authenticated 无表级访问权限
--   service_role 拥有表级权限并绕过 RLS
--
-- 不删除数据库、表或已有数据
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 家庭表 families
-- ============================================================

CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(40) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    owner_openid VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. 家庭成员表 members
-- ============================================================

CREATE TABLE IF NOT EXISTS public.members (
    openid VARCHAR(64) PRIMARY KEY,
    family_id UUID NOT NULL
        REFERENCES public.families(id)
        ON DELETE CASCADE,
    nickname VARCHAR(40) NOT NULL DEFAULT '家人',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS members_family_idx
ON public.members (family_id);


-- ============================================================
-- 3. 菜谱表 dishes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    family_id UUID NOT NULL
        REFERENCES public.families(id)
        ON DELETE CASCADE,

    name VARCHAR(80) NOT NULL,

    category VARCHAR(40) NOT NULL DEFAULT '',

    ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,

    prep JSONB NOT NULL DEFAULT '[]'::jsonb,

    cook JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_by VARCHAR(64),

    updated_by VARCHAR(64),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dishes_family_updated_idx
ON public.dishes (family_id, updated_at DESC);


-- ============================================================
-- 4. 冰箱食材表 fridge_items
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fridge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    family_id UUID NOT NULL
        REFERENCES public.families(id)
        ON DELETE CASCADE,

    name VARCHAR(40) NOT NULL,

    unit VARCHAR(12) NOT NULL DEFAULT '',

    qty NUMERIC(12,2),

    emoji VARCHAR(16) NOT NULL DEFAULT '🥣',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (family_id, name, unit)
);

CREATE INDEX IF NOT EXISTS fridge_family_updated_idx
ON public.fridge_items (family_id, updated_at DESC);


-- ============================================================
-- 5. 开启 Row Level Security (RLS)
-- ============================================================

ALTER TABLE public.families
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.members
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dishes
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fridge_items
ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 6. 禁止普通客户端直接访问
-- ============================================================

REVOKE ALL
ON TABLE
    public.families,
    public.members,
    public.dishes,
    public.fridge_items
FROM anon, authenticated;


-- ============================================================
-- 7. 授权服务端角色
-- ============================================================

GRANT ALL
ON TABLE
    public.families,
    public.members,
    public.dishes,
    public.fridge_items
TO service_role;


-- ============================================================
-- 8. 提交事务
-- ============================================================

COMMIT;
