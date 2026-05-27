# SITCON Credits

SITCON Credits（SITCON 貢獻紀錄）是一個整理 SITCON 歷年公開貢獻紀錄的專案。

多年來，SITCON 相關活動累積了許多工作人員與講者的投入。這些紀錄通常散落在歷屆官網、活動頁面、議程頁或工作文件中；當我們想回顧某個人曾經參與哪些活動、擔任哪些角色，或想向曾經貢獻的夥伴表達感謝時，往往需要重新翻找每一屆網站。

這個專案希望把這些公開紀錄整理成可以長期維護、可以部署在 GitHub Pages 的索引，同時讓曾經參與的夥伴能選擇補充自己的公開簡介、頭像與連結。

## 專案目標

- 彙整 SITCON 相關活動中工作人員與講者的公開貢獻紀錄。
- 讓社群更容易查找某個人、某場活動、某個角色或某段時間的貢獻紀錄。
- 讓貢獻者可以 opt-in 維護自己的公開簡介、頭像與連結。
- 降低現役工作人員整理與維護資料的成本。
- 讓資料來源、維護流程與隱私政策清楚可追溯，避免只靠口耳相傳。

## 收錄範圍

本專案預期收錄 SITCON 相關活動的公開貢獻紀錄，包含但不限於：

- SITCON 年會
- SITCON Camp
- Hour of Code
- Hackathon
- 其他由 SITCON 主辦、共同主辦、以 SITCON 品牌正式舉辦或長期維護的社群活動

協辦、合作或社群成員自行參與的活動不會自動納入。若某個活動是否屬於 SITCON Credits 的收錄範圍不明確，應先由維護者確認，再新增資料。

第一階段預設收錄對象為：

- 工作人員
- 講者

一般參與者、投稿未錄取者、贊助商窗口或其他非公開貢獻角色，不是第一階段的預設收錄對象。若未來需要擴充，應先更新本文件與資料政策。

## 資料來源與維護方式

歷屆活動官網是歷史貢獻紀錄的原始依據。每場活動都應盡可能保留對應的來源 URL，讓後續維護者可以確認資料從哪裡來。若同一場活動中只有少數紀錄來自不同來源，再於該筆紀錄另外標示例外來源。

Google Sheets 是經整理與審核後的主要發布資料源。若歷屆官網資料與 Google Sheets 中的審核資料不同，公開頁面以維護者在 canonical Sheet 中確認後的資料為準。這讓維護者可以修正錯字、補上已確認資訊，或整理不同來源之間的差異。

SITCON 現役工作人員可依照既有 Google Workspace 權限管理方式維護工作表。未來若在工作人員登錄流程中蒐集 GitHub username，行政組長可以把已蒐集到的 username 放入 Google Sheets，由 GitHub Actions 產生對應的個人資料維護檔案。個人資料檔案建立後，曾經貢獻的夥伴可以透過 GitHub Pull Request 自行補充公開簡介、頭像與連結。

本專案不把所有資料都放在同一種維護介面中，而是依資料類型分工。年度活動的工作人員與講者紀錄通常由行政或活動工作人員整理，Google Sheets 較符合 SITCON 既有 Google Workspace 工作流程，也能讓不熟 GitHub 的未來行政組長直接整理當年度資料。個人公開簡介則較適合放在 GitHub repo 中，讓本人或維護者透過 Pull Request 更新，保留較清楚的 review 與變更歷史。

JSON 或 Git-tracked data 對 diff、review 與歷史追蹤有優勢，但如果把年度貢獻紀錄全部改成手寫 JSON，會提高非工程背景維護者的資料整理成本。因此現階段的取捨是：貢獻紀錄由 Google Sheets 承擔主要維護流程；本人 opt-in 的個人簡介與公開連結，則以 GitHub PR 流程作為主要維護方式。

Google Sheets 預期只維護活動出現紀錄、活動清單，以及由 GitHub Actions 產生的 people 參照清單。profile 內容應以 GitHub repository 中的個人資料檔案為準；只要 GitHub 中已有對應檔案，就不需要在 Google Sheets 另外維護一份重複的個人簡介狀態。Google Sheets 中的 `github_username` 欄位只用來把某筆活動出現紀錄連到已確認的個人資料檔案。

repo 工具可透過維護者提供的 service account credentials 依照受控流程操作 Google Sheets，例如初始化表格、設定資料驗證規則、同步 `people` 參照清單、匯出 canonical data，或執行資料檢查。GitHub Actions 對應 workflow、secret 與權限設定尚未建立前，文件應將 CI 自動化描述為規劃中，而不是已啟用。

目前預期的資料流程：

1. 從歷屆官網或其他公開活動頁面整理工作人員與講者紀錄。
2. 將人工整理或匯入的活動出現紀錄維護在 canonical Google Sheet。
3. 若工作人員登錄資料包含 GitHub username，由 GitHub Actions 產生或更新 repo 中對應的個人資料檔案。
4. 曾經貢獻的夥伴可透過 GitHub Pull Request 補充自己的個人資料，並指出自己對應到歷史紀錄中的哪一筆貢獻。
5. 經維護者確認後，在 Google Sheets 的活動出現紀錄中填入對應的 `github_username`，建立歷史紀錄與個人資料檔案之間的關聯。
6. 透過 GitHub Actions 匯出資料並產生 GitHub Pages 靜態網站。

預期 Google Sheets 結構：

`appearances` 是活動出現紀錄主表，也是資料維護者最常編輯的工作表。每一列代表一個人在一場活動中出現的一筆公開貢獻紀錄。預期欄位包含：

- `event_id`：對應到 `events` 表中的活動。
- `role_group_zh`：中文分組或場次類型。工作人員填組別，例如「行政組」或「議程組」；講者填演講或場次類型，例如「Keynote」、「Panel」或「議程」。
- `role_group_en`：英文分組或場次類型。工作人員填組別英文；講者填演講或場次類型英文。若留空，英文頁面直接沿用 `role_group_zh`。
- `role_title_zh`：中文身份。工作人員填該組內身份，例如「組長」或「組員」；講者填該場次中的身份，例如「講者」、「主持人」或「與談人」。
- `role_title_en`：英文身份。工作人員填該組內身份英文；講者填該場次中的身份英文。若留空，英文頁面直接沿用 `role_title_zh`。
- `display_name_at_event`：該活動當時公開顯示的名稱。
- `github_username`：經維護者確認後，連到 GitHub repository 中對應個人資料檔案的 GitHub username；若工作人員登錄或本人提供 GitHub username，也可填入作為建立 profile 檔案的線索。
- `source_url_override`：只有這筆紀錄的來源不同於活動層級來源時才填寫。
- `notes`：只放維護所需的補充說明，不放私人聯絡資訊。

`role_group_*` 與 `role_title_*` 都是對外呈現的人類可讀文字，不是隱藏代碼。`role_group_*` 不應填成 `staff` 或 `speaker` 這類資料分類。英文欄位若留空，網站或匯出流程應直接沿用對應中文欄位；不應自動翻譯，也不需要因英文欄位留空產生資料品質報告。

`events` 是活動清單表，用來讓活動名稱、年份與來源維持一致。預期欄位包含：

- `event_id`：活動識別值，供 `appearances` 參照。
- `event_series`：活動系列，例如 SITCON 年會、SITCON Camp 或 Hour of Code。
- `event_name_zh`：中文公開顯示的活動名稱。
- `event_name_en`：英文公開顯示的活動名稱；若留空，英文頁面直接沿用 `event_name_zh`。
- `event_year`：活動年份。
- `official_site_url`：活動官網或主要公開來源。
- `staff_source_url`：該活動工作人員紀錄的主要公開來源 URL；若與 `speaker_source_url` 相同，可以填相同網址。
- `speaker_source_url`：該活動講者紀錄的主要公開來源 URL；若與 `staff_source_url` 相同，可以填相同網址。
- `notes`：活動層級的維護備註。

`people` 是由 GitHub Actions 產生的參照清單，提供 Google Sheets 操作者在填寫 `appearances.github_username` 時進行檢查與選取。這張表不應由 Sheets 操作者手動維護，也不應放入 GitHub profile 檔案中已經存在的個人簡介、頭像或連結。預期欄位只有：

- `github_username`：對應 GitHub repository 中的個人資料檔案。
- `display_name`：供 Sheets 操作者辨識用的顯示名稱。

若網站輸出需要完整 `people` 索引，應由 GitHub repository 中的個人資料檔案產生。Google Sheets 只保留將 appearance 連到 profile 所需的 `github_username` 關聯。這可以避免個人簡介、頭像、連結或公開顯示名稱同時出現在 Sheet 與 GitHub 檔案中，造成兩邊資料不一致。

相關入口：

- Google Sheet：https://docs.google.com/spreadsheets/d/1L2drpIE2ocZF3Stba9X0DnLGmYi_igeGWUhaQB_evsQ/edit?gid=0#gid=0
- GitHub Pages：TBD

## Google Sheets 工具

本 repo 提供 Google Sheets 初始化工具，讓表格結構、欄位標題、欄位說明與基本資料驗證可以由 repo 管理，減少手動設定。

本 repo 的 Node.js 工具統一使用 pnpm。請不要使用 npm、yarn 或 bun 執行安裝或產生 lockfile。

工具設定放在 `config/sheets.json`，目前會管理：

- `appearances`
- `events`
- `people`

本機執行前，維護者需要先將 service account JSON 放在不會被 commit 的本機路徑，例如 repo 根目錄的 `credentials.json`，並確認 Google Sheet 已分享給該 service account 的 email。

可先檢查工具將套用的設定：

```bash
pnpm sheets:init:dry-run
```

確認後再執行初始化：

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/credentials.json"
pnpm sheets:init
```

`sheets:init` 會建立缺少的工作表、更新第一列欄位名稱、在欄位標題留下說明 note、凍結標題列、設定欄寬，並設定 `appearances.event_id` 與 `appearances.github_username` 的基本資料驗證。這個工具不會清空既有資料列。

## 資料最小化

本專案只應公開完成貢獻紀錄索引所需的資料。歷史活動紀錄原則上只需要活動脈絡中的必要資訊，例如：

- 活動名稱
- 年份
- 角色
- 當時公開顯示名稱
- 來源 URL
- 是否連到個人頁

不應公開收集或發布下列資料：

- 私人 email
- 電話
- 地址
- 身份證明資料
- 內部工作文件中的聯絡資訊
- 未經本人同意公開的社群帳號
- 其他與公開貢獻紀錄無關的私人資訊

Google Workspace 中的內部文件可以作為維護線索，但不能因為維護者看得到，就直接輸出到公開網站。若資料沒有出現在公開活動來源中，也不是本人 opt-in 提供，就不應公開。

## 個人資料與更新

歷史貢獻紀錄與個人公開簡介是不同層次的資料。

歷史貢獻紀錄是根據歷屆官網等公開來源整理而來，例如某人在某場活動擔任工作人員或講者。個人公開簡介則是本人可以選擇補充的資料，例如：

- 偏好的顯示名稱
- 個人簡介
- 頭像
- GitHub、個人網站或社群連結

個人簡介、頭像與連結採 opt-in，並以 GitHub repository 中的個人資料檔案為主要資料來源。本人可以透過 GitHub Pull Request 提出新增、修正或移除。

未來可規劃 GitHub PR 自助更新流程，讓曾經貢獻者以自己的 GitHub 帳號提出 PR，更新與該 GitHub username 對應的個人公開簡介檔案。這個流程應只接受低風險的 profile 資料，例如偏好的顯示名稱、個人簡介、頭像與公開連結；不應用來修改歷史貢獻紀錄、活動角色或來源 URL。

若工作人員登錄流程蒐集 GitHub username，應在蒐集時清楚說明用途：該 username 可能用來建立公開個人資料檔案、讓本人後續以 GitHub PR 維護自己的 profile，並在維護者確認後連結到歷史貢獻紀錄。未經本人同意公開的其他社群帳號或私人聯絡資訊不應放入公開資料。

自助 PR 自動接受機制尚未實作。啟用前需要先建立 profile 資料格式、驗證規則與 GitHub Actions 檢查，確認 PR 作者只修改自己的 profile 檔案，且變更內容符合允許欄位。這些檢查完成前，GitHub PR 仍需由維護者確認。

## 身份合併原則

同一個人可能在不同年份或不同活動中使用不同名稱、暱稱、英文名或 GitHub 帳號。這是本專案最需要謹慎處理的問題之一。

本專案採取「先保留出現紀錄，再建立個人頁」的原則：

- 每筆活動上的公開出現紀錄都可以先獨立保存。
- GitHub username 對應 repo 中的個人資料檔案，也是歷史出現紀錄連到 profile 的關聯欄位。
- 跨活動的個人頁關聯可由維護者依據社群脈絡判斷建立。
- 不應只因同名、相似暱稱、相似英文拼法或相似 GitHub 帳號，就自動判定為同一人。
- 本人提出個人資料 PR 並指出自己對應到哪一筆歷史貢獻時，仍需經維護者確認後，才調整 Google Sheets 中該筆 appearance 的 `github_username`。
- 若不確定是否為同一人，應先保持分開，等未來有更明確資訊再合併。

這個設計的目標是在「讓歷年貢獻可以被看見」與「避免錯誤合併他人身份」之間取得平衡。

## 更正與移除政策

本人可以要求：

- 移除個人簡介、頭像與連結。
- 移除跨活動個人頁的連結。
- 修正偏好的顯示名稱。
- 修正錯誤的角色、活動或來源資訊。

已在歷屆官網公開的歷史貢獻紀錄，本站預設不隱藏，也不假設過去的活動紀錄會被改動或刪除。若本人不希望被集中呈現在個人頁中，維護者可以解除該筆紀錄與個人頁的連結；但原本基於公開來源整理的活動紀錄仍會保留在活動脈絡中。

如果原始官網資料本身有誤，維護者可以在 canonical Sheet 中記錄審核後的修正資料，並保留可追溯的來源 URL。

未來若建立自助 PR 流程，仍只應涵蓋本人 opt-in profile 欄位更新。移除個人資料、解除跨活動個人頁連結、修正歷史角色或來源資訊，仍需要維護者審核，避免把身份判斷、來源衝突或政策問題交給自動化處理。

## 如何參與

目前專案仍在初始化階段。可以協助的方向包含：

- 補上歷屆活動官網中的工作人員與講者資料。
- 協助確認資料來源 URL。
- 協助整理 Google Sheets 欄位與維護流程。
- 協助設計 GitHub Pages 前端查詢體驗。
- 提出個人簡介、連結或顯示名稱更新。
- 回報錯誤合併、錯字或資料來源問題。

在資料政策與工具尚未完整建立前，請避免大量自動匯入或自動合併身份。這個專案的長期價值來自可信任、可維護的紀錄，而不是一次性塞滿資料。
