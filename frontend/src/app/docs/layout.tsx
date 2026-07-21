import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider";
import { docsBaseOptions } from "@/lib/docs/layout";
import { docsSource } from "@/lib/docs/source";
import "./docs.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div id="nd-docs-layout" className="min-h-screen bg-background text-foreground">
      <RootProvider theme={{ enabled: false }} search={{ options: { api: "/docs/search" } }}>
        <DocsLayout {...docsBaseOptions()} tree={docsSource.getPageTree()}>{children}</DocsLayout>
      </RootProvider>
    </div>
  );
}
