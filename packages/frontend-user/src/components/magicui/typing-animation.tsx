'use client';

// Magic UI - TypingAnimation (https://magicui.design/docs/components/typing-animation), MIT.
import { motion, useInView, type MotionProps } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TypingAnimationProps extends MotionProps {
  children: string;
  className?: string;
  duration?: number;
  delay?: number;
  as?: React.ElementType;
  startOnView?: boolean;
  showCursor?: boolean;
}

export function TypingAnimation({
  children,
  className,
  duration = 60,
  delay = 0,
  as: Component = 'span',
  startOnView = true,
  showCursor = true,
  ...props
}: TypingAnimationProps) {
  const MotionComponent = motion.create(Component, {
    forwardMotionProps: true,
  });

  const [displayedText, setDisplayedText] = useState<string>('');
  const [started, setStarted] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });

  useEffect(() => {
    if (!startOnView) {
      const startTimeout = setTimeout(() => setStarted(true), delay);
      return () => clearTimeout(startTimeout);
    }
    if (!isInView) return;
    const startTimeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(startTimeout);
  }, [delay, startOnView, isInView]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const typingEffect = setInterval(() => {
      if (i < children.length) {
        setDisplayedText(children.substring(0, i + 1));
        i++;
      } else {
        clearInterval(typingEffect);
      }
    }, duration);
    return () => clearInterval(typingEffect);
  }, [children, duration, started]);

  return (
    <MotionComponent
      ref={elementRef}
      className={cn('inline-block', className)}
      {...props}
    >
      {displayedText}
      {showCursor && (
        <span className="humanly-cursor-blink -mb-0.5 ml-px inline-block h-[1.1em] w-0.5 bg-[var(--hly-brand)] align-middle" />
      )}
    </MotionComponent>
  );
}
