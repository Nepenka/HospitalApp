// Console controls only for the isolated demo, never the working application.
export function installDemoControls({ input = process.stdin, signals = process, onStop, onNotice = () => {} }) {
  let stopRequested = false;
  let rawEnabled = false;
  let disposed = false;
  const wasRaw = Boolean(input.isRaw);
  const wasPaused = input.isPaused?.() !== false;
  const ignoreInterrupt = () => {
    if (!stopRequested) onNotice("Ctrl+C не останавливает демо. Для остановки нажмите Ctrl+Q.");
  };
  const onData = (chunk) => {
    for (const key of Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) {
      if (key === 0x11 && !stopRequested) {
        stopRequested = true;
        onStop();
      } else if (key === 0x03) ignoreInterrupt();
    }
  };
  signals.on("SIGINT", ignoreInterrupt);
  if (input.isTTY && typeof input.setRawMode === "function") {
    try {
      // Raw console input prevents Ctrl+C from generating a console SIGINT.
      input.setRawMode(true);
      rawEnabled = true;
      input.on("data", onData);
      input.resume();
    } catch {
      onNotice("Терминал не поддерживает Ctrl+Q. Остановить демо можно командой demo:stop из другого окна.");
    }
  }
  return () => {
    if (disposed) return;
    disposed = true;
    signals.removeListener("SIGINT", ignoreInterrupt);
    input.removeListener("data", onData);
    if (rawEnabled) {
      try { input.setRawMode(wasRaw); } catch { /* Console may already be closed. */ }
      if (wasPaused) { input.pause(); input.unref?.(); }
    }
  };
}
