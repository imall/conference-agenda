-- 研討會議程：Supabase 建表 + RLS + 種子資料
-- 執行方式：Supabase 後台 → SQL Editor → 貼上整份 → Run。可以重跑。
-- 種子資料會給「最近一次登入的使用者」：先在網頁登入，再跑這份 SQL。還沒有人登入過時會跳過。

CREATE TABLE IF NOT EXISTS conferences (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
    name       TEXT NOT NULL,
    url        TEXT,
    -- [{date:"2026-10-14", start:"10:10", end:"12:10", room, title, speaker, kind}]
    sessions   JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 從官網匯入的全部場次（挑選來源），格式同 sessions
ALTER TABLE conferences ADD COLUMN IF NOT EXISTS catalog JSONB NOT NULL DEFAULT '[]';

ALTER TABLE conferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows only" ON conferences;
CREATE POLICY "own rows only" ON conferences
    FOR ALL TO authenticated
    USING (owner = auth.uid())
    WITH CHECK (owner = auth.uid());

-- 只給登入者權限；anon（未登入）完全碰不到
REVOKE ALL ON conferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON conferences TO authenticated;

DO $$
DECLARE seed_user UUID;
BEGIN
    SELECT id INTO seed_user FROM auth.users WHERE last_sign_in_at IS NOT NULL
        ORDER BY last_sign_in_at DESC LIMIT 1;
    IF seed_user IS NULL THEN
        RAISE NOTICE '還沒有使用者，略過種子資料。登入一次後再執行這份 SQL。';
        RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM conferences WHERE owner = seed_user AND name = 'HWDC 2026') THEN
        RAISE NOTICE 'HWDC 2026 已存在，略過種子資料。';
        RETURN;
    END IF;
    INSERT INTO conferences (owner, name, url, sessions) VALUES (
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

-- 驗證：rls 應為 true；有使用者時 sessions 應為 5
SELECT relrowsecurity AS rls FROM pg_class WHERE relname = 'conferences';
SELECT name, jsonb_array_length(sessions) AS sessions FROM conferences;
