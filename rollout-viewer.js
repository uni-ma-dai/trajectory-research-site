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
