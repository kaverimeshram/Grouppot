import type { Metadata } from "next";
import { TabNew } from "../../_components/TabNew";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.titles.tabNew };

export default function Page() {
  return <TabNew />;
}
