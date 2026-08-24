import api from "../services/api";

export const browserSupportsPush = () => (
  window.isSecureContext
  && "Notification" in window
  && "serviceWorker" in navigator
  && "PushManager" in window
);

export const readyServiceWorker = (timeoutMs = 5000) => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error("service-worker-timeout")), timeoutMs);
  }),
]);

const urlBase64ToUint8Array = (value) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

export const pushSubscriptionPayload = (subscription) => {
  const json = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: json.keys };
};

export async function enableCurrentPushSubscription(vapidPublicKey) {
  if (!browserSupportsPush()) throw new Error("push-not-supported");
  if (!vapidPublicKey) throw new Error("missing-vapid-key");

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") throw new DOMException("Permission denied", "NotAllowedError");

  const registration = await readyServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  await api.put("/push", pushSubscriptionPayload(subscription));
  return subscription;
}

export async function removeCurrentPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await api.post("/push/unsubscribe", { endpoint: subscription.endpoint });
  } finally {
    await subscription.unsubscribe();
  }
}
