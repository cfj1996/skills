import { PassThrough } from 'node:stream';

// A PTY's canonical input buffer can discard the tail of a long JSON line
// before Node receives it. Change only this process's own stdin, never another TTY.
export function sessionInput(input = process.stdin, onInterrupt = () => {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return { stream: input, mode: 'pipe', restore() {} };
  }
  const initiallyRaw = input.isRaw === true;
  input.setRawMode(true);
  const stream = new PassThrough();
  let ended = false, restored = false;
  const data = value => {
    if (ended) return;
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const interrupt = chunk.indexOf(3), eof = chunk.indexOf(4);
    if (interrupt !== -1 && (eof === -1 || interrupt < eof)) {
      ended = true;
      onInterrupt();
      return;
    }
    if (eof !== -1) {
      ended = true;
      if (eof) stream.write(chunk.subarray(0, eof));
      stream.end(); input.pause();
      return;
    }
    stream.write(chunk);
  };
  const end = () => { ended = true; stream.end(); };
  const error = value => stream.destroy(value);
  input.on('data', data); input.on('end', end); input.on('error', error);
  input.resume();
  return { stream, mode: 'raw-tty', restore() {
    if (restored) return;
    restored = true;
    input.off('data', data); input.off('end', end); input.off('error', error);
    input.pause(); input.setRawMode(initiallyRaw);
    stream.destroy();
  } };
}
