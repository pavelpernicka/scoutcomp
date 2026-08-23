import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import Alert from "./Alert";
import Button from "./Button";

export function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

const browserSupportsPush = () => (
  window.isSecureContext
  && "Notification" in window
  && "serviceWorker" in navigator
  && "PushManager" in window
);

const readyServiceWorker = (timeoutMs = 5000) => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error("service-worker-timeout")), timeoutMs);
  }),
]);

const subscriptionPayload = (subscription) => {
  const json = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: json.keys };
};

export function PushNotificationSettings() {
  const { t } = useTranslation();
  const [state, setState] = useState("loading");
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [showPreviews, setShowPreviews] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get("/push/config");
        if (!active) return;
        if (!data.enabled) {
          setState("disabled");
          return;
        }
        if (!browserSupportsPush()) {
          setState("not_supported");
          return;
        }
        setVapidPublicKey(data.vapid_public_key || "");
        setShowPreviews(Boolean(data.show_previews));
        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }
        const registration = await readyServiceWorker();
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          // Reconcile ownership after a shared browser profile changes account.
          await api.put("/push", subscriptionPayload(subscription));
        }
        if (active) setState(subscription ? "subscribed" : "unsubscribed");
      } catch {
        if (active) {
          setFeedback({ type: "danger", message: t("pushSettings.loadFailed") });
          setState("error");
        }
      }
    };
    load();
    return () => { active = false; };
  }, [t]);

  const subscribe = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      if (!vapidPublicKey) throw new Error("missing-vapid-key");
      const registration = await readyServiceWorker();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      await api.put("/push", subscriptionPayload(subscription));
      setState("subscribed");
      setFeedback({ type: "success", message: t("pushSettings.subscribed") });
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        setState("denied");
      } else {
        setFeedback({
          type: "danger",
          message: error?.message === "missing-vapid-key"
            ? t("pushSettings.configMissing")
            : (error?.response?.data?.detail || t("pushSettings.subscribeFailed")),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const registration = await readyServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        try {
          await api.post("/push/unsubscribe", { endpoint: subscription.endpoint });
        } finally {
          await subscription.unsubscribe();
        }
      }
      setState("unsubscribed");
      setFeedback({ type: "success", message: t("pushSettings.unsubscribed") });
    } catch {
      setFeedback({ type: "danger", message: t("pushSettings.unsubscribeFailed") });
    } finally {
      setBusy(false);
    }
  };

  const updatePreviews = async (event) => {
    const nextValue = event.target.checked;
    const previousValue = showPreviews;
    setShowPreviews(nextValue);
    setPreviewBusy(true);
    setFeedback(null);
    try {
      await api.put("/push/preferences", { show_previews: nextValue });
      setFeedback({ type: "success", message: t("pushSettings.previewSaved") });
    } catch {
      setShowPreviews(previousValue);
      setFeedback({ type: "danger", message: t("pushSettings.previewSaveFailed") });
    } finally {
      setPreviewBusy(false);
    }
  };

  if (state === "disabled") {
    return (
      <section aria-labelledby="push-settings-title">
        <h3 id="push-settings-title" className="h6 mb-2">
          <i className="fas fa-bell text-muted me-2" aria-hidden="true" />
          {t("pushSettings.title")}
        </h3>
        <Alert type="info" icon={<i className="fas fa-circle-info" />}>
          {t("pushSettings.disabledByAdministrator")}
        </Alert>
      </section>
    );
  }
  if (state === "loading") {
    return <p className="text-muted small mb-0" aria-live="polite">{t("pushSettings.checking")}</p>;
  }
  if (state === "not_supported") {
    return <Alert type="info" icon={<i className="fas fa-info-circle" />}>{t("pushSettings.notSupported")}</Alert>;
  }

  return (
    <section aria-labelledby="push-settings-title">
      <h3 id="push-settings-title" className="h6 mb-1">
        <i className="fas fa-bell text-muted me-2" aria-hidden="true" />
        {t("pushSettings.title")}
      </h3>
      <p className="form-text mt-0 mb-2">{t("pushSettings.description")}</p>
      {feedback && <Alert type={feedback.type}>{feedback.message}</Alert>}
      <div className="form-check mb-3">
        <input
          id="push-show-previews"
          className="form-check-input"
          type="checkbox"
          checked={showPreviews}
          disabled={previewBusy}
          onChange={updatePreviews}
          aria-describedby="push-show-previews-hint"
        />
        <label className="form-check-label" htmlFor="push-show-previews">
          {t("pushSettings.previewLabel")}
        </label>
        <div id="push-show-previews-hint" className="form-text mt-1">
          {t("pushSettings.previewHint")}
        </div>
      </div>
      {state === "denied" ? (
        <Alert type="warning" icon={<i className="fas fa-ban" />}>{t("pushSettings.denied")}</Alert>
      ) : state === "error" ? null : (
        <Button
          type="button"
          variant={state === "subscribed" ? "outline-secondary" : "outline-success"}
          size="sm"
          icon={state === "subscribed" ? "fas fa-bell-slash" : "fas fa-bell"}
          loading={busy}
          onClick={state === "subscribed" ? unsubscribe : subscribe}
        >
          {t(state === "subscribed" ? "pushSettings.unsubscribe" : "pushSettings.subscribe")}
        </Button>
      )}
    </section>
  );
}

export default PushNotificationSettings;
