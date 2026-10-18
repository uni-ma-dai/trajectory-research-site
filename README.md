# 轨迹研究地图

公开静态汇报快照。包含代码阅读摘录、实验图表、视频及评分点叠加；不包含模型权重、原始观测或完整研究源码。

https://uni-ma-dai.github.io/trajectory-research-site/

视频与结果来自 2026-10-14 及此前的已记录实验，不是在线推理服务。


## 观测与动作时间轴

入口：`trajectory.html`，首页与评测页均有入口。已接入 2026-10-18 Precision
重跑的真实搭塔回合 1（1050 步，失败）和回合 4（741 步，成功）。这是新一批
实验，不应与 `evaluation.html` 的历史汇总混为同一批成绩。

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
