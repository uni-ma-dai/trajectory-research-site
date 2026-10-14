'use strict';
async function refreshSeedResults() {
  const status = document.getElementById('results-status');
  try {
    const response = await fetch('seed-results.json', {cache:'no-store'});
    if (!response.ok) throw new Error('HTTP '+response.status);
    const data = await response.json();
    const labels = {pending:'待运行',starting:'环境加载中',running:'运行中',completed:'已完成',incomplete:'未完成',failed:'运行失败'};
    const body = document.getElementById('measured-rows'); body.replaceChildren();
    for (const trial of data.trials) {
      const row = document.createElement('tr');
      for (const value of [trial.repeat_id,trial.policy_seed,labels[trial.status]||trial.status,trial.steps,trial.success_rate==null?'—':trial.success_rate===1?'成功':'未成功',trial.score==null?'—':trial.score.toFixed(1),trial.first_positive_score?trial.first_positive_score.step+' 步 · '+trial.first_positive_score.score+' 分':'—']) {
        const cell=document.createElement('td');cell.textContent=value;row.append(cell);
      }
      body.append(row);
    }
    status.textContent = `已完成 ${data.trials.filter(t=>t.status==='completed').length} / 4 · 数据更新时间 ${new Date(data.updated).toLocaleString()} · 每 15 秒读取最新摘要`;
    const findings=document.getElementById('measured-findings');findings.replaceChildren();
    if(data.comparisons.some(c=>!c.same_initial_observation)) {const note=document.createElement('p');note.className='accent';note.textContent='归因限制：闭环对照的初始观测并不完全一致，因此闭环差异不能全部归因于 policy_seed。同一观测的离线推理检查是更严格的采样对照。';findings.append(note);}
    const summary=document.createElement('p');
    summary.textContent='相对重复 0：三次对照的布局哈希与记录的物体、关节初态均一致；初始图像均有微小差异，目标动作均从第 1 步开始不同。';findings.append(summary);
    const manifest=await fetch('figures/manifest.json', {cache:'no-store'}).then(r=>r.json());
    if(manifest.updated===data.updated){
      const grid=document.createElement('div');grid.className='paper-figures';
      const panels=[
        ['initial-images','A · 初始图像差异','相对重复 0，三路相机的像素通道平均绝对差（uint8，0–255）。'],
        ['joint-difference','B · 闭环轨迹差异','相对重复 0，共同 550 步的实际关节 RMSE；表示差异大小，不是质量评分。'],
        ['inference-difference','C · 固定观测的采样差异','同一观测推理，相对首个 seed 0 的动作 chunk 最大绝对差；各动作维度使用原单位。']
      ];
      for(const [file,title,caption] of panels){
        const fig=document.createElement('figure');const heading=document.createElement('h3');heading.textContent=title;
        const img=document.createElement('img');img.src='figures/'+file+'.svg?v='+encodeURIComponent(manifest.updated);img.alt=title+'；'+caption;
        const cap=document.createElement('figcaption');cap.textContent=caption;
        const link=document.createElement('a');link.href='figures/'+file+'.pdf';link.textContent='PDF ↗';link.target='_blank';
        fig.append(heading,img,cap,link);grid.append(fig);
      }
      findings.append(grid);
    } else {const note=document.createElement('p');note.textContent='实测数据已更新，请重新运行 plot_seed_results.py 生成对应图表。';findings.append(note);}
    document.getElementById('measured-path').textContent='完整记录：'+data.output_dir;
  } catch(error) { status.textContent='暂时无法读取实验摘要：'+error.message; }
}
refreshSeedResults();setInterval(refreshSeedResults,15000);
