/* Precomputed model attention, never generated heuristically in the browser. */
'use strict';
const attentionControls = document.createElement('div');
attentionControls.className = 'attention-controls';
attentionControls.innerHTML = `<label><input id="attention-toggle" type="checkbox"> 叠加模型注意力</label><label>叠加强度 <input id="attention-opacity" type="range" min="0" max="1" step="0.05" value="0.65"></label><p id="attention-status" role="status"></p><details><summary>这张图表示什么？</summary><p>动作 token 对图像 patch 的 softmax 注意力：平均 50 个预测动作、所有注意力头、18 层及 10 次去噪。原始网格 16 × 16，插值只用于显示，不代表像素级精度。</p><p>黄色 → 红色表示权重增加；同一次观测的三路相机共用最大值归一化，不可直接跨观测比较颜色。原图叠加已去除模型输入上下各 28 像素的 padding。注意力属于被选中的观测，不会随后续视频帧重新计算。</p><p>这些是用保存的输入、随机状态和同一 checkpoint 离线重放所得，不是原运行中保存的注意力；网页不会加载模型实时推理。注意力权重不等于因果重要性，也不是目标检测。<a href="https://aclanthology.org/N19-1357/" target="_blank" rel="noopener">解释边界 ↗</a></p></details>`;
document.querySelector('.camera-thumbs').before(attentionControls);
for (const kind of ['raw', 'model']) {
  const base = document.getElementById(`${kind}-image`);
  const wrapper = document.createElement('div'); wrapper.className = 'attention-image';
  base.before(wrapper); wrapper.append(base);
  const overlay = document.createElement('img'); overlay.id = `${kind}-attention`;
  overlay.className = 'attention-overlay'; overlay.alt = ''; overlay.hidden = true;
  wrapper.append(overlay);
  overlay.addEventListener('error', () => {
    overlay.hidden = true;
    document.getElementById('attention-status').textContent = '注意力图加载失败，请确认导出包包含 attention 文件夹。';
  });
}
function updateAttention() {
  if (!episode) return;
  const c = chunkForFrame(frame), entry = c.attention?.maps?.[camera];
  const toggle = document.getElementById('attention-toggle');
  toggle.disabled = !entry;
  const enabled = toggle.checked && !!entry;
  for (const kind of ['raw', 'model']) {
    const img = document.getElementById(`${kind}-attention`);
    img.hidden = !enabled;
    img.style.opacity = document.getElementById('attention-opacity').value;
    if (entry) {
      const url = resolveAsset(assetPath(kind === 'raw' ? entry.raw_src : entry.src));
      if (img.src !== url) img.src = url;
    }
  }
  document.getElementById('attention-status').textContent = entry
    ? `推理 #${c.id} · ${episode.videos[camera].label}图像 token 权重总和 ${(entry.mass * 100).toFixed(2)}%（包含 padding）。重放动作最大误差 ${c.attention.replay_max_action_error.toExponential(2)}。`
    : '此观测尚未导出注意力。已有视频和图像本身不能还原注意力权重。';
}
document.getElementById('attention-toggle').addEventListener('change', updateAttention);
document.getElementById('attention-opacity').addEventListener('input', updateAttention);
document.addEventListener('trace-observation', updateAttention);
