"""Exercise the real history CLI in a local PTY with an isolated home."""
import errno
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time

with tempfile.TemporaryDirectory(prefix="temper-list-pty-") as home:
    os.mkdir(os.path.join(home, ".temper"))
    with open(os.path.join(home, ".temper", "history.json"), "w") as file:
        json.dump([dict(query=f"sample{i}", timestamp="2026-09-27T23:30:00Z", available=1, total=1) for i in range(100)], file)
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 110, 0, 0))
    env = dict(os.environ, TEMPER_TEST_HOME=home, TEMPER_NO_UPDATE_CHECK="1", TZ="Asia/Seoul", TERM="xterm-256color")
    child = subprocess.Popen(["bun", "--preload", "./tests/helpers/home.ts", "src/index.ts", "history"], stdin=slave, stdout=slave, stderr=slave, env=env)
    os.close(slave)

    def read_until(token):
        data = b""
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if select.select([master], [], [], 0.05)[0]:
                try:
                    data += os.read(master, 65536)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    break
                plain = re.sub(rb"\x1b\[[0-?]*[ -/]*[@-~]", b"", data)
                if re.search(token, plain):
                    return data
        raise AssertionError(f"PTY did not show {token!r}: {data[-3000:]!r}")

    try:
        initial = read_until(b"sample0")
        assert b"2026-09-28 08:30" in initial
        for index in range(1, 100):
            os.write(master, b"j")
            read_until("▸".encode() + rb"[^\n]*sample" + str(index).encode() + rb"\s")
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 20, 80, 0, 0))
        os.kill(child.pid, signal.SIGWINCH)
        read_until(b"sample99")
        os.write(master, b"q")
        deadline = time.monotonic() + 5
        while child.poll() is None and time.monotonic() < deadline:
            if select.select([master], [], [], 0.05)[0]:
                try:
                    os.read(master, 65536)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    break
        child.wait(timeout=1)
        assert child.returncode == 0
        print("PTY history: local date, last-row navigation, resize and quit passed (Bun)")
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=2)
        os.close(master)
