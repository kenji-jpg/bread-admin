-- 更新 LINE 官方帳號 ID
-- 請在 Supabase Dashboard → SQL Editor 執行

-- 先查看你的租戶
SELECT id, name, slug, line_oa_id FROM tenants;

-- 找到你的 tenant_id 後，執行下面這行（把 YOUR_TENANT_ID 換成實際的 UUID）
-- UPDATE tenants SET line_oa_id = '@530rmasi' WHERE slug = '你的店家slug';

-- 或者如果你知道 tenant_id：
-- UPDATE tenants SET line_oa_id = '@530rmasi' WHERE id = 'YOUR_TENANT_ID';
