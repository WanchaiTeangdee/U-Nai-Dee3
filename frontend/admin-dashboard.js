'use strict';

const ROLE_LABELS = { customer: 'ลูกค้า', landlord: 'ผู้ปล่อยเช่า', admin: 'แอดมิน' }
const ROLE_COLORS = {
  admin: '#f59e0b',
  landlord: '#10b981',
  customer: '#6366f1'
}
const STATUS_LABELS = { pending: 'รอตรวจสอบ', active: 'เผยแพร่', inactive: 'ปิดประกาศ' }
const STATUS_OPTIONS = [
  { value: 'pending', label: STATUS_LABELS.pending },
  { value: 'active', label: STATUS_LABELS.active },
  { value: 'inactive', label: STATUS_LABELS.inactive }
]

const ISSUE_STATUS_LABELS = {
  new: 'ใหม่',
  in_progress: 'กำลังดำเนินการ',
  resolved: 'แก้ไขแล้ว',
  closed: 'ปิดเรื่อง'
}

const ISSUE_PRIORITY_LABELS = {
  low: 'ต่ำ',
  normal: 'ปกติ',
  high: 'สูง',
  urgent: 'เร่งด่วน'
}

function ensureSupportedStatusValue(selectElement){
  if(!STATUS_OPTIONS.some((opt) => opt.value === selectElement.value)){
    selectElement.value = STATUS_OPTIONS[0].value
  }
}

function renderStatusBadge(cell, status){
  const actual = status || ''
  const pillVariant = STATUS_LABELS[actual] ? actual : 'pending'
  const label = STATUS_LABELS[actual] || (actual || '-')
  cell.dataset.status = actual
  cell.innerHTML = ''
  const badge = document.createElement('span')
  badge.className = `status-pill status-pill--${pillVariant}`
  badge.textContent = label
  cell.appendChild(badge)
}

function ensureAdmin(){
  const userStr = localStorage.getItem('user')
  if(!userStr){
    window.location.href = 'index.html'
    return null
  }
  const user = JSON.parse(userStr)
  if(user.role !== 'admin'){
    window.location.href = 'index.html'
    return null
  }
  return user
}

const currentUser = ensureAdmin()
if(!currentUser){
  throw new Error('Permission denied: admin only')
}

const authToken = localStorage.getItem('authToken')
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {})
}

const userModalEl = document.getElementById('userModal')
const userForm = document.getElementById('userForm')
const userFormMessage = document.getElementById('userFormMessage')
const userModalTitle = document.getElementById('userModalTitle')
const userFormSubmit = document.getElementById('userFormSubmit')
const userIdInput = document.getElementById('userId')
const userNameInput = document.getElementById('userName')
const userEmailInput = document.getElementById('userEmail')
const userRoleSelect = document.getElementById('userRole')
const userPasswordInput = document.getElementById('userPassword')
const passwordHint = document.getElementById('passwordHint')
const addUserBtn = document.getElementById('addUserBtn')
const confirmModalEl = document.getElementById('confirmDeleteModal')
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn')
const confirmErrorEl = document.getElementById('confirmError')
const confirmMessageEl = document.getElementById('confirmMessage')
const roleChartEmptyEl = document.getElementById('roleChartEmpty')
const roleChartDetailsEl = document.getElementById('roleChartDetails')
const roleDetailCountEls = {
  admin: document.getElementById('roleCount-admin'),
  landlord: document.getElementById('roleCount-landlord'),
  customer: document.getElementById('roleCount-customer')
}
const roleDetailPercentEls = {
  admin: document.getElementById('rolePercent-admin'),
  landlord: document.getElementById('rolePercent-landlord'),
  customer: document.getElementById('rolePercent-customer')
}
let roleDistributionChart = null
const listingsChartEmptyEl = document.getElementById('listingsChartEmpty')
const listingsChartDetailsEl = document.getElementById('listingsChartDetails')
const listingsChartNoteEl = document.getElementById('listingsChartNote')
const listingsTotalCountEl = document.getElementById('listingsTotalCount')
const listingsDetailCountEls = {
  condo: document.getElementById('listingsCount-condo'),
  house: document.getElementById('listingsCount-house')
}
let listingsTypeChart = null

const issueSummaryEl = document.getElementById('issueSummary')
const issueCountEls = {
  total: document.getElementById('issueCountTotal'),
  new: document.getElementById('issueCountNew'),
  in_progress: document.getElementById('issueCountInProgress'),
  resolved: document.getElementById('issueCountResolved'),
  closed: document.getElementById('issueCountClosed')
}

let usersCache = []
let userFormMode = 'create'
let pendingDeleteUserId = null

// remove old events localStorage key (events feature removed)
try{ localStorage.removeItem('admin_dashboard_events_v1') }catch(e){}

const PHP_API_BASE = (() => {
  const { origin, pathname } = window.location
  const segments = pathname.split('/')
  if(segments.length && segments[segments.length - 1] === '') segments.pop()
  if(segments.length) segments.pop()
  if(segments.length && segments[segments.length - 1] === 'frontend') segments.pop()
  const basePath = segments.filter(Boolean).join('/')
  const prefix = basePath ? `/${basePath}` : ''
  return `${origin}${prefix}/api`
})()
const phpApi = (endpoint) => `${PHP_API_BASE}/${endpoint}`

async function fetchJson(url, options = {}){
  try{
    const res = await fetch(url, options)
    if(!res.ok) throw new Error('HTTP ' + res.status)
    return await res.json()
  }catch(err){
    console.error('fetchJson error', url, err)
    return null
  }
}

function renderTable(sectionId, rows, renderer){
  const section = document.querySelector(`#${sectionId}`)
  if(!section) return
  const tbody = section.querySelector('tbody')
  const empty = section.querySelector('.empty')
  if(!tbody) return
  tbody.innerHTML = ''
  if(!rows || rows.length === 0){
    if(empty) empty.hidden = false
    return
  }
  if(empty) empty.hidden = true
  rows.forEach(row => {
    const tr = document.createElement('tr')
    renderer(tr, row)
    tbody.appendChild(tr)
  })
  // After populating rows, mark overflowing cells and add native tooltips
  try{
    applyTooltipToOverflowCells(tbody)
  }catch(e){ console.error('applyTooltip failed', e) }

  // adjust column widths to better fit content where possible
  try{
    adjustTableColumns(section)
  }catch(e){ console.error('adjustTableColumns failed', e) }
}

// Detect table cells that overflow their visible width and add an ellipsis style
// by setting data-ellipsis="true"; also set a native title attribute so the full
// text appears as a tooltip on hover. If container is provided, only check its
// descendant cells (useful for per-table checks).
function applyTooltipToOverflowCells(container){
  const root = container instanceof Element ? container : document
  const cells = root.querySelectorAll('td, th')
  cells.forEach(cell => {
    // reset
    cell.removeAttribute('data-ellipsis')
    cell.title = ''
    // clientWidth may be 0 if not visible; guard against that
    try{
      if(cell.scrollWidth > (cell.clientWidth + 1)){
        cell.setAttribute('data-ellipsis','true')
        // set title to trimmed textContent for native tooltip
        const txt = (cell.textContent || '').trim()
        if(txt) cell.title = txt
      }
    }catch(e){ /* ignore measurement errors */ }
  })
}

// Measure content widths per column and inject a <colgroup> with calculated
// widths so columns fit their content (up to the available card width).
function adjustTableColumns(section){
  if(!section) return
  const table = section.querySelector('table')
  if(!table) return

  const thead = table.querySelector('thead')
  if(!thead) return
  const headerCells = Array.from(thead.querySelectorAll('th'))
  const colCount = headerCells.length
  if(colCount === 0) return

  // collect max scrollWidth per column (including header)
  const tbodies = Array.from(table.querySelectorAll('tbody'))
  const maxWidths = new Array(colCount).fill(0)

  headerCells.forEach((th, idx) => {
    const w = Math.ceil(th.scrollWidth)
    maxWidths[idx] = Math.max(maxWidths[idx], w)
  })

  // iterate rows and measure
  const rows = table.querySelectorAll('tbody tr')
  rows.forEach(tr => {
    const cells = Array.from(tr.children).slice(0, colCount)
    cells.forEach((cell, idx) => {
      try{
        const w = Math.ceil(cell.scrollWidth)
        if(w > maxWidths[idx]) maxWidths[idx] = w
      }catch(e){}
    })
  })

  // add small padding allowance per column
  const PAD = 24 // px
  for(let i=0;i<maxWidths.length;i++) maxWidths[i] += PAD

  // honor per-table attributes:
  // data-nowrap="true" -> force single-line table and enable horizontal scrolling (skip fixed colgroup)
  // data-no-fixed-cols="i,j" -> comma-separated zero-based column indexes that should NOT get fixed width
  const tableNoWrap = table.dataset.nowrap === 'true'
  const noFixedColsAttr = (table.dataset.noFixedCols || table.dataset.noFixedCols === '') ? table.dataset.noFixedCols : table.dataset['noFixedCols']
  const noFixedCols = new Set()
  if(noFixedColsAttr){
    noFixedColsAttr.split(',').map(s=>s.trim()).filter(Boolean).forEach(v=>{ const n = parseInt(v,10); if(!isNaN(n)) noFixedCols.add(n) })
  }

  // If table requests nowrap behavior, enable horizontal scrolling and avoid forcing px col widths
  if(tableNoWrap){
    // ensure visual class and container scroll
    table.classList.add('nowrap')
    const container = table.closest('.table-container') || table.parentElement
    try{ if(container && container.classList) container.style.overflowX = 'auto' }catch(e){}
    // use auto layout so browser determines column widths naturally
    table.style.tableLayout = 'auto'
    // remove any existing colgroup
    const existing = table.querySelector('colgroup')
    if(existing) existing.remove()
    return
  }

  // determine available width inside the card for the table
  const card = table.closest('.admin-card') || table.parentElement
  const cardStyle = window.getComputedStyle(card)
  const cardPaddingLeft = parseFloat(cardStyle.paddingLeft || 0)
  const cardPaddingRight = parseFloat(cardStyle.paddingRight || 0)
  const availableWidth = Math.max(200, Math.floor(card.clientWidth - cardPaddingLeft - cardPaddingRight))

  const sumPx = maxWidths.reduce((s,n)=>s+n,0)

  // build colgroup
  let colgroup = table.querySelector('colgroup')
  if(colgroup) colgroup.remove()
  colgroup = document.createElement('colgroup')

  if(sumPx <= availableWidth){
    // set fixed px widths so each column fits content. Respect noFixedCols by leaving width unset for them.
    table.style.tableLayout = 'fixed'
    for(let i=0;i<colCount;i++){
      const col = document.createElement('col')
      if(!noFixedCols.has(i)) col.style.width = maxWidths[i] + 'px'
      colgroup.appendChild(col)
    }
  }else{
    // scale columns proportionally to availableWidth. For columns that should remain flexible (noFixedCols)
    // leave width unset so browser can wrap/allocate space; fixed columns get scaled px widths.
    table.style.tableLayout = 'fixed'
    const scale = availableWidth / sumPx
    for(let i=0;i<colCount;i++){
      const col = document.createElement('col')
      if(noFixedCols.has(i)){
        // leave width unset -> flexible
      }else{
        const w = Math.max(40, Math.floor(maxWidths[i] * scale))
        col.style.width = w + 'px'
      }
      colgroup.appendChild(col)
    }
  }

  table.insertBefore(colgroup, table.firstChild)
}

function updateRoleChart(users){
  const canvas = document.getElementById('roleDistributionChart')
  if(!canvas || typeof Chart === 'undefined') return
  const roles = ['admin', 'landlord', 'customer']
  const counts = roles.reduce((acc, role) => {
    acc[role] = 0
    return acc
  }, {})

  if(Array.isArray(users)){
    users.forEach(user => {
      const keyRaw = typeof user.role === 'string' ? user.role.trim().toLowerCase() : ''
      if(ROLE_LABELS[keyRaw]){
        counts[keyRaw] = (counts[keyRaw] || 0) + 1
      }
    })
  }

  const dataPoints = roles
    .map(role => [role, counts[role] || 0])
    .filter(([, total]) => total > 0)

  const hasData = dataPoints.length > 0
  if(roleChartEmptyEl){
    roleChartEmptyEl.hidden = hasData
  }
  updateRoleDetails(counts)
  if(!hasData){
    if(roleDistributionChart){
      roleDistributionChart.destroy()
      roleDistributionChart = null
    }
    return
  }

  const labels = dataPoints.map(([role]) => ROLE_LABELS[role] || role)
  const values = dataPoints.map(([, total]) => total)
  const colors = dataPoints.map(([role]) => ROLE_COLORS[role] || '#cbd5f5')
  const ctx = canvas.getContext('2d')
  if(!ctx) return

  if(roleDistributionChart){
    roleDistributionChart.data.labels = labels
    roleDistributionChart.data.datasets[0].data = values
    roleDistributionChart.data.datasets[0].backgroundColor = colors
    roleDistributionChart.update()
    return
  }

  roleDistributionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.85)'
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            padding: 16
          }
        },
        tooltip: {
          callbacks: {
            label(context){
              const label = context.label || ''
              const value = context.parsed || 0
              return `${label}: ${value.toLocaleString('th-TH')}`
            }
          }
        }
      }
    }
  })
}

function updateRoleDetails(counts){
  if(!roleChartDetailsEl) return
  const roles = ['admin', 'landlord', 'customer']
  const total = roles.reduce((sum, role) => sum + (counts?.[role] || 0), 0)
  const hasData = total > 0
  roleChartDetailsEl.hidden = !hasData
  if(!hasData){
    roles.forEach(role => {
      const card = roleChartDetailsEl.querySelector(`[data-role="${role}"]`)
      if(card) card.hidden = true
    })
    return
  }

  roles.forEach(role => {
    const count = counts?.[role] || 0
    const percent = total === 0 ? 0 : (count / total) * 100
    const card = roleChartDetailsEl.querySelector(`[data-role="${role}"]`)
    if(card) card.hidden = count === 0
    const countEl = roleDetailCountEls[role]
    if(countEl) countEl.textContent = count.toLocaleString('th-TH')
    const percentEl = roleDetailPercentEls[role]
    if(percentEl) percentEl.textContent = percent > 0 ? `${percent.toFixed(1)}%` : '0%'
  })
}

function updateListingsTypeChart(listings){
  const canvas = document.getElementById('listingsTypeChart')
  if(!canvas || typeof Chart === 'undefined') return
  const counts = { condo: 0, house: 0 }
  if(Array.isArray(listings)){
    listings.forEach(listing => {
      const type = typeof listing.property_type === 'string' ? listing.property_type.toLowerCase() : ''
      if(type === 'condo') counts.condo += 1
      else if(type === 'house') counts.house += 1
    })
  }
  const values = [counts.condo, counts.house]
  const hasData = values.some(val => val > 0)
  updateListingsDetails(counts)
  if(listingsChartEmptyEl){
    listingsChartEmptyEl.hidden = hasData
  }
  if(!hasData){
    if(listingsTypeChart){
      listingsTypeChart.destroy()
      listingsTypeChart = null
    }
    return
  }

  const labels = ['คอนโด', 'บ้านเช่า']
  const colors = ['#6366f1', '#10b981']
  const ctx = canvas.getContext('2d')
  if(!ctx) return

  if(listingsTypeChart){
    listingsTypeChart.data.labels = labels
    listingsTypeChart.data.datasets[0].data = values
    listingsTypeChart.update()
    return
  }

  listingsTypeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'จำนวนที่พัก',
          data: values,
          backgroundColor: colors,
          borderRadius: 8,
          maxBarThickness: 48
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            callback(value){
              try{ return Number(value).toLocaleString('th-TH') }catch(_){ return value }
            }
          },
          grid: {
            color: 'rgba(99, 102, 241, 0.08)'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label(context){
              const value = context.parsed.y || 0
              return `จำนวน ${value.toLocaleString('th-TH')} รายการ`
            }
          }
        }
      }
    }
  })
}

function updateListingsDetails(counts){
  if(!listingsChartDetailsEl) return
  const condo = counts?.condo || 0
  const house = counts?.house || 0
  const total = condo + house
  const hasData = total > 0
  listingsChartDetailsEl.hidden = !hasData
  if(!hasData){
    if(listingsChartNoteEl) listingsChartNoteEl.hidden = true
    return
  }

  const mapping = [
    ['condo', condo],
    ['house', house]
  ]

  mapping.forEach(([type, value]) => {
    const countEl = listingsDetailCountEls[type]
    if(countEl) countEl.textContent = value.toLocaleString('th-TH')
  })

  if(listingsTotalCountEl) listingsTotalCountEl.textContent = total.toLocaleString('th-TH')
  if(listingsChartNoteEl) listingsChartNoteEl.hidden = false
}

function normalizeIssueStatus(status){
  const raw = String(status ?? '').trim().toLowerCase()
  if(raw === 'in progress' || raw === 'in-progress' || raw === 'progress') return 'in_progress'
  if(raw === 'resolved') return 'resolved'
  if(raw === 'closed') return 'closed'
  if(raw === 'new' || raw === '') return 'new'
  if(raw === 'in_progress') return 'in_progress'
  return raw || 'new'
}

function normalizeIssuePriority(priority){
  const raw = String(priority ?? '').trim().toLowerCase()
  if(raw === 'low') return 'low'
  if(raw === 'high') return 'high'
  if(raw === 'urgent' || raw === 'critical') return 'urgent'
  return 'normal'
}

function formatIssueDate(value){
  if(!value) return '-'
  try{
    const date = new Date(value)
    if(Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  }catch(err){
    return '-'
  }
}

function createIssueSubjectCell(issue){
  const td = document.createElement('td')
  const subject = document.createElement('div')
  subject.className = 'issue-subject'
  const category = typeof issue?.category === 'string' && issue.category.trim() ? `[${issue.category.trim()}] ` : ''
  subject.textContent = `${category}${issue?.subject || '-'}`
  td.appendChild(subject)
  if(issue?.message_preview){
    const preview = document.createElement('div')
    preview.className = 'issue-preview'
    preview.textContent = issue.message_preview
    td.appendChild(preview)
  }
  return td
}

function createIssueReporterCell(issue){
  const td = document.createElement('td')
  const wrapper = document.createElement('div')
  wrapper.className = 'issue-reporter'

  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = issue?.reporter || '-'
  wrapper.appendChild(name)

  if(issue?.reporter_email){
    const email = document.createElement('span')
    email.className = 'email'
    email.textContent = issue.reporter_email
    wrapper.appendChild(email)
  }

  if(issue?.reporter_role){
    const role = document.createElement('span')
    role.className = 'role'
    role.textContent = issue.reporter_role
    wrapper.appendChild(role)
  }

  td.appendChild(wrapper)
  return td
}

function createIssuePriorityCell(issue){
  const td = document.createElement('td')
  const key = normalizeIssuePriority(issue?.priority)
  const pill = document.createElement('span')
  pill.className = `issue-priority-pill issue-priority--${key}`
  pill.textContent = ISSUE_PRIORITY_LABELS[key] || (issue?.priority || '-')
  td.appendChild(pill)
  return td
}

function createIssueStatusCell(issue){
  const td = document.createElement('td')
  const key = normalizeIssueStatus(issue?.status)
  const pill = document.createElement('span')
  pill.className = `issue-status-pill issue-status--${key}`
  pill.textContent = ISSUE_STATUS_LABELS[key] || (issue?.status || '-')
  td.appendChild(pill)
  return td
}

function createIssueDateCell(issue){
  const td = document.createElement('td')
  const dateValue = issue?.last_activity_at || issue?.updated_at || issue?.created_at || null
  td.textContent = formatIssueDate(dateValue)
  return td
}

function createIssueActionCell(issue){
  const td = document.createElement('td')
  const actions = document.createElement('div')
  actions.className = 'issue-actions'
  const link = document.createElement('a')
  link.className = 'link-button'
  const id = typeof issue?.id === 'number' || typeof issue?.id === 'string' ? String(issue.id) : ''
  link.href = id ? `admin-issues.html?issue=${encodeURIComponent(id)}` : 'admin-issues.html'
  link.textContent = 'เปิดรายละเอียด'
  actions.appendChild(link)
  td.appendChild(actions)
  return td
}

function updateIssueSummary(counts, issueCount = 0){
  if(!issueSummaryEl) return
  const total = Number(counts?.total ?? issueCount ?? 0) || 0
  const byStatus = counts?.by_status || {}

  const setValue = (key, value) => {
    const target = issueCountEls[key]
    if(target){
      const num = Number(value || 0)
      target.textContent = Number.isFinite(num) ? num.toLocaleString('th-TH') : '0'
    }
  }

  setValue('total', total)
  setValue('new', byStatus?.new ?? 0)
  setValue('in_progress', byStatus?.in_progress ?? byStatus?.['in-progress'] ?? 0)
  setValue('resolved', byStatus?.resolved ?? 0)
  setValue('closed', byStatus?.closed ?? 0)

  issueSummaryEl.hidden = total === 0 && issueCount === 0
}

function textCell(text){
  const td = document.createElement('td')
  td.textContent = text
  return td
}

function createStatusControl(listing, statusTd, updatedTd){
  const wrapper = document.createElement('div')
  wrapper.className = 'status-control'

  const select = document.createElement('select')
  STATUS_OPTIONS.forEach((option) => {
    const opt = document.createElement('option')
    opt.value = option.value
    opt.textContent = option.label
    select.appendChild(opt)
  })
  select.value = listing.status || 'pending'
  ensureSupportedStatusValue(select)

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'ยืนยัน'

  const syncDisabled = () => {
    const current = statusTd.dataset.status || ''
    button.disabled = select.value === current
  }

  button.addEventListener('click', () => {
    updateListingStatus(listing.id, select.value, { select, button, statusTd, updatedTd, syncDisabled })
  })

  select.addEventListener('change', () => {
    syncDisabled()
  })

  wrapper.appendChild(select)
  wrapper.appendChild(button)

  syncDisabled()
  return wrapper
}

async function updateListingStatus(listingId, newStatus, controls){
  const { select, button, statusTd, updatedTd, syncDisabled } = controls
  const previousStatus = statusTd.dataset.status || ''
  const originalText = button.textContent
  button.disabled = true
  select.disabled = true
  button.textContent = 'กำลังบันทึก...'
  try{
    const res = await fetch(phpApi('admin/update_listing_status.php'), {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ listing_id: listingId, status: newStatus })
    })
    if(!res.ok){
      throw new Error('HTTP ' + res.status)
    }
    const data = await res.json()
    if(!data || data.success !== true){
      throw new Error('invalid_response')
    }
    const updatedStatus = data.listing?.status || newStatus
  renderStatusBadge(statusTd, updatedStatus)
  select.value = updatedStatus
  ensureSupportedStatusValue(select)
    if(data.listing?.updated_at && updatedTd){
      updatedTd.textContent = data.listing.updated_at
    }
  }catch(err){
    console.error('update listing status failed', err)
  window.alert('ไม่สามารถอัปเดตสถานะได้ กรุณาลองอีกครั้ง')
  select.value = previousStatus || STATUS_OPTIONS[0].value
  ensureSupportedStatusValue(select)
  }finally{
    button.disabled = false
    select.disabled = false
    button.textContent = originalText
    if(typeof syncDisabled === 'function'){
      syncDisabled()
    }
  }
}

async function loadUsers(){
  const data = await fetchJson(phpApi('admin/users.php'), { headers: DEFAULT_HEADERS })
  usersCache = Array.isArray(data?.users) ? data.users : []
  renderTable('adminUsers', usersCache, (tr, user)=>{
    tr.dataset.userId = user.id
    tr.appendChild(textCell(user.name || '-'))
    tr.appendChild(textCell(user.email))
    tr.appendChild(textCell(ROLE_LABELS[user.role] || user.role || '-'))
    tr.appendChild(textCell(user.created_at || '-'))
    const actionTd = document.createElement('td')
    actionTd.className = 'actions-cell'
    const editBtn = document.createElement('button')
    editBtn.type = 'button'
    editBtn.className = 'action-btn'
    editBtn.textContent = 'แก้ไข'
    editBtn.addEventListener('click', () => openUserModal('edit', user))
    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'action-btn danger'
    deleteBtn.textContent = 'ลบ'
    deleteBtn.addEventListener('click', () => openConfirmDelete(user))
    actionTd.appendChild(editBtn)
    actionTd.appendChild(deleteBtn)
    tr.appendChild(actionTd)
  })
  const totalUsersEl = document.getElementById('statTotalUsers')
  if(totalUsersEl) totalUsersEl.textContent = data?.counts?.total_users ?? (data?.users?.length ?? 0)
  const newUsersEl = document.getElementById('statNewUsers')
  if(newUsersEl) newUsersEl.textContent = data?.counts?.new_users_today ?? 0
  updateRoleChart(usersCache)
}

function toggleModal(modalEl, isOpen){
  if(!modalEl) return
  modalEl.hidden = !isOpen
  document.body.style.overflow = isOpen ? 'hidden' : ''
}

function resetUserForm(){
  if(!userForm) return
  userForm.reset()
  if(userIdInput) userIdInput.value = ''
  setUserFormMessage('')
}

function setUserFormMessage(message, type = 'error'){
  if(!userFormMessage) return
  userFormMessage.textContent = message || ''
  userFormMessage.classList.remove('success')
  if(type === 'success' && message){
    userFormMessage.classList.add('success')
  }
}

function configurePasswordFieldForMode(mode){
  if(!userPasswordInput || !passwordHint) return
  if(mode === 'create'){
    userPasswordInput.required = true
    userPasswordInput.placeholder = ''
    passwordHint.textContent = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
  } else {
    userPasswordInput.required = false
    userPasswordInput.value = ''
    userPasswordInput.placeholder = 'เว้นว่างหากไม่เปลี่ยนรหัสผ่าน'
    passwordHint.textContent = 'หากไม่ต้องการเปลี่ยนรหัสผ่าน ให้เว้นว่างช่องนี้'
  }
}

function openUserModal(mode, user){
  if(!userModalEl || !userForm) return
  userFormMode = mode === 'edit' ? 'edit' : 'create'
  resetUserForm()
  configurePasswordFieldForMode(userFormMode)
  if(userModalTitle){
    userModalTitle.textContent = userFormMode === 'create' ? 'เพิ่มผู้ใช้' : 'แก้ไขข้อมูลผู้ใช้'
  }
  if(userFormSubmit){
    userFormSubmit.textContent = userFormMode === 'create' ? 'สร้างผู้ใช้' : 'บันทึกการเปลี่ยนแปลง'
    userFormSubmit.disabled = false
  }
  if(userFormMode === 'edit' && user){
    if(userIdInput) userIdInput.value = user.id
    if(userNameInput) userNameInput.value = user.name || ''
    if(userEmailInput) userEmailInput.value = user.email || ''
    if(userRoleSelect) userRoleSelect.value = user.role || 'customer'
  } else {
    if(userRoleSelect) userRoleSelect.value = 'customer'
  }
  toggleModal(userModalEl, true)
  if(userNameInput){
    setTimeout(() => userNameInput.focus(), 50)
  }
}

function closeUserModal(){
  toggleModal(userModalEl, false)
}

function openConfirmDelete(user){
  if(!confirmModalEl || !confirmDeleteBtn) return
  pendingDeleteUserId = user?.id || null
  if(confirmMessageEl){
    const roleLabel = ROLE_LABELS[user?.role] || user?.role || ''
    confirmMessageEl.innerHTML = `คุณต้องการลบผู้ใช้ <strong>${user?.name || '-'}</strong> (${user?.email || '-'}) หรือไม่?<br/>บทบาท: ${roleLabel}`
  }
  if(confirmErrorEl) confirmErrorEl.textContent = ''
  confirmDeleteBtn.disabled = false
  toggleModal(confirmModalEl, true)
}

function closeConfirmModal(){
  toggleModal(confirmModalEl, false)
  pendingDeleteUserId = null
  if(confirmErrorEl) confirmErrorEl.textContent = ''
}

async function adminUserRequest(method, payload){
  const options = {
    method,
    headers: DEFAULT_HEADERS
  }
  if(payload && method !== 'GET'){
    options.body = JSON.stringify(payload)
  }
  const res = await fetch(phpApi('admin/users.php'), options)
  const data = await res.json().catch(()=>null)
  if(!res.ok){
    const message = data?.error || 'ไม่สามารถดำเนินการได้'
    throw new Error(message)
  }
  return data
}

function attachUserManagementHandlers(){
  if(!userForm || !userModalEl) return

  addUserBtn?.addEventListener('click', () => openUserModal('create'))

  userForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if(!userFormSubmit) return
    const name = (userNameInput?.value || '').trim()
    const email = (userEmailInput?.value || '').trim()
    const role = userRoleSelect?.value || 'customer'
    const password = userPasswordInput?.value || ''

    if(!name || !email){
      setUserFormMessage('กรุณากรอกชื่อและอีเมลให้ครบถ้วน')
      return
    }
    if(userFormMode === 'create' && password.length < 8){
      setUserFormMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }

    setUserFormMessage('')
    userFormSubmit.disabled = true
    const originalText = userFormSubmit.textContent
    userFormSubmit.textContent = 'กำลังบันทึก...'
    try{
      if(userFormMode === 'create'){
        await adminUserRequest('POST', { name, email, role, password })
      }else{
        const id = Number(userIdInput?.value || 0)
        if(!id){
          throw new Error('ไม่พบข้อมูลผู้ใช้ที่ต้องการแก้ไข')
        }
        const payload = { id, name, email, role }
        if(password){
          if(password.length < 8){
            throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
          }
          payload.password = password
        }
        await adminUserRequest('PUT', payload)
      }
      await loadUsers()
      setUserFormMessage('บันทึกเรียบร้อย', 'success')
      setTimeout(() => closeUserModal(), 300)
    }catch(err){
      console.error('user form submit error', err)
      setUserFormMessage(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล')
      userFormSubmit.disabled = false
      userFormSubmit.textContent = originalText
      return
    }
    userFormSubmit.disabled = false
    userFormSubmit.textContent = originalText
  })

  const closeButtons = document.querySelectorAll('[data-close-modal]')
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if(btn.closest('#userModal')) closeUserModal()
      if(btn.closest('#confirmDeleteModal')) closeConfirmModal()
    })
  })

  if(userModalEl){
    userModalEl.addEventListener('click', (event) => {
      if(event.target === userModalEl){
        closeUserModal()
      }
    })
  }

  if(confirmModalEl){
    confirmModalEl.addEventListener('click', (event) => {
      if(event.target === confirmModalEl){
        closeConfirmModal()
      }
    })
  }

  window.addEventListener('keydown', (event) => {
    if(event.key === 'Escape'){
      if(!userModalEl?.hidden){
        closeUserModal()
      }else if(!confirmModalEl?.hidden){
        closeConfirmModal()
      }
    }
  })

  confirmDeleteBtn?.addEventListener('click', async () => {
    if(!pendingDeleteUserId) return
    confirmDeleteBtn.disabled = true
    confirmDeleteBtn.textContent = 'กำลังลบ...'
    if(confirmErrorEl) confirmErrorEl.textContent = ''
    try{
      await adminUserRequest('DELETE', { id: pendingDeleteUserId })
      await loadUsers()
      confirmDeleteBtn.disabled = false
      confirmDeleteBtn.textContent = 'ลบผู้ใช้'
      closeConfirmModal()
    }catch(err){
      console.error('delete user error', err)
      confirmDeleteBtn.disabled = false
      confirmDeleteBtn.textContent = 'ลบผู้ใช้'
      if(confirmErrorEl) confirmErrorEl.textContent = err.message || 'ลบผู้ใช้ไม่สำเร็จ'
    }
  })
}

attachUserManagementHandlers()

async function loadListings(){
  const data = await fetchJson(phpApi('admin/listings.php'), { headers: DEFAULT_HEADERS })
  const listings = Array.isArray(data?.listings) ? data.listings : []
  renderTable('adminListings', listings, (tr, listing)=>{
    tr.appendChild(textCell(listing.title || '-'))
    tr.appendChild(textCell(listing.owner || '-'))
    const statusTd = document.createElement('td')
    renderStatusBadge(statusTd, listing.status)
    const updatedTd = textCell(listing.updated_at || '-')
    const actionTd = document.createElement('td')
    actionTd.appendChild(createStatusControl(listing, statusTd, updatedTd))
    tr.appendChild(statusTd)
    tr.appendChild(actionTd)
    tr.appendChild(updatedTd)
  })
  updateListingsTypeChart(listings)
}

async function loadBookings(){
  const bookingsSection = document.getElementById('adminBookings')
  const newBookingsEl = document.getElementById('statNewBookings')
  if(!bookingsSection && !newBookingsEl) return
  const data = await fetchJson(phpApi('admin/bookings.php'), { headers: DEFAULT_HEADERS })
  if(bookingsSection){
    renderTable('adminBookings', data?.bookings || [], (tr, booking)=>{
      tr.appendChild(textCell(booking.tenant || '-'))
      tr.appendChild(textCell(booking.listing || '-'))
      tr.appendChild(textCell(booking.period || '-'))
      tr.appendChild(textCell(booking.status || '-'))
    })
  }
  if(newBookingsEl) newBookingsEl.textContent = data?.counts?.new_bookings_today ?? 0
}

async function loadIssues(){
  const section = document.getElementById('adminIssues')
  if(!section) return
  const data = await fetchJson(phpApi('admin/issues.php'), { headers: DEFAULT_HEADERS })
  const issues = Array.isArray(data?.issues) ? data.issues : []
  updateIssueSummary(data?.counts, issues.length)
  renderTable('adminIssues', issues, (tr, issue)=>{
    tr.appendChild(createIssueSubjectCell(issue))
    tr.appendChild(createIssueReporterCell(issue))
    tr.appendChild(createIssuePriorityCell(issue))
    tr.appendChild(createIssueStatusCell(issue))
    tr.appendChild(createIssueDateCell(issue))
    tr.appendChild(createIssueActionCell(issue))
  })
}

async function loadStats(){
  const data = await fetchJson(phpApi('admin/stats.php'), { headers: DEFAULT_HEADERS })
  if(!data) return
  const visitorsEl = document.getElementById('statVisitors')
  if(visitorsEl) visitorsEl.textContent = data.visitors_today ?? 0
  const usageEl = document.getElementById('statTotalUsers')
  if(usageEl && data.total_users != null) usageEl.textContent = data.total_users
}

// Update top tiles with data from stats API (safe keys with fallbacks)
function formatCurrency(num){
  try{ return '฿' + Number(num).toLocaleString('en-US') }catch(e){ return '฿0' }
}

function updateTopTilesFromStats(data){
  if(!data) data = {}
  const revenueMonth = data.revenue_month ?? data.monthly_revenue ?? 0
  const revenueTotal = data.revenue_total ?? data.total_revenue ?? 0
  const completed = data.completed_bookings ?? data.bookings_completed ?? data.successful_bookings ?? 0
  const pending = data.pending_bookings ?? data.bookings_pending ?? 0

  const setAmount = (id, value, isCurrency = false) => {
    const el = document.getElementById(id)
    if(!el) return
    const amount = el.querySelector('.tile-amount')
    if(!amount) return
    amount.textContent = isCurrency ? formatCurrency(value) : String(value)
  }

  setAmount('tileRevenueMonth', revenueMonth, true)
  setAmount('tileRevenueTotal', revenueTotal, true)
  setAmount('tileCompletedBookings', completed, false)
  setAmount('tilePending', pending, false)
}

Promise.all([
  loadUsers(),
  loadListings(),
  loadBookings(),
  loadIssues(),
  loadStats()
]).catch(err=>console.error('dashboard init error', err))

// Collapse right sidebar column if it's empty to avoid large blank space
;(function collapseEmptySidebar(){
  try{
    // Sidebar-right removed - no longer needed
  }catch(e){ console.error('collapseEmptySidebar', e) }
})()

// ---------------- Admin message badge + polling / manual refresh ---------------
// Polling interval in milliseconds (adjustable)
// const ADMIN_MSG_POLL_INTERVAL_MS = 15000
// let __adminMessagesPoll = null

// async function fetchAdminConversationCounts(){
//   try{
//     const url = phpApi('chat/list_conversations.php')
//     const res = await fetch(url, { headers: DEFAULT_HEADERS })
//     if(!res.ok) return { unreadChats: 0, totalUnread: 0 }
//     const data = await res.json().catch(()=>null)
//     const conv = Array.isArray(data?.conversations) ? data.conversations : []
//     const unreadChats = conv.filter(c=>Number(c.unread_count||0) > 0).length
//     const totalUnread = conv.reduce((s,c)=>s + (Number(c.unread_count||0)), 0)
//     return { unreadChats, totalUnread }
//   }catch(err){
//     console.error('fetchAdminConversationCounts', err)
//     return { unreadChats: 0, totalUnread: 0 }
//   }
// }

// function updateAdminHeaderBadge(unreadChats, totalUnread){
//   try{
//     const titleEl = document.querySelector('.admin-title')
//     if(!titleEl) return
//     let badge = titleEl.querySelector('.site-msg-badge')
//     if(!badge && unreadChats > 0){
//       badge = document.createElement('span')
//       badge.className = 'site-msg-badge'
//       titleEl.appendChild(badge)
//     }
//     if(badge){
//       if(unreadChats > 0){
//         badge.textContent = unreadChats > 99 ? '99+' : String(unreadChats)
//         badge.title = `${totalUnread} unread messages across ${unreadChats} conversations`
//         badge.classList.remove('hidden')
//       } else {
//         badge.remove()
//       }
//     }
//   }catch(err){ console.error('updateAdminHeaderBadge', err) }
// }

// async function startAdminMessagesPolling(){
//   if(__adminMessagesPoll) return
//   const run = async ()=>{
//     const counts = await fetchAdminConversationCounts()
//     updateAdminHeaderBadge(counts.unreadChats, counts.totalUnread)
//   }
//   await run()
//   __adminMessagesPoll = setInterval(run, ADMIN_MSG_POLL_INTERVAL_MS)
// }

// function stopAdminMessagesPolling(){ if(__adminMessagesPoll){ clearInterval(__adminMessagesPoll); __adminMessagesPoll = null } }

// // Add a manual refresh button in the header nav (if present)
// ;(function attachAdminRefreshBtn(){
//   try{
//     const nav = document.querySelector('.admin-header nav')
//     if(!nav) return
//     if(document.getElementById('refreshMessagesBtn')) return
//     const btn = document.createElement('button')
//     btn.id = 'refreshMessagesBtn'
//     btn.type = 'button'
//     btn.className = 'btn-outline btn-sm'
//     btn.textContent = 'รีเฟรชข้อความ'
//     btn.addEventListener('click', async ()=>{
//       btn.disabled = true
//       btn.textContent = 'กำลังรีเฟรช...'
//       try{ const counts = await fetchAdminConversationCounts(); updateAdminHeaderBadge(counts.unreadChats, counts.totalUnread) }catch(e){console.error(e)} finally{ btn.disabled = false; btn.textContent = 'รีเฟรชข้อความ' }
//     })
//     nav.appendChild(btn)
//   }catch(err){ console.error('attachAdminRefreshBtn', err) }
// })()

// start polling for admin after initial loads
// startAdminMessagesPolling() // Messages feature disabled

// Events feature removed. Initialize tiles only.
;(async function initTiles(){
  try{
    const stats = await fetchJson(phpApi('admin/stats.php'), { headers: DEFAULT_HEADERS })
    if(stats) updateTopTilesFromStats(stats)
  }catch(e){ console.error('initTiles', e) }
})()
