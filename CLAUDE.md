# CLAUDE.md

給 Claude Code 在本 repo 工作時的指引。SyrupPet（小漿糖 Desktop）是一個 Windows 桌面 AI 桌寵。

## 技術棧
**Electron + TypeScript**，用 electron-vite 打包。三層架構：`main`（Node/Electron 主程序）、`preload`（安全橋接）、`renderer`（UI，無 Node 權限）。

## 常用指令
```powershell
npm run dev        # 開發模式,會開出真正的桌寵視窗
npm run build      # electron-vite build -> out/
npm run typecheck  # tsc 檢查 node + web 兩套 config (改完一定要跑)
npm run dist       # electron-builder 產生安裝檔 -> dist/
```
> 沒有測試框架。驗證方式：`npm run typecheck` 必過 + `npm run build` 必過。改 UI/互動行為時用 `npm run dev` 實機看。

## 架構地圖
- `src/shared/` — **契約集中地**，main/preload/renderer 共用。改情緒、動作、回覆格式、IPC、設定型別都從這裡開始。
  - `types.ts`：`Emotion`(10 種:normal/happy/confused/angry/thinking/sleepy/shy/excited/love/sad)、`Action`、`PetReply = {text, emotion, action}`、`EnvironmentSnapshot`、`AppConfig`
  - `ipc.ts`：所有 IPC channel 名稱（唯一來源）
  - `api.ts`：`window.syrup` 介面（**electron-free**，所以 renderer 能對著它做型別檢查）
- `src/main/`
  - `index.ts`：app 進入點,組裝所有服務
  - `petController.ts`：「腦幹」— 意圖 → `LLMService` → 把 `PetReply` 廣播到桌寵 + 聊天視窗
  - `services/llm/`：`LLMProvider` 介面 + `OpenAICompatibleProvider`(所有 provider 共用) + `prompt.ts` + `parsePetReply`
  - `services/environment/`：前景視窗(`foregroundWindow.ts`,PowerShell+Win32)、閒置(`powerMonitor`)、全域游標
  - `services/`：`clipboard`、`hotkeys`、`tray`；`config/`：存到 `%APPDATA%\syrup-pet\config.json`
  - `windows/windowManager.ts`：透明/無邊框/置頂、拖曳、click-through
  - `services/tray/trayService.ts`：托盤圖示用 `resources/tray.png`(電腦透過 electron-vite `?asset` 載入)
- `resources/` — 主程序用的靜態資產(用 `import x from '...?asset'` 載入,型別宣告在 `src/main/env.d.ts`):`tray.png`(托盤)、`icon.png`(聊天/設定視窗工作列圖示)。`build/icon.ico` 是 electron-builder 的安裝檔/exe 圖示。圖片暫存於 repo 根的 `syrup.png`/`*.png` 已被 `.gitignore` 排除。
- `src/preload/index.ts`：實作 `SyrupApi`,透過 contextBridge 暴露為 `window.syrup`
- `src/renderer/{pet,chat,settings}/`：三個視窗。`pet/` 是角色本體（互動、眼睛追滑鼠、泡泡、動畫）
- `src/renderer/public/characters/<pack>/`：角色素材包,每包一個資料夾,用 `manifest.json` 的 `mode` 決定怎麼渲染:
  - `svg`：每種情緒一個 `<emotion>.svg`,內含 `.pupil` 群組 → 眼睛精準追滑鼠（內建 `default`、手繪 `chibi`）
  - `single`：單張靜態圖（`image` 欄位）。情緒用 emoji 徽章 + 整體濾鏡/傾斜近似,眼睛不追
  - `multi`：每種情緒一張圖（`images` 對應表,缺省 `<emotion>.png`）→ 真正換表情圖。眼睛用整體微傾近似（預設 `custom`,10 張去背 Q版插畫）
  - 三種模式都在 `renderer/pet/pet.ts` 的 `CharacterRenderer` 策略類別實作；`buildRenderer()` 依 manifest 分流,載入失敗一律回退 `default` SVG
  - 切換角色:設定頁「🎨 角色外觀」下拉 → 存進 `config.character` → `registerIpc` 偵測到 `patch.character` 就呼叫 `windows.reloadPet()` 即時重載

## 重要慣例 / 紅線
- **隱私(使用者明確要求)**：不做 keylogger、不記錄打字內容;鍵盤只看 OS 閒置秒數。剪貼簿**只在使用者按快捷鍵時**讀取,絕不輪詢/自動偷看。環境快照只在使用者主動聊天且開啟設定時才送 LLM。
- **身體與大腦分離**：`petController` 只負責「拿到 `PetReply` 後廣播」;renderer 只負責「收到後演出來」。未來 PNG→Live2D 只改 renderer 演出層,沿用同一組 `emotion`/`action`。
- **新增 LLM provider**：若是 OpenAI 相容,只加設定即可;否則實作 `LLMProvider` 介面,在 `LLMService.buildProvider` 分流,上層不動。
- **renderer 不直接碰 ipcRenderer**：一律走 `window.syrup`（preload）。新增 IPC 要同時更新 `shared/ipc.ts`、`shared/api.ts`、`preload`、`registerIpc.ts`。
- **跨層 import**：renderer/preload 只能 `import type` 從 `@shared/*`,不要 import `src/main/*`（會把 electron/node 型別帶進 web typecheck）。
- **新增/換角色**：在 `characters/<pack>/` 放素材 + `manifest.json`,然後到設定下拉加一個 `<option value="<pack>">`。圖片暫存檔丟 repo 根目錄轉移用,記得 `.gitignore` 有排除（正本一律放在素材包資料夾）。

## 已知問題
- **拖曳在縮放螢幕(125%/150%)會輕微滑點**：目前用主程序 `getCursorScreenPoint` 跟隨 + `setPosition`。已修掉「漂走/放不掉」「靜止自爬」,但 DPI 縮放下拖遠時抓點會偏一點。試過 renderer `screenX` 改寫(偏更多)、DIP 位移÷dpr(未驗證)皆未定案。最穩的後備:改用 `-webkit-app-region: drag`(OS 原生拖曳,完美黏住),代價是「點擊戳一下」反應要換觸發方式。

## 收尾流程
完成一個工作段落後,主動 `git add` → `commit`（繁中訊息 + Co-Authored-By）→ `push origin main`。維護好 `.gitignore`（已排除 `node_modules/`、`out/`、`dist/`、`*.tsbuildinfo`、`.env*`、`.claude/settings.local.json`、根目錄轉移用圖片）。
