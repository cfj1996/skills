import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import time
import unittest

if os.name == 'posix':
    import pty
    import termios


@unittest.skipUnless(os.name == 'posix' and shutil.which('node'), 'real PTY checks need POSIX and Node')
class SessionInputPtyTests(unittest.TestCase):
    def setUp(self):
        self.master, self.slave = pty.openpty()
        self.original_flags = termios.tcgetattr(self.slave)[3]
        script = Path(__file__).resolve().parents[1] / 'scripts' / 'workflow-session.mjs'
        self.process = subprocess.Popen(['node', str(script), '--json'], stdin=self.slave,
                                        stdout=self.slave, stderr=self.slave)
        self.output = b''
        self.read_until(b'SESSION_READY')
        self.assertFalse(termios.tcgetattr(self.slave)[3] & termios.ICANON)
        self.assertFalse(termios.tcgetattr(self.slave)[3] & termios.ECHO)

    def tearDown(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        os.close(self.master)
        os.close(self.slave)

    def read_until(self, marker):
        deadline = time.monotonic() + 5
        while marker not in self.output:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                self.fail('session did not return the expected marker')
            readable, _, _ = select.select([self.master], [], [], remaining)
            if readable:
                self.output += os.read(self.master, 65536)

    def send(self, data):
        offset = 0
        while offset < len(data):
            offset += os.write(self.master, data[offset:offset + 8192])

    def request(self, identifier, note):
        return (json.dumps({'id': identifier, 'action': 'closeout', 'phase': 'PLAN',
                            'input': {'note': note}}, ensure_ascii=False) + '\n').encode('utf-8')

    def finish(self, code=0):
        self.send(b'\x04' if code == 0 else b'\x03')
        self.assertEqual(self.process.wait(timeout=5), code)
        self.assertEqual(termios.tcgetattr(self.slave)[3] & (termios.ICANON | termios.ECHO),
                         self.original_flags & (termios.ICANON | termios.ECHO))

    def test_long_chinese_json_survives_real_canonical_buffer_limit(self):
        payload = self.request('long-中文-request', '中文素材说明' * 5000)
        self.assertGreater(len(payload), 4096)
        self.send(payload)
        self.read_until(b'NOT_TRIGGERED')
        responses = [json.loads(line) for line in self.output.decode('utf-8').splitlines()
                     if line.startswith('{') and '"id"' in line]
        self.assertEqual(responses[-1]['id'], 'long-中文-request')
        self.assertNotIn('中文素材说明', self.output.decode('utf-8'))
        self.finish()

    def test_oversize_request_is_rejected_and_next_readonly_request_still_works(self):
        self.send(self.request('oversize', 'x' * 270000))
        self.read_until(b'256 KiB')
        self.send(self.request('after-oversize', 'short'))
        self.read_until(b'NOT_TRIGGERED')
        self.assertIn(b'after-oversize', self.output)
        self.finish()

    def test_ctrl_c_restores_terminal_and_exits(self):
        self.finish(130)

    def test_malformed_json_reports_a_generic_error_without_echoing_input(self):
        self.send(b'{"note":"private-note-value", malformed}\n')
        self.read_until(b'BLOCKED')
        self.assertNotIn(b'private-note-value', self.output)
        self.finish()


if __name__ == '__main__':
    unittest.main()
