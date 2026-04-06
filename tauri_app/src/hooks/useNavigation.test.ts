import { renderHook, act } from "@testing-library/react";
import { useNavigation } from "./useNavigation";
import type { MutableRefObject } from "react";

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: vi.fn(),
}));

type PhysicsRefs = {
  pendingImpulseRef: MutableRefObject<number>;
  momentumRef: MutableRefObject<number>;
  motionImpulseRef: MutableRefObject<number>;
  motionImpulseInitialRef: MutableRefObject<number>;
};

function makePhysicsRefs(): PhysicsRefs {
  return {
    pendingImpulseRef: { current: 0 },
    momentumRef: { current: 0 },
    motionImpulseRef: { current: 5 },
    motionImpulseInitialRef: { current: 10 },
  };
}

describe("useNavigation", () => {
  it("returns default state: activeTab=hub, viewMode=hub, displayMode=tiles", () => {
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    expect(result.current.activeTab).toBe("hub");
    expect(result.current.viewMode).toBe("hub");
    expect(result.current.displayMode).toBe("tiles");
  });

  it("reads initial tab from localStorage", () => {
    localStorage.setItem("ahk_active_tab", "all");
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    expect(result.current.activeTab).toBe("all");
    expect(result.current.viewMode).toBe("tree");
  });

  it('handleTabClick("all") sets viewMode=tree, displayMode=tree', () => {
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    act(() => result.current.handleTabClick("all"));

    expect(result.current.viewMode).toBe("tree");
    expect(result.current.displayMode).toBe("tree");
  });

  it('handleTabClick("hub") sets viewMode=hub, displayMode=tiles', () => {
    localStorage.setItem("ahk_active_tab", "all");
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    act(() => result.current.handleTabClick("hub"));

    expect(result.current.viewMode).toBe("hub");
    expect(result.current.displayMode).toBe("tiles");
  });

  it('handleTabClick("settings") sets viewMode=settings and applies physics impulse', () => {
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    act(() => result.current.handleTabClick("settings"));

    expect(result.current.viewMode).toBe("settings");
    expect(physics.pendingImpulseRef.current).toBeGreaterThan(0);
  });

  it("handleTabClick persists tab to localStorage", () => {
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    act(() => result.current.handleTabClick("all"));

    expect(localStorage.getItem("ahk_active_tab")).toBe("all");
  });

  it("toggleDisplayMode updates displayMode and persists to correct localStorage key", () => {
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    // Default tab is hub
    act(() => result.current.toggleDisplayMode("list"));

    expect(result.current.displayMode).toBe("list");
    expect(localStorage.getItem("ahk_hub_display_mode")).toBe("list");
  });

  it("hub and tree have separate display mode storage keys", () => {
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    // Set hub display mode
    act(() => result.current.toggleDisplayMode("list"));
    expect(localStorage.getItem("ahk_hub_display_mode")).toBe("list");

    // Switch to tree tab
    act(() => result.current.handleTabClick("all"));
    act(() => result.current.toggleDisplayMode("tiles"));
    expect(localStorage.getItem("ahk_tree_display_mode")).toBe("tiles");

    // Hub key unchanged
    expect(localStorage.getItem("ahk_hub_display_mode")).toBe("list");
  });

  it("settings tab applies physics kick (pendingImpulseRef changes)", () => {
    const physics = makePhysicsRefs();
    const { result } = renderHook(() => useNavigation([], physics));

    expect(physics.pendingImpulseRef.current).toBe(0);

    act(() => result.current.handleTabClick("settings"));

    expect(physics.pendingImpulseRef.current).not.toBe(0);
  });

  it("physics: when momentum <= 0.05, uses motionImpulseInitialRef", () => {
    const physics = makePhysicsRefs();
    physics.momentumRef.current = 0;
    physics.pendingImpulseRef.current = 0;
    physics.motionImpulseInitialRef.current = 10;
    physics.motionImpulseRef.current = 5;

    const { result } = renderHook(() => useNavigation([], physics));

    act(() => result.current.handleTabClick("settings"));

    // momentum(0) + pending(0) <= 0.05, so kick = motionImpulseInitialRef(10)
    expect(physics.pendingImpulseRef.current).toBe(10);
  });

  it("physics: when momentum > 0.05, uses motionImpulseRef", () => {
    const physics = makePhysicsRefs();
    physics.momentumRef.current = 1;
    physics.pendingImpulseRef.current = 0;
    physics.motionImpulseInitialRef.current = 10;
    physics.motionImpulseRef.current = 5;

    const { result } = renderHook(() => useNavigation([], physics));

    act(() => result.current.handleTabClick("settings"));

    // momentum(1) + pending(0) > 0.05, so kick = motionImpulseRef(5)
    expect(physics.pendingImpulseRef.current).toBe(5);
  });
});
