import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";

interface FadeInProps {
  children: ReactNode;
  /** Atraso em segundos. */
  delay?: number;
  /** Deslocamento vertical inicial (px). */
  y?: number;
  className?: string;
}

// Entrada suave (fade + leve subida). Só opacity/transform → sem CLS.
export function FadeIn({ children, delay = 0, y = 12, className }: FadeInProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

// Container que escalona a entrada dos filhos <StaggerItem>.
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={containerVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
