# 自動化流程

這份文件給維護者、對專案自動化有興趣的貢獻者，以及需要理解兩個 repo 如何互相觸發的人閱讀。`credits` 負責 canonical Google Sheets 與需要 secrets 的動作；`credits-profiles` 負責 profile PR 的低風險自助檢查。

目前 repo 內已有完整 workflow 定義；實際執行仍需要 repository secrets、variables、Google Workspace 權限、`SITCON Credits Assistant` GitHub App 安裝與 branch ruleset 配合。

## 自助 profile PR

```mermaid
flowchart TD
  contributor["貢獻者送出或更新 profile PR"] --> guard["credits-profiles：Check profile PR scope"]
  contributor --> trusted["credits-profiles：Check trusted profile PR"]
  trusted --> dispatchReview["repository_dispatch: review-profile-pr"]
  dispatchReview --> review["credits：Review profile PR"]
  review --> exportSheet["匯出 canonical Google Sheet"]
  review --> checkStatus{"同一 head SHA 的必要檢查都成功？"}
  exportSheet --> checkAppearance{"profile username 已在 appearances.github_username？"}
  checkStatus -->|是| checkAppearance
  checkStatus -->|否| waitOrSkip["等待或略過自動審查"]
  checkAppearance -->|是| approveMerge["核准並 squash merge 到 credits-profiles"]
  checkAppearance -->|否| maintainerComment["留言提醒維護者審查"]
  approveMerge --> merged["profile JSON merge 到 master"]
  merged --> syncDispatch["credits-profiles：dispatch sync-people-from-profiles"]
  syncDispatch --> syncPeople["credits：Sync people helper"]
  syncPeople --> peopleSheet["Google Sheets people helper sheet"]
```

重點：

- `Profile self-service guard` 在 `pull_request_target` 上檢查 self-service PR 是否只修改 PR 作者自己的單一 `profiles/<github_username>.json`。
- `Trusted profile review` 只使用 base repository 的可信任程式碼，透過 GitHub API 讀取 PR head 的單一 profile JSON，檢查格式與 PR template 必要確認事項。
- `Trusted profile review` 通過後 dispatch 到 `sitcon-tw/credits`，由 `Review profile PR` 在主 repo 的 secrets 之下匯出 canonical Google Sheet。
- `Review profile PR` 會確認同一個 head SHA 的 `Check trusted profile PR` 與 `Check profile PR scope` 都成功，且 profile username 已以裸 GitHub username 形式存在於 `appearances.github_username`。
- 符合條件時，workflow 會用 `SITCON Credits Assistant` GitHub App 核准並以 squash merge 合併 profile PR。
- username 尚未出現在 canonical appearances 時，workflow 只會留言提醒維護者，不會自動建立身份連結。

自動核准與合併只代表 profile PR 符合低風險自助更新條件，而且 username 已經被 canonical data 以裸值參照。它不代表 workflow 建立了新的身份合併，也不代表它處理了歷史資料更正、刪除 profile、rename profile 或隱私政策例外。`site:<source_person_id>` 不會讓 profile PR 自動通過。

## Sheets 匯出與空白 profile template

```mermaid
flowchart TD
  maintainer["維護者執行 Export Sheets data"] --> export["credits：pnpm sheets:export"]
  export --> appToken["建立 SITCON Credits Assistant token"]
  appToken --> checkoutProfiles["checkout sitcon-tw/credits-profiles"]
  checkoutProfiles --> validate["credits：pnpm data:validate --site-profiles-dir"]
  validate --> artifact["上傳 sheets-export artifact"]
  validate --> createTemplates["credits：pnpm profiles:create-missing"]
  createTemplates --> validateProfiles["credits-profiles：pnpm profiles:validate"]
  validateProfiles --> hasChanges{"有建立缺少的 template？"}
  hasChanges -->|是| directCommit["直接 commit 到 credits-profiles master"]
  hasChanges -->|否| noOp["不改動 repo"]
```

`Export Sheets data` 是手動觸發、需要憑證的 workflow。它會匯出 canonical Sheet、checkout `credits-profiles`、驗證本機資料與 `site:` references、上傳 artifact，並檢查 `people.github_username` 中是否有 `credits-profiles` 尚不存在的 profile 檔案。

若缺少 profile 檔案，workflow 會建立空白 template，驗證 profile 格式，然後由 `SITCON Credits Assistant` GitHub App 直接 commit 到 `credits-profiles` 的 `master`。這不會開 PR，也不會填入簡介、頭像、連結、別名、身份證據或歷史 appearance 連結。`site:` profile reference 不會產生空白 profile template。

## 活動網站來源 profile

`appearances.github_username` 可以填 `site:<source_person_id>`，表示這筆 appearance 暫時連到同一列 `event_id` 對應的 `credits-profiles/site-profiles/<event_id>/<source_person_id>.json`。site profile 只提供活動網站來源的顯示名稱與頭像，不是 contributor-owned profile，也不代表身份合併。

`site-profiles/` 只由維護者直接 commit，不接受一般 Pull Request 修改，不觸發 `people` helper 同步，也不會被 profile PR auto-review 當成 username。`data:validate` 在有 site profile checkout 時會檢查 Sheet 中的 `site:` reference 是否存在，並驗證 site profile 只含 `display_name` 與 `avatar_url`。

## GitHub Pages 部署

```mermaid
flowchart TD
  push["push 到 credits master 或手動觸發"] --> checkout["checkout credits 與 credits-profiles"]
  checkout --> export["匯出 canonical Google Sheet"]
  export --> validate["驗證 exported data 與 site-profiles"]
  validate --> build["建立 dist 靜態網站"]
  build --> artifact["上傳 Pages artifact"]
  artifact --> deploy["部署 GitHub Pages"]
```

`Deploy GitHub Pages` 會在 push 到 `master` 或手動觸發時執行。它需要 `GOOGLE_SERVICE_ACCOUNT_JSON` repository secret 讀取 canonical Sheet，並從 `credits-profiles` 讀取 contributor profile 與 `site-profiles` 顯示資料。workflow 會產生 `dist/`、上傳 Pages artifact，並交給 GitHub Pages 部署；repository 仍需要在 GitHub Pages 設定中使用 GitHub Actions 作為部署來源。

Pages 網頁預設只提供公開索引查詢。貢獻者需要請維護者確認哪些項目可能是在記錄自己時，可以打開 [標記我的貢獻紀錄](http://sitcon.org/credits/?claim=1)；頁面會把選取結果保存在網址中，讓貢獻者直接分享該頁網址。這個 handoff 不會寫入 Google Sheets，也不會讓 profile PR 自動完成身份合併；維護者仍需在 canonical Sheet 中人工確認後，才可調整 `appearances.github_username`。

## people helper 同步

```mermaid
flowchart LR
  profileMerge["profile JSON merge 到 credits-profiles master"] --> dispatch["repository_dispatch: sync-people-from-profiles"]
  dispatch --> sync["credits：Sync people helper"]
  sync --> readProfiles["讀取 credits-profiles profiles"]
  sync --> readSheet["讀取現有 people sheet"]
  readProfiles --> upsert["upsert username 與 display_name"]
  readSheet --> upsert
  upsert --> keepPending["保留只有 Sheet 內存在的待處理 username"]
  keepPending --> people["寫入 people helper sheet"]
```

`people` 是 helper sheet，不是 canonical profile source，也不是允許清單。同步 profile repo 到 `people` 只是在 Google Sheets 中提供選取提示與維護提醒；它不會新增、修改或核准任何 `appearances.github_username`。`site:` profile reference 不會同步到 `people`。

## Branch Ruleset 建議

`credits-profiles` 的 profile self-service 分支保護或 ruleset 應要求：

- `Check trusted profile PR`
- `Check profile PR scope`
- 專案預期的 profile review policy

不要要求一般 `CI` 作為 profile PR 必要檢查，因為一般 `pull_request` CI 刻意不在 fork PR 上啟用，以避免 workflow approval 讓自助 profile PR 卡住。支援檔案、docs、schema、workflow、刪除、rename 或修改他人 profile 的 PR，應由維護者人工 review 並加上 `profile-scope-reviewed` label。
