#!/bin/bash

# Email 驗證功能測試腳本
# 使用方式：bash scripts/test-email-verification.sh

echo "🧪 Email 驗證功能測試"
echo "===================="
echo ""

# 顏色定義
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 測試 1：檢查現有用戶驗證狀態
echo "📊 測試 1：檢查現有用戶驗證狀態"
echo "執行檢查腳本..."
npx tsx scripts/check-email-verification.ts
echo ""

# 測試 2：檢查程式碼是否有重發功能
echo "📝 測試 2：檢查程式碼實作"
echo ""

if grep -q "handleResendVerification" app/register/page.tsx; then
    echo -e "${GREEN}✅ 註冊頁面已加入重發功能${NC}"
else
    echo -e "${RED}❌ 註冊頁面缺少重發功能${NC}"
fi

if grep -q "resend" app/register/page.tsx; then
    echo -e "${GREEN}✅ 使用 supabase.auth.resend()${NC}"
else
    echo -e "${RED}❌ 缺少 resend 實作${NC}"
fi

if grep -q "Email not confirmed" app/login/page.tsx; then
    echo -e "${GREEN}✅ 登入頁面有友善錯誤訊息${NC}"
else
    echo -e "${RED}❌ 登入頁面錯誤訊息未優化${NC}"
fi

echo ""

# 測試 3：提供手動測試指引
echo "🧪 測試 3：手動測試流程"
echo ""
echo "請依照以下步驟進行測試："
echo ""
echo "1️⃣  前往註冊頁面："
echo "   ${YELLOW}https://www.plushub.cc/register${NC}"
echo ""
echo "2️⃣  使用臨時信箱註冊（建議使用）："
echo "   ${YELLOW}https://temp-mail.org${NC}"
echo "   或 ${YELLOW}https://10minutemail.com${NC}"
echo ""
echo "3️⃣  註冊後，不要點驗證連結，直接嘗試登入："
echo "   ${YELLOW}https://www.plushub.cc/login${NC}"
echo ""
echo "4️⃣  預期結果："
echo -e "   ${GREEN}✅ 應該顯示：「請先驗證您的 Email...」${NC}"
echo -e "   ${RED}❌ 如果能直接登入，表示 Supabase 設定有問題${NC}"
echo ""
echo "5️⃣  返回註冊成功頁面，點擊「重新發送驗證信」"
echo ""
echo "6️⃣  確認收到新的驗證信"
echo ""
echo "7️⃣  點擊驗證連結，應該能成功登入"
echo ""

# 測試 4：提供 Supabase 設定檢查
echo "⚙️  測試 4：Supabase 設定檢查"
echo ""
echo "請手動確認以下設定："
echo ""
echo "1. 前往 Supabase Dashboard："
echo "   ${YELLOW}https://supabase.com/dashboard/project/kashgsxlrdyuirijocld/auth/providers${NC}"
echo ""
echo "2. 路徑：Authentication → Settings → Email Auth"
echo ""
echo "3. 確認以下選項已勾選："
echo "   ☑️  Enable email confirmations"
echo ""
echo "4. 點擊 Save 儲存"
echo ""

# 總結
echo "📋 總結"
echo "======"
echo ""
echo "✅ 已完成項目："
echo "   - 重新發送驗證信功能"
echo "   - 優化登入錯誤訊息"
echo "   - 檢查腳本"
echo "   - 完整文件"
echo ""
echo "⚠️  待確認項目："
echo "   - Supabase 'Enable email confirmations' 設定"
echo "   - 手動測試驗證流程"
echo ""
echo "📖 詳細說明請參考："
echo "   - ${YELLOW}docs/email-verification-guide.md${NC}"
echo "   - ${YELLOW}EMAIL_VERIFICATION_UPDATE.md${NC}"
echo ""
