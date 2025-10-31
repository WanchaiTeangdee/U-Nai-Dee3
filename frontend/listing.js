'use strict';

const PROPERTY_LABELS = { condo: 'คอนโด', house: 'บ้านเช่า', other: 'ที่พัก' };
const PLACEHOLDER_IMAGE = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'><rect width='100%25' height='100%25' fill='%23efefef'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='24'>No%20Image</text></svg>";

const deriveProjectBasePath = () => {
  const { pathname } = window.location;
  const segments = pathname.split('/');
  if(segments.length && segments[segments.length - 1] === '') segments.pop();
  if(segments.length) segments.pop();
  if(segments.length && segments[segments.length - 1] === 'frontend') segments.pop();
  const basePath = segments.filter(Boolean).join('/');
  return basePath ? `/${basePath}` : '';
};

const PROJECT_BASE_PATH_DETAIL = deriveProjectBasePath();
const PHP_API_BASE_DETAIL = `${window.location.origin}${PROJECT_BASE_PATH_DETAIL}/api`;
const phpApiDetail = (endpoint) => `${PHP_API_BASE_DETAIL}/${endpoint}`;

const resolvePublicUrlDetail = (inputPath) => {
  if(!inputPath || typeof inputPath !== 'string') return null;
  const trimmed = inputPath.trim();
  if(!trimmed) return null;
  if(/^https?:/i.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/^\/+/, '');
  const base = PROJECT_BASE_PATH_DETAIL || '';
  return `${base}/${normalized}`;
};

const escapeHtmlDetail = (value) => {
  if(value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
};

const resolveImagePath = (src) => {
  if(!src || typeof src !== 'string') return PLACEHOLDER_IMAGE;
  const trimmed = src.trim();
  if(trimmed === '') return PLACEHOLDER_IMAGE;
  const resolved = resolvePublicUrlDetail(trimmed);
  return resolved || PLACEHOLDER_IMAGE;
};

const listingState = {
  id: null,
  title: null,
  ownerId: null
};

const formatPriceDetail = (price) => {
  if(typeof price !== 'number' || Number.isNaN(price)) return 'ราคาไม่ระบุ';
  // display as price per month
  return `฿${price.toLocaleString('th-TH')}/เดือน`;
};

const formatDateTime = (value) => {
  if(!value) return '';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(date);
};

const createContactAction = (type, raw) => {
  const value = raw.trim();
  if(/^https?:\/\//i.test(value)) return value;
  const lower = type.toLowerCase();
  if(lower.includes('โทร')){
    const phone = value.replace(/[^0-9+]/g, '');
    return phone ? `tel:${phone}` : null;
  }
  if(lower.includes('line') && !value.startsWith('line://')){
    return `https://line.me/ti/p/${encodeURIComponent(value)}`;
  }
  if(lower.includes('email') || value.includes('@')){
    return `mailto:${value}`;
  }
  return null;
};

const elementsDetail = {
  title: document.getElementById('listingTitle'),
  price: document.getElementById('listingPrice'),
  meta: document.getElementById('listingMeta'),
  description: document.getElementById('listingDescription'),
  amenities: document.getElementById('amenitiesList'),
  contact: document.getElementById('contactList'),
  owner: document.getElementById('ownerInfo'),
  error: document.getElementById('listingError'),
  updated: document.getElementById('listingUpdated'),
  heroImage: document.getElementById('listingHeroImage'),
  thumbs: document.getElementById('listingThumbs'),
  map: document.getElementById('listingDetailMap'),
  loading: document.getElementById('listingLoading')
};

const modalNodes = {
  contactModal: document.getElementById('contactModal'),
  bookingModal: document.getElementById('bookingModal'),
  contactList: document.getElementById('contactModalList'),
  contactSummary: document.getElementById('contactModalSummary'),
  bookingForm: document.getElementById('bookingForm'),
  bookingStatus: document.getElementById('bookingStatus'),
  contactButton: document.getElementById('contactOwnerBtn'),
  bookingButton: document.getElementById('bookNowBtn'),
  // chatButton: document.getElementById('chatOwnerBtn'),
  // chatModal: document.getElementById('chatModal'),
  // chatMessages: document.getElementById('chatMessages'),
  // chatForm: document.getElementById('chatForm'),
  // chatInput: document.getElementById('chatInput'),
  // chatStatus: document.getElementById('chatStatus'),
  // chatListingTitle: document.getElementById('chatListingTitle')
};

const chatState = {
  conversationId: null,
  lastMessageId: 0,
  pollingTimer: null,
  initializing: false,
  isSending: false,
  loading: false
};

// Lightweight safe stubs for chat UI functions.
// The listing page in this repo may not include the full chat modal markup,
// so provide no-op or logging implementations to avoid runtime ReferenceErrors.
const setChatStatus = (msg) => {
  try{
    const el = modalNodes.chatStatus || document.getElementById('chatStatus');
    if(el) el.textContent = msg || '';
    else if(msg) console.log('chatStatus:', msg);
  }catch(e){ console.warn('setChatStatus stub error', e) }
};

const resetChatMessages = () => {
  try{
    if(modalNodes.chatMessages) modalNodes.chatMessages.innerHTML = '';
  }catch(e){ console.warn('resetChatMessages stub error', e) }
};

const loadChatMessages = async ({ reset = false, silent = false } = {}) => {
  // stub: in full chat-enabled build this will fetch recent messages.
  if(!silent) console.debug('loadChatMessages stub called', { reset, silent });
  return [];
};

const ensureConversation = async () => {
  // stub: in full chat-enabled build this will create/return a conversation id.
  console.debug('ensureConversation stub called');
  return null;
};

const setupChatFeature = () => {
  // Stub for environments where the full chat UI/markup is not present.
  // If a chat button exists, leave it functional but don't throw.
  try{
    if(!modalNodes.chatButton) return;
    // If chat is intentionally disabled, keep button hidden.
    // Otherwise, provide a safe click handler that prompts login if needed.
    const btn = modalNodes.chatButton;
    btn.onclick = (e) => {
      e.preventDefault();
      // If there is a function to open the auth panel, use it; otherwise do nothing.
      if(typeof openAuthPanel === 'function') openAuthPanel('login');
      else if(typeof window.showLogin === 'function') window.showLogin();
      else console.log('chat button clicked but chat feature is not enabled');
    };
  }catch(err){ console.warn('setupChatFeature stub error', err) }
};

const getCurrentUser = () => {
  const raw = localStorage.getItem('user');
  if(!raw) return null;
  try{
    const parsed = JSON.parse(raw);
    if(parsed && typeof parsed.id !== 'undefined'){
      parsed.id = Number(parsed.id);
    }
    return parsed;
  }catch(err){
    console.warn('parse user failed', err);
    return null;
  }
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// const setChatStatus = (message) => {
//   if(modalNodes.chatStatus){
//     modalNodes.chatStatus.textContent = message || '';
//     modalNodes.chatStatus.hidden = !message;
//   }
// };

// const resetChatMessages = () => {
//   if(modalNodes.chatMessages){
//     modalNodes.chatMessages.innerHTML = '<div class="chat-empty">ยังไม่มีข้อความ เริ่มสนทนาได้เลย</div>';
//   }
//   chatState.lastMessageId = 0;
// };

// const appendChatMessages = (messages) => {
//   if(!modalNodes.chatMessages || !Array.isArray(messages) || messages.length === 0) return;
//   const currentUser = getCurrentUser();
//   const emptyNode = modalNodes.chatMessages.querySelector('.chat-empty');
//   if(emptyNode){
//     modalNodes.chatMessages.innerHTML = '';
//   }
//   messages.forEach((msg) => {
//     const wrapper = document.createElement('div');
//     const isOwn = currentUser && Number(currentUser.id) === Number(msg.sender_id);
//     wrapper.className = `chat-message${isOwn ? ' is-own' : ''}`;
//     const safeBody = escapeHtmlDetail(msg.message).replace(/\n/g, '<br>');
//     wrapper.innerHTML = `
//       <div class="chat-message-body">${safeBody}</div>
//       <div class="chat-message-meta">${formatDateTime(msg.created_at) || ''}</div>
//     `;
//     modalNodes.chatMessages.appendChild(wrapper);
//     chatState.lastMessageId = Math.max(chatState.lastMessageId, Number(msg.id));
//   });
//   requestAnimationFrame(() => {
//     modalNodes.chatMessages.scrollTop = modalNodes.chatMessages.scrollHeight;
//   });
// };

// const stopChatPolling = () => {
//   if(chatState.pollingTimer){
//     clearInterval(chatState.pollingTimer);
//     chatState.pollingTimer = null;
//   }
// };
const stopChatPolling = () => {
  if(chatState.pollingTimer){
    clearInterval(chatState.pollingTimer);
    chatState.pollingTimer = null;
  }
};

// const startChatPolling = () => {
//   stopChatPolling();
//   chatState.pollingTimer = setInterval(() => {
//     loadChatMessages({ silent: true });
//   }, 7000);
// };
const startChatPolling = () => {
  stopChatPolling();
  chatState.pollingTimer = setInterval(() => {
    loadChatMessages({ silent: true });
  }, 7000);
};

// const loadChatMessages = async ({ reset = false, silent = false } = {}) => {
//   if(!chatState.conversationId || chatState.loading) return;
//   chatState.loading = true;
//   try{
//     const afterId = reset ? 0 : chatState.lastMessageId;
//     const url = phpApiDetail(`chat/fetch_messages.php?conversation_id=${chatState.conversationId}&after_id=${afterId}`);
//     const res = await fetch(url, { headers: { ...getAuthHeaders() } });
//     if(!res.ok){
//       const text = await res.text();
//       throw new Error(text || `HTTP ${res.status}`);
//     }
//     const data = await res.json();
//     if(reset){
//       resetChatMessages();
//     }
//     const incoming = Array.isArray(data.messages) ? data.messages : [];
//     if(incoming.length > 0){
//       appendChatMessages(incoming);
//     }else if(reset && modalNodes.chatMessages && !modalNodes.chatMessages.children.length){
//       resetChatMessages();
//     }
//   }catch(err){
//     console.error('loadChatMessages error', err);
//     if(!silent){
//       setChatStatus('ไม่สามารถโหลดข้อความได้ กรุณาลองใหม่');
//     }
//   }finally{
//     chatState.loading = false;
//   }
// };

// const ensureConversation = async () => {
//   if(chatState.conversationId) return chatState.conversationId;
//   if(chatState.initializing) return null;
//   chatState.initializing = true;
//   try{
//     const payload = { listing_id: listingState.id };
//     const res = await fetch(phpApiDetail('chat/get_or_create_thread.php'), {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
//       body: JSON.stringify(payload)
//     });
//     if(!res.ok){
//       const errorPayload = await res.json().catch(() => ({}));
//       throw new Error(errorPayload.error || `HTTP ${res.status}`);
//     }
//     const data = await res.json();
//     const conversation = data.conversation;
//     if(!conversation || !conversation.id){
//       throw new Error('invalid_conversation_response');
//     }
//     chatState.conversationId = Number(conversation.id);
//     chatState.lastMessageId = 0;
//     return chatState.conversationId;
//   }catch(err){
//     console.error('ensureConversation error', err);
//     setChatStatus('เปิดการสนทนาไม่ได้ กรุณาลองใหม่');
//     return null;
//   }finally{
//     chatState.initializing = false;
//   }
// };

// const openChatModal = async () => {
//   setChatStatus('');
//   const convoId = await ensureConversation();
//   if(!convoId) return;
//   if(modalNodes.chatListingTitle && listingState.title){
//     modalNodes.chatListingTitle.textContent = `ประกาศ: ${listingState.title}`;
//   }
//   if(modalNodes.chatModal){
//     openListingModal(modalNodes.chatModal);
//   }
//   await loadChatMessages({ reset: true });
//   startChatPolling();
// };

// const setupChatFeature = () => {
//   const chatBtn = modalNodes.chatButton;
//   if(!chatBtn) return;
//   const defaultLabel = chatBtn.dataset.label || chatBtn.textContent || 'แชทกับเจ้าของ';
//   chatBtn.dataset.label = defaultLabel;
//   chatBtn.hidden = true;
//   chatBtn.disabled = false;

//   const currentUser = getCurrentUser();
//   if(!currentUser){
//     stopChatPolling();
//     chatState.conversationId = null;
//     chatState.lastMessageId = 0;
//     setChatStatus('');
//     if(modalNodes.chatMessages){
//       resetChatMessages();
//     }
//     chatBtn.hidden = false;
//     chatBtn.textContent = 'เข้าสู่ระบบเพื่อแชท';
//     chatBtn.onclick = (event) => {
//       event.preventDefault();
//       if(typeof openAuthPanel === 'function'){
//         openAuthPanel('login');
//       }else{
//         window.location.href = 'login.html';
//       }
//     };
//     return;
//   }

//   const normalizedRole = (currentUser.role || 'customer').toString().trim().toLowerCase();
//   const isOwnerViewing = listingState.ownerId && Number(currentUser.id) === Number(listingState.ownerId);
//   const isCustomer = !['landlord', 'host', 'admin'].includes(normalizedRole);
//   if(isOwnerViewing || !isCustomer){
//     stopChatPolling();
//     chatBtn.hidden = true;
//     chatBtn.onclick = null;
//     return;
//   }

//   chatBtn.hidden = false;
//   chatBtn.textContent = defaultLabel;
//   chatBtn.onclick = async () => {
//     if(chatState.initializing) return;
//     chatBtn.disabled = true;
//     chatBtn.textContent = 'กำลังเปิด...';
//     try{
//       await openChatModal();
//       if(modalNodes.chatInput){
//         modalNodes.chatInput.focus();
//       }
//     }finally{
//       chatBtn.disabled = false;
//       chatBtn.textContent = chatBtn.dataset.label || defaultLabel;
//     }
//   };

//   if(modalNodes.chatForm && !modalNodes.chatForm.dataset.bound){
//     modalNodes.chatForm.addEventListener('submit', async (event) => {
//       event.preventDefault();
//       if(chatState.isSending) return;
//       if(!modalNodes.chatInput) return;
//       const message = modalNodes.chatInput.value.trim();
//       if(message === '') return;
//       if(!chatState.conversationId){
//         const convoId = await ensureConversation();
//         if(!convoId) return;
//       }
//       chatState.isSending = true;
//       setChatStatus('');
//       const submitBtn = modalNodes.chatForm.querySelector('button[type="submit"]');
//       if(submitBtn){
//         submitBtn.disabled = true;
//       }
//       try{
//         const res = await fetch(phpApiDetail('chat/send_message.php'), {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
//           body: JSON.stringify({
//             conversation_id: chatState.conversationId,
//             message
//           })
//         });
//         if(!res.ok){
//           const payload = await res.json().catch(() => ({}));
//           throw new Error(payload.error || `HTTP ${res.status}`);
//         }
//         const data = await res.json();
//         if(data && data.message){
//           appendChatMessages([data.message]);
//         }
//         modalNodes.chatInput.value = '';
//       }catch(err){
//         console.error('chat send error', err);
//         setChatStatus('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่');
//       }finally{
//         chatState.isSending = false;
//         if(submitBtn){
//           submitBtn.disabled = false;
//         }
//       }
//     });
//     modalNodes.chatForm.dataset.bound = 'true';
//   }
// };

const showErrorDetail = (message) => {
  if(elementsDetail.error){
    elementsDetail.error.hidden = false;
    elementsDetail.error.textContent = message;
  }
};

const renderGallery = (images, titleText) => {
  const hero = elementsDetail.heroImage;
  const thumbs = elementsDetail.thumbs;
  if(!hero || !thumbs) return;
  thumbs.innerHTML = '';
  const list = Array.isArray(images) && images.length > 0 ? images : [];
  if(list.length === 0){
    hero.src = PLACEHOLDER_IMAGE;
    hero.alt = 'ยังไม่มีรูปประกอบ';
    return;
  }
  const primary = resolveImagePath(list[0]);
  hero.src = primary;
  hero.alt = `${titleText} - รูปภาพ`;
  list.forEach((img, index) => {
    const path = resolveImagePath(img);
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = `listing-thumb${index === 0 ? ' is-active' : ''}`;
    thumb.innerHTML = `<img src="${path}" alt="รูปที่ ${index + 1}" loading="lazy" />`;
    thumb.addEventListener('click', () => {
      hero.src = path;
      hero.alt = `${titleText} - รูปที่ ${index + 1}`;
      thumbs.querySelectorAll('.listing-thumb').forEach((node) => node.classList.remove('is-active'));
      thumb.classList.add('is-active');
    });
    thumbs.appendChild(thumb);
  });
};

const renderAmenities = (items) => {
  if(!elementsDetail.amenities) return;
  elementsDetail.amenities.innerHTML = '';
  if(!Array.isArray(items) || items.length === 0){
    elementsDetail.amenities.innerHTML = '<span class="amenity-chip">ไม่มีข้อมูลเพิ่มเติม</span>';
    return;
  }
  items.forEach((item) => {
    const chip = document.createElement('span');
    chip.className = 'amenity-chip';
    chip.textContent = item;
    elementsDetail.amenities.appendChild(chip);
  });
};

const renderContacts = (contacts) => {
  if(!elementsDetail.contact) return;
  elementsDetail.contact.innerHTML = '';
  if(!Array.isArray(contacts) || contacts.length === 0){
    elementsDetail.contact.innerHTML = '<li>เจ้าของยังไม่ได้ระบุช่องทางติดต่อ</li>';
    return;
  }
  contacts.forEach(({ type, value }) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = type;
    const info = document.createElement('span');
    info.textContent = value;
    li.appendChild(label);
    li.appendChild(info);
    const action = createContactAction(type || '', value || '');
    if(action){
      const link = document.createElement('a');
      link.className = 'contact-action';
      link.href = action;
      link.target = action.startsWith('http') ? '_blank' : '_self';
      link.rel = 'noopener';
      link.textContent = 'เปิดช่องทางนี้';
      li.appendChild(link);
    }
    elementsDetail.contact.appendChild(li);
  });
};

const renderMeta = (listing) => {
  if(!elementsDetail.meta) return;
  const chips = [];
  if(listing.province){
    chips.push(`จังหวัด: ${escapeHtmlDetail(listing.province)}`);
  }
  const typeLabel = PROPERTY_LABELS[listing.property_type] || listing.property_type;
  if(typeLabel){
    chips.push(`ประเภท: ${escapeHtmlDetail(typeLabel)}`);
  }
  if(listing.address){
    chips.push(`ที่อยู่: ${escapeHtmlDetail(listing.address)}`);
  }
  elementsDetail.meta.innerHTML = chips.map((text) => `<span>${text}</span>`).join('');
};

const renderMap = (listing) => {
  if(!elementsDetail.map || typeof L === 'undefined') return;
  const lat = typeof listing.latitude === 'number' ? listing.latitude : null;
  const lng = typeof listing.longitude === 'number' ? listing.longitude : null;
  if(lat === null || lng === null){
    elementsDetail.map.innerHTML = '<div class="empty-state">ยังไม่มีการปักหมุดตำแหน่ง</div>';
    return;
  }
  const map = L.map(elementsDetail.map).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);
  L.marker([lat, lng]).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
};

const applyListing = (listing) => {
  const titleText = listing.title || 'ประกาศที่พัก';
  listingState.id = listing.id || null;
  listingState.title = titleText;
  const ownerRaw = typeof listing.owner_id !== 'undefined' ? listing.owner_id : typeof listing.owner_user_id !== 'undefined' ? listing.owner_user_id : listing.landlord_id;
  const parsedOwnerId = Number(ownerRaw);
  listingState.ownerId = Number.isFinite(parsedOwnerId) && parsedOwnerId > 0 ? parsedOwnerId : null;
  stopChatPolling();
  chatState.conversationId = null;
  chatState.lastMessageId = 0;
  if(modalNodes.chatMessages){
    resetChatMessages();
  }
  setChatStatus('');
  if(elementsDetail.title) elementsDetail.title.textContent = titleText;
  if(elementsDetail.price) elementsDetail.price.textContent = formatPriceDetail(listing.price);
  renderMeta(listing);
  const descriptionText = listing.description ? escapeHtmlDetail(listing.description).replace(/\n/g, '<br>') : 'เจ้าของยังไม่กรอกรายละเอียด';
  if(elementsDetail.description) elementsDetail.description.innerHTML = descriptionText;
  renderAmenities(listing.amenities);
  renderContacts(listing.contact_methods);
  if(elementsDetail.owner && listing.owner_name){
    elementsDetail.owner.textContent = `เจ้าของประกาศ: ${listing.owner_name}`;
  }
  renderGallery(listing.image_urls || listing.images || [], titleText);
  renderMap(listing);
  if(elementsDetail.updated){
    const updatedText = formatDateTime(listing.updated_at);
    elementsDetail.updated.textContent = updatedText ? `อัปเดตล่าสุด: ${updatedText}` : '';
  }
  document.title = `${titleText} - U-Nai Dee`;

  setupContactAction(listing);
  setupChatFeature();

  if(elementsDetail.loading){
    elementsDetail.loading.hidden = true;
  }
  document.body.classList.remove('listing-loading');
};

const openListingModal = (modal) => {
  if(!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  try { modal.__previousFocus = document.activeElement; } catch (e) {}
  const focusable = modal.querySelectorAll('button, [href], input, textarea');
  if(focusable.length) focusable[0].focus();
};

const closeListingModal = (modal) => {
  if(!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  const previous = modal.__previousFocus;
  if(previous && typeof previous.focus === 'function'){
    previous.focus();
  }
  if(modal === modalNodes.chatModal){
    stopChatPolling();
  }
};

document.querySelectorAll('[data-close]').forEach((node) => {
  node.addEventListener('click', () => closeListingModal(node.closest('.modal')));
});

document.querySelectorAll('.modal-backdrop').forEach((node) => {
  node.addEventListener('click', () => closeListingModal(node.closest('.modal')));
});

const setupContactAction = (listing) => {
  if(!modalNodes.contactButton || !modalNodes.contactModal) return;
  modalNodes.contactButton.addEventListener('click', () => {
    if(modalNodes.contactSummary && listingState.title){
      modalNodes.contactSummary.textContent = `ติดต่อเจ้าของประกาศ "${listingState.title}" ผ่านช่องทางด้านล่าง`;
    }
    renderContactModal(listing);
    openListingModal(modalNodes.contactModal);
  });
};

const renderContactModal = (listing) => {
  if(!modalNodes.contactList) return;
  modalNodes.contactList.innerHTML = '';
  const contacts = Array.isArray(listing.contact_methods) ? listing.contact_methods : [];
  if(contacts.length === 0){
    modalNodes.contactList.innerHTML = '<div class="empty-state">ยังไม่มีช่องทางติดต่อ</div>';
    return;
  }
  contacts.forEach(({ type, value }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'contact-modal-item';
    wrapper.innerHTML = `<strong>${escapeHtmlDetail(type)}</strong><span>${escapeHtmlDetail(value)}</span>`;
    const actionWrapper = document.createElement('div');
    actionWrapper.className = 'contact-modal-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'คัดลอก';
    copyBtn.addEventListener('click', async () => {
      try{
        await navigator.clipboard.writeText(value);
        copyBtn.textContent = 'คัดลอกแล้ว!';
        setTimeout(() => { copyBtn.textContent = 'คัดลอก'; }, 1500);
      }catch(err){
        console.warn('copy failed', err);
      }
    });
    actionWrapper.appendChild(copyBtn);
    const link = createContactAction(type || '', value || '');
    if(link){
      const openLink = document.createElement('a');
      openLink.href = link;
      openLink.target = link.startsWith('http') ? '_blank' : '_self';
      openLink.rel = 'noopener';
      openLink.textContent = 'เปิด';
      actionWrapper.appendChild(openLink);
    }
    wrapper.appendChild(actionWrapper);
    modalNodes.contactList.appendChild(wrapper);
  });
};

const setupBookingAction = () => {
  if(!modalNodes.bookingButton || !modalNodes.bookingModal) return;
  modalNodes.bookingButton.addEventListener('click', () => {
    if(modalNodes.bookingStatus){
      modalNodes.bookingStatus.textContent = '';
    }
    openListingModal(modalNodes.bookingModal);
  });
  if(!modalNodes.bookingForm) return;

  modalNodes.bookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = modalNodes.bookingForm;
    const submitBtn = form.querySelector('button[type="submit"]');
    const nameInput = document.getElementById('bookingName');
    const emailInput = document.getElementById('bookingEmail');
    const phoneInput = document.getElementById('bookingPhone');
    const messageInput = document.getElementById('bookingMessage');
    const nameVal = nameInput?.value.trim() || '';
    const emailVal = emailInput?.value.trim() || '';
    const phoneVal = phoneInput?.value.trim() || '';
    const messageVal = messageInput?.value.trim() || '';

    if(!listingState.id){
      if(modalNodes.bookingStatus){
        modalNodes.bookingStatus.textContent = 'ไม่พบประกาศที่ต้องการจอง';
      }
      return;
    }
    if(nameVal === '' || !/^\S+@\S+\.\S+$/.test(emailVal)){
      if(modalNodes.bookingStatus){
        modalNodes.bookingStatus.textContent = 'กรุณากรอกชื่อและอีเมลให้ถูกต้อง';
      }
      return;
    }

    if(modalNodes.bookingStatus){
      modalNodes.bookingStatus.textContent = 'กำลังส่งคำขอ...';
    }
    if(submitBtn){
      submitBtn.disabled = true;
    }

    let isSuccess = false;
    try{
      const res = await fetch(phpApiDetail('public/create_booking_request.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingState.id,
          name: nameVal,
          email: emailVal,
          phone: phoneVal,
          message: messageVal
        })
      });
      if(!res.ok){
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload.error || `HTTP ${res.status}`);
      }
      isSuccess = true;
      if(modalNodes.bookingStatus){
        modalNodes.bookingStatus.textContent = 'ส่งคำขอเรียบร้อย! เจ้าของจะติดต่อกลับเร็ว ๆ นี้';
      }
      form.reset();
      setTimeout(() => closeListingModal(modalNodes.bookingModal), 1200);
    }catch(err){
      console.error('booking submit error', err);
      if(modalNodes.bookingStatus){
        modalNodes.bookingStatus.textContent = 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่';
      }
    }finally{
      if(submitBtn){
        submitBtn.disabled = false;
      }
      if(!isSuccess && modalNodes.bookingStatus){
        modalNodes.bookingStatus.focus?.();
      }
    }
  });
};

const loadListing = async () => {
  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');
  const listingId = Number(idParam);

  if(elementsDetail.loading){
    elementsDetail.loading.hidden = false;
  }
  document.body.classList.add('listing-loading');

  if(elementsDetail.error){
    elementsDetail.error.hidden = true;
    elementsDetail.error.textContent = '';
  }

  if(!Number.isInteger(listingId) || listingId <= 0){
    showErrorDetail('ไม่พบรหัสประกาศที่ต้องการ');
    if(elementsDetail.title) elementsDetail.title.textContent = 'ไม่พบประกาศ';
    if(elementsDetail.loading){
      elementsDetail.loading.hidden = true;
    }
    document.body.classList.remove('listing-loading');
    return;
  }

  try{
    const res = await fetch(phpApiDetail(`public/listing.php?id=${listingId}`));
    if(!res.ok){
      if(res.status === 404){
        showErrorDetail('ไม่พบประกาศหรือประกาศยังไม่เปิดเผย');
        if(elementsDetail.title) elementsDetail.title.textContent = 'ไม่พบประกาศ';
        return;
      }
      const errorText = await res.text();
      console.error('listing detail fetch failed', res.status, errorText);
      throw new Error(errorText || `HTTP ${res.status}`);
    }
    const json = await res.json();
    if(!json || !json.listing){
      throw new Error('invalid_response');
    }
    applyListing(json.listing);
  }catch(err){
    console.error('loadListing error', err);
    showErrorDetail('ไม่สามารถโหลดรายละเอียดประกาศได้ กรุณาลองใหม่อีกครั้ง');
    if(elementsDetail.title) elementsDetail.title.textContent = 'เกิดข้อผิดพลาด';
  }finally{
    if(elementsDetail.loading){
      elementsDetail.loading.hidden = true;
    }
    document.body.classList.remove('listing-loading');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadListing();
  setupBookingAction();
});

document.addEventListener('auth:changed', () => {
  // setupChatFeature(); // Chat feature disabled
});

document.addEventListener('keydown', (event) => {
  // if(event.key === 'Escape' && modalNodes.chatModal && modalNodes.chatModal.getAttribute('aria-hidden') === 'false'){
  //   stopChatPolling();
  // } // Chat feature disabled
});
