'use strict';

const ROLE_LABELS = { customer: 'ลูกค้า', landlord: 'ผู้ปล่อยเช่า', admin: 'แอดมิน' }
const STATUS_LABELS = { pending: 'รอตรวจสอบ', active: 'เผยแพร่', inactive: 'ปิดประกาศ' }
const STATUS_OPTIONS = [
  { value: 'pending', label: STATUS_LABELS.pending },
  { value: 'active', label: STATUS_LABELS.active },
  { value: 'inactive', label: STATUS_LABELS.inactive }
]

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
  renderTable('adminUsers', data?.users || [], (tr, user)=>{
    tr.appendChild(textCell(user.name || '-'))
    tr.appendChild(textCell(user.email))
    tr.appendChild(textCell(ROLE_LABELS[user.role] || user.role || '-'))
    tr.appendChild(textCell(user.created_at || '-'))
    // Add actions column
    const actionsTd = document.createElement('td')
    actionsTd.className = 'action-buttons'
    const editBtn = document.createElement('button')
    editBtn.className = 'action-btn edit'
    editBtn.textContent = 'แก้ไข'
    editBtn.onclick = () => openUserModal(user)
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'action-btn delete'
    deleteBtn.textContent = 'ลบ'
    deleteBtn.onclick = () => deleteUser(user.id)
    actionsTd.appendChild(editBtn)
    actionsTd.appendChild(deleteBtn)
    tr.appendChild(actionsTd)
  })
  const totalUsersEl = document.getElementById('statTotalUsers')
  if(totalUsersEl) totalUsersEl.textContent = data?.counts?.total_users ?? (data?.users?.length ?? 0)
  const newUsersEl = document.getElementById('statNewUsers')
  if(newUsersEl) newUsersEl.textContent = data?.counts?.new_users_today ?? 0
}

// User CRUD functions
let currentEditingUser = null

function openUserModal(user = null) {
  currentEditingUser = user
  const modal = document.getElementById('userModal')
  const title = document.getElementById('modalTitle')
  const form = document.getElementById('userForm')
  const passwordGroup = document.getElementById('passwordGroup')

  if (user) {
    title.textContent = 'แก้ไขผู้ใช้'
    document.getElementById('userName').value = user.name || ''
    document.getElementById('userEmail').value = user.email || ''
    document.getElementById('userRole').value = user.role || 'customer'
    passwordGroup.style.display = 'none'
  } else {
    title.textContent = 'เพิ่มผู้ใช้ใหม่'
    form.reset()
    document.getElementById('userRole').value = 'customer'
    passwordGroup.style.display = 'block'
  }

  modal.style.display = 'flex'
  document.body.style.overflow = 'hidden'
}

function closeUserModal() {
  const modal = document.getElementById('userModal')
  modal.style.display = 'none'
  document.body.style.overflow = ''
  currentEditingUser = null
}

// Toast notification system
function showToast(message, type = 'success') {
  const toastContainer = document.getElementById('toastContainer')
  if (!toastContainer) return

  const toast = document.createElement('div')
  toast.className = `toast ${type}`

  const iconSvg = type === 'success'
    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-message">${message}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `

  toastContainer.appendChild(toast)

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'slideOutRight 0.3s ease-out'
      setTimeout(() => toast.remove(), 300)
    }
  }, 5000)
}

async function saveUser() {
  const saveBtn = document.getElementById('saveBtn')
  const btnText = saveBtn.querySelector('.btn-text')
  const spinner = saveBtn.querySelector('.btn-spinner')

  // Show loading state
  saveBtn.disabled = true
  btnText.style.display = 'none'
  spinner.style.display = 'flex'

  try {
    const name = document.getElementById('userName').value.trim()
    const email = document.getElementById('userEmail').value.trim()
    const role = document.getElementById('userRole').value
    const password = document.getElementById('userPassword').value

    if (!name || !email) {
      showToast('กรุณากรอกชื่อและอีเมล', 'error')
      return
    }

    if (!currentEditingUser && !password) {
      showToast('กรุณากรอกรหัสผ่าน', 'error')
      return
    }

    const data = { name, email, role }
    if (!currentEditingUser) {
      data.password = password
    } else {
      data.id = currentEditingUser.id
    }

    const method = currentEditingUser ? 'PUT' : 'POST'
    const result = await fetchJson(phpApi('admin/users.php'), {
      method,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify(data)
    })

    if (result?.success) {
      showToast(currentEditingUser ? 'แก้ไขผู้ใช้สำเร็จ' : 'เพิ่มผู้ใช้สำเร็จ', 'success')
      closeUserModal()
      loadUsers()
    } else {
      showToast('เกิดข้อผิดพลาด: ' + (result?.error || 'Unknown error'), 'error')
    }
  } catch (error) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error')
  } finally {
    // Hide loading state
    saveBtn.disabled = false
    btnText.style.display = 'inline'
    spinner.style.display = 'none'
  }
}

async function deleteUser(userId){
  if(!confirm('คุณต้องการลบผู้ใช้นี้หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้')) return

  try {
    const result = await fetchJson(phpApi('admin/users.php'), {
      method: 'DELETE',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ id: userId })
    })
    if(result?.success){
      showToast('ลบผู้ใช้สำเร็จ', 'success')
      loadUsers()
    } else {
      showToast('เกิดข้อผิดพลาด: ' + (result?.error || 'Unknown error'), 'error')
    }
  } catch (error) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error')
  }
}

async function loadListings(){
  const data = await fetchJson(phpApi('admin/listings.php'), { headers: DEFAULT_HEADERS })
  renderTable('adminListings', data?.listings || [], (tr, listing)=>{
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
}

async function loadBookings(){
  const data = await fetchJson(phpApi('admin/bookings.php'), { headers: DEFAULT_HEADERS })
  renderTable('adminBookings', data?.bookings || [], (tr, booking)=>{
    tr.appendChild(textCell(booking.tenant || '-'))
    tr.appendChild(textCell(booking.listing || '-'))
    tr.appendChild(textCell(booking.period || '-'))
    tr.appendChild(textCell(booking.status || '-'))
  })
  const newBookingsEl = document.getElementById('statNewBookings')
  if(newBookingsEl) newBookingsEl.textContent = data?.counts?.new_bookings_today ?? 0
}

async function loadIssues(){
  const data = await fetchJson(phpApi('admin/issues.php'), { headers: DEFAULT_HEADERS })
  renderTable('adminIssues', data?.issues || [], (tr, issue)=>{
    tr.appendChild(textCell(issue.type || '-'))
    tr.appendChild(textCell(issue.reporter || '-'))
    tr.appendChild(textCell(issue.title || '-'))
    tr.appendChild(textCell(issue.status || '-'))
  })
}

async function loadStats(){
  const data = await fetchJson(phpApi('admin/stats.php'), { headers: DEFAULT_HEADERS })
  if(!data) return
  const visitorsEl = document.getElementById('statVisitors')
  if(visitorsEl) visitorsEl.textContent = data.visitors_today ?? 0
  const usageEl = document.getElementById('statTotalUsers')
  if(usageEl && data.total_users != null) usageEl.textContent = data.total_users

  const newUsersEl = document.getElementById('statNewUsers')
  if(newUsersEl) newUsersEl.textContent = data.new_users_today ?? 0
  const newBookingsEl = document.getElementById('statNewBookings')
  if(newBookingsEl) newBookingsEl.textContent = data.new_bookings_today ?? 0

  // Update top tiles with real data
  updateTopTilesFromStats(data)
}

// Update top tiles with data from stats API (safe keys with fallbacks)
function formatCurrency(num){
  try{ return '฿' + Number(num).toLocaleString('en-US') }catch(e){ return '฿0' }
}

function updateTopTilesFromStats(data){
  if(!data) data = {}

  const setAmount = (id, value, isCurrency = false) => {
    const el = document.getElementById(id)
    if(!el) return
    const amount = el.querySelector('.tile-amount')
    if(!amount) return
    amount.textContent = isCurrency ? formatCurrency(value) : String(value)
  }

  setAmount('tileUnitsAvailable', data.units_available ?? 0, false)
  setAmount('tileBookingsMonth', data.bookings_this_month ?? 0, false)
  setAmount('tileRevenue', data.revenue ?? 0, true)
  setAmount('tilePendingPayments', data.pending_payments ?? 0, false)
}

Promise.all([
  loadUsers(),
  loadListings(),
  loadBookings(),
  loadIssues(),
  loadStats()
]).catch(err=>console.error('dashboard init error', err))

// Add event listeners for user management
document.getElementById('addUserBtn')?.addEventListener('click', () => openUserModal())

// Modal event listeners
document.getElementById('userModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'userModal') {
    closeUserModal()
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('userModal').style.display !== 'none') {
    closeUserModal()
  }
})

// Search and filter functionality
document.getElementById('userSearch')?.addEventListener('input', filterUsers)
document.getElementById('roleFilter')?.addEventListener('change', filterUsers)

function filterUsers() {
  const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || ''
  const roleFilter = document.getElementById('roleFilter')?.value || ''
  const rows = document.querySelectorAll('#adminUsers tbody tr')

  rows.forEach(row => {
    const name = row.cells[0]?.textContent.toLowerCase() || ''
    const email = row.cells[1]?.textContent.toLowerCase() || ''
    const role = row.cells[2]?.textContent.toLowerCase() || ''

    const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm)
    const matchesRole = !roleFilter || role.includes(ROLE_LABELS[roleFilter]?.toLowerCase() || roleFilter.toLowerCase())

    row.style.display = matchesSearch && matchesRole ? '' : 'none'
  })
}

// Collapse right sidebar column if it's empty to avoid large blank space
;(function collapseEmptySidebar(){
  try{
    const sidebarRight = document.querySelector('.sidebar-right')
    const grid = document.querySelector('.dashboard-grid')
    if(!sidebarRight || !grid) return
    const hasContent = sidebarRight.children.length > 0 && sidebarRight.textContent.trim().length > 0
    if(!hasContent) grid.classList.add('no-right')
  }catch(e){ console.error('collapseEmptySidebar', e) }
})()

// ---------------- Admin message badge + polling / manual refresh ---------------
// Polling interval in milliseconds (adjustable)
const ADMIN_MSG_POLL_INTERVAL_MS = 15000
let __adminMessagesPoll = null

async function fetchAdminConversationCounts(){
  try{
    const url = phpApi('chat/list_conversations.php')
    const res = await fetch(url, { headers: DEFAULT_HEADERS })
    if(!res.ok) return { unreadChats: 0, totalUnread: 0 }
    const data = await res.json().catch(()=>null)
    const conv = Array.isArray(data?.conversations) ? data.conversations : []
    const unreadChats = conv.filter(c=>Number(c.unread_count||0) > 0).length
    const totalUnread = conv.reduce((s,c)=>s + (Number(c.unread_count||0)), 0)
    return { unreadChats, totalUnread }
  }catch(err){
    console.error('fetchAdminConversationCounts', err)
    return { unreadChats: 0, totalUnread: 0 }
  }
}

function updateAdminHeaderBadge(unreadChats, totalUnread){
  try{
    const titleEl = document.querySelector('.admin-title')
    if(!titleEl) return
    let badge = titleEl.querySelector('.site-msg-badge')
    if(!badge && unreadChats > 0){
      badge = document.createElement('span')
      badge.className = 'site-msg-badge'
      titleEl.appendChild(badge)
    }
    if(badge){
      if(unreadChats > 0){
        badge.textContent = unreadChats > 99 ? '99+' : String(unreadChats)
        badge.title = `${totalUnread} unread messages across ${unreadChats} conversations`
        badge.classList.remove('hidden')
      } else {
        badge.remove()
      }
    }
  }catch(err){ console.error('updateAdminHeaderBadge', err) }
}

async function startAdminMessagesPolling(){
  if(__adminMessagesPoll) return
  const run = async ()=>{
    const counts = await fetchAdminConversationCounts()
    updateAdminHeaderBadge(counts.unreadChats, counts.totalUnread)
  }
  await run()
  __adminMessagesPoll = setInterval(run, ADMIN_MSG_POLL_INTERVAL_MS)
}

function stopAdminMessagesPolling(){ if(__adminMessagesPoll){ clearInterval(__adminMessagesPoll); __adminMessagesPoll = null } }

// Add a manual refresh button in the header nav (if present)
;(function attachAdminRefreshBtn(){
  try{
    const nav = document.querySelector('.admin-header nav')
    if(!nav) return
    if(document.getElementById('refreshMessagesBtn')) return
    const btn = document.createElement('button')
    btn.id = 'refreshMessagesBtn'
    btn.type = 'button'
    btn.className = 'btn-outline btn-sm'
    btn.textContent = 'รีเฟรชข้อความ'
    btn.addEventListener('click', async ()=>{
      btn.disabled = true
      btn.textContent = 'กำลังรีเฟรช...'
      try{ const counts = await fetchAdminConversationCounts(); updateAdminHeaderBadge(counts.unreadChats, counts.totalUnread) }catch(e){console.error(e)} finally{ btn.disabled = false; btn.textContent = 'รีเฟรชข้อความ' }
    })
    nav.appendChild(btn)
  }catch(err){ console.error('attachAdminRefreshBtn', err) }
})()

// start polling for admin after initial loads
startAdminMessagesPolling()

// Events feature removed. Initialize tiles only.
;(async function initTiles(){
  try{
    const stats = await fetchJson(phpApi('admin/stats.php'), { headers: DEFAULT_HEADERS })
    if(stats) updateTopTilesFromStats(stats)
  }catch(e){ console.error('initTiles', e) }
})()
