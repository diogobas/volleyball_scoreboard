#!/usr/bin/env python3
"""Publish the reviewed static build to a dedicated branch; never merge master."""
import json
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = 'diogobas/volleyball_scoreboard'

def run(*args, cwd=ROOT, capture=False, payload=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, input=payload,
                          stdout=subprocess.PIPE if capture else None).stdout

# Check before pushing, so an existing site's source/domain is preserved.
probe = subprocess.run(['gh', 'api', f'repos/{REPO}/pages'], text=True, capture_output=True)
if probe.returncode and '404' not in probe.stderr:
    raise SystemExit(probe.stderr)
config = json.loads(probe.stdout) if not probe.returncode else None
if config and config.get('source', {}).get('branch') != 'gh-pages':
    raise SystemExit('Pages already uses another source; check its configuration before switching.')

run('pnpm', 'run', 'build:public')
with tempfile.TemporaryDirectory(prefix='volleyball-pages-') as directory:
    target = pathlib.Path(directory)
    run('git', 'init', '-b', 'gh-pages', cwd=target)
    run('git', 'remote', 'add', 'origin', f'https://github.com/{REPO}.git', cwd=target)
    existing = run('git', 'ls-remote', '--heads', 'origin', 'gh-pages', cwd=target, capture=True)
    if existing.strip():
        run('git', 'fetch', '--depth=1', 'origin', 'gh-pages', cwd=target)
        run('git', 'checkout', '-B', 'gh-pages', 'FETCH_HEAD', cwd=target)
    for path in target.iterdir():
        if path.name != '.git':
            shutil.rmtree(path) if path.is_dir() else path.unlink()
    shutil.copytree(ROOT / 'dist-public', target, dirs_exist_ok=True)
    (target / '.nojekyll').touch()
    if config and config.get('cname'):
        (target / 'CNAME').write_text(config['cname'] + '\n')
    run('git', 'add', '.', cwd=target)
    changed = subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=target).returncode
    if changed:
        version = json.loads((ROOT / 'package.json').read_text())['version']
        run('git', 'commit', '-m', f'Publish public results {version}', cwd=target)
        run('git', 'push', 'origin', 'gh-pages', cwd=target)

if config is None:
    run('gh', 'api', '--method', 'POST', f'repos/{REPO}/pages', '--input', '-',
        payload=json.dumps({'build_type': 'legacy', 'source': {'branch': 'gh-pages', 'path': '/'}}))
print(f'Published branch. Track deployment: https://github.com/{REPO}/actions')
print('Public URL: https://diogobas.github.io/volleyball_scoreboard/')
