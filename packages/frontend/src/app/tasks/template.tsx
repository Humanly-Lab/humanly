// Short fade-in on navigation within /tasks. Renders inside the layout's
// humanly-dashboard-page main, below the persistent Navbar. CSS-only via
// tailwindcss-animate; degrades under prefers-reduced-motion. See issue #971.
export default function TasksTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
      {children}
    </div>
  );
}
