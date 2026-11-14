import { Hammer } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageHeading } from "./page-heading";

/** shortcut: placeholder for screens built in Phases 6 and 7. Delete each use as its screen lands. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeading title={title} description={description} />
      <EmptyState
        icon={<Hammer size={24} strokeWidth={1.75} aria-hidden="true" />}
        title="This screen is being built"
        description="The data behind it is ready in the API. The page arrives in an upcoming release."
      />
    </>
  );
}
