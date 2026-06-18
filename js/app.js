/* =============================================
   체리포켓 - 메인 앱 로직
   ============================================= */

/* ────────────────────────────────
   전역 상태
──────────────────────────────── */
const State = {
  currentTab: 'dashboard',
  expenseMonth: Utils.getCurrentMonth(),
  statMonth: Utils.getCurrentMonth(),
  budgetMonth: Utils.getCurrentMonth(),
  selectedCategory: '식료품',
  selectedCardColor: '#e8344e',
  cards: [],
  expenses: [],
  budgets: [],
  fridgeItems: [],
  charts: {},
  editingBudget: false,
  fridgeFilter: 'all',
};

/* ────────────────────────────────
   API 래퍼
──────────────────────────────── */
const LOCAL_TABLES = ['cards', 'expenses', 'budgets', 'fridge_items'];
const STORAGE_PREFIX = 'cherrypocket_table_';
const STATIC_DEPLOY_HOSTS = ['github.io'];
const IS_STATIC_DEPLOY = STATIC_DEPLOY_HOSTS.some(host => window.location.hostname.endsWith(host)) || window.location.protocol === 'file:';

const API = {
  mode: IS_STATIC_DEPLOY ? 'local' : 'remote',
  _localReady: false,

  _storageKey(table) {
    return `${STORAGE_PREFIX}${table}`;
  },

  _makeId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  },

  _ensureLocalStore() {
    if (this._localReady) return;
    LOCAL_TABLES.forEach(table => {
      const key = this._storageKey(table);
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, '[]');
      }
    });
    this._localReady = true;
  },

  _readLocal(table) {
    this._ensureLocalStore();
    try {
      return JSON.parse(localStorage.getItem(this._storageKey(table)) || '[]');
    } catch (err) {
      console.warn('[CherryPocket] localStorage parse failed:', err);
      localStorage.setItem(this._storageKey(table), '[]');
      return [];
    }
  },

  _writeLocal(table, rows) {
    this._ensureLocalStore();
    localStorage.setItem(this._storageKey(table), JSON.stringify(rows));
  },

  _switchToLocal(reason) {
    if (this.mode !== 'local') {
      console.warn('[CherryPocket] Table API unavailable. Falling back to localStorage.', reason);
    }
    this.mode = 'local';
    this._ensureLocalStore();
  },

  async _requestJson(url, options = {}) {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    if (!contentType.includes('application/json')) {
      throw new Error(`Expected JSON but received ${contentType || 'unknown content type'} from ${url}`);
    }

    return res.json();
  },

  async get(table, params = '') {
    if (this.mode !== 'local') {
      try {
        return await this._requestJson(`tables/${table}?limit=500${params}`);
      } catch (err) {
        this._switchToLocal(err);
      }
    }

    return { data: this._readLocal(table) };
  },

  async post(table, data) {
    if (this.mode !== 'local') {
      try {
        return await this._requestJson(`tables/${table}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (err) {
        this._switchToLocal(err);
      }
    }

    const rows = this._readLocal(table);
    const record = { ...data, id: data?.id ?? this._makeId() };
    rows.unshift(record);
    this._writeLocal(table, rows);
    return record;
  },

  async put(table, id, data) {
    if (this.mode !== 'local') {
      try {
        return await this._requestJson(`tables/${table}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (err) {
        this._switchToLocal(err);
      }
    }

    const rows = this._readLocal(table);
    const index = rows.findIndex(row => String(row.id) === String(id));
    const updated = { ...(index >= 0 ? rows[index] : {}), ...data, id };

    if (index >= 0) rows[index] = updated;
    else rows.unshift(updated);

    this._writeLocal(table, rows);
    return updated;
  },

  async delete(table, id) {
    if (this.mode !== 'local') {
      try {
        await this._requestJson(`tables/${table}/${id}`, { method: 'DELETE' });
        return;
      } catch (err) {
        this._switchToLocal(err);
      }
    }

    const rows = this._readLocal(table).filter(row => String(row.id) !== String(id));
    this._writeLocal(table, rows);
  }
};

/* ────────────────────────────────
   데이터 로드
──────────────────────────────── */
async function loadAllData() {
  const [cardsRes, expensesRes, budgetsRes, fridgeRes] = await Promise.all([
    API.get('cards'),
    API.get('expenses'),
    API.get('budgets'),
    API.get('fridge_items')
  ]);
  State.cards = cardsRes.data || [];
  State.expenses = expensesRes.data || [];
  State.budgets = budgetsRes.data || [];
  State.fridgeItems = fridgeRes.data || [];
}

/* ────────────────────────────────
   탭 전환
──────────────────────────────── */
function switchTab(tab) {
  State.currentTab = tab;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(`page-${tab}`);
  if (page) page.classList.add('active');
  const navBtn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (navBtn) navBtn.classList.add('active');
  renderCurrentTab();
}

function renderCurrentTab() {
  switch (State.currentTab) {
    case 'dashboard': renderDashboard(); break;
    case 'cards':     renderCards(); break;
    case 'expenses':  renderExpenses(); break;
    case 'stats':     renderStats(); break;
    case 'fridge':    renderFridge(); break;
    case 'budget':    renderBudget(); break;
  }
}

/* ────────────────────────────────
   대시보드
──────────────────────────────── */
function renderDashboard() {
  const month = State.expenseMonth;
  const monthExpenses = State.expenses.filter(e => (e.date||'').startsWith(month));

  const total = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalDiscount = monthExpenses.reduce((s, e) => s + (e.discount_amount || 0), 0);
  const fixed = monthExpenses.filter(e => e.is_fixed).reduce((s, e) => s + (e.amount || 0), 0);
  const variable = total - fixed;

  document.getElementById('summary-month').textContent = Utils.monthLabel(month);
  document.getElementById('dashboard-total-expense').textContent = Utils.formatMoney(total);
  document.getElementById('dash-discount').textContent = Utils.formatMoneyShort(totalDiscount);
  document.getElementById('dash-fixed').textContent = Utils.formatMoneyShort(fixed);
  document.getElementById('dash-variable').textContent = Utils.formatMoneyShort(variable);

  // 카드 실적 카드
  const cardRow = document.getElementById('dashboard-cards');
  cardRow.innerHTML = '';
  State.cards.forEach(card => {
    const pct = Math.min(100, Math.round((card.performance_current || 0) / (card.performance_limit || 1) * 100));
    const isOver = pct >= 100;
    const div = document.createElement('div');
    div.className = 'card-mini';
    div.style.background = `linear-gradient(135deg, ${card.card_color || '#e8344e'} 0%, ${darkenColor(card.card_color || '#e8344e')} 100%)`;
    div.innerHTML = `
      <div class="card-mini-icon">${card.card_type === 'check' ? '🟡' : '💳'}</div>
      <div class="card-mini-name">${card.card_name || '카드'}</div>
      <div class="card-mini-last4">•••• ${card.card_number_last4 || '0000'}</div>
      <div class="card-mini-progress-label">실적 ${pct}% ${isOver ? '✅ 완료!' : '진행중'}</div>
      <div class="card-mini-bar"><div class="card-mini-bar-fill" style="width:${pct}%"></div></div>
      <div class="card-mini-amounts">
        <span>${Utils.formatMoneyShort(card.performance_current || 0)}</span>
        <span>/ ${Utils.formatMoneyShort(card.performance_limit || 0)}</span>
      </div>
    `;
    div.addEventListener('click', () => switchTab('cards'));
    cardRow.appendChild(div);
  });

  if (State.cards.length === 0) {
    cardRow.innerHTML = '<div class="empty-state" style="padding:16px"><p>등록된 카드가 없어요</p></div>';
  }

  // 냉장고 임박 알림
  renderFridgeAlerts();

  // 도넛 차트
  renderDashboardChart(monthExpenses);

  // 최근 지출
  const recent = [...monthExpenses].sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0, 5);
  renderExpenseList('recent-expenses', recent);
}

function renderFridgeAlerts() {
  const alertList = document.getElementById('fridge-alert-list');
  const section = document.getElementById('fridge-alert-section');
  const alertItems = State.fridgeItems
    .filter(item => !item.is_used)
    .map(item => ({ ...item, days: Utils.daysUntil(item.expire_date) }))
    .filter(item => item.days <= 5)
    .sort((a,b) => a.days - b.days);

  if (alertItems.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  alertList.innerHTML = alertItems.map(item => {
    const isDanger = item.days <= 2;
    const dayText = item.days < 0 ? '기한 초과!' : item.days === 0 ? 'D-Day!' : `D-${item.days}`;
    const emoji = APP_DATA.fridgeEmoji[item.category] || '🥬';
    return `
      <div class="alert-item ${isDanger ? 'danger' : ''}">
        <span class="alert-icon">${emoji}</span>
        <div class="alert-text">
          <div class="alert-name">${item.name}</div>
          <div class="alert-date">${item.expire_date} 까지</div>
        </div>
        <span class="alert-days">${dayText}</span>
      </div>`;
  }).join('');
}

function renderDashboardChart(expenses) {
  const catTotals = {};
  expenses.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0);
  });
  const labels = Object.keys(catTotals);
  const values = Object.values(catTotals);
  const colors = labels.map(l => Utils.getCatInfo(l).color);

  const canvas = document.getElementById('dashboard-donut-chart');
  if (State.charts.donut) State.charts.donut.destroy();
  if (labels.length === 0) {
    canvas.parentElement.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>이번 달 지출 내역이 없어요</p></div>';
    return;
  }
  State.charts.donut = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: 'white' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'Noto Sans KR', size: 12 }, padding: 8, boxWidth: 12 } },
        tooltip: { callbacks: { label: (ctx) => ` ${Utils.formatMoney(ctx.raw)}` } }
      },
      cutout: '60%'
    }
  });
}

/* ────────────────────────────────
   지출 리스트 렌더 (공통)
──────────────────────────────── */
function renderExpenseList(containerId, expenses) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (expenses.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🧾</div><p>지출 내역이 없어요</p></div>`;
    return;
  }
  el.innerHTML = expenses.map(e => {
    const cat = Utils.getCatInfo(e.category);
    const discount = e.discount_amount > 0 ? `<div class="expense-discount">-${Utils.formatMoney(e.discount_amount)} 할인</div>` : '';
    const card = State.cards.find(c => c.id === e.card_id);
    const cardLabel = card ? card.card_name : e.payment_method || '직접입력';
    return `
      <div class="expense-item" data-id="${e.id}">
        <div class="expense-icon" style="background:${cat.bg}">
          <span>${cat.emoji}</span>
        </div>
        <div class="expense-info">
          <div class="expense-name">${e.description || e.category}</div>
          <div class="expense-meta">${e.date} · ${cardLabel}</div>
        </div>
        <div class="expense-right">
          <div class="expense-amount">${Utils.formatMoney(e.amount)}</div>
          ${discount}
        </div>
      </div>`;
  }).join('');
}

/* ────────────────────────────────
   카드 관리
──────────────────────────────── */
function renderCards() {
  // 내 카드 목록
  const list = document.getElementById('my-cards-list');
  list.innerHTML = '';
  if (State.cards.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💳</div><p>등록된 카드가 없어요<br>카드를 추가해보세요!</p></div>`;
  } else {
    State.cards.forEach(card => {
      const pct = Math.min(100, Math.round((card.performance_current || 0) / (card.performance_limit || 1) * 100));
      const benefits = [card.benefit_1, card.benefit_2, card.benefit_3].filter(Boolean);
      const div = document.createElement('div');
      div.className = 'my-card-full';
      div.style.background = `linear-gradient(135deg, ${card.card_color || '#e8344e'} 0%, ${darkenColor(card.card_color || '#e8344e', 0.2)} 100%)`;
      div.innerHTML = `
        <div class="my-card-top">
          <div>
            <div class="my-card-company">${card.card_company || ''}</div>
            <div class="my-card-name">${card.card_name || '내 카드'}</div>
          </div>
          <div class="my-card-type-badge">${card.card_type === 'check' ? '체크' : '신용'}</div>
        </div>
        <div class="my-card-number">•••• •••• •••• ${card.card_number_last4 || '0000'}</div>
        <div class="my-card-perf-label">실적 ${pct}% 달성 (${Utils.formatMoney(card.performance_current || 0)} / ${Utils.formatMoney(card.performance_limit || 0)})</div>
        <div class="my-card-bar"><div class="my-card-bar-fill" style="width:${pct}%"></div></div>
        <div class="my-card-perf-amounts">
          <span>${pct >= 100 ? '✅ 실적 달성 완료!' : `${Utils.formatMoney((card.performance_limit || 0) - (card.performance_current || 0))} 남음`}</span>
        </div>
        ${benefits.length > 0 ? `<div class="my-card-benefits">${benefits.map(b => `<span class="benefit-tag">${b}</span>`).join('')}</div>` : ''}
        <div class="my-card-actions">
          <button class="card-action-btn" onclick="openUpdatePerf('${card.id}')">실적 업데이트</button>
          <button class="card-action-btn danger" onclick="deleteCard('${card.id}')">삭제</button>
        </div>
      `;
      list.appendChild(div);
    });
  }

  // 카드 추천
  renderCardRecommend();

  // 카드별 사용 현황
  renderCardUsage();
}

function renderCardRecommend() {
  const el = document.getElementById('card-recommend');
  const recs = [];

  State.cards.forEach(card => {
    const pct = Math.round((card.performance_current || 0) / (card.performance_limit || 1) * 100);
    if (pct < 100) {
      const remaining = (card.performance_limit || 0) - (card.performance_current || 0);
      recs.push({
        text: `${card.card_name}: 실적까지 ${Utils.formatMoney(remaining)} 남았어요`,
        card: card.card_name
      });
    }
    if (card.benefit_1) {
      recs.push({ text: `${card.benefit_1}`, card: card.card_name });
    }
  });

  if (recs.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>등록된 카드 혜택 정보가 없어요</p></div>';
    return;
  }

  el.innerHTML = recs.slice(0, 4).map(r => `
    <div class="recommend-item">
      <div class="rec-dot"></div>
      <div class="rec-text">${r.text}</div>
      <div class="rec-card-name">${r.card}</div>
    </div>`).join('');
}

function renderCardUsage() {
  const el = document.getElementById('card-usage-list');
  const month = State.expenseMonth;
  const monthExpenses = State.expenses.filter(e => (e.date||'').startsWith(month) && e.card_id);

  const usage = {};
  monthExpenses.forEach(e => {
    usage[e.card_id] = (usage[e.card_id] || 0) + (e.amount || 0);
  });

  const maxUsage = Math.max(...Object.values(usage), 1);

  if (Object.keys(usage).length === 0) {
    el.innerHTML = '<div class="empty-state"><p>이번 달 카드 사용 내역이 없어요</p></div>';
    return;
  }

  el.innerHTML = State.cards.map(card => {
    const used = usage[card.id] || 0;
    const pct = Math.round(used / maxUsage * 100);
    return `
      <div class="card-usage-item">
        <div class="card-usage-header">
          <span class="card-usage-name">💳 ${card.card_name}</span>
          <span class="card-usage-amount">${Utils.formatMoney(used)}</span>
        </div>
        <div class="card-usage-bar">
          <div class="card-usage-bar-fill" style="width:${pct}%; background:${card.card_color}"></div>
        </div>
      </div>`;
  }).join('');
}

/* ────────────────────────────────
   지출 내역
──────────────────────────────── */
function renderExpenses() {
  const month = State.expenseMonth;
  document.getElementById('expense-month-label').textContent = Utils.monthLabel(month);
  const monthExpenses = State.expenses.filter(e => (e.date||'').startsWith(month));

  // 필터
  const activeFilter = document.querySelector('#expense-filter-tabs .filter-tab.active')?.dataset.filter || 'all';
  let filtered = monthExpenses;
  if (activeFilter === '카드') filtered = monthExpenses.filter(e => e.card_id);
  else if (activeFilter === '고정') filtered = monthExpenses.filter(e => e.is_fixed);
  else if (activeFilter !== 'all') filtered = monthExpenses.filter(e => e.category === activeFilter);

  // 월 요약
  const total = monthExpenses.reduce((s,e) => s+(e.amount||0), 0);
  const discount = monthExpenses.reduce((s,e) => s+(e.discount_amount||0), 0);
  const fixed = monthExpenses.filter(e=>e.is_fixed).reduce((s,e) => s+(e.amount||0), 0);
  document.getElementById('expense-month-summary').innerHTML = `
    <div class="month-stat-card"><div class="month-stat-val">${Utils.formatMoneyShort(total)}</div><div class="month-stat-label">총 지출</div></div>
    <div class="month-stat-card"><div class="month-stat-val">${Utils.formatMoneyShort(fixed)}</div><div class="month-stat-label">고정 지출</div></div>
    <div class="month-stat-card" style="border-color:var(--green-light)"><div class="month-stat-val" style="color:var(--green)">${Utils.formatMoneyShort(discount)}</div><div class="month-stat-label">총 할인</div></div>
  `;

  // 날짜별 그룹
  const grouped = {};
  filtered.sort((a,b) => (b.date||'').localeCompare(a.date||'')).forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  const container = document.getElementById('expense-full-list');
  if (Object.keys(grouped).length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🧾</div><p>지출 내역이 없어요</p></div>`;
    return;
  }

  container.innerHTML = Object.entries(grouped).map(([date, items]) => {
    const dayTotal = items.reduce((s,e)=>s+(e.amount||0),0);
    const dayHtml = items.map(e => {
      const cat = Utils.getCatInfo(e.category);
      const discount = e.discount_amount > 0 ? `<div class="expense-discount">-${Utils.formatMoney(e.discount_amount)} 할인</div>` : '';
      const card = State.cards.find(c => c.id === e.card_id);
      const cardLabel = card ? card.card_name : (e.payment_method || '직접입력');
      return `
        <div class="expense-item">
          <div class="expense-icon" style="background:${cat.bg}">${cat.emoji}</div>
          <div class="expense-info">
            <div class="expense-name">${e.description || e.category}</div>
            <div class="expense-meta">${cardLabel} ${e.is_fixed ? '· 고정' : ''}</div>
          </div>
          <div class="expense-right">
            <div class="expense-amount">${Utils.formatMoney(e.amount)}</div>
            ${discount}
          </div>
        </div>`;
    }).join('');

    const [y, m, d] = date.split('-');
    return `
      <div class="expense-date-header">${m}월 ${d}일 · ${Utils.formatMoneyShort(dayTotal)}</div>
      <div class="expense-list">${dayHtml}</div>`;
  }).join('');
}

/* ────────────────────────────────
   통계
──────────────────────────────── */
function renderStats() {
  const month = State.statMonth;
  document.getElementById('stat-month-label').textContent = Utils.monthLabel(month);
  const monthExpenses = State.expenses.filter(e => (e.date||'').startsWith(month));

  // 예산 진행률
  renderBudgetProgress(monthExpenses, month);

  // 카테고리 바 차트
  renderStatsBarChart(monthExpenses);

  // 3개월 비교
  renderStatsLineChart(month);

  // 할인 요약
  renderDiscountSummary(monthExpenses);
}

function renderBudgetProgress(monthExpenses, month) {
  const el = document.getElementById('budget-progress-list');
  const monthBudgets = State.budgets.filter(b => b.month === month);

  if (monthBudgets.length === 0) {
    el.innerHTML = `<div class="empty-state"><p>예산이 설정되지 않았어요<br><button class="text-btn" onclick="switchTab('budget')">예산 설정하기</button></p></div>`;
    return;
  }

  el.innerHTML = monthBudgets.map(b => {
    const spent = monthExpenses.filter(e => e.category === b.category).reduce((s,e) => s+(e.amount||0),0);
    const pct = Math.min(100, Math.round(spent / (b.budget_amount || 1) * 100));
    const color = pct >= 90 ? 'var(--cherry)' : pct >= 70 ? 'var(--orange)' : 'var(--green)';
    const cat = Utils.getCatInfo(b.category);
    return `
      <div class="budget-item">
        <div class="budget-header">
          <span class="budget-cat">${cat.emoji} ${b.category}</span>
          <span class="budget-amounts"><strong>${Utils.formatMoneyShort(spent)}</strong> / ${Utils.formatMoneyShort(b.budget_amount)}</span>
        </div>
        <div class="budget-progress">
          <div class="budget-progress-fill" style="width:${pct}%; background:${color}"></div>
        </div>
        <div class="budget-pct" style="color:${color}">${pct}%</div>
      </div>`;
  }).join('');
}

function renderStatsBarChart(expenses) {
  const catTotals = {};
  expenses.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0);
  });
  const sorted = Object.entries(catTotals).sort((a,b) => b[1]-a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => v);
  const colors = labels.map(l => Utils.getCatInfo(l).color);

  const canvas = document.getElementById('stats-bar-chart');
  if (State.charts.bar) State.charts.bar.destroy();
  if (labels.length === 0) {
    canvas.parentElement.innerHTML = '<div class="empty-state"><p>이번 달 지출이 없어요</p></div>';
    return;
  }
  State.charts.bar = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 8, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${Utils.formatMoney(ctx.raw)}` } }
      },
      scales: {
        y: { ticks: { callback: v => Utils.formatMoneyShort(v), font: { family: 'Noto Sans KR', size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { ticks: { font: { family: 'Noto Sans KR', size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function renderStatsLineChart(currentMonth) {
  const months = [-2, -1, 0].map(n => Utils.addMonths(currentMonth, n));
  const totals = months.map(m => {
    return State.expenses.filter(e => (e.date||'').startsWith(m)).reduce((s,e)=>s+(e.amount||0),0);
  });

  const canvas = document.getElementById('stats-line-chart');
  if (State.charts.line) State.charts.line.destroy();
  State.charts.line = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months.map(m => Utils.monthLabel(m)),
      datasets: [{
        data: totals,
        borderColor: '#e8344e',
        backgroundColor: 'rgba(232,52,78,0.08)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: '#e8344e',
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${Utils.formatMoney(ctx.raw)}` } }
      },
      scales: {
        y: { ticks: { callback: v => Utils.formatMoneyShort(v), font: { family: 'Noto Sans KR', size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { ticks: { font: { family: 'Noto Sans KR', size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function renderDiscountSummary(expenses) {
  const el = document.getElementById('discount-summary');
  const cardDiscounts = {};
  expenses.forEach(e => {
    if (e.discount_amount > 0) {
      const card = State.cards.find(c => c.id === e.card_id);
      const name = card ? card.card_name : (e.payment_method || '기타');
      cardDiscounts[name] = (cardDiscounts[name] || 0) + e.discount_amount;
    }
  });

  if (Object.keys(cardDiscounts).length === 0) {
    el.innerHTML = '<div class="empty-state"><p>이번 달 할인 혜택 내역이 없어요</p></div>';
    return;
  }

  el.innerHTML = Object.entries(cardDiscounts).map(([name, val]) => `
    <div class="discount-item">
      <span class="discount-name">💳 ${name}</span>
      <span class="discount-val">-${Utils.formatMoney(val)}</span>
    </div>`).join('');
}

/* ────────────────────────────────
   냉장고
──────────────────────────────── */
function renderFridge() {
  const filter = State.fridgeFilter;
  let items = State.fridgeItems.filter(i => !i.is_used);

  if (filter !== 'all') {
    items = items.filter(i => i.storage_type === filter);
  }

  // 유통기한 임박
  const expireSoon = items.filter(i => Utils.daysUntil(i.expire_date) <= 3);
  const expireSection = document.getElementById('fridge-expire-section');
  const expireList = document.getElementById('fridge-expire-list');

  if (expireSoon.length > 0) {
    expireSection.style.display = 'block';
    expireList.innerHTML = expireSoon.map(item => {
      const days = Utils.daysUntil(item.expire_date);
      const dayText = days < 0 ? '기한 초과!' : days === 0 ? 'D-Day!' : `D-${days}`;
      const emoji = APP_DATA.fridgeEmoji[item.category] || '🥬';
      return `
        <div class="alert-item ${days <= 1 ? 'danger' : ''}">
          <span class="alert-icon">${emoji}</span>
          <div class="alert-text">
            <div class="alert-name">${item.name} (${item.quantity}${item.unit})</div>
            <div class="alert-date">${item.expire_date} 까지</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="alert-days">${dayText}</span>
            <button onclick="markFridgeUsed('${item.id}')" style="font-size:11px;padding:3px 8px;border-radius:10px;border:none;background:var(--cherry);color:white;cursor:pointer;font-family:var(--font)">사용완료</button>
          </div>
        </div>`;
    }).join('');
  } else {
    expireSection.style.display = 'none';
  }

  // 전체 목록
  const grid = document.getElementById('fridge-items-grid');
  const count = document.getElementById('fridge-count-label');
  count.textContent = `${items.length}개`;

  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🧊</div><p>냉장고가 비었어요!</p></div>';
    return;
  }

  items.sort((a,b) => Utils.daysUntil(a.expire_date) - Utils.daysUntil(b.expire_date));
  grid.innerHTML = items.map(item => {
    const days = Utils.daysUntil(item.expire_date);
    const isExpiring = days <= 3 && days >= 0;
    const isExpired = days < 0;
    const emoji = APP_DATA.fridgeEmoji[item.category] || '🥬';
    const badge = isExpired ? `<span class="fridge-expire-badge">초과</span>` : isExpiring ? `<span class="fridge-expire-badge">D-${days}</span>` : '';
    return `
      <div class="fridge-card ${isExpired ? 'expired' : isExpiring ? 'expiring' : ''}" onclick="openFridgeDetail('${item.id}')">
        ${badge}
        <div class="fridge-emoji">${emoji}</div>
        <div class="fridge-name">${item.name}</div>
        <div class="fridge-qty">${item.quantity}${item.unit}</div>
        <span class="fridge-storage-badge storage-${item.storage_type}">${item.storage_type}</span>
      </div>`;
  }).join('');
}

async function markFridgeUsed(id) {
  await API.put('fridge_items', id, { is_used: true });
  State.fridgeItems = State.fridgeItems.map(i => i.id === id ? { ...i, is_used: true } : i);
  renderFridge();
  renderFridgeAlerts();
  showToast('✅ 재료를 사용 완료 처리했어요!');
}

function openFridgeDetail(id) {
  const item = State.fridgeItems.find(i => i.id === id);
  if (!item) return;
  const days = Utils.daysUntil(item.expire_date);
  const emoji = APP_DATA.fridgeEmoji[item.category] || '🥬';
  const msg = `${emoji} ${item.name}\n${item.quantity}${item.unit} · ${item.storage_type}\n유통기한: ${item.expire_date} (${days >= 0 ? `D-${days}` : '초과'})`;
  if (confirm(msg + '\n\n사용 완료로 처리하시겠어요?')) {
    markFridgeUsed(id);
  }
}

/* ────────────────────────────────
   예산 관리
──────────────────────────────── */
function renderBudget() {
  const month = State.budgetMonth;
  document.getElementById('budget-month-label').textContent = Utils.monthLabel(month);

  const monthBudgets = State.budgets.filter(b => b.month === month);
  const monthExpenses = State.expenses.filter(e => (e.date||'').startsWith(month));
  const totalBudget = monthBudgets.reduce((s,b)=>s+(b.budget_amount||0),0);
  const totalSpent = monthExpenses.reduce((s,e)=>s+(e.amount||0),0);
  const pct = totalBudget > 0 ? Math.min(100, Math.round(totalSpent / totalBudget * 100)) : 0;

  // 히어로
  document.getElementById('budget-hero').innerHTML = `
    <div class="budget-hero-total">이번 달 총 예산</div>
    <div class="budget-hero-amount">${Utils.formatMoney(totalBudget)}</div>
    <div class="budget-hero-sub">현재 ${Utils.formatMoney(totalSpent)} 사용 중</div>
    <div class="budget-hero-bar"><div class="budget-hero-fill" style="width:${pct}%"></div></div>
    <div class="budget-hero-pct">${pct}% 사용</div>
  `;

  // 항목별 편집
  const catList = APP_DATA.categories.slice(0, 10);
  const el = document.getElementById('budget-items-list');
  el.innerHTML = catList.map(cat => {
    const budget = monthBudgets.find(b => b.category === cat.id);
    const spent = monthExpenses.filter(e => e.category === cat.id).reduce((s,e)=>s+(e.amount||0),0);
    return `
      <div class="budget-edit-item">
        <div class="budget-cat-icon">${cat.emoji}</div>
        <div class="budget-cat-info">
          <div class="budget-cat-name">${cat.id}</div>
          <div class="budget-cat-spent">사용: ${Utils.formatMoneyShort(spent)}</div>
        </div>
        <input type="number" class="budget-amount-input"
          data-cat="${cat.id}"
          value="${budget ? budget.budget_amount : ''}"
          placeholder="0"
          onchange="updateBudget('${cat.id}', this.value)">
      </div>`;
  }).join('');
}

async function updateBudget(category, amount) {
  const month = State.budgetMonth;
  const existing = State.budgets.find(b => b.month === month && b.category === category);
  const val = parseInt(amount) || 0;

  if (existing) {
    await API.put('budgets', existing.id, { ...existing, budget_amount: val });
    State.budgets = State.budgets.map(b => b.id === existing.id ? { ...b, budget_amount: val } : b);
  } else {
    const newBudget = await API.post('budgets', { category, month, budget_amount: val, goal_amount: val });
    State.budgets.push(newBudget);
  }
  showToast(`💰 ${category} 예산이 저장되었어요`);
}

/* ────────────────────────────────
   지출 추가
──────────────────────────────── */
function openAddExpenseModal() {
  const modal = document.getElementById('add-expense-modal');
  modal.style.display = 'flex';
  document.getElementById('expense-date').value = Utils.getToday();

  // 카테고리 그리드
  const grid = document.getElementById('expense-category-grid');
  grid.innerHTML = APP_DATA.categories.map(cat => `
    <button class="cat-btn ${cat.id === State.selectedCategory ? 'active' : ''}" onclick="selectCategory('${cat.id}')">
      <span class="cat-emoji">${cat.emoji}</span>${cat.id}
    </button>`).join('');

  // 결제 수단
  const sel = document.getElementById('expense-payment');
  sel.innerHTML = `<option value="직접입력">현금/직접입력</option>` +
    State.cards.map(c => `<option value="${c.id}">${c.card_name}</option>`).join('');
}

function selectCategory(id) {
  State.selectedCategory = id;
  document.querySelectorAll('#expense-category-grid .cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().includes(id));
  });
}

async function saveExpense() {
  const amount = parseInt(document.getElementById('expense-amount').value);
  const desc = document.getElementById('expense-desc').value;
  const payment = document.getElementById('expense-payment').value;
  const date = document.getElementById('expense-date').value;
  const isFixed = document.getElementById('expense-fixed').checked;

  if (!amount || amount <= 0) { showToast('⚠️ 금액을 입력해주세요'); return; }
  if (!desc) { showToast('⚠️ 내용을 입력해주세요'); return; }

  const isCard = State.cards.find(c => c.id === payment);
  const newExpense = {
    amount, description: desc, category: State.selectedCategory,
    date: date || Utils.getToday(),
    payment_method: isCard ? isCard.card_name : payment,
    card_id: isCard ? payment : '',
    is_fixed: isFixed, discount_amount: 0, memo: ''
  };

  const saved = await API.post('expenses', newExpense);
  State.expenses.push(saved);

  // 카드 실적 업데이트
  if (isCard) {
    const updated = { ...isCard, performance_current: (isCard.performance_current || 0) + amount };
    await API.put('cards', isCard.id, updated);
    State.cards = State.cards.map(c => c.id === isCard.id ? updated : c);
  }

  closeModal('add-expense-modal');
  renderCurrentTab();
  showToast('✅ 지출이 추가되었어요!');

  // 입력 초기화
  document.getElementById('expense-amount').value = '';
  document.getElementById('expense-desc').value = '';
}

/* ────────────────────────────────
   카드 추가
──────────────────────────────── */
function initCardForm() {
  const modal = document.getElementById('add-card-modal');
  modal.style.display = 'flex';

  // 카드사 셀렉트
  const compSel = document.getElementById('new-card-company');
  compSel.innerHTML = APP_DATA.cardCompanies.map(c => `<option value="${c}">${c}</option>`).join('');
  updateCardList();

  // 색상 선택
  const picker = document.getElementById('card-color-picker');
  picker.innerHTML = APP_DATA.cardColors.map(color => `
    <div class="color-dot ${color === State.selectedCardColor ? 'selected' : ''}"
      style="background:${color}"
      onclick="selectCardColor('${color}')"></div>`).join('');
}

function updateCardList() {
  const company = document.getElementById('new-card-company').value;
  const cards = APP_DATA.cardsByCompany[company] || [];
  const nameSel = document.getElementById('new-card-name');
  nameSel.innerHTML = cards.map(c => `<option value="${c}">${c}</option>`).join('');
}

function selectCardColor(color) {
  State.selectedCardColor = color;
  document.querySelectorAll('.color-dot').forEach(d => {
    d.classList.toggle('selected', d.style.background === color || d.style.backgroundColor === hexToRgb(color));
  });
}

async function saveCard() {
  if (State.cards.length >= 10) { showToast('⚠️ 최대 10개까지 등록 가능해요'); return; }

  const company = document.getElementById('new-card-company').value;
  const name = document.getElementById('new-card-name').value;
  const type = document.querySelector('input[name="card-type"]:checked').value;
  const last4 = document.getElementById('card-last4').value;
  const perfType = document.getElementById('perf-type').value;
  const perfLimit = parseInt(document.getElementById('perf-limit').value) || 300000;
  const benefits = [...document.querySelectorAll('.benefit-input')].map(i => i.value).filter(Boolean);

  if (!last4 || last4.length < 4) { showToast('⚠️ 카드 끝 4자리를 입력해주세요'); return; }

  const newCard = {
    card_company: company, card_name: name, card_type: type,
    card_number_last4: last4.slice(-4),
    card_color: State.selectedCardColor,
    performance_type: perfType, performance_limit: perfLimit, performance_current: 0,
    benefit_1: benefits[0] || '', benefit_2: benefits[1] || '', benefit_3: benefits[2] || '',
    is_active: true, order_index: State.cards.length + 1,
    user_id: 'default'
  };

  const saved = await API.post('cards', newCard);
  State.cards.push(saved);
  closeModal('add-card-modal');
  renderCards();
  showToast('✅ 카드가 추가되었어요!');
}

async function deleteCard(id) {
  if (!confirm('이 카드를 삭제하시겠어요?')) return;
  await API.delete('cards', id);
  State.cards = State.cards.filter(c => c.id !== id);
  renderCards();
  showToast('🗑️ 카드가 삭제되었어요');
}

function openUpdatePerf(id) {
  const card = State.cards.find(c => c.id === id);
  if (!card) return;
  const val = prompt(`${card.card_name}\n이번 달 현재 실적 금액을 입력해주세요 (원)`, card.performance_current || 0);
  if (val === null) return;
  const amount = parseInt(val) || 0;
  API.put('cards', id, { ...card, performance_current: amount }).then(updated => {
    State.cards = State.cards.map(c => c.id === id ? { ...c, performance_current: amount } : c);
    renderCards();
    showToast('✅ 실적이 업데이트됐어요!');
  });
}

/* ────────────────────────────────
   냉장고 재료 추가
──────────────────────────────── */
function openAddFridgeModal() {
  const modal = document.getElementById('add-fridge-modal');
  modal.style.display = 'flex';
  document.getElementById('fridge-expire').value = '';
  document.getElementById('fridge-name').value = '';
}

async function saveFridgeItem() {
  const name = document.getElementById('fridge-name').value;
  const category = document.getElementById('fridge-category').value;
  const quantity = document.getElementById('fridge-quantity').value;
  const unit = document.getElementById('fridge-unit').value;
  const storageType = document.querySelector('input[name="storage"]:checked').value;
  const expire = document.getElementById('fridge-expire').value;

  if (!name) { showToast('⚠️ 재료 이름을 입력해주세요'); return; }

  const item = {
    name, category, quantity, unit, storage_type: storageType,
    expire_date: expire || '', added_date: Utils.getToday(), is_used: false
  };
  const saved = await API.post('fridge_items', item);
  State.fridgeItems.push(saved);
  closeModal('add-fridge-modal');
  renderFridge();
  showToast('🧊 재료가 추가되었어요!');
}

/* ────────────────────────────────
   알림 패널
──────────────────────────────── */
function renderNotifications() {
  const panel = document.getElementById('notification-panel');
  panel.style.display = 'flex';
  const list = document.getElementById('notif-list');
  const notifications = [];

  // 카드 실적 알림
  State.cards.forEach(card => {
    const pct = Math.round((card.performance_current || 0) / (card.performance_limit || 1) * 100);
    if (pct >= 80 && pct < 100) {
      notifications.push({ icon: '💳', title: `${card.card_name} 실적 거의 완료!`, body: `현재 ${pct}% 달성. ${Utils.formatMoney((card.performance_limit||0)-(card.performance_current||0))} 더 쓰면 혜택 가득!`, time: '방금' });
    }
    if (pct >= 100) {
      notifications.push({ icon: '🎉', title: `${card.card_name} 실적 달성!`, body: `이번 달 ${card.card_name} 실적을 모두 채웠어요! 혜택을 마음껏 누리세요.`, time: '방금' });
    }
  });

  // 냉장고 알림
  State.fridgeItems.filter(i => !i.is_used && Utils.daysUntil(i.expire_date) <= 3).forEach(item => {
    const days = Utils.daysUntil(item.expire_date);
    notifications.push({ icon: '⚠️', title: `${item.name} 유통기한 임박!`, body: `${days >= 0 ? `${days}일` : '이미'} 지났어요. 빨리 드세요!`, time: '오늘' });
  });

  if (notifications.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔔</div><p>새로운 알림이 없어요</p></div>';
  } else {
    list.innerHTML = notifications.map(n => `
      <div class="notif-item">
        <span class="notif-icon">${n.icon}</span>
        <div class="notif-content">
          <div class="notif-title">${n.title}</div>
          <div class="notif-body">${n.body}</div>
          <div class="notif-time">${n.time}</div>
        </div>
      </div>`).join('');
  }
}

/* ────────────────────────────────
   유틸리티
──────────────────────────────── */
function darkenColor(hex, amount = 0.15) {
  try {
    let r = parseInt(hex.slice(1,3), 16);
    let g = parseInt(hex.slice(3,5), 16);
    let b = parseInt(hex.slice(5,7), 16);
    r = Math.max(0, Math.floor(r * (1 - amount)));
    g = Math.max(0, Math.floor(g * (1 - amount)));
    b = Math.max(0, Math.floor(b * (1 - amount)));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  } catch { return hex; }
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function showToast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, duration);
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/* ────────────────────────────────
   이벤트 리스너
──────────────────────────────── */
let _eventsInited = false;
function initEventListeners() {
  if (_eventsInited) return;
  _eventsInited = true;
  // 하단 내비게이션
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 지출 추가 버튼
  document.getElementById('add-expense-btn').addEventListener('click', openAddExpenseModal);
  document.getElementById('close-expense-modal').addEventListener('click', () => closeModal('add-expense-modal'));
  document.getElementById('save-expense-btn').addEventListener('click', saveExpense);

  // 카드 추가 버튼
  document.getElementById('add-card-btn').addEventListener('click', initCardForm);
  document.getElementById('close-card-modal').addEventListener('click', () => closeModal('add-card-modal'));
  document.getElementById('save-card-btn').addEventListener('click', saveCard);

  // 냉장고 추가
  document.getElementById('add-fridge-btn').addEventListener('click', openAddFridgeModal);
  document.getElementById('close-fridge-modal').addEventListener('click', () => closeModal('add-fridge-modal'));
  document.getElementById('save-fridge-btn').addEventListener('click', saveFridgeItem);

  // 알림 버튼
  document.getElementById('notification-btn').addEventListener('click', renderNotifications);
  document.getElementById('close-notif-panel').addEventListener('click', () => closeModal('notification-panel'));

  // 모달 오버레이 클릭 닫기
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  // 지출 내역 필터
  document.getElementById('expense-filter-tabs').addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-tab')) {
      document.querySelectorAll('#expense-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      renderExpenses();
    }
  });

  // 냉장고 필터
  document.querySelectorAll('#page-fridge .filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-fridge .filter-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      State.fridgeFilter = btn.dataset.storage || 'all';
      renderFridge();
    });
  });

  // 월 네비게이션 - 지출
  document.getElementById('prev-month-btn').addEventListener('click', () => {
    State.expenseMonth = Utils.addMonths(State.expenseMonth, -1);
    renderExpenses();
  });
  document.getElementById('next-month-btn').addEventListener('click', () => {
    State.expenseMonth = Utils.addMonths(State.expenseMonth, 1);
    renderExpenses();
  });

  // 월 네비게이션 - 통계
  document.getElementById('stat-prev-month').addEventListener('click', () => {
    State.statMonth = Utils.addMonths(State.statMonth, -1);
    renderStats();
  });
  document.getElementById('stat-next-month').addEventListener('click', () => {
    State.statMonth = Utils.addMonths(State.statMonth, 1);
    renderStats();
  });

  // 월 네비게이션 - 예산
  document.getElementById('budget-prev-month').addEventListener('click', () => {
    State.budgetMonth = Utils.addMonths(State.budgetMonth, -1);
    renderBudget();
  });
  document.getElementById('budget-next-month').addEventListener('click', () => {
    State.budgetMonth = Utils.addMonths(State.budgetMonth, 1);
    renderBudget();
  });

  // 영수증 스캔 배너
  document.getElementById('scan-receipt-btn').addEventListener('click', () => {
    showToast('📷 영수증 스캔 기능은 안드로이드 앱에서 제공됩니다');
  });

  // 예산 탭 이동 (통계 → 예산)
  document.querySelectorAll('[onclick="switchTab(\'budget\')"]').forEach(el => {
    el.addEventListener('click', () => switchTab('budget'));
  });
}

/* ────────────────────────────────
   앱 초기화
──────────────────────────────── */
async function initApp() {
  await loadAllData();

  // 스플래시 제거 후 레이아웃 결정
  setTimeout(() => {
    document.getElementById('splash-screen').style.display = 'none';

    if (window.innerWidth >= 1024) {
      // ── 웹(데스크톱) 모드 ──
      document.getElementById('app').style.display = 'none';
      document.getElementById('web-layout').style.display = 'flex';
      // web.js의 initWebLayout이 DOMContentLoaded 후 setTimeout(,2400)으로 실행되므로
      // 여기서 직접 호출
      if (typeof initWebLayout === 'function') {
        WebState.month = Utils.getCurrentMonth();
        initWebEvents();
        webRenderDashboard();
      }
    } else {
      // ── 모바일 모드 ──
      document.getElementById('app').style.display = 'flex';
      document.getElementById('app').style.flexDirection = 'column';
      document.getElementById('app').style.height = '100dvh';
      document.getElementById('web-layout').style.display = 'none';
      initEventListeners();
      renderDashboard();
    }

    updateNotifBadge();

    if (API.mode === 'local') {
      setTimeout(() => showToast('☁️ GitHub Pages에서는 브라우저 로컬 저장소 모드로 실행돼요', 3200), 250);
    }
  }, 2200);
}

function updateNotifBadge() {
  let count = 0;
  State.cards.forEach(card => {
    const pct = Math.round((card.performance_current||0) / (card.performance_limit||1) * 100);
    if (pct >= 80) count++;
  });
  State.fridgeItems.forEach(item => {
    if (!item.is_used && Utils.daysUntil(item.expire_date) <= 3) count++;
  });
  // 모바일 배지
  const badge = document.getElementById('notif-badge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
  // 웹 배지
  const webBadge = document.getElementById('web-notif-badge');
  if (webBadge) { webBadge.textContent = count; webBadge.style.display = count > 0 ? 'flex' : 'none'; }
}

// 앱 시작
window.addEventListener('DOMContentLoaded', initApp);
