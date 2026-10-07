export async function register() {
  // La boucle de rappels ne tourne que côté Node (jamais sur l'edge).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startReminderScheduler } = await import("./lib/reminders");
    startReminderScheduler();
    console.log("[instrumentation] planificateur de rappels démarré");
  }
}
