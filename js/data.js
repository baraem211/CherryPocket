/* =============================================
   체리포켓 - 앱 데이터 & 상수
   ============================================= */

const APP_DATA = {

  /* 카테고리 정의 */
  categories: [
    { id: '주거',   emoji: '🏠', color: '#6366f1', bg: '#eef2ff' },
    { id: '통신',   emoji: '📱', color: '#06b6d4', bg: '#ecfeff' },
    { id: '식료품', emoji: '🛒', color: '#22c55e', bg: '#dcfce7' },
    { id: '외식',   emoji: '🍽️', color: '#f97316', bg: '#ffedd5' },
    { id: '의류',   emoji: '👗', color: '#ec4899', bg: '#fce7f3' },
    { id: '의료',   emoji: '🏥', color: '#ef4444', bg: '#fee2e2' },
    { id: '경조사', emoji: '🎁', color: '#8b5cf6', bg: '#ede9fe' },
    { id: '교통',   emoji: '🚌', color: '#0ea5e9', bg: '#e0f2fe' },
    { id: '공과금', emoji: '💡', color: '#eab308', bg: '#fef9c3' },
    { id: '적금',   emoji: '🏦', color: '#14b8a6', bg: '#ccfbf1' },
    { id: '보험',   emoji: '🛡️', color: '#64748b', bg: '#f1f5f9' },
    { id: '문화',   emoji: '🎬', color: '#d946ef', bg: '#fae8ff' },
    { id: '교육',   emoji: '📚', color: '#f59e0b', bg: '#fef3c7' },
    { id: '기타',   emoji: '📦', color: '#94a3b8', bg: '#f8fafc' },
  ],

  /* 카드 색상 팔레트 */
  cardColors: [
    '#e8344e', '#c42a40', '#6366f1', '#8b5cf6',
    '#0ea5e9', '#14b8a6', '#22c55e', '#f97316',
    '#eab308', '#ec4899', '#334155', '#1e293b',
  ],

  /* 카드사 목록 */
  cardCompanies: [
    '신한카드', '삼성카드', 'KB국민카드', '현대카드', '롯데카드',
    '우리카드', 'NH농협카드', '하나카드', 'IBK기업은행', '카카오뱅크',
    '토스뱅크', 'BC카드'
  ],

  /* 카드사별 대표 카드 */
  cardsByCompany: {
    '신한카드':   ['신한 Deep Dream', '신한 Mr.Life', '신한 B.Big', '신한 SOL카드', '신한 Air 1.5'],
    '삼성카드':   ['삼성 taptap', '삼성 iD SIMPLE', '삼성 O2O', '삼성 Link', '삼성 빅3'],
    'KB국민카드': ['KB 노리체크', 'KB 직장인보너스', 'KB 스타체크', 'KB 알파원', 'KB 노리2'],
    '현대카드':   ['현대 ZERO Edition2', '현대 M Edition3', '현대 The Green', '현대 X Edition2', '현대 CLUB Edition2'],
    '롯데카드':   ['롯데 LOCA365', '롯데 CASHBACK', '롯데 스카이패스', '롯데 포인트플러스', '롯데 LOCA MZ'],
    '우리카드':   ['우리 카드의 정석', '우리 NU체크', '우리 다이아몬드', '우리 Biz플래티늄', '우리 CLUB Cash'],
    'NH농협카드': ['NH 올원체크', 'NH 1Q카드', 'NH Harvest', 'NH 농협BC', 'NH 스마트결제'],
    '하나카드':   ['하나 1Q Pay', '하나 CLUBм', '하나 Viva X', '하나 Gentle', '하나 Ace'],
    'IBK기업은행': ['IBK 딱!한가지', 'IBK 탄탄대로', 'IBK My플러스', 'IBK THE특별한S체크', 'IBK POCKET CMA체크'],
    '카카오뱅크': ['카카오뱅크 체크카드', '카카오뱅크 Mini', '카카오뱅크 프렌즈 체크'],
    '토스뱅크':   ['토스뱅크 체크카드', '토스 신용카드'],
    'BC카드':     ['BC 바로카드', 'BC 페이북', 'BC 청춘대로', 'BC 굿데이 체크'],
  },

  /* 식재료 이모지 매핑 */
  fridgeEmoji: {
    '고기류':   '🥩', '수산물': '🐟', '유제품': '🥛',
    '냉동식품': '🧊', '가공식품': '📦', '양념/소스': '🫙',
    '기타':     '🥬'
  },
};

/* 유틸 함수 */
const Utils = {
  formatMoney: (n) => {
    if (n === undefined || n === null) return '0원';
    return Math.round(n).toLocaleString('ko-KR') + '원';
  },
  formatMoneyShort: (n) => {
    if (n >= 10000) return (n / 10000).toFixed(1).replace('.0','') + '만원';
    return n.toLocaleString('ko-KR') + '원';
  },
  getToday: () => {
    return new Date().toISOString().slice(0, 10);
  },
  getCurrentMonth: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  },
  daysUntil: (dateStr) => {
    if (!dateStr) return 9999;
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  },
  monthLabel: (ym) => {
    const [y, m] = ym.split('-');
    return `${y}년 ${parseInt(m)}월`;
  },
  addMonths: (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  },
  getCatInfo: (catId) => {
    return APP_DATA.categories.find(c => c.id === catId) || APP_DATA.categories.at(-1);
  },
};
