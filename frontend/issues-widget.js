(function(global){
  'use strict';

  const DEFAULT_CATEGORIES = [
    { value: 'ทั่วไป', label: 'ทั่วไป' },
    { value: 'การใช้งานระบบ', label: 'การใช้งานระบบ' },
    { value: 'การค้นหาที่พัก', label: 'การค้นหาที่พัก' },
    { value: 'การจอง', label: 'ขั้นตอนการจอง' },
    { value: 'บัญชีและเข้าสู่ระบบ', label: 'บัญชีและเข้าสู่ระบบ' }
  ];

  const STATUS_INFO = {
    new: { label: 'ใหม่', className: 'status-new' },
    in_progress: { label: 'กำลังดำเนินการ', className: 'status-progress' },
    resolved: { label: 'แก้ไขแล้ว', className: 'status-resolved' },
    closed: { label: 'ปิดแล้ว', className: 'status-closed' }
  };

  const PRIORITY_INFO = {
    low: { label: 'ไม่เร่งด่วน', className: 'priority-low' },
    normal: { label: 'ปกติ', className: 'priority-normal' },
    high: { label: 'เร่งด่วน', className: 'priority-high' },
    urgent: { label: 'ด่วนมาก', className: 'priority-urgent' }
  };

  const PRIORITY_OPTIONS = [
    { value: 'low', label: PRIORITY_INFO.low.label },
    { value: 'normal', label: PRIORITY_INFO.normal.label },
    { value: 'high', label: PRIORITY_INFO.high.label },
    { value: 'urgent', label: PRIORITY_INFO.urgent.label }
  ];

  const DEFAULT_OPTIONS = {
    heading: 'แจ้งปัญหา / ติดต่อทีมงาน',
    description: 'ส่งคำถามหรือรายงานปัญหาที่พบในการใช้งานระบบ ทีมงานจะตอบกลับโดยเร็วที่สุด',
    categories: DEFAULT_CATEGORIES,
    allowCategorySelection: true,
    allowPrioritySelection: true,
    defaultCategory: DEFAULT_CATEGORIES[0].value,
    defaultPriority: 'normal',
    submitLabel: 'ส่งคำร้อง',
    emptyMessage: 'ยังไม่พบการแจ้งปัญหา',
    openFirstItem: true,
    context: 'user',
    onLoginRequest: null
  };

  const escapeHtml = (value) => {
    if(value === null || value === undefined) return '';
    return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\'': '&#39;', '"': '&quot;' }[ch]));
  };

  const formatMultiline = (value) => {
    const safe = escapeHtml(value || '');
    return safe.replace(/\r?\n/g, '<br />');
  };

  const formatDateTime = (value) => {
    if(!value) return '-';
    const normalized = typeof value === 'string' && value.includes('T') ? value : String(value).replace(' ', 'T');
    const date = new Date(normalized);
    if(Number.isNaN(date.getTime())) return '-';
    try{
      return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }catch(err){
      return date.toLocaleString('th-TH');
    }
  };

  const ensureApi = () => {
    if(typeof global.phpApi === 'function'){
      return global.phpApi;
    }
    return (endpoint) => {
      const origin = global.location?.origin || '';
      const pathname = global.location?.pathname || '';
      const segments = pathname.split('/').filter(Boolean);
      if(segments.length && segments[segments.length - 1].includes('.')){
        segments.pop();
      }
      if(segments.length && segments[segments.length - 1] === 'frontend'){
        segments.pop();
      }
      const basePath = segments.length ? `/${segments.join('/')}` : '';
      return `${origin}${basePath}/api/${endpoint}`;
    };
  };

  class IssuesWidget {
    constructor(root, options){
      this.root = root;
      this.options = Object.assign({}, DEFAULT_OPTIONS, options || {});
      this.api = ensureApi();
      this.state = {
        token: null,
        isLoading: false,
        isSubmitting: false,
        issues: []
      };

      this.handleAuthChanged = this.handleAuthChanged.bind(this);
      this.handleRefreshClick = this.handleRefreshClick.bind(this);
      this.handleSubmit = this.handleSubmit.bind(this);
      this.handleLoginRequest = this.handleLoginRequest.bind(this);

      this.renderBase();
      this.cacheDom();
      this.bindEvents();
      this.refreshAuthState();
    }

    renderBase(){
      if(!this.root) return;

      const categories = Array.isArray(this.options.categories) ? this.options.categories : [];
      const showCategory = this.options.allowCategorySelection && categories.length > 0;
      const defaultCategory = this.options.defaultCategory && categories.find((item) => item.value === this.options.defaultCategory)
        ? this.options.defaultCategory
        : (categories[0]?.value || 'ทั่วไป');
      const priorityOptions = PRIORITY_OPTIONS.slice();
      const defaultPriority = PRIORITY_INFO[this.options.defaultPriority] ? this.options.defaultPriority : 'normal';

      const categoryOptionsHtml = showCategory
        ? categories.map((item) => `<option value="${escapeHtml(item.value)}"${item.value === defaultCategory ? ' selected' : ''}>${escapeHtml(item.label || item.value)}</option>`).join('')
        : '';

      const priorityOptionsHtml = this.options.allowPrioritySelection
        ? priorityOptions.map((item) => `<option value="${item.value}"${item.value === defaultPriority ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')
        : '';

      const descriptionHtml = this.options.description ? `<p class="issue-widget__subtitle">${escapeHtml(this.options.description)}</p>` : '';

      this.root.innerHTML = `
        <article class="issue-widget" data-context="${escapeHtml(this.options.context)}">
          <header class="issue-widget__header">
            <div class="issue-widget__header-text">
              <h2 class="issue-widget__title">${escapeHtml(this.options.heading)}</h2>
              ${descriptionHtml}
            </div>
            <div class="issue-widget__actions">
              <button type="button" class="iw-btn" data-action="refresh">รีเฟรช</button>
            </div>
          </header>
          <div class="issue-widget__auth" data-role="auth" hidden>
            <div class="issue-widget__auth-inner">
              <h3>เข้าสู่ระบบเพื่อแจ้งปัญหา</h3>
              <p>กรุณาเข้าสู่ระบบก่อนส่งคำร้องหรือดูประวัติการแจ้งปัญหา</p>
              <div class="issue-widget__auth-actions">
                <button type="button" class="iw-btn iw-btn--primary" data-action="login">เข้าสู่ระบบ</button>
                <a href="register.html" class="iw-btn iw-btn--outline" data-action="register">สมัครสมาชิก</a>
              </div>
            </div>
          </div>
          <div class="issue-widget__body" data-role="body">
            <form class="issue-widget__form" novalidate>
              <div class="issue-widget__field">
                <label class="issue-widget__label" for="issueSubject">หัวข้อที่ต้องการแจ้ง</label>
                <input id="issueSubject" name="issueSubject" type="text" class="issue-widget__input" maxlength="250" placeholder="ระบุหัวข้อของปัญหาหรือคำถาม" required />
              </div>
              <div class="issue-widget__field-row">
                ${showCategory ? `
                <div class="issue-widget__field">
                  <label class="issue-widget__label" for="issueCategory">หมวดหมู่</label>
                  <select id="issueCategory" name="issueCategory" class="issue-widget__select">
                    ${categoryOptionsHtml}
                  </select>
                </div>` : ''}
                ${this.options.allowPrioritySelection ? `
                <div class="issue-widget__field">
                  <label class="issue-widget__label" for="issuePriority">ระดับความสำคัญ</label>
                  <select id="issuePriority" name="issuePriority" class="issue-widget__select">
                    ${priorityOptionsHtml}
                  </select>
                </div>` : ''}
              </div>
              <div class="issue-widget__field">
                <label class="issue-widget__label" for="issueMessage">รายละเอียดเพิ่มเติม</label>
                <textarea id="issueMessage" name="issueMessage" class="issue-widget__textarea" rows="5" placeholder="อธิบายปัญหาหรือคำถามที่ต้องการแจ้ง" required></textarea>
              </div>
              <div class="issue-widget__form-footer">
                <button type="submit" class="iw-btn iw-btn--primary" data-role="submit">${escapeHtml(this.options.submitLabel)}</button>
                <span class="issue-widget__form-status" role="status" aria-live="polite"></span>
              </div>
            </form>
            <div class="issue-widget__list-wrapper">
              <div class="issue-widget__list-header">
                <h3>ประวัติการแจ้งปัญหา</h3>
                <p class="issue-widget__list-subtitle">ติดตามสถานะการดำเนินการและการตอบกลับจากทีมงาน</p>
              </div>
              <div class="issue-widget__loading" data-role="loading" hidden>กำลังโหลดข้อมูล...</div>
              <div class="issue-widget__error" data-role="error" hidden></div>
              <div class="issue-widget__empty" data-role="empty">${escapeHtml(this.options.emptyMessage)}</div>
              <div class="issue-widget__list" data-role="list"></div>
            </div>
          </div>
        </article>
      `;
    }

    cacheDom(){
      if(!this.root) return;
      this.wrapper = this.root.querySelector('.issue-widget');
      this.authGate = this.root.querySelector('[data-role="auth"]');
      this.body = this.root.querySelector('[data-role="body"]');
      this.form = this.root.querySelector('.issue-widget__form');
      this.subjectInput = this.root.querySelector('#issueSubject');
      this.categorySelect = this.root.querySelector('#issueCategory');
      this.prioritySelect = this.root.querySelector('#issuePriority');
      this.messageInput = this.root.querySelector('#issueMessage');
      this.submitBtn = this.root.querySelector('[data-role="submit"]');
      this.formStatus = this.root.querySelector('.issue-widget__form-status');
      this.refreshBtn = this.root.querySelector('[data-action="refresh"]');
      this.loginBtn = this.root.querySelector('[data-action="login"]');
      this.registerLink = this.root.querySelector('[data-action="register"]');
      this.listWrapper = this.root.querySelector('.issue-widget__list-wrapper');
      this.loadingEl = this.root.querySelector('[data-role="loading"]');
      this.errorEl = this.root.querySelector('[data-role="error"]');
      this.emptyEl = this.root.querySelector('[data-role="empty"]');
      this.listEl = this.root.querySelector('[data-role="list"]');
    }

    bindEvents(){
      if(!this.root) return;
      document.addEventListener('auth:changed', this.handleAuthChanged);
      if(this.refreshBtn){
        this.refreshBtn.addEventListener('click', this.handleRefreshClick);
      }
      if(this.form){
        this.form.addEventListener('submit', this.handleSubmit);
      }
      if(this.loginBtn){
        this.loginBtn.addEventListener('click', this.handleLoginRequest);
      }
      if(this.registerLink){
        this.registerLink.addEventListener('click', (event) => {
          if(typeof global.openAuthPanel === 'function'){
            event.preventDefault();
            global.openAuthPanel('register');
          }
        });
      }
    }

    unbindEvents(){
      document.removeEventListener('auth:changed', this.handleAuthChanged);
      if(this.refreshBtn){
        this.refreshBtn.removeEventListener('click', this.handleRefreshClick);
      }
      if(this.form){
        this.form.removeEventListener('submit', this.handleSubmit);
      }
      if(this.loginBtn){
        this.loginBtn.removeEventListener('click', this.handleLoginRequest);
      }
    }

    handleLoginRequest(event){
      if(event) event.preventDefault();
      if(typeof this.options.onLoginRequest === 'function'){
        this.options.onLoginRequest();
        return;
      }
      if(typeof global.openAuthPanel === 'function'){
        global.openAuthPanel('login');
      } else {
        global.location.href = 'login.html';
      }
    }

    handleAuthChanged(){
      this.refreshAuthState();
    }

    refreshAuthState({ silent = false } = {}){
      const token = global.localStorage ? global.localStorage.getItem('authToken') : null;
      const loggedIn = Boolean(token);
      this.state.token = token || null;
      this.toggleAuthGate(!loggedIn);
      if(loggedIn){
        this.setFormEnabled(true);
        if(!silent){
          this.loadIssues();
        }
      } else {
        this.setFormEnabled(false);
        this.clearIssues();
      }
    }

    toggleAuthGate(showGate){
      if(this.authGate){
        this.authGate.hidden = !showGate;
      }
      if(this.body){
        this.body.hidden = !!showGate;
      }
    }

    setFormEnabled(enabled){
      const disabled = !enabled;
      if(this.subjectInput) this.subjectInput.disabled = disabled;
      if(this.categorySelect) this.categorySelect.disabled = disabled;
      if(this.prioritySelect) this.prioritySelect.disabled = disabled;
      if(this.messageInput) this.messageInput.disabled = disabled;
      if(this.submitBtn) this.submitBtn.disabled = disabled;
      if(disabled) this.setFormStatus('');
    }

    setFormStatus(message, variant = 'info'){
      if(!this.formStatus) return;
      const text = (message || '').trim();
      this.formStatus.textContent = text;
      this.formStatus.classList.remove('is-success', 'is-error');
      if(text){
        if(variant === 'success'){
          this.formStatus.classList.add('is-success');
        } else if(variant === 'error'){
          this.formStatus.classList.add('is-error');
        }
      }
    }

    handleRefreshClick(event){
      event.preventDefault();
      if(this.state.isLoading) return;
      this.loadIssues();
    }

    async handleSubmit(event){
      event.preventDefault();
      if(this.state.isSubmitting) return;
      if(!this.state.token){
        this.toggleAuthGate(true);
        this.setFormEnabled(false);
        return;
      }

      const subject = (this.subjectInput?.value || '').trim();
      const message = (this.messageInput?.value || '').trim();
      const category = this.categorySelect ? (this.categorySelect.value || 'ทั่วไป') : 'ทั่วไป';
      const priority = this.prioritySelect ? (this.prioritySelect.value || 'normal') : 'normal';

      if(subject === '' || message === ''){
        this.setFormStatus('กรุณากรอกหัวข้อและรายละเอียดให้ครบถ้วน', 'error');
        return;
      }

      this.state.isSubmitting = true;
      if(this.submitBtn){
        this.submitBtn.disabled = true;
        this.submitBtn.textContent = 'กำลังส่ง...';
      }
      this.setFormStatus('กำลังส่งคำร้อง...', 'info');

      try{
        const response = await fetch(this.api('issues/create.php'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.state.token
          },
          body: JSON.stringify({
            subject,
            message,
            category,
            priority
          })
        });

        if(response.status === 401){
          this.handleUnauthorized();
          return;
        }

        const data = await response.json().catch(() => null);
        if(!response.ok || !data?.success){
          const errorMessage = data?.error || 'ไม่สามารถส่งคำร้องได้ กรุณาลองใหม่อีกครั้ง';
          this.setFormStatus(errorMessage, 'error');
          return;
        }

        if(this.form){
          this.form.reset();
        }
        this.setFormStatus('ส่งคำร้องเรียบร้อยแล้ว ทีมงานจะติดต่อกลับโดยเร็วที่สุด', 'success');
        this.loadIssues();
      }catch(err){
        console.error('issue submit error', err);
        this.setFormStatus('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง', 'error');
      }finally{
        this.state.isSubmitting = false;
        if(this.submitBtn){
          this.submitBtn.disabled = false;
          this.submitBtn.textContent = this.options.submitLabel;
        }
      }
    }

    async loadIssues(){
      if(!this.state.token){
        this.toggleAuthGate(true);
        return;
      }
      this.state.isLoading = true;
      this.showLoading(true);
      this.showError('');
      try{
        const response = await fetch(this.api('issues/list.php'), {
          headers: {
            'Authorization': 'Bearer ' + this.state.token
          }
        });
        if(response.status === 401){
          this.handleUnauthorized();
          return;
        }
        const data = await response.json().catch(() => null);
        const issues = Array.isArray(data?.issues) ? data.issues : [];
        this.state.issues = issues;
        this.renderIssues();
      }catch(err){
        console.error('load issues error', err);
        this.showError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        this.clearIssues({ preserveState: true });
      }finally{
        this.state.isLoading = false;
        this.showLoading(false);
      }
    }

    handleUnauthorized(){
      this.state.token = null;
      if(global.localStorage){
        global.localStorage.removeItem('authToken');
        global.localStorage.removeItem('user');
      }
      this.setFormStatus('เซสชันหมดเวลา กรุณาเข้าสู่ระบบอีกครั้ง', 'error');
      this.toggleAuthGate(true);
      this.setFormEnabled(false);
      this.clearIssues();
      try{
        document.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: null } }));
      }catch(err){
        console.warn('issue widget auth dispatch failed', err);
      }
    }

    showLoading(visible){
      if(this.loadingEl){
        this.loadingEl.hidden = !visible;
      }
    }

    showError(message){
      if(!this.errorEl) return;
      const text = (message || '').trim();
      this.errorEl.textContent = text;
      this.errorEl.hidden = text === '';
      if(text){
        this.emptyEl.hidden = true;
      }
    }

    clearIssues({ preserveState = false } = {}){
      if(!preserveState){
        this.state.issues = [];
      }
      this.renderIssues();
    }

    renderIssues(){
      if(!this.listEl || !this.emptyEl) return;
      const issues = Array.isArray(this.state.issues) ? this.state.issues : [];
      if(issues.length === 0){
        this.listEl.innerHTML = '';
        this.emptyEl.hidden = false;
        return;
      }
      this.emptyEl.hidden = true;

      const itemsHtml = issues.map((issue, index) => {
        const statusInfo = STATUS_INFO[issue.status] || STATUS_INFO.new;
        const priorityInfo = PRIORITY_INFO[issue.priority] || PRIORITY_INFO.normal;
        const replies = Array.isArray(issue.replies) ? issue.replies : [];
        const expanded = this.options.openFirstItem && index === 0;
        const replyHtml = replies.length
          ? replies.map((reply) => `
              <div class="issue-widget__reply">
                <div class="issue-widget__reply-meta">
                  <span class="issue-widget__reply-author">${escapeHtml(reply.responder_name || 'ทีมงาน')}</span>
                  <span class="issue-widget__reply-time">${formatDateTime(reply.created_at)}</span>
                </div>
                <div class="issue-widget__reply-text">${formatMultiline(reply.message)}</div>
              </div>
            `).join('')
          : '<div class="issue-widget__no-reply">รอการตอบกลับจากทีมงาน</div>';
        return `
          <article class="issue-widget__item" data-issue-id="${issue.id}" data-expanded="${expanded ? 'true' : 'false'}">
            <header class="issue-widget__item-header">
              <div class="issue-widget__item-info">
                <h4 class="issue-widget__item-title">${escapeHtml(issue.subject || 'ไม่ระบุหัวข้อ')}</h4>
                <div class="issue-widget__item-meta">
                  <span class="issue-widget__status-badge ${statusInfo.className}">${statusInfo.label}</span>
                  <span class="issue-widget__priority-badge ${priorityInfo.className}">${priorityInfo.label}</span>
                  <span class="issue-widget__meta-chip">หมวดหมู่: ${escapeHtml(issue.category || '-')}</span>
                  <span class="issue-widget__meta-chip">อัปเดต: ${formatDateTime(issue.updated_at || issue.created_at)}</span>
                </div>
              </div>
              <button type="button" class="issue-widget__item-toggle" aria-expanded="${expanded ? 'true' : 'false'}" title="แสดงรายละเอียด"></button>
            </header>
            <div class="issue-widget__item-body">
              <div class="issue-widget__message" role="presentation">${formatMultiline(issue.message)}</div>
              <div class="issue-widget__timeline">
                <div class="issue-widget__timeline-label">การตอบกลับ</div>
                <div class="issue-widget__replies">${replyHtml}</div>
              </div>
            </div>
          </article>
        `;
      }).join('');

      this.listEl.innerHTML = itemsHtml;
      this.bindItemToggles();
    }

    bindItemToggles(){
      if(!this.listEl) return;
      const items = Array.from(this.listEl.querySelectorAll('.issue-widget__item'));
      items.forEach((item) => {
        const toggleBtn = item.querySelector('.issue-widget__item-toggle');
        if(!toggleBtn) return;
        toggleBtn.addEventListener('click', () => {
          const expanded = item.getAttribute('data-expanded') === 'true';
          const nextState = !expanded;
          item.setAttribute('data-expanded', nextState ? 'true' : 'false');
          toggleBtn.setAttribute('aria-expanded', nextState ? 'true' : 'false');
        });
      });
    }

    destroy(){
      this.unbindEvents();
      if(this.root){
        this.root.innerHTML = '';
      }
    }

    reload(){
      this.refreshAuthState();
    }
  }

  function createIssuesWidget(root, options){
    if(!root) return null;
    const widget = new IssuesWidget(root, options);
    return {
      reload: () => widget.reload(),
      destroy: () => widget.destroy(),
      getState: () => Object.assign({}, widget.state)
    };
  }

  global.createIssuesWidget = createIssuesWidget;
})(typeof window !== 'undefined' ? window : this);
