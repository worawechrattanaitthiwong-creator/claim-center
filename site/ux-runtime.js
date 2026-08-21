const ux = {
  saveActive: false,
  saveFailed: false,
  saveTotal: 0,
  saveDone: 0,
  saveButtonLabel: '',
  suppressResetConfirm: false,
  freshDraft: true,
  canceling: false
};

const CLAIM_FIELD_IDS = [
  'claimReason','claimReplyDate','claimStatus','claimWho','claimCauseGroup',
  'claimRootCause','claimCheck','claimRemarkList','claimSc','claimCompleteSc','claimRemark'
];
const REQUIRED_CLAIM_FIELDS = [
  ['claimReplyDate','Ship Date'],
  ['claimStatus','Update status'],
  ['claimWho','WHO'],
  ['claimRootCause','ROOT CAUSE'],
  ['claimCheck','Check']
];

const previousFetch = window.fetch.bind(window);
window.fetch = async function uxFetch(input, init = {}) {
  let url = null;
  try { url = new URL(typeof input === 'string' ? input : input.url, location.href); } catch {}
  const method = String(init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
  const isClaimSave = url?.pathname === '/api/claims/bulk' && method === 'POST';
  let batchSize = 0;
  if (isClaimSave && ux.saveActive && typeof init.body === 'string') {
    try { batchSize = JSON.parse(init.body)?.rows?.length || 0; } catch {}
    updateSaveProgress('sending');
  }
  try {
    const response = await previousFetch(input, init);
    if (isClaimSave && ux.saveActive) {
      if (response.ok) {
        ux.saveDone = Math.min(ux.saveTotal || Number.MAX_SAFE_INTEGER, ux.saveDone + batchSize);
        updateSaveProgress('saved');
      } else {
        ux.saveFailed = true;
      }
    }
    return response;
  } catch (error) {
    if (isClaimSave && ux.saveActive) ux.saveFailed = true;
    throw error;
  }
};

document.addEventListener('DOMContentLoaded', initUx);

function initUx() {
  injectUxStyles();
  enhanceClaimWorkspace();
  installClaimGuards();
  installDirtyTracking();
  installBusyLifecycle();
  installKeyboardShortcuts();
  installMetaFreshnessGuard();
  updateDraftIndicator();
}

function enhanceClaimWorkspace() {
  const reset = document.querySelector('#resetClaim');
  if (reset) {
    reset.textContent = '＋ เคสใหม่';
    reset.title = 'ล้างข้อมูลเคสปัจจุบันและเริ่มเคสใหม่';
  }

  const saveStrip = document.querySelector('.save-strip');
  const save = document.querySelector('#saveClaim');
  if (saveStrip && save && !document.querySelector('#cancelClaim')) {
    const actions = document.createElement('div');
    actions.className = 'ux-save-actions';
    const cancel = document.createElement('button');
    cancel.id = 'cancelClaim';
    cancel.type = 'button';
    cancel.className = 'btn ghost';
    cancel.textContent = 'ยกเลิก';
    cancel.title = 'ยกเลิกและล้างข้อมูลเคสนี้';
    save.parentNode.insertBefore(actions, save);
    actions.append(cancel, save);
    cancel.addEventListener('click', cancelCurrentClaim);
  }

  const editor = document.querySelector('#claimEditor');
  if (editor && !document.querySelector('#claimDraftIndicator')) {
    const indicator = document.createElement('div');
    indicator.id = 'claimDraftIndicator';
    indicator.className = 'ux-draft-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = '<i></i><strong>พร้อมกรอกข้อมูล</strong><span>ระบบจะล้างฟอร์มอัตโนมัติหลังบันทึกสำเร็จ</span>';
    const meta = document.querySelector('#ccdMetaStrip');
    (meta || editor.querySelector('.panel-head'))?.insertAdjacentElement('afterend', indicator);
  }

  const saveSummary = document.querySelector('.save-strip > div');
  if (saveSummary && !document.querySelector('#claimSaveHint')) {
    const hint = document.createElement('small');
    hint.id = 'claimSaveHint';
    hint.className = 'ux-save-hint';
    hint.textContent = 'ตรวจสอบข้อมูลให้ครบก่อนบันทึก · Ctrl+Enter เพื่อบันทึก';
    saveSummary.appendChild(hint);
  }
}

function installClaimGuards() {
  document.addEventListener('click', event => {
    const reset = event.target.closest?.('#resetClaim');
    if (reset && !ux.suppressResetConfirm && isClaimDirty()) {
      const ok = window.confirm('มีข้อมูลในเคสนี้ที่ยังไม่ได้บันทึก\n\nต้องการล้างข้อมูลทั้งหมดและเริ่มเคสใหม่ใช่หรือไม่?');
      if (!ok) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
    }

    const save = event.target.closest?.('#saveClaim');
    if (save) {
      if (ux.saveActive) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      const invalid = validateClaimForm();
      if (invalid) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      startSaveLifecycle();
    }
  }, true);

  document.querySelector('#resetClaim')?.addEventListener('click', () => {
    setTimeout(() => {
      clearClaimUi({ focus: true });
      if (!ux.canceling) showUxToast('เริ่มเคสใหม่แล้ว', 'ล้างข้อมูลเคสเดิมเรียบร้อย');
    }, 0);
  });

  window.addEventListener('beforeunload', event => {
    if (!ux.saveActive && isClaimDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

function installDirtyTracking() {
  const root = document.querySelector('#page-create');
  if (!root) return;
  root.addEventListener('input', event => {
    clearInvalid(event.target);
    updateDraftIndicator();
  });
  root.addEventListener('change', event => {
    clearInvalid(event.target);
    updateDraftIndicator();
  });

  const editor = document.querySelector('#claimEditor');
  if (editor) {
    new MutationObserver(() => updateDraftIndicator()).observe(editor, {
      attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true
    });
  }
}

function installBusyLifecycle() {
  const busy = document.querySelector('#busy');
  if (!busy) return;
  new MutationObserver(() => {
    if (!ux.saveActive || !busy.hidden) return;
    const editorHidden = Boolean(document.querySelector('#claimEditor')?.hidden);
    if (!ux.saveFailed && editorHidden) {
      clearClaimUi({ focus: false });
      setTimeout(() => clearClaimMeta(), 30);
    }
    finishSaveLifecycle(!ux.saveFailed && editorHidden);
  }).observe(busy, { attributes: true, attributeFilter: ['hidden'] });
}

function installKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      const create = document.querySelector('#page-create.active');
      const editor = document.querySelector('#claimEditor');
      const save = document.querySelector('#saveClaim');
      if (create && editor && !editor.hidden && save && !ux.saveActive) {
        event.preventDefault();
        save.click();
      }
    }
  });
}

function installMetaFreshnessGuard() {
  const body = document.querySelector('#claimPreviewBody');
  if (!body) return;
  new MutationObserver(() => {
    if (String(document.querySelector('#editMode')?.textContent || '').trim().toUpperCase() !== 'NEW') return;
    if (!ux.freshDraft) return;
    setTimeout(() => {
      const rows = body.querySelectorAll('tr').length;
      if (!rows) return;
      setText('#ccdMetaClaim', 'สร้างอัตโนมัติหลังบันทึก');
      const status = document.querySelector('#claimStatus')?.value || '';
      const who = document.querySelector('#claimWho')?.value || '';
      setText('#ccdMetaReference', status === 'Accept' && ['DC','TP'].includes(who) ? 'สร้างอัตโนมัติหลังบันทึก' : '-');
    }, 0);
  }).observe(body, { childList: true, subtree: true });
}

function cancelCurrentClaim() {
  if (isClaimDirty()) {
    const ok = window.confirm('ยกเลิกเคสนี้และล้างข้อมูลที่กรอกทั้งหมดใช่หรือไม่?\n\nข้อมูลที่ยังไม่ได้บันทึกจะไม่สามารถกู้คืนได้');
    if (!ok) return;
  }
  ux.canceling = true;
  ux.suppressResetConfirm = true;
  document.querySelector('#resetClaim')?.click();
  ux.suppressResetConfirm = false;
  ux.canceling = false;
  showUxToast('ยกเลิกเคสแล้ว', 'ข้อมูลที่ยังไม่ได้บันทึกถูกล้างเรียบร้อย');
}

function validateClaimForm() {
  const rows = document.querySelectorAll('#claimPreviewBody tr').length;
  if (!rows) {
    showUxToast('ยังไม่มีรายการสินค้า', 'กรุณานำเข้าข้อมูลและตรวจสอบ Preview ก่อนบันทึก', 'error');
    return true;
  }
  const missing = [];
  for (const [id, label] of REQUIRED_CLAIM_FIELDS) {
    const el = document.getElementById(id);
    if (!String(el?.value || '').trim()) {
      missing.push(label);
      markInvalid(el);
    }
  }
  if (missing.length) {
    const first = document.querySelector('.ux-invalid');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first?.focus({ preventScroll: true });
    showUxToast('ข้อมูลยังไม่ครบ', `กรุณาระบุ ${missing.join(', ')}`, 'error');
    return true;
  }
  return false;
}

function startSaveLifecycle() {
  const save = document.querySelector('#saveClaim');
  ux.saveActive = true;
  ux.saveFailed = false;
  ux.saveDone = 0;
  ux.saveTotal = document.querySelectorAll('#claimPreviewBody tr').length;
  ux.saveButtonLabel = save?.textContent || 'บันทึกข้อมูล ✓';
  ux.freshDraft = false;
  if (save) {
    save.classList.add('is-loading');
    save.setAttribute('aria-busy', 'true');
    save.textContent = `กำลังบันทึก 0/${ux.saveTotal}`;
    setTimeout(() => { if (ux.saveActive) save.disabled = true; }, 0);
  }
  setDraftState('saving', 'กำลังบันทึกข้อมูล', 'กรุณารอสักครู่ ระบบจะรีเฟรชข้อมูลให้อัตโนมัติ');
}

function finishSaveLifecycle(success) {
  const save = document.querySelector('#saveClaim');
  if (save) {
    save.disabled = false;
    save.classList.remove('is-loading');
    save.removeAttribute('aria-busy');
    save.textContent = ux.saveButtonLabel || 'บันทึกข้อมูล ✓';
  }
  ux.saveActive = false;
  ux.saveFailed = false;
  ux.saveDone = 0;
  ux.saveTotal = 0;
  if (success) {
    ux.freshDraft = true;
    setDraftState('clean', 'บันทึกแล้ว', 'ฟอร์มถูกล้างและข้อมูลล่าสุดถูกโหลดใหม่แล้ว');
  } else {
    setDraftState('dirty', 'ยังไม่ได้บันทึก', 'ข้อมูลของคุณยังอยู่ครบ กรุณาแก้จุดที่แจ้งแล้วลองอีกครั้ง');
  }
}

function updateSaveProgress(stage) {
  if (!ux.saveActive) return;
  const done = Math.min(ux.saveDone, ux.saveTotal);
  const save = document.querySelector('#saveClaim');
  const busyText = document.querySelector('#busyText');
  if (save) save.textContent = `กำลังบันทึก ${done}/${ux.saveTotal}`;
  if (busyText) busyText.textContent = stage === 'saved'
    ? `บันทึกแล้ว ${done} / ${ux.saveTotal} รายการ · กำลังอัปเดตหน้าจอ`
    : `กำลังบันทึก ${done} / ${ux.saveTotal} รายการ`;
}

function clearClaimUi({ focus = false } = {}) {
  const paste = document.querySelector('#claimPaste');
  if (paste) paste.value = '';
  setText('#pasteCount', '0 rows');
  for (const id of CLAIM_FIELD_IDS) {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      clearInvalid(el);
    }
  }
  const bypass = document.querySelector('#bypassDate');
  if (bypass) bypass.checked = false;
  const body = document.querySelector('#claimPreviewBody');
  if (body) body.innerHTML = '';
  setText('#claimSummary', '0 รายการ · ฿0');
  const editor = document.querySelector('#claimEditor');
  if (editor) editor.hidden = true;
  setText('#claimEditorTitle', 'สร้างรายการเคลม');
  setText('#editMode', 'NEW');
  clearClaimMeta();
  ux.freshDraft = true;
  updateDraftIndicator();
  if (focus) setTimeout(() => paste?.focus(), 20);
}

function clearClaimMeta() {
  setText('#ccdMetaTransport', '-');
  setText('#ccdMetaFormat', '-');
  setText('#ccdMetaClaim', 'สร้างอัตโนมัติหลังบันทึก');
  setText('#ccdMetaReference', '-');
}

function isClaimDirty() {
  const paste = String(document.querySelector('#claimPaste')?.value || '').trim();
  const rows = document.querySelectorAll('#claimPreviewBody tr').length;
  const fieldValue = CLAIM_FIELD_IDS.some(id => String(document.getElementById(id)?.value || '').trim());
  return Boolean(paste || rows || fieldValue);
}

function updateDraftIndicator() {
  if (ux.saveActive) return;
  if (isClaimDirty()) setDraftState('dirty', 'มีข้อมูลยังไม่บันทึก', 'บันทึก, ยกเลิก หรือเริ่มเคสใหม่ได้โดยไม่ต้อง Refresh หน้าเว็บ');
  else setDraftState('clean', 'พร้อมรับเคสใหม่', 'วางข้อมูลจาก Excel แล้วดำเนินการต่อได้ทันที');
}

function setDraftState(kind, title, detail) {
  const indicator = document.querySelector('#claimDraftIndicator');
  if (!indicator) return;
  indicator.dataset.state = kind;
  const strong = indicator.querySelector('strong');
  const span = indicator.querySelector('span');
  if (strong) strong.textContent = title;
  if (span) span.textContent = detail;
}

function markInvalid(el) {
  if (!el) return;
  el.classList.add('ux-invalid');
  el.setAttribute('aria-invalid', 'true');
}
function clearInvalid(el) {
  if (!el?.classList?.contains('ux-invalid')) return;
  el.classList.remove('ux-invalid');
  el.removeAttribute('aria-invalid');
}

function showUxToast(title, message = '', type = 'success') {
  const host = document.querySelector('#toastHost');
  if (!host) return;
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.setAttribute('role', type === 'error' ? 'alert' : 'status');
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ''}`;
  host.appendChild(item);
  setTimeout(() => item.remove(), 4500);
}

function injectUxStyles() {
  if (document.querySelector('#claimUxRuntimeStyles')) return;
  const style = document.createElement('style');
  style.id = 'claimUxRuntimeStyles';
  style.textContent = `
    .ux-draft-indicator{display:flex;align-items:center;gap:9px;margin:0 0 16px;padding:10px 13px;border:1px solid var(--line,#dbe4f0);border-radius:12px;background:var(--surface,#fff);font-size:12px;color:var(--muted,#64748b);transition:.18s ease}
    .ux-draft-indicator i{width:8px;height:8px;border-radius:50%;background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.12)}
    .ux-draft-indicator strong{color:var(--text,#0f172a);white-space:nowrap}
    .ux-draft-indicator[data-state="dirty"]{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.055)}
    .ux-draft-indicator[data-state="dirty"] i{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.12)}
    .ux-draft-indicator[data-state="saving"]{border-color:rgba(79,70,229,.34);background:rgba(79,70,229,.055)}
    .ux-draft-indicator[data-state="saving"] i{background:#4f46e5;box-shadow:0 0 0 4px rgba(79,70,229,.12);animation:uxPulse 1s ease-in-out infinite}
    .ux-draft-indicator[data-state="clean"] i{background:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,.12)}
    .ux-save-actions{display:flex;align-items:center;gap:10px;margin-left:auto}
    .ux-save-actions #saveClaim{min-width:150px}
    .ux-save-hint{display:block;margin-top:3px;color:var(--muted,#64748b);font-size:11px}
    #saveClaim.is-loading{cursor:wait;opacity:.86}
    .ux-invalid{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.10)!important}
    .save-strip{position:sticky;bottom:12px;z-index:8;backdrop-filter:blur(12px);box-shadow:0 12px 35px rgba(15,23,42,.10)}
    @keyframes uxPulse{50%{opacity:.45;transform:scale(.86)}}
    @media(max-width:760px){.ux-draft-indicator{align-items:flex-start;flex-wrap:wrap}.ux-draft-indicator span{width:100%;padding-left:17px}.ux-save-actions{width:100%;margin-left:0}.ux-save-actions .btn{flex:1}.save-strip{bottom:6px;flex-wrap:wrap}}
  `;
  document.head.appendChild(style);
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
}
