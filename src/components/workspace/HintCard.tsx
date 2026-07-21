import type { ReactNode } from "react";

export function HintCard({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <details className="workspace-hint-card">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}
