-- 研討會議程：Supabase 建表 + RLS + 搬遷 + 種子資料
-- 執行方式：Supabase 後台 → SQL Editor → 貼上整份 → Run。可以重跑。
-- 研討會內容大家共用、只有管理者（admins 表）能改；每個人挑的場次存在 picks，只有本人看得到。
-- 管理者：第一次執行時，現有研討會的建立者；全新專案則是最近一次登入的使用者（先在網頁登入再跑）。

CREATE TABLE IF NOT EXISTS conferences (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
    name       TEXT NOT NULL,
    url        TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 從官網匯入的全部場次（挑選來源）
-- [{date:"2026-10-14", start:"10:10", end:"12:10", room, title, speaker, kind, url}]
ALTER TABLE conferences ADD COLUMN IF NOT EXISTS catalog JSONB NOT NULL DEFAULT '[]';

-- 列在這裡的人可以新增／修改／刪除研討會。加管理者：INSERT INTO admins SELECT id FROM auth.users WHERE email = '...';
CREATE TABLE IF NOT EXISTS admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE
);

-- 每人每個研討會一列：自己要去的場次，格式同 catalog
CREATE TABLE IF NOT EXISTS picks (
    owner         UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
    conference_id BIGINT NOT NULL REFERENCES conferences ON DELETE CASCADE,
    sessions      JSONB NOT NULL DEFAULT '[]',
    PRIMARY KEY (owner, conference_id)
);

ALTER TABLE conferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;

-- 只讀得到自己那一列：前端靠有沒有讀到判斷是不是管理者。沒有寫入 policy，只能在 SQL Editor 改。
DROP POLICY IF EXISTS "read own row" ON admins;
CREATE POLICY "read own row" ON admins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows only" ON conferences;
DROP POLICY IF EXISTS "everyone reads" ON conferences;
CREATE POLICY "everyone reads" ON conferences
    FOR SELECT TO authenticated
    USING (true);
DROP POLICY IF EXISTS "admins write" ON conferences;
CREATE POLICY "admins write" ON conferences
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "own rows only" ON picks;
CREATE POLICY "own rows only" ON picks
    FOR ALL TO authenticated
    USING (owner = auth.uid())
    WITH CHECK (owner = auth.uid());

-- 只給登入者權限；anon（未登入）完全碰不到
REVOKE ALL ON conferences, admins, picks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON conferences, picks TO authenticated;
GRANT SELECT ON admins TO authenticated;

DO $$
DECLARE seed_user UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM admins) THEN
        INSERT INTO admins (user_id) SELECT DISTINCT owner FROM conferences;
        INSERT INTO admins (user_id)
            SELECT id FROM auth.users WHERE last_sign_in_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM admins)
            ORDER BY last_sign_in_at DESC LIMIT 1;
    END IF;

    -- 舊版把自己挑的場次存在 conferences.sessions：複製到 picks，已有的不覆蓋。
    -- 舊欄位等新版網頁上線後才刪，刪了之後這段自動跳過。
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'conferences' AND column_name = 'sessions') THEN
        EXECUTE 'INSERT INTO picks (owner, conference_id, sessions)
                 SELECT owner, id, sessions FROM conferences WHERE jsonb_array_length(sessions) > 0
                 ON CONFLICT DO NOTHING';
    END IF;

    SELECT user_id INTO seed_user FROM admins LIMIT 1;
    IF seed_user IS NULL THEN
        RAISE NOTICE '還沒有使用者，略過管理者與種子資料。登入一次後再執行這份 SQL。';
        RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM conferences) THEN
        RETURN; -- 已有研討會，不放種子資料
    END IF;
    INSERT INTO conferences (owner, name, url, catalog) VALUES (
        seed_user, 'HWDC 2026', 'https://hwdc.ithome.com.tw/2026/agenda',
        '[
          {"date":"2026-10-14","start":"10:10","end":"12:10","room":"605+606 會議室","kind":"工作坊",
           "title":"從點子到產品：AI 驅動的現代軟體開發全流程實踐","speaker":"林正祥 (ATai)"},
          {"date":"2026-10-14","start":"13:00","end":"15:00","room":"607+608 會議室","kind":"工作坊",
           "title":"讓 AI 讀懂你的系統 with knowledge graph","speaker":"Neo Hsu"},
          {"date":"2026-10-14","start":"15:15","end":"15:45","room":"A 會議室","kind":"分堂議程",
           "title":"AI 導入之後：傳統開發團隊的角色鬆動與開發新節奏","speaker":"陳仁傑"},
          {"date":"2026-10-14","start":"16:00","end":"16:45","room":"DE 會議室","kind":"分堂議程",
           "title":"Rule Driven Develpoment-AI時代的軟體開發策略","speaker":"董大偉 (David)"},
          {"date":"2026-10-14","start":"17:00","end":"17:30","room":"DE 會議室","kind":"分堂議程",
           "title":"「開發效能提升實戰」：Claude Design 搭配自建 Skill，團隊達到提升四倍產出","speaker":"吳品毅 (阿咪 A-mi)、林杰伶 (Jennifer Lin)"}
        ]'::jsonb
    );
END $$;

-- 驗證（SQL Editor 只顯示最後一段的結果，所以合成一張表）：
-- rls 三個都要是 true；admins 是你的 email；old_sessions（舊欄位，刪掉後是空的）和 picks_sessions 場次數一樣
SELECT c.name,
       (SELECT string_agg(relname || '=' || relrowsecurity, ', ') FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relname IN ('conferences', 'admins', 'picks')) AS rls,
       (SELECT string_agg(u.email, ', ') FROM admins a JOIN auth.users u ON u.id = a.user_id) AS admins,
       jsonb_array_length(to_jsonb(c) -> 'sessions') AS old_sessions,
       (SELECT jsonb_array_length(p.sessions) FROM picks p WHERE p.conference_id = c.id AND p.owner = c.owner) AS picks_sessions,
       jsonb_array_length(c.catalog) AS catalog
FROM conferences c ORDER BY c.id;
