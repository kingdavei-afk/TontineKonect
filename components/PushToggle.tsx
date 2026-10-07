"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/actions";

type State = "loading" | "off" | "on" | "saving" | "denied" | "unsupported" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64_ = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64_);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

const LABELS: Record<State, string> = {
  loading: "Rappels…",
  off: "Activer les rappels",
  on: "Rappels actifs ✓",
  saving: "Activation…",
  denied: "Rappels bloqués",
  unsupported: "Rappels indisponibles",
  error: "Réessayer",
};

const TITLES: Record<State, string> = {
  loading: "Vérification des notifications",
  off: "Recevoir une notification à J-2, le jour de l'échéance et en cas de retard.",
  on: "Notifications activées : vous serez prévenu avant chaque cotisation.",
  saving: "Demande d'autorisation…",
  denied: "Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur.",
  unsupported: "Ce navigateur ne prend pas en charge les notifications push.",
  error: "Impossible d'activer les rappels, réessayez.",
};

export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) setState("on");
        else setState(Notification.permission === "denied" ? "denied" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (state === "on" || state === "saving") return;
    if (state === "denied" || state === "unsupported") return;
    setState("saving");
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }
        const permission =
          Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
        if (permission !== "granted") {
          setState("denied");
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const res = await savePushSubscription(sub.toJSON());
      setState(res.ok ? "on" : "error");
    } catch (err) {
      console.error("push subscribe", err);
      setState("error");
    }
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (err) {
      console.error("push unsubscribe", err);
    }
    setState("off");
  }

  const active = state === "on";

  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        onClick={active ? disable : toggle}
        disabled={state === "loading" || state === "saving"}
        title={TITLES[state]}
        aria-label={LABELS[state]}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${
          active
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border border-stone-300 text-stone-600 hover:border-stone-400"
        }`}
      >
        <span aria-hidden>{active ? "🔔" : "🔕"}</span>
        <span className="hidden md:inline">{LABELS[state]}</span>
      </button>
      <span className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden w-64 rounded-xl bg-stone-900 px-3 py-2 text-xs leading-snug text-white shadow-lg group-hover:block">
        {TITLES[state]}
      </span>
    </div>
  );
}
