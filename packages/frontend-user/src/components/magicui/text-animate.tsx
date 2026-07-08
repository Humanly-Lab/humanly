'use client';

// Magic UI - TextAnimate, trimmed to the blurInUp/word variant we use.
// https://magicui.design/docs/components/text-animate (MIT)
import { motion, useInView } from 'motion/react';
import { useRef } from 'react';

export function TextAnimate({
  children,
  className,
  delay = 0,
  stagger = 0.05,
}: {
  children: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const words = children.split(' ');
  return (
    <span ref={ref} className={className}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : undefined}
          transition={{ duration: 0.4, delay: delay + i * stagger, ease: 'easeOut' }}
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  );
}
