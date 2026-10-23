// Runs once when the server starts (Next.js instrumentation). Starts the minute ticker
// that sends each shop's daily Telegram report at the time it chose. Only in the
// production server, so a developer's machine never messages a shop. BACKGROUND_JOBS=off
// keeps it quiet on a copy being tested on another server (a move), so shops get one report.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.BACKGROUND_JOBS !== "off") {
    const { startReportScheduler } = await import("./lib/reportScheduler");
    startReportScheduler();
  }
}
