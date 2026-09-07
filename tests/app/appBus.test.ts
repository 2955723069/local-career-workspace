import { describe, expect, it, vi } from "vitest";
import { createAppBus } from "../../src/app/appBus";

describe("appBus", () => {
  it("delivers an emitted event to a subscriber with typed detail", () => {
    const bus = createAppBus();
    const handler = vi.fn();
    bus.on("resumes-changed", handler);
    bus.emit("resumes-changed", { count: 3 });
    expect(handler).toHaveBeenCalledWith({ count: 3 });
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createAppBus();
    const handler = vi.fn();
    const off = bus.on("app-data-changed", handler);
    off();
    bus.emit("app-data-changed", undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers to multiple subscribers of the same event", () => {
    const bus = createAppBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("interview-updated", a);
    bus.on("interview-updated", b);
    bus.emit("interview-updated", undefined);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("clears all subscriptions and ignores emits once its signal aborts", () => {
    const controller = new AbortController();
    const bus = createAppBus(controller.signal);
    const handler = vi.fn();
    bus.on("app-navigate", handler);
    controller.abort();
    bus.emit("app-navigate", { name: "resumes" });
    expect(handler).not.toHaveBeenCalled();
  });
});
