# SpriteEditor 作用範圍與資產架構

> **狀態**：第一批（L1–L3）已實作，第二批（L4/L6 介面）未開始。
> **日期**：2026-10-01（2026-10-02 更新實作進度）
> **範圍**：SpriteEditor 該管什麼、不該管什麼，以及使用者自訂角色的資料模型。
> 不含鍵盤導航系統（見 `Spatial Navigator.md`）。

---

## 這份文件是什麼

記錄一次設計討論的結論：釐清 SpriteEditor 的作用範圍，以及它與 Pet 執行期設定之間的分工。

文件中的「調查」章節是從程式碼與設定檔實際跑出來的事實；「決定」章節是討論的共識；「尚未決定」是還沒結論的部分。實作進度見第七節。

---

## 一、核心判斷

> **編輯器現在編的是「一包檔案」，但使用者想編的是「一隻角色」。**

目前 SpriteEditor 的模型是：空白專案 → 自己加 sprite → 自己命名 → 匯出三個檔案。

但遊戲的模型是：一隻角色由設定檔定義，它需要一組**特定名字**的動畫。

這個落差衍生出三個表面問題，而它們其實是同一件事：

| 表面問題 | 真正的原因 |
|---|---|
| 不知道哪些動畫會生效 | 編輯器沒有「這個角色需要什麼」的概念 |
| 編輯器可能改壞自己的素材 | 編輯器看到的是扁平的檔案清單，素材沒有用途標記 |
| 「新增」很難用 | 使用者必須憑空猜出 18 個固定的動畫名字 |

一旦把主詞從「檔案」換成「角色」，三個問題都不需要新機制就消失了。

---

## 二、現況調查

### 2.1 遊戲怎麼找動畫（這是不可動搖的契約）

唯一的消費端是 `src/game/utils/animation.ts`：

```ts
key:    `${atlasId}_${prefix}`
frames: generateFrameNames(texture, { prefix: `${prefix}_`, start: 1, end: qty })
```

推論出兩條硬規則：

1. **`prefix` 是識別字，不是標籤。** 設定檔用名字引用動畫（`walk-left`、`idle-right`），名字錯一個字就找不到。
2. **幀名必須是 `${prefix}_1` 到 `${prefix}_${qty}`**，連號、從 1 開始。

SpriteEditor 的匯出（`utils/export.ts`）產生 `` `${sprite.prefix}_${idx + 1}` ``，與此相符。**格式契約目前是對的。**

### 2.2 需求清單已經存在，只是編輯器沒讀

`public/configs/pet/character/core.json` 明確宣告了角色需要哪些動畫。實際比對預設角色 `pet_character_afk`：

```
預設 atlas 的動畫 : 18 個
被設定檔引用      : 17 個
沒被引用          : face-angry
```

但引用散在 **5 個不同的鍵名、2 條不同的路徑**：

```
animationSet.default[]           walk-left, idle-left, revive, ...
animationSet.condition:normal[]  walk-left, drink, ...
animationSet.condition:sleep[]   sleep, lay-down, wake-up, ...
animationSet.condition:death[]   egg
portrait                         face-normal, face-sad      ← 不在 animationSet 底下
```

而且 `header` 和 `room` 的設定檔用的是**完全不同的路徑**：

```
character : idleActions.*.animationSet.*[]  /  *.portrait
header    : arrow.animation  /  menu[].animation.selected  /  stats[].thresholds[].animation
room      : stages[].background / .back / .front  /  stages[].extras[].animation
```

**結論：不要從設定檔推格子清單。** 每種型別要寫一個解析器，而且容易漏（光是漏掉 `portrait` 就少 3 個動畫，漏掉 `face-angry` 則連完整解析都抓不到）。每包素材都有 `animations.json`，格式統一，從那裡讀一招通吃，而且順便拿到 `qty` / `freq` / `repeat` 當預設值。

### 2.3 素材不是同一種東西

掃描全部 spritesheet，找不符合 `prefix_數字` 命名的幀：

```
pet/character/afk          90 幀   裸名：無
pet/environment/my_room    28 幀   裸名：無
sprite_editor               2 幀   裸名：無
pet/ui/header_cute_01      61 幀   裸名：frame, hp-empty     ←
ui/dialogue/frame          （array 格式，單一幀就叫 "frame"）
ui/transition/hi            2 幀   裸名：無
```

那兩個裸名是被直接叫名字用的：

```json
// pet/header/core.json
"frame": { "textureFrame": "frame", "leftWidth": 8, "rightWidth": 8, "topHeight": 8, "bottomHeight": 8 }
"thresholds": [{ "...": "...", "frame": "hp-empty" }]
```

**關鍵不在格式，在於意義的所在位置。** nineslice 的意義由「圖」加上「設定檔裡的四個邊界數字」共同決定。SpriteEditor 改得到圖，改不到數字——換一張不同尺寸的圖，九宮格就切錯了。

> **它只能改一半，所以不該碰。**

如果忽略這點讓使用者編 header，他可以把 13 個動畫格子都填得完美，按下 APPLY，然後 header 的視窗外框消失——因為 `frame` 被重新命名成 `frame_1`。

### 2.4 現有管線的已知問題

**待處理：**

| 問題 | 位置 | 影響 |
|---|---|---|
| 卡片上沒有名稱欄位，新建的 sprite 拿不到遊戲認得的名字 | `SpriteCard.CARD_FIELDS` | 從零新建的動畫遊戲永遠找不到（格子模型會讓這題消失） |
| APPLY 是整包重建，不是局部修改；沒有幀的動畫直接跳過 | `utils/export.ts` | 匯入時掉幀的動畫會被靜默刪除 |
| `duration` 宣告了但 import/export 都不處理 | `types.ts` | 目前沒有 animations.json 用到，是未爆彈 |
| `AnimationItem` 在 Pet 和 SpriteEditor 各定義一份 | `Pet/types/common.ts`、`SpriteEditor/types.ts` | Pet 那份有重複的 `repeatDelay` 欄位（tsc 唯一的既有錯誤），正是兩邊各自漂移的證據 |
| atlas 條目的形狀有四份定義 | `AssetItem`、`AtlasCustomization`、`PreloadConfig` 內嵌、`WorkspaceAtlasEntry` | 改格式不會在編譯期炸 |
| 要覆寫哪個 atlas 由自由文字的「專案名稱」決定 | `resolveApplyAtlasId()` | 打錯才知道（D8 之後這題消失） |
| `parseSmartFileName` 要求三段檔名，與遊戲的兩段幀名矛盾 | `utils/smartInput.ts` | 見 2.5。格子模型會讓這條路徑整個消失，**刻意不修** |

**已修正（2026-10-01）：** 見 2.5。

### 2.5 命名慣例

慣例本身是這套系統最健康的一層，而且是刻意設計的：

```
atlasId  = 素材路徑把 / 換成 _        6/6 一致，完全可推導
prefix   = 用 - 連接複合字            43/43 零例外
_        = 專門留給幀編號             幀名一律 prefix_數字，1-based
```

這讓 `prefix_數字` 的解析毫無歧義——`back-0_1` 必定是 `back-0` 的第 1 幀，不會誤判。

**但沒有任何程式碼在推導或驗證它。** atlasId 打錯會靜默載入成沒人引用的 id，畫面少一塊而不報錯。

#### 稽核與修正

全面掃描後找到的違規，以及處理方式：

| 類別 | 違規 | 處理 |
|---|---|---|
| 素材缺 `_編號` | `header_cute_01` 的 `frame`、`hp-empty`；`ui/dialogue/frame` 的 `frame` | ✅ 已補成 `frame_1` / `hp-empty_1`，座標資料不動 |
| 素材缺 `_編號` | `ui/frame` 的 `example` | ⬜ 孤兒目錄（未註冊於 `assets.json`、無人引用），建議刪除 |
| 設定檔引用裸名 | `pet/header/core.json` ×2、`global/dialogue/core.json` ×1、`Test/index.ts` 寫死值 ×1 | ✅ 已同步更新 |
| 程式碼產生含底線的 prefix | `export.ts` 備援名 `sprite_${i+1}` | ✅ 改為 `sprite-${i+1}` |
| 程式碼產生含底線的 prefix | `smartInput.ts` 多 key 時 `${key}_${sprite}` | ✅ 改為 `${key}-${sprite}` |
| 程式碼產生叫不到的 key | `export.ts` 撞名改寫 `walk-left(2)` | ✅ 改為 `walk-left-2`（括號讓遊戲永遠引用不到） |
| 程式碼產生純數字 prefix | `SpriteEditScreen.DEFAULT_SPRITE` 的 `String(n)` | ✅ 改為 `sprite-${n}` |

修正後重掃：動畫 prefix 含底線 **0 處**，幀名缺編號 **僅剩孤兒目錄 1 處**。

> 註：補 `_1` **不會**讓 header 變成可編輯。擋住 header 的是 nineslice 的四個邊界數字在設定檔裡（見 2.3 與 D7），不是命名。這組修正純粹是讓規則一致。

#### 建議：把慣例寫成驗證，而不是改名

問題不是「名字取得不好」，是「沒有東西在守護慣例」。建議在 Preloader 載入時檢查（開發模式 console.error 即可）：

- atlasId 是否等於路徑推導值
- prefix 是否含底線
- 幀名是否都符合 `prefix_數字`

約十幾行。好處是可讀性原則一個字都不用改，而且**使用者產生的素材會被同一套規則檢查**——重構之後素材是使用者做的，這點更重要。


---

## 三、決定

### D1：可編範圍用白名單

`configs/assets.json` 每個條目加一個欄位，標記能不能編。編輯器只列可編的。

```json
{ "atlasId": "pet_character_afk",       "editable": true  }
{ "atlasId": "pet_environment_my_room", "editable": true  }
{ "atlasId": "pet_ui_header_cute_01",   "editable": false }
{ "atlasId": "ui_dialogue_frame",       "editable": false }
{ "atlasId": "sprite_editor",           "editable": false }
```

白名單而非黑名單——未來新增的素材預設不可編，比較安全。

因為 D6（room 與 character 同一套邏輯），這個欄位不需要再分型別，布林值就夠。

### D2：格子清單從「預設素材的 animations.json」來

不從設定檔推（理由見 2.2）。好處：

- 格式統一，character / room 共用同一條路徑
- 清單完整，不會漏掉 `portrait` 或 `face-angry` 這種邊角
- 順便繼承每個動畫的 `qty` / `freq` / `repeat` 當預設值，使用者連 FPS 都不用想

### D3：standard = 換圖，不需要命名

格子的名字、數量、參數全部從模板繼承。使用者只做一件事：每格選圖。

這裡有三種「名字」，standard 模式消滅了最重要的那個：

| 名字 | 處理方式 |
|---|---|
| 動畫名（`walk-left`） | **完全消失**，從模板繼承，使用者不會看到 |
| atlasId（技術識別字） | 自動產生，**永不顯示** |
| 角色的顯示名 | 自動給（「角色 2」），可選改。縮圖才是主要的辨識方式 |

### D4：修改 == 新增，預設角色不可變

使用者「修改」或「新增」，本質都是同一件事：**從出廠的預設衍生一份自己的版本**。好處：

- 出廠素材永遠毀不掉
- 免費的還原功能（預設一直在原路徑上）
- 沒有任何破壞性操作

回到編輯器時直接看到現況，不需要「開啟專案 / 新建專案」這種檔案管理動作。

在 standard 裡這份衍生版本只有一個，與預設共用同一個 atlasId（見 D8）；「多個版本的櫃子」是 advanced 才出現的概念。

### D5：advanced 不是另一個工具

新增一個遊戲認得的動作，需要三件事同時成立：

1. 素材裡有這個動畫 ← SpriteEditor 做得到
2. 設定檔引用它 ← 做不到
3. 有東西會觸發它（priority / condition） ← 做不到

**SpriteEditor 目前只做得到第一件**，所以「advanced 模式」放進現在的 SpriteEditor 會是半套——使用者做完得到一個永遠不播放的動畫，而且畫面不會告訴他。

也不該叫使用者去 `src/ConfigEditor.tsx`，那是直接編 JSON 的開發者工具。

> **正確方向：SpriteEditor 最終長大成「角色編輯器」，spritesheet 只是其中一步，advanced 是同一個編輯器的更深一層。**

D1–D4 正是往那個方向長的地基：一旦主詞變成「角色」，再加上「也可以定義新動作」就是同一個畫面的延伸。

**短期**：SpriteEditor 顯示「這包有哪些動畫設定檔沒引用」（例如 `face-angry`），標清楚，但不提供新增。

### D6：room 與 character 用同一套邏輯

驗證過兩者結構相同：

```
character : atlasId + stages(watch: level) + 用名字引用動畫 + 素材純動畫序列
room      : atlasId + stages(watch: level) + 用名字引用動畫 + 素材純動畫序列
```

資料模型完全一致，差別只在格子有幾個、叫什麼——而那本來就從模板讀。

### D7：意義外掛在設定檔的素材，不碰

一條規則涵蓋 nineslice、靜態圖、以及未來類似的東西：

> **SpriteEditor 只碰「一個名字對應一串圖」的東西。意義需要靠圖以外的數字才完整的，一律不碰。**

這條規則是針對**素材包**，不是針對整個畫面。一個素材包若同時含有動畫與 nineslice，正確的做法是把 nineslice 搬到共用的外框 atlas，讓這一包回到「純動畫」——而不是把整包鎖起來。D10 就是這樣把 HEADER 解鎖的。

### D8：atlas 的 id 與顯示名

**standard 不需要產生任何新 id。**

`customization.ts` + `Preloader` 已經是「用同一個 atlasId 覆蓋」的模型，所以 standard 只會有兩包，而且共用同一個 id：

```
預設  = 從 assets.json 的原始路徑載入（出廠檔案一直都在，編輯器隨時讀得到）
我的  = localStorage 的 overlay，key 就是 pet_character_afk
```

遊戲有 overlay 就用 overlay，還原 = 刪掉 overlay。**零新 id、零指標、零命名。**

**advanced 才需要身分管理。** 一旦允許同一個角色有多個版本，就得分辨是哪一個：

```
atlasId     = user_character_<時間戳>   產生後永不改變，永不顯示給使用者
displayName = "橘貓"                    另一個欄位，隨時可改，只用於顯示
```

**id 與顯示名必須分開。** 若「命名」會改到 atlasId，所有已儲存的參照（`customization_state` 指標、`assets.atlases` 的 key）都會斷掉。分開之後，advanced 的「命名」就只是改 `displayName`，完全安全。

時間戳的優點：不用命名、不會撞、天然可排序（角色櫃照建立時間排）。可讀性仍然守得住——`user_character_<時間戳>` 一眼看出是使用者的角色；是哪一隻由縮圖回答。

這也不違反底線規則：該規則管的是 **prefix**，而 atlasId 本來就用底線當分隔（`pet_character_afk`）。動畫 key 會變成 `user_character_1759…_walk-left`，沒有程式碼會把它拆回來（`removeAtlasAnimations` 用 `startsWith` 比對）。

> 顯示名是純 metadata，不需要碰行為設定，所以照 D5 的邏輯它其實不算 advanced。放進 advanced 可以，但不是必須。

---

### D9：第一個畫面是「要編哪一包」，不是空圖庫

**決定（2026-10-07）**：SpriteEditor 開啟即顯示 S0——可編 atlas 的清單（LOAD SPRITES）。使用者挑一項，載入它的出廠資料，直接進 S2，格子全滿。S1 圖庫從「必經的第一站」降級為「重整目前這包素材」的畫面。CREATE NEW 也不是空白開始，而是把目前這包還原成出廠版本。

**為什麼**：空白起手要求使用者先知道他要做的東西長什麼樣——有哪些動畫、每個要幾幀。這份知識在 `animations.json` 裡，不該要使用者記得。改成「挑一包 → 看到填滿的格子 → 編輯即替換」之後，第一個問題是「要改哪個」，而不是「要匯入哪些檔案」。

這同時解掉了 D3（不需要命名）的最後一哩：專案名稱由挑選的 atlasId 決定，使用者不必輸入。

**顯示名與 id 分離（D8 的落實）**：清單顯示 `displayName`（PET CHARACTER / ROOM / HEADER），atlasId 仍是內部識別碼。`assets.json` 的排列順序就是清單順序，不另設一份排序設定。

**每一列再加一行 `description`，說明「改了會看到什麼不一樣」**。atlasId 命名的是檔案，使用者要選的是「我想改哪裡」，這兩件事不是同一個問題。對照表就放在 `assets.json` 的條目上，與 `displayName` 同一處——顯示資訊散成兩個地方比多一個欄位糟。

| 列 | 說明 |
|---|---|
| PET CHARACTER | Pet poses and expressions |
| ROOM | Room background and objects |
| HEADER | Top bar icons and HP |

（字型 Tiny5 只有拉丁字母，所以說明文字用英文。）

**呼叫端的 `targetAtlasId` 不再決定寫入目標**。它只把游標預先停在那一列；真正決定 APPLY 寫到哪裡的是使用者在 S0 挑的那一項。（若沿用舊行為，使用者挑了 ROOM 卻會把編輯結果存進 character。）

**失敗不致命**：清單讀不到就停在 S0 並顯示原因；某一包載不起來（檔案缺失、spritesheet 壞掉）就退回 S1，手動建一包仍然做得到。

| | 改前 | 改後 |
|---|---|---|
| S0 清單 | 不存在（只有圖庫裡的 LOAD DATA 覆蓋層） | **第一個畫面**；與覆蓋層共用同一個元件 |
| 底部選單 | S1/S2 共用 LIBRARY／SPRITES／SAVE／EXIT | 按畫面分：S1 維持四顆；**S2 只留 SAVE／EXIT** |
| S1 圖庫 | 必經的第一站 | 重整目前這包素材 |
| S2 精靈編輯 | 第二站 | **主畫面**，挑選後即進入 |
| S3 選幀 | 挑圖 | 挑圖（後續加「匯入新圖」） |

**目前清單上有三項**：PET CHARACTER、ROOM、HEADER（見 D10）。

**S2 的底部選單縮成兩顆**：在 S2 按 SPRITES 的意思是「前往你正在看的畫面」，而 LIBRARY 有 Escape 可達。160px 寬的選單列上，這兩顆都不值得一個常駐位置。S1 仍是四顆——圖庫是中繼站，需要往前（SPRITES）與回到自己的進入選單（LIBRARY）。

---

### D10：nineslice 集中到一包共用 atlas，素材包只留動畫

**決定（2026-10-07）**：所有 nineslice 視窗外框都從 `ui_frame`（`sprites/ui/frame`）取用。素材包自己不再持有外框，於是變成「純粹的具名動畫集合」，符合 D7 的可編條件。

**為什麼 HEADER 原本進不了清單**，以及這個改動怎麼解掉：

| 阻礙 | 解法 |
|---|---|
| `frame_1` 是 nineslice，四邊 inset 寫在 `configs/pet/header/core.json`——編輯器改得了圖、改不了那四個數字 | 外框移出 header atlas，改指 `ui_frame`。header 不再擁有它，自然不會被半套地編輯 |
| `hp-empty_1` 不在 `animations.json` 裡，被 config 當單張 frame 引用。APPLY 整包重建時會消失，空血量圖示就壞了 | 在 `animations.json` 補上 `hp-empty`（qty 1）。這本來就是該檔案既有的慣用寫法——`arrow`、`water-unselected` 都是 1 幀動畫 |

**合併是純去重**：四份 `frame_1`（header、sprite_editor、ui_dialogue_frame、ui_frame）經位元組比對**完全相同**，都是 21×20。外觀零變化。

**`ui_dialogue_frame` 已從 `assets.json` 移除註冊**——它只含那一張重複的外框，改指 `ui_frame` 後無人引用。檔案留在磁碟上。

**外框與箭頭可以分屬不同 atlas**：`SelectorBarStyle.arrowAtlas` 新增。視窗外框是共用 chrome，選取箭頭是各自的美術，兩者本來就不該被綁在同一包。編輯器因此外框取自 `ui_frame`、箭頭仍取自 `sprite_editor`。

**Header 的 `frame.atlasId` 為選填**，省略時沿用該元件自己的 `atlasId`，舊設定不受影響。

**新的不變量（已寫成測試）**：**可編 atlas 不得有任何幀落在 `animations.json` 之外。** 理由是 APPLY 會整包重建——沒被宣告的幀不只是在編輯器裡看不到，而是會在第一次存檔時被刪除。這正是 header 原本的兩個地雷。不可編的 atlas 不適用此規則，因為沒有東西會重建它們。

**nineslice 本身的編輯**（調整那四個 inset）留給 advanced，不在此階段。

---

## 四、層次架構

重構後的編輯器由六層組成。**standard 與 advanced 不是其中一層，而是「允許寫到哪一層」的差別。**

| 層 | 內容 | 現況 |
|---|---|---|
| **L1 契約層** | 資產的格式規則：幀名 `prefix_N`、動畫 key `atlasId_prefix`、`AnimationItem` 形狀 | 四份複製，無單一來源（見 2.4） |
| **L2 目錄層** | 有哪些 atlas、哪些可編（`assets.json` + `editable`） | 清單有，`editable` 待加（D1） |
| **L3 模板層** | 一包可編 atlas 有哪些格子、每格的預設參數 | 不存在，待建（D2） |
| **L4 草稿層** | 使用者正在編的狀態：每個格子放哪些圖 | 等價於現在的 `SpriteData[]`，但格子集合固定 |
| **L5 套用層** | 草稿 → 三個檔案 → localStorage overlay | **已存在**（`customization.ts` + `Preloader`） |
| **L6 介面層** | 角色櫃（預設／我的）+ 格子表 | 待重寫 |

### standard 與 advanced 的切法

```
standard : 只寫 L4 → L5。L1–L3 視為唯讀
advanced : 還要寫 L3（改變格子集合），而那必然連帶要改「行為設定」——那在這疊之外
```

這條界線是可驗證的，不是感覺：

| | standard 能做 | standard 不能做 |
|---|---|---|
| | 每個格子換圖、調幀序與幀數 | 新增／刪除／改名格子 |
| | 調 FPS、repeat、repeatDelay | 同一角色保留多個版本 |
| | 還原成預設 | 碰 nineslice 與裸圖 |
| | 套用／取消套用 | 改觸發條件（priority、condition） |

### advanced 的兩個真實門檻

advanced 不是「比較難的模式」，它是跨過這兩件事的那一刻：

1. **開始需要身分管理**——多版本就要有 id 與顯示名（D8）
2. **開始要寫行為設定**——新格子要被 `core.json` 引用才會播放（D5）

這也是為什麼 advanced 不能只是現在 SpriteEditor 的一個開關：它需要這個工具今天沒有的能力。

---

## 五、已驗證的技術前提

這兩點已經確認可行，不需要新建設施：

**Preloader 已經支援全新的 atlasId**（`src/game/scenes/Preloader.ts`）：

```ts
const index = atlases.findIndex((item) => item.atlasId === entry.atlasId);
if (index >= 0) atlases[index] = entry;
else atlases.push(entry);        // ← 新 atlas 直接載入
```

所以使用者自訂角色可以存成全新的 atlasId，資產層今天就能運作。

**「現在用哪個角色」的指標已經蓋了一半**（`src/game/customization.ts`）：

```ts
setCustomizationActive(true, atlasId)   // 寫進 localStorage 的 customization_state
```

這個值寫進去之後**沒有任何地方讀取**（全專案只出現在定義與寫入處）。它是個遺留的空鉤子，形狀剛好就是需要的指標——Pet 端補上讀取、讓它蓋過 `core.json` 的 `atlasId` 即可。

---

## 六、尚未決定

1. ~~**第三層的畫面長什麼樣**~~——已解除（2026-10-07）。現有 `GridSelector` 的排版可用，不另設計。剩下的只有「缺圖怎麼標」，屬於 L4 施工細節。
2. **`stages` 怎麼處理**——`core.json` 的 `stages` 允許不同等級用不同 atlas（character 2 階、room 6 階）。目前都指向同一包所以看不出來。若未來要用，「一個角色」其實是「一組 atlas」，資料結構要留路。
3. **新角色從哪裡複製**——已定案為「目前這包的出廠版本」（D9）；「從目前使用中的版本複製」留給 advanced 有多版本時再談。
4. **room 的介面是否該與 character 不同**——資料模型相同（D6），但使用者對房間的期待可能是「換一張背景」而非「填 9 個動畫格」。

---

## 七、實作順序與進度

### 第一批——資料跑通 ✅ 已完成（2026-10-02）

| 層 | 內容 | 落點 |
|---|---|---|
| L1 | 資產契約收成單一模組：`AtlasEntry`、`AnimationItem`、`frameName()`、`parseFrameName()`、`animationKey()`、`isValidPrefix()`、驗證函式 | `src/game/assets/contract.ts` |
| L2 | `assets.json` 加 `editable` 白名單；編輯器的 atlas 清單與 APPLY 都依它過濾 | `configs/assets.json`、`LibraryScreen`、`SpriteEditor/index.ts` |
| L3 | 從出廠 `animations.json` 建格子模板，附 `reconcileSlots()` 回答「哪些動畫會生效」 | `SpriteEditor/utils/template.ts` |

消除的重複：`AnimationItem` 兩份 → 一份（Pet 那份重複的 `repeatDelay` 欄位隨之消失，`tsc` 現在零錯誤）；atlas 條目四份 → 一份；幀名規則三處各寫 → 一處。

白名單結果：`pet_character_afk`、`pet_environment_my_room` 可編，其餘皆否。

**測試（38 個，`yarn test`）**：除了單元測試，`contract.test.ts` 會掃 `assets.json` 註冊的每一包真實素材，驗證 atlasId 與路徑一致、幀名符合 `prefix_數字`、prefix 不含底線。慣例從「大家記得遵守」變成「違反會讓測試紅燈」。

**尚未接上介面**：L3 是純資料模組，目前沒有畫面在呼叫它——它是第二批的輸入。

### 第一批之二——流程翻轉 ✅ 已完成（2026-10-07）

落實 D9。

| 內容 | 落點 |
|---|---|
| 可編 atlas 清單與挑選抽成純函式（白名單判斷因此可單測） | `utils/template.ts`：`parseEditableAtlasList()`、`pickDefaultAtlas()`、`loadEditableAtlasList()`、`resolveDefaultAtlas()` |
| 載入一包出廠 atlas 成為專案（唯一一條路徑，S0 挑選／CREATE NEW／手動匯入共用） | `utils/workspaceAtlas.ts`：`loadWorkspaceAtlasProject()` |
| 清單畫面兼任根畫面與覆蓋層（`root` 模式：不透明、動作鍵改 EXIT） | `screens/AtlasPickerScreen.ts`（原 `AtlasImportScreen`） |
| 開機進 S0，挑選後載入並進 S2，失敗退回 S1 | `SpriteEditor/index.ts`：`showAtlasPickerScreen()`、`openAtlas()` |
| APPLY 寫入目標改以使用者挑選為準 | `SpriteEditor/index.ts`：`resolveApplyAtlasId()` |
| `displayName` 加入資產契約，並隨 overlay 一起保存 | `assets/contract.ts`、`customization.ts` |
| nineslice 集中到 `ui_frame`；header 的 `hp-empty` 補進 animations；HEADER 進入清單（D10） | `configs/assets.json`、`configs/pet/header/core.json`、`configs/global/dialogue/core.json`、`components/SelectorBar.ts`、`Pet/elements/Header` |
| CREATE NEW 還原成目前這包的出廠版本，而非清空 | `LibraryScreen.enterCreateNew()` |

消除的重複：atlas 白名單過濾兩份 → 一份；atlas 載入兩份 → 一份；`assets.json` 路徑三處 → 一個常數。

**測試 63 個**（+12）：白名單的否定情境（`editable: 'yes'`、缺路徑、設定檔格式壞掉）、挑選的 fallback、「每個可編 atlas 都要有 displayName」，以及 D10 的不變量「可編 atlas 不得有幀落在 animations.json 之外」。白名單是編輯器能寫到哪裡的邊界，值得有否定測試。

### 第一批之三——導覽收斂成狀態機 🔶 進行中（2026-10-13）

**D11：畫面與底部選單由一張宣告表驅動。**

問題：底部那條原本有 **5 個 `ButtonBar` 實例，4 個在同一個 y**，靠一個叫 `nav-suppress` 的布林協調（LibraryScreen 裡由三個條件 or 起來，要在 6 處記得重算）。那個旗標存在的唯一理由就是所有權是散的。

做法：`navigation/` 三個檔。`registry.ts` 是唯一要讀的——每個畫面四格：`nav`（按鈕，含對齊）、`build`、`actions`（含 `confirm` 守衛）、`events`。

| | 改前 | 改後 |
|---|---|---|
| `ButtonBar` 實例 | 5 | 3（剩圖庫多選列、確認對話框） |
| `EditorScene` | 502 行 | 325 行，且不含任何「該顯示哪個畫面」 |
| LOAD DATA | 圖庫自己開的 overlay | 就是 picker 這個畫面（`root: false`） |

**三個刻意的設計決定**：

1. **不做 rerender。** Phaser 物件昂貴（全域 keydown、材質、DOM file input）。規則是「screen 身分變了才重建」，而 `go()` 一定重建不違反它——資料變動根本不會呼叫 `go()`。沒有 reconciler、沒有 key。
2. **`ViewState` 與 `EditorState` 分開。** 前者驅動重建，後者只是 render 的輸入。混在一起的話匯入一張圖會把顯示它的畫面拆掉重建。
3. **確認是轉移的守衛，不是狀態。** `actions.create.confirm` 回傳問句或 null，執行器統一處理。加十個需要確認的按鈕，狀態圖形狀不變。`pendingMenuAction` 這類平行變數消失。

### D12：素材管理搬進選幀畫面

**決定（2026-10-13）**：S3 自己就能增刪素材，不必為了「缺一張圖」離開畫面。去圖庫的那趟路因此取消（上一版加的 LIBRARY 按鈕隨之移除）。

**兩個模式，底部選單跟著走**：

| 模式 | 按鈕 |
|---|---|
| pick | CANCEL / OK(n) / ADD / EDIT |
| edit | DELETE(n) / CANCEL |

畫面只回報自己在哪個模式，按鈕由 registry 決定——沒有任何地方需要「記得換按鈕」。

**格子有唯一一種「選取」**，所以進 edit 模式會先把選幀結果停泊、出來再還原：勾選要刪的東西不該順手把它從動畫裡拿掉。

**已使用的幀排在最前面**，依幀順序。開啟時第一眼就是「這個動畫現在長什麼樣」，而不是一牆縮圖裡找答案。新匯入的圖接在最後，游標跟著跳過去——使用者剛要的東西要看得見。

**刪除有確認**，而且這是第一個真正跑起來的 overlay：`ScreenHost` 現在會畫出 `ConfirmDialog`，接走鍵盤（螢幕的輸入暫停，否則一次按鍵會同時回答問題和移動底下的游標），答完再還原。D11 設計的 `confirm` 守衛從此不只是宣告。

**共用的素材操作**抽到 `utils/imageLibrary.ts`：`ImageFilePicker`（擁有那個 DOM input 的生命週期）、`importImageFiles`、`deleteImages`。刪除必須三件事一起做——記錄、引用它的 sprite 幀、材質——少做一件就是懸空引用或材質洩漏，所以它是一個函式而不是三行。圖庫也改用同一份匯入，流水號改成從現有 id 推導，不再各自維護計數器。

**圖庫預設直接進素材畫面**（`startIn: 'edit'`）。專案一定是載入好的，進入選單等於問一個答案很明顯的問題。選單沒有廢除——LIBRARY 那顆按鈕仍然打得開，LOAD DATA / CREATE NEW 住在那裡。空圖庫會自動退回選單，因為沒有東西可編。

**快捷鍵也進表**：`shortcuts: { Escape: 'back' }` 和按鈕並列，一眼看得到哪個鍵做什麼。宣告而不強制會說謊，所以 dev 模式下建畫面時會檢查每個宣告的名字確實對應到一個 action 或 event，對不上就警告。

**尚未收進堆疊**：圖庫的多選列與 `ConfirmDialog` 仍自有 bar，`nav-suppress` 作為暫時的橋還在（`ScreenHost.setNavSuppressed`，註解已標明）。

### 第二批——介面重寫 ⬜ 未開始

| 層 | 內容 | 相依 |
|---|---|---|
| L4 + L6 | 角色櫃 + 格子表；進入選單、專案名稱、ADD SPRITE 移除 | 已解除封鎖（排版沿用 `GridSelector`） |
| L5 | 接上既有的 overlay 機制（本身不用改） | — |

要連帶處理 2.4 表中的資料遺失問題（APPLY 整包重建、匯入掉幀）。

現有 UI 的去留評估（第二批開工時的起點）：

| 畫面 | 現況 | 新架構下 |
|---|---|---|
| S3 選幀 | 134 行 | 加格子名標題與預覽；加 add cell，可就地匯入新圖（刪除仍留在 S1——選幀畫面看不到那張圖還被哪些格子用著） |
| `SpriteCard` | 509 行 | 拿掉 COPY / DELETE 就是格子列（名字本來就是唯讀標籤） |
| S2 卡片列表 | 489 行 | 大幅變少——新增／刪除／複製／ADD 列都不需要 |
| `GridSelector` | 435 行 | 完全沿用 |
| S1 圖庫 | 865 行 | 改動最大：進入選單、專案名稱、proceed、depose 確認都消失；縮圖格與檔案匯入留著 |

淨程式碼大概率變少。

advanced（可寫 L3 + 行為設定）不在這兩批裡，是之後的獨立階段。

---

## 附錄：名詞

| 詞 | 意思 |
|---|---|
| atlas | 一包 `spritesheet.png` + `spritesheet.json` + `animations.json`，由 `atlasId` 識別 |
| prefix | 動畫名，同時是幀名的前綴。遊戲用它來引用動畫 |
| 格子（slot） | 模板宣告的「這個角色需要這個名字的動畫」，使用者只負責填圖 |
| 模板 | 預設角色的 `animations.json`，格子清單與預設參數的來源 |
| overlay | 存在 localStorage、蓋在出廠 atlas 上的自訂版本。key 就是原本的 atlasId |
| L1–L6 | 層次架構的六層，見第四節 |
| standard | 只寫 L4→L5 的編輯深度：換圖、調參數，不需要命名 |
| advanced | 還要寫 L3 與行為設定的編輯深度：多版本、新增動作。目前不在範圍內 |
