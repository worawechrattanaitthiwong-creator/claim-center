from pathlib import Path

v8 = Path('site/v8.js')
s = v8.read_text()
old_login = """    const obs = new MutationObserver(() => {\n      if (!/ไม่สามารถ/.test(loginBuild.textContent)) loginBuild.textContent = 'พร้อมใช้งาน';\n    });\n    obs.observe(loginBuild, { childList:true, characterData:true, subtree:true });\n    setTimeout(() => { if (!/ไม่สามารถ/.test(loginBuild.textContent)) loginBuild.textContent='พร้อมใช้งาน'; }, 300);"""
new_login = """    const syncLoginBuild = () => {\n      const current = loginBuild.textContent || '';\n      if (/ไม่สามารถ/.test(current)) return;\n      if (current !== 'พร้อมใช้งาน') loginBuild.textContent = 'พร้อมใช้งาน';\n    };\n    const obs = new MutationObserver(syncLoginBuild);\n    obs.observe(loginBuild, { childList:true, characterData:true, subtree:true });\n    setTimeout(syncLoginBuild, 300);"""
if old_login in s:
    s = s.replace(old_login, new_login, 1)
elif new_login not in s:
    raise SystemExit('login observer pattern not found')

old_export = """    new MutationObserver(() => {\n      preview.textContent = preview.textContent.replace(/\\s*·\\s*43 columns/gi, '');\n    }).observe(preview, { childList:true, characterData:true, subtree:true });"""
new_export = """    const scrubPreview = () => {\n      const before = preview.textContent || '';\n      const after = before.replace(/\\s*·\\s*43 columns/gi, '');\n      if (after !== before) preview.textContent = after;\n    };\n    new MutationObserver(scrubPreview).observe(preview, { childList:true, characterData:true, subtree:true });"""
if old_export in s:
    s = s.replace(old_export, new_export, 1)
elif new_export not in s:
    raise SystemExit('export observer pattern not found')
v8.write_text(s)

compat = Path('site/v8-compat.js')
s = compat.read_text()
old_select = """function setSelectOptions(el, category, fallback=[], defaultValue='') {\n  if (!el) return;\n  const old = el.value;\n  const values = optionValues(category);\n  const list = values.length ? values : fallback;\n  el.innerHTML = '<option value=\"\">— เลือก —</option>' + list.map(v => `<option value=\"${escHtml(v)}\">${escHtml(v)}</option>`).join('');\n  if (old && list.includes(old)) el.value = old;\n  else if (defaultValue && list.includes(defaultValue)) el.value = defaultValue;\n}"""
new_select = """function setSelectOptions(el, category, fallback=[], defaultValue='') {\n  if (!el) return;\n  const old = el.value;\n  const values = optionValues(category);\n  const list = values.length ? values : fallback;\n  const desiredValues = ['', ...list.map(String)];\n  const currentValues = [...el.options].map(option => option.value);\n  const sameOptions = currentValues.length === desiredValues.length && currentValues.every((value, index) => value === desiredValues[index]);\n  if (!sameOptions) {\n    el.innerHTML = '<option value=\"\">— เลือก —</option>' + list.map(v => `<option value=\"${escHtml(v)}\">${escHtml(v)}</option>`).join('');\n  }\n  if (old && list.includes(old)) el.value = old;\n  else if (defaultValue && list.includes(defaultValue)) el.value = defaultValue;\n}"""
if old_select in s:
    s = s.replace(old_select, new_select, 1)
elif new_select not in s:
    raise SystemExit('setSelectOptions pattern not found')

old_observers = """  const rows = q('#decisionRows');\n  if (rows) new MutationObserver(() => {\n    syncVisibleDropdowns();\n    updateLegacySummary();\n  }).observe(rows, { childList:true, subtree:true });\n\n  const detail = q('#detailFields');\n  if (detail) new MutationObserver(() => syncVisibleDropdowns()).observe(detail, { childList:true, subtree:true });\n\n  const storeItems = q('#storeItemRows');\n  if (storeItems) new MutationObserver(() => syncVisibleDropdowns()).observe(storeItems, { childList:true, subtree:true });"""
new_observers = """  const observeDropdownContainer = (element, afterSync=null) => {\n    if (!element) return;\n    const options = { childList:true, subtree:true };\n    const observer = new MutationObserver(() => {\n      observer.disconnect();\n      try {\n        syncVisibleDropdowns();\n        if (afterSync) afterSync();\n      } finally {\n        observer.observe(element, options);\n      }\n    });\n    observer.observe(element, options);\n  };\n\n  observeDropdownContainer(q('#decisionRows'), updateLegacySummary);\n  observeDropdownContainer(q('#detailFields'));\n  observeDropdownContainer(q('#storeItemRows'));"""
if old_observers in s:
    s = s.replace(old_observers, new_observers, 1)
elif new_observers not in s:
    raise SystemExit('compat observer pattern not found')
compat.write_text(s)

runtime = Path('worker/v8-runtime.js')
s = runtime.read_text()
s = s.replace('/v8-compat.js?v=20260822-login2', '/v8-compat.js?v=20260822-observerfix1')
s = s.replace('/v8.js?v=20260822-loginfix1', '/v8.js?v=20260822-observerfix1')
runtime.write_text(s)

legacy_contract = Path('test/login-freeze-contract.mjs')
if legacy_contract.exists():
    s = legacy_contract.read_text()
    s = s.replace("runtime.includes('20260822-loginfix1')", "runtime.includes('20260822-observerfix1')")
    s = s.replace("runtime.includes('20260822-login2')", "runtime.includes('20260822-observerfix1')")
    legacy_contract.write_text(s)

Path('test/observer-loop-contract.mjs').write_text("""import fs from 'node:fs';\nconst v8 = fs.readFileSync('site/v8.js','utf8');\nconst compat = fs.readFileSync('site/v8-compat.js','utf8');\nconst runtime = fs.readFileSync('worker/v8-runtime.js','utf8');\nconst checks = [\n['login guarded', v8.includes(\"if (current !== 'พร้อมใช้งาน') loginBuild.textContent = 'พร้อมใช้งาน';\")],\n['old login loop removed', !v8.includes(\"if (!/ไม่สามารถ/.test(loginBuild.textContent)) loginBuild.textContent = 'พร้อมใช้งาน';\")],\n['export guarded', v8.includes('if (after !== before) preview.textContent = after;')],\n['old export loop removed', !v8.includes('preview.textContent = preview.textContent.replace')],\n['options idempotent', compat.includes('const sameOptions = currentValues.length === desiredValues.length') && compat.includes('if (!sameOptions)')],\n['observer disconnects', compat.includes('observer.disconnect();') && compat.includes('observeDropdownContainer')],\n['cache bust current', runtime.includes('20260822-observerfix1')]\n];\nfor (const [name, ok] of checks) { if (!ok) { console.error('FAIL:', name); process.exitCode=1; } else console.log('PASS:', name); }\n""")

pkg = Path('package.json')
p = pkg.read_text()
if 'observer-loop-contract' not in p:
    needle = 'node test/latest-command-contract.mjs'
    if needle not in p:
        raise SystemExit('package test pattern not found')
    pkg.write_text(p.replace(needle, needle + ' && node test/observer-loop-contract.mjs', 1))
