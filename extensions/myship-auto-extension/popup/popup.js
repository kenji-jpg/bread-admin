// ============================================
// Popup Script
// 負責：登入、選擇租戶、顯示待處理列表、啟動自動化、顯示執行進度
// ============================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// DOM 元素
const loginSection = $('#loginSection');
const tenantSection = $('#tenantSection');
const checkoutSection = $('#checkoutSection');
const progressSection = $('#progressSection');

let selectedCheckouts = [];
let allCheckouts = [];
let searchKeyword = '';
let progressPollTimer = null;

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  // 檢查登入狀態
  const authState = await sendMessage({ type: 'GET_AUTH_STATE' });

  if (authState.isLoggedIn) {
    // 先檢查是否有正在執行的佇列
    const queueResult = await sendMessage({ type: 'GET_QUEUE' });
    const queue = queueResult.queue || [];
    const hasActiveQueue = queue.length > 0 && queue.some(q => q.status === 'pending' || q.status === 'processing');

    if (hasActiveQueue) {
      // 有執行中的任務 → 直接顯示進度
      showProgressSection(queue);
    } else if (authState.currentTenantId) {
      showCheckoutSection();
      loadCheckouts();
    } else {
      showTenantSection();
      loadTenants();
    }
    $('#logoutBtn').style.display = 'flex';
  } else {
    showLoginSection();
  }

  // 綁定事件
  $('#loginBtn').addEventListener('click', handleLogin);
  $('#confirmTenantBtn').addEventListener('click', handleConfirmTenant);
  $('#startBtn').addEventListener('click', handleStart);
  $('#refreshBtn').addEventListener('click', () => loadCheckouts());
  $('#logoutBtn').addEventListener('click', handleLogout);
  $('#selectAllCb').addEventListener('change', handleSelectAll);
  $('#selectTopHalfBtn').addEventListener('click', () => selectHalf('top'));
  $('#selectBottomHalfBtn').addEventListener('click', () => selectHalf('bottom'));
  $('#clearSelectBtn').addEventListener('click', clearSelection);
  $('#checkoutSearch').addEventListener('input', (e) => {
    searchKeyword = e.target.value.trim().toLowerCase();
    $('#clearSearchBtn').style.display = searchKeyword ? 'block' : 'none';
    renderCheckouts();
  });
  $('#clearSearchBtn').addEventListener('click', () => {
    $('#checkoutSearch').value = '';
    searchKeyword = '';
    $('#clearSearchBtn').style.display = 'none';
    renderCheckouts();
  });
  $('#tenantSelect').addEventListener('change', (e) => {
    $('#confirmTenantBtn').disabled = !e.target.value;
  });

  // Enter 鍵登入
  $('#passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // 進度頁面按鈕
  $('#backToListBtn').addEventListener('click', handleBackToList);
  $('#popupPauseBtn').addEventListener('click', handlePopupPause);
  $('#popupResumeBtn').addEventListener('click', handlePopupResume);
  $('#popupStopBtn').addEventListener('click', handlePopupStop);
});

// ============================================
// 登入
// ============================================
async function handleLogin() {
  const email = $('#emailInput').value.trim();
  const password = $('#passwordInput').value;

  if (!email || !password) {
    showError('#loginError', '請填寫 Email 和密碼');
    return;
  }

  $('#loginBtn').disabled = true;
  $('#loginBtn').textContent = '登入中...';
  hideError('#loginError');

  try {
    const result = await sendMessage({
      type: 'LOGIN',
      email,
      password,
    });

    if (!result.success) throw new Error(result.error);

    $('#logoutBtn').style.display = 'flex';
    showTenantSection();
    loadTenants();
  } catch (err) {
    showError('#loginError', err.message);
  } finally {
    $('#loginBtn').disabled = false;
    $('#loginBtn').textContent = '登入';
  }
}

// ============================================
// 租戶選擇
// ============================================
async function loadTenants() {
  try {
    const result = await sendMessage({ type: 'GET_TENANTS' });
    if (!result.success) throw new Error(result.error);

    const select = $('#tenantSelect');
    select.innerHTML = '<option value="">-- 請選擇 --</option>';

    // 層層解包找到 tenants 陣列
    let tenants = result.tenants;
    if (tenants && !Array.isArray(tenants) && tenants.tenants) {
      tenants = tenants.tenants;
    }
    if (!Array.isArray(tenants)) {
      console.error('Unexpected tenants format:', result);
      return;
    }

    tenants.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name || t.slug;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Load tenants error:', err);
  }
}

async function handleConfirmTenant() {
  const tenantId = $('#tenantSelect').value;
  if (!tenantId) return;

  await sendMessage({ type: 'SET_TENANT', tenantId });
  showCheckoutSection();
  loadCheckouts();
}

// ============================================
// 結帳單列表
// ============================================
async function loadCheckouts() {
  const listEl = $('#checkoutList');
  listEl.innerHTML = '<div class="loading">載入中...</div>';
  $('#startBtn').disabled = true;
  $('#totalInfo').style.display = 'none';
  $('#searchWrap').style.display = 'none';
  selectedCheckouts = [];
  searchKeyword = '';
  $('#checkoutSearch').value = '';
  $('#clearSearchBtn').style.display = 'none';
  updateSelectedInfo();

  try {
    const result = await sendMessage({ type: 'GET_PENDING_CHECKOUTS' });
    if (!result.success) throw new Error(result.error);

    let checkouts = result.checkouts;
    if (checkouts && !Array.isArray(checkouts) && checkouts.checkouts) {
      checkouts = checkouts.checkouts;
    }
    if (!Array.isArray(checkouts)) checkouts = [];

    allCheckouts = checkouts;

    if (checkouts.length === 0) {
      $('#totalInfo').textContent = `共 0 筆待處理`;
      $('#totalInfo').style.display = 'block';
      $('#selectAllWrap').style.display = 'none';
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#10003;</div>
          <div class="empty-text">沒有待處理的賣貨便結帳單</div>
        </div>`;
      return;
    }

    $('#searchWrap').style.display = 'flex';
    $('#selectAllWrap').style.display = 'flex';
    renderCheckouts();
  } catch (err) {
    listEl.innerHTML = `<div class="error-msg">${escHtml(err.message)}</div>`;
  }
}

// 依 searchKeyword 篩選 allCheckouts
function getFilteredCheckouts() {
  if (!searchKeyword) return allCheckouts;
  const kw = searchKeyword;
  return allCheckouts.filter(c => {
    const name = (c.customer_name || '').toLowerCase();
    const display = (c.member_display_name || '').toLowerCase();
    const nickname = (c.member_nickname || '').toLowerCase();
    return name.includes(kw) || display.includes(kw) || nickname.includes(kw);
  });
}

// 渲染（篩選後的）結帳單列表
function renderCheckouts() {
  const listEl = $('#checkoutList');
  const filtered = getFilteredCheckouts();
  const selectedIds = new Set(selectedCheckouts.map(s => s.id));

  const totalInfo = $('#totalInfo');
  if (searchKeyword) {
    totalInfo.textContent = `符合 ${filtered.length} / 共 ${allCheckouts.length} 筆`;
  } else {
    totalInfo.textContent = `共 ${allCheckouts.length} 筆待處理`;
  }
  totalInfo.style.display = 'block';

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128269;</div>
        <div class="empty-text">沒有符合的結帳單</div>
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'checkout-item';
    if (selectedIds.has(c.id)) item.classList.add('selected');
    item.dataset.id = c.id;
    const displayName = c.member_display_name || c.customer_name || '未知客人';
    const nickname = c.member_nickname ? ` (${c.member_nickname})` : '';
    item.innerHTML = `
      <input type="checkbox" data-id="${c.id}" ${selectedIds.has(c.id) ? 'checked' : ''}>
      <div class="item-info">
        <div class="item-name">${escHtml(displayName)}${escHtml(nickname)}</div>
        <div class="item-meta">${escHtml(c.checkout_no)} | ${c.item_count || '?'} 件商品</div>
      </div>
      <div class="item-amount">$${c.total_amount}</div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return;
      const cb = item.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });

    item.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      if (e.target.checked) {
        item.classList.add('selected');
        if (!selectedCheckouts.find(s => s.id === c.id)) selectedCheckouts.push(c);
      } else {
        item.classList.remove('selected');
        selectedCheckouts = selectedCheckouts.filter(s => s.id !== c.id);
      }
      updateSelectedInfo();
    });

    listEl.appendChild(item);
  });
}

function handleSelectAll(e) {
  applySelectionOnFiltered(() => e.target.checked);
  updateSelectedInfo();
}

function selectHalf(which) {
  const filtered = getFilteredCheckouts();
  const total = filtered.length;
  if (total === 0) return;
  const half = Math.ceil(total / 2);
  applySelectionOnFiltered((_, i) => (which === 'top' ? i < half : i >= total - half));
  $('#selectAllCb').checked = false;
  updateSelectedInfo();
}

function clearSelection() {
  selectedCheckouts = [];
  $$('#checkoutList input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.closest('.checkout-item').classList.remove('selected');
  });
  $('#selectAllCb').checked = false;
  updateSelectedInfo();
}

// 對目前（篩選後）顯示的項目套用勾選判斷，其他（未顯示）的選取狀態保留
function applySelectionOnFiltered(predicate) {
  const filtered = getFilteredCheckouts();
  const filteredIds = new Set(filtered.map(c => c.id));
  // 先移除 filtered 中的既有選取
  selectedCheckouts = selectedCheckouts.filter(s => !filteredIds.has(s.id));
  // 依 predicate 重新加入 filtered 中該勾的
  filtered.forEach((c, i) => {
    if (predicate(c, i)) selectedCheckouts.push(c);
  });
  // 同步 UI
  const selectedIds = new Set(selectedCheckouts.map(s => s.id));
  $$('#checkoutList input[type="checkbox"]').forEach(cb => {
    const shouldSelect = selectedIds.has(cb.dataset.id);
    cb.checked = shouldSelect;
    const item = cb.closest('.checkout-item');
    if (shouldSelect) item.classList.add('selected');
    else item.classList.remove('selected');
  });
}

function updateSelectedInfo() {
  const info = $('#selectedInfo');
  const count = selectedCheckouts.length;
  if (count > 0) {
    const total = selectedCheckouts.reduce((sum, c) => sum + (Number(c.total_amount) || 0), 0);
    info.style.display = 'block';
    $('#selectedCount').textContent = count;
    $('#selectedAmount').textContent = total.toLocaleString();
    $('#startBtn').disabled = false;
  } else {
    info.style.display = 'none';
    $('#startBtn').disabled = true;
  }
}

// ============================================
// 開始自動化
// ============================================
async function handleStart() {
  if (selectedCheckouts.length === 0) return;

  // 準備佇列
  const queue = selectedCheckouts.map(c => ({
    checkoutId: c.id,
    checkoutNo: c.checkout_no,
    customerName: c.customer_name || c.member_display_name || '客人',
    memberNickname: c.member_nickname || '',
    totalAmount: c.total_amount,
    itemCount: c.item_count,
    checkoutItems: c.checkout_items,
    status: 'pending',
    storeUrl: null,
    error: null,
  }));

  // 儲存佇列到 storage + 清除控制狀態
  await sendMessage({ type: 'SAVE_QUEUE', queue });
  await chrome.storage.local.remove('queueControl');

  // 切換到進度頁面
  showProgressSection(queue);

  // 開啟賣貨便開立快速結帳頁
  chrome.tabs.create({ url: 'https://myship.7-11.com.tw/fast/add' });
}

// ============================================
// 執行進度頁面
// ============================================
function showProgressSection(queue) {
  loginSection.style.display = 'none';
  tenantSection.style.display = 'none';
  checkoutSection.style.display = 'none';
  progressSection.style.display = 'block';

  renderProgressQueue(queue);
  startProgressPoll();
}

function renderProgressQueue(queue) {
  const listEl = $('#progressQueue');
  const statsEl = $('#progressStats');

  const doneItems = queue.filter(q => q.status === 'done');
  const errorItems = queue.filter(q => q.status === 'error');
  const skipped = queue.filter(q => q.status === 'skipped').length;
  const processing = queue.filter(q => q.status === 'processing').length;
  const pending = queue.filter(q => q.status === 'pending').length;
  const total = queue.length;
  const progress = total > 0 ? ((doneItems.length + errorItems.length + skipped) / total * 100) : 0;

  // 進度條
  const progressFill = $('#popupProgressFill');
  if (progressFill) progressFill.style.width = `${progress}%`;

  // 控制按鈕
  const allDone = pending === 0 && processing === 0;
  updateProgressControls(allDone);

  // 全部完成 → 顯示總結報告
  if (allDone && doneItems.length > 0) {
    const notified = doneItems.filter(q => q.notifyStatus === 'sent');
    const notNotified = doneItems.filter(q => q.notifyStatus !== 'sent');

    statsEl.innerHTML = '';
    let html = `<div class="summary-title">處理完成 - 總結報告</div>`;
    html += `<div class="summary-stats">`;
    html += `<div class="stat-row"><span>成功開賣場</span><span class="stat-val ok">${doneItems.length} 筆</span></div>`;
    if (errorItems.length > 0) html += `<div class="stat-row"><span>開賣場失敗</span><span class="stat-val err">${errorItems.length} 筆</span></div>`;
    if (skipped > 0) html += `<div class="stat-row"><span>已跳過</span><span class="stat-val">${skipped} 筆</span></div>`;
    html += `<hr class="stat-hr">`;
    html += `<div class="stat-row"><span>LINE 通知成功</span><span class="stat-val ok">${notified.length} 筆</span></div>`;
    if (notNotified.length > 0) html += `<div class="stat-row"><span>LINE 通知失敗</span><span class="stat-val err">${notNotified.length} 筆</span></div>`;
    html += `</div>`;

    if (notNotified.length > 0) {
      html += `<div class="failed-header">未通知客人（需人工聯繫）：</div>`;
      html += `<div class="failed-list">`;
      notNotified.forEach(q => {
        const name = q.customerName + (q.memberNickname ? `(${q.memberNickname})` : '');
        html += `<div class="failed-row"><span class="fn">${escHtml(name)}</span><span class="fno">${escHtml(q.checkoutNo)}</span></div>`;
      });
      html += `</div>`;
      html += `<button class="btn-copy" id="popupCopyFailedBtn">複製未通知名單</button>`;
    }

    if (errorItems.length > 0) {
      html += `<div class="failed-header" style="margin-top:8px;">開賣場失敗：</div>`;
      html += `<div class="failed-list">`;
      errorItems.forEach(q => {
        const name = q.customerName + (q.memberNickname ? `(${q.memberNickname})` : '');
        html += `<div class="failed-row"><span class="fn">${escHtml(name)}</span><span style="color:#dc3545;font-size:11px;">${escHtml(q.error || '')}</span></div>`;
      });
      html += `</div>`;
    }

    listEl.innerHTML = html;

    // 綁定複製按鈕
    const copyBtn = document.getElementById('popupCopyFailedBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const lines = notNotified.map(q => {
          const name = q.customerName + (q.memberNickname ? `(${q.memberNickname})` : '');
          return `${name} | ${q.checkoutNo} | ${q.storeCode || '無賣場編號'}`;
        });
        const text = `【未通知客人清單】共 ${notNotified.length} 筆\n` + lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = '已複製！';
          setTimeout(() => { copyBtn.textContent = '複製未通知名單'; }, 2000);
        });
      });
    }
    return;
  }

  // 進行中 → 顯示進度列表
  statsEl.innerHTML = `完成 ${doneItems.length}/${total}` +
    (errorItems.length > 0 ? ` | <span style="color:#dc3545;">失敗 ${errorItems.length}</span>` : '') +
    (skipped > 0 ? ` | 跳過 ${skipped}` : '') +
    (processing > 0 ? ` | <span style="color:#856404;">處理中 ${processing}</span>` : '');

  // 佇列列表
  listEl.innerHTML = queue.map(q => {
    const statusMap = {
      pending: '<span class="item-status waiting">等待中</span>',
      processing: '<span class="item-status processing">處理中</span>',
      done: '<span class="item-status done">完成</span>',
      error: '<span class="item-status error">失敗</span>',
      skipped: '<span class="item-status skipped">已跳過</span>',
    };
    const notifyIcon = q.status === 'done' ? (q.notifyStatus === 'sent' ? ' <span title="已通知" style="color:green;">&#128276;</span>' : ' <span title="未通知" style="color:red;">&#128277;</span>') : '';
    return `
      <div class="checkout-item ${q.status === 'processing' ? 'selected' : ''}">
        <div class="item-info">
          <div class="item-name">${escHtml(q.customerName)} ${statusMap[q.status] || ''}${notifyIcon}</div>
          <div class="item-meta">
            ${escHtml(q.checkoutNo)} | $${q.totalAmount}
            ${q.storeCode ? ` | 賣場: ${q.storeCode}` : ''}
            ${q.error ? `<br><span style="color:#dc3545;">${escHtml(q.error)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

async function updateProgressControls(allDone) {
  const control = await chrome.storage.local.get('queueControl');
  const queueControl = control.queueControl || {};
  const isPaused = queueControl.isPaused || false;
  const isStopped = queueControl.isStopped || false;

  const pauseBtn = $('#popupPauseBtn');
  const resumeBtn = $('#popupResumeBtn');
  const stopBtn = $('#popupStopBtn');

  if (allDone || isStopped) {
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    $('#backToListBtn').style.display = 'flex';
  } else if (isPaused) {
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'inline-flex';
    stopBtn.style.display = 'inline-flex';
    $('#backToListBtn').style.display = 'none';
  } else {
    pauseBtn.style.display = 'inline-flex';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = 'inline-flex';
    $('#backToListBtn').style.display = 'none';
  }
}

function startProgressPoll() {
  if (progressPollTimer) clearInterval(progressPollTimer);
  progressPollTimer = setInterval(async () => {
    const result = await sendMessage({ type: 'GET_QUEUE' });
    const queue = result.queue || [];
    if (queue.length === 0) {
      clearInterval(progressPollTimer);
      return;
    }
    renderProgressQueue(queue);
  }, 2000);
}

async function handleBackToList() {
  if (progressPollTimer) clearInterval(progressPollTimer);
  // 清除已完成的佇列
  await chrome.storage.local.remove(['processingQueue', 'queueControl']);
  showCheckoutSection();
  loadCheckouts();
}

async function handlePopupPause() {
  await chrome.storage.local.set({ queueControl: { isPaused: true, isStopped: false } });
  // 立即更新按鈕
  $('#popupPauseBtn').style.display = 'none';
  $('#popupResumeBtn').style.display = 'inline-flex';
}

async function handlePopupResume() {
  await chrome.storage.local.set({ queueControl: { isPaused: false, isStopped: false } });
  $('#popupResumeBtn').style.display = 'none';
  $('#popupPauseBtn').style.display = 'inline-flex';

  // 通知 content script 繼續（透過 tab message）
  const tabs = await chrome.tabs.query({ url: 'https://myship.7-11.com.tw/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'RESUME' }).catch(() => {});
  }
}

async function handlePopupStop() {
  await chrome.storage.local.set({ queueControl: { isPaused: false, isStopped: true } });

  // 把所有 pending 的標記為 skipped
  const result = await sendMessage({ type: 'GET_QUEUE' });
  const queue = result.queue || [];
  let changed = false;
  queue.forEach(q => {
    if (q.status === 'pending') {
      q.status = 'skipped';
      changed = true;
    }
  });
  if (changed) {
    await sendMessage({ type: 'SAVE_QUEUE', queue });
  }

  // 立即刷新
  renderProgressQueue(queue);
}

// ============================================
// UI 切換
// ============================================
function showLoginSection() {
  loginSection.style.display = 'block';
  tenantSection.style.display = 'none';
  checkoutSection.style.display = 'none';
  progressSection.style.display = 'none';
}

function showTenantSection() {
  loginSection.style.display = 'none';
  tenantSection.style.display = 'block';
  checkoutSection.style.display = 'none';
  progressSection.style.display = 'none';
}

function showCheckoutSection() {
  loginSection.style.display = 'none';
  tenantSection.style.display = 'none';
  checkoutSection.style.display = 'block';
  progressSection.style.display = 'none';
}

function showError(selector, msg) {
  const el = $(selector);
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError(selector) {
  $(selector).style.display = 'none';
}

function showStatus(type, msg) {
  const el = $('#statusMsg');
  el.className = `status-msg ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}

async function handleLogout() {
  if (progressPollTimer) clearInterval(progressPollTimer);
  await sendMessage({ type: 'LOGOUT' });
  showLoginSection();
  $('#logoutBtn').style.display = 'none';
  $('#emailInput').value = '';
  $('#passwordInput').value = '';
}

// ============================================
// 工具函數
// ============================================
function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
