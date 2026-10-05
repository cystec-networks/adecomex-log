import type { ReactNode } from "react";

export function TruncatedCell({
  value,
  className = "",
  maxClass = "max-w-[160px]",
}: {
  value: string | null;
  className?: string;
  maxClass?: string;
}) {
  return (
    <span title={value ?? undefined} className={`block truncate ${maxClass} ${className}`}>
      {value ?? "—"}
    </span>
  );
}

export function TruncatedCellWithChildren({
  children,
  title,
  className = "",
  maxClass = "max-w-[160px]",
}: {
  children: ReactNode;
  title?: string;
  className?: string;
  maxClass?: string;
}) {
  return (
    <span title={title} className={`block truncate ${maxClass} ${className}`}>
      {children}
    </span>
  );
}
