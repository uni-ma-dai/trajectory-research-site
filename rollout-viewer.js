'use strict';
async function showDivergenceSummary(){
  const host=document.getElementById('divergence-summary');
  try{
    const response=await fetch('figures/divergence.json');if(!response.ok)throw Error(response.status);
    const d=await response.json(),image=d.image_mae,motion=d.mean_object_position_gap_cm;
    host.textContent=`本次记录：图像差异从 ${image[0].toFixed(2)} 到 ${image.at(-1).toFixed(2)}，峰值 ${Math.max(...image).toFixed(2)}；物体位置平均距离从 ${motion[0].toFixed(2)} 到 ${motion.at(-1).toFixed(2)} cm，峰值 ${Math.max(...motion).toFixed(2)} cm。`;
  }catch(error){host.textContent='差异摘要暂时无法加载。';}
}
showDivergenceSummary();
let frames;
const slider=document.getElementById('frame-slider'),camera=document.getElementById('camera-select'),status=document.getElementById('frame-status');
function showFrames() {
  const series=frames.trials.map(t=>t.cameras[camera.value]);
  slider.max=Math.min(...series.map(s=>s.frames.length))-1;
  slider.value=Math.min(Number(slider.value),Number(slider.max));
  const index=Number(slider.value),host=document.getElementById('frame-grid');host.replaceChildren();
  document.getElementById('frame-position').textContent=`采样 ${index+1} / ${Number(slider.max)+1}`;
  frames.trials.forEach((t,i)=>{
    const sample=series[i].frames[index],fig=document.createElement('figure'),caption=document.createElement('figcaption');
    caption.textContent=`R${t.repeat_id} / seed ${t.policy_seed} · 视频帧 ${sample.index} · ${sample.time.toFixed(2)} s`;
    const img=document.createElement('img');img.alt=caption.textContent;img.src='rollout-media/'+sample.url;
    img.onerror=()=>{status.textContent='部分视频帧加载失败，请稍后重试。';};
    fig.append(caption,img);host.append(fig);
  });
  document.getElementById('frame-prev').disabled=index===0;
  document.getElementById('frame-next').disabled=index===Number(slider.max);
}
document.getElementById('load-frames').addEventListener('click',async()=>{
  const button=document.getElementById('load-frames');button.disabled=true;status.textContent='正在加载视频帧…';
  try {
    const response=await fetch('rollout-media/manifest.json',{cache:'no-store'});if(!response.ok)throw Error(response.status);
    frames=await response.json();document.getElementById('frame-controls').hidden=false;showFrames();
    status.textContent='四次实验按视频采样序号并排展示；这是录像时间对齐，不代表任务阶段或动作步严格对齐。';button.hidden=true;
  }catch(error){status.textContent='无法加载视频帧，请稍后重试。';button.disabled=false;}
});
slider.addEventListener('input',showFrames);camera.addEventListener('change',showFrames);
for(const [id,delta] of [['frame-prev',-1],['frame-next',1]])document.getElementById(id).addEventListener('click',()=>{slider.value=Number(slider.value)+delta;showFrames();});
