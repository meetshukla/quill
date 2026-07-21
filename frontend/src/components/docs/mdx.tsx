import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export const getDocsMDXComponents = (components?: MDXComponents): MDXComponents => ({
  ...defaultMdxComponents,
  ...components
});
