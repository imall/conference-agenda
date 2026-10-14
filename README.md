# 研討會議程

手機帶著走的研討會議程：從官網匯入全部場次 → 在時間軸上挑要聽的 → 現場自動告訴你「現在／下一場」去哪間會議室。

純靜態網頁（`index.html` + `agenda.js` + `sw.js`），資料存在 Supabase，部署在 GitHub Pages。

## 怎麼用

1. 打開網頁，用 email 登入（收信點連結；每台裝置第一次登入一次）。
2. 右上「編輯」→「＋ 研討會」建立研討會（只有管理者看得到，見下方「誰能看到什麼」）。
3. 「匯入官方議程」：在電腦上打開官網議程頁（某一天的分頁），Ctrl+A、Ctrl+C，貼進框裡 → 匯入。多天就一天貼一次，同一天重貼會覆蓋。
   - 解析規則照 iThome 研討會頁面格式（會議室 / `HH:MM - HH:MM 類型` / 標題 / 講者）。其他網站解析不到時，用「＋ 場次」手動新增。
4. 「挑選場次」：時間軸上點方塊加入或移除；跟已選場次時間重疊的會標「撞場」。
5. 現場打開網頁：頂部卡片顯示進行中與下一場的會議室，每分鐘更新。沒網路時顯示上次載入的資料（標示「離線資料」）。

網址加 `?now=2026-10-14T15:20` 可以模擬時間。

## 第一次設定（只需做一次）

1. **Supabase 專案**：在 [supabase.com](https://supabase.com/dashboard) 建專案，到 Project Settings → API Keys 複製 Project URL 與 anon key，填進 `index.html` 的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`。anon key 本來就是公開用的，資料靠 RLS 保護。**service_role / secret key 絕對不要放進來。**
2. **建表**：SQL Editor 貼上 `setup.sql` 執行。可以重跑；結果應顯示 `rls = true`。
3. **Redirect URL**：Authentication → URL Configuration → Redirect URLs 加上
   - `https://imall.dev/conference-agenda/**`（正式；帳號設了自訂網域，Pages 網址不是 `*.github.io`）
   - `http://localhost:5500/**`（本機開發）
4. **登入一次**後，再跑一次 `setup.sql`：最近一次登入的使用者（你）會成為管理者，並建立 HWDC 2026 第一天 5 場的範例研討會。
5. **開放註冊**：Authentication → Sign In / Providers 的「Allow new users to sign up」要打開，別人才能用 email 登入挑自己的場次。

## 誰能看到什麼

- **研討會內容**（名稱、官網、匯入的官方議程）：所有登入的人都看得到，只有管理者能新增、修改、刪除、匯入。
- **挑選的場次**：每個人各自一份，存在 `picks`，只有本人看得到、改得到。
- 刪除研討會會連同所有人在那個研討會的挑選一起刪掉。
- 開放註冊後，任何知道網址的人都能註冊並看到研討會內容，但看不到別人挑了什麼，也改不了研討會。
- Supabase 內建寄信服務每小時能寄的登入信很少；同一小時很多人第一次登入可能收不到信，要在 Authentication → Emails 設自己的 SMTP 才能解除。

**加管理者**：對方先登入一次，再到 SQL Editor 執行（把 email 換掉）：

```sql
INSERT INTO admins SELECT id FROM auth.users WHERE email = '對方的 email';
```

## Supabase 閒置暫停

免費專案連續 7 天沒有請求會自動暫停。暫停期間網頁只能看離線資料、不能編輯。到 Supabase 後台按 Restore 即可恢復。**研討會前一天先打開網頁確認一次**，順便讓手機快取最新資料。

## 本機開發

```bash
python3 -m http.server 5500
node test.mjs
```

`test.mjs` 是最小自檢：「現在／下一場」判斷、最接近的研討會、官網文字解析。
