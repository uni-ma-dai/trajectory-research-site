/* Render recorded floating-point attention; display scaling never changes weights. */
'use strict';
const attentionControls = document.createElement('div');
attentionControls.className = 'attention-controls';
attentionControls.innerHTML = `<label><input id="attention-toggle" type="checkbox" checked> 叠加模型注意力</label><label>叠加强度 <input id="attention-opacity" type="range" min="0" max="1" step="0.05" value="0.75"></label><label>色标范围 <select id="attention-scale"><option value="camera">当前相机画面最大值（增强对比）</option><option value="shared">三路相机画面共同最大值</option></select></label><label><input id="attention-padding" type="checkbox"> 显示模型补边上的注意力</label><div class="heat-legend"><span>低 · 0</span><i></i><span id="attention-max"></span></div><p id="attention-status" role="status"></p><p>原图完整保留：640×480 → 224×168，上下各补 28 px，得到 224×224 输入。左右画面等大对齐；左图外侧灰区仅为网页留白。</p><details><summary>注意力基于哪张图？补边为什么也有权重？</summary><p>基于右侧完整的 224×224 模型输入。图像编码器按 14×14 patch 形成 16×16 token；上下各 2 行起源于补边，中间 12 行对应画面。补边未被单独 mask，因此有非零注意力。图像 token 已经过编码器上下文混合，并不是独立像素的因果贡献。</p><p>显示动作 token 对图像 token 的 softmax 权重，平均 50 个预测动作、所有头、18 层和 10 次去噪。默认蓝→青→黄→红，按当前相机画面最大值线性缩放，透明度固定；不能直接跨相机或跨观测比较颜色。可切换三路共同色标。补边超出画面色标上限时以红色饱和显示。</p><p>原图只叠加中间 12 行权重；补边只在右图按开关显示。分区独立插值，避免补边颜色渗入画面。插值不增加原始 16×16 空间精度。</p><p>使用保存的输入、随机状态和相同 checkpoint 离线重放；不是从视频猜测，也不是网页实时运行模型。注意力不等于因果重要性。<a href="https://aclanthology.org/N19-1357/" target="_blank" rel="noopener">解释边界 ↗</a></p></details>`;
document.querySelector('.camera-thumbs').before(attentionControls);
for (const kind of ['raw', 'model']) {
  const base = document.getElementById(`${kind}-image`);
  const wrapper = document.createElement('div'); wrapper.className = `attention-image ${kind}-viewport`;
  base.before(wrapper); wrapper.append(base);
  const overlay = document.createElement('img'); overlay.id = `${kind}-attention`;
  overlay.className = 'attention-overlay'; overlay.alt = ''; overlay.hidden = true; wrapper.append(overlay);
  for (const side of ['top', 'bottom']) {
    const label = document.createElement('span'); label.className = `padding-label ${side}`;
    label.textContent = kind === 'model' ? '模型补边 28 px · 非裁剪' : '网页留白 · 不属于原图'; wrapper.append(label);
  }
}
document.querySelector('#raw-image').closest('figure').querySelector('figcaption').innerHTML = '完整原始观测<span>640 × 480 · 按相同画面范围对齐</span>';
document.querySelector('#model-image').closest('figure').querySelector('figcaption').innerHTML = '完整模型输入 · 无裁剪<span>224 × 224 = 224 × 168 画面 + 上下补边</span>';
function heatColor(v) {
  const stops = [[25,55,235],[0,190,245],[255,220,30],[230,20,35]];
  const t = Math.max(0,Math.min(1,v))*3, i = Math.min(2,Math.floor(t));
  return stops[i].map((x,k)=>Math.round(x+(stops[i+1][k]-x)*(t-i)));
}
function heatSection(rows, max, width, height) {
  const small = document.createElement('canvas'); small.width=16; small.height=rows.length;
  const ctx=small.getContext('2d'), pixels=ctx.createImageData(16,rows.length);
  rows.flat().forEach((v,i)=>{pixels.data.set([...heatColor(v/max),255],i*4);}); ctx.putImageData(pixels,0,0);
  const large=document.createElement('canvas');large.width=width;large.height=height;
  large.getContext('2d').drawImage(small,0,0,width,height);return large;
}
let attentionRenderKey='';
function updateAttention() {
  if (!episode) return;
  const c=chunkForFrame(frame), entry=c.attention?.maps?.[camera], rows=entry?.weights;
  const valid=Array.isArray(rows)&&rows.length===16&&rows.every(r=>Array.isArray(r)&&r.length===16&&r.every(v=>Number.isFinite(v)&&v>=0));
  const toggle=document.getElementById('attention-toggle');toggle.disabled=!valid;
  attentionControls.hidden=!valid;
  const enabled=toggle.checked&&valid;
  for(const kind of ['raw','model']){
    const img=document.getElementById(`${kind}-attention`);img.hidden=!enabled;img.style.opacity=document.getElementById('attention-opacity').value;
  }
  if(!valid){document.getElementById('attention-status').textContent='此观测没有有效的原始注意力权重，无法绘制热图。';document.getElementById('attention-max').textContent='暂无数据';return;}
  const shared=document.getElementById('attention-scale').value==='shared';
  const values=(shared?Object.values(c.attention.maps).map(m=>m.weights):[rows]).flatMap(r=>r.slice(2,14).flat());
  const max=Math.max(...values,1e-12), showPad=document.getElementById('attention-padding').checked;
  const key=JSON.stringify([rows,max,showPad]);
  if(key!==attentionRenderKey){
    const raw=heatSection(rows.slice(2,14),max,640,480);document.getElementById('raw-attention').src=raw.toDataURL();
    const model=document.createElement('canvas');model.width=model.height=224;
    const ctx=model.getContext('2d');ctx.drawImage(heatSection(rows.slice(2,14),max,224,168),0,28);
    if(showPad){ctx.drawImage(heatSection(rows.slice(0,2),max,224,28),0,0);ctx.drawImage(heatSection(rows.slice(14),max,224,28),0,196);}
    document.getElementById('model-attention').src=model.toDataURL();attentionRenderKey=key;
  }
  const sum=r=>r.flat().reduce((a,b)=>a+b,0), content=sum(rows.slice(2,14)), pad=sum([...rows.slice(0,2),...rows.slice(14)]);
  document.getElementById('attention-max').textContent=`高 · ${(max*100).toFixed(3)}% / token`;
  document.getElementById('attention-status').textContent=`推理 #${c.id} · ${episode.videos[camera].label}：画面 token 权重合计 ${(content*100).toFixed(2)}%，补边 token ${(pad*100).toFixed(2)}%（${showPad?'右图显示':'已隐藏热图，权重未删除'}）。${shared?'三路画面共同色标':'当前相机独立色标'}。`;
}
for(const id of ['attention-toggle','attention-scale','attention-padding']) document.getElementById(id).addEventListener('change',updateAttention);
document.getElementById('attention-opacity').addEventListener('input',updateAttention);
document.addEventListener('trace-observation',updateAttention);
