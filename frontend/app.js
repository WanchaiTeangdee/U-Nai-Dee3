// Ensure font-family is applied (fallback if CSS hasn't loaded yet)
document.documentElement.style.fontFamily = "'Kanit', 'Noto Sans Thai', 'Sarabun', Arial, sans-serif";

// debug: confirm script loaded
try{ console.log('app.js loaded') } catch(e){}

// Simple frontend script to load leaflet map and call backend /listings
const authToken = localStorage.getItem('authToken')
const DEFAULT_HEADERS = authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
const ROLE_LABELS = { customer: 'ลูกค้า', landlord: 'ผู้ปล่อยเช่า', admin: 'แอดมิน', host: 'ผู้ปล่อยเช่า' }
const PROPERTY_TYPE_LABELS = { condo: 'คอนโด', house: 'บ้านเช่า', other: 'ที่พัก' }

const isLandlordRole = (role) => role === 'landlord' || role === 'host'

const PROJECT_BASE_PATH = (() => {
  const { pathname } = window.location
  const segments = pathname.split('/')
  if (segments.length && segments[segments.length - 1] === '') segments.pop()
  if (segments.length) segments.pop()
  if (segments.length && segments[segments.length - 1] === 'frontend') segments.pop()
  const basePath = segments.filter(Boolean).join('/')
  return basePath ? `/${basePath}` : ''
})()

// Derive the PHP API base so requests work whether hosted at / or /project/frontend
const PHP_API_BASE = `${window.location.origin}${PROJECT_BASE_PATH}/api`
const phpApi = (endpoint) => `${PHP_API_BASE}/${endpoint}`

const resolvePublicUrl = (inputPath) => {
  if(!inputPath || typeof inputPath !== 'string') return null
  const trimmed = inputPath.trim()
  if(!trimmed) return null
  if(/^https?:/i.test(trimmed)) return trimmed
  const normalized = trimmed.replace(/^\/+/, '')
  const base = PROJECT_BASE_PATH || ''
  return `${base}/${normalized}`
}

async function ensureAuthToken(){
  if(authToken) return authToken
  const stored = localStorage.getItem('authToken')
  return stored || null
}

// Render user status in header
function renderUserStatus(){
  const userStr = localStorage.getItem('user')
  const userStatus = document.getElementById('userStatus')
  const loginLink = document.getElementById('loginLink')
  const registerLink = document.getElementById('registerLink')
  const landlordLink = document.getElementById('landlordLink')
  const adminLink = document.getElementById('adminLink')
  const chatBtn = document.getElementById('chatBtn')
  const roleLabel = userStatus ? userStatus.querySelector('.user-role') : null
  const nameLink = userStatus ? userStatus.querySelector('.user-name') : null
  const chipAvatar = userStatus ? userStatus.querySelector('.chip-avatar') : null
  if(!userStr){
    if(userStatus) userStatus.style.display = 'none'
    if(nameLink){
      nameLink.textContent = ''
      nameLink.removeAttribute('href')
    }
    if(roleLabel){
      roleLabel.textContent = ''
      roleLabel.style.display = 'none'
    }
    if(chipAvatar){
      chipAvatar.textContent = 'U'
    }
    if(loginLink) loginLink.style.display = 'inline'
    if(registerLink) registerLink.style.display = 'inline'
    if(landlordLink) landlordLink.style.display = 'none'
    if(adminLink) adminLink.style.display = 'none'
    if(chatBtn) chatBtn.style.display = 'none'
    return
  }
  const user = JSON.parse(userStr)
  if(userStatus){
    userStatus.style.display = 'inline-flex'
    if(nameLink){
      nameLink.textContent = user.name || user.email || ''
      nameLink.setAttribute('href', 'profile.html')
    }
    if(chipAvatar){
      const displayName = user.name || user.email || ''
      chipAvatar.textContent = displayName ? displayName.trim().charAt(0).toUpperCase() : 'U'
      chipAvatar.style.cursor = 'pointer'
      if(!chipAvatar.dataset.profileNavBound){
        chipAvatar.dataset.profileNavBound = 'true'
        chipAvatar.addEventListener('click', () => {
          window.location.href = 'profile.html'
        })
      }
    }
    if(roleLabel){
      const label = ROLE_LABELS[user.role] || user.role || ''
      roleLabel.textContent = label
      roleLabel.style.display = label ? 'inline-flex' : 'none'
    }

    const chipText = userStatus.querySelector('.chip-text')
    if(chipText && !chipText.dataset.profileNavBound){
      chipText.dataset.profileNavBound = 'true'
      chipText.style.cursor = 'pointer'
      chipText.addEventListener('click', (event) => {
        if(event.target && event.target.closest('#logoutBtn')) return
        const anchor = chipText.querySelector('.user-name')
        if(anchor){
          event.preventDefault()
          const href = anchor.getAttribute('href') || 'profile.html'
          window.location.href = href
        }
      })
    }
  }
  if(loginLink) loginLink.style.display = 'none'
  if(registerLink) registerLink.style.display = 'none'
  const role = user.role
  if(landlordLink){
    landlordLink.style.display = (isLandlordRole(role) || role === 'admin') ? 'inline' : 'none'
  }
  if(adminLink){
    adminLink.style.display = role === 'admin' ? 'inline' : 'none'
  }
  if(chatBtn){
    chatBtn.style.display = (role === 'customer' || isLandlordRole(role)) ? 'inline' : 'none'
  }
  // leave messages link visibility to the badge updater (show when authenticated)
}

// Global function to redirect to home page
function redirectToHome() {
  window.location.href = 'index.html';
}

async function logout(){
  const token = localStorage.getItem('authToken')
  if(token){
  try{ await fetch(phpApi('logout.php'), { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token }) }) }catch(e){console.warn(e)}
  }
  localStorage.removeItem('authToken')
  localStorage.removeItem('user')
  renderUserStatus()
  document.dispatchEvent(new CustomEvent('auth:changed'))
}

document.addEventListener('DOMContentLoaded', ()=>{
  renderUserStatus()
  const logoutBtn = document.getElementById('logoutBtn')
  if(logoutBtn) logoutBtn.addEventListener('click', logout)
  const supportBtn = document.getElementById('supportShortcutBtn')
  if(supportBtn && !supportBtn.dataset.bound){
    supportBtn.addEventListener('click', () => {
      const token = localStorage.getItem('authToken')
      if(token){
        window.location.href = 'profile-support.html'
        return
      }
      if(typeof openAuthPanel === 'function'){
        openAuthPanel('login')
      }else{
        window.location.href = 'profile-support.html'
      }
    })
    supportBtn.dataset.bound = 'true'
  }
  setupChatHandlers()
})

// Chat functionality
let currentConversationId = null
let conversationsCache = []
let chatFormEl = null
let chatSendBtnEl = null
let chatMessageInputEl = null
let chatFormMsgEl = null
let chatHandlersBound = false
let chatAttachmentBtnEl = null
let chatAttachmentInputEl = null
let chatAttachmentPreviewEl = null
let chatAttachmentNameEl = null
let chatAttachmentRemoveBtnEl = null
let chatAttachmentFile = null
let chatAttachmentThumbEl = null
let chatAttachmentPreviewUrl = null

async function loadConversations(){
  try{
    const token = localStorage.getItem('authToken')
    if(!token) return []
    const url = phpApi('chat/list_conversations.php')
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    if(!res.ok) return []
    const data = await res.json().catch(()=>null)
    const conversations = Array.isArray(data?.conversations) ? data.conversations : []
    conversationsCache = conversations
    renderConversations(conversations)
    if(conversations.length === 0){
      currentConversationId = null
      resetChatView()
    }
    return conversations
  }catch(err){
    console.error('loadConversations', err)
    conversationsCache = []
    renderConversations([])
    currentConversationId = null
    resetChatView()
    return []
  }
}

function renderConversations(conversations){
  const container = document.getElementById('conversationsList')
  if(!container) return

  // Remove loading state
  const loading = container.querySelector('.conversations-loading')
  if(loading) loading.remove()

  container.innerHTML = ''
  if(conversations.length === 0){
    container.innerHTML = `
      <div class="no-conversations">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
        </svg>
        <span>ยังไม่มีข้อความ</span>
      </div>
    `
    return
  }

  // Get current user info
  const userStr = localStorage.getItem('user')
  const currentUser = userStr ? JSON.parse(userStr) : null
  const isLandlord = currentUser && isLandlordRole(currentUser.role)

  conversations.forEach(conv => {
    if(!conv.id){
      console.warn('Conversation missing id:', conv)
      return
    }

    // Calculate other user name
    let otherUserName = conv.other_user_name || 'ไม่ระบุชื่อ'
    if(!conv.other_user_name){
      if(isLandlord){
        otherUserName = conv.customer_name || conv.customer_email || 'ลูกค้า'
      }else{
        otherUserName = conv.landlord_name || 'ผู้ปล่อยเช่า'
      }
    }

    const hasUnread = Number(conv.unread_count || 0) > 0
    const messageType = conv.last_message_type || (conv.last_message_attachment_url ? 'image' : 'text')
    let previewText = conv.last_message_preview || conv.last_message || ''
    if(!previewText){
      previewText = messageType === 'image' ? 'ส่งรูปภาพ' : 'ยังไม่มีข้อความ'
    }

    const div = document.createElement('div')
    div.className = `conversation-item ${hasUnread ? 'unread' : ''} ${currentConversationId === conv.id ? 'selected' : ''}`
    div.dataset.conversationId = conv.id
    div.innerHTML = `
      <div class="conversation-name">${escapeHtml(otherUserName)}</div>
      <div class="conversation-preview">${escapeHtml(previewText)}</div>
      <div class="conversation-time">${conv.last_message_at ? formatTimeAgo(new Date(conv.last_message_at)) : ''}</div>
      ${hasUnread ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
    `
    div.addEventListener('click', (event) => {
      event.preventDefault()
      selectConversation(conv.id, event)
    })
    container.appendChild(div)
  })
}

function formatTimeAgo(date){
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if(diffMins < 1) return 'เมื่อสักครู่'
  if(diffMins < 60) return `${diffMins} นาทีที่แล้ว`
  if(diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`
  if(diffDays < 7) return `${diffDays} วันที่แล้ว`

  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

async function selectConversation(conversationId, eventObj = null){
  if(!conversationId){
    console.error('selectConversation called with undefined conversationId')
    return
  }

  currentConversationId = conversationId

  // Update selected state
  document.querySelectorAll('.conversation-item').forEach(item => {
    item.classList.remove('selected')
  })
  // Find and select the clicked conversation item
  const clickedItem = eventObj?.currentTarget || eventObj?.target?.closest('.conversation-item') || document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`)
  if(clickedItem){
    clickedItem.classList.add('selected')
  }

  let currentConv = conversationsCache.find(c => String(c.id) === String(conversationId))
  if(!currentConv){
    try{
      const refreshed = await loadConversations()
      currentConv = refreshed.find(c => String(c.id) === String(conversationId)) || null
    }catch(err){
      console.error('Error refreshing conversations:', err)
    }
  }

  if(currentConv){
    updateConversationInfo(currentConv)
  }else{
    console.warn('Conversation not found:', conversationId)
    updateConversationInfo({ other_user_name: 'ไม่พบการสนทนา' })
  }

  await loadMessages(conversationId)
}

function updateConversationInfo(conversation){
  const infoEl = document.getElementById('currentConversationInfo')
  if(!infoEl) return

  // Get current user info
  const userStr = localStorage.getItem('user')
  const currentUser = userStr ? JSON.parse(userStr) : null
  const isLandlord = currentUser && isLandlordRole(currentUser.role)

  // Calculate other user name
  let otherUserName = conversation.other_user_name || ''
  if(!otherUserName){
    if(isLandlord){
      otherUserName = conversation.customer_name || conversation.customer_email || 'ลูกค้า'
    }else{
      otherUserName = conversation.landlord_name || 'ผู้ปล่อยเช่า'
    }
  }

  const avatarEl = infoEl.querySelector('.conversation-avatar')
  const nameEl = infoEl.querySelector('.conversation-name')
  const statusEl = infoEl.querySelector('.conversation-status')

  if(nameEl) nameEl.textContent = otherUserName
  if(statusEl) statusEl.textContent = conversation.status_text || 'ออนไลน์'
}

function resetChatView(){
  const messagesContainer = document.getElementById('chatMessages')
  if(messagesContainer){
    messagesContainer.innerHTML = `
      <div class="chat-empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
          </svg>
        </div>
        <h4>เริ่มการสนทนา</h4>
        <p>เลือกการสนทนาหรือเริ่มการสนทนาใหม่</p>
      </div>
    `
  }

  updateConversationInfo({
    other_user_name: 'เลือกการสนทนา',
    status_text: 'คลิกที่การสนทนาเพื่อเริ่มแชท'
  })

  const chatFormMsg = chatFormMsgEl || document.getElementById('chatFormMsg')
  if(chatFormMsg){
    chatFormMsg.textContent = ''
    chatFormMsg.classList.remove('form-msg--success')
  }

  const input = chatMessageInputEl || document.getElementById('chatMessage')
  if(input){
    input.value = ''
    input.placeholder = 'พิมพ์ข้อความของคุณที่นี่...'
    input.disabled = false
  }
  clearAttachment()
}

function closeChatInterface(){
  closeModal('chatModal')
  currentConversationId = null
  conversationsCache = []
  resetChatView()
  document.querySelectorAll('.conversation-item').forEach(item => item.classList.remove('selected'))
}

function setupChatHandlers(){
  if(chatHandlersBound) return
  chatFormEl = document.getElementById('chatForm')
  chatSendBtnEl = document.getElementById('chatSendBtn')
  chatMessageInputEl = document.getElementById('chatMessage')
  chatFormMsgEl = document.getElementById('chatFormMsg')
  chatAttachmentBtnEl = document.getElementById('chatAttachmentBtn')
  chatAttachmentInputEl = document.getElementById('chatAttachmentInput')
  chatAttachmentPreviewEl = document.getElementById('chatAttachmentPreview')
  chatAttachmentNameEl = document.getElementById('chatAttachmentName')
  chatAttachmentRemoveBtnEl = document.getElementById('chatAttachmentRemove')
  chatAttachmentThumbEl = document.getElementById('chatAttachmentThumb')
  if(chatAttachmentThumbEl && typeof chatAttachmentThumbEl.dataset.placeholder === 'undefined'){
    chatAttachmentThumbEl.dataset.placeholder = chatAttachmentThumbEl.innerHTML
  }

  if(!chatMessageInputEl || !chatSendBtnEl){
    // Required elements not present yet; try again later
    return
  }

  if(chatFormEl){
    chatFormEl.addEventListener('submit', handleChatSend)
  }
  if(chatSendBtnEl){
    chatSendBtnEl.addEventListener('click', handleChatSend)
  }
  if(chatMessageInputEl){
    chatMessageInputEl.addEventListener('keydown', handleChatInputKeydown)
  }
  if(chatAttachmentBtnEl && chatAttachmentInputEl){
    chatAttachmentBtnEl.addEventListener('click', () => chatAttachmentInputEl.click())
  }
  if(chatAttachmentInputEl){
    chatAttachmentInputEl.addEventListener('change', handleAttachmentChange)
  }
  if(chatAttachmentRemoveBtnEl){
    chatAttachmentRemoveBtnEl.addEventListener('click', (e) => {
      e.preventDefault()
      clearAttachment()
    })
  }
  chatHandlersBound = true
}

function handleChatInputKeydown(e){
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault()
    handleChatSend()
  }
}

function handleAttachmentChange(){
  if(!chatAttachmentInputEl) return
  const file = chatAttachmentInputEl.files && chatAttachmentInputEl.files[0]
  if(!file){
    clearAttachment()
    return
  }
  if(!/^image\//i.test(file.type)){
    clearAttachment()
    if(chatFormMsgEl){
      chatFormMsgEl.textContent = 'กรุณาเลือกเฉพาะไฟล์รูปภาพ (PNG, JPG, GIF, WEBP)'
      chatFormMsgEl.classList.remove('form-msg--success')
    }
    return
  }
  if(file.size > 5 * 1024 * 1024){
    clearAttachment()
    if(chatFormMsgEl){
      chatFormMsgEl.textContent = 'ไฟล์รูปต้องมีขนาดไม่เกิน 5 MB'
      chatFormMsgEl.classList.remove('form-msg--success')
    }
    return
  }
  chatAttachmentFile = file
  updateAttachmentPreview(file)
  if(chatFormMsgEl){
    chatFormMsgEl.textContent = ''
  }
}

function updateAttachmentPreview(file){
  if(!file) return
  if(chatAttachmentPreviewEl){
    chatAttachmentPreviewEl.hidden = false
  }
  if(chatAttachmentNameEl){
    const sizeKB = Math.max(1, Math.round(file.size / 1024))
    const sizeLabel = sizeKB >= 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeKB} KB`
    chatAttachmentNameEl.textContent = `${file.name} (${sizeLabel})`
  }
  if(chatAttachmentBtnEl){
    chatAttachmentBtnEl.classList.add('has-file')
  }
  if(chatAttachmentThumbEl){
    if(chatAttachmentPreviewUrl){
      URL.revokeObjectURL(chatAttachmentPreviewUrl)
    }
    chatAttachmentPreviewUrl = URL.createObjectURL(file)
    chatAttachmentThumbEl.innerHTML = `<img src="${chatAttachmentPreviewUrl}" alt="ตัวอย่างรูปภาพ" />`
  }
}

function clearAttachment(){
  chatAttachmentFile = null
  if(chatAttachmentInputEl){
    chatAttachmentInputEl.value = ''
  }
  if(chatAttachmentBtnEl){
    chatAttachmentBtnEl.classList.remove('has-file')
  }
  if(chatAttachmentPreviewEl){
    chatAttachmentPreviewEl.hidden = true
  }
  if(chatAttachmentNameEl){
    chatAttachmentNameEl.textContent = ''
  }
  if(chatAttachmentThumbEl){
    if(chatAttachmentPreviewUrl){
      URL.revokeObjectURL(chatAttachmentPreviewUrl)
      chatAttachmentPreviewUrl = null
    }
    const placeholder = chatAttachmentThumbEl.dataset ? chatAttachmentThumbEl.dataset.placeholder : null
    if(placeholder !== null && placeholder !== undefined){
      chatAttachmentThumbEl.innerHTML = placeholder
    }
  }
}

async function handleChatSend(e){
  if(e && typeof e.preventDefault === 'function') e.preventDefault()
  if(!chatMessageInputEl){
    chatMessageInputEl = document.getElementById('chatMessage')
  }
  if(!chatFormMsgEl){
    chatFormMsgEl = document.getElementById('chatFormMsg')
  }
  const messageInput = chatMessageInputEl
  if(!messageInput) return
  const message = messageInput.value.trim()
  const hasAttachment = !!chatAttachmentFile

  if(!currentConversationId){
    if(chatFormMsgEl){
      chatFormMsgEl.textContent = 'กรุณาเลือกการสนทนาก่อนส่งข้อความ'
      chatFormMsgEl.classList.remove('form-msg--success')
    }
    return
  }
  if(!message && !hasAttachment) return

  if(chatFormMsgEl) chatFormMsgEl.textContent = ''

  messageInput.disabled = true
  const originalPlaceholder = messageInput.placeholder
  messageInput.placeholder = 'กำลังส่ง...'
  if(chatSendBtnEl) chatSendBtnEl.disabled = true

  try{
    await sendMessage({ text: message, file: chatAttachmentFile })
    messageInput.value = ''
    if(hasAttachment){
      clearAttachment()
    }
    if(chatFormMsgEl){
      chatFormMsgEl.textContent = 'ส่งข้อความแล้ว'
      chatFormMsgEl.classList.add('form-msg--success')
      setTimeout(() => {
        if(chatFormMsgEl){
          chatFormMsgEl.textContent = ''
          chatFormMsgEl.classList.remove('form-msg--success')
        }
      }, 2000)
    }
  }catch(err){
    console.error('Send message error:', err)
    if(chatFormMsgEl){
      chatFormMsgEl.textContent = 'ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง'
      chatFormMsgEl.classList.remove('form-msg--success')
    }
  }finally{
    messageInput.disabled = false
    messageInput.placeholder = originalPlaceholder || 'พิมพ์ข้อความของคุณที่นี่...'
    messageInput.focus()
    if(chatSendBtnEl) chatSendBtnEl.disabled = false
  }
}

async function loadMessages(conversationId){
  if(!conversationId){
    console.error('loadMessages called with undefined conversationId')
    return
  }

  try{
    const token = localStorage.getItem('authToken')
    if(!token) return
    const url = phpApi(`chat/fetch_messages.php?conversation_id=${conversationId}`)
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    if(!res.ok){
      console.error('Failed to load messages:', res.status, res.statusText)
      return
    }
    const data = await res.json().catch(()=>null)
    const messages = Array.isArray(data?.messages) ? data.messages : []
    renderMessages(messages)
  }catch(err){
    console.error('loadMessages error:', err)
  }
}

function renderMessages(messages){
  const container = document.getElementById('chatMessages')
  if(!container) return

  // Clear empty state
  container.innerHTML = ''

  if(messages.length === 0){
    container.innerHTML = `
      <div class="chat-empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
          </svg>
        </div>
        <h4>เริ่มการสนทนา</h4>
        <p>ส่งข้อความแรกเพื่อเริ่มการสนทนา</p>
      </div>
    `
    return
  }

  const userStr = localStorage.getItem('user')
  const currentUser = userStr ? JSON.parse(userStr) : null
  const currentUserId = currentUser ? Number(currentUser.id) : null

  messages.forEach(msg => {
    const messageType = msg.message_type || (msg.attachment_url ? 'image' : 'text')
    const resolvedAttachment = msg.attachment_url ? (resolvePublicUrl(msg.attachment_url) || msg.attachment_url) : null
    const isOwn = typeof msg.is_sender !== 'undefined' ? !!msg.is_sender : (currentUserId && Number(msg.sender_id) === currentUserId)
    const div = document.createElement('div')
    div.className = `message ${isOwn ? 'sent' : 'received'}`
    if(messageType === 'image' && resolvedAttachment){
      div.classList.add('has-image')
    }

    const senderName = msg.sender_name || msg.sender_email || (isOwn ? (currentUser?.name || currentUser?.email || 'ฉัน') : 'U')
    const avatarLetter = senderName ? senderName.trim().charAt(0).toUpperCase() : 'U'
    const timeString = new Date(msg.created_at).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit'
    })

    const avatar = document.createElement('div')
    avatar.className = 'message-avatar'
    avatar.textContent = avatarLetter

    const bubble = document.createElement('div')
    bubble.className = 'message-bubble'

    if(messageType === 'image' && resolvedAttachment){
      const figure = document.createElement('figure')
      figure.className = 'message-image'
      const img = document.createElement('img')
      img.src = resolvedAttachment
      img.alt = 'รูปภาพแนบ'
      img.loading = 'lazy'
      figure.appendChild(img)
      bubble.appendChild(figure)
      if(msg.message){
        const caption = document.createElement('div')
        caption.className = 'message-content'
        caption.innerHTML = escapeHtml(msg.message)
        bubble.appendChild(caption)
      }
    }else{
      const content = document.createElement('div')
      content.className = 'message-content'
      content.innerHTML = escapeHtml(msg.message || '')
      bubble.appendChild(content)
    }

    const timeEl = document.createElement('div')
    timeEl.className = 'message-time'
    timeEl.textContent = timeString
    bubble.appendChild(timeEl)

    div.appendChild(avatar)
    div.appendChild(bubble)
    container.appendChild(div)
  })

  container.scrollTop = container.scrollHeight
}

function escapeHtml(text) {
  if(text === null || text === undefined) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

async function sendMessage({ text = '', file = null } = {}){
  if(!currentConversationId) throw new Error('No conversation selected')
  try{
    const token = localStorage.getItem('authToken')
    if(!token) throw new Error('No auth token available')
    const url = phpApi('chat/send_message.php')
    let res = null
    if(file){
      const formData = new FormData()
      formData.append('conversation_id', currentConversationId)
      if(text){
        formData.append('message', text)
      }
      formData.append('file', file)
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token
        },
        body: formData
      })
    }else{
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          conversation_id: currentConversationId,
          message: text
        })
      })
    }
    const j = await res.json().catch(()=>null)
    if(res.ok){
      // refresh messages and conversation list
      await loadMessages(currentConversationId)
      await loadConversations()
      return j
    }
    // If not OK, surface the server error
    const errMsg = (j && j.error) ? j.error : `Server returned ${res.status}`
    throw new Error(errMsg)
  }catch(err){
    console.error('sendMessage', err)
    throw err
  }
}

// --- message badge (site-wide) -------------------------------------------------
// show small numeric badge next to the "messages" link when there are unread chats
// let __siteMessagesPoll = null
// async function fetchConversationCounts(){
//   try{
//     const token = localStorage.getItem('authToken')
//     if(!token) return { unreadChats: 0, totalUnread: 0 }
//     const url = phpApi('chat/list_conversations.php')
//     const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
//     if(!res.ok) return { unreadChats: 0, totalUnread: 0 }
//     const data = await res.json().catch(()=>null)
//     const conv = Array.isArray(data?.conversations) ? data.conversations : []
//     const unreadChats = conv.filter(c=>Number(c.unread_count||0) > 0).length
//     const totalUnread = conv.reduce((s,c)=>s + (Number(c.unread_count||0)), 0)
//     return { unreadChats, totalUnread }
//   }catch(err){
//     console.error('fetchConversationCounts', err)
//     return { unreadChats: 0, totalUnread: 0 }
//   }
// }

// function updateHeaderMessageBadge(unreadChats, totalUnread){
//   const link = document.getElementById('messagesLink')
//   if(!link) return
//   // ensure link is visible to authenticated users
//   const isVisible = !!localStorage.getItem('user')
//   link.style.display = isVisible ? 'inline' : 'none'
//   let badge = link.querySelector('.site-msg-badge')
//   if(!badge && unreadChats > 0){
//     badge = document.createElement('span')
//     badge.className = 'site-msg-badge'
//     link.appendChild(badge)
//   }
//   if(badge){
//     if(unreadChats > 0){
//       badge.textContent = unreadChats > 99 ? '99+' : String(unreadChats)
//       badge.title = `${totalUnread} unread messages across ${unreadChats} conversations`
//       badge.classList.remove('hidden')
//     } else {
//       badge.remove()
//     }
//   }
// }

// async function startSiteMessagesPolling(){
//   if(__siteMessagesPoll) return
//   const run = async ()=>{
//     const counts = await fetchConversationCounts()
//     updateHeaderMessageBadge(counts.unreadChats, counts.totalUnread)
//   }
//   // run immediately and then every 10s
//   await run()
//   __siteMessagesPoll = setInterval(run, 10000)
// }

// function stopSiteMessagesPolling(){
//   if(__siteMessagesPoll){ clearInterval(__siteMessagesPoll); __siteMessagesPoll = null }
// }

// document.addEventListener('DOMContentLoaded', ()=>{
//   // start polling if user already signed in
//   if(localStorage.getItem('authToken')) startSiteMessagesPolling()
// })

// document.addEventListener('auth:changed', ()=>{
//   if(localStorage.getItem('authToken')){
//     startSiteMessagesPolling()
//   } else {
//     stopSiteMessagesPolling()
//     updateHeaderMessageBadge(0,0)
//   }
// })


// initialize password toggle buttons' accessible state on load
document.addEventListener('DOMContentLoaded', ()=>{
  const initToggle = (btnId, inputId) => {
    const btn = document.getElementById(btnId)
    const inp = document.getElementById(inputId)
    if(btn && inp){
      const visible = inp.type === 'text'
      btn.setAttribute('aria-pressed', visible ? 'true' : 'false')
      btn.setAttribute('role','button')
      btn.tabIndex = 0
      btn.title = visible ? 'ซ่อนรหัสผ่าน' : 'แสดง/ซ่อนรหัสผ่าน'
      const wrap = btn.closest('.pwd-wrap')
      btn.classList.toggle('showing', visible)
      if(wrap){ wrap.classList.toggle('pwd-open', visible) }

      // keyboard/support: Space/Enter toggle and pointer events (click/touch)
      const toggleHandler = (e)=>{
        const isKey = e.type === 'keydown'
        const isPointer = e.type === 'click' || e.type === 'pointerdown' || e.type === 'mousedown' || e.type === 'touchstart'
        const keyIsSpace = isKey && (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space')
        const keyIsEnter = isKey && e.key === 'Enter'
        if(isPointer && e.currentTarget !== btn){
          if(!btn.contains(e.target)) return
        }
        if(isPointer || keyIsEnter || keyIsSpace){
          // prevent default for keyboard and touch to avoid double actions
          if(e.preventDefault) e.preventDefault()
          const willShow = inp.type === 'password'
          inp.type = willShow ? 'text' : 'password'
          btn.setAttribute('aria-pressed', willShow ? 'true' : 'false')
          btn.title = willShow ? 'ซ่อนรหัสผ่าน' : 'แสดง/ซ่อนรหัสผ่าน'
          btn.classList.toggle('showing', willShow)
          if(wrap){ wrap.classList.toggle('pwd-open', willShow) }
        }
      }
      // attach to button
      btn.addEventListener('click', toggleHandler)
      btn.addEventListener('pointerdown', toggleHandler)
      btn.addEventListener('keydown', toggleHandler)
      // also attach to svg (in case pointer lands on svg element) and wrapper to be extra robust
      if(wrap){ wrap.addEventListener('pointerdown', toggleHandler) }
    }
  }
  initToggle('panelTogglePwd','panelPassword')
  initToggle('regPanelTogglePwd','regPasswordPanel')
  initToggle('modalTogglePwd','modalPassword')
})

// Modal login behavior
function openModal(id){
  const modal = document.getElementById(id)
  if(!modal) return
  modal.setAttribute('aria-hidden','false')
  // accessibility: save previously focused element and move focus into modal
  try { modal.__previouslyFocused = document.activeElement } catch (e) {}
  const focusable = modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
  if (focusable.length) focusable[0].focus()
  addFocusTrap(modal)
}
function closeModal(id){
  const modal = document.getElementById(id)
  if(!modal) return
  modal.setAttribute('aria-hidden','true')
  // restore focus to previously focused element if possible
  try { if (modal.__previouslyFocused) modal.__previouslyFocused.focus() } catch (e) {}
  removeFocusTrap(modal)
}

// Hook header links to open modal or panel
document.querySelectorAll('[data-open-modal]').forEach(el=>{
  el.addEventListener('click', (e)=>{
    e.preventDefault()
    const id = el.dataset.openModal
    // open the right-side auth panel instead of modal
    if(id === 'login' || id === 'register'){
      openAuthPanel(id)
      return
    }
    openModal(id + 'Modal')
  })
})

document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', (e) => {
  const modal = el.closest('.modal')
  if (modal) closeModal(modal.id)
}))

// Close on ESC when any modal is open
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal[aria-hidden="false"]').forEach(m => closeModal(m.id))
    // close auth panel if open
    const ap = document.getElementById('authPanel')
    if(ap && ap.getAttribute('aria-hidden') === 'false') ap.setAttribute('aria-hidden','true')
  }
})

// Auth panel helpers
function openAuthPanel(tab){
  const panel = document.getElementById('authPanel')
  if(!panel) return
  panel.setAttribute('aria-hidden','false')
  const loginForm = document.getElementById('panelLoginForm')
  const regForm = document.getElementById('panelRegisterForm')
  if(tab === 'register'){
    loginForm.setAttribute('aria-hidden','true')
    regForm.setAttribute('aria-hidden','false')
    document.getElementById('tabRegister').classList.add('active')
    document.getElementById('tabLogin').classList.remove('active')
    // focus first input in register
    const el = regForm.querySelector('input[required]')
    if(el) el.focus()
  } else {
    loginForm.setAttribute('aria-hidden','false')
    regForm.setAttribute('aria-hidden','true')
    document.getElementById('tabLogin').classList.add('active')
    document.getElementById('tabRegister').classList.remove('active')
    const el = loginForm.querySelector('input[required]')
    if(el) el.focus()
  }
}

document.getElementById('authClose')?.addEventListener('click', ()=>{ document.getElementById('authPanel').setAttribute('aria-hidden','true') })

// tab click handlers
document.getElementById('tabLogin')?.addEventListener('click', ()=> openAuthPanel('login'))
document.getElementById('tabRegister')?.addEventListener('click', ()=> openAuthPanel('register'))

// password toggles are initialized in the DOMContentLoaded initToggle helper above

// panel login submit
const panelLoginForm = document.getElementById('panelLoginForm')
if(panelLoginForm){
  panelLoginForm.addEventListener('submit', async (e)=>{
    e.preventDefault()
    const email = document.getElementById('panelEmail').value
    const password = document.getElementById('panelPassword').value
    const remember = document.getElementById('rememberMe')?.checked ? true : false
    const msg = document.getElementById('panelLoginMsg')
    msg.textContent = ''
    if(!/^\S+@\S+\.\S+$/.test(email)){ msg.textContent = 'รูปแบบอีเมลไม่ถูกต้อง'; return }
    const btn = document.getElementById('panelLoginBtn')
    btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...'
    try{
  const res = await fetch(phpApi('login.php'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password, remember }) })
      const j = await res.json()
      if(res.ok){
        localStorage.setItem('authToken', j.token);
        localStorage.setItem('user', JSON.stringify(j.user));
        renderUserStatus();
        document.dispatchEvent(new CustomEvent('auth:changed'));
        document.getElementById('authPanel').setAttribute('aria-hidden','true');
      }
      else msg.textContent = j.error || 'ไม่สามารถเข้าสู่ระบบได้'
    }catch(err){ msg.textContent = 'เครือข่ายไม่ตอบสนอง' }
    finally{ btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ' }
  })

  // forgot password flow: show/hide inline box
  const forgotLink = document.getElementById('forgotLink')
  const passwordResetBox = document.getElementById('passwordResetBox')
  const cancelResetBtn = document.getElementById('cancelResetBtn')
  const sendResetBtn = document.getElementById('sendResetBtn')
  const resetMsg = document.getElementById('resetMsg')
  if(forgotLink && passwordResetBox){
    forgotLink.addEventListener('click', (ev)=>{
      ev.preventDefault();
      // reset any previous messages or debug links and ensure buttons are enabled
      resetMsg.innerHTML = ''
      const emailField = document.getElementById('resetEmail')
      if(emailField) emailField.value = ''
      if(sendResetBtn){ sendResetBtn.disabled = false; sendResetBtn.textContent = 'ส่งลิงก์รีเซ็ต' }
      if(cancelResetBtn) cancelResetBtn.style.display = 'inline-block'
      passwordResetBox.style.display = 'block'
      document.getElementById('resetEmail').focus()
    })
  }
  if(cancelResetBtn && passwordResetBox){
    cancelResetBtn.addEventListener('click', ()=>{
      // clear inputs and messages but don't permanently remove the cancel button
      const emailField = document.getElementById('resetEmail')
      if(emailField) emailField.value = ''
      resetMsg.innerHTML = ''
      if(sendResetBtn){ sendResetBtn.disabled = false; sendResetBtn.textContent = 'ส่งลิงก์รีเซ็ต' }
      // hide the reset box but keep the elements intact for next open
      passwordResetBox.style.display = 'none'
    })
  }
  if(sendResetBtn){
    sendResetBtn.addEventListener('click', async ()=>{
      const email = document.getElementById('resetEmail').value
      resetMsg.textContent = ''
      if(!/^\S+@\S+\.\S+$/.test(email)){ resetMsg.textContent = 'รูปแบบอีเมลไม่ถูกต้อง'; return }
      sendResetBtn.disabled = true; sendResetBtn.textContent = 'กำลังส่ง...'
      try{
  const res = await fetch(phpApi('request_password_reset.php'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) })
        const j = await res.json()
        if(res.ok){ resetMsg.textContent = 'ส่งลิงก์รีเซ็ตให้แล้ว (ในโหมด dev ลิงก์จะแสดงด้านล่าง)'; if(j.debug_link) resetMsg.innerHTML += '<div style="margin-top:8px;padding:8px;background:#fff;border-radius:6px;word-break:break-all">' + j.debug_link + '</div>' }
        else resetMsg.textContent = j.error || 'ไม่สามารถส่งลิงก์ได้'
      }catch(err){ resetMsg.textContent = 'เครือข่ายไม่ตอบสนอง' }
      finally{ sendResetBtn.disabled = false; sendResetBtn.textContent = 'ส่งลิงก์รีเซ็ต' }
    })
  }
}

// panel register submit
const panelRegisterForm = document.getElementById('panelRegisterForm')
if(panelRegisterForm){
  panelRegisterForm.addEventListener('submit', async (e)=>{
    e.preventDefault()
    const email = document.getElementById('regEmailPanel').value
    const name = document.getElementById('regUsernamePanel').value
    const password = document.getElementById('regPasswordPanel').value
    const phoneInput = document.getElementById('phone')
    const phone = phoneInput ? phoneInput.value : ''
    const confirm = document.getElementById('regPasswordConfirmPanel').value
    const roleInput = document.querySelector('input[name="regRole"]:checked')
    const role = roleInput ? roleInput.value : 'customer'
    const msg = document.getElementById('panelRegMsg')
    msg.textContent = ''
    if(!name.trim()){ msg.textContent = 'กรุณากรอกชื่อผู้ใช้'; return }
    if(!/^\S+@\S+\.\S+$/.test(email)){ msg.textContent = 'อีเมลไม่ถูกต้อง'; return }
    if(password.length < 8){ msg.textContent = 'รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร'; return }
  if(password !== confirm){ msg.textContent = 'รหัสผ่านไม่ตรงกัน'; return }
    const btn = document.getElementById('panelRegisterBtn')
    btn.disabled = true; btn.textContent = 'กำลังสมัคร...'
    try{
  const res = await fetch(phpApi('register.php'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, email, password, role, phone }) })
      const j = await res.json()
      if(res.ok){
        localStorage.setItem('user', JSON.stringify(j.user));
        if(j.token){
          localStorage.setItem('authToken', j.token);
        }
        alert('สมัครสมาชิกสำเร็จ! คุณสามารถเข้าสู่ระบบได้');
        renderUserStatus();
        document.dispatchEvent(new CustomEvent('auth:changed'));
        document.getElementById('authPanel').setAttribute('aria-hidden','true');
      }
      else msg.textContent = j.error || 'การสมัครล้มเหลว'
    }catch(err){ msg.textContent = 'เครือข่ายไม่ตอบสนอง' }

    finally { btn.disabled = false; btn.textContent = 'สมัครสมาชิก' }
  })
}

// Focus trap helpers: insert invisible sentinels to loop focus inside modal
function addFocusTrap(modal) {
  if (modal.__focusTrapAdded) return
  const start = document.createElement('div')
  start.tabIndex = 0
  start.className = 'focus-sentinel'
  const end = document.createElement('div')
  end.tabIndex = 0
  end.className = 'focus-sentinel'
  modal.insertBefore(start, modal.firstChild)
  modal.appendChild(end)
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
  const handleStart = () => {
    const nodes = modal.querySelectorAll(selector)
    if (nodes.length) nodes[nodes.length - 1].focus()
  }
  const handleEnd = () => {
    const nodes = modal.querySelectorAll(selector)
    if (nodes.length) nodes[0].focus()
  }
  start.addEventListener('focus', handleStart)
  end.addEventListener('focus', handleEnd)
  modal.__focusTrap = { start, end, handleStart, handleEnd }
  modal.__focusTrapAdded = true
}

function removeFocusTrap(modal) {
  if (!modal.__focusTrapAdded) return
  const ft = modal.__focusTrap || {}
  if (ft.start) { ft.start.removeEventListener('focus', ft.handleStart); ft.start.remove() }
  if (ft.end) { ft.end.removeEventListener('focus', ft.handleEnd); ft.end.remove() }
  modal.__focusTrapAdded = false
}

// Modal form
const modalForm = document.getElementById('modalLoginForm')
if(modalForm){
  const modalEmail = document.getElementById('modalEmail')
  const modalPassword = document.getElementById('modalPassword')
  const modalMsg = document.getElementById('modalMsg')
  const modalLoginBtn = document.getElementById('modalLoginBtn')
  const modalTogglePwd = document.getElementById('modalTogglePwd')

  modalTogglePwd.addEventListener('click', ()=>{ 
    const open = modalPassword.type === 'password' 
    modalPassword.type = open ? 'text' : 'password' 
    // animate eye SVG 
    const svg = document.getElementById('eyeIcon') 
    if(svg){ svg.classList.toggle('toggle-open', open); svg.classList.toggle('toggle-closed', !open) } 
  })

  function validateEmail(email){
    return /^\S+@\S+\.\S+$/.test(email)
  }

  modalForm.addEventListener('submit', async (e)=>{
    e.preventDefault()
    modalMsg.textContent = ''
    if(!validateEmail(modalEmail.value)){
      modalMsg.textContent = 'รูปแบบอีเมลไม่ถูกต้อง'
      return
    }
    modalLoginBtn.disabled = true
    modalLoginBtn.textContent = 'กำลังเข้าสู่ระบบ...'
    try{
  const res = await fetch(phpApi('login.php'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: modalEmail.value, password: modalPassword.value })})
      const json = await res.json()
      if(res.ok){
        localStorage.setItem('authToken', json.token)
        localStorage.setItem('user', JSON.stringify(json.user))
        renderUserStatus()
        closeModal('loginModal')
      } else {
        modalMsg.textContent = json.error || 'ไม่สามารถเข้าสู่ระบบได้'
      }
    }catch(err){
      modalMsg.textContent = 'เกิดข้อผิดพลาดเครือข่าย'
    }finally{
      modalLoginBtn.disabled = false
      modalLoginBtn.textContent = 'เข้าสู่ระบบ'
    }
  })
}

const mapContainer = document.getElementById('map')
if(mapContainer && typeof L !== 'undefined'){
  const map = L.map('map').setView([13.7563,100.5018], 11)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'© OpenStreetMap'
  }).addTo(map)

  const markers = [
    {name: 'BTS Siam', lat:13.7461, lng:100.5341},
    {name: 'BTS Asok', lat:13.7373, lng:100.5609},
    {name: 'MRT Sukhumvit', lat:13.7378, lng:100.5601}
  ]
  markers.forEach(m=> L.circleMarker([m.lat,m.lng],{radius:6,color:'#3DA5FF'}).addTo(map).bindPopup(m.name))

  let propertyType = null

  async function fetchListings(params = {}){
    try{
      const qs = new URLSearchParams(params).toString()
      const endpoint = 'public/listings.php' + (qs ? `?${qs}` : '')
      const url = phpApi(endpoint)
      const res = await fetch(url)
      if(!res.ok){
        const text = await res.text()
        throw new Error(text || 'failed')
      }
      const json = await res.json()
      return Array.isArray(json.listings) ? json.listings : []
    }catch(err){
      console.error('fetchListings error', err)
      return []
    }
  }

  const escapeHtml = (value) => {
    if(value === null || value === undefined) return ''
    return String(value).replace(/[&<>"']/g, (ch)=>({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]))
  }

  const resolveImageUrl = (listing) => {
    const src = listing?.thumbnail_url || (Array.isArray(listing?.image_urls) ? listing.image_urls[0] : null)
    if(!src || typeof src !== 'string' || !src.trim()){
      return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%25' height='100%25' fill='%23efefef'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='18'>No%20Image</text></svg>"
    }
    const direct = resolvePublicUrl(src)
    return direct || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%25' height='100%25' fill='%23efefef'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='18'>No%20Image</text></svg>"
  }

  const formatPrice = (price) => {
    if(typeof price !== 'number' || Number.isNaN(price)) return { amount: 'ราคาไม่ระบุ', unit: '' }
    return { amount: `฿${price.toLocaleString('th-TH')}`, unit: '/เดือน' }
  }

  function renderListings(listings){
    const grid = document.getElementById('listingsGrid')
    if(!grid) return
    grid.innerHTML = ''
    if(!Array.isArray(listings) || listings.length === 0){
      grid.innerHTML = '<div class="empty-state">ยังไม่มีประกาศที่พร้อมแสดงในขณะนี้</div>'
      return
    }
    listings.forEach((l)=>{
      const imageSrc = resolveImageUrl(l)
  const price = formatPrice(l.price)
  const priceText = price && price.amount ? `<span class="price-amount">${escapeHtml(price.amount)}</span><span class="price-unit">${escapeHtml(price.unit)}</span>` : 'ราคาไม่ระบุ'
      const provinceText = l.province || 'จังหวัดไม่ระบุ'
      const typeLabel = PROPERTY_TYPE_LABELS[l.property_type] || l.property_type || ''
      const titleText = l.title || 'ประกาศที่พัก'
      const card = document.createElement('a')
      card.className = 'property-card'
      card.href = `listing.html?id=${encodeURIComponent(l.id)}`
      card.innerHTML = `
        <div class="property-card__image"><img src="${imageSrc}" alt="${escapeHtml(titleText)}" loading="lazy" /></div>
        <div class="property-card__body">
          <span class="property-card__location">${escapeHtml(provinceText)}${typeLabel ? ` • ${escapeHtml(typeLabel)}` : ''}</span>
          <h3 class="property-card__title">${escapeHtml(titleText)}</h3>
          <div class="property-card__price">${priceText}</div>
          <span class="property-card__cta">ดูรายละเอียด</span>
        </div>
      `
      grid.appendChild(card)
    })
  }

  function distanceKm(lat1, lon1, lat2, lon2){
    function toRad(x){return x * Math.PI / 180}
    const R = 6371
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  let userMarker = null
  let userCircle = null

  async function locateMe(){
    if(!navigator.geolocation){
      alert('เบราว์เซอร์ของคุณไม่รองรับ Geolocation')
      return
    }
    navigator.geolocation.getCurrentPosition(async (pos)=>{
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      const accuracy = pos.coords.accuracy

      if(userMarker) map.removeLayer(userMarker)
      if(userCircle) map.removeLayer(userCircle)

      userMarker = L.marker([lat,lng],{title: 'ตำแหน่งของฉัน'}).addTo(map).bindPopup('ตำแหน่งของฉัน').openPopup()
      userCircle = L.circle([lat,lng],{radius: accuracy, color: '#3DA5FF', fillOpacity: 0.08}).addTo(map)
      map.setView([lat,lng],13)

      const listings = await fetchListings()
      const nearby = listings.filter(l=>{
        const la = Number(l.latitude || l.lat || 0)
        const lo = Number(l.longitude || l.lng || 0)
        if(!la || !lo) return false
        const d = distanceKm(lat,lng,la,lo)
        return d <= 5
      })
      if(nearby.length === 0){
        alert('ไม่พบที่พักภายใน 5 กม. จากตำแหน่งของคุณ')
      }
      renderListings(nearby.length ? nearby : listings)
    }, (err)=>{
      console.error(err)
      alert('ไม่สามารถดึงตำแหน่งได้: ' + err.message)
    }, { enableHighAccuracy: true, timeout: 10000 })
  }

  const locateBtn = document.getElementById('locateBtn')
  if(locateBtn) locateBtn.addEventListener('click', locateMe)

  const searchForm = document.getElementById('searchForm')
  if(searchForm){
    searchForm.addEventListener('submit', async (e)=>{
      e.preventDefault()
      const q = document.getElementById('q').value
      const priceRange = document.getElementById('priceRange').value
      const params = {}
      if(q) params.q = q
      if(priceRange) params.priceRange = priceRange
      if(propertyType) params.type = propertyType
      const listings = await fetchListings(params)
      renderListings(listings)
    })

    ;(async ()=>{
      const listings = await fetchListings({ type: propertyType })
      renderListings(listings)
    })()
  }

  document.querySelectorAll('.ptype-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const wasActive = btn.classList.contains('active')
      document.querySelectorAll('.ptype-btn').forEach(b=>b.classList.remove('active'))
      if(wasActive){
        propertyType = null
        const listings = await fetchListings()
        renderListings(listings)
      } else {
        btn.classList.add('active')
        propertyType = btn.dataset.type
        const listings = await fetchListings({ type: propertyType })
        renderListings(listings)
      }
    })
  })

  // Chat functionality
  const chatBtn = document.getElementById('chatBtn')
  if(chatBtn){
    chatBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      setupChatHandlers()
      openModal('chatModal')
      const conversations = await loadConversations()

      let conversationToSelect = null
      if(currentConversationId){
        const exists = conversations.some(c => String(c.id) === String(currentConversationId))
        if(exists) conversationToSelect = currentConversationId
      }
      if(!conversationToSelect && conversations.length > 0){
        conversationToSelect = conversations[0].id
      }

      if(conversationToSelect){
        await selectConversation(conversationToSelect)
      }else{
        resetChatView()
      }

      // Focus on message input if conversations exist
      setTimeout(() => {
        const messageInput = document.getElementById('chatMessage')
        if(messageInput) messageInput.focus()
      }, 100)
    })
  }

  // Chat modal event listeners
  const chatModal = document.getElementById('chatModal')
  if(chatModal){
    const closeBtn = chatModal.querySelector('.chat-close-btn')
    if(closeBtn){
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        closeChatInterface()
      })
    }
    chatModal.addEventListener('click', (e) => {
      if(e.target.matches('[data-close-modal]') || e.target.closest('[data-close-modal]')){
        e.preventDefault()
        closeChatInterface()
      }
    })
    chatModal.addEventListener('keydown', (e) => {
      if(e.key === 'Escape'){
        e.preventDefault()
        closeChatInterface()
      }
    })

    setupChatHandlers()
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-close-modal]')
    if(trigger && trigger.closest('#chatModal')){
      e.preventDefault()
      closeChatInterface()
    }
  })
}
