'use client';

import { usePathname } from 'next/navigation';

// Short fade-in on navigation within /documents. The full-height Lexical editor
// at /documents/<uuid> manages its own layout, so we skip the wrapper there to
// avoid disturbing it. Placed at the section level so the persistent Navbar
// (rendered in documents/layout.tsx) does not animate. CSS-only via
// tailwindcss-animate; degrades under prefers-reduced-motion. See issue #971.
const isEditorRoute = (pathname: string) =>
  /^\/documents\/[a-f0-9-]{36}/.test(pathname);

export default function DocumentsTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (isEditorRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
      {children}
    </div>
  );
}
