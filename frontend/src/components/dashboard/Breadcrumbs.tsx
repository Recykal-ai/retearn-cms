import Link from "next/link";

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav
      className="flex items-center gap-1.5 px-6 py-2 text-xs text-neutral-500 dark:text-neutral-400"
      style={{ fontFamily: "var(--font-ui)" }}
      aria-label="Breadcrumb"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-neutral-300 dark:text-neutral-600">/</span>}
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-neutral-700 hover:underline dark:hover:text-neutral-200">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-neutral-700 dark:text-neutral-300" : ""}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
