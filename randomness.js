'use strict';
document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-scene]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  document.querySelectorAll('.scene-panel').forEach(panel => { panel.hidden = panel.id !== button.dataset.scene; });
}));
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  document.querySelectorAll('[data-kind]').forEach(row => { row.hidden = button.dataset.filter !== 'all' && row.dataset.kind !== button.dataset.filter; });
}));
const dialog = document.getElementById('audit-source');
let sourcePath = '';
document.querySelectorAll('[data-ref]').forEach(button => button.addEventListener('click', () => {
  const ref = window.SOURCE_REFERENCES[button.dataset.ref];
  sourcePath = `${ref.file}:${ref.line}`;
  document.getElementById('audit-title').textContent = ref.symbol;
  document.getElementById('audit-path').textContent = sourcePath;
  document.getElementById('audit-code').textContent = ref.code;
  document.getElementById('audit-repo').href = ref.url;
  document.getElementById('audit-feedback').textContent = '';
  dialog.showModal();
}));
document.getElementById('close-audit').addEventListener('click', () => dialog.close());
document.getElementById('copy-audit').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(sourcePath); document.getElementById('audit-feedback').textContent = '已复制'; }
  catch { document.getElementById('audit-feedback').textContent = '请选中上方路径复制'; }
});
