'use strict';
let data,videos=[],fps=25,generation=0,objectUrls=[];
const el=id=>document.getElementById(id);
const mediaBase=document.body.dataset.media||'fold-media';
async function refresh(){try{const r=await fetch(mediaBase+'/results.json',{cache:'no-store'});if(!r.ok)throw Error(r.status);data=await r.json();el('batch-status').textContent=`${{completed:'全部完成',stopped:'已停止',failed:'运行中断',starting:'模型加载中',running:'运行中'}[data.status]} · ${data.trials.filter(t=>t.status==='completed').length} / ${data.layouts.length*data.policy_seeds.length}${data.error?' · '+data.error:''}`;el('batch-rows').replaceChildren();for(const layout of data.layouts)for(let i=0;i<data.policy_seeds.length;i++){const t=data.trials.find(t=>t.layout_id===layout&&t.repeat_id===i),row=document.createElement('tr');for(const val of [layout,i,data.policy_seeds[i],t?({completed:'完成',running:'运行中',interrupted:'已中断'}[t.status]||t.status):'待运行',t?.result?.success_rate??'—',t?.result?.score??'—']){const td=document.createElement('td');td.textContent=val;row.append(td);}el('batch-rows').append(row);}}catch(e){el('batch-status').textContent='状态读取失败：'+e.message;}}
refresh();setInterval(refresh,15000);
function pause(){videos.forEach(v=>v.pause());}
function seek(){pause();videos.forEach(v=>{if(v.readyState>=1)v.currentTime=Math.min(Number(el('seek').value)/fps,Math.max(0,v.duration-1/fps));});el('position').textContent=`帧 ${el('seek').value} · ${(Number(el('seek').value)/fps).toFixed(2)} s`;}
const labels={left_sleeve:'LS',right_sleeve:'RS',left_chest:'LC',right_chest:'RC',left_hem:'LH',right_hem:'RH',left_shoulder:'LSh',right_shoulder:'RSh'};
function scoreFrames(video,info,records){
  info.replaceChildren();
  let highest=0;
  for(const record of records){
    if(record.score<=highest)continue;
    highest=record.score;
    const button=document.createElement('button');
    button.type='button';button.className='score-frame';
    button.textContent=`${record.score} 分 · 第 ${record.frame} 帧`;
    button.dataset.frame=record.frame;
    button.disabled=video.readyState<1;
    if(button.disabled)video.addEventListener('loadedmetadata',()=>{button.disabled=false;},{once:true});
    button.onclick=()=>{pause();video.currentTime=Math.min(record.frame/fps,Math.max(0,video.duration-1/fps));};
    info.append(button);
  }
  if(!info.childElementCount)info.textContent='未得分';
}
function overlay(video,canvas,info,records,camera){scoreFrames(video,info,records);const ctx=canvas.getContext('2d');function draw(){if(!video.isConnected)return;canvas.width=video.videoWidth||640;canvas.height=video.videoHeight||480;ctx.clearRect(0,0,canvas.width,canvas.height);const record=records[Math.min(records.length-1,Math.round(video.currentTime*fps))];if(record){const points=record.cameras[camera]?.uv;if(points&&el('show-points').checked){ctx.font='bold 15px Consolas';for(const [key,uv] of Object.entries(points)){const [x,y]=uv;if(x<0||x>=canvas.width||y<0||y>=canvas.height||record.cameras[camera].depth?.[key]<=0)continue;ctx.fillStyle='#fff200';ctx.strokeStyle='#172335';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeText(labels[key]||key,x+7,y-7);ctx.fillText(labels[key]||key,x+7,y-7);}}
}
requestAnimationFrame(draw);}requestAnimationFrame(draw);}
el('load').onclick=()=>{pause();const current=++generation;objectUrls.forEach(u=>URL.revokeObjectURL(u));objectUrls=[];videos=[];el('frame-grid').replaceChildren();let max=0;const base=Number(el('group').value)*4,camera=el('camera').value;for(let i=base;i<base+4;i++){const t=data?.trials.find(t=>t.layout_id===Number(el('layout').value)&&t.repeat_id===i),fig=document.createElement('figure'),cap=document.createElement('figcaption');cap.textContent=`R${i} / seed ${data?.policy_seeds[i]??'—'}`;fig.append(cap);el('frame-grid').append(fig);const media=t?.videos?.[camera];if(!media){const p=document.createElement('p');p.textContent='等待该次完成';fig.append(p);continue;}fps=media.fps;max=Math.max(max,media.frames-1);const stage=document.createElement('div');stage.className='video-stage';const v=document.createElement('video'),canvas=document.createElement('canvas'),info=document.createElement('p');info.className='point-info';v.muted=true;v.playsInline=true;v.preload='auto';stage.append(v,canvas);fig.append(stage,info);videos.push(v);fetch(mediaBase+'/' +media.url).then(r=>{if(!r.ok)throw Error(r.status);return r.blob();}).then(blob=>{if(current!==generation)return;const url=URL.createObjectURL(blob);objectUrls.push(url);v.src=url;}).catch(()=>{info.textContent='视频下载失败';});if(t.keypoints)fetch(mediaBase+'/' +t.keypoints).then(r=>r.json()).then(records=>overlay(v,canvas,info,records,'cam_'+camera)).catch(()=>{info.textContent='关键点读取失败';});else info.textContent='完整录像；物体位姿与逐步评分已保存到运行目录';}
for(const id of ['seek','play','pause','previous','next'])el(id).disabled=!videos.length;el('seek').max=max;el('seek').value=0;el('position').textContent='帧 0';el('video-status').textContent=`本组 ${videos.length} / 4 次录像可加载。`+(document.body.dataset.media?'':'LS/RS：袖口；LC/RC：胸部；LH/RH：衣摆；LSh/RSh：肩部。L/R 按资产命名，不按画面左右。');if(videos[0])videos[0].ontimeupdate=()=>{if(!videos[0].paused){el('seek').value=Math.round(videos[0].currentTime*fps);el('position').textContent=`帧 ${el('seek').value}`;}};};
el('play').onclick=async()=>{try{await Promise.all(videos.map(v=>v.play()));}catch(e){pause();el('video-status').textContent='请等待录像加载后重试';}};el('pause').onclick=pause;el('seek').oninput=seek;for(const [id,n] of [['previous',-1],['next',1]])el(id).onclick=()=>{el('seek').value=Number(el('seek').value)+n;seek();};
