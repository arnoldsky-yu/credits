# 維護者指南

這份文件給需要操作 Google Sheets、GitHub Actions 或本地工具的維護者閱讀。一般社群貢獻者若只想新增或更新自己的 profile，請到 [`credits-profiles`](https://github.com/sitcon-tw/credits-profiles)。

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

Profile 檔案格式與 `pnpm profiles:validate` 由 `credits-profiles` 維護。

## 需要憑證的 Google Sheets 操作

需要操作 Google Sheets 時，維護者需先將 service account JSON 放在不會被 commit 的本機路徑，並設定：

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/credentials.json"
pnpm sheets:init
pnpm sheets:export
```

`sheets:init` 會建立或更新工作表結構、欄位 note、基本資料驗證與條件格式，不會清空既有資料列。`sheets:export` 會讀取 canonical Google Sheet 並輸出到 `tmp/sheets-export/`；`tmp/` 是本機產物，不應提交。

LLM agents 不應讀取 service account credentials，也不應在沒有明確要求時執行會讀取 `GOOGLE_APPLICATION_CREDENTIALS` 或接觸 Google APIs 的命令。

## GitHub Actions

目前已定義的 workflow：

| Workflow | 觸發方式 | 職責 |
| --- | --- | --- |
| `CI` | pull request、`master` push、手動觸發 | 執行 `pnpm test`、`pnpm sheets:init:dry-run`、`pnpm sheets:export:dry-run`。 |
| `Export Sheets data` | 手動觸發 | 匯出 canonical Google Sheet、執行 `pnpm data:validate`、上傳 artifact，並直接 commit 缺少的空白 profile template 到 `credits-profiles`。 |
| `Sync people helper` | `credits-profiles` repository dispatch、手動觸發 | 將 `credits-profiles` 的 profile username 與 display name 同步到 Google Sheets 的 `people` helper sheet。 |
| `Review profile PR` | `credits-profiles` repository dispatch | 匯出 canonical Google Sheet，確認 profile PR 的 username 是否已出現在 `appearances.github_username`，符合條件時核准並 squash merge，不符合時留言提醒維護者。 |

`CI` 不讀取 service account credentials、不連線 Google APIs，也不匯出 canonical Sheet。`Export Sheets data`、`Sync people helper` 和 `Review profile PR` 需要維護者先在 GitHub repository secrets 設定 `GOOGLE_SERVICE_ACCOUNT_JSON`。

跨 repo 寫入、留言、核准或合併 `credits-profiles` 另需安裝 `SITCON Credits Assistant` GitHub App，並設定：

- repository variable：`SITCON_CREDITS_ASSISTANT_APP_CLIENT_ID`
- repository secret：`SITCON_CREDITS_ASSISTANT_APP_PRIVATE_KEY`

這個 GitHub App 應安裝在 `sitcon-tw/credits` 與 `sitcon-tw/credits-profiles`，不應使用維護者個人 token。workflow 產生的 commit author 會固定為 `SITCON Credits Assistant`，committer 會使用 `sitcon-credits-assistant[bot]` 的 noreply email。

## profile template 與 people helper

`Export Sheets data` 會讀取 `people.github_username`，為 `credits-profiles` 尚不存在的 username 建立空白 profile template。這是讓 contributor 後續可以自助補資料的佔位範本，不代表身份連結已審核，也不會填入 profile 細節。

`Sync people helper` 會讀取 `credits-profiles/profiles/*.json`，同步 `github_username` 與 `display_name` 到 Google Sheets 的 `people` helper sheet。同步時會保留 Sheet 中已存在但 profile repo 尚未有檔案的待處理 username，方便維護者先在 `appearances.github_username` 或 `people` 中留下後續 template 建立線索。

## 仍未啟用的部分

GitHub Pages 建置部署仍是後續工作；在對應 workflow 與 repository 設定完成前，不應描述為已上線。若未來新增 Forms、Pages build、public search index 或資料 schema，請先更新 [資料模型與治理](data-model.md) 和 [自動化流程](workflows.md)。
