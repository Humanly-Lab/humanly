import { cn } from '@/lib/utils';

type HumanlyWordmarkProps = {
  className?: string;
  cursor?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl sm:text-5xl',
};

const markClasses = {
  sm: 'h-7 w-7',
  md: 'h-11 w-11',
  lg: 'h-14 w-14 sm:h-16 sm:w-16',
};

const cursorClasses = {
  sm: 'h-4 w-1.5',
  md: 'h-5 w-2',
  lg: 'h-8 w-3 sm:h-10 sm:w-4',
};

export function HumanlyWordmark({
  className,
  cursor = true,
  size = 'md',
}: HumanlyWordmarkProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-bold leading-none tracking-[-0.04em] text-foreground',
        sizeClasses[size],
        className
      )}
      style={{
        fontFamily: 'var(--font-humanly-brand), "Courier Prime", "Courier New", monospace',
      }}
      aria-label="Humanly"
    >
      <img
        src="/brand/pencil-angled.png"
        alt=""
        aria-hidden="true"
        className={cn('block shrink-0 object-contain contrast-125', markClasses[size])}
      />
      <span className="inline-flex translate-y-[0.08em] items-baseline gap-1">
        <span>humanly</span>
        {cursor && (
          <span
            aria-hidden="true"
            className={cn(
              'inline-block translate-y-[0.08em] bg-current humanly-cursor-blink',
              cursorClasses[size]
            )}
          />
        )}
      </span>
    </span>
  );
}
