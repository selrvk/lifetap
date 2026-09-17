import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

// The radial "scanner" animation shared by the civilian Home screen and the
// responder Scan screen: three ping rings, a breathing button, two orbiting
// dots and pulsing NFC arcs.
//
// The loops start once and keep running until the screen unmounts. Stopping
// and restarting them on focus (to save battery off-screen) made returning to
// a tab stutter — restarting nine native animations at once costs more than
// letting them run — so the only thing that turns them off is Reduce Motion.

const PING_PERIOD = 2400;
const ARC_PERIOD = 1800;
const BREATHE_HALF = 1500;
const OUTER_ORBIT_MS = 18000;
const INNER_ORBIT_MS = 26000;
// Orbits run as one long timing to ITERATIONS (read modulo 1) so a lap never
// visibly restarts.
const ITERATIONS = 1000;

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (mounted) setReduceMotion(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}

export function useScannerAnimation() {
  const reduceMotion = useReduceMotion();

  const ping1 = useRef(new Animated.Value(0)).current;
  const ping2 = useRef(new Animated.Value(0)).current;
  const ping3 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const orbitOuter = useRef(new Animated.Value(0)).current;
  const orbitInner = useRef(new Animated.Value(0)).current;
  const arc1 = useRef(new Animated.Value(0)).current;
  const arc2 = useRef(new Animated.Value(0)).current;
  const arc3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;

    const pingLoop = (val: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: PING_PERIOD, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const arcLoop = (val: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: ARC_PERIOD / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: ARC_PERIOD / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
    const orbit = (val: Animated.Value, lapMs: number) =>
      Animated.timing(val, {
        toValue: ITERATIONS,
        duration: lapMs * ITERATIONS,
        easing: Easing.linear,
        useNativeDriver: true,
      });

    const breatheAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: BREATHE_HALF, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: BREATHE_HALF, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const outer = orbit(orbitOuter, OUTER_ORBIT_MS);
    const inner = orbit(orbitInner, INNER_ORBIT_MS);
    const pings = [pingLoop(ping1), pingLoop(ping2), pingLoop(ping3)];
    const arcs = [arcLoop(arc1), arcLoop(arc2), arcLoop(arc3)];

    breatheAnim.start();
    outer.start();
    inner.start();
    // Stagger the rings and arcs by a third of a period each.
    pings[0].start();
    arcs[0].start();
    const timers = [
      setTimeout(() => pings[1].start(), PING_PERIOD / 3),
      setTimeout(() => pings[2].start(), (PING_PERIOD / 3) * 2),
      setTimeout(() => arcs[1].start(), ARC_PERIOD / 3),
      setTimeout(() => arcs[2].start(), (ARC_PERIOD / 3) * 2),
    ];

    return () => {
      timers.forEach(clearTimeout);
      [breatheAnim, outer, inner, ...pings, ...arcs].forEach((a) => a.stop());
    };
  }, [reduceMotion, ping1, ping2, ping3, breathe, orbitOuter, orbitInner, arc1, arc2, arc3]);

  const pingStyle = (val: Animated.Value) => ({
    transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
  });

  const orbitRotate = (val: Animated.Value, reverse = false) => ({
    transform: [{
      rotate: Animated.modulo(val, 1).interpolate({
        inputRange: [0, 1],
        outputRange: reverse ? ['0deg', '-360deg'] : ['0deg', '360deg'],
      }),
    }],
  });

  const breatheStyle = {
    transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
  };

  return {
    pings: [ping1, ping2, ping3],
    arcs: [arc1, arc2, arc3],
    orbitOuter,
    orbitInner,
    pingStyle,
    orbitRotate,
    breatheStyle,
  };
}
