import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const cameraErrorMessage = (error, t) => {
  if (error?.name === "NotAllowedError") return t("inventory.cameraDenied");
  if (error?.name === "NotFoundError") return t("inventory.cameraNotFound");
  if (error?.name === "NotReadableError") return t("inventory.cameraBusy");
  return t("inventory.cameraStartError");
};

export default function InventoryQrScanner({ onDetected, disabled = false }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const activeVideoRef = useRef(null);
  const releaseAllStreamsRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  const startingRef = useRef(false);
  const detectedRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  const stop = useCallback((nextStatus = "idle") => {
    startingRef.current = false;
    const video = activeVideoRef.current || videoRef.current;
    // Capture the stream before ZXing tears down the video element; some
    // browser implementations clear srcObject without stopping its tracks.
    const stream = video?.srcObject;
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    // @zxing/browser keeps an internal stream tracker. Releasing it is
    // necessary on Chromium when the video element has already been detached.
    releaseAllStreamsRef.current?.();
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
    activeVideoRef.current = null;
    if (mountedRef.current) setStatus(nextStatus);
  }, []);

  const start = useCallback(async () => {
    if (disabled || startingRef.current || controlsRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setMessage(t("inventory.cameraUnsupported"));
      return;
    }
    if (!videoRef.current) return;
    const video = videoRef.current;
    activeVideoRef.current = video;

    startingRef.current = true;
    detectedRef.current = false;
    setStatus("starting");
    setMessage(t("inventory.startingCamera"));
    try {
      const { BrowserQRCodeReader, BrowserCodeReader } = await import("@zxing/browser");
      releaseAllStreamsRef.current = () => BrowserCodeReader.releaseAllStreams();
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video,
        async (result) => {
          const code = result?.getText()?.trim();
          if (!code || detectedRef.current) return;
          detectedRef.current = true;
          stop("detected");
          if (!mountedRef.current) return;
          const outcome = await onDetectedRef.current(code);
          if (!mountedRef.current) return;
          if (!outcome?.found) {
            setStatus("error");
            setMessage(outcome?.message || t("inventory.qrItemNotFound", { code }));
            return;
          }
          setStatus("detected");
          setMessage(t("inventory.itemLoaded", { name: outcome.item.name }));
        }
      );
      if (!mountedRef.current || detectedRef.current) {
        const stream = video.srcObject;
        controls.stop();
        if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
        releaseAllStreamsRef.current?.();
        video.pause();
        video.srcObject = null;
        video.removeAttribute("src");
        video.load();
        activeVideoRef.current = null;
        return;
      }
      controlsRef.current = controls;
      startingRef.current = false;
      if (mountedRef.current) {
        setStatus("scanning");
        setMessage(t("inventory.aimAtQr"));
      }
    } catch (error) {
      startingRef.current = false;
      stop("error");
      if (mountedRef.current) setMessage(cameraErrorMessage(error, t));
    }
  }, [disabled, stop, t]);

  useEffect(() => {
    mountedRef.current = true;
    // Once permission is granted the live scanner should be ready without an
    // extra click. First-time visitors still get the browser permission prompt.
    start();
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [start, stop]);

  return (
    <section className="inventory-camera-scanner" aria-label={t("inventory.cameraQrScanning")}>
      <div className="inventory-camera-preview">
        <video ref={videoRef} muted playsInline className={status === "scanning" || status === "detected" || status === "starting" ? "is-visible" : ""} />
        {status !== "scanning" && status !== "detected" && status !== "starting" ? <i className="fas fa-qrcode" aria-hidden="true" /> : <span className="inventory-camera-frame" aria-hidden="true" />}
      </div>
      <div className="inventory-camera-controls">
        {status === "scanning" || status === "starting" ? <button type="button" className="btn btn-outline-secondary" onClick={() => stop()}>{t("inventory.stopCamera")}</button> : <button type="button" className="btn btn-primary" onClick={start} disabled={disabled}>{t("inventory.startCamera")}</button>}
        <span className="small text-muted" aria-live="polite">{message}</span>
      </div>
    </section>
  );
}

InventoryQrScanner.propTypes = {
  onDetected: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
