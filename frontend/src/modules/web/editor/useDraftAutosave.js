import { useCallback, useEffect, useRef, useState } from "react";

export default function useDraftAutosave({ enabled, scopeKey, initialVersion = 0, getPayload, saveDraft, delay = 1500 }) {
  const [status, setStatus] = useState("saved");
  const [version, setVersion] = useState(initialVersion);
  const [conflict, setConflict] = useState(false);
  const timerRef = useRef(null);
  const savingRef = useRef(null);
  const queuedRef = useRef(false);
  const conflictRef = useRef(false);
  const versionRef = useRef(initialVersion);
  const payloadRef = useRef(getPayload);
  const saveRef = useRef(saveDraft);
  const waitersRef = useRef([]);
  const generationRef = useRef(0);

  useEffect(() => { payloadRef.current = getPayload; }, [getPayload]);
  useEffect(() => { saveRef.current = saveDraft; }, [saveDraft]);
  useEffect(() => { versionRef.current = initialVersion; setVersion(initialVersion); }, [initialVersion]);

  const settleWaiters = (method, value) => {
    const waiters = waitersRef.current.splice(0);
    waiters.forEach(({ resolve, reject }) => (method === "resolve" ? resolve(value) : reject(value)));
  };

  useEffect(() => {
    generationRef.current += 1;
    window.clearTimeout(timerRef.current);
    queuedRef.current = false;
    conflictRef.current = false;
    versionRef.current = initialVersion;
    setVersion(initialVersion);
    setConflict(false);
    setStatus("saved");
    settleWaiters("reject", new Error("Autosave scope changed"));
  }, [scopeKey]); // initialVersion is synchronized separately when page data arrives.

  const flush = useCallback(async () => {
    const generation = generationRef.current;
    if (!enabled || conflictRef.current || savingRef.current === generation || !queuedRef.current) return versionRef.current;
    const getScopedPayload = payloadRef.current;
    const saveScopedDraft = saveRef.current;
    savingRef.current = generation;
    setStatus("saving");
    try {
      while (generation === generationRef.current && queuedRef.current && !conflictRef.current) {
        queuedRef.current = false;
        const result = await saveScopedDraft({ ...getScopedPayload(), expected_version: versionRef.current });
        if (generation !== generationRef.current) return versionRef.current;
        const nextVersion = result?.draft_version ?? result?.version ?? versionRef.current + 1;
        versionRef.current = nextVersion;
        setVersion(nextVersion);
      }
      if (generation !== generationRef.current) return versionRef.current;
      setStatus("saved");
      settleWaiters("resolve", versionRef.current);
      return versionRef.current;
    } catch (error) {
      if (generation !== generationRef.current) return versionRef.current;
      queuedRef.current = false;
      if (error?.response?.status === 409) {
        conflictRef.current = true;
        setConflict(true);
        setStatus("conflict");
      } else {
        setStatus("failed");
      }
      settleWaiters("reject", error);
      throw error;
    } finally {
      if (savingRef.current === generation) savingRef.current = null;
      if (generation === generationRef.current && queuedRef.current && !conflictRef.current) void flush();
    }
  }, [enabled]);

  const schedule = useCallback(() => {
    if (!enabled || conflictRef.current) return;
    queuedRef.current = true;
    setStatus("unsaved");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void flush().catch(() => {}); }, delay);
  }, [delay, enabled, flush]);

  const saveNow = useCallback(() => {
    if (!enabled) return Promise.resolve(versionRef.current);
    if (conflictRef.current) return Promise.reject(new Error("Draft conflict"));
    window.clearTimeout(timerRef.current);
    queuedRef.current = true;
    const promise = new Promise((resolve, reject) => waitersRef.current.push({ resolve, reject }));
    void flush().catch(() => {});
    return promise;
  }, [enabled, flush]);

  useEffect(() => () => {
    generationRef.current += 1;
    window.clearTimeout(timerRef.current);
    queuedRef.current = false;
    settleWaiters("reject", new Error("Autosave disposed"));
  }, []);

  return {
    status, version, conflict, hasPendingChanges: status !== "saved", schedule, saveNow,
    clearConflict: () => { conflictRef.current = false; setConflict(false); setStatus("unsaved"); },
  };
}
