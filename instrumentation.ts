export async function register() {
  // Schéma et boucle de rappels ne tournent que côté Node (jamais sur l'edge).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSchema } = await import("./lib/db");
    await ensureSchema(); // CREATE TABLE IF NOT EXISTS, idempotent à chaque démarrage
    const { startReminderScheduler } = await import("./lib/reminders");
    startReminderScheduler();
    console.log("[instrumentation] schéma vérifié, planificateur de rappels démarré");
  }
}
