'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, User, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuthStore } from '@/stores/auth-store';
import { adminAppHref } from '@/lib/app-origin';
import { getUserDisplayLabel } from './user-display';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userDisplayLabel = getUserDisplayLabel(user?.email);
  const canUseAdminView = Boolean(user);
  const adminTasksHref = adminAppHref('/tasks?switchSession=1');

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  // Use wider layout for document editor pages
  const isDocumentEditorPage = /^\/documents\/[a-f0-9-]{36}/.test(pathname);
  const containerClass = isDocumentEditorPage
    ? 'mx-auto w-full max-w-[2400px] px-3'
    : 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8';

  return (
    <nav className="border-b border-border/70 bg-card">
      <div className={containerClass}>
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/documents" className="flex items-center">
              <HumanlyWordmark size="md" />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop User Menu */}
            <div className="hidden sm:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden lg:inline">{userDisplayLabel}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {canUseAdminView ? (
                    <>
                      <DropdownMenuItem asChild>
                        <a href={adminTasksHref}>
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          Switch to Admin View
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile Menu */}
            <div className="md:hidden">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-6 w-6" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                    <SheetDescription className="sr-only">
                      Account options
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 flex flex-col space-y-4">
                    <div>
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {userDisplayLabel}
                      </div>
                      {canUseAdminView ? (
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          asChild
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <a href={adminTasksHref}>
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            Switch to Admin View
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleLogout();
                        }}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
