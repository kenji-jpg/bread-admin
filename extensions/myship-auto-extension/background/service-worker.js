// ============================================
// Background Service Worker
// 負責：Supabase API 呼叫、狀態管理、訊息中轉
// ============================================

const SUPABASE_URL = 'https://kashgsxlrdyuirijocld.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthc2hnc3hscmR5dWlyaWpvY2xkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NzcxODcsImV4cCI6MjA4MzU1MzE4N30.cv4DXPTlAHc2owlMQvSvFNdSI8mFHVq2YdjQ71mh3Rk';

let supabaseKey = SUPABASE_ANON_KEY;
let accessToken = '';
let currentTenantId = '';

// 初始化：從 storage 讀取設定
chrome.runtime.onInstalled.addListener(() => {
  console.log('[MyShip Auto] Extension installed');
});

// 監聽來自 popup / content script 的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message, sender).then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // 保持非同步 sendResponse
  }
  return false;
});

const messageHandlers = {
  // 登入
  LOGIN: async (msg) => {
    const { email, password } = msg;
    supabaseKey = SUPABASE_ANON_KEY;

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);

    accessToken = data.access_token;
    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      supabaseKey,
      user: { id: data.user.id, email: data.user.email },
    });
    return { success: true, user: data.user };
  },

  // 取得使用者的租戶列表（不需要先選店家）
  GET_TENANTS: async () => {
    await ensureLogin();
    const data = await rpc('get_user_tenants_v1', {});
    return { success: true, tenants: data };
  },

  // 設定目前操作的租戶
  SET_TENANT: async (msg) => {
    currentTenantId = msg.tenantId;
    await chrome.storage.local.set({ currentTenantId });
    return { success: true };
  },

  // 取得待處理的 myship checkout 列表（自動取所有分頁）
  // 不傳 p_shipping_method，因為大部分結帳單的 shipping_method 是 NULL（前端預設為 myship）
  GET_PENDING_CHECKOUTS: async () => {
    await ensureAuth();
    const PAGE_SIZE = 50;
    let allCheckouts = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const data = await rpc('list_checkouts_v1', {
        p_tenant_id: currentTenantId,
        p_shipping_status: 'pending',
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });

      // RPC 回傳 { checkouts: [...], total, limit, offset } 或直接陣列
      let checkouts = data;
      let total = 0;
      if (data && !Array.isArray(data)) {
        checkouts = data.checkouts || [];
        total = data.total || 0;
      }
      if (!Array.isArray(checkouts)) checkouts = [];

      allCheckouts = allCheckouts.concat(checkouts);
      offset += PAGE_SIZE;

      // 判斷是否還有下一頁
      if (total > 0) {
        hasMore = offset < total;
      } else {
        hasMore = checkouts.length === PAGE_SIZE;
      }
    }

    // Client-side 過濾：只保留賣貨便系列（含免運）
    const myshipCheckouts = allCheckouts.filter(c =>
      !c.shipping_method || c.shipping_method === 'myship' || c.shipping_method === 'myship_free'
    );

    return { success: true, checkouts: myshipCheckouts, total: myshipCheckouts.length };
  },

  // 取得單筆 checkout 詳情（含 order items）
  GET_CHECKOUT_DETAIL: async (msg) => {
    await ensureAuth();
    const data = await rpc('get_checkout_detail_v1', {
      p_tenant_id: currentTenantId,
      p_checkout_id: msg.checkoutId,
    });
    return { success: true, detail: data };
  },

  // 上架成功後，回填 store_url 並觸發 LINE 通知
  SET_STORE_URL: async (msg) => {
    await ensureAuth();
    const { checkoutId, storeUrl, checkoutNo, customerName, memberNickname } = msg;
    let myshipStoreName = `${checkoutNo}_${customerName || '客人'}`;
    if (memberNickname) {
      myshipStoreName += `(${memberNickname})`;
    }
    myshipStoreName = myshipStoreName.substring(0, 50);

    // 呼叫 Edge Function: notify-myship-url
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-myship-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        tenant_id: currentTenantId,
        checkout_id: checkoutId,
        store_url: storeUrl,
        myship_store_name: myshipStoreName,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || data.message || '回填失敗');
    return { success: true, notifyStatus: data.notify_status, data };
  },

  // 儲存處理中的佇列
  SAVE_QUEUE: async (msg) => {
    await chrome.storage.local.set({ processingQueue: msg.queue });
    return { success: true };
  },

  // 讀取處理佇列
  GET_QUEUE: async () => {
    const result = await chrome.storage.local.get('processingQueue');
    return { success: true, queue: result.processingQueue || [] };
  },

  // 更新佇列中某筆的狀態
  UPDATE_QUEUE_ITEM: async (msg) => {
    const result = await chrome.storage.local.get('processingQueue');
    const queue = result.processingQueue || [];
    const idx = queue.findIndex(q => q.checkoutId === msg.checkoutId);
    if (idx >= 0) {
      queue[idx] = { ...queue[idx], ...msg.updates };
      await chrome.storage.local.set({ processingQueue: queue });
    }
    return { success: true };
  },

  // 取得目前的登入狀態
  GET_AUTH_STATE: async () => {
    const result = await chrome.storage.local.get([
      'accessToken', 'supabaseKey', 'user', 'currentTenantId'
    ]);
    accessToken = result.accessToken || '';
    supabaseKey = result.supabaseKey || '';
    currentTenantId = result.currentTenantId || '';
    return {
      success: true,
      isLoggedIn: !!accessToken,
      user: result.user || null,
      currentTenantId,
    };
  },

  // 登出
  LOGOUT: async () => {
    accessToken = '';
    supabaseKey = '';
    currentTenantId = '';
    await chrome.storage.local.clear();
    return { success: true };
  },
};

// ============================================
// 工具函數
// ============================================

async function ensureLogin() {
  if (!accessToken || !supabaseKey) {
    const result = await chrome.storage.local.get(['accessToken', 'supabaseKey']);
    accessToken = result.accessToken || '';
    supabaseKey = result.supabaseKey || SUPABASE_ANON_KEY;
  }
  if (!accessToken) throw new Error('未登入');
}

async function ensureAuth() {
  if (!accessToken || !supabaseKey) {
    const result = await chrome.storage.local.get(['accessToken', 'supabaseKey', 'currentTenantId']);
    accessToken = result.accessToken || '';
    supabaseKey = result.supabaseKey || '';
    currentTenantId = result.currentTenantId || '';
  }
  if (!accessToken) throw new Error('未登入');
  if (!currentTenantId) throw new Error('未選擇店家');
}

async function rpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `RPC ${fnName} failed: ${res.status}`);
  }
  return res.json();
}
