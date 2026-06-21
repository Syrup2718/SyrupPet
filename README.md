# 🍮 小漿糖 Desktop (SyrupPet)

一個住在 Windows 桌面上的 **AI 桌寵**。它不只是聊天機器人，而是一個會出現在桌面、能被滑鼠互動、會看你滑鼠、會根據你的狀態給回饋的 AI 角色。透過 LLM，它的回覆同時包含**文字 + 情緒 + 動作**，所以有生命感。

> 技術棧：**Electron + TypeScript**（main / preload / renderer 三層架構，electron-vite 打包）。

---

## ✨ v1 已實作功能

| # | 功能 | 說明 |
|---|------|------|
| 1 | 桌面角色 | 透明、無邊框、永遠置頂、不佔工作列的小視窗 |
| 2 | 滑鼠拖曳 | 直接抓著角色拖動（主程序追蹤全域游標移動視窗） |
| 3 | 點擊反應 | 點一下會換表情 + 跳一下 + 隨機台詞泡泡 |
| 4 | 靠近反應 | 滑鼠靠近時眼睛會看向游標、切換好奇表情（可關） |
| 5 | 快捷鍵聊天 | `Ctrl+Shift+Space` 叫出/收起聊天框 |
| 6 | LLM 串接 | OpenAI / DeepSeek / Ollama / 任何 OpenAI 相容端點 |
| 7 | 結構化回覆 | LLM 回傳 `{ text, emotion, action }`，驅動表情與動作 |
| 8 | 10 種情緒 | normal / happy / confused / angry / thinking / sleepy / shy / excited / love / sad |
| 9 | 桌面對話泡泡 | 回覆會浮在角色頭上，不只在聊天視窗 |
| 10 | 環境感知 | 前景程式、視窗標題、閒置秒數、是否在活動（**無 keylogger**） |
| 11 | 剪貼簿分析 | `Ctrl+Shift+C` **主動**讓桌寵讀剪貼簿並用 LLM 分析（不自動偷看） |
| 12 | 系統托盤 | 顯示/隱藏、聊天、設定、結束 |
| 13 | 設定頁 | 切換 provider、填 API Key、調個性與行為、開機自動啟動 |
| 14 | 可換裝角色 | 三種角色包模式（svg / single / multi），設定頁即時切換（見下） |
| 15 | 主動陪伴 | 閒置/久坐/深夜/切換 App 時有節制地主動關心（有冷卻，可關） |
| 16 | 本地代辦 | 用聊天記事/完成/查代辦，可設「幾分鐘後提醒」，資料存本地 JSON |
| 17 | 音效 | 點擊/說話時的合成小音效（Web Audio，無音檔），音量可調、可關 |

### 🔒 隱私邊界（刻意設計）
- **沒有** keylogger，**不**記錄你打了什麼字。鍵盤只透過 OS 的「閒置秒數」得知「有沒有在活動」。
- 剪貼簿**只在你按快捷鍵時**被讀取一次，沒有任何輪詢或監看。
- 環境快照（前景視窗等）只在你**主動聊天**時，且開啟設定後，才會當成參考脈絡送給 LLM。

---

## 🚀 快速開始

```powershell
# 1. 安裝依賴
npm install

# 2. 開發模式（會開出桌寵）
npm run dev
```

啟動後：
1. 右下角會出現小漿糖，可以拖曳、點擊、把滑鼠靠過去。
2. 按 `Ctrl+Shift+Space` 打開聊天框。
3. **第一次要先設定 API Key**：在系統托盤圖示按右鍵 →「⚙️ 設定」→ 選 provider、貼上 API Key → 儲存。
4. 複製一段錯誤訊息，按 `Ctrl+Shift+C`，桌寵會幫你分析。

### 打包成 exe
```powershell
npm run build      # 編譯到 out/
npm run dist       # 用 electron-builder 產生安裝檔到 dist/
```

---

## 🧩 專案架構

```
src/
├─ shared/                 # main / preload / renderer 共用的「契約」
│  ├─ types.ts             #   情緒、動作、PetReply、環境快照、設定型別
│  ├─ ipc.ts               #   所有 IPC channel 名稱
│  └─ api.ts               #   window.syrup 介面定義（electron-free）
│
├─ main/                   # Electron 主程序（Node 環境）
│  ├─ index.ts             #   app 進入點，組裝所有服務
│  ├─ petController.ts     #   「腦幹」：意圖 → LLM → 廣播到桌寵/聊天
│  ├─ config/              #   設定儲存（userData/config.json）+ 預設值
│  ├─ windows/             #   桌寵/聊天/設定視窗、拖曳、click-through
│  ├─ ipc/registerIpc.ts   #   IPC 接線
│  └─ services/
│     ├─ llm/              #   Provider 介面 + OpenAI 相容實作 + prompt + 解析
│     ├─ environment/      #   前景視窗、閒置偵測、全域游標追蹤
│     ├─ clipboard/        #   主動式剪貼簿讀取
│     ├─ hotkeys/          #   全域快捷鍵
│     └─ tray/             #   系統托盤
│
├─ preload/                # 安全橋接：把 window.syrup 暴露給 renderer
│
└─ renderer/               # UI（瀏覽器環境，無 Node 權限）
   ├─ pet/                 #   角色本體：互動、眼睛追滑鼠、泡泡、動畫
   ├─ chat/                #   聊天視窗
   ├─ settings/            #   設定頁
   └─ public/characters/   #   角色素材包（svg / single / multi 三種模式，見下）
```

### 🎨 角色系統（可換裝）
每個角色是 `public/characters/<pack>/` 下的一個資料夾，靠 `manifest.json` 的 `mode` 決定怎麼演：

| mode | 素材 | 表情 | 眼睛追滑鼠 | 內建範例 |
|------|------|------|-----------|----------|
| `svg` | 每種情緒一個 `<emotion>.svg` | ✅ 向量換臉 | ✅ 精準（`.pupil` 位移） | `default`（史萊姆）、`chibi`（手繪 Q 版） |
| `single` | 單張靜態圖 | emoji 徽章 + 濾鏡近似 | 整體微傾近似 | — |
| `multi` | 每種情緒一張圖 | ✅ 真正換圖 | 整體微傾近似 | `custom`（10 張去背 Q 版插畫，**預設**） |

換角色：**系統托盤 →「⚙️ 設定」→「🎨 角色外觀」** 下拉即時切換，無需重啟。
自製角色：在 `characters/` 新增一包 + `manifest.json`，再到設定下拉加一個選項即可（情緒/動作的契約共用，不必動其他程式）。

### 設計重點（為什麼好擴充）
- **契約集中在 `shared/`**：情緒、動作、回覆格式、IPC 名稱都只定義一次。換角色、加情緒只動這裡 + 素材。
- **LLM 走 Provider 介面**：目前所有家都用同一個 `OpenAICompatibleProvider`（只差 baseUrl/model/key）。要加原生 Anthropic 之類，只實作 `LLMProvider` 介面即可，上層不動。
- **身體與大腦分離**：`petController` 只負責「拿到 `PetReply` 後廣播」；renderer 只負責「收到 `PetReply` 後演出來」。之後把 PNG 換成 Live2D，只改 renderer 的演出層。

---

## 🛣️ 未來擴充（接縫已預留）

| 規劃 | 從哪裡接 |
|------|----------|
| Live2D 角色 | `renderer/pet`：把 SVG 表情層換成 Live2D Web SDK，沿用同一組 `emotion`/`action` |
| 語音輸入 (STT) | 新增 `services/voice`，把辨識結果丟進 `controller.handleChat()` |
| TTS 語音回答 | `petController.emitReply` 後接 TTS；嘴型同步再掛到 Live2D |
| 長期記憶 | `LLMService` 已有短期 history；換成向量庫/檔案記憶即可 |
| Discord 連動 | 新增 `services/discord`，共用同一個 `LLMService` |
| 工作陪伴模式 | `EnvironmentService` 已在發 `update` 事件；加規則 → `intent: 'proactive'` |
| 本地 Ollama | 已支援：設定選 Ollama，預設 `http://127.0.0.1:11434/v1` |

---

## ⚙️ 設定檔位置

設定存在 `%APPDATA%\syrup-pet\config.json`（API Key 不進 git）。通常用設定頁改就好，也可手動編輯。

## 📝 授權
MIT
