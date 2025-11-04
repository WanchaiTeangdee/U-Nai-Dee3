(function(){
  const escapeHtml = (value) => {
    if(value === null || value === undefined) return ''
    return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]))
  }

  const STAT_LABELS = {
    listings_total: 'ประกาศทั้งหมด',
    listings_active: 'ประกาศเผยแพร่',
    booking_requests_total: 'คำขอทั้งหมด',
    booking_requests_pending: 'คำขอรอดำเนินการ',
    conversations_total: 'บทสนทนาทั้งหมด',
    messages_unread: 'ข้อความที่ยังไม่อ่าน',
    bookings_sent: 'การจองที่เคยส่ง'
  }

  const ROLE_LABEL_MAP = (typeof ROLE_LABELS !== 'undefined' && ROLE_LABELS) ? ROLE_LABELS : {
    customer: 'ลูกค้า',
    landlord: 'ผู้ปล่อยเช่า',
    host: 'ผู้ปล่อยเช่า',
    admin: 'แอดมิน'
  }

  const ensureApi = () => {
    if(typeof phpApi === 'function'){
      return phpApi
    }
    const base = (() => {
      const { pathname } = window.location
      const segments = pathname.split('/')
      if(segments.length && segments[segments.length - 1] === '') segments.pop()
      if(segments.length) segments.pop()
      if(segments.length && segments[segments.length - 1] === 'frontend') segments.pop()
      const basePath = segments.filter(Boolean).join('/')
      return basePath ? `/${basePath}` : ''
    })()
    return (endpoint) => `${window.location.origin}${base}/api/${endpoint}`
  }

  const api = ensureApi()

  const nameEl = document.getElementById('profileName')
  const emailEl = document.getElementById('profileEmail')
  const phoneEl = document.getElementById('profilePhone')
  const roleEl = document.getElementById('profileRole')
  const createdEl = document.getElementById('profileCreated')
  const lastLoginWrapper = document.getElementById('profileLastLoginWrapper')
  const lastLoginEl = document.getElementById('profileLastLogin')
  const displayNameEl = document.getElementById('profileDisplayName')
  const displayRoleEl = document.getElementById('profileDisplayRole')
  const displayEmailEl = document.getElementById('profileDisplayEmail')
  const displayCreatedEl = document.getElementById('profileDisplayCreated')
  const displayPhoneEl = document.getElementById('profileDisplayPhone')
  const avatarEl = document.getElementById('profileAvatar')
  const detailNameEl = document.getElementById('detailName')
  const detailEmailEl = document.getElementById('detailEmail')
  const detailPhoneEl = document.getElementById('detailPhone')
  const detailRoleEl = document.getElementById('detailRole')
  const detailCreatedEl = document.getElementById('detailCreated')
  const detailLastLoginEl = document.getElementById('detailLastLogin')
  const detailEmailStatusEl = document.getElementById('detailEmailStatus')
  const detailEmailStatusLabelEl = document.getElementById('detailEmailStatusLabel')
  const detailEmailVerifyBtn = document.getElementById('detailEmailVerifyBtn')
  const emailStatusMessageEl = document.getElementById('emailStatusMessage')
  const detailListingsEl = document.getElementById('detailListings')
  const detailBookingsEl = document.getElementById('detailBookings')
  const detailConversationsEl = document.getElementById('detailConversations')
  const detailUnreadEl = document.getElementById('detailUnread')
  const extrasContainer = document.getElementById('profileExtras')
  const bookingOverviewList = document.getElementById('overviewBookingList')
  const bookingOverviewEmpty = document.getElementById('overviewBookingEmpty')
  const bookingOverviewTotal = document.getElementById('overviewBookingTotal')

  const editForm = document.getElementById('profileEditForm')
  const editNameInput = document.getElementById('profileEditName')
  const editEmailInput = document.getElementById('profileEditEmail')
  const editPhoneInput = document.getElementById('profileEditPhone')
  const editCurrentPasswordInput = document.getElementById('profileEditCurrentPassword')
  const editNewPasswordInput = document.getElementById('profileEditNewPassword')
  const editConfirmPasswordInput = document.getElementById('profileEditConfirmPassword')
  const editStatus = document.getElementById('profileEditStatus')
  const editCancelBtn = document.getElementById('profileEditCancel')
  const editSubmitBtn = document.getElementById('profileEditSubmit')
  const editToggleBtn = document.getElementById('profileEditToggle')
  const passwordFieldset = document.getElementById('profilePasswordFieldset')

  const profileState = {
    user: null,
    stats: null,
    isEditing: false,
    submitting: false,
    bookingRequests: [],
    verification: null
  }

  const formatDateTime = (input) => {
    if(!input) return '-'
    const normalized = typeof input === 'string' && input.includes('T') ? input : String(input).replace(' ', 'T')
    const date = new Date(normalized)
    if(Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }

  const formatCurrency = (value) => {
    if(value === null || value === undefined || value === '') return '-'
    const number = Number(value)
    if(Number.isNaN(number)) return '-'
    try{
      return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(number)
    }catch(err){
      return `${number.toLocaleString('th-TH')} บาท`
    }
  }

  const formatRole = (role) => ROLE_LABEL_MAP[role] || role || '-'

  const formatCount = (value) => {
    if(value === null || value === undefined || value === '') return '-'
    const number = Number(value)
    if(Number.isNaN(number)) return '-'
    return number.toLocaleString('th-TH')
  }

  const setEmailStatusMessage = (message, { variant = 'info' } = {}) => {
    if(!emailStatusMessageEl) return
    const text = (message || '').trim()
    emailStatusMessageEl.textContent = text
    emailStatusMessageEl.hidden = text === ''
    emailStatusMessageEl.classList.remove('is-success', 'is-error')
    if(text !== ''){
      if(variant === 'success'){
        emailStatusMessageEl.classList.add('is-success')
      } else if(variant === 'error'){
        emailStatusMessageEl.classList.add('is-error')
      }
    }
  }

  const BOOKING_STATUS_DETAILS = {
    pending: { label: 'รอดำเนินการ', className: 'status-pending' },
    approved: { label: 'อนุมัติแล้ว', className: 'status-approved' },
    confirmed: { label: 'ยืนยันแล้ว', className: 'status-confirmed' },
    accepted: { label: 'ยืนยันแล้ว', className: 'status-approved' },
    rejected: { label: 'ถูกปฏิเสธ', className: 'status-rejected' },
    declined: { label: 'ถูกปฏิเสธ', className: 'status-declined' },
    cancelled: { label: 'ยกเลิกแล้ว', className: 'status-cancelled' },
    canceled: { label: 'ยกเลิกแล้ว', className: 'status-canceled' },
    completed: { label: 'ดำเนินการเสร็จสิ้น', className: 'status-completed' }
  }

  const resolveBookingStatus = (status) => {
    const key = typeof status === 'string' ? status.trim().toLowerCase() : ''
    return BOOKING_STATUS_DETAILS[key] || BOOKING_STATUS_DETAILS.pending
  }

  const ERROR_MESSAGES = {
    invalid_email: 'รูปแบบอีเมลไม่ถูกต้อง',
    email_exists: 'อีเมลนี้ถูกใช้งานแล้ว',
    name_too_long: 'ชื่อยาวเกินไป (สูงสุด 120 ตัวอักษร)',
    invalid_phone: 'เบอร์ติดต่อไม่ถูกต้อง (กรุณากรอกตัวเลข 7-20 หลัก)',
    password_too_short: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร',
    password_mismatch: 'รหัสผ่านใหม่ไม่ตรงกัน',
    current_password_required: 'กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันการเปลี่ยนรหัสผ่าน',
    current_password_invalid: 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
    invalid_payload: 'ข้อมูลที่ส่งไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
    profile_not_found: 'ไม่พบข้อมูลผู้ใช้',
    email_check_failed: 'ไม่สามารถตรวจสอบอีเมลได้ กรุณาลองใหม่อีกครั้ง',
    update_prepare_failed: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
    update_failed: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  }

  const VERIFICATION_ERRORS = {
    profile_lookup_failed: 'ไม่สามารถส่งลิงก์ยืนยันได้ กรุณาลองใหม่อีกครั้ง',
    profile_not_found: 'ไม่พบบัญชีผู้ใช้',
    verification_prepare_failed: 'ไม่สามารถเตรียมลิงก์ยืนยันได้ กรุณาลองใหม่อีกครั้ง',
    verification_create_failed: 'ไม่สามารถส่งลิงก์ยืนยันได้ กรุณาลองใหม่อีกครั้ง',
    method_not_allowed: 'รูปแบบคำขอไม่ถูกต้อง'
  }

  const isValidEmail = (value) => {
    if(!value) return false
    return /^\S+@\S+\.\S+$/.test(String(value).trim())
  }

  const isValidPhone = (value) => {
    if(!value || value.trim() === '') return true
    return /^[0-9+\-()\s]{7,20}$/.test(String(value).trim())
  }

  const setEditStatus = (message, isSuccess = false) => {
    if(!editStatus) return
    const text = (message || '').trim()
    editStatus.textContent = text
    editStatus.hidden = !text
    editStatus.classList.toggle('form-msg--success', Boolean(isSuccess && text))
  }

  const clearEditPasswords = () => {
    if(editCurrentPasswordInput) editCurrentPasswordInput.value = ''
    if(editNewPasswordInput) editNewPasswordInput.value = ''
    if(editConfirmPasswordInput) editConfirmPasswordInput.value = ''
  }

  const prefillProfileForm = ({ force = false, preserveStatus = false } = {}) => {
    if(!editForm) return
    if(!force && editForm.dataset.dirty === 'true') return
    const user = profileState.user || {}
    if(editNameInput) editNameInput.value = user.name || ''
    if(editEmailInput) editEmailInput.value = user.email || ''
    if(editPhoneInput) editPhoneInput.value = user.phone || ''
    clearEditPasswords()
    if(!preserveStatus) setEditStatus('')
    editForm.dataset.dirty = 'false'
  }

  const setEditingMode = (editing, { resetForm = false, preserveStatus = false } = {}) => {
    profileState.isEditing = Boolean(editing)
    if(editForm){
      editForm.dataset.editing = profileState.isEditing ? 'true' : 'false'
      editForm.setAttribute('aria-disabled', profileState.isEditing ? 'false' : 'true')
    }

    const inputs = [editNameInput, editEmailInput, editPhoneInput, editCurrentPasswordInput, editNewPasswordInput, editConfirmPasswordInput]
    inputs.forEach((input) => {
      if(!input) return
      const shouldDisable = !profileState.isEditing || profileState.submitting
      input.disabled = shouldDisable
    })

    if(passwordFieldset){
      passwordFieldset.disabled = !profileState.isEditing || profileState.submitting
    }

    if(editSubmitBtn){
      editSubmitBtn.disabled = !profileState.isEditing || profileState.submitting
    }
    if(editCancelBtn){
      editCancelBtn.disabled = !profileState.isEditing || profileState.submitting
    }
    if(editToggleBtn){
      editToggleBtn.hidden = profileState.isEditing
      editToggleBtn.disabled = profileState.submitting
    }

    if(resetForm){
      prefillProfileForm({ force: true, preserveStatus })
    }
  }

  const setEditSubmitting = (submitting) => {
    profileState.submitting = Boolean(submitting)
    if(editSubmitBtn){
      editSubmitBtn.textContent = submitting ? 'กำลังบันทึก...' : 'บันทึก'
    }
    setEditingMode(profileState.isEditing)
  }

  setEditStatus('')
  setEditingMode(false, { resetForm: true, preserveStatus: true })

  const renderSummary = (stats) => {
    if(!stats || Object.keys(stats).length === 0){
      // Set default values for stats elements
      const statElements = ['statsListings', 'statsBookings', 'statsMessages', 'statsRating']
      statElements.forEach(id => {
        const el = document.getElementById(id)
        if(el) el.textContent = '-'
      })
      return
    }

    // Map stats to new element IDs
    const statMappings = {
      listings_total: 'statsListings',
      listings_active: 'statsListings', // Use active listings if available, otherwise total
      booking_requests_total: 'statsBookings',
      booking_requests_pending: 'statsBookings', // Use total bookings
      conversations_total: 'statsMessages',
      messages_unread: 'statsMessages', // Use total conversations
      bookings_sent: 'statsBookings' // Alternative mapping
    }

    // Update each stat element
    Object.keys(statMappings).forEach(statKey => {
      const elementId = statMappings[statKey]
      const element = document.getElementById(elementId)
      if(element && stats[statKey] !== undefined){
        const value = Number(stats[statKey])
        const display = Number.isFinite(value) ? value.toLocaleString('th-TH') : stats[statKey]
        element.textContent = display
      }
    })

    // Handle rating separately (if available)
    const ratingEl = document.getElementById('statsRating')
    if(ratingEl){
      const rating = stats.rating || stats.average_rating || 0
      const display = Number.isFinite(Number(rating)) ? Number(rating).toFixed(1) : '-'
      ratingEl.textContent = display
    }
  }

  const renderBookingOverview = (requests = []) => {
    if(!bookingOverviewList || !bookingOverviewEmpty || !bookingOverviewTotal) return

    const items = Array.isArray(requests) ? requests.slice() : []
    bookingOverviewList.innerHTML = ''
    bookingOverviewTotal.textContent = `${items.length.toLocaleString('th-TH')} รายการ`

    if(items.length === 0){
      bookingOverviewEmpty.hidden = false
      return
    }

    bookingOverviewEmpty.hidden = true

    items.forEach((item) => {
      const listItem = document.createElement('li')
      listItem.className = 'summary-booking-item'

      const header = document.createElement('div')
      header.className = 'summary-booking-item-header'

      const title = document.createElement('h3')
      title.className = 'summary-booking-title'
      title.textContent = item.listing_title || 'ไม่ระบุชื่อที่พัก'

      const statusInfo = resolveBookingStatus(item.status)
      const statusEl = document.createElement('span')
      statusEl.className = `summary-booking-status ${statusInfo.className}`
      statusEl.textContent = statusInfo.label

      header.appendChild(title)
      header.appendChild(statusEl)
      listItem.appendChild(header)

      const meta = document.createElement('div')
      meta.className = 'summary-booking-meta'

      const createdSpan = document.createElement('span')
      createdSpan.textContent = `ส่งเมื่อ ${formatDateTime(item.created_at)}`
      meta.appendChild(createdSpan)

      if(item.listing_price !== null && item.listing_price !== undefined){
        const priceSpan = document.createElement('span')
        priceSpan.textContent = `ราคา ${formatCurrency(item.listing_price)}`
        meta.appendChild(priceSpan)
      }

      if(item.listing_province){
        const locationSpan = document.createElement('span')
        locationSpan.textContent = `จังหวัด ${item.listing_province}`
        meta.appendChild(locationSpan)
      }

      if(item.requester_phone){
        const phoneSpan = document.createElement('span')
        phoneSpan.textContent = `โทรศัพท์ ${item.requester_phone}`
        meta.appendChild(phoneSpan)
      }

      listItem.appendChild(meta)

      if(item.message){
        const note = document.createElement('p')
        note.className = 'summary-booking-note'
        note.textContent = item.message
        listItem.appendChild(note)
      }

      bookingOverviewList.appendChild(listItem)
    })
  }

  const redirectToHome = () => {
    window.location.href = 'index.html'
  }

  const handleVerificationResponse = (info, { silent = false } = {}) => {
    if(!info) return
    profileState.verification = info

    if(info.already_verified){
      profileState.user = { ...profileState.user, email_verified: 1 }
      if(detailEmailStatusLabelEl) detailEmailStatusLabelEl.textContent = 'ยืนยันแล้ว'
      else if(detailEmailStatusEl) detailEmailStatusEl.textContent = 'ยืนยันแล้ว'
      if(detailEmailVerifyBtn){
        detailEmailVerifyBtn.hidden = true
        detailEmailVerifyBtn.disabled = true
      }
      if(!silent){
        setEmailStatusMessage('อีเมลนี้ยืนยันเรียบร้อยแล้ว', { variant: 'success' })
      }
      return
    }

    if(info.debug_link){
      console.info('Email verification link:', info.debug_link)
    }

    if(detailEmailVerifyBtn){
      detailEmailVerifyBtn.hidden = false
      detailEmailVerifyBtn.disabled = false
      const originalText = detailEmailVerifyBtn.dataset.label || detailEmailVerifyBtn.textContent || 'ส่งลิงก์ยืนยัน'
      detailEmailVerifyBtn.textContent = originalText
    }

    if(!silent){
      const email = profileState.user?.email || info.email || ''
      const expiresDisplay = info.expires_at ? formatDateTime(info.expires_at) : ''
      let statusText = 'ส่งลิงก์ยืนยันไปยัง ' + (email || 'อีเมลของคุณ') + ' แล้ว'
      if(expiresDisplay && expiresDisplay !== '-'){
        statusText += ` ลิงก์จะหมดอายุ ${expiresDisplay}`
      }
      setEmailStatusMessage(statusText, { variant: 'success' })
    }
  }

  const renderProfile = (payload) => {
    if(!payload) return
    if(payload.user){
      profileState.user = { ...profileState.user, ...payload.user }
    }
    if(payload.stats){
      profileState.stats = { ...payload.stats }
    }

    const user = profileState.user || {}
    const stats = profileState.stats || {}

    const fallbackName = user.name || user.email || '-'
    const fallbackEmail = user.email || '-'
    const formattedRole = formatRole(user.role)
    const joinedAt = user.created_at ? formatDateTime(user.created_at) : '-'
    const phoneNumber = user.phone ? String(user.phone).trim() : ''
    const displayPhone = phoneNumber || '-'
    const emailVerifiedRaw = user.email_verified ?? user.email_verified_at ?? user.verified ?? null
    const isEmailVerified = emailVerifiedRaw === true || emailVerifiedRaw === 'true' || emailVerifiedRaw === 1 || emailVerifiedRaw === '1'
    const emailStatusLabel = isEmailVerified ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'
    const lastLoginDisplay = user.last_login ? formatDateTime(user.last_login) : '-'
  const verifiedAtDisplay = user.email_verified_at ? formatDateTime(user.email_verified_at) : '-'

    if(nameEl) nameEl.textContent = fallbackName
    if(displayNameEl) displayNameEl.textContent = fallbackName
    if(emailEl) emailEl.textContent = fallbackEmail
    if(displayEmailEl) displayEmailEl.textContent = fallbackEmail
    if(phoneEl) phoneEl.textContent = displayPhone
    if(displayPhoneEl) displayPhoneEl.textContent = displayPhone
    if(roleEl) roleEl.textContent = formattedRole
    if(displayRoleEl) displayRoleEl.textContent = formattedRole
    if(createdEl) createdEl.textContent = joinedAt
    if(displayCreatedEl) displayCreatedEl.textContent = joinedAt
    if(detailNameEl) detailNameEl.textContent = fallbackName
    if(detailEmailEl) detailEmailEl.textContent = fallbackEmail
    if(detailPhoneEl) detailPhoneEl.textContent = displayPhone
    if(detailRoleEl) detailRoleEl.textContent = formattedRole
    if(detailCreatedEl) detailCreatedEl.textContent = joinedAt
    if(detailLastLoginEl) detailLastLoginEl.textContent = lastLoginDisplay
    if(detailEmailStatusLabelEl) detailEmailStatusLabelEl.textContent = emailStatusLabel
    else if(detailEmailStatusEl) detailEmailStatusEl.textContent = emailStatusLabel

    if(avatarEl){
      const avatarUrl = user.avatar ? String(user.avatar).trim() : ''
      if(avatarUrl){
        avatarEl.style.backgroundImage = `url('${avatarUrl}')`
        avatarEl.style.backgroundSize = 'cover'
        avatarEl.style.backgroundPosition = 'center'
        avatarEl.textContent = ''
      }else{
        avatarEl.style.backgroundImage = 'none'
        avatarEl.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
        const avatarInitial = (fallbackName || '').trim().charAt(0).toUpperCase() || 'U'
        avatarEl.textContent = avatarInitial
      }
    }
    if(user.last_login){
      if(lastLoginWrapper) lastLoginWrapper.hidden = false
      if(lastLoginEl) lastLoginEl.textContent = lastLoginDisplay
    } else if(lastLoginWrapper){
      lastLoginWrapper.hidden = true
      if(lastLoginEl) lastLoginEl.textContent = '-'
    }
    renderSummary(stats)
    if(detailListingsEl) detailListingsEl.textContent = formatCount(stats.listings_total ?? stats.listings_active)
    if(detailBookingsEl){
      const totalBookings = stats.booking_requests_total ?? profileState.bookingRequests.length ?? null
      detailBookingsEl.textContent = formatCount(totalBookings)
    }
    if(detailConversationsEl) detailConversationsEl.textContent = formatCount(stats.conversations_total)
    if(detailUnreadEl) detailUnreadEl.textContent = formatCount(stats.messages_unread)

    // Verification is disabled in this deployment: hide the verification control
    if(detailEmailVerifyBtn){
      detailEmailVerifyBtn.hidden = true
      detailEmailVerifyBtn.disabled = true
    }

    // Show verified message regardless (users are auto-verified)
    const successMessage = verifiedAtDisplay && verifiedAtDisplay !== '-' ? `ยืนยันเมื่อ ${verifiedAtDisplay}` : 'ยืนยันอีเมลเรียบร้อยแล้ว'
    setEmailStatusMessage(successMessage, { variant: 'success' })
  }

  const requestEmailVerification = async () => {
    if(!detailEmailVerifyBtn) return
    const token = localStorage.getItem('authToken')
    if(!token){
      redirectToHome()
      return
    }

    const originalText = detailEmailVerifyBtn.dataset.label || detailEmailVerifyBtn.textContent || 'ส่งลิงก์ยืนยัน'
    detailEmailVerifyBtn.disabled = true
    detailEmailVerifyBtn.textContent = 'กำลังส่ง...'
  setEmailStatusMessage('กำลังส่งลิงก์ยืนยันไปยังอีเมลของคุณ...')

    try{
      const res = await fetch(api('user/send_verification.php'), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      })

      let json = null
      try{
        json = await res.json()
      }catch(parseErr){
        console.warn('verification response parse error', parseErr)
      }

      if(!res.ok){
        const errorCode = json?.error || ''
        const friendly = VERIFICATION_ERRORS[errorCode] || 'ไม่สามารถส่งลิงก์ยืนยันได้ กรุณาลองใหม่อีกครั้ง'
        setEmailStatusMessage(friendly, { variant: 'error' })
        return
      }

      if(json){
        handleVerificationResponse(json)
      } else {
        setEmailStatusMessage('ส่งลิงก์ยืนยันแล้ว กรุณาตรวจสอบกล่องอีเมลของคุณ', { variant: 'success' })
      }
    }catch(err){
      console.error('requestEmailVerification error', err)
      setEmailStatusMessage('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง', { variant: 'error' })
    }finally{
      if(detailEmailVerifyBtn){
        detailEmailVerifyBtn.disabled = false
        detailEmailVerifyBtn.textContent = originalText
      }
    }
  }

  const loadProfile = async () => {
    const token = localStorage.getItem('authToken')
    if(!token){
      redirectToHome()
      return
    }
    const userStr = localStorage.getItem('user')
    let userRole = ''
    let userId = 0
    if(userStr){
      try{
        const parsed = JSON.parse(userStr)
        userRole = parsed?.role || ''
        userId = Number(parsed?.id) || 0
      }catch(err){
        console.warn('profile parse user error', err)
      }
    }
    try{
      const res = await fetch(api('user/profile.php'), {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      if(res.status === 401 || res.status === 403){
        redirectToHome()
        return
      }
      if(!res.ok){
        throw new Error('HTTP ' + res.status)
      }
      const data = await res.json()
      if(extrasContainer){
        extrasContainer.innerHTML = ''
      }
      renderProfile(data)
      prefillProfileForm({ force: true })

      if(profileState.user && (profileState.user.email_verified === 1 || profileState.user.email_verified === true)){
        profileState.verification = null
      }

      // Update header user status
      if(typeof renderUserStatus === 'function'){
        renderUserStatus()
      }

      const profileUserId = Number(data?.user?.id) || userId
      if(token){
        loadCustomerBookingRequests(token)
      }
      if(userRole === 'landlord' || userRole === 'host' || userRole === 'admin'){
        try{
          const query = userRole === 'admin' && profileUserId > 0 ? `?owner_id=${encodeURIComponent(profileUserId)}` : ''
          const bookingRes = await fetch(api(`landlord/booking_requests.php${query}`), {
            headers: { 'Authorization': 'Bearer ' + token }
          })
          if(bookingRes.ok){
            const bookingData = await bookingRes.json()
            if(Array.isArray(bookingData?.requests)){
              document.dispatchEvent(new CustomEvent('profile:bookingsLoaded', { detail: bookingData.requests }))
            }
          }
        }catch(err){
          console.warn('profile load bookings error', err)
        }
      }
    }catch(err){
      console.error('loadProfile', err)
    }
  }

  async function loadCustomerBookingRequests(token){
    if(!token) return
    try{
      const res = await fetch(api('user/my_booking_requests.php'), {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      if(res.status === 401 || res.status === 403){
        profileState.bookingRequests = []
        renderBookingOverview([])
        return
      }
      if(!res.ok){
        console.warn('profile my bookings response', res.status)
        return
      }
      const data = await res.json().catch(() => null)
      const requests = Array.isArray(data?.requests) ? data.requests : []
      profileState.bookingRequests = requests
      renderBookingOverview(requests)
      if(detailBookingsEl){
        const totalFromStats = profileState.stats?.booking_requests_total
        detailBookingsEl.textContent = formatCount(totalFromStats ?? requests.length)
      }
    }catch(err){
      console.warn('profile load customer bookings error', err)
    }
  }

  renderBookingOverview([])

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    if(!editForm) return
    if(!profileState.isEditing && !profileState.submitting) return

    const name = editNameInput ? editNameInput.value.trim() : ''
    const email = editEmailInput ? editEmailInput.value.trim() : ''
  const phone = editPhoneInput ? editPhoneInput.value.trim() : ''
    const currentPassword = editCurrentPasswordInput ? editCurrentPasswordInput.value : ''
    const newPassword = editNewPasswordInput ? editNewPasswordInput.value : ''
    const confirmPassword = editConfirmPasswordInput ? editConfirmPasswordInput.value : ''

    if(!name){
      setEditStatus('กรุณากรอกชื่อผู้ใช้งาน')
      if(editNameInput) editNameInput.focus()
      return
    }
    if(!isValidEmail(email)){
      setEditStatus(ERROR_MESSAGES.invalid_email)
      if(editEmailInput) editEmailInput.focus()
      return
    }

    if(!isValidPhone(phone)){
      setEditStatus(ERROR_MESSAGES.invalid_phone)
      if(editPhoneInput) editPhoneInput.focus()
      return
    }

    const wantsPasswordChange = Boolean(newPassword || confirmPassword || currentPassword)
    if(wantsPasswordChange){
      if(newPassword.length < 8){
        setEditStatus(ERROR_MESSAGES.password_too_short)
        if(editNewPasswordInput) editNewPasswordInput.focus()
        return
      }
      if(newPassword !== confirmPassword){
        setEditStatus(ERROR_MESSAGES.password_mismatch)
        if(editConfirmPasswordInput) editConfirmPasswordInput.focus()
        return
      }
      if(!currentPassword){
        setEditStatus(ERROR_MESSAGES.current_password_required)
        if(editCurrentPasswordInput) editCurrentPasswordInput.focus()
        return
      }
    }

    const token = localStorage.getItem('authToken')
    if(!token){
      redirectToHome()
      return
    }

    const payload = {
      name,
      email,
      phone,
      current_password: wantsPasswordChange ? currentPassword : '',
      new_password: wantsPasswordChange ? newPassword : '',
      confirm_password: wantsPasswordChange ? confirmPassword : ''
    }

    setEditStatus('')
    setEditSubmitting(true)
    try{
      const res = await fetch(api('user/update_profile.php'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
      })

      let json = null
      try{
        json = await res.json()
      }catch(parseErr){
        console.warn('profile update parse error', parseErr)
      }

      if(!res.ok){
        const errorCode = json?.error
        let message = errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
        if(json?.message){
          message = json.message
        }
        setEditStatus(message, false)
        if(res.status === 401 || res.status === 403){
          redirectToHome()
        }
        return
      }

      if(json?.user){
        profileState.user = { ...profileState.user, ...json.user }
      } else {
        profileState.user = { ...profileState.user, name, email, phone }
      }
      if(json?.stats){
        profileState.stats = { ...json.stats }
      }

    renderProfile({ user: profileState.user, stats: profileState.stats || {} })
    prefillProfileForm({ force: true, preserveStatus: true })
    renderBookingOverview(profileState.bookingRequests)

    if(json?.verification){
      handleVerificationResponse(json.verification)
    } else if(json?.user && (json.user.email_verified === 1 || json.user.email_verified === true)){
      profileState.verification = null
    }

      let storedUser = {}
      const stored = localStorage.getItem('user')
      if(stored){
        try{
          storedUser = JSON.parse(stored) || {}
        }catch(err){
          storedUser = {}
        }
      }
      const merged = { ...storedUser, ...profileState.user }
      localStorage.setItem('user', JSON.stringify(merged))
      if(typeof renderUserStatus === 'function'){
        renderUserStatus()
      } else {
        document.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: merged } }))
      }

      setEditStatus('บันทึกข้อมูลเรียบร้อยแล้ว', true)
      editForm.dataset.dirty = 'false'
      setEditingMode(false)
      clearEditPasswords()
      document.dispatchEvent(new CustomEvent('profile:updated', { detail: { user: profileState.user } }))
    }catch(err){
      console.error('profile update error', err)
      setEditStatus('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง', false)
    }finally{
      setEditSubmitting(false)
    }
  }

  if(editForm){
    editForm.addEventListener('submit', handleProfileSubmit)
    editForm.addEventListener('input', () => {
      editForm.dataset.dirty = 'true'
      setEditStatus('')
    })
  }

  if(editToggleBtn){
    editToggleBtn.addEventListener('click', () => {
      setEditingMode(true, { resetForm: true })
      const focusTarget = editNameInput || editEmailInput
      if(focusTarget){
        window.requestAnimationFrame(() => focusTarget.focus())
      }
    })
  }

  if(editCancelBtn){
    editCancelBtn.addEventListener('click', () => {
      setEditingMode(false, { resetForm: true })
      if(editToggleBtn){
        window.requestAnimationFrame(() => editToggleBtn.focus())
      }
    })
  }

  if(detailEmailVerifyBtn){
    // disable/hide the verify button — verification is not required
    detailEmailVerifyBtn.hidden = true
    detailEmailVerifyBtn.disabled = true
  }

  document.addEventListener('DOMContentLoaded', () => {
    const userStr = localStorage.getItem('user')
    if(!userStr){
      redirectToHome()
      return
    }

    if(emailStatusMessageEl){
      emailStatusMessageEl.hidden = true
    }

    let profileIssueWidget = null
    const issueContainer = document.getElementById('userIssueCenter')
    if(issueContainer && typeof window.createIssuesWidget === 'function'){
      const issueCategories = [
        { value: 'ทั่วไป', label: 'ทั่วไป' },
        { value: 'การใช้งานระบบ', label: 'การใช้งานระบบ' },
        { value: 'การค้นหาที่พัก', label: 'การค้นหาที่พัก' },
        { value: 'การจอง', label: 'ขั้นตอนการจอง' },
        { value: 'บัญชีและเข้าสู่ระบบ', label: 'บัญชีและการเข้าสู่ระบบ' }
      ]
      profileIssueWidget = window.createIssuesWidget(issueContainer, {
        heading: 'แจ้งปัญหา / ติดต่อทีมงาน',
        description: 'ส่งคำถามหรือรายงานปัญหาเกี่ยวกับการใช้งาน U-Nai Dee ได้ที่นี่',
        categories: issueCategories,
        defaultCategory: issueCategories[0]?.value || 'ทั่วไป',
        context: 'customer',
        onLoginRequest: () => {
          if(typeof openAuthPanel === 'function'){
            openAuthPanel('login')
          } else {
            window.location.href = 'login.html'
          }
        }
      })

      document.addEventListener('profile:updated', () => {
        profileIssueWidget?.reload?.()
      })
    }

    const sidebarLinks = Array.prototype.slice.call(document.querySelectorAll('.sidebar-nav .sidebar-link'))
    const anchorLinks = sidebarLinks.filter((link) => {
      const href = (link.getAttribute('href') || '').trim()
      return href.startsWith('#')
    })

    const activateSidebarSection = (sectionId, { scroll = true, updateHash = true } = {}) => {
      if(!sectionId) return
      const normalizedId = String(sectionId).replace(/^#/, '')

      anchorLinks.forEach((link) => {
        const href = (link.getAttribute('href') || '').trim()
        const isActive = href === `#${normalizedId}` || href === normalizedId
        link.classList.toggle('is-active', isActive)
        if(isActive){
          link.setAttribute('aria-current', 'page')
        } else {
          link.removeAttribute('aria-current')
        }
      })

      if(scroll){
        const target = document.getElementById(normalizedId)
        if(target){
          const previousTabIndex = target.hasAttribute('tabindex') ? target.getAttribute('tabindex') : null
          if(previousTabIndex === null) target.setAttribute('tabindex', '-1')
          try{
            target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }catch(err){
            target.scrollIntoView()
          }
          if(typeof target.focus === 'function'){
            try{
              target.focus({ preventScroll: true })
            }catch(err){
              target.focus()
            }
          }
          if(previousTabIndex === null){
            const removeTabIndex = () => {
              target.removeAttribute('tabindex')
              target.removeEventListener('blur', removeTabIndex)
            }
            target.addEventListener('blur', removeTabIndex, { once: true })
          }
        }
      }

      if(updateHash){
        try{
          if(typeof history.replaceState === 'function'){
            history.replaceState(null, '', `#${normalizedId}`)
          } else {
            window.location.hash = normalizedId
          }
        }catch(err){
          console.warn('profile hash update failed', err)
        }
      }
    }

    if(anchorLinks.length){
      const handleSidebarClick = (event) => {
        const link = event.currentTarget
        const href = (link.getAttribute('href') || '').trim()
        if(!href || !href.startsWith('#')) return
        event.preventDefault()
        const sectionId = href.slice(1)
        activateSidebarSection(sectionId, { scroll: true, updateHash: true })
      }

      anchorLinks.forEach((link) => {
        link.addEventListener('click', handleSidebarClick)
      })

      const initialHash = window.location.hash ? window.location.hash.replace(/^#/, '') : ''
      if(initialHash){
        activateSidebarSection(initialHash, { scroll: false, updateHash: false })
      } else {
        const firstAnchorTarget = anchorLinks.length ? (anchorLinks[0].getAttribute('href') || '').replace(/^#/, '') : ''
        if(firstAnchorTarget){
          activateSidebarSection(firstAnchorTarget, { scroll: false, updateHash: false })
        }
      }
    }

    const normalizePath = (value) => {
      if(!value) return '/'
      const cleaned = value
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/\/+$/g, '')
      return cleaned === '' ? '/' : cleaned
    }

    const currentPath = normalizePath(window.location.pathname)
    sidebarLinks.forEach((link) => {
      const href = (link.getAttribute('href') || '').trim()
      if(!href || href.startsWith('#')) return
      let linkPath = ''
      try{
        linkPath = new URL(href, window.location.href).pathname
      }catch(err){
        linkPath = href
      }
      linkPath = normalizePath(linkPath)
      const isActive = linkPath === currentPath
      if(isActive){
        link.classList.add('is-active')
        link.setAttribute('aria-current', 'page')
      } else if(!anchorLinks.includes(link)){
        link.classList.remove('is-active')
        link.removeAttribute('aria-current')
      }
    })

    loadProfile()
  })
})()
