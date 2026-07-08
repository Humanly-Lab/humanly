// Short fade-in on navigation within /certificates. Placed at the section level
// so the persistent Navbar does not animate. CSS-only via tailwindcss-animate;
// degrades under prefers-reduced-motion. See issue #971.
export default function CertificatesTemplate({
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
