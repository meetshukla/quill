import { PenLine } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Composer } from "@/components/composer/composer";

export const metadata = { title: "Composer" };

export default function ComposerPage() {
  return (
    <div>
      <PageHeader
        icon={PenLine}
        title="Composer"
        description="Write, quote, reply, or build a thread — then post now or queue it. You always click publish yourself."
      />
      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-7">
        <Composer />
      </div>
    </div>
  );
}
