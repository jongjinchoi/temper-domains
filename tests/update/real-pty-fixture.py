"""Controlled launcher for the harness gate tests. Never invokes an installer."""
import os
import select
import sys
import tty

tty.setraw(0)
mode = sys.argv[1]
def emit(value):
    os.write(1, value.encode())
def answer():
    data = b""
    while select.select([0], [], [], 2)[0]:
        data += os.read(0, 1024)
        if b"\r" in data or data == b"\x1b":
            return data
    return data

target = '3.0.0' if mode == 'mismatch' else '2.0.0'
emit(f'Update available! 1.0.0 → {target}\r\nEnter confirm\r\n')
first = answer()
if mode == 'mismatch':
    assert first == b'\x1b', repr(first)
elif mode == 'changed':
    assert b'\r' in first
    emit('Update available! 1.0.0 → 3.0.0\r\nHomebrew offers a different version. Approve this version to continue.\r\nEnter confirm\r\n')
    assert answer() == b'\x1b'
else:
    assert b'\r' in first
    if mode == 'cancel':
        emit('Update cancelled\r\n')
    else:
        emit('Verifying installation\r\n')
        emit(f'Temper updated: 1.0.0 → {"3.0.0" if mode == "wrong-result" else "2.0.0"}\r\n')
