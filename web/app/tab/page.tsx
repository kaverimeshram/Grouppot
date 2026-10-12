import type { Metadata } from "next";
import { TabView } from "../_components/TabView";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.titles.tab };

export default function Page() {
  return <TabView />;
}
