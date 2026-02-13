import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../runtime/support/EventBus";

describe("EventBus", () => {
  it("supports on/onAll/once subscriptions and history retrieval", () => {
    const bus = new EventBus();
    const onSpy = vi.fn();
    const allSpy = vi.fn();
    const onceSpy = vi.fn();

    const unsubscribe = bus.on("qorelogic.l3Queued", onSpy);
    bus.onAll(allSpy);
    bus.once("qorelogic.l3Queued", onceSpy);

    bus.emit("qorelogic.l3Queued", { id: "a" });
    bus.emit("qorelogic.l3Queued", { id: "b" });

    expect(onSpy).toHaveBeenCalledTimes(2);
    expect(allSpy).toHaveBeenCalledTimes(2);
    expect(onceSpy).toHaveBeenCalledTimes(1);

    const onlyQueued = bus.getHistory("qorelogic.l3Queued");
    expect(onlyQueued).toHaveLength(2);
    const limited = bus.getHistory(undefined, 1);
    expect(limited).toHaveLength(1);

    unsubscribe();
    bus.emit("qorelogic.l3Queued", { id: "c" });
    expect(onSpy).toHaveBeenCalledTimes(2);
  });

  it("isolates listener failures and supports dispose", () => {
    const bus = new EventBus();
    const okSpy = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    bus.on("sentinel.alert", () => {
      throw new Error("listener boom");
    });
    bus.on("sentinel.alert", okSpy);

    bus.emit("sentinel.alert", { detail: "warn" });
    expect(okSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    bus.dispose();
    expect(bus.getHistory()).toHaveLength(0);

    errorSpy.mockRestore();
  });
});

