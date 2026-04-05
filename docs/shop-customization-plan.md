# PlusHub 商城客製化計畫書

> 版本：v1.0 | 日期：2026-04-05

## 目標

讓每個租戶（店家）能透過管理台自行設定商城的外觀、文案、品牌形象，無需開發介入。

---

## 一、現況分析

### 已可設定（管理台已有 UI）

| 項目 | 儲存位置 | 設定入口 |
|------|---------|---------|
| Banner 圖片 + 位置/縮放 | `tenants.settings` | `/admin/t/[slug]/shop` |
| 公告文字（跑馬燈） | `tenants.settings.announcement` | `/admin/t/[slug]/shop` |
| 購物須知 | `tenants.settings.shopping_notice` | `/admin/t/[slug]/shop` |
| 主題色（8 色選擇） | `tenants.settings.accent_color` | `/admin/t/[slug]/shop` |
| 商品排序方式 | `tenants.settings.product_sort` | `/admin/t/[slug]/shop` |
| 商城分類標籤 | `shop_categories` 表 | `/admin/t/[slug]/shop` |
| 維護模式開關 | `tenants.settings.maintenance` | `/admin/t/[slug]/shop` |

### 目前寫死（需要改為可設定）

| 項目 | 目前寫死值 | 影響範圍 |
|------|----------|---------|
| 店家 Logo | `/shop-logo.jpg`（固定檔案） | Top Bar 左側 |
| LINE OA ID | `@530rmasi`（寫死在程式碼） | 加好友 Modal |
| 預設主題色 | `#D94E2B`（寫死 fallback） | 所有未設主題色的店家 |
| 狀態文字 | 「營業中」（寫死） | Top Bar |
| 背景色系 | `#FFFBF7`, `#FFF8F0` 等 | 頁面背景、卡片 |
| 文字色系 | `#4A2C17`, `#8B6B4A` 等 | 全站文字 |

---

## 二、客製化功能規劃

### P0：必做（影響多租戶運營）

#### 1. 店家 Logo 上傳
- **現況**：寫死 `/shop-logo.jpg`，所有店家共用同一張圖
- **方案**：
  - `tenants.settings` 新增 `logo_url` 欄位
  - 管理台商城設定頁新增 Logo 上傳區（圓形預覽）
  - 上傳到 Supabase Storage `product-images/{tenant_id}/logo.webp`
  - 前端 Top Bar 讀取 `tenant.settings.logo_url`，無設定時顯示 Store icon
- **預估**：2 小時

#### 2. LINE OA ID 動態化
- **現況**：寫死 `@530rmasi`，只有一家店能用好友檢查
- **方案**：
  - `tenants` 表已有 `line_oa_id` 欄位（確認）或新增
  - 加好友 Modal 讀取 `tenant.line_oa_id`
  - 管理台設定頁新增 LINE OA ID 輸入框
  - Edge Function `check-line-friendship` 不受影響（已用 tenant 的 token）
- **預估**：1 小時

#### 3. 預設主題色改為租戶設定
- **現況**：未設主題色時 fallback 到 `#D94E2B`
- **方案**：
  - 已有 `accent_color` 設定機制
  - 只需確保所有 fallback `#D94E2B` 改讀 `accentColor`（已大致完成）
  - 新增更多色票選項或開放自訂色碼
- **預估**：1 小時

---

### P1：重要（提升品牌感）

#### 4. 自訂文案區塊
- **現況**：「營業中」、購物須知標題等文字寫死
- **方案**：
  - `tenants.settings` 新增：
    ```json
    {
      "shop_status_text": "營業中",        // 預設「營業中」
      "shop_title": "歡迎光臨",            // 商城標題（可選）
      "checkout_success_text": "感謝您的訂購！" // 下單成功文案
    }
    ```
  - 管理台新增「文案設定」區塊
- **預估**：2 小時

#### 5. 色彩主題系統（進階）
- **現況**：背景色、文字色、卡片色等散落在程式碼各處
- **方案**：
  - 定義色彩 token：
    ```json
    {
      "theme": {
        "bg": "#ffffff",           // 頁面背景
        "card_bg": "#ffffff",      // 商品卡背景
        "text_primary": "#2c2c2c", // 主要文字
        "text_secondary": "#6B7280", // 次要文字
        "border": "#E5E7EB"        // 邊框
      }
    }
    ```
  - 提供 3-5 個預設主題（淺色 / 暖色 / 冷色 / 深色）
  - 管理台一鍵切換主題
  - 前端用 CSS 變數統一管理
- **預估**：4 小時

#### 6. 商城 Footer 自訂
- **現況**：無 footer
- **方案**：
  - 可設定的 footer 內容：聯絡資訊、社群連結、營業時間
  - `tenants.settings` 新增：
    ```json
    {
      "footer": {
        "contact": "LINE: @530rmasi",
        "hours": "週一至週五 10:00-18:00",
        "social_links": [
          { "type": "instagram", "url": "https://..." }
        ]
      }
    }
    ```
- **預估**：3 小時

---

### P2：加分（差異化體驗）

#### 7. 自訂商品卡佈局
- **現況**：固定 4 欄、5:4 圖片比例
- **方案**：
  - 可選佈局：2 欄大圖 / 3 欄 / 4 欄 / 列表模式
  - 可選圖片比例：1:1 / 5:4 / 4:3 / 16:9
  - `tenants.settings` 新增 `grid_columns`、`image_ratio`
- **預估**：3 小時

#### 8. 歡迎頁 / Landing 區塊
- **現況**：進入商城直接看到商品
- **方案**：
  - 可選的 Hero 區塊：大圖 + 標語 + CTA 按鈕
  - `tenants.settings` 新增：
    ```json
    {
      "hero": {
        "enabled": true,
        "image_url": "https://...",
        "title": "新品上架中",
        "subtitle": "限時優惠 全館 85 折",
        "cta_text": "立即逛逛"
      }
    }
    ```
- **預估**：4 小時

#### 9. 自訂 Favicon / PWA 圖示
- **現況**：使用 PlusHub 預設 icon
- **方案**：
  - 讀取 `logo_url` 動態產生 favicon
  - 或管理台另外上傳 favicon
- **預估**：2 小時

#### 10. 多語系支援
- **現況**：全繁體中文寫死
- **方案**：
  - i18n 架構（繁中 / 簡中 / 日文 / 英文）
  - 管理台切換商城語系
- **預估**：8 小時（大工程）

---

## 三、管理台 UI 整合方案

### 現有的商城設定頁 `/admin/t/[slug]/shop`

建議在此頁面擴展，分為以下 Tab：

```
┌─────────────────────────────────────────────┐
│  商城設定                                    │
│                                             │
│  [外觀]  [文案]  [品牌]  [進階]              │
│                                             │
│  ═══════════════════════════════════════════ │
│                                             │
│  【外觀 Tab】                                │
│  ├─ 主題色選擇（含自訂色碼）                   │
│  ├─ 色彩主題（淺色/暖色/冷色）                 │
│  ├─ Banner 圖片上傳 + 位置調整                │
│  ├─ 商品格數（2/3/4 欄）                     │
│  └─ 圖片比例（1:1 / 5:4 / 4:3）             │
│                                             │
│  【文案 Tab】                                │
│  ├─ 公告文字（跑馬燈）                        │
│  ├─ 購物須知                                 │
│  ├─ 狀態文字（營業中 → 自訂）                  │
│  ├─ 下單成功提示語                            │
│  └─ Footer 資訊                              │
│                                             │
│  【品牌 Tab】                                │
│  ├─ 店家 Logo 上傳（圓形裁切）                 │
│  ├─ 店家名稱（已有）                          │
│  ├─ LINE OA ID                              │
│  └─ 社群連結                                 │
│                                             │
│  【進階 Tab】                                │
│  ├─ 維護模式開關                              │
│  ├─ 商品排序方式                              │
│  ├─ 分類管理                                 │
│  └─ Hero 區塊設定                            │
│                                             │
│              [儲存設定]                       │
└─────────────────────────────────────────────┘
```

---

## 四、資料庫變更

### `tenants.settings` JSONB 擴展

```json
{
  // === 已有 ===
  "banner_url": "https://...",
  "banner_scale": 1.0,
  "banner_position_x": 50,
  "banner_position_y": 50,
  "announcement": "公告文字",
  "shopping_notice": "購物須知",
  "accent_color": "#D94E2B",
  "product_sort": "created_at",
  "maintenance": false,

  // === P0 新增 ===
  "logo_url": "https://...",

  // === P1 新增 ===
  "shop_status_text": "營業中",
  "checkout_success_text": "感謝您的訂購！",
  "theme_preset": "light",
  "theme": {
    "bg": "#ffffff",
    "card_bg": "#ffffff",
    "text_primary": "#2c2c2c",
    "text_secondary": "#6B7280"
  },
  "footer": {
    "contact": "",
    "hours": "",
    "social_links": []
  },

  // === P2 新增 ===
  "grid_columns": 4,
  "image_ratio": "5:4",
  "hero": {
    "enabled": false,
    "image_url": "",
    "title": "",
    "subtitle": "",
    "cta_text": ""
  }
}
```

### `tenants` 表新增欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `line_oa_id` | `text` | LINE OA ID（如 `@530rmasi`）|

> 注意：需要 `GRANT SELECT (line_oa_id) ON public.tenants TO authenticated, anon;`

---

## 五、實作優先順序與時程

| 階段 | 項目 | 預估時間 | 優先級 |
|------|------|---------|--------|
| P0-1 | 店家 Logo 上傳 | 2 hr | 🔴 |
| P0-2 | LINE OA ID 動態化 | 1 hr | 🔴 |
| P0-3 | 主題色 fallback 修正 | 1 hr | 🔴 |
| P1-1 | 自訂文案（狀態/成功提示） | 2 hr | 🟡 |
| P1-2 | 色彩主題系統 | 4 hr | 🟡 |
| P1-3 | 商城 Footer | 3 hr | 🟡 |
| P2-1 | 商品卡佈局選擇 | 3 hr | 🟢 |
| P2-2 | Hero 歡迎區塊 | 4 hr | 🟢 |
| P2-3 | Favicon / PWA | 2 hr | 🟢 |
| P2-4 | 多語系 | 8 hr | 🟢 |

**P0 總計：4 小時**（上線前必做）
**P1 總計：9 小時**（上線後一週內）
**P2 總計：17 小時**（依需求排程）

---

## 六、技術注意事項

1. **新增 `tenants` 欄位需手動 GRANT SELECT**
   - 因為 `tenants` 表有 column-level REVOKE（隱藏 LINE token）
   - 每個新欄位都需要 `GRANT SELECT (欄位) ON public.tenants TO authenticated, anon;`

2. **圖片上傳統一路徑**
   - Logo: `product-images/{tenant_id}/logo.webp`
   - Banner: 已有路徑
   - 壓縮規格：WebP, 400px max width, 0.7 quality

3. **CSS 變數化**
   - 目前顏色散落在 inline style 各處
   - 建議用 CSS custom properties 統一管理：
     ```css
     --shop-accent: {accent_color};
     --shop-bg: {theme.bg};
     --shop-text: {theme.text_primary};
     ```

4. **RPC 更新**
   - `update_shop_settings_v1` 已存在，只需前端傳入新欄位即可
   - 不需要新增 RPC

---

## 七、驗收標準

- [ ] 每個租戶可上傳自己的 Logo，在商城 Top Bar 正確顯示
- [ ] LINE OA ID 從資料庫讀取，好友檢查功能正常
- [ ] 主題色在所有 UI 元素一致套用
- [ ] 管理台設定頁 UI 直覺易用
- [ ] 手機版 / 桌面版設定效果一致
- [ ] 設定變更即時反映（不需重新部署）
