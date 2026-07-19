import { describe, expect, it, vi } from "vitest";

import { createDomainEvent } from "@/domain/shared";

import { InProcessEventBus } from "./in-process-event-bus";

describe("InProcessEventBus", () => {
  it("delivers a published event to a subscribed handler", async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe("TestEvent", handler);

    const event = createDomainEvent({
      type: "TestEvent",
      actorId: "user-1",
      correlationId: "corr-1",
      payload: { foo: "bar" },
    });

    await bus.publish(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("delivers to multiple subscribers for the same event type", async () => {
    const bus = new InProcessEventBus();
    const first = vi.fn();
    const second = vi.fn();

    bus.subscribe("TestEvent", first);
    bus.subscribe("TestEvent", second);

    await bus.publish(
      createDomainEvent({
        type: "TestEvent",
        actorId: null,
        correlationId: "corr-2",
        payload: {},
      })
    );

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not deliver events to handlers subscribed to a different type", async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe("OtherEvent", handler);

    await bus.publish(
      createDomainEvent({
        type: "TestEvent",
        actorId: null,
        correlationId: "corr-3",
        payload: {},
      })
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("isolates a failing handler so other handlers still run", async () => {
    const bus = new InProcessEventBus();
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const succeeding = vi.fn();

    bus.subscribe("TestEvent", failing);
    bus.subscribe("TestEvent", succeeding);

    await expect(
      bus.publish(
        createDomainEvent({
          type: "TestEvent",
          actorId: null,
          correlationId: "corr-4",
          payload: {},
        })
      )
    ).resolves.toBeUndefined();

    expect(failing).toHaveBeenCalledTimes(1);
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});
