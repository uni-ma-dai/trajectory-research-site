'use strict';
const pointLabels={left_sleeve:'LS',right_sleeve:'RS',left_chest:'LC',right_chest:'RC',left_hem:'LH',right_hem:'RH',left_shoulder:'LSh',right_shoulder:'RSh'};
async function initComparison(host){
  const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const controls=make('div');controls.className='video-controls';
  const group=make('select'),camera=make('select');group.setAttribute('aria-label','对比组');camera.setAttribute('aria-label','相机');
  for(const [value,label] of [['head','头部相机'],['left_wrist','左腕相机'],['right_wrist','右腕相机']]){const o=make('option',label);o.value=value;camera.append(o);}
  const play=make('button','播放'),stop=make('button','停止'),previous=make('button','上一帧'),next=make('button','下一帧'),seek=make('input'),position=make('output','帧 0');
  seek.type='range';seek.min=0;seek.max=0;seek.value=0;seek.setAttribute('aria-label','对比视频帧号');
  const showPoints=make('input');showPoints.type='checkbox';showPoints.checked=true;const pointControl=make('label');pointControl.append(showPoints,document.createTextNode('显示评分点'));
  controls.append(group,camera,play,stop,previous,seek,next,position);if(host.dataset.keypoints)controls.append(pointControl);
  const status=make('p','正在读取视频列表…');status.className='video-status';status.setAttribute('role','status');const grid=make('div');grid.className='video-grid';host.append(controls,status,grid);
  let videos=[],generation=0,drawers=[],trials=[];const fps=25;
  function pause(){videos.forEach(v=>v.pause());}
  function updatePosition(){const frame=Math.round(Math.max(0,...videos.map(v=>v.currentTime))*fps);seek.value=frame;position.textContent=`帧 ${frame} · ${(frame/fps).toFixed(2)} s`;}
  function seekTo(frame){pause();const t=Math.max(0,Math.min(Number(seek.max),frame))/fps;for(const v of videos)if(v.readyState>=1)v.currentTime=Math.min(t,Math.max(0,v.duration-1/fps));seek.value=Math.round(t*fps);position.textContent=`帧 ${seek.value} · ${t.toFixed(2)} s`;}
  play.onclick=async()=>{try{await Promise.all(videos.map(v=>v.play()));}catch(e){pause();status.textContent='视频仍在加载，或浏览器阻止了播放，请稍后重试。';}};
  stop.onclick=()=>seekTo(0);seek.oninput=()=>seekTo(Number(seek.value));previous.onclick=()=>seekTo(Number(seek.value)-1);next.onclick=()=>seekTo(Number(seek.value)+1);showPoints.onchange=()=>drawers.forEach(draw=>draw());
  async function load(){
    pause();videos.forEach(v=>{v.removeAttribute('src');v.load();});const token=++generation;videos=[];drawers=[];grid.replaceChildren();seek.value=0;position.textContent='帧 0';
    const selected=trials.slice(Number(group.value)*4,Number(group.value)*4+4);let maximum=0;
    for(const trial of selected){
      const media=trial.videos?.[camera.value];if(!media)continue;
      const figure=make('figure'),caption=make('figcaption',`R${trial.repeat_id} / seed ${trial.policy_seed}`),stage=make('div'),video=make('video'),canvas=make('canvas'),info=make('div');stage.className='video-stage';info.className='score-frames';
      video.muted=true;video.playsInline=true;video.preload='auto';video.controls=true;video.setAttribute('aria-label',caption.textContent+' '+camera.selectedOptions[0].textContent);video.src=host.dataset.media+'/'+media.url;
      stage.append(video,canvas);figure.append(caption,stage,info);grid.append(figure);videos.push(video);maximum=Math.max(maximum,media.frames-1);
      video.ontimeupdate=updatePosition;video.onerror=()=>{if(token===generation)status.textContent='部分录像加载失败，请检查网络后切换视角重试。';};
      if(trial.keypoints){
        try{
          const response=await fetch(host.dataset.media+'/'+trial.keypoints);if(!response.ok)throw Error(response.status);const records=await response.json();if(token!==generation)return;
          let best=0;for(const r of records){if(r.score<=best)continue;best=r.score;const button=make('button',`${r.score} 分 · 第 ${r.frame} 帧`);button.onclick=()=>{pause();video.currentTime=Math.min(r.frame/media.fps,Math.max(0,video.duration-1/media.fps));};info.append(button);}if(!best)info.textContent='未得分';
          const cam='cam_'+camera.value,ctx=canvas.getContext('2d');
          const draw=()=>{if(token!==generation||!video.isConnected)return;canvas.width=video.videoWidth||640;canvas.height=video.videoHeight||480;ctx.clearRect(0,0,canvas.width,canvas.height);if(!showPoints.checked)return;const r=records[Math.min(records.length-1,Math.round(video.currentTime*media.fps))];const points=r?.cameras[cam];if(!points)return;ctx.font='bold 15px Consolas';ctx.lineWidth=2;ctx.fillStyle='#fff200';ctx.strokeStyle='#172335';for(const [key,[x,y]] of Object.entries(points.uv||{})){if(x<0||x>=canvas.width||y<0||y>=canvas.height||points.depth?.[key]<=0)continue;ctx.beginPath();ctx.arc(x,y,5,0,2*Math.PI);ctx.fill();ctx.stroke();ctx.strokeText(pointLabels[key]||key,x+7,y-7);ctx.fillText(pointLabels[key]||key,x+7,y-7);}};
          drawers.push(draw);video.addEventListener('loadeddata',draw);video.addEventListener('seeked',draw);video.addEventListener('timeupdate',draw);const tick=()=>{if(token!==generation)return;draw();if(!video.paused&&!video.ended)requestAnimationFrame(tick);};video.addEventListener('play',tick);draw();
        }catch(e){if(token===generation)info.textContent='评分点暂时无法加载，录像仍可播放。';}
      }
    }
    if(token!==generation)return;seek.max=maximum;play.disabled=!videos.length;stop.disabled=!videos.length;status.textContent='';
  }
  try{const response=await fetch(host.dataset.media+'/'+host.dataset.manifest);if(!response.ok)throw Error(response.status);const data=await response.json();trials=data.trials.filter(t=>t.videos).sort((a,b)=>a.repeat_id-b.repeat_id);if(host.dataset.keypoints){
 const wrap=make('div');wrap.className='fold-results';const table=make('table');table.setAttribute('aria-label','折衣服二十次运行结果');const head=make('thead'),groups=make('tr'),runs=make('tr');groups.append(make('th','策略 seed'));runs.append(make('th','重复序号'));
 for(let i=0;i<trials.length;i+=4){const th=make('th',String(trials[i].policy_seed));th.colSpan=Math.min(4,trials.length-i);groups.append(th);}
 trials.forEach(t=>runs.append(make('th','R'+t.repeat_id)));head.append(groups,runs);const body=make('tbody');
 for(const [name,value] of [['得分',t=>t.result?.score??'—'],['成功',t=>t.result?.success_rate===1?'✓':'—'],['动作步数',t=>t.steps??'—']]){const row=make('tr'),label=make('th',name);label.scope='row';row.append(label);trials.forEach(t=>row.append(make('td',String(value(t)))));body.append(row);}
 table.append(head,body);wrap.append(table);host.prepend(wrap);
 const review=make('section');review.className='fold-diagnostics';wrap.after(review);
 try{const response=await fetch('fold-diagnostics.json');if(!response.ok)throw Error(response.status);const diagnostics=await response.json();
 review.append(make('h3','评分点到位情况'),make('p','✓ 到位，— 未到位。LS／RS：左右衣袖；LH／RH：左右衣角。到位要求对应的 X、Y 范围同时通过。'));
 for(const [phase,title] of [['first','首次折衣摆后'],['final','运行结束时']]){
 review.append(make('h4',title));const scroll=make('div');scroll.className='diagnostic-scroll';const table=make('table'),thead=make('thead'),tr=make('tr');for(const name of ['运行','帧','左袖 LS','右袖 RS','左角 LH','右角 RH','夹角 < 45°','夹爪全开','最终成功','观察结果'])tr.append(make('th',name));thead.append(tr);const tbody=make('tbody');
 for(const row of diagnostics.rows){const sample=row[phase],tr=make('tr');const mark=v=>v?'✓':'—';const vals=['R'+row.repeat_id,sample.frame,...['LS','RS','LH','RH','angle'].map(k=>mark(sample.passed[k])),mark(sample.grippers_open),mark(row.success),row.note];vals.forEach((value,i)=>{const cell=make('td',String(value));if(value==='✓')cell.className='check-pass';if(value==='—')cell.className='check-fail';tr.append(cell);});tbody.append(tr);}
 table.append(thead,tbody);scroll.append(table);review.append(scroll);
 }
 const evidence=make('a','下载逐项判定数据');evidence.href='fold-diagnostics.json';evidence.target='_blank';review.append(evidence);
 review.append(make('p','首次表取本批首次折衣摆后张开夹爪的采样帧；末帧表反映最终几何状态。原始分数还受阶段记录与完整成功条件约束。'));
 }catch(e){review.textContent='评分点汇总加载失败，请刷新重试。';}

 }
 for(let i=0;i<trials.length;i+=4){const set=trials.slice(i,i+4),seeds=[...new Set(set.map(t=>t.policy_seed))];const o=make('option',`R${set[0].repeat_id}–R${set.at(-1).repeat_id} · seed ${seeds.join(' / ')}`);o.value=i/4;group.append(o);}group.onchange=load;camera.onchange=load;await load();}catch(e){status.textContent='视频列表读取失败，请刷新页面重试。';play.disabled=stop.disabled=true;}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
}
document.querySelectorAll('.video-compare').forEach(initComparison);
