import type { Variants } from "motion/react";

const easeOut = [0.22, 1, 0.36, 1] as const;

// Fade + rise, used for cards, rows and section blocks.
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: easeOut }
  }
};

// Softer fade for large surfaces.
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: easeOut } }
};

// Parent container that reveals its children one after another.
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.03 }
  }
};

// Per-screen transition driven by AnimatePresence keyed on the active tab.
export const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.28, ease: easeOut }
} as const;
