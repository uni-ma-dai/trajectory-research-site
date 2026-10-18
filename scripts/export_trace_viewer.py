"""Export one completed RoboDojo recorded episode to a portable static viewer bundle.

Run in the recording environment (NumPy, Pillow, ffmpeg, ffprobe required).
No simulator/GPU is loaded. Source recordings are read-only.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def load_tree(path):
    with np.load(path, allow_pickle=False) as z:
        def decode(v):
            if 'dict' in v: return {k: decode(x) for k, x in v['dict']}
            if 'list' in v: return [decode(x) for x in v['list']]
            if 'tuple' in v: return tuple(decode(x) for x in v['tuple'])
            if 'bytes' in v: return decode(v['bytes']).tobytes()
            if 'array' in v: return z[v['array']].copy()
            return v['scalar']
        return decode(json.loads(str(z['__tree__'])))


def number(x):
    return int(np.asarray(x).reshape(-1)[0])


def export(source, dest):
    source = source.resolve()
    if dest.exists(): raise ValueError('Output must be a new directory')
    meta = json.loads((source / 'metadata.json').read_text())
    result = json.loads((source / 'result.json').read_text())
    assert result['completed']
    dest.mkdir(parents=True)
    (dest / 'images').mkdir()
    (dest / 'video').mkdir()
    steps = []
    for p in sorted((source / 'execution').glob('step-*.npz')):
        d = load_tree(p)
        steps.append(dict(step=d['step'], infer_id=d['infer_id'], chunk_index=d['chunk_index'],
                          before=number(d['before']['control_count']), after=number(d['after']['control_count']),
                          physics_before=d['before']['physics_step'], physics_after=d['after']['physics_step'],
                          wall_start=d['wall_start'], wall_end=d['wall_end']))
    assert len(steps) == result['steps'] and [s['step'] for s in steps] == list(range(len(steps)))
    cameras = [('head', 'cam_head', 'cam_high', 'base_0_rgb', '头部'),
               ('left', 'cam_left_wrist', 'cam_left_wrist', 'left_wrist_0_rgb', '左腕'),
               ('right', 'cam_right_wrist', 'cam_right_wrist', 'right_wrist_0_rgb', '右腕')]
    chunks, raw_frames = [], {c[0]: [] for c in cameras}
    for i, p in enumerate(sorted((source / 'policy').glob('infer-*.npz'))):
        d = load_tree(p)
        env = load_tree(source / 'inference_env' / p.name)
        executed = [s for s in steps if s['infer_id'] == i]
        actions = np.asarray(d['output']['actions'])
        assert np.isfinite(actions).all()
        assert [s['chunk_index'] for s in executed] == list(range(len(executed)))
        images = {}
        for key, _, rawkey, modelkey, _ in cameras:
            raw = np.asarray(d['raw_input']['images'][rawkey])
            if raw.shape[0] == 3: raw = raw.transpose(1, 2, 0)
            model = np.asarray(d['model_input']['image'][modelkey])
            assert raw.dtype == model.dtype == np.uint8, 'Do not silently rescale model input'
            images[key] = {}
            for kind, arr in [('raw', raw), ('model', model)]:
                name = f'images/{i:04d}-{key}-{kind}.png'
                Image.fromarray(arr).save(dest / name)
                images[key][kind] = name
            raw_frames[key].append(raw)
        chunks.append(dict(id=i, observation_step=number(env['control_count']),
                           physics_step=env['physics_step'], wall_start=d['wall_start'], wall_end=d['wall_end'],
                           predicted=len(actions), executed=len(executed),
                           start=executed[0]['step'], end=executed[-1]['step'] + 1,
                           actions=actions.tolist(), images=images))
    assert len(chunks) == result['inferences']
    video = {}
    frame_ids = [c['observation_step'] for c in chunks]
    for key, native, _, _, label in cameras:
        matches = list(Path(meta['video_directory']).glob(f"episode_{meta['video_episode_index']:07d}_{native}_*.mp4"))
        assert len(matches) == 1, matches
        src = matches[0]
        stream = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=nb_frames,r_frame_rate,width,height,duration', '-of', 'json', str(src)]))['streams'][0]
        count = int(stream['nb_frames'])
        assert count == len(steps) + 1, 'Cannot infer video frame mapping: expected steps + terminal frame'
        num, den = map(int, stream['r_frame_rate'].split('/'))
        # Verify candidate mapping against the actual observation pixels, allowing MP4 compression error.
        select = '+'.join(f'eq(n,{n})' for n in frame_ids)
        data = subprocess.check_output(['ffmpeg', '-v', 'error', '-threads', '1', '-i', str(src),
            '-vf', f"select='{select}'", '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
        frames = np.frombuffer(data, dtype=np.uint8).reshape(len(frame_ids), stream['height'], stream['width'], 3)
        errors = [float(np.abs(a.astype(np.float32) - b.astype(np.float32)).mean()) for a, b in zip(frames, raw_frames[key])]
        assert max(errors) < 12, f'{key}: video/observation mapping mismatch {max(errors)}'
        name = f'video/{key}.mp4'
        shutil.copyfile(src, dest / name)
        video[key] = dict(src=name, label=label, fps=num / den, frames=count,
                          width=stream['width'], height=stream['height'],
                          alignment_mae=errors, source_filename=src.name,
                          sha256=hashlib.sha256(src.read_bytes()).hexdigest())
    payload = dict(schema=1, benchmark='RoboDojo', task=meta['task'], layout_id=meta['layout_id'],
                   episode_index=meta['video_episode_index'], success=bool(result['success']),
                   steps=len(steps), instruction=d['raw_input'].get('prompt', ''),
                   run=source.parents[3].name, source_attempt=source.name,
                   alignment=dict(method='control-step/frame-index; checked against decoded RGB at every inference',
                                  capture_timestamp_available=False, terminal_frame=True,
                                  note='推理请求状态与视频帧按控制步对应；所有推理点经 RGB 对比校验。未记录相机独立采集时间或缓存年龄。'),
                   videos=video, chunks=chunks, execution=steps)
    (dest / 'episode.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps(dict(output=str(dest), steps=len(steps), chunks=len(chunks),
                         max_alignment_mae={k: max(v['alignment_mae']) for k, v in video.items()})))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('attempt', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    export(args.attempt, args.output)
