"""Real CLI/PTY, with update check results mocked (fresh lookup is unit-tested)."""
import os, pty, tempfile, json, select, time, signal, sys, termios
runtime = sys.argv[1]
with tempfile.TemporaryDirectory(prefix="temper-automatic-") as home:
    os.makedirs(os.path.join(home, ".temper", "cache"))
    with open(os.path.join(home, ".temper", "cache", "update.json"), "w") as file:
        json.dump({"postponedAt": int(time.time()*1000), "latest": "0.5.1"}, file)
    scenarios = [("0.5.1", "0.5.2", False), ("0.5.1", "0.5.2", False),
                 ("0.5.2", "0.5.2", False), ("0.5.2", "0.5.3", False),
                 ("0.5.2", "0.5.3", True)]
    for current, latest, fail in scenarios:
        with open(os.path.join(home, "scenario.json"), "w") as file:
            json.dump(dict(current=current, latest=latest, fail=fail), file)
        pid, fd = pty.fork()
        if pid == 0:
            env = {**os.environ, "TEMPER_TEST_HOME": home, "NO_COLOR": "1"}
            for name in ("CI", "CONTINUOUS_INTEGRATION", "BUILD_NUMBER", "TEMPER_NO_UPDATE_CHECK"):
                env.pop(name, None)
            os.execvpe(runtime, [runtime, "--preload", "./tests/helpers/automatic-update.ts", "src/index.ts"], env)
        data = b""; answered = False
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if select.select([fd], [], [], .05)[0]:
                try: chunk = os.read(fd, 65536)
                except OSError: break
                if not chunk: break
                data += chunk
            if b"Enter confirm" in data and not answered and not (termios.tcgetattr(fd)[3] & termios.ICANON):
                time.sleep(.05)
                os.write(fd, b"\r")
                answered = True
        else:
            os.kill(pid, signal.SIGKILL)
        _, status = os.waitpid(pid, 0); os.close(fd)
        text = data.decode(errors="replace")
        assert os.waitstatus_to_exitcode(status) == 0, (os.waitstatus_to_exitcode(status), answered, text)
        assert ("Update available!" in text) == (current != latest and not fail), text
        assert ("Could not check for updates" in text) == fail, text
        assert "<name>" in text and "<idea>" in text, text
        assert "Updating Temper" not in text, text
        print(f"PASS automatic {current} -> {latest}, fail={fail}, welcome resumes")
    with open(os.path.join(home, "checks.log")) as file:
        assert len(file.readlines()) == len(scenarios)
