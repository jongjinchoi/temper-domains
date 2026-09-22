"""Real PTY checks for static startup/help; no network or package installation."""
import os, pty, fcntl, struct, termios, re, sys, select, time, signal
runtime, entry = sys.argv[1:3]
ansi = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
for width in (40, 80):
    for args in (["help"], ["--help"], ["search", "--help"], ["help", "search"], ["update", "--help"], []):
        pid, fd = pty.fork()
        if pid == 0:
            fcntl.ioctl(1, termios.TIOCSWINSZ, struct.pack('HHHH', 50, width, 0, 0))
            env = {**os.environ, "TEMPER_NO_UPDATE_CHECK": "1", "NO_COLOR": "1", "TERM": "xterm-256color"}
            env.pop("CI", None)
            env.pop("CONTINUOUS_INTEGRATION", None)
            env.pop("BUILD_NUMBER", None)
            env.pop("FORCE_COLOR", None)
            os.execvpe(runtime, [runtime, entry, *args], env)
        data = b""
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if not select.select([fd], [], [], 0.1)[0]: continue
            try: chunk = os.read(fd, 65536)
            except OSError: break
            if not chunk: break
            data += chunk
        else:
            os.kill(pid, signal.SIGKILL)
        _, status = os.waitpid(pid, 0)
        os.close(fd)
        text = ansi.sub('', data.decode()).replace('\r', '')
        assert os.waitstatus_to_exitcode(status) == 0, text
        assert '╭' in text and '╰' in text, text
        assert all(len(line) <= width for line in text.splitlines()), text
        if not args:
            assert 'Temper' in text and '<name>' in text and '<idea>' in text, text
        else:
            assert 'Usage:' in text, text
        print(f'PASS {width} columns: {args or ["temper"]}')
