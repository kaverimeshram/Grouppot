import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { NewCircle } from "../_components/NewCircle";

export const metadata: Metadata = { title: copy.titles.start };

export default function Page() {
  return <NewCircle />;
}
