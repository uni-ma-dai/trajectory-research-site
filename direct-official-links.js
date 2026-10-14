// Public report: code entries are ordinary links, with no intermediate dialog.
(() => {
  function convertEntries() {
    document.querySelectorAll('button[data-ref],button[data-source-ref],button[data-file]').forEach(button => {
      const refs = window.SOURCE_REFERENCES || {};
      const key = button.dataset.ref || button.dataset.sourceRef;
      const ref = key ? refs[key] : Object.values(refs).find(r => r.file === button.dataset.file);
      if (!ref) return;
      if (!ref.verified_symbol) {
        button.disabled = true;
        button.title = '本地实验扩展：官方仓库没有对应函数';
        if (!button.dataset.localLabel) {
          button.append(document.createTextNode(' · 本地扩展'));
          button.dataset.localLabel = 'true';
        }
        return;
      }
      const link = document.createElement('a');
      link.className = button.className + ' official-code-link';
      link.href = key ? ref.url : ref.url.split('#')[0];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = key ? `官方代码：${ref.symbol}，第 ${ref.line}–${ref.end_line} 行` : '打开官方源码文件';
      link.style.textDecoration = 'none';
      link.style.color = 'inherit';
      while (button.firstChild) link.append(button.firstChild);
      button.replaceWith(link);
    });
  }
  convertEntries();
  const observer = new MutationObserver(() => {
    observer.disconnect();
    convertEntries();
    observer.observe(document.body, {childList: true, subtree: true});
  });
  observer.observe(document.body, {childList: true, subtree: true});
})();
