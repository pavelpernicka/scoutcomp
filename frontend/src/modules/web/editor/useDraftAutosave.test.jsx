import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useDraftAutosave from "./useDraftAutosave";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

describe("useDraftAutosave page lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("cancels a queued save when the page scope changes", async () => {
    vi.useFakeTimers();
    const firstSave = vi.fn().mockResolvedValue({ draft_version: 2 });
    const secondSave = vi.fn().mockResolvedValue({ draft_version: 8 });
    const { result, rerender } = renderHook(
      ({ scopeKey, saveDraft }) => useDraftAutosave({
        enabled: true,
        scopeKey,
        initialVersion: scopeKey === 1 ? 1 : 7,
        getPayload: () => ({ page: scopeKey }),
        saveDraft,
        delay: 100,
      }),
      { initialProps: { scopeKey: 1, saveDraft: firstSave } },
    );

    act(() => result.current.schedule());
    rerender({ scopeKey: 2, saveDraft: secondSave });
    act(() => vi.advanceTimersByTime(150));

    expect(firstSave).not.toHaveBeenCalled();
    expect(secondSave).not.toHaveBeenCalled();
    expect(result.current.status).toBe("saved");
    expect(result.current.version).toBe(7);

    await act(async () => { await result.current.saveNow(); });
    expect(secondSave).toHaveBeenCalledWith({ page: 2, expected_version: 7 });
  });

  it("rejects old waiters and ignores an in-flight result after a scope change", async () => {
    const pending = deferred();
    const firstSave = vi.fn(() => pending.promise);
    const secondSave = vi.fn().mockResolvedValue({ draft_version: 11 });
    const { result, rerender } = renderHook(
      ({ scopeKey, saveDraft }) => useDraftAutosave({
        enabled: true,
        scopeKey,
        initialVersion: scopeKey === 1 ? 3 : 10,
        getPayload: () => ({ page: scopeKey }),
        saveDraft,
        delay: 100,
      }),
      { initialProps: { scopeKey: 1, saveDraft: firstSave } },
    );

    let oldWaiter;
    act(() => { oldWaiter = result.current.saveNow(); });
    await waitFor(() => expect(firstSave).toHaveBeenCalledWith({ page: 1, expected_version: 3 }));

    rerender({ scopeKey: 2, saveDraft: secondSave });
    await expect(oldWaiter).rejects.toThrow("Autosave scope changed");
    expect(result.current.conflict).toBe(false);
    expect(result.current.version).toBe(10);

    await act(async () => { await result.current.saveNow(); });
    expect(secondSave).toHaveBeenCalledWith({ page: 2, expected_version: 10 });
    expect(result.current.version).toBe(11);

    await act(async () => { pending.resolve({ draft_version: 4 }); await pending.promise; });
    expect(result.current.version).toBe(11);
    expect(result.current.status).toBe("saved");
  });

  it("clears conflict state for a newly opened page", async () => {
    const conflict = Object.assign(new Error("conflict"), { response: { status: 409 } });
    const { result, rerender } = renderHook(
      ({ scopeKey, saveDraft }) => useDraftAutosave({
        enabled: true,
        scopeKey,
        initialVersion: scopeKey === 1 ? 2 : 20,
        getPayload: () => ({ page: scopeKey }),
        saveDraft,
      }),
      { initialProps: { scopeKey: 1, saveDraft: vi.fn().mockRejectedValue(conflict) } },
    );

    await act(async () => { await expect(result.current.saveNow()).rejects.toBe(conflict); });
    expect(result.current.conflict).toBe(true);
    expect(result.current.status).toBe("conflict");

    rerender({ scopeKey: 2, saveDraft: vi.fn().mockResolvedValue({ draft_version: 21 }) });
    expect(result.current.conflict).toBe(false);
    expect(result.current.status).toBe("saved");
    expect(result.current.version).toBe(20);
  });
});
