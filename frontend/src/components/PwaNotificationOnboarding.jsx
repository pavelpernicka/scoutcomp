import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import {
  browserSupportsPush,
  enableCurrentPushSubscription,
  pushSubscriptionPayload,
  readyServiceWorker,
} from "../utils/pushNotifications";
import Alert from "./Alert";
import Button from "./Button";
import Modal from "./Modal";

const DISMISSED_KEY = "scoutcomp.push-onboarding-dismissed-v1";
const INSTALL_PENDING_KEY = "scoutcomp.push-onboarding-install-pending-v1";

const storageGet = (key) => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const storageSet = (key, value) => {
  try { window.localStorage.setItem(key, value); } catch { /* storage is optional */ }
};
const storageRemove = (key) => {
  try { window.localStorage.removeItem(key); } catch { /* storage is optional */ }
};

const isInstalledPwa = () => (
  window.matchMedia?.("(display-mode: standalone)").matches
  || window.navigator.standalone === true
);

export default function PwaNotificationOnboarding() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [installationDetected, setInstallationDetected] = useState(() => (
    isInstalledPwa() || storageGet(INSTALL_PENDING_KEY) === "true"
  ));
  const [visible, setVisible] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    const detectInstallation = () => {
      storageRemove(DISMISSED_KEY);
      storageSet(INSTALL_PENDING_KEY, "true");
      setInstallationDetected(true);
    };
    const detectStandalone = (event) => {
      if (event.matches) detectInstallation();
    };
    window.addEventListener("appinstalled", detectInstallation);
    if (displayMode?.addEventListener) displayMode.addEventListener("change", detectStandalone);
    else displayMode?.addListener?.(detectStandalone);
    return () => {
      window.removeEventListener("appinstalled", detectInstallation);
      if (displayMode?.removeEventListener) displayMode.removeEventListener("change", detectStandalone);
      else displayMode?.removeListener?.(detectStandalone);
    };
  }, []);

  useEffect(() => {
    if (!installationDetected || !isAuthenticated) return undefined;
    if (storageGet(DISMISSED_KEY) === "true") return undefined;

    let active = true;
    const prepare = async () => {
      try {
        const { data } = await api.get("/push/config");
        if (!active || !data.enabled || !browserSupportsPush() || Notification.permission === "denied") return;
        const registration = await readyServiceWorker();
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await api.put("/push", pushSubscriptionPayload(subscription));
          storageRemove(INSTALL_PENDING_KEY);
          return;
        }
        if (!active) return;
        setVapidPublicKey(data.vapid_public_key || "");
        setVisible(true);
      } catch {
        // Installation remains usable when push configuration is temporarily unavailable.
      }
    };
    prepare();
    return () => { active = false; };
  }, [installationDetected, isAuthenticated]);

  const dismiss = () => {
    storageSet(DISMISSED_KEY, "true");
    storageRemove(INSTALL_PENDING_KEY);
    setVisible(false);
    setError(null);
  };

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await enableCurrentPushSubscription(vapidPublicKey);
      storageRemove(INSTALL_PENDING_KEY);
      setVisible(false);
    } catch (requestError) {
      if (requestError?.name === "NotAllowedError") {
        setError(t("pushOnboarding.denied"));
      } else {
        setError(t("pushOnboarding.failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isVisible={visible}
      onClose={dismiss}
      title={t("pushOnboarding.title")}
      icon={<i className="fas fa-bell text-success" />}
      size="sm"
      footer={(
        <>
          <Button type="button" variant="outline-secondary" onClick={dismiss} disabled={busy}>
            {t("pushOnboarding.notNow")}
          </Button>
          <Button type="button" variant="success" icon="fas fa-bell" onClick={enable} loading={busy}>
            {t("pushOnboarding.enable")}
          </Button>
        </>
      )}
    >
      <p>{t("pushOnboarding.description")}</p>
      <p className="small text-muted mb-0">{t("pushOnboarding.privacy")}</p>
      {error && <Alert type="warning" className="mt-3 mb-0">{error}</Alert>}
    </Modal>
  );
}
