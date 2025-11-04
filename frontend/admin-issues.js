'use strict';

const ISSUE_STATUS_LABELS = {
  new: 'ใหม่',
  in_progress: 'กำลังดำเนินการ',
  resolved: 'แก้ไขแล้ว',
  closed: 'ปิดเรื่อง'
};

const ISSUE_PRIORITY_LABELS = {
  low: 'ต่ำ',
  normal: 'ปกติ',
  high: 'สูง',
  urgent: 'เร่งด่วน'
};

const SUMMARY_TILES = [
  { key: 'total', label: 'ทั้งหมด', note: 'จำนวนคำร้องในระบบ' },
  { key: 'new', label: 'ใหม่', note: 'รอเจ้าหน้าที่รับเรื่อง' },
  { key: 'in_progress', label: 'กำลังดำเนินการ', note: 'กำลังติดตามแก้ไข' },
  { key: 'resolved', label: 'แก้ไขแล้ว', note: 'รอยืนยันจากผู้ใช้' },
  { key: 'closed', label: 'ปิดเรื่อง', note: 'ดำเนินการเสร็จสิ้น' }
];

function ensureAdmin(){
  const userStr = localStorage.getItem('user');
  if(!userStr){
    window.location.href = 'login.html';
    return null;
  }
  try{
    const user = JSON.parse(userStr);
    if(user?.role !== 'admin'){
      window.location.href = 'index.html';
      return null;
    }
    return user;
  }catch(err){
    console.error('ensureAdmin parse error', err);
    window.location.href = 'login.html';
    return null;
  }
}

const currentUser = ensureAdmin();
if(!currentUser){
  throw new Error('Permission denied: admin only');
}

const authToken = localStorage.getItem('authToken');
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...(authToken ? { Authorization: 'Bearer ' + authToken } : {})
};

const PHP_API_BASE = (() => {
  const { origin, pathname } = window.location;
  const segments = pathname.split('/');
  if(segments.length && segments[segments.length - 1] === '') segments.pop();
  if(segments.length) segments.pop();
  if(segments.length && segments[segments.length - 1] === 'frontend') segments.pop();
  const basePath = segments.filter(Boolean).join('/');
  const prefix = basePath ? `/${basePath}` : '';
  return `${origin}${prefix}/api`;
})();

const phpApi = (endpoint) => `${PHP_API_BASE}/${endpoint}`;

async function fetchJson(url, options = {}){
  try{
    const res = await fetch(url, options);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }catch(err){
    console.error('fetchJson error', url, err);
    return null;
  }
}

async function postJson(endpoint, payload){
  const url = endpoint.startsWith('http') ? endpoint : phpApi(endpoint);
  try{
    const res = await fetch(url, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    if(!res.ok) throw new Error(data?.error || ('HTTP ' + res.status));
    return data;
  }catch(err){
    console.error('postJson error', endpoint, err);
    throw err;
  }
}

const state = {
  issues: [],
  counts: null,
  filtered: [],
  selectedIssueId: null
};

let pendingOpenIssueId = (() => {
  try{
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('issue');
    if(!raw) return null;
    const id = parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  }catch(err){
    return null;
  }
})();

const elements = {
  summaryGrid: document.getElementById('issuesSummary'),
  statusFilter: document.getElementById('statusFilter'),
  priorityFilter: document.getElementById('priorityFilter'),
  table: document.getElementById('issuesTable'),
  tbody: document.querySelector('#issuesTable tbody'),
  refreshBtn: document.getElementById('refreshIssuesBtn'),
  drawer: document.getElementById('issueDrawer'),
  drawerTitle: document.getElementById('drawerTitle'),
  drawerMeta: document.getElementById('drawerMeta'),
  drawerMessage: document.getElementById('drawerMessage'),
  drawerReplies: document.getElementById('drawerReplies'),
  drawerStatus: document.getElementById('drawerStatus'),
  drawerStatusMsg: document.getElementById('drawerStatusMsg'),
  replyForm: document.getElementById('replyForm'),
  replyMessage: document.getElementById('replyMessage'),
  closeDrawerBtn: document.getElementById('closeDrawerBtn')
};

function normalizeIssueStatus(status, fallback = 'new'){
  const raw = String(status ?? '').trim().toLowerCase();
  if(raw === 'in progress' || raw === 'in-progress' || raw === 'progress') return 'in_progress';
  if(raw === 'resolved') return 'resolved';
  if(raw === 'closed') return 'closed';
  if(raw === 'in_progress') return 'in_progress';
  if(raw === 'new') return 'new';
  return raw || fallback;
}

function normalizeIssuePriority(priority, fallback = 'normal'){
  const raw = String(priority ?? '').trim().toLowerCase();
  if(raw === 'low') return 'low';
  if(raw === 'high') return 'high';
  if(raw === 'urgent' || raw === 'critical') return 'urgent';
  if(raw === 'normal') return 'normal';
  return raw || fallback;
}

function formatDate(value){
  if(!value) return '-';
  try{
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  }catch(err){
    return '-';
  }
}

function showTablePlaceholder(message){
  if(!elements.tbody) return;
  elements.tbody.innerHTML = '';
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 7;
  td.className = 'issues-empty';
  td.textContent = message;
  tr.appendChild(td);
  elements.tbody.appendChild(tr);
}

function renderIssuesSummary(counts){
  if(!elements.summaryGrid) return;
  const data = counts || {};
  const total = Number(data.total || 0);
  const byStatus = data.by_status || {};
  elements.summaryGrid.innerHTML = '';

  SUMMARY_TILES.forEach(tile => {
    const value = tile.key === 'total'
      ? total
      : Number(byStatus[tile.key] ?? 0);

    const card = document.createElement('div');
    card.className = 'issues-summary-tile';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = tile.label;
    card.appendChild(label);

    const valueEl = document.createElement('div');
    valueEl.className = 'value';
    valueEl.textContent = value.toLocaleString('th-TH');
    card.appendChild(valueEl);

    if(tile.note){
      const note = document.createElement('div');
      note.style.fontSize = '12px';
      note.style.color = '#64748b';
      note.textContent = tile.note;
      card.appendChild(note);
    }

    elements.summaryGrid.appendChild(card);
  });
}

function renderIssuesTable(list){
  if(!elements.tbody) return;
  elements.tbody.innerHTML = '';

  list.forEach(issue => {
    const tr = document.createElement('tr');
    tr.dataset.issueId = String(issue.id);

    tr.addEventListener('click', (event) => {
      if(event.target instanceof HTMLElement && event.target.closest('button')) return;
      openIssueDrawer(issue.id);
    });

    const subjectTd = document.createElement('td');
    const subjectWrap = document.createElement('div');
    subjectWrap.style.display = 'flex';
    subjectWrap.style.flexDirection = 'column';
    subjectWrap.style.gap = '6px';

    const subjectTitle = document.createElement('span');
    subjectTitle.style.fontWeight = '600';
    subjectTitle.style.color = '#0f172a';
    subjectTitle.textContent = issue.subject || '-';
    subjectWrap.appendChild(subjectTitle);

    if(issue.message_preview){
      const preview = document.createElement('span');
      preview.style.fontSize = '12px';
      preview.style.color = '#64748b';
      preview.textContent = issue.message_preview;
      subjectWrap.appendChild(preview);
    }
    subjectTd.appendChild(subjectWrap);
    tr.appendChild(subjectTd);

    const reporterTd = document.createElement('td');
    const reporterWrap = document.createElement('div');
    reporterWrap.style.display = 'flex';
    reporterWrap.style.flexDirection = 'column';
    reporterWrap.style.gap = '4px';

    const reporterName = document.createElement('span');
    reporterName.style.fontWeight = '600';
    reporterName.textContent = issue.reporter || '-';
    reporterWrap.appendChild(reporterName);

    if(issue.reporter_email){
      const reporterEmail = document.createElement('span');
      reporterEmail.style.fontSize = '12px';
      reporterEmail.style.color = '#64748b';
      reporterEmail.textContent = issue.reporter_email;
      reporterWrap.appendChild(reporterEmail);
    }

    if(issue.reporter_role){
      const reporterRole = document.createElement('span');
      reporterRole.style.fontSize = '11px';
      reporterRole.style.textTransform = 'uppercase';
      reporterRole.style.letterSpacing = '0.04em';
      reporterRole.style.color = '#94a3b8';
      reporterRole.textContent = issue.reporter_role;
      reporterWrap.appendChild(reporterRole);
    }

    reporterTd.appendChild(reporterWrap);
    tr.appendChild(reporterTd);

    const categoryTd = document.createElement('td');
    categoryTd.textContent = issue.category || '-';
    tr.appendChild(categoryTd);

    const priorityTd = document.createElement('td');
    const priorityTag = document.createElement('span');
    priorityTag.className = 'issues-priority-tag';
    priorityTag.dataset.priority = issue.priority;
    priorityTag.textContent = ISSUE_PRIORITY_LABELS[issue.priority] || (issue.priority || '-');
    priorityTd.appendChild(priorityTag);
    tr.appendChild(priorityTd);

    const statusTd = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className = 'issues-status-pill';
    statusPill.dataset.status = issue.status;
    statusPill.textContent = ISSUE_STATUS_LABELS[issue.status] || (issue.status || '-');
    statusTd.appendChild(statusPill);
    tr.appendChild(statusTd);

    const dateTd = document.createElement('td');
    dateTd.textContent = formatDate(issue.last_activity_at || issue.updated_at || issue.created_at);
    tr.appendChild(dateTd);

    const actionTd = document.createElement('td');
    const btnWrap = document.createElement('div');
    btnWrap.className = 'issues-action-buttons';

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'issues-action-btn';
    viewBtn.textContent = 'ดูรายละเอียด';
    viewBtn.addEventListener('click', () => openIssueDrawer(issue.id));
    btnWrap.appendChild(viewBtn);

    actionTd.appendChild(btnWrap);
    tr.appendChild(actionTd);

    if(state.selectedIssueId === issue.id){
      tr.style.outline = '2px solid rgba(37, 99, 235, 0.4)';
      tr.style.outlineOffset = '-2px';
    }

    elements.tbody.appendChild(tr);
  });
}

function applyFilters(){
  const statusValueRaw = elements.statusFilter?.value || '';
  const priorityValueRaw = elements.priorityFilter?.value || '';
  const statusFilterValue = statusValueRaw ? normalizeIssueStatus(statusValueRaw, statusValueRaw) : '';
  const priorityFilterValue = priorityValueRaw ? normalizeIssuePriority(priorityValueRaw, priorityValueRaw) : '';

  let filtered = state.issues.slice();
  if(statusFilterValue){
    filtered = filtered.filter(issue => issue.status === normalizeIssueStatus(statusFilterValue));
  }
  if(priorityFilterValue){
    filtered = filtered.filter(issue => issue.priority === normalizeIssuePriority(priorityFilterValue));
  }

  state.filtered = filtered;

  if(filtered.length === 0){
    const message = state.issues.length === 0
      ? 'ยังไม่มีคำร้องจากผู้ใช้ในระบบ'
      : 'ยังไม่มีคำร้องที่ตรงกับตัวกรองนี้';
    showTablePlaceholder(message);
    return;
  }

  renderIssuesTable(filtered);
}

async function loadIssues(){
  showTablePlaceholder('กำลังโหลดข้อมูล...');
  const data = await fetchJson(phpApi('admin/issues.php'), { headers: DEFAULT_HEADERS });
  if(!data){
    showTablePlaceholder('ไม่สามารถโหลดข้อมูลได้ โปรดลองใหม่');
    return;
  }

  const issues = Array.isArray(data.issues) ? data.issues : [];
  state.counts = data.counts || null;
  state.issues = issues.map(issue => ({
    ...issue,
    status: normalizeIssueStatus(issue.status),
    priority: normalizeIssuePriority(issue.priority)
  }));

  renderIssuesSummary(state.counts);
  applyFilters();

  if(pendingOpenIssueId){
    const exists = state.issues.some(item => item.id === pendingOpenIssueId);
    if(exists){
      const issueId = pendingOpenIssueId;
      pendingOpenIssueId = null;
      openIssueDrawer(issueId);
    }
  }
}

function updateUrlIssueParam(issueId){
  try{
    const url = new URL(window.location.href);
    if(issueId){
      url.searchParams.set('issue', issueId);
    }else{
      url.searchParams.delete('issue');
    }
    window.history.replaceState({}, '', url);
  }catch(err){
    // ignore history issues
  }
}

function setDrawerVisibility(open){
  if(!elements.drawer) return;
  elements.drawer.dataset.open = open ? 'true' : 'false';
}

async function openIssueDrawer(issueId){
  if(!elements.drawer) return;
  state.selectedIssueId = issueId;
  updateUrlIssueParam(issueId);
  setDrawerVisibility(true);
  if(elements.drawerTitle) elements.drawerTitle.textContent = 'กำลังโหลด...';
  if(elements.drawerMeta) elements.drawerMeta.innerHTML = '';
  if(elements.drawerMessage) elements.drawerMessage.textContent = 'กำลังโหลดรายละเอียด...';
  if(elements.drawerReplies) elements.drawerReplies.innerHTML = '';
  if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = '';
  if(elements.replyMessage) elements.replyMessage.value = '';

  const detail = await fetchJson(`${phpApi('admin/issue_detail.php')}?id=${encodeURIComponent(issueId)}`, { headers: DEFAULT_HEADERS });
  if(!detail?.issue){
    if(elements.drawerMessage) elements.drawerMessage.textContent = 'ไม่พบรายละเอียดคำร้องนี้';
    return;
  }

  renderDrawer(detail.issue);
}

function closeIssueDrawer(){
  state.selectedIssueId = null;
  updateUrlIssueParam(null);
  setDrawerVisibility(false);
  applyFilters();
}

elements.closeDrawerBtn?.addEventListener('click', () => {
  closeIssueDrawer();
});

document.addEventListener('keydown', (event) => {
  if(event.key === 'Escape'){ closeIssueDrawer(); }
});

function renderDrawer(issue){
  if(elements.drawerTitle) elements.drawerTitle.textContent = issue.subject || 'รายละเอียดคำร้อง';
  if(elements.drawerMessage) elements.drawerMessage.textContent = issue.message || 'ไม่มีรายละเอียดเพิ่มเติม';
  if(elements.drawerStatus){
    const normalizedStatus = normalizeIssueStatus(issue.status);
    elements.drawerStatus.value = normalizedStatus;
    elements.drawerStatus.dataset.previous = normalizedStatus;
  }

  if(elements.drawerMeta){
    elements.drawerMeta.innerHTML = '';

    const metaEntries = [
      { label: 'ผู้แจ้ง', value: issue.reporter || '-' },
      { label: 'อีเมล', value: issue.reporter_email || '-' },
      { label: 'บทบาท', value: issue.reporter_role || '-' },
      { label: 'ความสำคัญ', value: ISSUE_PRIORITY_LABELS[normalizeIssuePriority(issue.priority)] || '-' },
      { label: 'สถานะ', value: ISSUE_STATUS_LABELS[normalizeIssueStatus(issue.status)] || '-' },
      { label: 'สร้างเมื่อ', value: formatDate(issue.created_at) },
      { label: 'อัปเดตล่าสุด', value: formatDate(issue.updated_at) }
    ];

    metaEntries.forEach(meta => {
      const wrapper = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'issues-drawer-label';
      label.textContent = meta.label;
      const value = document.createElement('div');
      value.textContent = meta.value || '-';
      wrapper.appendChild(label);
      wrapper.appendChild(value);
      elements.drawerMeta.appendChild(wrapper);
    });
  }

  if(elements.drawerReplies){
    elements.drawerReplies.innerHTML = '';
    const replies = Array.isArray(issue.replies) ? issue.replies : [];
    if(replies.length === 0){
      const empty = document.createElement('div');
      empty.className = 'issues-empty';
      empty.style.margin = '0';
      empty.textContent = 'ยังไม่มีการตอบกลับ';
      elements.drawerReplies.appendChild(empty);
    }else{
      replies.forEach(reply => {
        const card = document.createElement('div');
        card.className = 'issues-reply-card';

        const meta = document.createElement('div');
        meta.className = 'issues-reply-meta';
        const author = document.createElement('span');
        author.textContent = reply.responder_name || 'ทีมงาน';
        const date = document.createElement('span');
        date.textContent = formatDate(reply.created_at);
        meta.appendChild(author);
        meta.appendChild(date);

        const body = document.createElement('p');
        body.className = 'issues-reply-text';
        body.textContent = reply.message || '';

        card.appendChild(meta);
        card.appendChild(body);
        elements.drawerReplies.appendChild(card);
      });
    }
  }
}

async function handleStatusChange(){
  if(!elements.drawerStatus) return;
  const issueId = state.selectedIssueId;
  if(!issueId) return;
  const newStatus = normalizeIssueStatus(elements.drawerStatus.value);
  const previous = normalizeIssueStatus(elements.drawerStatus.dataset.previous || newStatus);
  if(newStatus === previous) return;

  try{
    elements.drawerStatus.disabled = true;
    if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = 'กำลังอัปเดตสถานะ...';
    await postJson('admin/update_issue_status.php', {
      issue_id: issueId,
      status: newStatus,
      note: ''
    });
    elements.drawerStatus.dataset.previous = newStatus;
    if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = 'อัปเดตสถานะเรียบร้อย';
    pendingOpenIssueId = issueId;
    await loadIssues();
  }catch(err){
    if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = err.message || 'ไม่สามารถอัปเดตสถานะได้';
    elements.drawerStatus.value = previous;
  }finally{
    elements.drawerStatus.disabled = false;
    setTimeout(() => {
      if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = '';
    }, 2500);
  }
}

elements.drawerStatus?.addEventListener('change', handleStatusChange);

elements.replyForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const issueId = state.selectedIssueId;
  if(!issueId) return;
  const message = (elements.replyMessage?.value || '').trim();
  if(message === ''){
    if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = 'กรุณากรอกข้อความตอบกลับ';
    return;
  }

  try{
    const submitBtn = elements.replyForm.querySelector('button[type="submit"]');
    if(submitBtn){
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังส่ง...';
    }
    if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = '';
    await postJson('admin/reply_issue.php', {
      issue_id: issueId,
      message
    });
    if(elements.replyMessage) elements.replyMessage.value = '';
    if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = 'ส่งตอบกลับเรียบร้อย';
    pendingOpenIssueId = issueId;
    await loadIssues();
  }catch(err){
    if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = err.message || 'ไม่สามารถส่งตอบกลับได้';
  }finally{
    const submitBtn = elements.replyForm.querySelector('button[type="submit"]');
    if(submitBtn){
      submitBtn.disabled = false;
      submitBtn.textContent = 'ส่งตอบกลับ';
    }
    setTimeout(() => {
      if(elements.drawerStatusMsg) elements.drawerStatusMsg.textContent = '';
    }, 2500);
  }
});

elements.refreshBtn?.addEventListener('click', async () => {
  pendingOpenIssueId = state.selectedIssueId || pendingOpenIssueId;
  await loadIssues();
});

elements.statusFilter?.addEventListener('change', () => {
  applyFilters();
});

elements.priorityFilter?.addEventListener('change', () => {
  applyFilters();
});

loadIssues().catch(err => console.error('init issues page error', err));
