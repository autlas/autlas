import { describe, it, expect, beforeEach } from "vitest";
import { listen, emit, __clear, __count } from "@tauri-apps/api/event";

// Type the mock helpers that setup.ts adds to the module
const eventMock = { listen, emit, __clear, __count } as {
  listen: typeof listen;
  emit: typeof emit;
  __clear: () => void;
  __count: (event: string) => number;
};

beforeEach(() => {
  eventMock.__clear();
});

describe("tauri event mock system", () => {
  it("listen registers a handler that receives emitted events", async () => {
    const received: unknown[] = [];
    await eventMock.listen("test-event", (ev: any) => {
      received.push(ev.payload);
    });

    await eventMock.emit("test-event", { value: 42 });

    expect(received).toEqual([{ value: 42 }]);
  });

  it("multiple listeners for the same event all fire", async () => {
    const results: number[] = [];

    await eventMock.listen("multi", () => results.push(1));
    await eventMock.listen("multi", () => results.push(2));
    await eventMock.listen("multi", () => results.push(3));

    await eventMock.emit("multi", null);

    expect(results).toEqual([1, 2, 3]);
    expect(eventMock.__count("multi")).toBe(3);
  });

  it("unlisten function removes the handler", async () => {
    const received: unknown[] = [];
    const unlisten = await eventMock.listen("removable", (ev: any) => {
      received.push(ev.payload);
    });

    await eventMock.emit("removable", "first");
    expect(received).toEqual(["first"]);

    unlisten();

    await eventMock.emit("removable", "second");
    expect(received).toEqual(["first"]); // no new entry
    expect(eventMock.__count("removable")).toBe(0);
  });

  it("__clear removes all listeners", async () => {
    await eventMock.listen("a", () => {});
    await eventMock.listen("b", () => {});
    await eventMock.listen("a", () => {});

    expect(eventMock.__count("a")).toBe(2);
    expect(eventMock.__count("b")).toBe(1);

    eventMock.__clear();

    expect(eventMock.__count("a")).toBe(0);
    expect(eventMock.__count("b")).toBe(0);
  });

  it("__count returns correct count", async () => {
    expect(eventMock.__count("empty")).toBe(0);

    await eventMock.listen("counted", () => {});
    expect(eventMock.__count("counted")).toBe(1);

    await eventMock.listen("counted", () => {});
    expect(eventMock.__count("counted")).toBe(2);
  });

  it("events with different names do not cross-fire", async () => {
    const alphaPayloads: unknown[] = [];
    const betaPayloads: unknown[] = [];

    await eventMock.listen("alpha", (ev: any) => alphaPayloads.push(ev.payload));
    await eventMock.listen("beta", (ev: any) => betaPayloads.push(ev.payload));

    await eventMock.emit("alpha", "for-alpha");
    await eventMock.emit("beta", "for-beta");

    expect(alphaPayloads).toEqual(["for-alpha"]);
    expect(betaPayloads).toEqual(["for-beta"]);
  });
});
