'use strict';

const cssEscape = (value) => {
  const str = String(value ?? '')
  if(typeof CSS !== 'undefined' && typeof CSS.escape === 'function'){
    return CSS.escape(str)
  }
  return str.replace(/([ !"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1')
}

const LANDLORD_ROLE_LABELS = { condo: 'คอนโด', house: 'บ้านเช่า', other: 'อื่น ๆ' }
const MAP_DEFAULT_CENTER = [13.7563, 100.5018]
const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB per file
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

const escapeHtml = (value) => {
  if(value === null || value === undefined) return ''
  return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]))
}

function formatDateTime(value){
  if(!value) return ''
  const normalized = typeof value === 'string' && value.includes('T') ? value : String(value).replace(' ', 'T')
  const date = new Date(normalized)
  if(Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatConversationTime(value){
  if(!value) return ''
  const normalized = typeof value === 'string' && value.includes('T') ? value : String(value).replace(' ', 'T')
  const date = new Date(normalized)
  if(Number.isNaN(date.getTime())) return ''
  const now = Date.now()
  const diffMinutes = Math.round((now - date.getTime()) / 60000)
  if(Number.isNaN(diffMinutes)) return formatDateTime(value)
  if(Math.abs(diffMinutes) < 720){
    return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function createMessageSnippet(text, maxLength = 90){
  if(!text) return ''
  const normalized = String(text).replace(/\s+/g, ' ').trim()
  if(normalized.length <= maxLength) return normalized
  if(maxLength <= 3) return normalized.slice(0, maxLength)
  return normalized.slice(0, maxLength - 3) + '...'
}

function isLandlordRole(role){
  return role === 'landlord' || role === 'host'
}

function ensureLandlord(){
  const userStr = localStorage.getItem('user')
  if(!userStr){
    window.location.href = 'login.html'
    return null
  }
  const user = JSON.parse(userStr)
  if(!isLandlordRole(user.role) && user.role !== 'admin'){
    window.location.href = 'index.html'
    return null
  }
  return user
}

const currentUser = ensureLandlord()
if(!currentUser){
  throw new Error('landlord only')
}

const currentUserId = Number(currentUser?.id || 0)

const authToken = localStorage.getItem('authToken')
const AUTH_HEADERS = authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
const JSON_HEADERS = { 'Content-Type': 'application/json', ...AUTH_HEADERS }

const PHP_API_BASE = (() => {
  // Build a robust API base URL.
  // If the site is served under a folder containing '/frontend', strip everything from '/frontend' onward
  // so we get: https://host/<project-root>/api
  try{
    const origin = window.location.origin
    const pathname = window.location.pathname || ''
    const frontendIdx = pathname.indexOf('/frontend')
    if(frontendIdx !== -1){
      const base = pathname.slice(0, frontendIdx) // includes leading '/'
      return origin + (base === '' ? '' : base) + '/api'
    }
    // Fallback: remove the last path segment (file name) and append /api
    const segments = pathname.split('/')
    if(segments.length && segments[segments.length - 1] === '') segments.pop()
    if(segments.length) segments.pop()
    const basePath = segments.filter(Boolean).join('/')
    const prefix = basePath ? `/${basePath}` : ''
    return `${origin}${prefix}/api`
  }catch(err){
    console.error('PHP_API_BASE build error', err)
    return '/api'
  }
})()
console.debug('PHP_API_BASE =', PHP_API_BASE)

const phpApi = (endpoint) => `${PHP_API_BASE}/${endpoint}`

async function fetchJson(url, options = {}){
  try{
    const res = await fetch(url, options)
    if(!res.ok){
      const text = await res.text()
      throw new Error(text || `HTTP ${res.status}`)
    }
    return await res.json()
  }catch(err){
    console.error('fetchJson', url, err)
    throw err
  }
}

const elements = {
  formTitle: document.getElementById('listingFormTitle'),
  formDesc: document.querySelector('#listingFormContent .card-desc'),
  form: document.getElementById('listingForm'),
  title: document.getElementById('listingTitle'),
  type: document.getElementById('listingType'),
  price: document.getElementById('listingPrice'),
  province: document.getElementById('listingProvince'),
  address: document.getElementById('listingAddress'),
  description: document.getElementById('listingDescription'),
  contactInputsWrapper: document.getElementById('contactInputs'),
  contactChannelGroup: document.getElementById('contactChannelGroup'),
  latitude: document.getElementById('listingLatitude'),
  longitude: document.getElementById('listingLongitude'),
  latitudeDisplay: document.getElementById('latitudeDisplay'),
  longitudeDisplay: document.getElementById('longitudeDisplay'),
  useCurrentBtn: document.getElementById('useCurrentLocationBtn'),
  clearLocationBtn: document.getElementById('clearLocationBtn'),
  fileInput: document.getElementById('listingImages'),
  imagePreview: document.getElementById('imagePreview'),
  amenitiesOther: document.getElementById('amenitiesOther'),
  amenityItems: Array.from(document.querySelectorAll('.amenity-item')),
  success: document.getElementById('listingSuccess'),
  error: document.getElementById('listingError'),
  submitBtn: document.getElementById('submitListingBtn'),
  resetBtn: document.getElementById('resetListingBtn'),
  editBanner: document.getElementById('editModeBanner'),
  editSummary: document.getElementById('editModeSummary'),
  bookingRequestsStatus: document.getElementById('bookingRequestsStatus'),
  bookingRequestsContainer: document.getElementById('bookingRequestsContainer'),
  bookingRequestsRefresh: document.getElementById('refreshBookingRequestsBtn'),
}

// const messageElements = {
//   list: document.getElementById('conversationList'),
//   empty: document.getElementById('conversationEmpty'),
//   title: document.getElementById('conversationTitle'),
//   meta: document.getElementById('conversationMeta'),
//   messages: document.getElementById('conversationMessages'),
//   form: document.getElementById('conversationForm'),
//   input: document.getElementById('conversationInput'),
//   status: document.getElementById('conversationStatus'),
//   refreshBtn: document.getElementById('refreshConversationsBtn')
// }

// const conversationEmptyDefault = messageElements.empty?.textContent || 'ยังไม่มีผู้เช่าติดต่อเข้ามา'

// const messageState = {
//   conversations: [],
//   conversationMap: new Map(),
//   activeId: null,
//   lastMessageId: 0,
//   loadingList: false,
//   loadingMessages: false,
//   pollingTimer: null
// }

function setCardCollapsed(card, collapsed){
  if(!card) return
  const toggle = card.querySelector('.card-toggle')
  const body = card.querySelector('.card-body')
  if(!toggle || !body) return
  const isCollapsed = !!collapsed
  card.setAttribute('data-collapsed', isCollapsed ? 'true' : 'false')
  toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true')
  body.hidden = isCollapsed

  if(!isCollapsed && body.querySelector('#listingMap')){
    setTimeout(() => {
      try{
        if(mapInstance){
          mapInstance.invalidateSize()
          if(mapMarker){
            const markerLatLng = mapMarker.getLatLng()
            mapInstance.setView(markerLatLng, Math.max(mapInstance.getZoom(), 14))
          }else{
            mapInstance.setView(MAP_DEFAULT_CENTER, Math.max(mapInstance.getZoom(), 12))
          }
        }
      }catch(err){
        console.warn('map resize error', err)
      }
    }, 150)
  }
}

function initCollapsibles(){
  const cards = Array.from(document.querySelectorAll('[data-collapsible]'))
  cards.forEach((card) => {
    const toggle = card.querySelector('.card-toggle')
    const body = card.querySelector('.card-body')
    if(!toggle || !body) return
    const initialCollapsed = card.getAttribute('data-collapsed') === 'true'
    setCardCollapsed(card, initialCollapsed)
    if(!toggle.dataset.bound){
      toggle.addEventListener('click', () => {
        const currentlyCollapsed = card.getAttribute('data-collapsed') === 'true'
        setCardCollapsed(card, !currentlyCollapsed)
      })
      toggle.dataset.bound = 'true'
    }
  })
}

let mapInstance = null
let mapMarker = null
let previewUrls = []
let suppressResetSuccessHide = false
let currentEditId = null
let currentListings = []
let removedImages = new Set()
let currentBookingRequests = []
let bookingStatusResetTimer = null
const defaultFormTexts = {
  title: elements.formTitle?.textContent || '',
  desc: elements.formDesc?.textContent || '',
  submit: elements.submitBtn?.textContent || '',
  reset: elements.resetBtn?.textContent || '',
  summary: elements.editSummary?.textContent || ''
}

const amenityValues = new Set(elements.amenityItems
  .map((label) => label.querySelector('input[type="checkbox"]')?.value)
  .filter((value) => typeof value === 'string' && value.trim() !== ''))

function clearError(){
  if(elements.error){
    elements.error.hidden = true
    elements.error.textContent = ''
  }
}

function showError(message){
  if(elements.error){
    elements.error.hidden = false
    elements.error.textContent = message
  }
}

function resetPreviewUrls(){
  previewUrls.forEach((url) => URL.revokeObjectURL(url))
  previewUrls = []
}

function clearImagePreview(){
  resetPreviewUrls()
  if(elements.imagePreview){
    elements.imagePreview.innerHTML = '<div class="preview-placeholder">ยังไม่มีรูปที่เลือก</div>'
  }
}

function updateImagePreview(){
  if(!elements.fileInput || !elements.imagePreview) return
  resetPreviewUrls()
  const files = Array.from(elements.fileInput.files || [])
  if(files.length === 0){
    if(currentEditId !== null){
      const listing = getListingById(currentEditId)
      if(listing){
        renderExistingImagesForEdit(listing)
        return
      }
    }
    elements.imagePreview.innerHTML = '<div class="preview-placeholder">ยังไม่มีรูปที่เลือก</div>'
    return
  }
  const items = files.map((file) => {
    const url = URL.createObjectURL(file)
    previewUrls.push(url)
    return `<div class="preview-item"><img src="${url}" alt="${escapeHtml(file.name)}" /><span>${escapeHtml(file.name)}</span></div>`
  })
  elements.imagePreview.innerHTML = items.join('')
}

function getListingById(id){
  if(!Array.isArray(currentListings)) return null
  const numericId = Number(id)
  if(!Number.isFinite(numericId)) return null
  return currentListings.find((item) => Number(item?.id) === numericId) || null
}

function renderExistingImagesForEdit(listing){
  if(!elements.imagePreview) return
  if(!(removedImages instanceof Set)){
    removedImages = new Set()
  }
  if(!listing){
    elements.imagePreview.innerHTML = '<div class="preview-placeholder">ยังไม่มีรูปประกอบสำหรับประกาศนี้</div>'
    return
  }
  const normalizedImages = Array.isArray(listing.images)
    ? listing.images.map((raw) => {
        if(typeof raw !== 'string') return null
        const trimmed = raw.trim()
        if(trimmed === '') return null
        return { raw, key: trimmed }
      }).filter(Boolean)
    : []

  const removalSet = new Set(Array.from(removedImages).map((path) => path.trim()).filter(Boolean))
  const remaining = normalizedImages.filter((item) => !removalSet.has(item.key))
  const totalExisting = normalizedImages.length
  const removedCount = totalExisting - remaining.length

  const noteParts = []
  if(totalExisting > 0){
    noteParts.push(`รูปภาพเดิมทั้งหมด ${totalExisting} รูป`)
  }
  if(removedCount > 0){
    noteParts.push(`กำลังลบ ${removedCount} รูปเมื่อบันทึก`)
  }
  if(remaining.length > 0){
    noteParts.push(`คงเหลือ ${remaining.length} รูป`)
  } else if(totalExisting > 0){
    noteParts.push('หากไม่อัปโหลดรูปใหม่ ระบบจะลบรูปทั้งหมดของประกาศนี้')
  }

  let html = ''
  if(noteParts.length > 0){
    html += `<div class="preview-existing-note">${escapeHtml(noteParts.join(' • '))}</div>`
  }

  if(totalExisting === 0){
    elements.imagePreview.innerHTML = html + '<div class="preview-placeholder">ยังไม่มีรูปประกอบสำหรับประกาศนี้</div>'
    return
  }

  if(remaining.length === 0){
    elements.imagePreview.innerHTML = html + '<div class="preview-placeholder">ไม่มีรูปคงเหลือ กด "เลือกไฟล์" เพื่อเพิ่มรูปใหม่</div>'
    return
  }

  const cards = remaining.map((item, index) => {
    const rawPath = item.raw
    const key = item.key
    let normalized = key.replace(/^(\.{1,2}\/)+/, '')
    const isAbsolute = /^https?:\/\//i.test(normalized) || normalized.startsWith('/')
    const src = isAbsolute ? normalized : `../${normalized}`
    const label = `รูปที่ ${index + 1}`
    const displayName = key || label
    return `
      <div class="preview-item" data-original-path="${escapeHtml(key)}">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(label)}" />
        <span>${escapeHtml(displayName)}</span>
        <button type="button" class="preview-remove-btn" data-remove-path="${escapeHtml(key)}">ลบรูปนี้</button>
      </div>
    `
  }).filter(Boolean)

  elements.imagePreview.innerHTML = html + `<div class="existing-image-grid">${cards.join('')}</div>`

  elements.imagePreview.querySelectorAll('.preview-remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-remove-path') || ''
      const key = raw.trim()
      if(!key) return
      const confirmRemove = window.confirm('ต้องการลบรูปนี้ออกจากประกาศหรือไม่?')
      if(!confirmRemove) return
      removedImages.add(key)
      renderExistingImagesForEdit(listing)
    })
  })
}

function applyAmenities(amenitiesList){
  const values = Array.isArray(amenitiesList) ? amenitiesList.filter((val) => typeof val === 'string' && val.trim() !== '') : []
  const selected = new Set(values)
  elements.amenityItems.forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]')
    if(checkbox){
      checkbox.checked = selected.has(checkbox.value)
    }
  })
  const extras = values.filter((val) => !amenityValues.has(val))
  if(elements.amenitiesOther){
    elements.amenitiesOther.value = extras.join(', ')
  }
  syncAmenityStates()
}

function getContactCheckboxes(){
  if(!elements.contactChannelGroup) return []
  return Array.from(elements.contactChannelGroup.querySelectorAll('input[type="checkbox"]'))
}

function applyContactMethods(methods){
  resetContactChannels()
  if(!Array.isArray(methods) || methods.length === 0) return
  const checkboxes = getContactCheckboxes()
  const otherCheckbox = checkboxes.find((cb) => cb.value === 'อื่น ๆ')
  methods.forEach(({ type }) => {
    const checkbox = checkboxes.find((cb) => cb.value === type)
    if(checkbox){
      checkbox.checked = true
    } else if(otherCheckbox && !otherCheckbox.checked){
      otherCheckbox.checked = true
    }
  })
  updateContactChannels()
  methods.forEach(({ type, value }) => {
    if(!type) return
  const chipInput = elements.contactInputsWrapper?.querySelector(`.contact-chip[data-type="${cssEscape(type)}"] input`)
    if(chipInput){
      chipInput.value = value || ''
      return
    }
    if(type !== 'อื่น ๆ' && otherCheckbox){
      const otherInput = elements.contactInputsWrapper?.querySelector('.contact-chip[data-type="อื่น ๆ"] input')
      if(otherInput){
        otherInput.value = value ? `${type}: ${value}` : ''
      }
    }
  })
  syncContactPillStates()
}

function applyLocation(latitude, longitude){
  if(latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined){
    setMarker({ lat: Number(latitude), lng: Number(longitude) })
  } else {
    clearLocation()
  }
}

function populateFormForListing(listing){
  if(!listing) return
  if(elements.title) elements.title.value = listing.title || ''
  if(elements.type) elements.type.value = listing.property_type || 'condo'
  if(elements.price){
    const priceNumber = Number(listing.price)
    elements.price.value = Number.isFinite(priceNumber) ? priceNumber : ''
  }
  if(elements.province) elements.province.value = listing.province || ''
  if(elements.address) elements.address.value = listing.address || ''
  if(elements.description) elements.description.value = listing.description || ''
  applyAmenities(listing.amenities)
  applyContactMethods(listing.contact_methods)
  applyLocation(listing.latitude, listing.longitude)
  if(elements.fileInput){
    elements.fileInput.value = ''
  }
  resetPreviewUrls()
  renderExistingImagesForEdit(listing)
  if(elements.success){
    elements.success.hidden = true
  }
  clearError()
}

function highlightEditingRow(){
  const container = document.getElementById('myListings')
  if(!container) return
  container.querySelectorAll('.landlord-row').forEach((row) => row.classList.remove('is-editing'))
  if(currentEditId === null) return
  const row = container.querySelector(`.landlord-row[data-listing-id="${cssEscape(String(currentEditId))}"]`)
  if(row){
    row.classList.add('is-editing')
  }
}

function enterEditMode(listing){
  const editId = Number(listing?.id)
  if(Number.isNaN(editId)) return
  currentEditId = editId
  elements.form?.setAttribute('data-editing', 'true')
  setCardCollapsed(document.getElementById('listingFormCard'), false)
  if(elements.formTitle){
    elements.formTitle.textContent = `แก้ไขประกาศ "${listing.title || '-'}"`
  }
  if(elements.formDesc){
    elements.formDesc.textContent = 'เมื่อบันทึกแล้ว ระบบจะตั้งสถานะประกาศเป็น "รอตรวจสอบ" เพื่อให้แอดมินตรวจทานอีกครั้ง'
  }
  if(elements.submitBtn){
    elements.submitBtn.textContent = 'อัปเดตประกาศ'
  }
  if(elements.resetBtn){
    elements.resetBtn.textContent = 'ยกเลิกการแก้ไข'
  }
  if(elements.editBanner){
    elements.editBanner.hidden = false
    if(elements.editSummary){
      const notes = [`กำลังแก้ไขประกาศ "${listing.title || '-'}"`]
      notes.push('เมื่อบันทึกประกาศ ระบบจะส่งกลับไปสถานะ "รอตรวจสอบ" อัตโนมัติ')
      if(Array.isArray(listing.images) && listing.images.length > 0){
        notes.push(`รูปภาพเดิม ${listing.images.length} รูป (การอัปโหลดใหม่จะเพิ่มต่อจากเดิม)`) 
      }
      elements.editSummary.textContent = notes.join(' • ')
    }
  }
  highlightEditingRow()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function exitEditMode(){
  const wasEditing = currentEditId !== null
  currentEditId = null
  elements.form?.removeAttribute('data-editing')
  if(elements.formTitle){
    elements.formTitle.textContent = defaultFormTexts.title
  }
  if(elements.formDesc){
    elements.formDesc.textContent = defaultFormTexts.desc
  }
  if(elements.submitBtn){
    elements.submitBtn.textContent = defaultFormTexts.submit
  }
  if(elements.resetBtn){
    elements.resetBtn.textContent = defaultFormTexts.reset
  }
  if(elements.editBanner){
    elements.editBanner.hidden = true
  }
  if(elements.editSummary){
    elements.editSummary.textContent = defaultFormTexts.summary
  }
  if(wasEditing){
    removedImages = new Set()
    clearImagePreview()
  } else {
    removedImages = new Set()
  }
  highlightEditingRow()
}

function startEditListing(listingId){
  const listing = getListingById(listingId)
  if(!listing){
    window.alert('ไม่พบประกาศที่ต้องการแก้ไข')
    return
  }
  removedImages = new Set()
  populateFormForListing(listing)
  enterEditMode(listing)
}

function updateCoordinateDisplays(lat, lng){
  if(elements.latitudeDisplay){
    elements.latitudeDisplay.textContent = lat !== null && lat !== undefined ? Number(lat).toFixed(6) : '-'
  }
  if(elements.longitudeDisplay){
    elements.longitudeDisplay.textContent = lng !== null && lng !== undefined ? Number(lng).toFixed(6) : '-'
  }
}

function clearLocation(){
  if(mapInstance && mapMarker){
    mapInstance.removeLayer(mapMarker)
  }
  mapMarker = null
  if(elements.latitude) elements.latitude.value = ''
  if(elements.longitude) elements.longitude.value = ''
  updateCoordinateDisplays(null, null)
}

function setMarker(latLng){
  if(!mapInstance || !latLng) return
  const latNum = typeof latLng.lat === 'number' ? latLng.lat : parseFloat(latLng.lat)
  const lngNum = typeof latLng.lng === 'number' ? latLng.lng : parseFloat(latLng.lng)
  if(Number.isNaN(latNum) || Number.isNaN(lngNum)) return
  if(!mapMarker){
    mapMarker = L.marker([latNum, lngNum], { draggable: true }).addTo(mapInstance)
    mapMarker.on('dragend', (event) => {
      const position = event.target.getLatLng()
      setMarker(position)
    })
  } else {
    mapMarker.setLatLng([latNum, lngNum])
  }
  if(elements.latitude) elements.latitude.value = latNum.toFixed(6)
  if(elements.longitude) elements.longitude.value = lngNum.toFixed(6)
  updateCoordinateDisplays(latNum, lngNum)
  mapInstance.setView([latNum, lngNum], Math.max(mapInstance.getZoom(), 14))
}

function initMap(){
  const mapContainer = document.getElementById('listingMap')
  if(!mapContainer || typeof L === 'undefined') return
  mapInstance = L.map(mapContainer).setView(MAP_DEFAULT_CENTER, 12)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(mapInstance)
  mapInstance.on('click', (evt) => setMarker(evt.latlng))
  setTimeout(() => mapInstance.invalidateSize(), 200)
}

function handleGeolocate(){
  if(!navigator.geolocation){
    showError('เบราว์เซอร์ไม่รองรับการระบุตำแหน่ง')
    return
  }
  if(elements.useCurrentBtn){
    elements.useCurrentBtn.disabled = true
    elements.useCurrentBtn.textContent = 'กำลังค้นหาตำแหน่ง...'
  }
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude } = position.coords
    setMarker({ lat: latitude, lng: longitude })
    clearError()
    if(elements.useCurrentBtn){
      elements.useCurrentBtn.disabled = false
      elements.useCurrentBtn.textContent = 'ใช้ตำแหน่งปัจจุบัน'
    }
  }, (err) => {
    console.warn('geolocation error', err)
    showError('ไม่สามารถดึงตำแหน่งปัจจุบันได้ กรุณาปักหมุดบนแผนที่แทน')
    if(elements.useCurrentBtn){
      elements.useCurrentBtn.disabled = false
      elements.useCurrentBtn.textContent = 'ใช้ตำแหน่งปัจจุบัน'
    }
  }, { enableHighAccuracy: true, timeout: 10000 })
}

function collectAmenities(){
  const nodes = document.querySelectorAll('input[name="amenities[]"]:checked')
  const values = Array.from(nodes).map((node) => node.value).filter(Boolean)
  const other = elements.amenitiesOther?.value.trim()
  if(other) values.push(other)
  return values
}

function collectContactMethods(){
  if(!elements.contactInputsWrapper) return []
  const items = elements.contactInputsWrapper.querySelectorAll('.contact-chip')
  const contacts = []
  items.forEach((chip) => {
    const type = chip.getAttribute('data-type')
    const input = chip.querySelector('input')
    const value = input ? input.value.trim() : ''
    if(type && value){
      contacts.push({ type, value })
    }
  })
  return contacts
}

function updateContactChannels(){
  if(!elements.contactChannelGroup || !elements.contactInputsWrapper) return
  const selected = []
  elements.contactChannelGroup.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    const type = checkbox.value
    if(checkbox.checked){
      selected.push({ type, placeholder: checkbox.dataset.placeholder || '' })
    }
  })

  const existingTypes = new Set()
  elements.contactInputsWrapper.querySelectorAll('.contact-chip').forEach((chip) => {
    const type = chip.getAttribute('data-type')
    if(!type) return
    if(selected.find((item) => item.type === type)){
      existingTypes.add(type)
    } else {
      chip.remove()
    }
  })

  selected.forEach(({ type, placeholder }) => {
    if(existingTypes.has(type)) return
    const chip = document.createElement('div')
    chip.className = 'contact-chip'
    chip.setAttribute('data-type', type)
    const label = type === 'อื่น ๆ' ? 'ช่องทางอื่น ๆ' : type
    chip.innerHTML = `
      <div class="contact-chip-header">
        <span class="contact-chip-label">${escapeHtml(label)}</span>
        <button type="button" class="contact-chip-remove" aria-label="ลบช่องทาง ${escapeHtml(label)}">×</button>
      </div>
      <input type="text" placeholder="${escapeHtml(placeholder || '')}" aria-label="รายละเอียดช่องทาง ${escapeHtml(label)}" />
    `
    const removeBtn = chip.querySelector('.contact-chip-remove')
    removeBtn?.addEventListener('click', () => {
  const checkbox = elements.contactChannelGroup?.querySelector(`input[type="checkbox"][value="${cssEscape(type)}"]`)
      if(checkbox){
        checkbox.checked = false
        checkbox.dispatchEvent(new Event('change', { bubbles: true }))
      }
      chip.remove()
    })
    elements.contactInputsWrapper.appendChild(chip)
  })

  syncContactPillStates()
}

function resetContactChannels(){
  elements.contactChannelGroup?.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => { checkbox.checked = false })
  elements.contactInputsWrapper?.querySelectorAll('.contact-chip').forEach((chip) => chip.remove())
  syncContactPillStates()
}

function formatAmenities(list){
  if(!Array.isArray(list) || list.length === 0) return '—'
  return list.map((item) => escapeHtml(item)).join(', ')
}

function validateImages(files){
  if(files.length > MAX_IMAGES){
    return `เลือกได้สูงสุด ${MAX_IMAGES} รูป`
  }
  for(const file of files){
    if(file.size > MAX_IMAGE_SIZE){
      return `ไฟล์ ${file.name} มีขนาดเกิน 5MB`
    }
    if(file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)){
      return `รูปแบบไฟล์ ${file.name} ไม่รองรับ`
    }
  }
  return null
}

function renderListings(listings){
  const container = document.getElementById('myListings')
  if(!container) return
  currentListings = Array.isArray(listings) ? listings.map((item) => ({ ...item })) : []
  if(currentEditId !== null && !currentListings.some((item) => Number(item?.id) === Number(currentEditId))){
    exitEditMode()
  }
  if(currentListings.length === 0){
    container.innerHTML = '<div class="empty-state">ยังไม่มีประกาศ กรุณากรอกฟอร์มด้านบนเพื่อเริ่มต้น</div>'
    return
  }
  const cards = currentListings.map((listing) => {
    const statusKey = listing.status || 'pending'
    const statusLabels = {
      pending: 'รอตรวจสอบ',
      active: 'เผยแพร่',
      inactive: 'ปิดประกาศ',
      rejected: 'ไม่ผ่านการตรวจสอบ'
    }
    const statusLabel = statusLabels[statusKey] || statusKey || '-'
    const priceNumber = Number(listing.price)
    const priceAmount = Number.isFinite(priceNumber) ? `฿${priceNumber.toLocaleString('th-TH')}` : '-'
    const priceUnit = Number.isFinite(priceNumber) ? '/เดือน' : ''
    const amenitiesText = formatAmenities(listing.amenities)
    const contactChips = Array.isArray(listing.contact_methods) && listing.contact_methods.length > 0
      ? listing.contact_methods.map((c) => `<span class="table-chip">${escapeHtml(c.type)}: ${escapeHtml(c.value)}</span>`).join('')
      : `<span class="table-chip table-chip--muted">ยังไม่ได้ระบุ</span>`
    const imageCount = Array.isArray(listing.images) ? listing.images.length : Number(listing.image_count || 0)
    const lat = listing.latitude !== null && listing.latitude !== undefined ? Number(listing.latitude) : null
    const lng = listing.longitude !== null && listing.longitude !== undefined ? Number(listing.longitude) : null
    const hasCoords = lat !== null && !Number.isNaN(lat) && lng !== null && !Number.isNaN(lng)
    const locationText = hasCoords ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '-'
    const listingIdStr = String(listing.id)
    const isEditingRow = currentEditId !== null && Number(listing.id) === Number(currentEditId)
    return `
      <article class="listing-card landlord-row${isEditingRow ? ' is-editing' : ''}" data-listing-id="${escapeHtml(listingIdStr)}">
        <header class="listing-card-header">
          <div class="listing-card-title">
            <h3 class="listing-name">${escapeHtml(listing.title || '-')}</h3>
            <div class="listing-card-meta">
              <span class="listing-type-tag">${escapeHtml(LANDLORD_ROLE_LABELS[listing.property_type] || listing.property_type || '-')}</span>
              <span class="status-pill status-${escapeHtml(statusKey)}">${escapeHtml(statusLabel || '-')}</span>
            </div>
          </div>
          <button type="button" class="table-action-btn edit-listing-btn" data-id="${escapeHtml(listingIdStr)}">แก้ไข</button>
        </header>
        <div class="listing-card-body">
          <div class="listing-info-block listing-price">
            <span class="listing-info-label">ราคา</span>
            <div class="listing-info-value listing-price-value">
              <span class="price-amount">${escapeHtml(priceAmount)}</span>
              <span class="price-unit">${escapeHtml(priceUnit)}</span>
            </div>
          </div>
          <div class="listing-info-block listing-location">
            <span class="listing-info-label">จังหวัด</span>
            <div class="listing-info-value">
              <span class="location-main">${escapeHtml(listing.province || '-')}</span>
              <span class="listing-subtext">พิกัด: ${escapeHtml(locationText)}</span>
            </div>
          </div>
          <div class="listing-info-block listing-images">
            <span class="listing-info-label">รูปภาพ</span>
            <span class="listing-info-value">${escapeHtml(String(imageCount))} รูป</span>
          </div>
          <div class="listing-info-block listing-amenities">
            <span class="listing-info-label">สิ่งอำนวยความสะดวก</span>
            <span class="listing-info-value">${amenitiesText}</span>
          </div>
          <div class="listing-info-block listing-contact">
            <span class="listing-info-label">ช่องทางติดต่อ</span>
            <div class="listing-info-value table-chip-list">
              ${contactChips}
            </div>
          </div>
        </div>
        <footer class="listing-card-footer">
          <span class="listing-updated">อัปเดตล่าสุด: <span class="updated-date">${escapeHtml(listing.updated_at || '-')}</span></span>
          ${hasCoords ? `<span class="listing-coordinates">พิกัดแผนที่: ${escapeHtml(locationText)}</span>` : ''}
        </footer>
      </article>
    `
  }).join('')
  container.innerHTML = `
    <div class="my-listings-layout">
      <div class="listing-card-grid">
        ${cards}
      </div>
    </div>
  `
  container.querySelectorAll('.edit-listing-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-id'))
      startEditListing(id)
    })
  })
  highlightEditingRow()
}

function setBookingRequestsStatus(message, type = 'info'){
  const statusEl = elements.bookingRequestsStatus
  if(!statusEl) return
  if(bookingStatusResetTimer){
    clearTimeout(bookingStatusResetTimer)
    bookingStatusResetTimer = null
  }
  if(!message){
    statusEl.hidden = true
    statusEl.textContent = ''
    statusEl.classList.remove('card-note--error')
    return
  }
  statusEl.hidden = false
  statusEl.textContent = message
  statusEl.classList.toggle('card-note--error', type === 'error')
  if(type !== 'error'){
    bookingStatusResetTimer = setTimeout(() => {
      setBookingRequestsStatus('')
    }, 4000)
  }
}

const BOOKING_STATUS_OPTIONS = [
  { value: 'pending', label: 'รอดำเนินการ' },
  { value: 'contacted', label: 'ติดต่อแล้ว' },
  { value: 'closed', label: 'ปิดคำขอ' }
]

function renderBookingRequests(requests){
  const container = elements.bookingRequestsContainer
  if(!container) return
  currentBookingRequests = Array.isArray(requests) ? requests.map((item) => ({ ...item })) : []
  if(currentBookingRequests.length === 0){
    container.innerHTML = '<div class="empty-state">ยังไม่มีคำขอจองใหม่จากลูกค้า</div>'
    return
  }

  const statusMap = {
    pending: { label: 'รอดำเนินการ', className: 'status-pending' },
    contacted: { label: 'ติดต่อแล้ว', className: 'status-active' },
    closed: { label: 'ปิดคำขอ', className: 'status-inactive' }
  }

  const rows = currentBookingRequests.map((req) => {
    const requesterName = req.requester_name ? escapeHtml(req.requester_name) : '-'
    const emailMeta = req.requester_email ? `<span class="table-sub">อีเมล: ${escapeHtml(req.requester_email)}</span>` : ''
    const phoneMeta = req.requester_phone ? `<span class="table-sub">โทร: ${escapeHtml(req.requester_phone)}</span>` : ''
    const listingTitle = req.listing_title ? escapeHtml(req.listing_title) : '-'
    const listingIdText = Number.isFinite(Number(req.listing_id)) ? escapeHtml(String(req.listing_id)) : ''
    const safeMessage = typeof req.message === 'string' && req.message.trim() !== '' ? escapeHtml(req.message).replace(/\n/g, '<br>') : ''
    const messageHtml = safeMessage
      ? `<div class="booking-message">${safeMessage}</div>`
      : '<span class="table-sub">ไม่มีข้อความเพิ่มเติม</span>'
    const createdText = formatDateTime(req.created_at) || '-'
    const normalizedStatusKey = typeof req.status === 'string' ? req.status.toLowerCase() : 'pending'
    const statusConfig = statusMap[normalizedStatusKey] || {
      label: req.status ? String(req.status) : statusMap.pending.label,
      className: statusMap.pending.className
    }
    const statusLabel = escapeHtml(statusConfig.label)
    const statusClass = escapeHtml(statusConfig.className)

    const optionHtml = BOOKING_STATUS_OPTIONS.map((option) => {
      const selected = option.value === normalizedStatusKey ? ' selected' : ''
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`
    }).join('')

    const actionsHtml = `
      <div class="booking-status-actions">
        <label class="visually-hidden" for="bookingStatus-${escapeHtml(String(req.id))}">ปรับสถานะคำขอ</label>
        <select id="bookingStatus-${escapeHtml(String(req.id))}" class="booking-status-select" data-id="${escapeHtml(String(req.id))}">
          ${optionHtml}
        </select>
        <button type="button" class="table-action-btn booking-status-save" data-id="${escapeHtml(String(req.id))}">บันทึกสถานะ</button>
      </div>
    `

    const contactMetaHtml = emailMeta || phoneMeta ? `<div class="booking-contact-meta">${emailMeta}${phoneMeta}</div>` : ''
    const listingMetaHtml = listingIdText ? `<div class="booking-listing-meta"><span class="table-sub">รหัสประกาศ: ${listingIdText}</span></div>` : ''

    return `
      <tr>
        <td>
          <div class="booking-contact">
            <span class="booking-contact-name">${requesterName}</span>
            ${contactMetaHtml}
          </div>
        </td>
        <td>
          <div class="booking-listing">
            <span class="booking-listing-title">${listingTitle}</span>
            ${listingMetaHtml}
          </div>
        </td>
        <td>${messageHtml}</td>
        <td><span class="booking-date">${escapeHtml(createdText)}</span></td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td>${actionsHtml}</td>
      </tr>
    `
  }).join('')

  container.innerHTML = `
    <div class="booking-table-wrapper">
      <table class="booking-table">
        <colgroup>
          <col class="col-requester" />
          <col class="col-listing" />
          <col class="col-message" />
          <col class="col-date" />
          <col class="col-status" />
          <col class="col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>ผู้จอง</th>
            <th>ประกาศ</th>
            <th>ข้อความเพิ่มเติม</th>
            <th>ส่งเมื่อ</th>
            <th>สถานะ</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

async function loadBookingRequests(options = {}){
  const { silent = false } = options
  if(!silent){
    setBookingRequestsStatus('กำลังโหลดคำขอ...')
  }
  try{
    const data = await fetchJson(phpApi('landlord/booking_requests.php'), { headers: AUTH_HEADERS })
    const requests = Array.isArray(data?.requests) ? data.requests : []
    renderBookingRequests(requests)
    setBookingRequestsStatus('')
  }catch(err){
    console.error('loadBookingRequests', err)
    setBookingRequestsStatus('โหลดคำขอจองไม่สำเร็จ กรุณาลองใหม่', 'error')
  }
}

async function updateBookingRequestStatus(requestId, status){
  if(!Number.isFinite(requestId) || !status){
    return
  }
  const numericId = Number(requestId)
  if(!Number.isFinite(numericId) || numericId <= 0) return
  setBookingRequestsStatus('กำลังอัปเดตสถานะ...')
  try{
    const payload = { request_id: numericId, status }
    const response = await fetchJson(phpApi('landlord/update_booking_request.php'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    })
    const updated = response?.request
    if(updated){
      const existingIndex = currentBookingRequests.findIndex((item) => Number(item?.id) === Number(updated.id))
      if(existingIndex >= 0){
        currentBookingRequests[existingIndex] = { ...currentBookingRequests[existingIndex], ...updated }
      } else {
        currentBookingRequests.unshift(updated)
      }
      renderBookingRequests(currentBookingRequests)
    } else {
      await loadBookingRequests({ silent: true })
    }
    setBookingRequestsStatus('อัปเดตสถานะเรียบร้อย')
  }catch(err){
    console.error('updateBookingRequestStatus', err)
    setBookingRequestsStatus('อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่', 'error')
  }
}

function setConversationStatus(message){
  if(!messageElements.status) return
  messageElements.status.textContent = message || ''
  messageElements.status.hidden = !message
}

function setThreadPlaceholder(text){
  if(messageElements.messages){
    const safe = escapeHtml(text || '')
    messageElements.messages.innerHTML = `<div class="thread-empty">${safe || 'เลือกบทสนทนาเพื่ออ่านและตอบกลับ'}</div>`
  }
  messageState.lastMessageId = 0
}

function resetThreadMessages(){
  setThreadPlaceholder('ยังไม่มีข้อความในบทสนทนานี้')
}

function appendThreadMessages(messages){
  if(!messageElements.messages || !Array.isArray(messages) || messages.length === 0) return
  const placeholder = messageElements.messages.querySelector('.thread-empty')
  if(placeholder){
    messageElements.messages.innerHTML = ''
  }
  messages.forEach((msg) => {
    const wrapper = document.createElement('div')
    const isOwn = Number(msg.sender_id) === currentUserId
    wrapper.className = `thread-message${isOwn ? ' is-own' : ''}`
    const safeBody = escapeHtml(msg.message || '').replace(/\n/g, '<br>')
    wrapper.innerHTML = `
      <div class="thread-message-body">${safeBody}</div>
      <div class="thread-message-meta">${formatDateTime(msg.created_at) || ''}</div>
    `
    messageElements.messages.appendChild(wrapper)
    const msgId = Number(msg.id)
    if(Number.isFinite(msgId)){
      messageState.lastMessageId = Math.max(messageState.lastMessageId, msgId)
    }
  })
  requestAnimationFrame(() => {
    if(messageElements.messages){
      messageElements.messages.scrollTop = messageElements.messages.scrollHeight
    }
  })
}

function highlightActiveConversation(){
  if(!messageElements.list) return
  const nodes = messageElements.list.querySelectorAll('.conversation-item')
  const activeId = Number.isFinite(messageState.activeId) ? Number(messageState.activeId) : null
  nodes.forEach((node) => {
    const nodeId = Number(node.getAttribute('data-id'))
    const isActive = activeId !== null && nodeId === activeId
    node.classList.toggle('is-active', isActive)
    node.setAttribute('aria-selected', isActive ? 'true' : 'false')
  })
}

function updateConversationMeta(conversation){
  if(!conversation){
    if(messageElements.title) messageElements.title.textContent = 'เลือกบทสนทนา'
    if(messageElements.meta) messageElements.meta.textContent = ''
    return
  }
  const displayName = conversation.customer_name || conversation.customer_email || `ผู้ใช้ #${conversation.customer_id || ''}`
  if(messageElements.title){
    messageElements.title.textContent = `ผู้สนใจ: ${displayName}`
  }
  if(messageElements.meta){
    const parts = []
    if(conversation.listing_title){
      parts.push(`ประกาศ: ${conversation.listing_title}`)
    }
    if(conversation.customer_email && conversation.customer_email !== displayName){
      parts.push(`อีเมล: ${conversation.customer_email}`)
    }
    if(conversation.updated_at){
      parts.push(`อัปเดตล่าสุด ${formatDateTime(conversation.updated_at)}`)
    }
    messageElements.meta.textContent = parts.join(' • ')
  }
}

function renderConversationList(){
  if(!messageElements.list) return
  const conversations = Array.isArray(messageState.conversations) ? messageState.conversations : []
  if(messageElements.empty){
    messageElements.empty.textContent = conversationEmptyDefault
    messageElements.empty.hidden = conversations.length !== 0
  }
  if(conversations.length === 0){
    messageElements.list.innerHTML = ''
    highlightActiveConversation()
    return
  }
  const html = conversations.map((conversation) => {
    const idStr = String(conversation.id)
    const displayName = conversation.customer_name || conversation.customer_email || `ผู้ใช้ #${conversation.customer_id || ''}`
    const listingLabel = conversation.listing_title || `Listing #${conversation.listing_id || ''}`
    const lastTime = formatConversationTime(conversation.last_message_at || conversation.updated_at)
    const snippetRaw = createMessageSnippet(conversation.last_message || '')
    const snippetPrefix = Number(conversation.last_sender_id) === currentUserId && snippetRaw ? 'ฉัน: ' : ''
    const snippetText = snippetRaw || 'ยังไม่มีข้อความ'
    const unread = Number(conversation.unread_count || 0)
    const unreadBadge = unread > 0 ? `<span class="conversation-unread">${unread}</span>` : ''
    return `
      <button type="button" class="conversation-item" data-id="${escapeHtml(idStr)}" role="option" tabindex="0">
        <div class="conversation-meta">
          <span class="conversation-time">${escapeHtml(lastTime || '')}</span>
          ${unreadBadge}
        </div>
        <p class="conversation-title">${escapeHtml(displayName)}</p>
        <p class="conversation-snippet">${escapeHtml(snippetPrefix + snippetText)}</p>
        <div class="conversation-meta">
          <span class="conversation-listing">${escapeHtml(listingLabel)}</span>
        </div>
      </button>
    `
  }).join('')
  messageElements.list.innerHTML = html
  messageElements.list.querySelectorAll('.conversation-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = Number(item.getAttribute('data-id'))
      if(Number.isFinite(id)){
        setActiveConversation(id)
      }
    })
    item.addEventListener('keydown', (event) => {
      if(event.key === 'Enter' || event.key === ' '){
        event.preventDefault()
        const id = Number(item.getAttribute('data-id'))
        if(Number.isFinite(id)){
          setActiveConversation(id)
        }
      }
    })
  })
  highlightActiveConversation()
  // update header badge for unread chats
  updateMessagesBadge()
}

// Update the messages card header badge with number of conversations that have unread messages
function updateMessagesBadge(){
  try{
    const titleEl = document.getElementById('messagesTitle')
    if(!titleEl) return
    const conv = Array.isArray(messageState.conversations) ? messageState.conversations : []
    const unreadChats = conv.filter(c => Number(c.unread_count || 0) > 0).length
    const totalUnread = conv.reduce((s,c)=>s + (Number(c.unread_count || 0)), 0)
    let badge = titleEl.querySelector('.messages-badge')
    if(!badge && unreadChats > 0){
      badge = document.createElement('span')
      badge.className = 'messages-badge'
      titleEl.appendChild(badge)
    }
    if(badge){
      if(unreadChats > 0){
        badge.textContent = unreadChats > 99 ? '99+' : String(unreadChats)
        badge.title = `${totalUnread} ข้อความยังไม่ได้อ่าน จาก ${unreadChats} บทสนทนา`
        badge.classList.remove('hidden')
      } else {
        badge.remove()
      }
    }
  }catch(err){
    console.error('updateMessagesBadge', err)
  }
}

function clearActiveConversation(){
  stopConversationPolling()
  messageState.activeId = null
  messageState.lastMessageId = 0
  updateConversationMeta(null)
  if(messageElements.form){
    messageElements.form.setAttribute('aria-hidden', 'true')
    const submitBtn = messageElements.form.querySelector('button[type="submit"]')
    if(submitBtn){
      submitBtn.disabled = true
    }
  }
  if(messageElements.input){
    messageElements.input.value = ''
    messageElements.input.disabled = true
  }
  setThreadPlaceholder('เลือกบทสนทนาเพื่ออ่านและตอบกลับ')
  setConversationStatus('')
  highlightActiveConversation()
}

function updateConversationPreview(conversationId, messages){
  if(!Array.isArray(messages) || messages.length === 0) return
  const numericId = Number(conversationId)
  if(!Number.isFinite(numericId)) return
  const conversation = messageState.conversationMap.get(numericId)
  if(!conversation) return
  const last = messages[messages.length - 1]
  conversation.last_message = last.message
  conversation.last_message_at = last.created_at
  conversation.last_sender_id = last.sender_id
  conversation.updated_at = last.created_at
  conversation.unread_count = 0
  messageState.conversations = messageState.conversations.filter((item) => Number(item.id) !== numericId)
  messageState.conversations.unshift(conversation)
  messageState.conversationMap = new Map(messageState.conversations.map((item) => [Number(item.id), item]))
}

function setActiveConversation(conversationId, options = {}){
  const { loadMessages = true } = options
  const numericId = Number(conversationId)
  if(!Number.isFinite(numericId)) return
  const conversation = messageState.conversationMap.get(numericId)
  if(!conversation){
    clearActiveConversation()
    return
  }
  if(messageState.activeId === numericId && !loadMessages){
    updateConversationMeta(conversation)
    highlightActiveConversation()
    return
  }
  stopConversationPolling()
  messageState.activeId = numericId
  messageState.lastMessageId = 0
  updateConversationMeta(conversation)
  if(messageElements.form){
    messageElements.form.setAttribute('aria-hidden', 'false')
    const submitBtn = messageElements.form.querySelector('button[type="submit"]')
    if(submitBtn){
      submitBtn.disabled = false
    }
  }
  if(messageElements.input){
    messageElements.input.disabled = false
  }
  setThreadPlaceholder('กำลังโหลดข้อความ...')
  highlightActiveConversation()
  if(loadMessages){
    loadConversationMessages({ reset: true })
  }
  startConversationPolling()
}

async function loadConversationList({ silent = false, preserveActive = false } = {}){
  if(messageState.loadingList) return
  if(!messageElements.list) return
  messageState.loadingList = true
  try{
    const data = await fetchJson(phpApi('chat/list_conversations.php'), { headers: AUTH_HEADERS })
    const conversations = Array.isArray(data?.conversations) ? data.conversations : []
    messageState.conversations = conversations
    messageState.conversationMap = new Map(conversations.map((item) => [Number(item.id), item]))
    renderConversationList()
    const activeId = Number.isFinite(messageState.activeId) ? Number(messageState.activeId) : null
    const activeExists = activeId !== null && messageState.conversationMap.has(activeId)
    if(conversations.length === 0){
      clearActiveConversation()
    } else if(!preserveActive){
      if(activeExists){
        updateConversationMeta(messageState.conversationMap.get(activeId))
        highlightActiveConversation()
      } else {
        const first = conversations[0]
        const firstId = Number(first?.id)
        if(Number.isFinite(firstId)){
          setActiveConversation(firstId)
        }
      }
    } else {
      if(activeExists){
        highlightActiveConversation()
      } else if(activeId !== null){
        clearActiveConversation()
      }
    }
  }catch(err){
    console.error('loadConversationList', err)
    if(messageElements.empty){
      messageElements.empty.hidden = false
      messageElements.empty.textContent = 'โหลดรายการบทสนทนาไม่สำเร็จ'
    }
    if(!silent){
      setConversationStatus('ไม่สามารถโหลดรายการบทสนทนาได้')
    }
  }finally{
    messageState.loadingList = false
  }
}

async function loadConversationMessages({ reset = false, silent = false } = {}){
  const conversationId = Number.isFinite(messageState.activeId) ? Number(messageState.activeId) : null
  if(!conversationId || messageState.loadingMessages) return
  messageState.loadingMessages = true
  if(reset){
    setThreadPlaceholder('กำลังโหลดข้อความ...')
  }
  try{
    const afterId = reset ? 0 : messageState.lastMessageId
    const url = phpApi(`chat/fetch_messages.php?conversation_id=${conversationId}&after_id=${afterId}`)
    const data = await fetchJson(url, { headers: AUTH_HEADERS })
    const incoming = Array.isArray(data?.messages) ? data.messages : []
    if(reset && incoming.length === 0){
      resetThreadMessages()
    }
    if(incoming.length > 0){
      appendThreadMessages(incoming)
      updateConversationPreview(conversationId, incoming)
      renderConversationList()
      highlightActiveConversation()
    }
    if(!silent){
      setConversationStatus('')
    }
  }catch(err){
    console.error('loadConversationMessages', err)
    if(!silent){
      setConversationStatus('ไม่สามารถโหลดข้อความได้ กรุณาลองอีกครั้ง')
    }
  }finally{
    messageState.loadingMessages = false
  }
}

function stopConversationPolling(){
  if(messageState.pollingTimer){
    clearInterval(messageState.pollingTimer)
    messageState.pollingTimer = null
  }
}

function startConversationPolling(){
  stopConversationPolling()
  if(!Number.isFinite(messageState.activeId)) return
  messageState.pollingTimer = setInterval(() => {
    loadConversationMessages({ silent: true })
    loadConversationList({ silent: true, preserveActive: true })
  }, 7000)
}

async function handleConversationSubmit(event){
  event.preventDefault()
  if(!messageElements.input || !Number.isFinite(messageState.activeId)) return
  const message = messageElements.input.value.trim()
  if(message === '') return
  const submitBtn = messageElements.form?.querySelector('button[type="submit"]')
  if(submitBtn){
    submitBtn.disabled = true
  }
  messageElements.input.disabled = true
  setConversationStatus('')
  try{
    const payload = { conversation_id: messageState.activeId, message }
    const response = await fetchJson(phpApi('chat/send_message.php'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    })
    const sent = response?.message
    if(sent){
      messageElements.input.value = ''
      appendThreadMessages([sent])
      updateConversationPreview(messageState.activeId, [sent])
      renderConversationList()
      highlightActiveConversation()
    }
  }catch(err){
    console.error('handleConversationSubmit', err)
    setConversationStatus('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
  }finally{
    if(submitBtn){
      submitBtn.disabled = false
    }
    if(messageElements.input){
      messageElements.input.disabled = false
      messageElements.input.focus()
    }
  }
}

function initMessageCenter(){
  if(!messageElements.list || !messageElements.form){
    return
  }
  clearActiveConversation()
  if(messageElements.refreshBtn && !messageElements.refreshBtn.dataset.bound){
    messageElements.refreshBtn.addEventListener('click', () => loadConversationList())
    messageElements.refreshBtn.dataset.bound = 'true'
  }
  if(messageElements.form && !messageElements.form.dataset.bound){
    messageElements.form.addEventListener('submit', handleConversationSubmit)
    messageElements.form.dataset.bound = 'true'
  }
  loadConversationList()
}

async function loadListings(){
  try{
    const data = await fetchJson(phpApi('landlord/my_listings.php'), { headers: JSON_HEADERS })
    renderListings(data?.listings || [])
    clearError()
  }catch(err){
    renderListings([])
    showError('ไม่สามารถโหลดประกาศได้ กรุณาลองใหม่')
  }
}

function getNumericValue(element){
  if(!element) return null
  const value = element.value.trim()
  if(value === '') return null
  const num = parseFloat(value)
  return Number.isNaN(num) ? null : num
}

async function handleSubmit(event){
  event.preventDefault()
  clearError()
  if(elements.success){
    elements.success.hidden = true
  }

  const isEditing = currentEditId !== null

  const title = elements.title?.value.trim()
  const propertyType = elements.type?.value
  const price = elements.price ? parseFloat(elements.price.value) : NaN
  const province = elements.province?.value.trim()
  const address = elements.address?.value.trim()
  const description = elements.description?.value.trim()
  const contacts = collectContactMethods()
  const lat = getNumericValue(elements.latitude)
  const lng = getNumericValue(elements.longitude)
  const latRaw = elements.latitude?.value.trim()
  const lngRaw = elements.longitude?.value.trim()

  if(!title || !propertyType || Number.isNaN(price)){
    showError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อประกาศ ประเภท ราคา)')
    return
  }
  if(contacts.length === 0){
    showError('กรุณาเลือกและกรอกช่องทางติดต่ออย่างน้อย 1 ช่องทาง')
    return
  }
  if((latRaw && !lngRaw) || (!latRaw && lngRaw)){
    showError('กรุณาปักหมุดให้ได้ทั้งละติจูดและลองจิจูด หรือเว้นว่างทั้งคู่')
    return
  }
  if(lat !== null && (lat < -90 || lat > 90)){
    showError('ค่าละติจูดไม่ถูกต้อง')
    return
  }
  if(lng !== null && (lng < -180 || lng > 180)){
    showError('ค่าลองจิจูดไม่ถูกต้อง')
    return
  }

  const amenities = collectAmenities()
  const files = Array.from(elements.fileInput?.files || [])
  const editingListing = isEditing ? getListingById(currentEditId) : null
  const existingImagesCount = editingListing && Array.isArray(editingListing.images) ? editingListing.images.length : 0
  const removedCount = isEditing ? removedImages.size : 0
  let remainingImageSlots = MAX_IMAGES - Math.max(0, existingImagesCount - removedCount)
  if(remainingImageSlots < 0) remainingImageSlots = 0
  const imageError = validateImages(files)
  if(imageError){
    showError(imageError)
    return
  }
  if(isEditing && files.length > remainingImageSlots){
    if(remainingImageSlots === 0){
      showError('ไม่สามารถเพิ่มรูปใหม่ได้ หากต้องการเพิ่มรูปใหม่ กรุณาลบรูปเดิมก่อน')
    } else {
      showError(`เพิ่มรูปใหม่ได้สูงสุดอีก ${remainingImageSlots} รูป`)
    }
    return
  }

  const formData = new FormData()
  formData.append('title', title)
  formData.append('property_type', propertyType)
  formData.append('price', price.toString())
  formData.append('province', province || '')
  formData.append('address', address || '')
  formData.append('description', description || '')
  formData.append('contact_methods', JSON.stringify(contacts))
  formData.append('amenities', JSON.stringify(amenities))
  if(latRaw){
    formData.append('latitude', latRaw)
  }
  if(lngRaw){
    formData.append('longitude', lngRaw)
  }
  files.forEach((file) => formData.append('images[]', file))
  if(isEditing && currentEditId !== null){
    formData.append('listing_id', String(currentEditId))
    if(removedImages.size > 0){
      formData.append('remove_images', JSON.stringify(Array.from(removedImages)))
    }
  }

  if(elements.submitBtn){
    elements.submitBtn.disabled = true
    elements.submitBtn.textContent = 'กำลังบันทึก...'
  }

  try{
    const endpoint = isEditing ? 'landlord/update_listing.php' : 'landlord/create_listing.php'
    const response = await fetchJson(phpApi(endpoint), {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: formData
    })
    if(!response || response.success !== true){
      throw new Error('unexpected_response')
    }
    if(elements.success){
      elements.success.hidden = false
      elements.success.textContent = isEditing
        ? 'อัปเดตประกาศสำเร็จ! ระบบจะส่งให้แอดมินตรวจสอบอีกครั้ง'
        : 'บันทึกสำเร็จ! เรากำลังตรวจสอบประกาศของคุณ'
    }
    suppressResetSuccessHide = true
    elements.form?.reset()
    clearError()
    resetPreviewUrls()
    clearImagePreview()
    clearLocation()
    loadListings()
  }catch(err){
    console.error('create listing error', err)
    showError('บันทึกไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง')
  }finally{
    if(elements.submitBtn){
      elements.submitBtn.disabled = false
      elements.submitBtn.textContent = 'บันทึกประกาศ'
    }
  }
}

function handleFormReset(){
  exitEditMode()
  if(elements.success && !suppressResetSuccessHide){
    elements.success.hidden = true
  }
  suppressResetSuccessHide = false
  clearError()
  resetContactChannels()
  syncAmenityStates()
  setTimeout(() => {
    clearLocation()
    clearImagePreview()
  }, 0)
}

function syncAmenityStates(){
  elements.amenityItems.forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]')
    label.classList.toggle('active-state', !!checkbox?.checked)
  })
}

function syncContactPillStates(){
  elements.contactChannelGroup?.querySelectorAll('label').forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]')
    label.classList.toggle('active', !!checkbox?.checked)
  })
}

function initEvents(){
  if(elements.form){
    elements.form.addEventListener('submit', handleSubmit)
    elements.form.addEventListener('reset', handleFormReset)
  }
  if(elements.fileInput){
    elements.fileInput.addEventListener('change', () => {
      const files = Array.from(elements.fileInput.files || [])
      const validationMessage = validateImages(files)
      if(validationMessage){
        showError(validationMessage)
        elements.fileInput.value = ''
        clearImagePreview()
        return
      }
      clearError()
      updateImagePreview()
    })
  }
  if(elements.clearLocationBtn){
    elements.clearLocationBtn.addEventListener('click', () => {
      clearLocation()
    })
  }
  if(elements.useCurrentBtn){
    elements.useCurrentBtn.addEventListener('click', handleGeolocate)
  }
  elements.amenityItems.forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]')
    if(checkbox){
      checkbox.addEventListener('change', () => syncAmenityStates())
    }
  })
  elements.contactChannelGroup?.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', updateContactChannels)
  })
  if(elements.bookingRequestsRefresh && !elements.bookingRequestsRefresh.dataset.bound){
    elements.bookingRequestsRefresh.addEventListener('click', () => loadBookingRequests())
    elements.bookingRequestsRefresh.dataset.bound = 'true'
  }
  if(elements.bookingRequestsContainer && !elements.bookingRequestsContainer.dataset.bound){
    elements.bookingRequestsContainer.addEventListener('click', (event) => {
      const saveBtn = event.target.closest('.booking-status-save')
      if(!saveBtn){
        return
      }
      const row = saveBtn.closest('tr')
      const select = row ? row.querySelector('.booking-status-select') : null
      const newStatus = select?.value
      const id = Number(saveBtn.getAttribute('data-id'))
      if(!newStatus || !Number.isFinite(id)){
        return
      }
      updateBookingRequestStatus(id, newStatus)
    })
    elements.bookingRequestsContainer.dataset.bound = 'true'
  }
  window.addEventListener('resize', () => {
    if(mapInstance){
      setTimeout(() => mapInstance.invalidateSize(), 150)
    }
  })
}

function init(){
  initMap()
  initCollapsibles()
  initEvents()
  clearImagePreview()
  syncAmenityStates()
  updateContactChannels()
  loadBookingRequests({ silent: true })
  // initMessageCenter() // Messages feature disabled
  loadListings()
}

init()
