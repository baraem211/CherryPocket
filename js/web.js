/* =============================================
   체리포켓 - 웹(데스크톱) 전용 로직
   브레이크포인트: 1024px 이상에서 활성화
   ============================================= */

const WEB_BREAKPOINT = 1024;

const WebState = {
  currentTab: 'dashboard',
  month: Utils.getCurrentMonth(),
  fridgeFilter: 'all',
  charts: {},
};

/* ────────────────────────────────
   레이아웃 감지 및 전환
──────────────────────────────── */
function isWebMode() {
  return window.innerWidth >= WEB_BREAKPOINT;
}

function applyLayout() {
  const web = document.getElementById('web-layout');
  const app = document.getElementById('app');
  if (isWebMode()) {
    web.style.display = 'flex';
    app.style.display = 'none';
  } else {
    web.style.display = 'none';
    app.style.display = 'flex';
  }
}

/* ────────────────────────────────
   웹 탭 전환
──────────────────────────────── */
function webSwitchTab(tab) {
  WebState.currentTab = tab;

  // 사이드바 강조
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.webTab === tab);
  });

  // 페이지 전환
  document.querySelectorAll('.web-page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(`web-page-${tab}`);
  if (page) page.classList.add('active');

  // 상단 타이틀 & 월 네비게이션 표시
  const titles = {
    dashboard: '홈 대시보드', cards: '내 카드 관리',
    expenses: '지출 내역', stats: '지출 통계',
    fridge: '냉장고 파먹기', budget: '예산 관리',
  };
  document.getElementById('web-topbar-title').textContent = titles[tab] || '';
  const showMonthNav = ['expenses', 'stats', 'budget'].includes(tab);
  document.getElementById('web-month-nav').style.display = showMonthNav ? 'flex' : 'none';
  document.getElementById('web-month-label').textContent = Utils.monthLabel(WebState.month);

  webRenderTab(tab);
}

function webRenderTab(tab) {
  switch (tab) {
    case 'dashboard': webRenderDashboard(); break;
    case 'cards':     webRenderCards(); break;
    case 'expenses':  webRenderExpenses(); break;
    case 'stats':     webRenderStats(); break;
    case 'fridge':    webRenderFridge(); break;
    case 'budget':    webRenderBudget(); break;
  }
}

/* ────────────────────────────────
   대시보드
──────────────────────────────── */
function webRenderDashboard() {
  const month = WebState.month;
  const monthExpenses = State.expenses.filter(e => (e.date||'').startsWith(month));
  const total = monthExpenses.reduce((s,e) => s+(e.amount||0), 0);
  const totalDiscount = monthExpenses.reduce((s,e) => s+(e.discount_amount||0), 0);
  const fixed = monthExpenses.filter(e=>e.is_fixed).reduce((s,e) => s+(e.amount||0), 0);
  const variable = total - fixed;

  // 히어로
  document.getElementById('web-summary-month').textContent = Utils.monthLabel(month);
  document.getElementById('web-dashboard-total').textContent = Utils.formatMoney(total);
  document.getElementById('web-dash-discount').textContent = Utils.formatMoney(totalDiscount);
  document.getElementById('web-dash-fixed').textContent = Utils.formatMoney(fixed);
  document.getElementById('web-dash-variable').textContent = Utils.formatMoney(variable);

  // 사이드바 미니
  document.getElementById('sidebar-month-label').textContent = Utils.monthLabel(month);
  document.getElementById('sidebar-total').textContent = Utils.formatMoney(total);

  // 카드 실적
  const cardRow = document.getElementById('web-dashboard-cards');
  cardRow.innerHTML = '';
  if (State.cards.length === 0) {
    cardRow.innerHTML = '<div class="empty-state" style="padding:16px"><p>등록된 카드가 없어요</p></div>';
  } else {
    State.cards.forEach(card => {
      const pct = Math.min(100, Math.round((card.performance_current||0) / (card.performance_limit||1) * 100));
      const div = document.createElement('div');
      div.className = 'card-mini';
      div.style.background = `linear-gradient(135deg, ${card.card_color||'#e8344e'} 0%, ${darkenColor(card.card_color||'#e8344e')} 100%)`;
      div.innerHTML = `
        <div class="card-mini-icon">${card.card_type==='check'?'🟡':'💳'}</div>
        <div class="card-mini-name">${card.card_name}</div>
        <div class="card-mini-last4">•••• ${card.card_number_last4||'0000'}</div>
        <div class="card-mini-progress-label">실적 ${pct}% ${pct>=100?'✅ 완료!':'진행중'}</div>
        <div class="card-mini-bar"><div class="card-mini-bar-fill" style="width:${pct}%"></div></div>
        <div class="card-mini-amounts">
          <span>${Utils.formatMoneyShort(card.performance_current||0)}</span>
          <span>/ ${Utils.formatMoneyShort(card.performance_limit||0)}</span>
        </div>`;
      div.addEventListener('click', () => webSwitchTab('cards'));
      cardRow.appendChild(div);
    });
  }

  // 도넛 차트
  webRenderDonutChart(monthExpenses);

  // 최근 지출
  const recent = [...monthExpenses].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,8);
  renderExpenseList('web-recent-expenses', recent);

  // 냉장고 임박
  webRenderFridgeAlerts();
}

function webRenderDonutChart(expenses) {
  const catTotals = {};
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0)+(e.amount||0); });
  const labels = Object.keys(catTotals);
  const values = Object.values(catTotals);
  const colors = labels.map(l => Utils.getCatInfo(l).color);
  const canvas = document.getElementById('web-donut-chart');
  if (WebState.charts.donut) WebState.charts.donut.destroy();
  if (labels.length === 0) {
    canvas.parentElement.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>이번 달 지출 내역이 없어요</p></div>';
    return;
  }
  WebState.charts.donut = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: 'white' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'Noto Sans KR', size: 12 }, padding: 10, boxWidth: 14 } },
        tooltip: { callbacks: { label: ctx => ` ${Utils.formatMoney(ctx.raw)}` } }
      },
      cutout: '62%'
    }
  });
}

function webRenderFridgeAlerts() {
  const alertList = document.getElementById('web-fridge-alert-list');
  const section = document.getElementById('web-fridge-alert-section');
  const alertItems = State.fridgeItems
    .filter(i => !i.is_used)
    .map(i => ({ ...i, days: Utils.daysUntil(i.expire_date) }))
    .filter(i => i.days <= 5)
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
      <div class="alert-item ${isDanger ? 'danger' : ''}" style="flex:1;min-width:200px;">
        <span class="alert-icon">${emoji}</span>
        <div class="alert-text">
          <div class="alert-name">${item.name}</div>
          <div class="alert-date">${item.expire_date}</div>
        </div>
        <span class="alert-days">${dayText}</span>
      </div>`;
  }).join('');
}

/* ────────────────────────────────
   카드
──────────────────────────────── */
function webRenderCards() {
  const list = document.getElementById('web-my-cards-list');
  list.innerHTML = '';
  if (State.cards.length === 0) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">💳</div><p>등록된 카드가 없어요<br>카드를 추가해보세요!</p></div>`;
  } else {
    State.cards.forEach(card => {
      const pct = Math.min(100, Math.round((card.performance_current||0) / (card.performance_limit||1) * 100));
      const benefits = [card.benefit_1, card.benefit_2, card.benefit_3].filter(Boolean);
      const div = document.createElement('div');
      div.className = 'my-card-full';
      div.style.background = `linear-gradient(135deg, ${card.card_color||'#e8344e'} 0%, ${darkenColor(card.card_color||'#e8344e', 0.2)} 100%)`;
      div.innerHTML = `
        <div class="my-card-top">
          <div>
            <div class="my-card-company">${card.card_company||''}</div>
            <div class="my-card-name">${card.card_name||'내 카드'}</div>
          </div>
          <div class="my-card-type-badge">${card.card_type==='check'?'체크':'신용'}</div>
        </div>
        <div class="my-card-number">•••• •••• •••• ${card.card_number_last4||'0000'}</div>
        <div class="my-card-perf-label">실적 ${pct}% 달성 (${Utils.formatMoney(card.performance_current||0)} / ${Utils.formatMoney(card.performance_limit||0)})</div>
        <div class="my-card-bar"><div class="my-card-bar-fill" style="width:${pct}%"></div></div>
        <div class="my-card-perf-amounts"><span>${pct>=100?'✅ 달성 완료!': `${Utils.formatMoney((card.performance_limit||0)-(card.performance_current||0))} 남음`}</span></div>
        ${benefits.length>0?`<div class="my-card-benefits">${benefits.map(b=>`<span class="benefit-tag">${b}</span>`).join('')}</div>`:''}
        <div class="my-card-actions">
          <button class="card-action-btn" onclick="openUpdatePerf('${card.id}')">실적 업데이트</button>
          <button class="card-action-btn danger" onclick="deleteCard('${card.id}');webRenderCards();">삭제</button>
        </div>`;
      list.appendChild(div);
    });
  }

  // 추천 & 사용현황
  const recEl = document.getElementById('web-card-recommend');
  const usageEl = document.getElementById('web-card-usage-list');

  const recs = [];
  State.cards.forEach(card => {
    const pct = Math.round((card.performance_current||0)/(card.performance_limit||1)*100);
    if (pct < 100) recs.push({ text:`${card.card_name}: 실적까지 ${Utils.formatMoney((card.performance_limit||0)-(card.performance_current||0))} 남음`, card: card.card_name });
    if (card.benefit_1) recs.push({ text: card.benefit_1, card: card.card_name });
  });
  recEl.innerHTML = recs.length === 0
    ? '<div class="empty-state"><p>카드 혜택 정보가 없어요</p></div>'
    : recs.slice(0,4).map(r=>`<div class="recommend-item"><div class="rec-dot"></div><div class="rec-text">${r.text}</div><div class="rec-card-name">${r.card}</div></div>`).join('');

  const month = WebState.month;
  const usage = {};
  State.expenses.filter(e=>(e.date||'').startsWith(month)&&e.card_id).forEach(e=>{usage[e.card_id]=(usage[e.card_id]||0)+(e.amount||0);});
  const maxUsage = Math.max(...Object.values(usage),1);
  usageEl.innerHTML = State.cards.length === 0
    ? '<div class="empty-state"><p>카드가 없어요</p></div>'
    : State.cards.map(card=>{
        const used = usage[card.id]||0;
        const pct = Math.round(used/maxUsage*100);
        return `<div class="card-usage-item">
          <div class="card-usage-header"><span class="card-usage-name">💳 ${card.card_name}</span><span class="card-usage-amount">${Utils.formatMoney(used)}</span></div>
          <div class="card-usage-bar"><div class="card-usage-bar-fill" style="width:${pct}%;background:${card.card_color}"></div></div>
        </div>`;
      }).join('');
}

/* ────────────────────────────────
   지출 내역
──────────────────────────────── */
function webRenderExpenses() {
  const month = WebState.month;
  const monthExpenses = State.expenses.filter(e=>(e.date||'').startsWith(month));
  const activeFilter = document.querySelector('#web-expense-filter-tabs .filter-tab.active')?.dataset.filter||'all';
  let filtered = monthExpenses;
  if (activeFilter === '카드') filtered = monthExpenses.filter(e=>e.card_id);
  else if (activeFilter === '고정') filtered = monthExpenses.filter(e=>e.is_fixed);
  else if (activeFilter !== 'all') filtered = monthExpenses.filter(e=>e.category===activeFilter);

  const total = monthExpenses.reduce((s,e)=>s+(e.amount||0),0);
  const discount = monthExpenses.reduce((s,e)=>s+(e.discount_amount||0),0);
  const fixed = monthExpenses.filter(e=>e.is_fixed).reduce((s,e)=>s+(e.amount||0),0);

  document.getElementById('web-expense-month-summary').innerHTML = `
    <div class="month-stat-card" style="flex:1"><div class="month-stat-val">${Utils.formatMoney(total)}</div><div class="month-stat-label">총 지출</div></div>
    <div class="month-stat-card" style="flex:1"><div class="month-stat-val">${Utils.formatMoney(fixed)}</div><div class="month-stat-label">고정 지출</div></div>
    <div class="month-stat-card" style="flex:1;border-color:var(--green-light)"><div class="month-stat-val" style="color:var(--green)">${Utils.formatMoney(discount)}</div><div class="month-stat-label">총 할인</div></div>
  `;

  // 날짜별 그룹
  const grouped = {};
  filtered.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).forEach(e=>{
    if(!grouped[e.date]) grouped[e.date]=[];
    grouped[e.date].push(e);
  });

  const container = document.getElementById('web-expense-full-list');
  if (Object.keys(grouped).length===0) {
    container.innerHTML='<div class="empty-state"><div class="empty-state-icon">🧾</div><p>지출 내역이 없어요</p></div>';
    return;
  }
  container.innerHTML = Object.entries(grouped).map(([date, items])=>{
    const dayTotal = items.reduce((s,e)=>s+(e.amount||0),0);
    const [y,m,d] = date.split('-');
    const dayHtml = items.map(e=>{
      const cat = Utils.getCatInfo(e.category);
      const discount = e.discount_amount>0?`<div class="expense-discount">-${Utils.formatMoney(e.discount_amount)} 할인</div>`:'';
      const card = State.cards.find(c=>c.id===e.card_id);
      const cardLabel = card?card.card_name:(e.payment_method||'직접입력');
      return `<div class="expense-item">
        <div class="expense-icon" style="background:${cat.bg}">${cat.emoji}</div>
        <div class="expense-info">
          <div class="expense-name">${e.description||e.category}</div>
          <div class="expense-meta">${cardLabel}${e.is_fixed?' · 고정':''}</div>
        </div>
        <div class="expense-right">
          <div class="expense-amount">${Utils.formatMoney(e.amount)}</div>${discount}
        </div>
      </div>`;
    }).join('');
    return `<div class="expense-date-header">${m}월 ${d}일 · ${Utils.formatMoneyShort(dayTotal)}</div><div class="expense-list">${dayHtml}</div>`;
  }).join('');
}

/* ────────────────────────────────
   통계
──────────────────────────────── */
function webRenderStats() {
  const month = WebState.month;
  const monthExpenses = State.expenses.filter(e=>(e.date||'').startsWith(month));

  // 예산 진행률
  const monthBudgets = State.budgets.filter(b=>b.month===month);
  const el = document.getElementById('web-budget-progress-list');
  if (monthBudgets.length===0) {
    el.innerHTML='<div class="empty-state" style="grid-column:1/-1"><p>예산이 설정되지 않았어요<br><button class="text-btn" onclick="webSwitchTab(\'budget\')">예산 설정하기</button></p></div>';
  } else {
    el.innerHTML = monthBudgets.map(b=>{
      const spent = monthExpenses.filter(e=>e.category===b.category).reduce((s,e)=>s+(e.amount||0),0);
      const pct = Math.min(100,Math.round(spent/(b.budget_amount||1)*100));
      const color = pct>=90?'var(--cherry)':pct>=70?'var(--orange)':'var(--green)';
      const cat = Utils.getCatInfo(b.category);
      return `<div class="budget-item">
        <div class="budget-header">
          <span class="budget-cat">${cat.emoji} ${b.category}</span>
          <span class="budget-amounts"><strong>${Utils.formatMoneyShort(spent)}</strong> / ${Utils.formatMoneyShort(b.budget_amount)}</span>
        </div>
        <div class="budget-progress"><div class="budget-progress-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="budget-pct" style="color:${color}">${pct}%</div>
      </div>`;
    }).join('');
  }

  // 바 차트
  const catTotals = {};
  monthExpenses.forEach(e=>{ catTotals[e.category]=(catTotals[e.category]||0)+(e.amount||0); });
  const sorted = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
  const barCanvas = document.getElementById('web-stats-bar-chart');
  if (WebState.charts.bar) WebState.charts.bar.destroy();
  if (sorted.length > 0) {
    WebState.charts.bar = new Chart(barCanvas, {
      type: 'bar',
      data: { labels: sorted.map(([k])=>k), datasets: [{ data: sorted.map(([,v])=>v), backgroundColor: sorted.map(([k])=>Utils.getCatInfo(k).color), borderRadius:8, borderSkipped:false }] },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${Utils.formatMoney(ctx.raw)}`}} },
        scales: {
          y:{ticks:{callback:v=>Utils.formatMoneyShort(v),font:{family:'Noto Sans KR',size:11}},grid:{color:'rgba(0,0,0,0.05)'}},
          x:{ticks:{font:{family:'Noto Sans KR',size:12}},grid:{display:false}}
        }
      }
    });
  }

  // 라인 차트
  const months = [-2,-1,0].map(n=>Utils.addMonths(month,n));
  const totals = months.map(m=>State.expenses.filter(e=>(e.date||'').startsWith(m)).reduce((s,e)=>s+(e.amount||0),0));
  const lineCanvas = document.getElementById('web-stats-line-chart');
  if (WebState.charts.line) WebState.charts.line.destroy();
  WebState.charts.line = new Chart(lineCanvas, {
    type:'line',
    data:{ labels:months.map(m=>Utils.monthLabel(m)), datasets:[{ data:totals, borderColor:'#e8344e', backgroundColor:'rgba(232,52,78,0.08)', borderWidth:2.5, pointRadius:5, pointBackgroundColor:'#e8344e', tension:0.4, fill:true }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${Utils.formatMoney(ctx.raw)}`}}},
      scales:{y:{ticks:{callback:v=>Utils.formatMoneyShort(v),font:{family:'Noto Sans KR',size:11}},grid:{color:'rgba(0,0,0,0.05)'}},x:{ticks:{font:{family:'Noto Sans KR',size:12}},grid:{display:false}}}
    }
  });

  // 할인 요약
  const cardDiscounts = {};
  monthExpenses.forEach(e=>{
    if(e.discount_amount>0){
      const card=State.cards.find(c=>c.id===e.card_id);
      const name=card?card.card_name:(e.payment_method||'기타');
      cardDiscounts[name]=(cardDiscounts[name]||0)+e.discount_amount;
    }
  });
  const dsEl = document.getElementById('web-discount-summary');
  dsEl.innerHTML = Object.keys(cardDiscounts).length===0
    ? '<div class="empty-state"><p>이번 달 할인 내역이 없어요</p></div>'
    : Object.entries(cardDiscounts).map(([name,val])=>`<div class="discount-item"><span class="discount-name">💳 ${name}</span><span class="discount-val">-${Utils.formatMoney(val)}</span></div>`).join('');
}

/* ────────────────────────────────
   냉장고
──────────────────────────────── */
function webRenderFridge() {
  const filter = WebState.fridgeFilter;
  let items = State.fridgeItems.filter(i=>!i.is_used);
  if (filter !== 'all') items = items.filter(i=>i.storage_type===filter);

  // 임박
  const expireSoon = items.filter(i=>Utils.daysUntil(i.expire_date)<=3);
  const expireSection = document.getElementById('web-fridge-expire-section');
  const expireList = document.getElementById('web-fridge-expire-list');
  if (expireSoon.length>0) {
    expireSection.style.display='block';
    expireList.innerHTML = expireSoon.map(item=>{
      const days=Utils.daysUntil(item.expire_date);
      const dayText=days<0?'기한 초과!':days===0?'D-Day!':`D-${days}`;
      const emoji=APP_DATA.fridgeEmoji[item.category]||'🥬';
      return `<div class="alert-item ${days<=1?'danger':''}">
        <span class="alert-icon">${emoji}</span>
        <div class="alert-text"><div class="alert-name">${item.name} (${item.quantity}${item.unit})</div><div class="alert-date">${item.expire_date}</div></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="alert-days">${dayText}</span>
          <button onclick="markFridgeUsed('${item.id}');webRenderFridge();webRenderFridgeAlerts();" style="font-size:11px;padding:3px 8px;border-radius:10px;border:none;background:var(--cherry);color:white;cursor:pointer;font-family:var(--font)">사용완료</button>
        </div>
      </div>`;
    }).join('');
  } else {
    expireSection.style.display='none';
  }

  // 전체 목록
  const grid = document.getElementById('web-fridge-items-grid');
  const count = document.getElementById('web-fridge-count-label');
  count.textContent = `${items.length}개`;
  items.sort((a,b)=>Utils.daysUntil(a.expire_date)-Utils.daysUntil(b.expire_date));
  if (items.length===0) {
    grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🧊</div><p>냉장고가 비었어요!</p></div>';
    return;
  }
  grid.innerHTML = items.map(item=>{
    const days=Utils.daysUntil(item.expire_date);
    const isExpiring=days<=3&&days>=0;
    const isExpired=days<0;
    const emoji=APP_DATA.fridgeEmoji[item.category]||'🥬';
    const badge=isExpired?`<span class="fridge-expire-badge">초과</span>`:isExpiring?`<span class="fridge-expire-badge">D-${days}</span>`:'';
    return `<div class="fridge-card ${isExpired?'expired':isExpiring?'expiring':''}" onclick="openFridgeDetail('${item.id}')">
      ${badge}
      <div class="fridge-emoji">${emoji}</div>
      <div class="fridge-name">${item.name}</div>
      <div class="fridge-qty">${item.quantity}${item.unit}</div>
      <span class="fridge-storage-badge storage-${item.storage_type}">${item.storage_type}</span>
    </div>`;
  }).join('');
}

/* ────────────────────────────────
   예산
──────────────────────────────── */
function webRenderBudget() {
  const month = WebState.month;
  document.getElementById('web-budget-month-label2').textContent = Utils.monthLabel(month);
  const monthBudgets = State.budgets.filter(b=>b.month===month);
  const monthExpenses = State.expenses.filter(e=>(e.date||'').startsWith(month));
  const totalBudget = monthBudgets.reduce((s,b)=>s+(b.budget_amount||0),0);
  const totalSpent = monthExpenses.reduce((s,e)=>s+(e.amount||0),0);
  const pct = totalBudget>0?Math.min(100,Math.round(totalSpent/totalBudget*100)):0;

  document.getElementById('web-budget-total-amount').textContent = Utils.formatMoney(totalBudget);
  document.getElementById('web-budget-spent').textContent = Utils.formatMoney(totalSpent);
  document.getElementById('web-budget-remain').textContent = Utils.formatMoney(Math.max(0,totalBudget-totalSpent));

  const catList = APP_DATA.categories.slice(0,10);
  const el = document.getElementById('web-budget-items-list');
  el.innerHTML = catList.map(cat=>{
    const budget = monthBudgets.find(b=>b.category===cat.id);
    const spent = monthExpenses.filter(e=>e.category===cat.id).reduce((s,e)=>s+(e.amount||0),0);
    return `<div class="budget-edit-item">
      <div class="budget-cat-icon">${cat.emoji}</div>
      <div class="budget-cat-info">
        <div class="budget-cat-name">${cat.id}</div>
        <div class="budget-cat-spent">사용: ${Utils.formatMoneyShort(spent)}</div>
      </div>
      <input type="number" class="budget-amount-input"
        data-cat="${cat.id}"
        value="${budget?budget.budget_amount:''}"
        placeholder="0"
        onchange="updateBudget('${cat.id}', this.value)">
    </div>`;
  }).join('');
}

/* ────────────────────────────────
   월 네비게이션
──────────────────────────────── */
function webChangeMonth(dir) {
  WebState.month = Utils.addMonths(WebState.month, dir);
  document.getElementById('web-month-label').textContent = Utils.monthLabel(WebState.month);
  // 모바일 State도 동기화
  State.expenseMonth = WebState.month;
  State.statMonth = WebState.month;
  State.budgetMonth = WebState.month;
  webRenderTab(WebState.currentTab);
}

/* ────────────────────────────────
   이벤트 리스너 초기화
──────────────────────────────── */
let _webEventsInited = false;
function initWebEvents() {
  if (_webEventsInited) return;
  _webEventsInited = true;
  // 사이드바 탭
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
    btn.addEventListener('click', () => webSwitchTab(btn.dataset.webTab));
  });

  // 지출 추가 버튼
  document.getElementById('web-add-expense-btn').addEventListener('click', openAddExpenseModal);

  // 카드 추가 버튼
  document.getElementById('web-add-card-btn').addEventListener('click', initCardForm);

  // 냉장고 추가 버튼
  document.getElementById('web-add-fridge-btn').addEventListener('click', openAddFridgeModal);

  // 알림 버튼
  document.getElementById('web-notification-btn').addEventListener('click', renderNotifications);

  // 영수증 스캔 버튼
  document.getElementById('web-scan-btn').addEventListener('click', () => showToast('📷 영수증 스캔은 안드로이드 앱에서 지원됩니다'));

  // 월 네비게이션
  document.getElementById('web-prev-month').addEventListener('click', () => webChangeMonth(-1));
  document.getElementById('web-next-month').addEventListener('click', () => webChangeMonth(1));

  // 지출 필터 탭
  document.getElementById('web-expense-filter-tabs').addEventListener('click', e => {
    if (e.target.classList.contains('filter-tab')) {
      document.querySelectorAll('#web-expense-filter-tabs .filter-tab').forEach(t=>t.classList.remove('active'));
      e.target.classList.add('active');
      webRenderExpenses();
    }
  });

  // 냉장고 필터 탭
  document.getElementById('web-fridge-filter-tabs').addEventListener('click', e => {
    if (e.target.classList.contains('filter-tab')) {
      document.querySelectorAll('#web-fridge-filter-tabs .filter-tab').forEach(t=>t.classList.remove('active'));
      e.target.classList.add('active');
      WebState.fridgeFilter = e.target.dataset.storage || 'all';
      webRenderFridge();
    }
  });

  // 알림 배지 (웹용)
  const badge = document.getElementById('web-notif-badge');
  let cnt = 0;
  State.cards.forEach(c => { if (Math.round((c.performance_current||0)/(c.performance_limit||1)*100)>=80) cnt++; });
  State.fridgeItems.forEach(i => { if(!i.is_used&&Utils.daysUntil(i.expire_date)<=3) cnt++; });
  badge.textContent = cnt;
  badge.style.display = cnt > 0 ? 'flex' : 'none';
}

/* ────────────────────────────────
   초기화 & 리사이즈 대응
──────────────────────────────── */
function initWebLayout() {
  applyLayout();
}

// 리사이즈 시 레이아웃 전환
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const wasWeb = document.getElementById('web-layout').style.display !== 'none';
    const isWeb = isWebMode();

    if (isWeb && !wasWeb) {
      // 모바일 → 웹 전환
      document.getElementById('app').style.display = 'none';
      document.getElementById('web-layout').style.display = 'flex';
      WebState.month = Utils.getCurrentMonth();
      try { initWebEvents(); } catch(e) {}
      webRenderTab(WebState.currentTab);
    } else if (!isWeb && wasWeb) {
      // 웹 → 모바일 전환
      document.getElementById('web-layout').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      document.getElementById('app').style.flexDirection = 'column';
      document.getElementById('app').style.height = '100dvh';
      try { initEventListeners(); } catch(e) {}
      renderCurrentTab();
    }
  }, 150);
});
