import Link from "next/link";

export function Tag({
  label,
  bg,
  fg,
  href,
}: {
  label: string;
  bg: string;
  fg: string;
  href?: string;
}) {
  const className = "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";
  const style = { background: bg, color: fg };

  if (href) {
    return (
      <Link href={href} className={`${className} transition-opacity hover:opacity-75`} style={style}>
        {label}
      </Link>
    );
  }
  return (
    <span className={className} style={style}>
      {label}
    </span>
  );
}
