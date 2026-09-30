"""Real CLI/PTY regression, isolated homes and mocked network, no installations."""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time

runtime, entry = sys.argv[1:3]
group = sys.argv[3] if len(sys.argv) > 3 else 'all'
root = Path(__file__).resolve().parents[2]
bun = Path(runtime).name == 'bun'
preload = root / 'tests/helpers' / ('tui-exit-preload.ts' if bun else 'tui-exit-preload.mjs')
command = [runtime, '--preload' if bun else '--import', str(preload), str(root / entry)]


def cli(env, args):
    result = subprocess.run(command + args, cwd=root, env=env, capture_output=True, text=True, timeout=12)
    assert result.returncode == 0, (args, result.stderr)
    return result.stdout


def mcp(env):
    child = subprocess.Popen(command + ['mcp'], cwd=root, env=env, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    def request(message):
        child.stdin.write(json.dumps(message).encode() + b'\n')
        child.stdin.flush()
        assert select.select([child.stdout], [], [], 12)[0], 'MCP response timeout'
        line = child.stdout.readline()
        assert line, child.stderr.read().decode()
        return json.loads(line)
    try:
        response = request(dict(jsonrpc='2.0', id=1, method='initialize', params=dict(
            protocolVersion='2024-11-05', capabilities={}, clientInfo=dict(name='exit-test', version='1'))))
        assert 'result' in response, response
        child.stdin.write(b'{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
        child.stdin.flush()
        response = request(dict(jsonrpc='2.0', id=2, method='tools/call', params=dict(
            name='whois_domain', arguments=dict(domain='afterexit.com'))))
        assert 'Status: available' in json.dumps(response), response
    finally:
        child.stdin.close()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
            raise
        child.stdout.close()
        child.stderr.close()


def terminal(env, args, mode='', key=b'q', signal_number=None):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 110, 0, 0))
    child = subprocess.Popen(command + args, cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave)
    home = Path(env['TEMPER_TEST_HOME'])
    output = b''
    step = 0
    sent = False
    released = False
    signalled_at = 0.0
    requests_at_exit = None
    deadline = time.monotonic() + 12
    try:
        while child.poll() is None and time.monotonic() < deadline:
            if select.select([master], [], [], 0.005)[0]:
                output += os.read(master, 65536)
            raw = not (termios.tcgetattr(slave)[3] & termios.ICANON)
            if raw and not sent:
                if mode == 'init':
                    if step == 0 and b'Choose a theme' in output:
                        os.write(master, b'\r'); step = 1
                elif mode == 'history' and step == 0 and b'reviewhistory' in output:
                    os.write(master, b'd'); step = 1
                elif mode == 'watch' and step == 0 and b'Confirm purchase availability' in output:
                    os.write(master, b'a'); step = 1
                ready = (mode == 'complete' and b'Confirm purchase availability' in output) or (mode != 'complete' and (home / 'gate-entered').exists())
                if ready:
                    requests_at_exit = (home / 'requests').read_bytes() if (home / 'requests').exists() else b''
                    if signal_number is None: os.write(master, key)
                    else: os.kill(child.pid, signal_number)
                    sent = True
                    signalled_at = time.monotonic()
            # A signal must not end the process while the gated transaction holds its lock.
            if sent and signal_number is not None and not released and time.monotonic() - signalled_at > 0.2:
                assert child.poll() is None, (args, 'exited before the transaction finished')
                (home / 'gate-release').touch(); released = True
            if sent and signal_number is None and not raw and not released:
                (home / 'gate-release').touch(); released = True
        child.wait(timeout=1)
        while select.select([master], [], [], 0)[0]:
            output += os.read(master, 65536)
        expected = 0 if signal_number is None else 128 + signal_number
        assert child.returncode == expected, (args, child.returncode, output.decode(errors='replace'))
        assert termios.tcgetattr(slave)[3] & termios.ICANON, 'terminal left in raw mode'
        if mode:
            assert sent, (mode, 'gate never reached', output.decode(errors='replace'))
            requests_after = (home / 'requests').read_bytes() if (home / 'requests').exists() else b''
            assert requests_after == requests_at_exit, (mode, 'new network request after exit')
        return output.decode(errors='replace')
    finally:
        if child.poll() is None:
            child.kill(); child.wait()
        os.close(master); os.close(slave)


def environment(home):
    home = os.path.realpath(home)
    env = dict(os.environ, HOME=home, TEMPER_TEST_HOME=home, TEMPER_NO_UPDATE_CHECK='1', TERM='xterm-256color')
    for key in ['CI', 'CONTINUOUS_INTEGRATION', 'BUILD_NUMBER']:
        env.pop(key, None)
    return env


if group in ('all', 'exit'):
    cases = [
        ('search', ['search', 'reviewexit', '--tlds', 'com'], 'state/lookup-limits.json'),
        ('suggest', ['suggest', 'reviewexit'], 'state/lookup-limits.json'),
        ('whois', ['whois', 'reviewexit.com'], 'state/lookup-limits.json'),
        ('list', ['list'], 'state/lookup-limits.json'),
        ('init', ['init'], 'config.json'),
        ('history', ['history'], 'history.json'),
        ('watch', ['search', 'reviewexit', '--tlds', 'com'], 'watchlist.json'),
    ]
    for mode, args, target in cases:
        for phase, key in [('lock-write', b'q'), ('rename', b'\x1b'), ('cleanup', b'\x03')]:
            with tempfile.TemporaryDirectory(prefix='temper-exit-') as home:
                folder = Path(home) / '.temper'; folder.mkdir()
                (folder / 'history.json').write_text(json.dumps([dict(query='reviewhistory', timestamp='2026-09-27T00:00:00Z', available=1, total=1)]))
                (folder / 'watchlist.json').write_text(json.dumps([dict(domain='reviewexit.com', addedAt='2026-09-27T00:00:00Z')]))
                env = environment(home)
                env.update(TEMPER_GATE_TARGET=target, TEMPER_GATE_PHASE=phase)
                # Add a different domain, otherwise watch insertion is a no-op.
                if mode == 'watch': args = ['search', 'newwatch', '--tlds', 'com']
                terminal(env, args, mode, key)
                assert not list(folder.rglob('*.lock')), (mode, phase, 'orphan lock')
                assert not list(folder.rglob('*.tmp')), (mode, phase, 'orphan temporary file')
                for path in folder.rglob('*.json'): json.loads(path.read_text())
                state = folder / 'state/lookup-limits.json'
                if state.exists():
                    assert all(not server['leases'] for server in json.loads(state.read_text())['servers'].values()), state.read_text()
                env.pop('TEMPER_GATE_PHASE')
                assert json.loads(cli(env, ['search', 'afterexit', '--tlds', 'com', '-f', 'json']))[0]['status'] == 'available'
                mcp(env)
                cli(env, ['config', 'theme', 'dracula'])
                cli(env, ['watch', 'afterexit.com'])
                if mode == 'history':
                    terminal(env, ['search', 'newhistory', '--tlds', 'com'], 'complete')
                    assert any(row['query'] == 'newhistory' for row in json.loads((folder / 'history.json').read_text()))
                print(f'PASS {mode}/{phase}', flush=True)

if group in ('all', 'signal'):
    # SIGHUP (closed window), SIGTERM and an external SIGINT must let the
    # transaction finish: no orphan lock, and the next lookup still answers.
    for name in ['SIGHUP', 'SIGTERM', 'SIGINT']:
        for phase in ['lock-write', 'rename', 'cleanup']:
            with tempfile.TemporaryDirectory(prefix='temper-signal-') as home:
                folder = Path(home) / '.temper'; folder.mkdir()
                env = environment(home)
                env.update(TEMPER_GATE_TARGET='state/lookup-limits.json', TEMPER_GATE_PHASE=phase)
                terminal(env, ['search', 'reviewsignal', '--tlds', 'com'], 'search', signal_number=getattr(signal, name))
                assert not list(folder.rglob('*.lock')), (name, phase, 'orphan lock')
                assert not list(folder.rglob('*.tmp')), (name, phase, 'orphan temporary file')
                env.pop('TEMPER_GATE_PHASE')
                assert json.loads(cli(env, ['search', 'aftersignal', '--tlds', 'com', '-f', 'json']))[0]['status'] == 'available'
                print(f'PASS signal/{name}/{phase}', flush=True)

if group in ('all', 'settings'):
    for content, denied in [('{', False), ('[]', False), ('{"theme":"dracula"}', True)]:
        with tempfile.TemporaryDirectory(prefix='temper-settings-') as home:
            folder = Path(home) / '.temper'; folder.mkdir()
            config = folder / 'config.json'; config.write_text(content)
            env = environment(home)
            if denied: env['TEMPER_CONFIG_DENIED'] = '1'
            assert json.loads(cli(env, ['search', 'settings', '--tlds', 'com', '-f', 'json']))[0]['status'] == 'available'
            assert json.loads(cli(env, ['whois', 'settings.com', '-f', 'json']))['status'] == 'available'
            mcp(env)
            help_text = terminal(env, ['--help'])
            assert 'Usage:' in help_text, help_text
            assert help_text.count('Could not read settings') == 1, help_text
            assert 'Usage:' in cli(env, ['--help'])
            assert cli(env, ['--version']).strip()
            failed = subprocess.run(command + ['config', 'theme', 'seoul-night'], cwd=root, env=env, capture_output=True, timeout=10)
            assert failed.returncode == 1
            assert config.read_text() == content
            print(f'PASS settings/{"denied" if denied else content}', flush=True)
