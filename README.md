# SITCON Credits

SITCON Credits（SITCON 貢獻紀錄）整理 SITCON 歷年公開的工作人員與講者貢獻紀錄，讓社群可以更容易回顧某場活動、某個角色或某位夥伴曾經參與的公開紀錄。

多年來，SITCON 相關活動的工作人員與講者資訊分散在歷屆官網、活動頁、議程頁與其他公開頁面。這個專案希望把那些公開紀錄整理成可長期維護、可追溯來源、未來可部署到 GitHub Pages 的索引，同時讓曾經參與的夥伴可以 opt-in 補充自己的公開簡介、頭像與連結。

相關入口：

- Google Sheet：https://docs.google.com/spreadsheets/d/1L2drpIE2ocZF3Stba9X0DnLGmYi_igeGWUhaQB_evsQ/edit?gid=0#gid=0
- 個人資料 repo：https://github.com/sitcon-tw/credits-profiles
- GitHub Pages：TBD

## 資料分層

SITCON Credits 刻意把「歷史貢獻紀錄」和「個人公開簡介」分成不同層次。

歷史貢獻紀錄記錄某個公開名稱在某場 SITCON 相關活動中擔任什麼角色，例如工作人員組別、講者身份、場次類型與來源 URL。這些紀錄來自歷屆活動官網等公開來源，經整理與審核後，以 canonical Google Sheet 作為主要發布資料源。

個人公開簡介是本人 opt-in 提供的 profile 資料，例如偏好的顯示名稱、簡介、頭像與公開連結。這些資料由 `credits-profiles` 維護，適合透過 GitHub Pull Request 讓本人或維護者更新。

這樣分層是為了讓不同維護流程符合不同資料的風險：

- 活動紀錄由維護者在 Google Sheets 整理，方便不熟 GitHub 的工作人員維護當年度資料。
- 個人 profile 由獨立 repo 接受 Pull Request，讓自助更新不干擾本 repo 的資料模型、工具與網站開發紀錄。
- GitHub username 可以把歷史紀錄連到 profile，但這個連結仍是維護者審核後的資料判斷，不是 profile PR 自動完成的身份合併。

## 收錄範圍

第一階段預設收錄 SITCON 相關活動中的：

- 工作人員
- 講者

活動範圍包含但不限於：

- SITCON 年會
- SITCON Camp
- Hour of Code
- Hackathon
- 其他由 SITCON 主辦、共同主辦、以 SITCON 品牌正式舉辦或長期維護的社群活動

協辦、合作或社群成員自行參與的活動不會自動納入。一般參與者、投稿未錄取者、贊助商窗口或其他非公開貢獻角色，也不是第一階段的預設收錄對象。若未來要擴充範圍，應先更新文件與資料政策。

## 資料來源與權威

歷屆活動官網是歷史貢獻紀錄的原始依據。每場活動都應盡可能保留對應來源 URL，讓後續維護者可以查核資料從哪裡來。

Google Sheets 是整理、審核與發布前的主要維護介面。若歷屆官網與 canonical Sheet 中的審核資料不同，公開輸出以維護者在 canonical Sheet 中確認後的資料為準。這讓維護者可以修正錯字、補上已確認資訊，或保留來源差異的處理結果。

`credits-profiles` 是個人公開簡介的來源，不是歷史紀錄或身份合併的權威。某個 GitHub username 有 profile 檔案，只代表該 username 有一份 opt-in profile；某筆歷史 appearance 是否連到該 username，仍以 canonical Sheet 中經維護者審核的 `github_username` 為準。

## 預期資料流程

目前預期流程如下；本 repo 已有不讀取 credentials 的 GitHub Actions CI，用來跑本機測試與 Google Sheets dry-run 檢查，也有手動觸發的 credentialed Sheet 匯出 workflow 與 profile/people helper 同步 workflow。Pages 部署尚未啟用前，文件與工具都應把它描述為規劃中。

1. 從歷屆官網或其他公開活動頁面整理工作人員與講者紀錄。
2. 將人工整理或匯入的活動出現紀錄維護在 canonical Google Sheet。
3. 若工作人員登錄資料包含 GitHub username，可先填入 `appearances.github_username`，作為後續建立 profile template 或審核身份連結的線索。
4. 曾經貢獻的夥伴可在 `credits-profiles` 透過 Pull Request 新增或補充自己的 profile，並在 PR 說明中指出自己認為對應的歷史紀錄。
5. 維護者審核身份連結後，在 canonical Sheet 的 `appearances.github_username` 保留或填入對應 username。
6. `Export Sheets data` workflow 匯出 canonical Sheet 後，若 `people.github_username` 中有 `credits-profiles` 尚不存在的 profile 檔案，會對 `credits-profiles` 開 PR 建立空白 template。這只建立 placeholder，不代表身份合併已審核。
7. `credits-profiles` 的 profile 檔案 merge 到 `master` 後，會觸發本 repo 的 `Sync people helper` workflow，將 profile repo 中的 username 與 display name 同步回 Google Sheets 的 `people` helper sheet。
8. 規劃中的建置流程可結合 canonical Sheet 匯出資料與 `credits-profiles` profile 資料，產生 GitHub Pages 靜態網站。

## Google Sheets 模型

目前預期維護三張工作表：

- `appearances`：每列代表一個人在一場活動中的一筆公開貢獻紀錄。
- `events`：活動清單與活動層級來源 URL。
- `people`：規劃中由工具產生的 profile 參照清單，協助 Sheets 操作者選擇或檢查 GitHub username。

`appearances` 的重點欄位：

- `event_id`：對應 `events.event_id`。
- `role_group_zh` / `role_group_en`：公開顯示的組別或場次類型。工作人員填組別，講者填演講或場次類型。
- `role_title_zh` / `role_title_en`：公開顯示的身份。工作人員填組長、組員等；講者填講者、主持人、與談人等。
- `display_name_at_event`：該活動當時公開顯示的名稱。
- `github_username`：連到 profile 的 GitHub username。可以暫時填入尚未有 profile 檔案的 username，作為後續維護線索。
- `source_url_override`：只有這筆紀錄的來源不同於活動層級來源時才填寫。
- `notes`：維護備註，不放私人聯絡資訊。

`events` 的重點欄位：

- `event_id`：穩定、可讀的活動 ID，例如 `SITCON-2026` 或 `SITCON-Camp-2026`。
- `event_series`、`event_name_zh`、`event_name_en`、`event_year`：活動顯示與分類資訊。
- `official_site_url`、`staff_source_url`、`speaker_source_url`：活動與貢獻紀錄來源。
- `notes`：活動層級維護備註。

`people` 預期只包含：

- `github_username`
- `display_name`

`people` 是選取提示與維護提醒，不是封閉允許清單。`appearances.github_username` 不在 `people` 中可能代表 profile template 尚未建立，或身份連結仍待維護者審查；這是 maintenance prompt，不是自動錯誤。

`people` 由 `credits-profiles` 的 profile 檔案同步產生。若維護者先在 Google Sheets 的 `people.github_username` 填入 repo 尚不存在的 username，`Export Sheets data` workflow 會在 `credits-profiles` 開 PR 建立空白 profile template；若 profile PR 先在 `credits-profiles` merge，`Sync people helper` workflow 會把該 username 同步回 `people`。這兩個方向都只是讓 helper sheet 與 profile repo 對齊，不會自動更改 `appearances.github_username` 或完成身份合併。

英文欄位可以留空。英文輸出應 fallback 到對應繁體中文欄位，不應自動翻譯，也不需要因英文欄位留空產生資料品質報告。

## 身份與 profile 原則

同一個人可能在不同年份或活動中使用不同名稱、暱稱、英文名或 GitHub 帳號。本專案採取 appearance-first model：先保留每筆公開活動出現紀錄，再由維護者審核是否連到某個 GitHub username profile。

請不要只因以下線索就自動合併身份：

- 顯示名稱相同或相似
- 暱稱相似
- romanization 相似
- GitHub 帳號名稱相似
- 本人或他人在未審核 PR 中的敘述
- LLM 推論或過往記憶

本人提出 profile PR 並指出自己對應到哪些歷史 appearance，是建立關聯意願與審核線索，不是自動身份合併。若不確定是否為同一人，應先保持紀錄分開。

## 隱私與更正

本專案只公開完成貢獻紀錄索引所需的資料，例如活動名稱、年份、角色、當時公開顯示名稱、來源 URL 與 profile 連結狀態。

不應公開或提交：

- 私人 email、電話、地址或證件資料
- 內部工作文件中的聯絡資訊
- 未經本人同意公開的社群帳號
- 與公開貢獻紀錄無關的私人資訊

本人可以要求移除或修改 profile 層資料，例如簡介、頭像、連結與偏好顯示名稱。若本人不希望被集中呈現在個人頁中，維護者可以解除歷史 appearance 與 profile 的連結；但已在歷屆官網公開的歷史貢獻紀錄，預設仍保留在活動脈絡中。

若原始官網資料本身有誤，維護者可以在 canonical Sheet 中記錄審核後的修正資料，並保留可追溯的來源 URL。

## 本地工具

本 repo 的 Node.js 工具統一使用 pnpm。請不要使用 npm、yarn 或 bun 執行安裝或產生 lockfile。

不讀取憑證、不連線 Google Sheets 的檢查：

```bash
pnpm test
pnpm sheets:init:dry-run
pnpm sheets:export:dry-run
pnpm sheets:sync-people:dry-run
pnpm profiles:create-missing
```

匯出後可驗證本機資料：

```bash
pnpm data:validate
```

`data:validate` 只讀取本機 `tmp/sheets-export/export.json` 與 `config/sheets.json`，不會連線 Google Sheets，也不會讀取 service account credentials。

`sheets:sync-people:dry-run` 會從本機 `tmp/credits-profiles/profiles/` 讀取 profile 檔案並列出將同步到 `people` 的 rows，不會連線 Google Sheets。`profiles:create-missing` 會讀取本機 `tmp/sheets-export/export.json` 中的 `people` rows，並在本機 `tmp/credits-profiles/profiles/` 補上缺少的空白 profile template。

需要操作 Google Sheets 時，維護者需先將 service account JSON 放在不會被 commit 的本機路徑，並設定：

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/credentials.json"
pnpm sheets:init
pnpm sheets:export
```

`sheets:init` 會建立或更新工作表結構、欄位 note、基本資料驗證與條件格式，不會清空既有資料列。`sheets:export` 會讀取 canonical Google Sheet 並輸出到 `tmp/sheets-export/`；`tmp/` 是本機產物，不應提交。

Profile 檔案格式與 `pnpm profiles:validate` 由 `credits-profiles` 維護。

## GitHub Actions

目前已啟用的 workflow：

- `CI`：在 pull request、`master` push 與手動觸發時執行 `pnpm test`、`pnpm sheets:init:dry-run` 與 `pnpm sheets:export:dry-run`。
- `Export Sheets data`：手動觸發時使用 `GOOGLE_SERVICE_ACCOUNT_JSON` repository secret 匯出 canonical Google Sheet，執行 `pnpm data:validate`，上傳 `tmp/sheets-export/` artifact，並用 `CREDITS_PROFILES_SYNC_TOKEN` 直接 commit 到 `credits-profiles`，為缺少的 `people.github_username` 建立空白 profile template。
- `Sync people helper`：手動觸發或收到 `credits-profiles` 的 repository dispatch 時，checkout `credits-profiles`，使用 `GOOGLE_SERVICE_ACCOUNT_JSON` 將 profile repo 中的 username 與 display name 同步到 Google Sheets 的 `people` helper sheet。

`CI` 不讀取 service account credentials、不連線 Google APIs，也不匯出 canonical Sheet。`Export Sheets data` 和 `Sync people helper` 需要維護者先在 GitHub repository secrets 設定 `GOOGLE_SERVICE_ACCOUNT_JSON`；跨 repo 寫入 `credits-profiles` 另需 `CREDITS_PROFILES_SYNC_TOKEN`。這個 token 應使用 SITCON Credits 系統專用的 bot、machine user 或 GitHub App 身份，不應使用維護者個人身份；workflow 產生的 commit author/committer 會固定為 `SITCON Credits System <credits-system@sitcon.org>`。沒有必要 secret 時 workflow 會失敗而不會讀取任何本機 credentials。GitHub Pages 建置部署仍是後續工作；在對應 workflow 與 repository 設定完成前，不應描述為已上線。

## 如何參與

目前專案仍在初始化階段。可以協助的方向包含：

- 補上歷屆活動官網中的工作人員與講者資料。
- 協助確認資料來源 URL。
- 協助整理 Google Sheets 欄位與維護流程。
- 協助設計 GitHub Pages 前端查詢體驗。
- 到 `credits-profiles` 提出自己的個人簡介、連結或顯示名稱更新。
- 回報錯誤合併、錯字或資料來源問題。

在資料政策與工具尚未完整建立前，請避免大量自動匯入或自動合併身份。這個專案的長期價值來自可信任、可維護的紀錄，而不是一次性塞滿資料。
