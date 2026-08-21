(() => {
  const styles = [
    ['/history.css', 'history-ui'],
    ['/history-quota.css', 'history-quota-ui']
  ];
  for (const [href, key] of styles) {
    if (document.querySelector(`link[data-${key}]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(`data-${key}`, 'true');
    document.head.appendChild(link);
  }
})();
