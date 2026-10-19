# 轨迹研究地图

公开静态汇报快照。包含代码阅读摘录、实验图表、视频、选定回合观测和注意力叠加；不包含模型权重或完整研究源码。

https://uni-ma-dai.github.io/trajectory-research-site/

视频与结果来自 2026-10-14 及此前的已记录实验，不是在线推理服务。


## 观测与动作时间轴

入口：`trajectory.html`，首页与评测页均有入口。已接入 2026-10-18 Precision
重跑的真实搭塔回合 1（1050 步，失败）和回合 4（741 步，成功）。这是新一批
实验，不应与 `evaluation.html` 的历史汇总混为同一批成绩。

另加入回合 12（1050 步、21 次推理、失败），用于检查短木板放置后的后续行为，
未计算注意力。直达 `trajectory.html?episode=12&step=475`，定位约 19 秒的
控制状态 475；点击时间轴推理 #9、#10 可查看状态 450、500 的观测。
三路视频所有推理点 RGB 对齐误差最大低于 2.98/255。该页面是原轨迹回放，
尚不是恢复仿真状态后重新采样的分叉 rollout。

视频联动三路原始观测和 224×224 模型输入，显示每个 chunk 的预测长度、
实际执行长度、下一次推理控制步以及未执行的尾部动作。PNG 按保存的 uint8
像素无损导出，不从 MP4 重建。完整预测动作和执行关联存于 `episode.json`。

### 对齐约定

- 执行记录 step=n：从控制状态 n 执行动作到状态 n+1。
- 本格式接受 steps+1 帧的完整单环境 RoboDojo 回合。按记录器和 Pi05 deploy
  取帧规则，视频帧 n 对应控制状态 n，末帧是终止状态。
- 导出时解码所有推理点的三路视频帧，与 raw_input 计算 RGB MAE；当前样例
  最大约 3.04/255，与 MP4 压缩差异相容。
- 有推理时的控制计数、physics step、服务墙钟时间；没有相机独立采集时间
  或缓存年龄。不能证明没有相机缓存延迟。25 FPS 视频时间不是墙钟时间。
- 成功样例末组预测 50 步，只执行 41 步；斜纹的 9 步未执行，并非重新规划。

### 导出其他回合

在能读取服务器 trace 的 Python 环境准备 NumPy、Pillow、ffmpeg 和 ffprobe：

```bash
python scripts/export_trace_viewer.py /path/to/layout-000001/attempt-TIMESTAMP /path/to/new-export
```

输出目录必须不存在。导出器只读记录，不加载模型或仿真器。
下载整个导出文件夹后，点击“导入回合文件夹”；只在浏览器本地读取，不上传。
NPZ 需先导出，单个 MP4 无法提供完整对应关系。
在线样例在 trace-data/，由 trace-data/index.json 列出。当前公开样例包含选定
观测 PNG、模型输入 PNG、MP4 和动作 JSON；完整 NPZ 数据集和权重不在仓库内。

本地预览：`python scripts/serve_viewer.py`，打开
`http://127.0.0.1:8767/trajectory.html`。该服务器支持视频字节范围请求，
保证 Chrome 可以精确拖动 MP4；普通 `python -m http.server` 不支持此能力。

### 动作对图像的注意力

时间轴的“叠加模型注意力”支持原始图、模型输入及三路相机，强度可调。
两个样例共 36 次观测均使用保存的 raw_input、rng_before 和同一 checkpoint
离线重放；预处理数组逐元素相等，重放的最终 50×14 动作与记录最大误差均为 0。
这是重放所得注意力，不是原运行捕获的权重。网页只显示预计算结果。

提取动作生成阶段 Gemma softmax 的 action-query → image-key 权重，平均
50 个动作 query、所有 heads、18 层和 10 次 flow 去噪。SigLIP So400m/14 的
224×224 输入对应每相机 16×16 个 patch。顺序为 head、left wrist、right wrist。
原始浮点权重和各相机总权重保存在 attention.json 与 episode.json；总权重包含
padding，三路图像总和小于 1，因为还存在文本等其他 key。
网页现在直接使用浮点 weights 绘制蓝→青→黄→红热图，默认固定 0.75 叠加强度，
按当前相机画面（中间 12 行 token）的最大值线性缩放，增强可见度。可切换
三路画面的共同最大值。显示数值色标；独立色标不能跨相机比较，所有色标
均不能跨观测直接比较。旧 attention PNG 只是先前的导出预览，网页不再使用。
补边 token 未被单独 mask，具有非零权重。默认隐藏其热图并单独报告权重和，
勾选后仅在右图显示；若超过画面色标上限，显示饱和红色。画面和补边分区插值，
防止边缘颜色混合；插值不增加原始 16×16 空间精度。编码器会混合空间上下文，
“补边 token”按初始 patch 位置命名，不等于只包含补边信息。
108 张保存的模型输入均与原图 bilinear 缩至 224×168、上下各补 28px 的结果
逐像素一致（最大差 0），没有裁剪。左右展示框等大，画面范围对齐；左框灰色
留白仅用于网页布局，右框黑边是实际模型输入。原图热图只映射中间 12 行权重。
注意力不是因果重要性；也没有对每个单独动作做归因或 attention rollout。

在相同 OpenPI 环境、空闲 GPU 上运行（先用上面的脚本导出回合）：

```bash
CUDA_VISIBLE_DEVICES=0 XLA_PYTHON_CLIENT_PREALLOCATE=false python scripts/export_attention.py \
  --source /path/to/attempt-TIMESTAMP --output /path/to/export/attention \
  --checkpoint /path/to/RoboDojo-sim-arx_x5-joint-0/59999
```

依赖原项目的 OpenPI PYTHONPATH、JAX、Flax 和权重。脚本只在自己的进程中
包装注意力方法，不修改模型源码，不启动仿真器，不操作其他评测进程。
当前只支持此 Pi0.5 配置、50 动作、默认 10 步采样和 640×480 输入；遇到
不匹配会报错。完成后自动给同目录 episode.json 添加可选 attention 字段。
`attention.js` / `attention.css` 实现展示；无注意力的旧导出包仍可使用。

## Fasten screws episode 4

`trace-data/fasten-screws-fail-4/` contains the original failed precision rerun episode 4: 1900 control steps, 38 policy inferences, all three camera videos, lossless observation/model-input images and 50-step action chunks. Exported from `fasten_screws/layout-000004/attempt-1792297155237711763`; no attention was computed. Every inference observation is checked against its decoded video frame by the exporter. Direct link: `trajectory.html?task=fasten_screws&episode=4`. Task-qualified links distinguish episodes with the same index across tasks; legacy `?episode=12` remains supported.

## RoboTwin latest evaluation snapshot

`evaluation.html` now leads with the 2026-10-19 snapshot of the three recorded 25-episode RoboTwin runs. `evaluation-results.json.robotwin_latest` stores per-configuration counts, source run names and environment seeds. Rates use completed episodes only; incomplete configurations show their progress. The original 100-episode RoboTwin results and historical RoboDojo results remain separate. This is a static snapshot, not a live connection to the servers.

## RoboDojo latest evaluation snapshot

The 2026-10-19 RoboDojo section uses the latest formal recorded run per task/configuration (2026-10-16 baseline, 10-17 batch, 10-18 precision rerun, and 10-19 charger/balls rerun). It contains 48 complete configurations of 54 and 1927 completed episodes of 2100. Per-layout outcomes recompute rates and mean stage scores; 10-19 shards are disjoint and merged by layout_id. Smoke/preflight/pilot runs and superseded reruns are excluded. Partial/missing configurations are explicit and not reported as actively running. Original RoboDojo and RoboTwin historical aggregates remain intact. Provenance is in `evaluation-results.json.robodojo_latest`.
