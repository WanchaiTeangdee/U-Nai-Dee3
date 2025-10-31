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

  const ACCOUNT_STATUS_CONTENT = {
    verified: {
      badge: 'ยืนยันแล้ว',
      message: 'บัญชีของคุณพร้อมใช้งาน',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    },
    pending: {
      badge: 'รอการยืนยัน',
      message: 'กรุณายืนยันอีเมลเพื่อความปลอดภัยของบัญชี',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 8V12L14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    },
    suspended: {
      badge: 'ถูกระงับ',
      message: 'โปรดติดต่อผู้ดูแลเพื่อปลดล็อกบัญชีของคุณ',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 9V12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 16H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    }
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

  const avatarEl = document.getElementById('profileAvatar')
  const avatarUploadBtn = document.getElementById('avatarUploadBtn')
  const avatarUploadInput = document.getElementById('avatarUploadInput')

  const nameEl = document.getElementById('profileName')
  const emailEl = document.getElementById('profileEmail')
  const phoneEl = document.getElementById('profilePhone')
  const roleEl = document.getElementById('profileRole')
  const createdEl = document.getElementById('profileCreated')
  const lastLoginWrapper = document.getElementById('profileLastLoginWrapper')
  const lastLoginEl = document.getElementById('profileLastLogin')
  const summaryEl = document.getElementById('profileSummary')
  const extrasContainer = document.getElementById('profileExtras')

  // Account status indicator elements
  const accountStatusIndicator = document.querySelector('.account-status-indicator')
  const statusBadge = document.getElementById('accountStatusBadge')
  const statusMessage = document.getElementById('accountStatusMessage')
  const statusIconWrapper = document.querySelector('.account-status-indicator .status-icon')

  // Display elements in hero section
  const displayNameEl = document.getElementById('profileDisplayName')
  const displayEmailEl = document.getElementById('profileDisplayEmail')
  const displayRoleEl = document.getElementById('profileDisplayRole')
  const displayCreatedEl = document.getElementById('profileDisplayCreated')

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
    submitting: false
  }

  const getAuthToken = () => {
    const storedToken = localStorage.getItem('authToken')
    if(storedToken) return storedToken
    const userStr = localStorage.getItem('user')
    if(!userStr) return null
    try{
      const user = JSON.parse(userStr)
      if(user && typeof user.token === 'string' && user.token){
        return user.token
      }
    }catch(err){
      console.warn('profile parse token error', err)
    }
    return null
  }

  const formatDateTime = (input) => {
    if(!input) return '-'
    const normalized = typeof input === 'string' && input.includes('T') ? input : String(input).replace(' ', 'T')
    const date = new Date(normalized)
    if(Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }

  const formatRole = (role) => ROLE_LABEL_MAP[role] || role || '-'

  const ERROR_MESSAGES = {
    invalid_email: 'รูปแบบอีเมลไม่ถูกต้อง',
    email_exists: 'อีเมลนี้ถูกใช้งานแล้ว',
    name_too_long: 'ชื่อยาวเกินไป (สูงสุด 120 ตัวอักษร)',
    invalid_phone: 'เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลขเท่านั้น 7-20 หลัก)',
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

  const isValidPhone = (value) => {
    if(!value || value.trim() === '') return true // Phone is optional
    return /^[0-9+\-\s()]{7,20}$/.test(String(value).trim())
  }

  const setEditStatus = (message, isSuccess = false) => {
    if(!editStatus) return
    const text = (message || '').trim()
    editStatus.textContent = text
    editStatus.hidden = !text
    editStatus.classList.remove('success', 'error', 'info')
    if(text) {
      const type = isSuccess ? 'success' : (text.includes('กรุณา') || text.includes('ไม่ถูกต้อง') ? 'error' : 'info')
      editStatus.classList.add(type)
    }
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
    const submitBtn = editSubmitBtn
    if(submitBtn){
      if(submitting) {
        submitBtn.classList.add('btn-loading')
        submitBtn.textContent = 'กำลังบันทึก...'
      } else {
        submitBtn.classList.remove('btn-loading')
        submitBtn.textContent = 'บันทึกการเปลี่ยนแปลง'
      }
    }
    setEditingMode(profileState.isEditing)
  }

  setEditStatus('')
  setEditingMode(false, { resetForm: true, preserveStatus: true })

  const showNotification = (message, type = 'info') => {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `notification notification-${type}`
    notification.textContent = message

    // Add to page
    document.body.appendChild(notification)

    // Show notification
    setTimeout(() => notification.classList.add('show'), 10)

    // Hide and remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show')
      setTimeout(() => {
        if(notification.parentNode) {
          notification.parentNode.removeChild(notification)
        }
      }, 300)
    }, 3000)
  }

  const renderSummary = (stats = {}) => {
    if(!summaryEl) return
    summaryEl.innerHTML = ''
    if(!stats || Object.keys(stats).length === 0){
      summaryEl.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 19V13C9 11.8954 8.10457 11 7 11H5C3.89543 11 3 11.89543 3 13V19C3 20.1046 3.89543 21 5 21H7C8.10457 21 9 20.1046 9 19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V11C15 12.1046 14.1046 13 13 13H11C9.89543 13 9 12.1046 9 11V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 9C21 7.89543 20.1046 7 19 7H17C15.8954 7 15 7.89543 15 9V15C15 16.1046 15.8954 17 17 17H19C20.1046 17 21 16.1046 21 15V9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h3>ยังไม่มีข้อมูลสถิติ</h3>
          <p>ข้อมูลสถิติการใช้งานจะแสดงเมื่อคุณเริ่มใช้งานระบบ</p>
        </div>`
      return
    }

    const statIcons = {
      listings_total: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 21V5C19 3.89543 18.1046 3 17 3H7C5.89543 3 5 3.89543 5 5V21M19 21L21 21M19 21H14M5 21L3 21M5 21H10M9 9H15M9 13H15M9 17H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      listings_active: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      booking_requests_total: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 7V3M16 7V3M18 21H6C4.89543 21 4 20.1046 4 19V7C4 5.89543 4.89543 5 6 5H18C19.1046 5 20 5.89543 20 7V19C20 20.1046 19.1046 21 18 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      booking_requests_pending: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      conversations_total: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 12H8.01M12 12H12.01M16 12H16.01M21 12C21 16.9706 16.9706 21 12 21C10.89 21 9.83 20.75 8.88 20.3L3 21L4.7 15.12C4.25 14.17 4 13.11 4 12C4 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      messages_unread: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.5 12C18.5 15.5899 15.5899 18.5 12 18.5C8.41015 18.5 5.5 15.5899 5.5 12C5.5 8.41015 8.41015 5.5 12 5.5C15.5899 5.5 18.5 8.41015 18.5 12Z" stroke="currentColor" stroke-width="2"/><path d="M12 8V12L14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/></svg>`,
      bookings_sent: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 19L19 12L12 5M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    }

    const fragments = Object.keys(stats)
      .filter((key) => STAT_LABELS[key] !== undefined)
      .map((key, index) => {
        const value = Number(stats[key])
        const display = Number.isFinite(value) ? value.toLocaleString('th-TH') : stats[key]
        const icon = statIcons[key] || statIcons.listings_total
        return `
          <div class="stat-item">
            <div class="stat-icon">${icon}</div>
            <div class="stat-value">${display}</div>
            <div class="stat-label">${STAT_LABELS[key]}</div>
          </div>`
      })

    if(fragments.length === 0){
      summaryEl.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 19V13C9 11.8954 8.10457 11 7 11H5C3.89543 11 3 11.89543 3 13V19C3 20.1046 3.89543 21 5 21H7C8.10457 21 9 20.1046 9 19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V11C15 12.1046 14.1046 13 13 13H11C9.89543 13 9 12.1046 9 11V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 9C21 7.89543 20.1046 7 19 7H17C15.8954 7 15 7.89543 15 9V15C15 16.1046 15.8954 17 17 17H19C20.1046 17 21 16.1046 21 15V9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h3>ยังไม่มีข้อมูลสถิติ</h3>
          <p>ข้อมูลสถิติการใช้งานจะแสดงเมื่อคุณเริ่มใช้งานระบบ</p>
        </div>`
      return
    }
    summaryEl.innerHTML = fragments.join('')
  }

  const handleAvatarUpload = async (file) => {
    if(!file) return

    // Validate file type
    if(!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
      return
    }

    // Validate file size (max 5MB)
    if(file.size > 5 * 1024 * 1024) {
      alert('ขนาดไฟล์ต้องไม่เกิน 5MB')
      return
    }

    const token = getAuthToken()
    if(!token) {
      redirectToHome()
      return
    }

    // Show loading state
    if(avatarEl) {
      avatarEl.classList.add('uploading')
    }

    const formData = new FormData()
    formData.append('avatar', file)

    try {
      const res = await fetch(api('user/upload_avatar.php'), {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token
        },
        body: formData
      })

      if(!res.ok) {
        if(res.status === 401 || res.status === 403) {
          redirectToHome()
          return
        }
        throw new Error('Upload failed')
      }

      const data = await res.json()

      if(data.success && data.avatar_url) {
        // Update user data with new avatar
        if(profileState.user) {
          profileState.user.avatar = data.avatar_url
        }

        // Update localStorage
        const stored = localStorage.getItem('user')
        if(stored) {
          try {
            const userData = JSON.parse(stored)
            userData.avatar = data.avatar_url
            localStorage.setItem('user', JSON.stringify(userData))
          } catch(err) {
            console.warn('Failed to update localStorage avatar', err)
          }
        }

        // Re-render profile to show new avatar
        renderProfile({ user: profileState.user, stats: profileState.stats })

        // Dispatch event for other components
        document.dispatchEvent(new CustomEvent('profile:avatarUpdated', { detail: { avatar_url: data.avatar_url } }))

        // Show success message
        showNotification('อัปโหลดรูปโปรไฟล์เรียบร้อยแล้ว', 'success')
      } else {
        throw new Error(data.message || 'Upload failed')
      }
    } catch(err) {
      console.error('Avatar upload error', err)
      showNotification('ไม่สามารถอัปโหลดรูปโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง', 'error')
    } finally {
      // Remove loading state
      if(avatarEl) {
        avatarEl.classList.remove('uploading')
      }
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

    if(nameEl) nameEl.textContent = user.name || user.email || '-'
    if(emailEl) emailEl.textContent = user.email || '-'
    if(phoneEl) phoneEl.textContent = user.phone || '-'
    if(roleEl) roleEl.textContent = formatRole(user.role)
    if(createdEl) createdEl.textContent = user.created_at ? formatDateTime(user.created_at) : '-'
    if(user.last_login){
      if(lastLoginWrapper) lastLoginWrapper.hidden = false
      if(lastLoginEl) lastLoginEl.textContent = formatDateTime(user.last_login)
    } else if(lastLoginWrapper){
      lastLoginWrapper.hidden = true
    }

    // Update account status indicator
    if(accountStatusIndicator && statusBadge) {
      const emailVerifiedValue = user.email_verified ?? user.email_verified_at ?? user.verified
      const isVerified = emailVerifiedValue === true || emailVerifiedValue === 'true' || emailVerifiedValue === 1 || emailVerifiedValue === '1'
      const isActive = user.status === 'active' || !user.status

      let statusKey = 'pending'
      if(!isActive){
        statusKey = 'suspended'
      } else if(isVerified){
        statusKey = 'verified'
      }

      const content = ACCOUNT_STATUS_CONTENT[statusKey] || ACCOUNT_STATUS_CONTENT.pending
      statusBadge.textContent = content.badge
      statusBadge.className = `status-badge status-${statusKey}`
      if(statusMessage){
        statusMessage.textContent = content.message
      }
      if(statusIconWrapper){
        statusIconWrapper.innerHTML = content.icon
      }
      accountStatusIndicator.classList.remove('status-verified', 'status-pending', 'status-suspended')
      accountStatusIndicator.classList.add(`status-${statusKey}`)
      accountStatusIndicator.hidden = false
    } else if(accountStatusIndicator){
      accountStatusIndicator.hidden = true
    }

    // Update display elements in hero section
    if(displayNameEl) displayNameEl.textContent = user.name || user.email || '-'
    if(displayEmailEl) displayEmailEl.textContent = user.email || '-'
    if(displayRoleEl) displayRoleEl.textContent = formatRole(user.role)
    if(displayCreatedEl) displayCreatedEl.textContent = user.created_at ? formatDateTime(user.created_at) : '-'

    // Render avatar
    if(avatarEl) {
      if(user.avatar) {
        avatarEl.style.backgroundImage = `url('${user.avatar}')`
        avatarEl.style.backgroundSize = 'cover'
        avatarEl.style.backgroundPosition = 'center'
        avatarEl.style.backgroundColor = 'transparent'
        avatarEl.textContent = ''
      } else {
        avatarEl.style.backgroundImage = 'none'
        avatarEl.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
        const name = user.name || user.email || '?'
        avatarEl.textContent = name.charAt(0).toUpperCase()
      }
    }

    renderSummary(stats)
  }

  const loadProfile = async () => {
    const token = getAuthToken()
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

      const profileUserId = Number(data?.user?.id) || userId
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
      if(summaryEl){
        summaryEl.innerHTML = '<div class="empty-state">ไม่สามารถโหลดข้อมูลโปรไฟล์ได้ กรุณาลองใหม่ภายหลัง</div>'
      }
    }
  }

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

    if(phone && !isValidPhone(phone)){
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

    const token = getAuthToken()
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

  if(avatarUploadBtn && avatarUploadInput) {
    avatarUploadBtn.addEventListener('click', () => {
      avatarUploadInput.click()
    })

    avatarUploadInput.addEventListener('change', (event) => {
      const file = event.target.files[0]
      if(file) {
        handleAvatarUpload(file)
      }
    })
  }

  const loadRecentActivities = async () => {
    const timelineEl = document.getElementById('activityTimeline')
    if(!timelineEl) return

    const token = getAuthToken()
    if(!token){
      renderEmptyActivities()
      redirectToHome()
      return
    }

    try {
      const response = await fetch(api('user/activities.php'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if(response.status === 401 || response.status === 403){
        redirectToHome()
        return
      }
      if(!response.ok) throw new Error('Failed to load activities')

      const data = await response.json()

      if(data.success && data.activities && data.activities.length > 0) {
        renderActivities(data.activities)
      } else {
        renderEmptyActivities()
      }
    } catch (error) {
      console.error('Error loading activities:', error)
      renderEmptyActivities()
    }
  }

  const renderActivities = (activities) => {
    const timelineEl = document.getElementById('activityTimeline')
    if(!timelineEl) return

    const activitiesHtml = activities.map(activity => {
      const iconClass = getActivityIconClass(activity.type)
      const iconSvg = getActivityIconSvg(activity.type)
      const timeAgo = formatTimeAgo(activity.created_at)

      return `
        <div class="activity-item">
          <div class="activity-icon ${iconClass}">
            ${iconSvg}
          </div>
          <div class="activity-content">
            <p class="activity-text">${escapeHtml(activity.description)}</p>
            <span class="activity-time">${timeAgo}</span>
          </div>
        </div>
      `
    }).join('')

    timelineEl.innerHTML = activitiesHtml
  }

  const renderEmptyActivities = () => {
    const timelineEl = document.getElementById('activityTimeline')
    if(!timelineEl) return

    timelineEl.innerHTML = `
      <div class="activity-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M19 15L17.5 16.5L15 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 12L5.5 13.5L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>ยังไม่มีกิจกรรม</h3>
        <p>กิจกรรมของคุณจะปรากฏที่นี่เมื่อคุณเริ่มใช้งาน</p>
      </div>
    `
  }

  const getActivityIconClass = (type) => {
    const classes = {
      message: 'activity-message',
      booking: 'activity-booking',
      profile: 'activity-profile'
    }
    return classes[type] || 'activity-profile'
  }

  const getActivityIconSvg = (type) => {
    const icons = {
      message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      booking: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 7V3M16 7V3M7 11H17M5 21H19C20.1046 21 21 20.1046 21 19V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      profile: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    }
    return icons[type] || icons.profile
  }

  const formatTimeAgo = (dateString) => {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'เมื่อสักครู่'
    if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`
    if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`
    if (diffDays < 7) return `${diffDays} วันที่แล้ว`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} สัปดาห์ที่แล้ว`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} เดือนที่แล้ว`
    return `${Math.floor(diffDays / 365)} ปีที่แล้ว`
  }

  const loadAccountSettings = async () => {
    await loadEmailVerificationStatus()
    setupAccountSettingsListeners()
  }

  const loadEmailVerificationStatus = async () => {
    const statusEl = document.getElementById('emailVerificationStatus')
    if(!statusEl) return

    const token = getAuthToken()
    if(!token){
      statusEl.textContent = 'กรุณาเข้าสู่ระบบอีกครั้ง'
      redirectToHome()
      return
    }

    try {
      const response = await fetch(api('user/profile.php'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if(response.status === 401 || response.status === 403){
        redirectToHome()
        return
      }
      if(!response.ok) throw new Error('Failed to load profile')

      const data = await response.json()
      const userData = data.user || data
      if(userData) {
        const emailVerifiedValue = userData.email_verified ?? userData.email_verified_at ?? userData.verified
        const isVerified = emailVerifiedValue === true || emailVerifiedValue === 'true' || emailVerifiedValue === 1 || emailVerifiedValue === '1'
        profileState.user = { ...profileState.user, ...userData, email_verified: isVerified }
        updateVerificationStatus(isVerified)
      } else {
        statusEl.textContent = 'ไม่สามารถโหลดข้อมูลได้'
      }
    } catch (error) {
      console.error('Error loading verification status:', error)
      statusEl.textContent = 'ไม่สามารถโหลดข้อมูลได้'
    }
  }

  const updateVerificationStatus = (isVerified) => {
    const statusEl = document.getElementById('emailVerificationStatus')
    const badgeEl = document.getElementById('verificationBadge')
    const resendBtn = document.getElementById('resendVerificationBtn')

    if (badgeEl) {
      badgeEl.className = 'verification-badge'
      if (isVerified) {
        badgeEl.classList.add('verified')
        badgeEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      } else {
        badgeEl.classList.add('unverified')
        badgeEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 9V11M12 15H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      }
    }

    if (statusEl) {
      if (isVerified) {
        statusEl.textContent = 'อีเมลของคุณได้รับการยืนยันแล้ว'
        statusEl.style.color = 'var(--profile-success)'
      } else {
        statusEl.textContent = 'กรุณายืนยันอีเมลของคุณเพื่อความปลอดภัย'
        statusEl.style.color = 'var(--profile-warning)'
      }
    }

    if (resendBtn) {
      resendBtn.style.display = isVerified ? 'none' : 'inline-flex'
    }
  }

  const setupAccountSettingsListeners = () => {
    // Resend verification email
    const resendBtn = document.getElementById('resendVerificationBtn')
    if(resendBtn) {
      resendBtn.addEventListener('click', handleResendVerification)
    }

    // Change password button (opens password section)
    const changePasswordBtn = document.getElementById('changePasswordBtn')
    if(changePasswordBtn) {
      changePasswordBtn.addEventListener('click', () => {
        const passwordFieldset = document.getElementById('profilePasswordFieldset')
        const editToggle = document.getElementById('profileEditToggle')
        if(passwordFieldset && editToggle) {
          // Enable edit mode if not already enabled
          if(editToggle.textContent.trim() === 'แก้ไข') {
            editToggle.click()
          }
          // Enable password fields
          passwordFieldset.disabled = false
          const inputs = passwordFieldset.querySelectorAll('input')
          inputs.forEach(input => input.disabled = false)
          // Focus on current password field
          const currentPasswordInput = document.getElementById('profileEditCurrentPassword')
          if(currentPasswordInput) {
            currentPasswordInput.focus()
            currentPasswordInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
      })
    }

    // Logout button in sidebar
    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn')
    if(sidebarLogoutBtn) {
      sidebarLogoutBtn.addEventListener('click', handleLogout)
    }
  }

  const handleResendVerification = async () => {
    const resendBtn = document.getElementById('resendVerificationBtn')
    const originalText = resendBtn.textContent

    try {
      resendBtn.disabled = true
      resendBtn.textContent = 'กำลังส่ง...'

      const response = await fetch(api('request_password_reset.php'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: document.getElementById('profileEmail').textContent.trim(),
          type: 'verification'
        })
      })

      const data = await response.json()

      if(data.success) {
        showNotification('ส่งอีเมลยืนยันใหม่แล้ว กรุณาตรวจสอบกล่องจดหมาย', 'success')
        resendBtn.textContent = 'ส่งแล้ว'
        setTimeout(() => {
          resendBtn.textContent = originalText
          resendBtn.disabled = false
        }, 30000) // Disable for 30 seconds
      } else {
        throw new Error(data.message || 'Failed to resend verification')
      }
    } catch (error) {
      console.error('Error resending verification:', error)
      showNotification('ไม่สามารถส่งอีเมลยืนยันได้ กรุณาลองใหม่อีกครั้ง', 'error')
      resendBtn.textContent = originalText
      resendBtn.disabled = false
    }
  }

  const handleLogout = () => {
    if(confirm('คุณต้องการออกจากระบบหรือไม่?')) {
      // Clear local storage
      localStorage.removeItem('authToken')
      localStorage.removeItem('user')
      // Redirect to home
      window.location.href = 'index.html'
    }
  }

  const setupSidebarNavigation = () => {
    const navLinks = document.querySelectorAll('.nav-link')

    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault()
        const sectionId = link.getAttribute('data-section')
        if (sectionId) {
          switchToSection(sectionId)
        }
      })
    })

    // Handle URL hash on page load
    const hash = window.location.hash.substring(1)
    if (hash && ['overview', 'edit-profile', 'account-settings', 'activity'].includes(hash)) {
      switchToSection(hash)
    }
  }

  const switchToSection = (sectionId) => {
    // Hide all sections
    const sections = document.querySelectorAll('.content-section')
    sections.forEach(section => {
      section.classList.remove('active')
    })

    // Remove active class from all nav links
    const navLinks = document.querySelectorAll('.nav-link')
    navLinks.forEach(link => {
      link.classList.remove('active')
    })

    // Show target section
    const targetSection = document.getElementById(sectionId)
    if (targetSection) {
      targetSection.classList.add('active')
    }

    // Add active class to corresponding nav link
    const targetNavLink = document.querySelector(`[data-section="${sectionId}"]`)
    if (targetNavLink) {
      targetNavLink.classList.add('active')
    }

    // Update URL hash without triggering scroll
    history.replaceState(null, null, `#${sectionId}`)
  }

  document.addEventListener('DOMContentLoaded', () => {
    const userStr = localStorage.getItem('user')
    if(!userStr){
      redirectToHome()
      return
    }
    loadProfile()
    loadRecentActivities()
    loadAccountSettings()
    setupSidebarNavigation()
  })

  document.addEventListener('profile:bookingsLoaded', (event) => {
    const requests = Array.isArray(event.detail) ? event.detail : []
    if(requests.length === 0) return
    const confirmed = requests.filter((req) => (req.status || '').toLowerCase() === 'confirmed')
    if(confirmed.length === 0) return
    const extrasContainer = document.getElementById('profileExtras')
    if(!extrasContainer) return
    let card = extrasContainer.querySelector('[data-section="confirmed-bookings"]')
    if(!card){
      card = document.createElement('article')
      card.className = 'profile-card'
      card.setAttribute('data-section', 'confirmed-bookings')
      card.innerHTML = '<h2>การจองที่ยืนยันแล้ว</h2>'
      extrasContainer.appendChild(card)
    }
    const list = document.createElement('div')
    list.className = 'profile-summary-grid'
    list.innerHTML = confirmed.map((req) => {
      const name = escapeHtml(req.requester_name || req.requester_email || '-')
      const listing = escapeHtml(req.listing_title || '-')
      const confirmedAt = req.updated_at || req.created_at || ''
      const safeConfirmed = escapeHtml(confirmedAt ? formatDateTime(confirmedAt) : '-')
      return `<div class="profile-summary-card"><span>${listing}</span><strong>${name}</strong><small>ยืนยันเมื่อ ${safeConfirmed}</small></div>`
    }).join('')
    const existingGrid = card.querySelector('.profile-summary-grid')
    if(existingGrid){
      existingGrid.replaceWith(list)
    } else {
      card.appendChild(list)
    }
  })
})()
