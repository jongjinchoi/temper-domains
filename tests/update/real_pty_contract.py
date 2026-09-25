"""Version gate for the disposable real-install PTY harness."""
import re

def visible(text):
    return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)

def decision(text, start, target, answered):
    text = visible(text)
    if "Homebrew offers a different version" in text:
        return "cancel"
    prompts = re.findall(r"Update available!\s+(\d+\.\d+\.\d+)\s+→\s+(\d+\.\d+\.\d+)", text)
    if not prompts or "Enter confirm" not in text:
        return "wait"
    if any(pair != (start, target) for pair in prompts):
        return "cancel"
    return "wait" if answered else "confirm"

def succeeded(text, start, target):
    pairs = re.findall(r"Temper updated:\s+(\d+\.\d+\.\d+)\s+→\s+(\d+\.\d+\.\d+)(?![\w.])", visible(text))
    return bool(pairs) and all(pair == (start, target) for pair in pairs)
