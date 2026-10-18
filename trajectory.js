/* Static, browser-local trace viewer. Video frame n is control state n;
   execution step n takes state n to state n+1. No capture timestamp is inferred. */
'use strict';
const $ = id => document.getElementById(id);
const palette = ['#9fc7af', '#b5b3d9', '#e5bc98', '#9fc4d5', '#d5bbd5', '#c4cd96'];
let episode = null, resolveAsset = null, frame = 0, activeChunk = -1, camera = 'head';
let generation = 0, currentMedia = '', pendingFrame = 0, catalogue = [], objectURLs = [];
let mediaLoading = false, seekPending = false;
const video = $('video');
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function color(id) { return palette[id % palette.length]; }
function validate(data) {
  if (data.schema !== 1 || data.benchmark !== 'RoboDojo' || !Number.isInteger(data.steps) || data.steps < 1 || !Array.isArray(data.chunks) || !data.chunks.length) throw Error('不是支持的 RoboDojo trace 导出包。');
  let end = 0;
  for (const [i, c] of data.chunks.entries()) {
    if (c.id !== i || c.start !== end || c.end <= c.start || c.executed !== c.end - c.start || c.predicted < c.executed || c.observation_step !== c.start || !Array.isArray(c.actions) || c.actions.length !== c.predicted) throw Error('推理与动作范围不连续，不能可靠对齐。');
    if (c.actions.some(a => !Array.isArray(a) || a.length !== 14 || a.some(x => !Number.isFinite(x)))) throw Error('动作数组无效。');
    for (const key of ['head', 'left', 'right']) if (!c.images?.[key]?.raw || !c.images[key].model) throw Error('缺少相机图像。');
    end = c.end;
  }
  if (end !== data.steps) throw Error('控制步总数不一致。');
  for (const key of ['head', 'left', 'right']) if (!(data.videos?.[key]?.fps > 0) || data.videos[key].frames !== data.steps + 1) throw Error('视频帧与控制步不匹配。');
  return data;
}
function assetPath(path) {
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..') || /^[a-z]+:/i.test(path)) throw Error('导出包包含不支持的文件路径。');
  return path;
}
function revokeFiles() { for (const url of objectURLs) URL.revokeObjectURL(url); objectURLs = []; }
function makeButton(text, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', fn); return b; }
function useEpisode(data, resolver, label) {
  episode = validate(data); resolveAsset = resolver; frame = 0; activeChunk = -1;
  $('viewer').hidden = false;
  $('total-steps').textContent = data.steps.toLocaleString(); $('total-inferences').textContent = data.chunks.length;
  $('outcome').textContent = data.success ? '成功回合' : '未成功 · 达到步数上限'; $('outcome').classList.toggle('fail', !data.success);
  $('scrubber').max = data.steps; $('axis-mid').textContent = `帧 ${Math.floor(data.steps / 2)}`; $('axis-end').textContent = `帧 ${data.steps} · 终止`;
  $('instruction').textContent = `指令：${data.instruction}`;
  $('alignment').textContent = data.alignment.note;
  $('provenance').textContent = `RoboDojo · ${data.task} · layout ${data.layout_id} · video episode ${data.episode_index} · ${data.run} · ${data.source_attempt}`;
  const jsonURL = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})); objectURLs.push(jsonURL); $('download-json').href = jsonURL;
  const track = $('chunk-track'); track.replaceChildren();
  for (const c of data.chunks) {
    const b = makeButton(String(c.id), () => seek(c.observation_step));
    b.style.width = `${100 * c.executed / data.steps}%`; b.style.background = color(c.id);
    b.title = `推理 #${c.id}：状态 ${c.start}，预测 ${c.predicted}，执行 ${c.executed} 步`;
    b.setAttribute('aria-label', b.title); track.append(b);
  }
  const thumbs = $('camera-thumbs'); thumbs.replaceChildren();
  for (const key of ['head', 'left', 'right']) {
    const b = makeButton('', () => { $('camera-select').value = key; changeCamera(key); });
    const img = document.createElement('img'); img.alt = `${data.videos[key].label}模型输入缩略图`;
    const span = document.createElement('span'); span.textContent = data.videos[key].label;
    b.dataset.camera = key; b.append(img, span); thumbs.append(b);
  }
  status(`${label} · ${data.steps} 步 / ${data.chunks.length} 次推理。点击色块或拖动时间轴查看对应观测。`);
  changeCamera(camera); render(0);
}
function changeCamera(key) {
  camera = key; video.pause(); pendingFrame = frame; mediaLoading = true; seekPending = true;
  currentMedia = resolveAsset(assetPath(episode.videos[key].src)); video.src = currentMedia; video.load();
  activeChunk = -1; render(frame);
}
function seek(n) {
  if (!episode) return;
  video.pause(); frame = Math.max(0, Math.min(episode.steps, Math.round(n))); pendingFrame = frame; seekPending = true;
  if (!mediaLoading && video.readyState >= 1) video.currentTime = (frame + 0.05) / episode.videos[camera].fps;
  render(frame);
}
function chunkForFrame(n) { return episode.chunks.findLast(c => c.start <= n) || episode.chunks[0]; }
function render(n) {
  if (!episode) return;
  frame = Math.max(0, Math.min(episode.steps, Math.floor(n)));
  const c = chunkForFrame(frame), terminal = frame === episode.steps;
  const progress = Math.max(0, Math.min(c.executed, frame - c.start));
  $('frame-number').textContent = `${frame} / ${episode.steps}`; $('infer-number').textContent = `#${c.id}`;
  $('video-clock').textContent = `${(frame / episode.videos[camera].fps).toFixed(2)} s · ${episode.videos[camera].fps} FPS`;
  $('frame-context').textContent = terminal ? '终止帧 · 所有已执行动作之后' : `控制状态 ${frame} · 动作 ${frame} 执行之前`;
  $('scrubber').value = frame; $('playhead').style.left = `${frame / episode.steps * 100}%`;
  $('observation-step').textContent = `观测对应状态 ${c.observation_step}`;
  $('observation-explanation').textContent = terminal ? `回合已结束。最后一次推理使用状态 ${c.start} 的观测；本 chunk 实际执行 ${c.executed}/${c.predicted} 步。` : `视频已推进 ${frame - c.observation_step} 个控制步；当前动作仍来自推理 #${c.id}，输入图像保持为状态 ${c.observation_step} 的观测。`;
  document.querySelector('.chunk-panel').style.setProperty('--chunk-color', color(c.id));
  $('chunk-title').textContent = `推理 #${c.id} · Action chunk`;
  $('chunk-range').textContent = `动作 ${c.start}–${c.end - 1} → 状态 ${c.end}`;
  const next = episode.chunks[c.id + 1];
  const summary = $('chunk-summary'); summary.replaceChildren();
  for (const [label, value] of [['预测', `${c.predicted} 步`], ['实际执行', `${c.executed} 步`], ['播放到', `${progress}/${c.executed}`], ['下一推理', next ? `状态 ${next.start}` : '无 · 回合结束']]) {
    const span = document.createElement('span'); span.append(document.createTextNode(`${label} `)); const b = document.createElement('b'); b.textContent = value; span.append(b); summary.append(span);
  }
  if (activeChunk !== c.id) {
    activeChunk = c.id;
    $('raw-image').src = resolveAsset(assetPath(c.images[camera].raw)); $('model-image').src = resolveAsset(assetPath(c.images[camera].model));
    document.dispatchEvent(new Event('trace-observation'));
    for (const b of $('camera-thumbs').children) { const key = b.dataset.camera; b.querySelector('img').src = resolveAsset(assetPath(c.images[key].model)); b.classList.toggle('selected', key === camera); }
    for (const [i, b] of [...$('chunk-track').children].entries()) { b.classList.toggle('selected', i === c.id); b.setAttribute('aria-pressed', String(i === c.id)); }
    const cells = $('action-cells'); cells.replaceChildren();
    for (let i = 0; i < c.predicted; i++) {
      const b = makeButton(String(i + 1), () => seek(c.start + i));
      b.title = i < c.executed ? `chunk 索引 ${i} → 全局动作 ${c.start + i}` : `chunk 索引 ${i}：未执行`;
      b.setAttribute('aria-label', b.title); b.disabled = i >= c.executed; b.classList.toggle('unexecuted', i >= c.executed); cells.append(b);
    }
    $('wall-timing').textContent = `推理服务时间：${new Date(c.wall_start * 1000).toISOString()} → ${new Date(c.wall_end * 1000).toISOString()}（${((c.wall_end - c.wall_start) * 1000).toFixed(1)} ms）。这是墙钟时间，不是视频播放时间或相机采集时间。`;
    $('action-values').textContent = c.actions.map((a, i) => `${String(i).padStart(2)} ${i < c.executed ? '已执行' : '未执行'}  [${a.map(x => x.toFixed(5)).join(', ')}]`).join('\n');
  }
  for (const [i, b] of [...$('action-cells').children].entries()) { b.classList.toggle('current', !terminal && i === progress && i < c.executed); b.classList.toggle('future', i >= progress && i < c.executed); }
  $('action-caption').textContent = c.executed < c.predicted ? `预测 ${c.predicted} 步，回合在执行第 ${c.executed} 步后结束。斜纹的 ${c.predicted - c.executed} 步没有执行；没有发生下一次推理。` : `本 chunk 的 ${c.predicted} 步全部执行。${next ? `到状态 ${next.start} 时，用新观测重新生成下一组动作。` : '随后回合结束。'}数字按 1 开始显示，记录中的 chunk_index 从 0 开始。`;
}
video.addEventListener('loadedmetadata', () => { if (episode) { mediaLoading = false; video.playbackRate = Number($('speed').value); video.currentTime = (pendingFrame + 0.05) / episode.videos[camera].fps; } });
video.addEventListener('seeked', () => {
  if (!episode || mediaLoading) return;
  const n = video.currentTime * episode.videos[camera].fps;
  if (seekPending && Math.abs(n - pendingFrame) > 0.2) return;
  seekPending = false; render(n + 1e-5);
});
video.addEventListener('error', () => status('视频加载失败：请确认导出文件夹包含 video/ 下的 MP4。', true));
for (const id of ['raw-image', 'model-image']) $(id).addEventListener('error', () => status('观测图像缺失，请重新导入完整导出文件夹。', true));
video.addEventListener('timeupdate', () => { if (episode && !mediaLoading && !seekPending) render(video.currentTime * episode.videos[camera].fps + 1e-5); });
video.addEventListener('play', () => { $('play-toggle').textContent = '暂停'; });
video.addEventListener('pause', () => { $('play-toggle').textContent = '播放'; });
if (video.requestVideoFrameCallback) {
  const tick = (_, metadata) => { if (episode && !video.paused && !mediaLoading && !seekPending) render(metadata.mediaTime * episode.videos[camera].fps + 1e-5); video.requestVideoFrameCallback(tick); };
  video.requestVideoFrameCallback(tick);
}
$('play-toggle').onclick = async () => { if (!episode) return; if (!video.paused) return video.pause(); if (frame === episode.steps) seek(0); try { await video.play(); } catch (e) { status(`无法播放：${e.message}`, true); } };
$('prev-frame').onclick = () => seek(frame - 1); $('next-frame').onclick = () => seek(frame + 1);
$('prev-chunk').onclick = () => { const c = chunkForFrame(frame); seek(episode.chunks[Math.max(0, c.id - 1)].start); };
$('next-chunk').onclick = () => { const c = chunkForFrame(frame); seek(episode.chunks[c.id + 1]?.start ?? episode.steps); };
$('scrubber').oninput = e => seek(Number(e.target.value));
$('speed').onchange = e => { video.playbackRate = Number(e.target.value); };
$('camera-select').onchange = e => { if (episode) changeCamera(e.target.value); };
document.addEventListener('keydown', e => { if (!episode || /INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY/.test(e.target.tagName)) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seek(frame + (e.key === 'ArrowLeft' ? -1 : 1)); } });
async function loadRemote(item, startFrame = 0) {
  const token = ++generation; video.pause(); status('正在加载回合…');
  try {
    const url = new URL(item.src, location.href); const response = await fetch(url);
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const data = validate(await response.json()); if (token !== generation) return;
    revokeFiles(); useEpisode(data, path => new URL(assetPath(path), url).href, item.label);
    if (Number.isFinite(startFrame) && startFrame > 0) seek(startFrame);
  } catch (e) { if (token === generation) { $('viewer').hidden = true; status(`加载失败：${e.message}。也可以导入本地导出文件夹。`, true); } }
}
$('episode-select').onchange = e => { const item = catalogue[Number(e.target.value)]; if (item) loadRemote(item); };
$('folder-input').onchange = async e => {
  const token = ++generation, files = [...e.target.files]; if (!files.length) return;
  try {
    const manifests = files.filter(f => f.name === 'episode.json'); if (manifests.length !== 1) throw Error('请选择恰好包含一个 episode.json 的回合文件夹');
    const manifest = manifests[0], prefix = manifest.webkitRelativePath.slice(0, -manifest.name.length);
    const data = validate(JSON.parse(await manifest.text())); if (token !== generation) return;
    const map = new Map(files.map(f => [f.webkitRelativePath, f]));
    const needed = [...Object.values(data.videos).map(v => v.src), ...data.chunks.flatMap(c => Object.values(c.images).flatMap(v => [v.raw, v.model]))];
    for (const path of needed) if (!map.has(prefix + assetPath(path))) throw Error(`缺少 ${path}`);
    video.pause(); revokeFiles(); const urls = new Map();
    const resolver = path => { path = assetPath(path); if (!urls.has(path)) { const url = URL.createObjectURL(map.get(prefix + path)); objectURLs.push(url); urls.set(path, url); } return urls.get(path); };
    $('episode-select').value = ''; useEpisode(data, resolver, '本地导入（文件仅在浏览器读取，不上传）');
  } catch (e) { status(`导入失败：${e.message}`, true); }
};
(async () => {
  try {
    const response = await fetch('trace-data/index.json'); if (!response.ok) throw Error(`HTTP ${response.status}`);
    catalogue = await response.json(); $('episode-select').replaceChildren();
    catalogue.forEach((item, i) => { const option = document.createElement('option'); option.value = i; option.textContent = item.label; $('episode-select').append(option); });
    $('episode-select').disabled = false;
    const params = new URLSearchParams(location.search);
    const selected = Math.max(0, catalogue.findIndex(item => String(item.episode) === params.get('episode') && (!params.has('task') || item.task === params.get('task'))));
    $('episode-select').value = String(selected);
    if (catalogue.length) await loadRemote(catalogue[selected], Number(params.get('step') || 0));
  } catch (e) { status(`无法读取在线样例：${e.message}。可导入本地导出文件夹。`, true); }
})();
