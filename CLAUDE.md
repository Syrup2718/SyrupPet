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
  - `types.ts`：`Emotion`、`Action`、`PetReply = {text, emotion, action}`、`EnvironmentSnapshot`、`AppConfig`
  - `ipc.ts`：所有 IPC channel 名稱（唯一來源）
  - `api.ts`：`window.syrup` 介面（**electron-free**，所以 renderer 能對著它做型別檢查）
- `src/main/`
  - `index.ts`：app 進入點,組裝所有服務
  - `petController.ts`：「腦幹」— 意圖 → `LLMService` → 把 `PetReply` 廣播到桌寵 + 聊天視窗
  - `services/llm/`：`LLMProvider` 介面 + `OpenAICompatibleProvider`(所有 provider 共用) + `prompt.ts` + `parsePetReply`
  - `services/environment/`：前景視窗(`foregroundWindow.ts`,PowerShell+Win32)、閒置(`powerMonitor`)、全域游標
  - `services/`：`clipboard`、`hotkeys`、`tray`；`config/`：存到 `%APPDATA%\syrup-pet\config.json`
  - `windows/windowManager.ts`：透明/無邊框/置頂、拖曳、click-through
- `src/preload/index.ts`：實作 `SyrupApi`,透過 contextBridge 暴露為 `window.syrup`
- `src/renderer/{pet,chat,settings}/`：三個視窗。`pet/` 是角色本體（互動、眼睛追滑鼠、泡泡、動畫）
- `src/renderer/public/characters/<pack>/<emotion>.svg`：角色素材,每種情緒一個檔

## 重要慣例 / 紅線
- **隱私(使用者明確要求)**：不做 keylogger、不記錄打字內容;鍵盤只看 OS 閒置秒數。剪貼簿**只在使用者按快捷鍵時**讀取,絕不輪詢/自動偷看。環境快照只在使用者主動聊天且開啟設定時才送 LLM。
- **身體與大腦分離**：`petController` 只負責「拿到 `PetReply` 後廣播」;renderer 只負責「收到後演出來」。未來 PNG→Live2D 只改 renderer 演出層,沿用同一組 `emotion`/`action`。
- **新增 LLM provider**：若是 OpenAI 相容,只加設定即可;否則實作 `LLMProvider` 介面,在 `LLMService.buildProvider` 分流,上層不動。
- **renderer 不直接碰 ipcRenderer**：一律走 `window.syrup`（preload）。新增 IPC 要同時更新 `shared/ipc.ts`、`shared/api.ts`、`preload`、`registerIpc.ts`。
- **跨層 import**：renderer/preload 只能 `import type` 從 `@shared/*`,不要 import `src/main/*`（會把 electron/node 型別帶進 web typecheck）。

## 收尾流程
完成一個工作段落後,主動 `git add` → `commit`（繁中訊息 + Co-Authored-By）→ `push origin main`。維護好 `.gitignore`（已排除 `node_modules/`、`out/`、`dist/`、`*.tsbuildinfo`、`.env*`、`.claude/settings.local.json`）。
