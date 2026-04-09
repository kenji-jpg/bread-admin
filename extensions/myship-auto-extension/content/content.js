// ============================================
// Content Script - 注入賣貨便頁面
// 負責：自動填寫表單、上架、擷取賣場URL、回填Supabase
// ============================================

(function() {
  'use strict';

  const MYSHIP_BASE = 'https://myship.7-11.com.tw';
  const STORE_URL_PREFIX = `${MYSHIP_BASE}/cart/confirm/`;

  let queue = [];
  let currentIndex = -1;
  let panel = null;
  let isProcessing = false;
  let isPaused = false;
  let isStopped = false;

  // 監聽來自 popup 的控制訊息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'RESUME') {
      isPaused = false;
      isStopped = false;
      log('收到繼續指令，恢復處理...');
      updatePanel();
      processNext();
      sendResponse({ success: true });
    }
    return false;
  });

  // ============================================
  // 初始化：判斷目前頁面
  // ============================================
  init();

  async function init() {
    const path = window.location.pathname;

    // 從 storage 讀取佇列和控制狀態
    const result = await chrome.storage.local.get(['processingQueue', 'queueControl']);
    queue = result.processingQueue || [];
    const control = result.queueControl || {};
    isPaused = control.isPaused || false;
    isStopped = control.isStopped || false;

    if (queue.length === 0) return; // 沒有待處理的就不動作

    // 如果已被中止，清理佇列
    if (isStopped) {
      createPanel();
      log('任務已中止');
      updatePanel();
      return;
    }

    // 判斷目前在哪個頁面
    if (path === '/fast/add') {
      // 開立快速結帳頁 → 自動填寫
      await waitForPageReady();
      createPanel();
      if (isPaused) {
        log('任務已暫停，點擊「繼續」繼續處理');
        updatePanel();
      } else {
        processNext();
      }
    } else if (path === '/myship/list1') {
      // 賣場列表頁 → 擷取最新賣場編號
      await waitForPageReady();
      createPanel();
      handleListPage();
    }
  }

  // ============================================
  // 暫停/繼續/中止 控制
  // ============================================
  async function handlePause() {
    isPaused = true;
    await chrome.storage.local.set({ queueControl: { isPaused: true, isStopped: false } });
    log('已暫停，點擊「繼續」繼續處理');
    updatePanel();
  }

  async function handleResume() {
    isPaused = false;
    await chrome.storage.local.set({ queueControl: { isPaused: false, isStopped: false } });
    log('繼續處理...');
    updatePanel();
    processNext();
  }

  async function handleStop() {
    isStopped = true;
    isPaused = false;
    await chrome.storage.local.set({ queueControl: { isPaused: false, isStopped: true } });

    // 把所有 pending 的項目標記為 skipped
    let changed = false;
    queue.forEach(q => {
      if (q.status === 'pending') {
        q.status = 'skipped';
        changed = true;
      }
    });
    if (changed) saveQueue();

    log('任務已中止，未處理的項目已跳過');
    updatePanel();
  }

  // ============================================
  // 找到下一筆待處理
  // ============================================
  function processNext() {
    if (isPaused || isStopped) return;

    currentIndex = queue.findIndex(q => q.status === 'pending');
    if (currentIndex === -1) {
      // 全部處理完畢
      updatePanel();
      log('所有結帳單已處理完畢！');
      cleanupControl();
      return;
    }

    const item = queue[currentIndex];
    item.status = 'processing';
    saveQueue();
    updatePanel();

    log(`開始處理: ${item.checkoutNo} - ${item.customerName}`);
    fillForm(item);
  }

  // ============================================
  // 自動填寫賣貨便表單
  // ============================================
  async function fillForm(item) {
    try {
      // === 只填必填欄位，其餘全部保持預設 ===

      // 1. 賣場名稱（必填，最多50字元）
      // 格式: 單號_客戶名(暱稱) 或 單號_客戶名
      let storeName = item.checkoutNo + '_' + item.customerName;
      if (item.memberNickname) {
        storeName += '(' + item.memberNickname + ')';
      }
      storeName = storeName.substring(0, 50);
      setInputValue('input[name="Cgdm_Name"]', storeName);
      log(`賣場名稱: ${storeName}`);

      // 2. 商品名稱（必填，同賣場名稱）
      setInputValue('input[name="product.Cgdd_Product_Name[1]"]', storeName);
      log(`商品名稱: ${storeName}`);

      // 3. 庫存 = 1（必填）
      setInputValue('input[name="specification.Cgds_Inventory[1]"]', '1');

      // 4. 價格 = checkout 金額（必填）
      setInputValue('input[name="specification.Cgds_Price[1]"]', String(item.totalAmount));
      log(`價格: $${item.totalAmount}`);

      // 5. 預設下單數量 = 1（必填）
      setInputValue('input[name="specification.Cgds_InventoryDef[1]"]', '1');

      log('表單填寫完成，準備上架...');
      updatePanel();

      // 等 1 秒讓使用者可以看一眼
      await delay(1000);

      // 再次檢查是否被暫停/中止
      if (isPaused || isStopped) {
        log(isPaused ? '已暫停' : '已中止');
        return;
      }

      // 點擊「上架」按鈕
      const submitBtn = document.getElementById('btnSubmit') || findButton('上架');
      if (submitBtn) {
        log('點擊上架按鈕...');
        submitBtn.click();

        // 等 2 秒讓彈窗完全出現
        await delay(2000);
        log('等待確認彈窗...');
        await waitAndClickConfirm();
        // 確認後會跳轉到賣場列表頁 (/myship/list1)
        // 由 handleListPage() 接手
      } else {
        throw new Error('找不到上架按鈕');
      }

    } catch (err) {
      log(`錯誤: ${err.message}`, true);
      item.status = 'error';
      item.error = err.message;
      saveQueue();
      updatePanel();
    }
  }

  // ============================================
  // 賣場列表頁：擷取最新賣場編號 + 回填
  // ============================================
  async function handleListPage() {
    // 找到目前正在處理的那筆
    const processingItem = queue.find(q => q.status === 'processing');
    if (!processingItem) {
      // 沒有 processing 的，可能是全部完成
      log('沒有正在處理的結帳單');
      updatePanel();
      return;
    }

    log('上架成功！正在擷取賣場編號...');
    await delay(1500); // 等頁面完整載入

    // 從列表頁找到最新的賣場編號
    // 賣場編號在 td 裡面，格式是 GM + 數字
    const storeCode = findLatestStoreCode(processingItem);

    if (!storeCode) {
      log('找不到賣場編號，請手動確認', true);
      processingItem.status = 'error';
      processingItem.error = '找不到賣場編號';
      saveQueue();
      updatePanel();
      continueToNext();
      return;
    }

    const storeUrl = STORE_URL_PREFIX + storeCode;
    log(`賣場連結: ${storeUrl}`);

    // 回填到 Supabase + 觸發 LINE 通知
    log('回填 Supabase 並通知客人...');
    try {
      const result = await sendToBackground({
        type: 'SET_STORE_URL',
        checkoutId: processingItem.checkoutId,
        storeUrl: storeUrl,
        checkoutNo: processingItem.checkoutNo,
        customerName: processingItem.customerName,
        memberNickname: processingItem.memberNickname,
      });

      if (result.success) {
        processingItem.notifyStatus = result.notifyStatus || 'unknown';
        const notifyMsg = result.notifyStatus === 'sent'
          ? '已通知客人 (LINE)'
          : 'URL 已儲存（LINE 通知失敗，需人工聯繫）';
        log(notifyMsg, result.notifyStatus !== 'sent');
        processingItem.status = 'done';
        processingItem.storeUrl = storeUrl;
        processingItem.storeCode = storeCode;
      } else {
        throw new Error(result.error || '回填失敗');
      }
    } catch (err) {
      log(`回填失敗: ${err.message}`, true);
      processingItem.status = 'error';
      processingItem.error = err.message;
    }

    saveQueue();
    updatePanel();

    // 繼續處理下一筆
    continueToNext();
  }

  function continueToNext() {
    // 檢查是否被暫停或中止
    if (isStopped) {
      log('任務已中止');
      return;
    }

    const remaining = queue.filter(q => q.status === 'pending');
    if (remaining.length > 0) {
      if (isPaused) {
        log(`還有 ${remaining.length} 筆待處理，已暫停`);
        return;
      }
      log(`還有 ${remaining.length} 筆待處理，3 秒後繼續...`);
      setTimeout(() => {
        window.location.href = `${MYSHIP_BASE}/fast/add`;
      }, 3000);
    } else {
      log('全部處理完畢！');
      cleanupControl();
      showSummaryReport();
      // 不自動清除 queue，讓 popup 也能看到報告
    }
  }

  // 清除控制狀態
  function cleanupControl() {
    chrome.storage.local.remove('queueControl');
  }

  // ============================================
  // 總結報告
  // ============================================
  function showSummaryReport() {
    if (!panel) return;

    const done = queue.filter(q => q.status === 'done');
    const errors = queue.filter(q => q.status === 'error');
    const skipped = queue.filter(q => q.status === 'skipped');
    const notified = done.filter(q => q.notifyStatus === 'sent');
    const notNotified = done.filter(q => q.notifyStatus !== 'sent');

    const panelBody = panel.querySelector('.panel-body');
    if (!panelBody) return;

    // 建立報告 HTML
    let reportHtml = `<div class="summary-report">`;
    reportHtml += `<div class="summary-title">處理完成 - 總結報告</div>`;
    reportHtml += `<div class="summary-stats">`;
    reportHtml += `<div class="stat-row"><span>成功開賣場</span><span class="stat-value success">${done.length} 筆</span></div>`;
    if (errors.length > 0) {
      reportHtml += `<div class="stat-row"><span>開賣場失敗</span><span class="stat-value error">${errors.length} 筆</span></div>`;
    }
    if (skipped.length > 0) {
      reportHtml += `<div class="stat-row"><span>已跳過</span><span class="stat-value">${skipped.length} 筆</span></div>`;
    }
    reportHtml += `<div class="stat-divider"></div>`;
    reportHtml += `<div class="stat-row"><span>LINE 通知成功</span><span class="stat-value success">${notified.length} 筆</span></div>`;
    if (notNotified.length > 0) {
      reportHtml += `<div class="stat-row"><span>LINE 通知失敗</span><span class="stat-value error">${notNotified.length} 筆</span></div>`;
    }
    reportHtml += `</div>`;

    // 通知失敗清單
    if (notNotified.length > 0) {
      reportHtml += `<div class="failed-list-header">未通知客人（需人工聯繫）：</div>`;
      reportHtml += `<div class="failed-list">`;
      notNotified.forEach(q => {
        const name = q.customerName + (q.memberNickname ? `(${q.memberNickname})` : '');
        reportHtml += `<div class="failed-item">`;
        reportHtml += `<span class="failed-name">${escHtml(name)}</span>`;
        reportHtml += `<span class="failed-no">${escHtml(q.checkoutNo)}</span>`;
        if (q.storeCode) {
          reportHtml += `<span class="failed-store">${q.storeCode}</span>`;
        }
        reportHtml += `</div>`;
      });
      reportHtml += `</div>`;
      reportHtml += `<button class="copy-failed-btn" id="copyFailedBtn">複製未通知名單</button>`;
    }

    // 錯誤清單
    if (errors.length > 0) {
      reportHtml += `<div class="failed-list-header" style="margin-top:8px;">開賣場失敗：</div>`;
      reportHtml += `<div class="failed-list">`;
      errors.forEach(q => {
        const name = q.customerName + (q.memberNickname ? `(${q.memberNickname})` : '');
        reportHtml += `<div class="failed-item">`;
        reportHtml += `<span class="failed-name">${escHtml(name)}</span>`;
        reportHtml += `<span class="failed-no">${escHtml(q.checkoutNo)}</span>`;
        reportHtml += `<span style="color:red;font-size:11px;">${escHtml(q.error || '')}</span>`;
        reportHtml += `</div>`;
      });
      reportHtml += `</div>`;
    }

    reportHtml += `<button class="clear-queue-btn" id="clearQueueBtn">關閉報告</button>`;
    reportHtml += `</div>`;

    // 替換面板內容
    panelBody.innerHTML = reportHtml;

    // 綁定複製按鈕
    const copyBtn = document.getElementById('copyFailedBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const lines = notNotified.map(q => {
          const name = q.customerName + (q.memberNickname ? `(${q.memberNickname})` : '');
          return `${name} | ${q.checkoutNo} | ${q.storeCode || '無賣場編號'}`;
        });
        const text = `【未通知客人清單】共 ${notNotified.length} 筆\n` + lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = '已複製！';
          copyBtn.style.background = '#d4edda';
          copyBtn.style.color = '#155724';
          setTimeout(() => {
            copyBtn.textContent = '複製未通知名單';
            copyBtn.style.background = '';
            copyBtn.style.color = '';
          }, 2000);
        });
      });
    }

    // 關閉報告按鈕
    document.getElementById('clearQueueBtn').addEventListener('click', () => {
      chrome.storage.local.remove('processingQueue');
      panel.remove();
      panel = null;
    });
  }

  // ============================================
  // 找到最新的賣場編號
  // ============================================
  function findLatestStoreCode(item) {
    // 方法1：找賣場名稱包含 checkout_no 的那一行
    const rows = document.querySelectorAll('table tr, .list-item, [class*="row"]');
    // 賣場名稱格式: 單號_客戶名(暱稱) 或 單號_客戶名
    let storeName = item.checkoutNo + '_' + item.customerName;
    if (item.memberNickname) {
      storeName += '(' + item.memberNickname + ')';
    }
    storeName = storeName.substring(0, 50);

    // 找所有包含 GM 編號的元素
    const allText = document.body.innerText;
    const gmMatches = allText.match(/GM\d{10,}/g);

    if (!gmMatches || gmMatches.length === 0) return null;

    // 嘗試透過賣場名稱匹配找到對應的 GM 編號
    const cells = document.querySelectorAll('td');
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].textContent.trim();
      // 找到賣場名稱 cell
      if (cellText.includes(item.checkoutNo) || cellText.includes(storeName.substring(0, 20))) {
        // 往兄弟 cell 找 GM 編號
        const row = cells[i].closest('tr');
        if (row) {
          const rowText = row.textContent;
          const match = rowText.match(/GM\d{10,}/);
          if (match) return match[0];
        }
      }
    }

    // 方法2：找 data-url 包含 GM 的元素
    const dataUrlEls = document.querySelectorAll('[data-url*="GM"]');
    for (const el of dataUrlEls) {
      const url = el.getAttribute('data-url');
      const match = url.match(/GM\d{10,}/);
      if (match) {
        // 確認這是最新的（序號 1）
        const row = el.closest('tr');
        if (row) {
          const orderCell = row.querySelector('td:first-child');
          if (orderCell && orderCell.textContent.trim().includes('1')) {
            return match[0];
          }
        }
      }
    }

    // 方法3：fallback - 直接取列表第一筆（最新的）
    if (gmMatches.length > 0) {
      return gmMatches[0];
    }

    return null;
  }

  // ============================================
  // 建立浮動面板
  // ============================================
  function createPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.id = 'myship-auto-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <span>賣貨便自動化</span>
        <button class="close-btn" id="panelCloseBtn">&times;</button>
      </div>
      <div class="panel-body">
        <div id="panelQueue"></div>
        <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
        <div class="panel-controls" id="panelControls">
          <button class="ctrl-btn pause-btn" id="pauseBtn" title="暫停">⏸ 暫停</button>
          <button class="ctrl-btn resume-btn" id="resumeBtn" title="繼續" style="display:none;">▶ 繼續</button>
          <button class="ctrl-btn stop-btn" id="stopBtn" title="中止">⏹ 中止</button>
        </div>
        <div class="log-area" id="logArea"></div>
      </div>
    `;

    document.body.appendChild(panel);

    document.getElementById('panelCloseBtn').addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('pauseBtn').addEventListener('click', handlePause);
    document.getElementById('resumeBtn').addEventListener('click', handleResume);
    document.getElementById('stopBtn').addEventListener('click', handleStop);

    updatePanel();
  }

  function updatePanel() {
    if (!panel) return;

    const queueEl = document.getElementById('panelQueue');
    if (!queueEl) return;

    const done = queue.filter(q => q.status === 'done').length;
    const errors = queue.filter(q => q.status === 'error').length;
    const skipped = queue.filter(q => q.status === 'skipped').length;
    const total = queue.length;
    const progress = total > 0 ? ((done + errors + skipped) / total * 100) : 0;

    // 進度條
    const progressFill = document.getElementById('progressFill');
    if (progressFill) progressFill.style.width = `${progress}%`;

    // 控制按鈕狀態
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const stopBtn = document.getElementById('stopBtn');
    const allDone = queue.every(q => q.status === 'done' || q.status === 'error' || q.status === 'skipped');

    if (pauseBtn && resumeBtn && stopBtn) {
      if (allDone || isStopped) {
        // 全部完成或已中止 → 隱藏所有控制按鈕
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
        stopBtn.style.display = 'none';
      } else if (isPaused) {
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'inline-flex';
      } else {
        pauseBtn.style.display = 'inline-flex';
        resumeBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
      }
    }

    // 佇列列表
    queueEl.innerHTML = queue.map(q => {
      const statusMap = {
        pending: '<span class="status-badge waiting">等待中</span>',
        processing: '<span class="status-badge processing">處理中</span>',
        done: '<span class="status-badge success">完成</span>',
        error: '<span class="status-badge error">失敗</span>',
        skipped: '<span class="status-badge skipped">已跳過</span>',
      };
      return `
        <div class="checkout-item">
          <div class="item-name">${escHtml(q.customerName)}</div>
          <div class="item-detail">
            ${escHtml(q.checkoutNo)} | $${q.totalAmount}
            ${statusMap[q.status] || ''}
            ${q.storeCode ? `<br>賣場: ${q.storeCode}` : ''}
            ${q.error ? `<br><span style="color:red;">${escHtml(q.error)}</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // ============================================
  // 日誌
  // ============================================
  function log(msg, isError = false) {
    console.log(`[MyShip Auto] ${msg}`);
    const logArea = document.getElementById('logArea');
    if (!logArea) return;

    const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${time}</span>${isError ? '<span style="color:red;">&#10007;</span>' : '<span style="color:green;">&#10003;</span>'} ${escHtml(msg)}`;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight;
  }

  // ============================================
  // 工具函數
  // ============================================

  function setInputValue(selector, value) {
    const input = document.querySelector(selector);
    if (!input) {
      console.warn(`[MyShip Auto] Input not found: ${selector}`);
      return;
    }
    // 模擬真實輸入
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  }

  // 上架後會跳出「慎防詐騙」彈窗，按「我知道了」後才跳轉到賣場列表
  function waitAndClickConfirm() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 30; // 最多等 6 秒

      const interval = setInterval(() => {
        attempts++;

        // 找「我知道了」按鈕
        const btns = document.querySelectorAll('.modal.show button, .modal.in button');
        for (const btn of btns) {
          if (btn.textContent.trim() === '我知道了') {
            log('點擊「我知道了」...');
            clearInterval(interval);
            btn.click();
            resolve();
            return;
          }
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          log('彈窗超時，可能已自動跳轉', false);
          resolve();
        }
      }, 200);
    });
  }

  function findButton(text) {
    const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
    for (const btn of buttons) {
      if (btn.textContent.trim().includes(text) || btn.value === text) {
        return btn;
      }
    }
    return null;
  }

  function waitForPageReady() {
    return new Promise(resolve => {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 800);
      } else {
        window.addEventListener('load', () => setTimeout(resolve, 800));
      }
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function saveQueue() {
    chrome.storage.local.set({ processingQueue: queue });
  }

  function sendToBackground(msg) {
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

})();
