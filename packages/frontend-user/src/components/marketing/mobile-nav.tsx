'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export interface MobileNavLink {
  label: string;
  href: string;
  external?: boolean;
}

/**
 * Marketing hamburger menu for viewports below lg, where the inline nav is
 * hidden. Receives pre-localized labels from the server-rendered SiteNav.
 */
export function MobileNav({
  links,
  authLinks,
  menuLabel,
}: {
  links: MobileNavLink[];
  authLinks: MobileNavLink[];
  menuLabel: string;
}) {
  const [open, setOpen] = useState(false);

  const renderLink = ({ label, href, external }: MobileNavLink) => (
    <a
      key={label}
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={() => setOpen(false)}
      className="flex items-center justify-between rounded-md px-3 py-2.5 text-[15px] font-medium text-foreground hover:bg-secondary"
    >
      {label}
      {external ? (
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          ↗
        </span>
      ) : null}
    </a>
  );

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={menuLabel}>
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle className="text-left">{menuLabel}</SheetTitle>
            <SheetDescription className="sr-only">{menuLabel}</SheetDescription>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            {links.map(renderLink)}
            <div className="my-3 border-t border-[var(--hly-hairline)]" />
            {authLinks.map(renderLink)}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
