"""OS PTY checks. Uses only fake child commands and temporary output files."""
import errno
import json
import os
import pty
import select
import signal
import sys
import termios
import tempfile
import time

runtime, entry = sys.argv[1:3]
for scenario in ("later", "cancel", "success", "failure", "interrupt", "input", "logs"):
    with tempfile.TemporaryDirectory(prefix="temper-update-pty-") as home:
        result_path = os.path.join(home, "result.json")
        child_path = os.path.join(home, "child.json")
        pid, fd = pty.fork()
        if pid == 0:
            os.environ["HOME"] = home
            os.environ.pop("CI", None)
            os.execvp(runtime, [runtime, entry, scenario, result_path, child_path])
        data = b""
        stage = 0
        deadline = time.monotonic() + 12
        exited = False
        try:
            while time.monotonic() < deadline:
                ready, _, _ = select.select([fd], [], [], 0.05)
                if ready:
                    try:
                        chunk = os.read(fd, 65536)
                    except OSError as error:
                        if error.errno == errno.EIO:
                            break
                        raise
                    if not chunk:
                        break
                    data += chunk
                if stage == 0 and b"Enter confirm" in data and not (termios.tcgetattr(fd)[3] & termios.ICANON):
                    if scenario == "later":
                        os.write(fd, b"\r")
                    elif scenario == "cancel":
                        os.write(fd, b"\x03")
                    else:
                        os.write(fd, b"\x1b[A")
                        time.sleep(0.08)
                        os.write(fd, b"\r")
                    stage = 1
                if scenario == "interrupt" and stage == 1 and b"CHILD_READY" in data:
                    os.write(fd, b"\x03")
                    stage = 2
                if scenario == "input" and stage == 1 and b"Proceed? " in data:
                    os.write(fd, b"yes\n")
                    stage = 2
                done, status = os.waitpid(pid, os.WNOHANG)
                if done:
                    exited = True
                    assert os.waitstatus_to_exitcode(status) == 0, data.decode(errors="replace")
                    break
            if not exited:
                done, status = os.waitpid(pid, os.WNOHANG)
                exited = bool(done)
                if done:
                    assert os.waitstatus_to_exitcode(status) == 0, data.decode(errors="replace")
            assert os.path.exists(result_path), data.decode(errors="replace")
            with open(result_path) as file:
                result = json.load(file)
            expected = {"later": "later", "cancel": "cancelled", "success": "updated", "failure": "failed", "interrupt": "failed", "input": "updated", "logs": "updated"}[scenario]
            assert result["result"]["kind"] == expected, result
            assert result["raw"] is False, result
            if scenario in ("success", "failure", "interrupt", "input", "logs"):
                with open(child_path) as file:
                    child = json.load(file)
                assert child["tty"] is True and child["outputTTY"] is True and child["raw"] is False, child
                try:
                    os.kill(child["pid"], 0)
                    raise AssertionError("Installer child still running")
                except ProcessLookupError:
                    pass
            if scenario == "input":
                assert b"ANSWER:yes" in data, data
            if scenario == "logs":
                assert b"Removing:" not in data, data[-2000:]
                assert b"Warning: keep this diagnostic" in data, data[-2000:]
            if scenario in ("later", "cancel"):
                assert not os.path.exists(child_path)
            print(f"PTY {scenario}: passed ({runtime}); no package installation")
        finally:
            if not exited:
                for _ in range(20):
                    done, _status = os.waitpid(pid, os.WNOHANG)
                    if done:
                        exited = True
                        break
                    time.sleep(0.05)
            if not exited:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                os.waitpid(pid, 0)
            os.close(fd)
