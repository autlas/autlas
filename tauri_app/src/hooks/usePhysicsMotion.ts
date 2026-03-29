import { useState, useEffect, useRef } from "react";

export function usePhysicsMotion() {
  const [motionDecay] = useState(() => parseFloat(localStorage.getItem("motion-decay") || "4.0"));
  const [motionImpulse] = useState(() => parseFloat(localStorage.getItem("motion-impulse") || "1.5"));
  const [motionImpulseInitial] = useState(() => parseFloat(localStorage.getItem("motion-impulse-initial") || "2.5"));
  const [motionSpeedBase] = useState(() => parseFloat(localStorage.getItem("motion-speed-base") || "0.14"));
  const [motionSpeedScale] = useState(() => parseFloat(localStorage.getItem("motion-speed-scale") || "0.23"));
  const [motionScaleFactor] = useState(() => parseFloat(localStorage.getItem("motion-scale-factor") || "0.14"));
  const [motionScaleDeadzone] = useState(() => parseFloat(localStorage.getItem("motion-scale-deadzone") || "1.5"));
  const [motionImpulseMax] = useState(() => parseFloat(localStorage.getItem("motion-impulse-max") || "100.0"));

  const motionDecayRef = useRef(motionDecay);
  const motionImpulseRef = useRef(motionImpulse);
  const motionImpulseInitialRef = useRef(motionImpulseInitial);
  const motionSpeedBaseRef = useRef(motionSpeedBase);
  const motionSpeedScaleRef = useRef(motionSpeedScale);
  const motionScaleFactorRef = useRef(motionScaleFactor);
  const motionScaleDeadzoneRef = useRef(motionScaleDeadzone);
  const motionImpulseMaxRef = useRef(motionImpulseMax);

  const momentumRef = useRef(0);
  const settingsRotationRef = useRef(0);
  const settleTargetRef = useRef<number | null>(null);
  const pendingImpulseRef = useRef(0);

  const settingsIconRef = useRef<HTMLDivElement>(null);
  const debugLabelRef = useRef<HTMLSpanElement>(null);
  const debugBarRef = useRef<HTMLDivElement>(null);

  const [debugMomentum, setDebugMomentum] = useState(0);

  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();
    let lastFPSTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);

      if (pendingImpulseRef.current > 0) {
        const injectAmount = Math.min(pendingImpulseRef.current, (pendingImpulseRef.current * 10) * dt);
        momentumRef.current = Math.min(motionImpulseMaxRef.current, momentumRef.current + injectAmount);
        pendingImpulseRef.current -= injectAmount;
      }

      const expLoss = momentumRef.current * (motionDecayRef.current * 0.5) * dt;
      const friction = 0.05 * dt;
      momentumRef.current = Math.max(0, momentumRef.current - expLoss - friction);

      if (debugLabelRef.current) debugLabelRef.current.innerText = momentumRef.current.toFixed(1);
      if (debugBarRef.current) {
        const pct = Math.min(100, (momentumRef.current / motionImpulseMaxRef.current) * 100);
        debugBarRef.current.style.width = `${pct}%`;
      }

      const isVisible = momentumRef.current > 0 || (settleTargetRef.current !== null && Math.abs(settingsRotationRef.current - settleTargetRef.current) > 0.1);
      if (isVisible && debugMomentum <= 0) setDebugMomentum(1);
      else if (!isVisible && debugMomentum > 0) setDebugMomentum(0);

      if (settingsIconRef.current) {
        const energy = momentumRef.current;
        const velocity = energy > 0.001 ? (motionSpeedBaseRef.current + energy * motionSpeedScaleRef.current) : 0;

        if (velocity > 0) {
          settingsRotationRef.current += velocity * 360 * dt;
          const effectiveEnergy = Math.max(0, energy - motionScaleDeadzoneRef.current);
          const scale = 1 + (effectiveEnergy * motionScaleFactorRef.current);
          const bright = 1 + (energy * 0.05);
          settingsIconRef.current.style.transform = `rotate(${settingsRotationRef.current}deg) scale(${scale})`;
          settingsIconRef.current.style.filter = `brightness(${bright})`;
        }

        if (energy > 0 && debugMomentum <= 0) setDebugMomentum(1);
        else if (energy <= 0 && debugMomentum > 0) setDebugMomentum(0);
      }

      if (now - lastFPSTime >= 1000) lastFPSTime = now;
      lastTime = now;
      animFrame = requestAnimationFrame(tick);
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  return {
    settingsIconRef,
    pendingImpulseRef,
    momentumRef,
    motionImpulseRef,
    motionImpulseInitialRef,
  };
}
