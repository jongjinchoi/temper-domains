"""Run an explicitly prepared disposable installation; preserve its actual output."""
import errno
import codecs
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios
import time
from real_pty_contract import decision, succeeded

root = sys.argv[1]
with open(os.path.join(root, "session.json")) as file:
    session = json.load(file)
assert session.get("startVersion") and session.get("targetVersion"), "Explicit version contract required"
started = time.monotonic()
pid, fd = pty.fork()
if pid == 0:
    fcntl.ioctl(1, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 105, 0, 0))
    os.execve(session["command"][0], session["command"], session["env"])
data = b""
answered = False
rejected = False
exited = False
status = None
decoder = codecs.getincrementaldecoder("utf-8")("replace")
with open(os.path.join(root, "session.cast"), "w") as cast:
    cast.write(json.dumps({"version": 2, "width": 105, "height": 32}) + "\n")
    try:
        while time.monotonic() - started < 300:
            if select.select([fd], [], [], 0.05)[0]:
                try:
                    chunk = os.read(fd, 65536)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                data += chunk
                cast.write(json.dumps([time.monotonic() - started, "o", decoder.decode(chunk)]) + "\n")
                cast.flush()
            action = decision(data.decode(errors="replace"), session["startVersion"], session["targetVersion"], answered)
            if not rejected and action == "cancel":
                os.write(fd, b"\x1b")
                rejected = True
            elif not rejected and action == "confirm" and not (termios.tcgetattr(fd)[3] & termios.ICANON):
                os.write(fd, b"\x1b[A")
                time.sleep(0.1)
                os.write(fd, b"\r")
                answered = True
            done, status = os.waitpid(pid, os.WNOHANG)
            if done:
                exited = True
                break
        else:
            raise TimeoutError("Real updater did not finish in 300 seconds")
    finally:
        if not exited:
            for _ in range(20):
                done, status = os.waitpid(pid, os.WNOHANG)
                if done:
                    exited = True
                    break
                time.sleep(0.05)
        if not exited:
            os.kill(pid, signal.SIGINT)
            time.sleep(0.3)
            done, status = os.waitpid(pid, os.WNOHANG)
            if not done:
                os.kill(pid, signal.SIGKILL)
                _, status = os.waitpid(pid, 0)
        os.close(fd)
        with open(os.path.join(root, "session.raw"), "wb") as file:
            file.write(data)
        result = {"exit": os.waitstatus_to_exitcode(status), "confirmed": answered, "rejectedTarget": rejected,
                  "expectedStart": session["startVersion"], "expectedTarget": session["targetVersion"],
                  "verifying": b"Verifying installation" in data,
                  "success": succeeded(data.decode(errors="replace"), session["startVersion"], session["targetVersion"])}
        with open(os.path.join(root, "pty-result.json"), "w") as file:
            json.dump(result, file, indent=2)
        print(json.dumps(result))
assert not result["rejectedTarget"] and result["exit"] == 0 and result["confirmed"] and result["verifying"] and result["success"], data[-3000:].decode(errors="replace")
