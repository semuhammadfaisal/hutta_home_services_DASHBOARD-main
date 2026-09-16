function createCommercialReportWorker({ run, connected = () => true, intervalMs = 15 * 60 * 1000, setTimer = setInterval, clearTimer = clearInterval, logger = console }) {
  let timer = null, running = false;
  const tick = async () => {
    if (running || !connected()) return;
    running = true;
    try { return await run(); } catch (error) { logger.error('Commercial report scheduler failed:', error.message); }
    finally { running = false; }
  };
  return { tick, start() { if (timer) return; timer = setTimer(tick, intervalMs); timer.unref?.(); tick(); }, stop() { if (timer) clearTimer(timer); timer = null; } };
}
module.exports = { createCommercialReportWorker };
