import './app-core.js';

// UI-only patch: mirror Master Article batch progress into the full-screen busy overlay.
document.addEventListener('DOMContentLoaded', () => {
  const busy = document.querySelector('#busy');
  const busyText = document.querySelector('#busyText');
  const progressText = document.querySelector('#masterProgressText');
  const masterFileName = document.querySelector('#masterFileName');
  const replaceButton = document.querySelector('#replaceMaster');
  if (!busy || !busyText || !progressText) return;

  const fmt = new Intl.NumberFormat('th-TH');
  const syncProgress = () => {
    if (busy.hidden) return;
    const match = String(progressText.textContent || '').match(/Uploading\s+([\d,]+)\s*\/\s*([\d,]+)/i);
    if (!match) return;
    const done = Number(match[1].replaceAll(',', '')) || 0;
    const total = Number(match[2].replaceAll(',', '')) || 0;
    const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    busyText.textContent = `กำลังอัปโหลด Master Article · ${fmt.format(done)} / ${fmt.format(total)} (${pct}%)`;
  };

  new MutationObserver(syncProgress).observe(progressText, { childList: true, characterData: true, subtree: true });

  if (replaceButton) {
    replaceButton.addEventListener('click', () => {
      setTimeout(() => {
        if (busy.hidden) return;
        const match = String(masterFileName?.textContent || '').match(/([\d,]+)\s*rows/i);
        if (!match) return;
        const total = Number(match[1].replaceAll(',', '')) || 0;
        if (total > 0 && !/\d+\s*\/\s*\d+/.test(busyText.textContent || '')) {
          busyText.textContent = `กำลังเตรียมอัปโหลด Master Article · 0 / ${fmt.format(total)} (0%)`;
        }
      }, 0);
    }, true);
  }
});
