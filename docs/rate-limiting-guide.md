# Rate Limiting 功能指南

## ✅ 已完成的保護

### 1. 資料庫架構

已建立 `rate_limit_log` 表來記錄所有 API 呼叫：

```sql
CREATE TABLE public.rate_limit_log (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,      -- 執行操作的用戶
    action TEXT NOT NULL,        -- 操作類型
    tenant_id UUID,              -- 租戶 ID（可選）
    created_at TIMESTAMPTZ       -- 操作時間
);
```

### 2. 核心函數

**`check_rate_limit(action, max_requests, window_minutes, tenant_id)`**
- 檢查用戶在時間窗口內的請求次數
- 超過限制自動拋出錯誤
- 自動記錄每次請求

**`cleanup_old_rate_limit_logs()`**
- 清理 24 小時前的舊記錄
- 建議設定 Cron Job 每天執行

### 3. 已保護的 RPC 函數

| 函數 | 限制 | 說明 |
|------|------|------|
| `create_product_v2` | **10 次/分鐘** | 建立商品 |
| `create_checkout_v2` | **5 次/分鐘** | 建立結帳單 |
| `create_preorder_v1` | **20 次/分鐘** | LIFF 顧客下單（較寬鬆） |

---

## 🛡️ Rate Limiting 規則

### 商品管理（create_product_v2）

```
限制：10 次/分鐘
適用：後台管理員建立商品
```

**為什麼是 10 次？**
- 正常使用：管理員通常 1-2 分鐘建立 1-2 個商品
- 批量匯入：可在 1 分鐘內快速建立 10 個商品
- 防止濫用：阻擋惡意腳本瞬間建立數千個垃圾商品

**錯誤訊息**：
```json
{
  "success": false,
  "error": "rate_limit_exceeded",
  "message": "請求過於頻繁，請 1 分鐘後再試（限制：10 次/1分鐘）"
}
```

---

### 結帳管理（create_checkout_v2）

```
限制：5 次/分鐘
適用：後台管理員手動建立結帳單
```

**為什麼是 5 次？**
- 正常使用：管理員幫客戶結帳，通常慢慢操作
- 防止錯誤：避免手誤連點造成重複結帳
- 防止濫用：阻擋惡意建立大量假結帳單

---

### LIFF 下單（create_preorder_v1）

```
限制：20 次/分鐘
適用：LIFF 商城顧客下單
```

**為什麼是 20 次？**
- 正常使用：顧客在商城瀏覽+下單，可能快速點擊多個商品
- 給予彈性：避免誤殺正常的快速下單行為
- 防止濫用：仍能阻擋惡意腳本瘋狂下單

---

## 📊 監控與維護

### 查看 Rate Limit 記錄

```sql
-- 查看最近 10 分鐘的 Rate Limit 記錄
SELECT
    user_id,
    action,
    COUNT(*) as request_count,
    MIN(created_at) as first_request,
    MAX(created_at) as last_request
FROM rate_limit_log
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY user_id, action
ORDER BY request_count DESC;
```

### 查看誰最常觸發 Rate Limit

```sql
-- 統計過去 1 小時內請求最多的用戶
SELECT
    u.email,
    rl.action,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE rl.created_at > NOW() - INTERVAL '1 minute') as recent_requests
FROM rate_limit_log rl
JOIN auth.users u ON u.id = rl.user_id
WHERE rl.created_at > NOW() - INTERVAL '1 hour'
GROUP BY u.email, rl.action
HAVING COUNT(*) > 50  -- 超過 50 次請求的用戶
ORDER BY total_requests DESC;
```

### 自動清理舊記錄

建議使用 Supabase Cron Extension（需 Pro Plan）：

```sql
-- 每天凌晨 2 點清理舊記錄
SELECT cron.schedule(
    'cleanup-rate-limit-logs',
    '0 2 * * *',  -- 每天 02:00
    $$SELECT cleanup_old_rate_limit_logs()$$
);
```

**或手動執行**：
```sql
SELECT cleanup_old_rate_limit_logs();
```

---

## 🧪 測試 Rate Limiting

### 測試腳本

建立測試檔案 `scripts/test-rate-limiting.ts`：

```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

async function testRateLimit() {
    console.log('🧪 測試 Rate Limiting...\n')

    const tenantId = 'your-tenant-id'  // 替換成實際的 tenant_id

    // 測試 create_product_v2（限制：10 次/分鐘）
    console.log('📦 測試建立商品 Rate Limit（10 次/分鐘）')

    for (let i = 1; i <= 12; i++) {
        const { data, error } = await supabase.rpc('create_product_v2', {
            p_tenant_id: tenantId,
            p_name: `測試商品 ${i}`,
            p_price: 100,
            p_stock: 10,
        })

        if (error || data?.error) {
            console.log(`❌ 第 ${i} 次：${data?.message || error?.message}`)
            break
        } else {
            console.log(`✅ 第 ${i} 次：成功建立商品 ${data.sku}`)
        }

        // 稍微延遲避免太快
        await new Promise((resolve) => setTimeout(resolve, 100))
    }

    console.log('\n⏰ 等待 60 秒後重試...')
    await new Promise((resolve) => setTimeout(resolve, 60000))

    console.log('\n🔄 60 秒後重試')
    const { data, error } = await supabase.rpc('create_product_v2', {
        p_tenant_id: tenantId,
        p_name: '測試商品 (60秒後)',
        p_price: 100,
        p_stock: 10,
    })

    if (error || data?.error) {
        console.log(`❌ 重試失敗：${data?.message || error?.message}`)
    } else {
        console.log(`✅ 重試成功：${data.sku}`)
    }
}

testRateLimit()
```

**執行測試**：
```bash
npx tsx scripts/test-rate-limiting.ts
```

**預期結果**：
```
📦 測試建立商品 Rate Limit（10 次/分鐘）
✅ 第 1 次：成功建立商品 260214-1
✅ 第 2 次：成功建立商品 260214-2
...
✅ 第 10 次：成功建立商品 260214-10
❌ 第 11 次：請求過於頻繁，請 1 分鐘後再試（限制：10 次/1分鐘）

⏰ 等待 60 秒後重試...
🔄 60 秒後重試
✅ 重試成功：260214-11
```

---

## 🔧 調整 Rate Limit 設定

如果需要調整限制（例如改成 15 次/分鐘），修改 RPC 函數：

```sql
-- 修改 create_product_v2 的限制為 15 次/分鐘
CREATE OR REPLACE FUNCTION public.create_product_v2(...)
RETURNS jsonb
AS $function$
BEGIN
    -- 改這裡的參數
    PERFORM public.check_rate_limit('create_product', 15, 1, p_tenant_id);
    --                                                 ^^^ 改成 15
    ...
END;
$function$;
```

---

## 📈 效能影響

### 查詢成本

每次呼叫 RPC 會多執行：
```sql
-- 1. 計算請求次數（索引查詢，快）
SELECT COUNT(*) FROM rate_limit_log
WHERE user_id = ? AND action = ? AND created_at > ?

-- 2. 插入記錄（單筆寫入，快）
INSERT INTO rate_limit_log (...)
```

**效能評估**：
- 額外延遲：< 5ms（有索引）
- 儲存空間：每筆記錄約 100 bytes
- 每天 10,000 次請求 ≈ 1 MB/day

### 優化建議

1. **定期清理**：每天執行 `cleanup_old_rate_limit_logs()`
2. **索引已建立**：`idx_rate_limit_log_user_action`
3. **24 小時保留**：足夠追蹤問題，不會累積太多資料

---

## 🚨 常見問題

### Q: 為什麼我被限制了？

**A**: 檢查你在 1 分鐘內的請求次數：

```sql
SELECT COUNT(*) as my_requests
FROM rate_limit_log
WHERE user_id = auth.uid()
  AND action = 'create_product'
  AND created_at > NOW() - INTERVAL '1 minute';
```

### Q: 可以臨時解除限制嗎？

**A**: Super Admin 可以清除記錄（不建議）：

```sql
-- 清除特定用戶的 Rate Limit 記錄
DELETE FROM rate_limit_log
WHERE user_id = 'user-id-here'
  AND action = 'create_product'
  AND created_at > NOW() - INTERVAL '1 minute';
```

### Q: 限制太嚴格，正常用戶也被擋了怎麼辦？

**A**: 調整限制參數（見「調整 Rate Limit 設定」章節）

---

## 🎯 未來擴充建議

### Phase 1（已完成）
- ✅ `create_product_v2`
- ✅ `create_checkout_v2`
- ✅ `create_preorder_v1`

### Phase 2（建議新增）
- ⚠️ `update_product_v1` — 10 次/分鐘
- ⚠️ `batch_delete_products_v1` — 5 次/分鐘
- ⚠️ `restock_product_v2` — 20 次/分鐘
- ⚠️ `add_shop_product_v1` — 10 次/分鐘（LIFF staff）

### Phase 3（Upstash 升級）
- 改用 Upstash Redis（更快、更強大）
- 支援更複雜的限制策略（滑動視窗、Token Bucket）
- 跨 Edge Function 共享 Rate Limit 狀態

---

## 📚 參考資料

- [Supabase RLS 文件](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Security Definer](https://www.postgresql.org/docs/current/sql-createfunction.html)
- [Rate Limiting 演算法](https://en.wikipedia.org/wiki/Rate_limiting)

---

**建立日期**：2026-02-14
**版本**：v1.0
**狀態**：✅ 已上線
