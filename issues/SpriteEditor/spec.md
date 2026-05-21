# Sprite Editor 規劃

此文件為 Sprite Editor 的功能與開發規劃，目標是以 Phaser.js 實作編輯器畫面，確保編輯器中的預覽與遊戲內行為一致。所有 UI 元素以 Phaser GameObjects 實作，**禁止使用 HTML 元素**（唯一例外：`<input type="file">` 僅用於觸發檔案選擇，不影響視覺層）。

## 主要需求概覽

- 使用 Phaser 保持畫面與遊戲一致性。
- 三個主要畫面：**LibraryScreen**（圖庫匯入）、**SpriteEditScreen**（設定與建立 Sprite）、**FrameSelectorScreen**（選取 Sprite Frames）。
- 最終輸出（三個檔案，放入同一 atlas 目錄）：
  - `spritesheet.png`：合成紋理圖
  - `spritesheet.json`：Phaser 標準 TextureAtlas 格式（僅含 frame 座標 metadata，不包含動畫設定）
  - `animations.json`：動畫定義陣列，格式為 `AnimationItem[]`（見下方 Data model）
- 三個檔案輸出後可直接放入 `public/assets/sprites/<atlas>/` 目錄，並在 `assets.json` 中以現有的 `{ atlasId, png, json, animations }` 結構引用，Preloader 會自動載入並合併至 `staticData.assets.animationsByAtlas`。

畫面縮寫對應：**S1** = LibraryScreen、**S2** = SpriteEditScreen、**S3** = FrameSelectorScreen。

---

## Components

以下為 EditorScene 使用的通用 UI 元件，所有元件均以 Phaser GameObjects 實作。

### ButtonBar

位於畫面底部的**固定高度橫條**，橫跨畫面全寬，按鈕群組**靠右對齊**。

**Cell 結構**：每個按鈕為獨立的 `{ background: Rectangle, label: Text }`；focused 時以強調色外框表示。

**各畫面按鈕配置（動態切換）**：

| 畫面 | 預設狀態 | 選取圖片時（S1 專用） |
|------|----------|----------------------|
| S1 | `[Next]` | `[cancel]`  `[delete(n)]` |
| S2 | `[Back]`  `[＋新增]`  `[Export]` | — |
| S3 | `[cancel]`  `[confirm(n)]` | — |

> `n` = 已選取項目數量，文字標籤即時更新（e.g. `delete(2)`、`confirm(3)`）。n = 0 時不顯示數字（e.g. `confirm` 而非 `confirm(0)`）。

**鍵盤行為**：
- Left / Right：在按鈕間移動游標
- Space：執行目前 focused 按鈕
- Up：返回上方內容區（GridSelector 末列 或 S2 sprite 清單末項）

---

### GridSelector

圖片縮圖格，用於 LibraryScreen（S1 圖片庫）與 FrameSelectorScreen（S3 frame 選取）。

**外觀**：
- **4 欄**格狀排列，每格等比例正方形
- 格與格之間均等間距

**Cell 狀態**：

| 狀態 | 外觀 |
|------|------|
| `default` | 淺灰填充，無外框 |
| `focused` | 紅/強調色外框（2px），填充不變 |
| `selected` | 深灰外框 + 選取標記文字 |
| `add (+)` | 無填充，顯示 `+` 文字，與一般格相同尺寸；S1 專用 |

**Add cell（`+` 格，S1 專用）**：
- 固定排列在所有 image cell 之後（最後一格 image 的緊接下一格）
- Space / Click：觸發隱藏的 `<input type="file">`（支援多選）
- 新匯入圖片依序插入 `+` 格之前；`+` 格自動後移

**S3 選取順序徽章**：
- 已選取格的右上角以 Phaser Text 疊加序號（`1`、`2`、`3`...）
- 取消某格選取後，後續已選格序號**自動重新排列**

**超出可視範圍**：游標帶動可視視窗位移（一次一列），頂端/底端停止不循環。

**Left / Right**：同 row 內循環（row 末端 → row 首端，row 首端 → row 末端）。  
**Up / Down**：跨 row 移動，不循環；Up 於首列可進入上方元素（S1 = 名稱欄；S3 = 首列停住）；Down 於末列可進入 ButtonBar。

---

### TextInput

文字輸入欄，純 Phaser 實作，不依賴 HTML 元素。**兩種 variant**：

| Variant | 使用場景 | 外觀 |
|---------|----------|------|
| **Standalone** | S1 名稱欄 | 僅顯示輸入框 |
| **Labeled** | S2 `name` 欄位 | `Name  [________]`（Label 文字 + 輸入框） |

**組成元件（Phaser GameObjects）**：
- `background: Rectangle`：欄位背景；focus 時強調色邊框
- `textDisplay: Text`：顯示 `draftValue`（輸入中）或 `value`（已確認）
- `cursor: Text`（`│`）：focus 時以 Tween 閃爍，blur 時隱藏
- 空值時顯示灰色 placeholder 文字

**詳細實作規格見「Phaser TextInput 通用元件設計」章節。**

---

### NumberInput

數字欄位，呈現為 label + 數值 + 水平滑桿（slider），用於 S2 Config 的 `freq`、`repeat`、`repeatDelay`。

**組成（Phaser GameObjects）**：
- `labelText: Text`：欄位名稱（e.g. `freq`）
- `valueText: Text`：目前數值（e.g. `8`）
- `track: Rectangle`：水平滑桿底條
- `thumb: Rectangle`（或 Circle）：位置對應目前值在 `[min, max]` 的比例

**視覺排列**：`[labelText]  [valueText]  [track────thumb────]`

**狀態**：
- `default`：低亮度呈現
- `focused`：labelText / valueText 高亮；thumb 顏色加深

**鍵盤行為（focused 時，直接響應，不需額外 Space 觸發）**：
- **Left**：數值 − 步長；thumb 左移；抵達 `min` 時停止
- **Right**：數值 + 步長；thumb 右移；抵達 `max` 時停止
- Up / Down：移動焦點至相鄰欄位（交由外部 Scene 處理）
- 每次數值改變**立即觸發 Preview 動畫重建**（`scene.anims.remove(key)` + `scene.anims.create(…)`）

**步長與範圍**：

| 欄位 | 步長 | 預設值 | min | max |
|------|------|--------|-----|-----|
| `freq` | 1 fps | 8 | 1 | 60 |
| `repeat` | 1 | 0 | −1 | 99 |
| `repeatDelay` | 50 ms | 0 | 0 | 5000 |

---

## Screens

### LibraryScreen（S1）

**版面結構（由上至下）**：
1. 名稱輸入欄（TextInput Standalone）
2. GridSelector（圖片縮圖格 + `+` add cell）
3. ButtonBar

**初始游標位置**：開啟時自動 focus 名稱輸入欄（TextInput）。S1 無 `[Back]` 按鈕。

**名稱輸入欄（TextInput Standalone）**：
- Enter / Down：確認輸入，游標移至 GridSelector 第一格
- Esc：取消並還原上次值，游標移至 GridSelector 第一格

**GridSelector（S1 圖庫）**：
- 游標從名稱欄 Down 進入：focus 在第一格（若無圖片則直接是 `+` 格）
- Up 於首列：游標移回名稱輸入欄
- Space on `+` 格：觸發 `<input type="file">` 多選；匯入後縮圖填入，`+` 格後移
- Space on 圖片格：切換該圖片的選取狀態（支援多選）
- 有圖片被選取時：ButtonBar 切換為 `[cancel]` `[delete(n)]`
- Down 於末列：游標進入 ButtonBar

**圖片尺寸正規化**：批次匯入尺寸不一時，以最大尺寸為基準，所有圖像置中填入（避免小數點位移），確保 spritesheet frame 等尺寸。

**ButtonBar（S1）**：
- Space on `[Next]`：
  - 驗證名稱欄非空且至少有一張圖片；否則顯示 Phaser Text 提示，不進入 S2
  - 通過驗證：進入 S2
- Space on `[cancel]`：清除全部選取狀態，ButtonBar 恢復為 `[Next]`
- Space on `[delete(n)]`：刪除所有已選圖片，清除選取，ButtonBar 恢復為 `[Next]`
- Up：游標返回 GridSelector 末列

---

### SpriteEditScreen（S2）

**版面結構（由上至下）**：
1. Sprite cards 清單（垂直排列，超出範圍時游標帶動視窗位移）
2. ButtonBar（`[Back]` `[＋新增]` `[Export]`）

**Sprite Card 結構**（每張 card 固定高度，**始終完整展開**，無折疊狀態）：

```
┌──────────────┬───────────────────────────────────┬───┐
│              │  name      [________________]     │   │
│   Preview    │  freq       8  [──────●──────]    │ X │
│  (Sprite 預覽)│  repeat     0  [●─────────────]   │   │
│              │  repeatDelay 0  [●─────────────]  │   │
└──────────────┴───────────────────────────────────┴───┘
```

- **Preview 格（左）**：Phaser Sprite 自動循環播放，即時反映 Config 修改；若無 frames 則顯示空白佔位（尺寸 = S1 圖像尺寸）。Space / Click = 進入 S3 選取 frames。
- **Config 欄位（右）**：
  - `name` → TextInput Labeled variant
  - `freq` / `repeat` / `repeatDelay` → NumberInput（slider variant）
- **`[X]` 刪除鈕（右上角）**：Space / Click = 刪除此 sprite card，退回 Card 模式

**導航 — 兩層模式**：

**Card 模式（S2 預設）**：
- Up / Down：在 sprite cards 之間移動；Down 於末列進入 ButtonBar
- Space / Right：進入目前 card 的 **Field 模式**（初始焦點：`name` 欄位）
- Esc：退回 S1

**Field 模式（進入 card 後）**：
- Up / Down：在欄位間循序移動（Preview → `name` → `freq` → `repeat` → `repeatDelay` → `[X]`）
- 各欄位行為：
  - Preview：Space = 進入 S3 選取 frames
  - `name`：Space = 啟用 TextInput（Enter 確認，Esc 取消，退出後返回 Field 模式）
  - `freq` / `repeat` / `repeatDelay`：**直接以 Left / Right 調整 NumberInput 值**（不需 Space 觸發）；每次變動立即更新 Preview
  - `[X]`：Space = 刪除此 sprite，退回 Card 模式
- Left / Esc：退出 Field 模式，回到 Card 模式（此 card 保持 focused）；NumberInput 已實時套用的調整**不還原**

**ButtonBar（S2）**：
- Space on `[Back]`：退回 S1（保留 sprite 清單；返回 S2 時**自動清除孤兒 frame 引用**）
- Space on `[＋新增]`：建立新 sprite card，游標自動進入新 card 的 Field 模式（focus on `name`）
- Space on `[Export]`：輸出三個檔案（`spritesheet.png`、`spritesheet.json`、`animations.json`）
- Up：游標返回 sprite 清單末項（Card 模式）

**S2 初始進入（從 S1 首次進入）**：自動建立一張空 sprite card，直接進入 Field 模式（focus on `name`）。  
**從 S1 返回 S2**：保留現有 sprite 清單；自動移除所有引用已刪除圖片的 frame refs（孤兒 frame 自動清除）。

---

### FrameSelectorScreen（S3）

**版面結構（由上至下）**：
1. GridSelector（S1 圖片庫全部圖片，**無 `+` add cell**）
2. ButtonBar（`[cancel]`  `[confirm(n)]`）

**進入時自動預填**：目標 sprite 目前已選的 frames 預先標記選取（帶序號徽章），與 S2 狀態完全同步。

**GridSelector（S3 frame 選取）**：
- Space：切換游標格的選取狀態；已選取格依序顯示序號徽章（1, 2, 3...）
- 調整順序：Space 取消某 frame → 移動游標 → Space 重新選取，插入至新位置；後續序號自動重排
- Up 於首列：停住（無上方元素）
- Down 於末列：進入 ButtonBar
- 游標停留時，角落顯示放大縮圖（像素確認用，Phaser RenderTexture 實作）
- Esc：放棄全部選取變更，返回 S2（S2 frames 資料不改變）

**ButtonBar（S3）**：
- Space on `[cancel]`：放棄選取，返回 S2（等同 Esc）
- Space on `[confirm(n)]`：將選取結果套用至目標 sprite card 並返回 S2；n = 目前已選取 frame 數（即時更新）

---

## Data model 與 Export 格式

**AnimationItem 型別**（對齊 `src/game/scenes/Pet/types/common.ts`）：

```typescript
interface AnimationItem {
  prefix: string;        // 動畫名稱，同時是 frame 命名前綴（必填）
  qty: number;           // 該動畫的 frame 數量（必填）
  freq: number;          // 播放速率（frames per second，必填）
  repeat: number;        // 重複次數；-1 = 無限循環（必填）
  repeatDelay?: number;  // 重複間隔（毫秒，可選；現有 atlas 檔案以 repeatDelay 儲存，型別兩者並存）
  duration?: number;     // 整段動畫固定時長（毫秒，可選，與 freq 擇一）
}
```

**Frame 命名規則（重要）**：`createAnimationsFromConfig` 透過 Phaser 的 `generateFrameNames` 以 `{prefix}_{n}` 格式（從 1 開始）生成 frame 序列。因此 spritesheet 中的每個 frame key **必須**遵循 `{prefix}_{index}` 格式，例如：`walk_1`、`walk_2`、`walk_3`。

**Duplicate prefix 防呆**：export 時若偵測到兩個 sprite 的 `prefix` 相同，自動以 `(1)`、`(2)` 後綴重新命名衝突項目（例如兩個 `walk` → `walk(1)`、`walk(2)`），再進行打包；修正後名稱同步回編輯器內部狀態。

**編輯器內部資料結構**：

```json
{
  "projectName": "pet_character_afk",
  "images": [
    { "id": "img_001", "fileName": "walk_1.png", "width": 32, "height": 32 }
  ],
  "sprites": [
    {
      "id": "sprite_01",
      "prefix": "walk",
      "frames": ["img_001", "img_002", "img_003"],
      "freq": 6,
      "repeat": -1
    }
  ]
}
```

`sprites[].prefix` 即為 `AnimationItem.prefix`；`sprites[].frames.length` 即為 `AnimationItem.qty`，export 時自動計算。

**輸出 `spritesheet.json`**（Phaser TextureAtlas 標準格式，對應 TexturePacker Phaser3 JSON Hash 輸出，不含動畫設定）：

```json
{
  "frames": {
    "walk_1": {
      "frame": { "x": 0,  "y": 0, "w": 32, "h": 32 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "sourceSize": { "w": 32, "h": 32 }
    },
    "walk_2": {
      "frame": { "x": 32, "y": 0, "w": 32, "h": 32 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "sourceSize": { "w": 32, "h": 32 }
    }
  },
  "meta": {
    "app": "pixel-pet-sprite-editor",
    "version": "1.0",
    "image": "spritesheet.png",
    "format": "RGBA8888",
    "size": { "w": 64, "h": 32 },
    "scale": "1"
  }
}
```

> frame key 命名規則：`{prefix}_{index}`，從 1 起算，與 `createAnimationsFromConfig` 的 `generateFrameNames` 參數一致。`frames` 為 object（key = frame 名稱），不是 array。**S3 的選取順序決定編號**：第 n 個被選取的圖片對應 `{prefix}_{n}`，打包進 spritesheet 時依此序排列。

**輸出 `animations.json`**（`AnimationItem[]`，與現有 per-atlas 檔案格式完全一致）：

```json
[
  { "prefix": "walk", "qty": 3, "freq": 6, "repeat": -1 },
  { "prefix": "idle", "qty": 2, "freq": 4, "repeat": -1, "repeatDelay": 500 }
]
```

> `qty` 由 sprite 的選取 frames 自動計算（`frames.length`）；`repeatDelay` 以 camelCase 統一輸出（現有 atlas 檔案使用 snake_case `repeatDelay`，型別定義兩者並存以維持相容性）。

---

## Phaser TextInput 通用元件設計

所有文字輸入欄位（LibraryScreen 名稱欄、SpriteEditScreen `name` 欄位）均以純 Phaser 物件實作，不依賴任何 HTML/DOM 元素：

**元件組成**：
- `background: Rectangle`：欄位背景與邊框；focus 時高亮色框
- `textDisplay: Text`：顯示當前 `draftValue`（輸入中）或 `value`（已確認）
- `cursor: Text`：插入游標（`│`）；focus 時以 Tween 閃爍，blur 時隱藏

**內部狀態**：
- `value: string`：已確認的穩定值（初始值、Esc 時還原目標）
- `draftValue: string`：輸入中的暫存值
- `cursorPos: number`：游標插入位置（0 = 最左端）
- `isFocused: boolean`

**鍵盤行為（focus 期間以 `Phaser.Input.Keyboard` 監聽，事件不傳遞至場景層）**：
- 可見字元 → 插入至 `draftValue[cursorPos]`，`cursorPos` +1
- Backspace → 刪除 `cursorPos` 前一字元
- Left / Right → 移動 `cursorPos`
- **Enter → `value = draftValue`，退出 focus（emit `'confirm'` 事件，外部場景接管游標導航）**
- **Esc → `draftValue = value`（還原），退出 focus（emit `'cancel'` 事件）**
- Up / Down → 退出 focus 並 emit `'nav-up'` / `'nav-down'`，由外部場景接管導航

**焦點管理**：
- `focus()` 方法：啟用鍵盤監聽、顯示閃爍游標、阻止場景層接收 Esc/Enter/Backspace 等按鍵
- `blur()` 方法：停用鍵盤監聽、隱藏游標、釋放場景層按鍵控制權

**注意**：中文輸入（IME）不支援，建議限制為 ASCII（字母、數字、`_`、`-`）。

---

## 鍵盤操作總表

六鍵（Left / Right / Up / Down / Space / Esc）為主要操作輸入（Backspace 棄用，僅 TextInput 元件內部使用）。TextInput 元件另支援 Enter（確認）與 Esc（取消）；**focus 期間攔截 Enter/Esc，不傳遞至場景層**。

| 畫面 | 模式 | Left | Right | Up | Down | Space | Esc |
|------|------|------|-------|----|------|-------|-----|
| S1 | 名稱欄（TextInput） | 字元左移 | 字元右移 | — | 確認並移至 GridSelector | — | 取消並移至 GridSelector |
| S1 | GridSelector | 游標左移（同 row 循環） | 游標右移（同 row 循環） | 游標上移（首列時回名稱欄） | 游標下移（末列進 ButtonBar） | 切換選取 / `+` 格觸發 file picker | 清除全選 |
| S1 | ButtonBar | 按鈕左移 | 按鈕右移 | 移回 GridSelector 末列 | — | 執行游標按鈕 | 移回 GridSelector（清除全選） |
| S2 | Card 模式 | — | 進入 Field 模式 | 上移 card（頂端停住） | 下移 card（末項進 ButtonBar） | 進入 Field 模式 | 退回 S1 |
| S2 | Field 模式 — Preview | — | — | 上移欄位 | 下移至 `name` | 進入 S3 | 退出 Field 模式（回 Card 模式） |
| S2 | Field 模式 — `name` | — | — | 上移至 Preview | 下移至 `freq` | 啟用 TextInput | 退出 Field 模式（回 Card 模式） |
| S2 | Field 模式 — NumberInput | 數值 −步長 | 數值 +步長 | 上移欄位 | 下移欄位 | — | 退出 Field 模式（回 Card 模式） |
| S2 | Field 模式 — `[X]` | — | — | 上移至 `repeatDelay` | — | 刪除 sprite，退回 Card 模式 | 退出 Field 模式（回 Card 模式） |
| S2 | ButtonBar | 按鈕左移 | 按鈕右移 | 移回 sprite 清單末項 | — | 執行游標按鈕（Back / ＋新增 / Export） | 移回 sprite 清單 |
| S3 | GridSelector | 游標左移（同 row 循環） | 游標右移（同 row 循環） | 游標上移（首列停住） | 游標下移（末列進 ButtonBar） | 切換 frame 選取 | 放棄全部選取，返回 S2 |
| S3 | ButtonBar | 按鈕左移 | 按鈕右移 | 移回 GridSelector 末列 | — | 執行游標按鈕（cancel / confirm） | 移回 GridSelector |

**補充說明**：
- **游標帶動視窗**：游標抵達可視範圍邊界時，可視視窗自動跟隨游標位移一列（GridSelector）或一項（S2 card 清單），不做整頁翻換；頂端/底端停止不循環。
- **滑鼠游標**：hover 任何可定位元素 = 鍵盤游標移動至該元素；Click = Space。
- **S2 Card 模式 vs Field 模式**：Card 模式中 Up/Down 切換 sprite；進入 Field 模式後 Up/Down 切換欄位，Left/Esc 退回 Card 模式。NumberInput 欄位在 Field 模式下直接以 Left/Right 調整值，**不需額外 Space 觸發**。
- **S2 數值調整不還原**：Field 模式中 NumberInput 已實時套用的調整，Esc 退出 Field 模式時**不還原**。
- **S1 → S2 進入條件**：名稱欄非空且至少有一張圖片；不符合時顯示 Phaser Text 提示，不進入。
- **S3 進入條件**：在 S2 Field 模式中，游標在 Preview 格時按 Space；進入時自動預填目前 sprite 已選 frames。
- **S3 `[confirm(n)]`**：n 為目前已選取的 frame 數量（即時更新）；n = 0 時仍可確認（清空 frames）。
- **游標可見性**：所有 focused 元素均有高亮框，讓使用者清楚知道目前位置。

---

## Implementation notes（Phaser 相關）

- 使用 Phaser 的渲染與 animation system 做 Preview，確保編輯器播放行為與遊戲一致。
- 編輯器完全在 Phaser Scene（`EditorScene`）內運行，所有 UI 元素均以 Phaser GameObjects 實作；React 僅負責掛載 canvas。
- **鍵盤輸入**：以 `Phaser.Input.Keyboard` 監聽 Left / Right / Up / Down / Space / Esc 六鍵（Backspace 棄用，僅 TextInput 內部使用）。TextInput 元件詳見上方設計章節。NumberInput 的 Left/Right 由 Scene 在 Field 模式下直接分派。
- **圖片匯入流程**：Space on `+` 格觸發時，JavaScript 操控一個隱藏的 `<input type="file">` DOM 元素（**唯一必要的 DOM 例外**）→ 讀取 File → 產生 ObjectURL → `TextureManager.addImage()` 立即顯示縮圖。
- **Preview 實時更新（S2 Field 模式）**：每次 NumberInput 值變動後，立即呼叫 `scene.anims.remove(key)` + `scene.anims.create(...)` 重建 animation；animation key 使用 `editor_preview_{prefix}`，不污染遊戲場景。
- **NumberInput slider 實作**：thumb 的 x 座標 = `trackX + (value - min) / (max - min) * trackWidth`；每次值更新後直接 `setX()` 更新 thumb 位置。
- **spritesheet 打包**：使用 canvas 依計算位置逐一 `drawImage`，最後 `canvas.toBlob()` 輸出 PNG；排版採行列排列（或 MaxRects）。
- **Export 動作產生三個檔案**：
  1. `spritesheet.png`：合成圖
  2. `spritesheet.json`：Phaser TextureAtlas 格式（frame key = `{prefix}_{index}`，從 1 起算）
  3. `animations.json`：`AnimationItem[]`，`qty = frames.length` 自動計算，直接 JSON.stringify 輸出
- **遊戲整合**：三個檔案放入對應 atlas 目錄後，在 `public/configs/assets.json` 的 atlas 條目加上 `"animations"` 欄位，Preloader 透過 `resolveAtlasAnimations(atlasId)` 取得並呼叫 `createAnimationsFromConfig` 套用動畫，無需修改任何遊戲邏輯。
- **圖片尺寸正規化**：批次匯入尺寸不一時，以最大尺寸為基準，所有圖像置中填入，確保 spritesheet frame 等尺寸。

---

## 測試計畫

- **單元測試**：資料 model（export / import）、packing 演算法邏輯（可在 Node 環境測試）、`animations.json` 的 `AnimationItem[]` 序列化結果是否與型別定義一致。
- **集成測試**：在瀏覽器中匯入多張圖、建立 sprite、編輯 config（name / freq / repeat / repeatDelay）、匯出三個檔案，並放入 `public/assets/sprites/` 目錄與更新 `assets.json`，重啟遊戲確認 `createAnimationsFromConfig` 正常套用。
- **手動測試清單**：六鍵完整操作流程（S1 匯入 → S2 設定 → S3 多選 → export）、GridSelector 超出可視範圍游標帶動視窗行為、TextInput 進出模式與值同步、NumberInput slider 步長調整與 Preview 即時更新、S3 預填已選 frames 正確性、Duplicate prefix 防呆輸出驗證、export 三個檔案並載入遊戲場景確認動畫正常。
- **Edge cases**：匯入檔案過大時顯示警告；相同檔名自動加索引避免覆蓋；frames 來源橫跨多圖時確保 packing 與命名一致。

---

## Milestones（短期可交付項目）

- **M1**：建立 Phaser EditorScene shell；實作通用元件（ButtonBar、GridSelector、TextInput、NumberInput）；完成 LibraryScreen（S1）匯入流程與鍵盤導航。
- **M2**：完成 SpriteEditScreen（S2）：sprite card 佈局（Preview + TextInput + NumberInput × 3 + X）、Card 模式 / Field 模式導航、Preview 即時更新。
- **M3**：完成 FrameSelectorScreen（S3）：多選、序號徽章、選取順序 → frame key 映射；`[confirm(n)]` 套用至 S2 sprite card。
- **M4**：完成 packing 與三檔案 export（`spritesheet.png` + `spritesheet.json` + `animations.json`），驗證放入遊戲後 `resolveAtlasAnimations` → `createAnimationsFromConfig` 管線正常運作。

---

## 開發者說明與下一步

- **建議實作順序**：先完成四個通用元件（ButtonBar、GridSelector、TextInput、NumberInput）並各自驗證鍵盤行為，再組裝成 S1 → S2 → S3 畫面，避免各層模式切換互相干擾。
- **S2 模式狀態機**：維護 `cardMode` / `fieldMode` 兩種狀態；`fieldMode` 另需追蹤 `focusedFieldIndex`（當前聚焦的欄位）。鍵盤事件根據當前模式分派，避免 Up/Down 在 Field 模式中誤操作 card 清單。
- **Export 的 `animations.json`** 直接 `JSON.stringify` `AnimationItem[]` 即可；`qty` 由 `frames.length` 計算，不需使用者手動填寫。
- **Frame 命名**在打包時由編輯器自動產生（`{prefix}_{1..qty}`），使用者只需在 S3 指定順序。
- **Preview 實時更新**：S2 Field 模式修改 Config 欄位時，每次值變更後即呼叫 `scene.anims.remove(key)` + `scene.anims.create(...)` 重建 animation，確保 Preview Sprite 立即反映最新設定。

