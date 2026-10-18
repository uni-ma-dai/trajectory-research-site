"""Replay recorded Pi0.5 observations and export action-to-image attention.

Run in the original OpenPI environment on an idle GPU. Does not edit model code.
Uses recorded input and RNG; rejects changed preprocessing or action drift > 1e-3.
"""
import argparse
import inspect
import json
import textwrap
from pathlib import Path

import jax
import numpy as np
from PIL import Image
from export_trace_viewer import load_tree
from openpi.models import gemma, model
from openpi.policies import policy_config
from openpi.training import config
from openpi.shared import normalize


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--checkpoint', required=True)
    p.add_argument('--limit', type=int, default=0)
    args = p.parse_args()
    captured = []
    def capture(x):
        captured.append(np.asarray(x, dtype=np.float32))
    original = gemma.Attention.__call__
    code = textwrap.dedent(inspect.getsource(original))
    needle = 'probs = jax.nn.softmax(masked_logits, axis=-1).astype(dtype)'
    assert code.count(needle) == 1
    code = code.replace(needle, needle + '\n    if kv_cache is not None and xs[0] is None:\n        jax.debug.callback(_capture_attention, probs[..., -50:, :768].astype(jnp.float32).mean(axis=(0, 1, 2, 3)))')
    namespace = dict(vars(gemma), _capture_attention=capture)
    exec(code, namespace)
    # Flax normally wraps methods when constructing the class; preserve that
    # scope handling when installing a runtime-only method on an existing class.
    gemma.Attention.__call__ = gemma.nn.module.wrap_method_once(namespace['__call__'])
    assert tuple(model.IMAGE_KEYS) == ('base_0_rgb', 'left_wrist_0_rgb', 'right_wrist_0_rgb')
    cfg = config.get_config('pi05_base_aloha_full_sim_arx-x5_seed_0')
    policy = policy_config.create_trained_policy(cfg, args.checkpoint,
        norm_stats=normalize.load(Path(args.checkpoint) / 'assets/arx_x5_sim'))
    files = sorted((args.source / 'policy').glob('infer-*.npz'))
    if args.limit: files = files[:args.limit]
    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    for i, path in enumerate(files):
        trace = load_tree(path)
        assert not trace['sample_kwargs'], 'Non-default sampling needs explicit support'
        for image in trace['raw_input']['images'].values():
            assert np.asarray(image).shape in ((3, 480, 640), (480, 640, 3)), 'Unexpected raw geometry'
        actual = policy._input_transform(jax.tree.map(lambda x: x.copy() if isinstance(x, np.ndarray) else x, trace['raw_input']))
        expected = trace['model_input']
        for a, b in zip(jax.tree.leaves(actual), jax.tree.leaves(expected), strict=True):
            np.testing.assert_array_equal(a, b)
        policy._rng = jax.random.wrap_key_data(trace['rng_before'])
        captured.clear()
        output = policy.infer(trace['raw_input'], **trace['infer_kwargs'])
        jax.effects_barrier()
        drift = float(np.max(np.abs(output['actions'] - trace['output']['actions'])))
        assert drift < 1e-3, f'Replay changed actions: {drift}'
        assert len(captured) == 180, f'Expected 18 layers x 10 denoising steps, got {len(captured)}'
        weights = np.mean(captured, axis=0).reshape(3, 16, 16)
        assert np.isfinite(weights).all() and weights.min() >= 0
        maps = {}
        for c, key in enumerate(['head', 'left', 'right']):
            # One shared scale across all three cameras in this observation.
            v = weights[c] / max(float(weights.max()), 1e-12)
            rgba = np.zeros((16, 16, 4), dtype=np.uint8)
            rgba[..., 0] = 255
            rgba[..., 1] = (220 * (1 - v)).astype(np.uint8)
            rgba[..., 3] = (255 * v).astype(np.uint8)
            heat = Image.fromarray(rgba).resize((224, 224), Image.Resampling.BILINEAR)
            name = f'{i:04d}-{key}.png'
            heat.save(args.output / name)
            raw_name = f'{i:04d}-{key}-raw.png'
            heat.crop((0, 28, 224, 196)).resize((640, 480), Image.Resampling.BILINEAR).save(args.output / raw_name)
            maps[key] = dict(src=f'attention/{name}', raw_src=f'attention/{raw_name}', weights=weights[c].tolist(), mass=float(weights[c].sum()))
        records.append(dict(id=i, maps=maps, replay_max_action_error=drift, samples=len(captured)))
        (args.output / 'attention.json').write_text(json.dumps(dict(schema=1,
            method='action-query to image-key softmax attention, mean over 50 action queries, all heads, 18 layers and 10 flow steps',
            scale='shared maximum across three cameras per observation', checkpoint=args.checkpoint,
            grid=[16,16], model_image=[224,224], raw_content_box=[0,28,224,196],
            source_attempt=args.source.name, records=records)), encoding='utf-8')
        print(json.dumps(dict(inference=i, samples=len(captured), drift=drift, image_mass=float(weights.sum()))), flush=True)
    episode_path = args.output.parent / 'episode.json'
    if episode_path.exists():
        episode = json.loads(episode_path.read_text())
        assert episode['source_attempt'] == args.source.name
        for record in records:
            episode['chunks'][record['id']]['attention'] = record
        episode['attention'] = json.loads((args.output / 'attention.json').read_text())
        del episode['attention']['records']
        episode_path.write_text(json.dumps(episode, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
