import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page";
import { getDocsMDXComponents } from "@/components/docs/mdx";
import { docsSource } from "@/lib/docs/source";

type PageProps = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = docsSource.getPage(slug);
  if (!page) notFound();
  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      {page.data.description ? <DocsDescription>{page.data.description}</DocsDescription> : null}
      <DocsBody><MDX components={getDocsMDXComponents()} /></DocsBody>
    </DocsPage>
  );
}

export const generateStaticParams = () => docsSource.generateParams();

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = docsSource.getPage(slug);
  if (!page) notFound();
  return { title: `${page.data.title} · Quill MCP`, description: page.data.description };
}
