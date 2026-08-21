import '/master-validation-bootstrap.js';

document.addEventListener('click', (event) => {
  const nav = event.target.closest?.('[data-view="masters"]');
  if (!nav) return;
  setTimeout(() => document.getElementById('masterArticleRefreshButton')?.click(), 0);
});