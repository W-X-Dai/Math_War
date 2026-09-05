# 開發參數

`src/config/` 是遊戲參數的單一開發入口。調整數值時依責任修改下列檔案，遊戲邏輯與 Vue 元件不應再另寫同一份數字。

| 檔案 | 負責內容 |
| --- | --- |
| `content.js` | 軍械、敵人、章節、棋盤、queue、工坊常數與公式卡。 |
| `gameplay.js` | 初始狀態、經濟、半價回收、整備、戰鬥、幾何、效果時間與模擬步長。 |
| `generation.js` | 程序敵人家族、逐路反制、分段遭遇、公式限制、變異、報酬、危險度與無限單軸成長。 |
| `presentation.js` | 音效、戰場呈現，以及敵人公式卡的長度門檻、寬高、padding、字級與邊界行為。 |
| `tutorial.js` | 敵人介紹文字、六章固定教學波、出場安排、起始資源與預置塔。 |
| `index.js` | 統一匯出；需要檢視所有參數時從這裡開始。 |

## 敵人公式卡

敵卡尺寸集中在 `PRESENTATION_CONFIG.enemyCard`。`profiles.wide`、`compact`、`narrow` 分別對應現有桌面、`900px` 以下與 `520px` 以下的版面規則。Vue 會把這些值轉成 CSS custom properties；CSS 只負責在既有 breakpoint 切換 profile。

公式不再使用 ellipsis 或固定行數裁切。`formulaLength.long`、`veryLong`、`extreme` 只控制逐級縮小字體，完整文字仍會換行顯示。`.enemy` 的 `44px` 操作錨點保持不變，只有外層公式卡依內容放大。

`clustering` 控制同一路相近敵人的水平與逐張垂直錯位；最上、最下路會利用其下方保留空間展開，避免放大後的卡片撞上 queue 狀態列或其他路線。卡片錨點依敵人在路線上的比例平滑移動，因此在中間位置與左右邊界都不會被戰場裁掉。`battlefield.laneArea` 則控制敵人、砲台與公式彈頭共用的視覺路線範圍，調整時應一起做瀏覽器驗收。

## 調整約束

- 時間、容量、生命與尺寸必須為正值；機率與比例應維持在合理範圍。
- `operator` queue 容量目前不可超過九張，因鍵盤快捷鍵使用單一數字鍵。
- 教學起始 queue 不可超過對應容量；正式段的保障補給可暫時超量，隨機補牌必須在 queue 回到容量以下才恢復。
- 有限章每章必須保有辨識教學，以及 `pressure`、`mixed` 兩個正式段；只有壓力段發放該章一次性的提早開始獎勵。
- 每個正式段的 `counterRequirements` 必須能由 `guaranteedSupply` 的軍械及逐組公式／`k` 精確組出，不能只提高必要材料的隨機機率。
- 同一路在同一正式段中必須維持同一反制需求；普通敵人最多一種專用反制或兩步組合，有限章每隻敵人最多一種變異。
- 多變數不額外提高 x 次方；普通三角式保持同頻，普通指數式保持單一成長率，分裂子怪必須沿用原防線可處理的基底。
- 棋盤必須滿足 `0 < placeableColumns <= columns`。
- `projectileImpactLingerSeconds` 必須至少覆蓋 presentation 的命中動畫時間。
- 生成器數值會影響同 seed 的關卡內容；改動後應更新固定 seed golden test，並把相容影響記錄在 devlog。
- RNG hash、浮點 epsilon 與數學正規化精度屬演算法不變量，不是平衡參數，刻意留在其實作模組。

`CHAPTERS[].segments[].guaranteedSupply` 是內容側的最低設計規格；實際 finite wave 會依該 seed 啟用的路線產生精確 `counterRequirements`，再輸出同次數、同參數的 `wave.guaranteedSupply`。整備 UI 只讀 `summary.lanes` 的函數族、範圍與可能變異，不應顯示 entry 的完整公式、係數或 `spawnAt`。

設定物件會在載入時遞迴凍結，避免執行期間被 Vue 或遊戲狀態意外改寫。要調整預設值請直接修改設定來源並重新執行 `npm test`。
