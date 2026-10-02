import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { CircleView } from "../_components/CircleView";

export const metadata: Metadata = { title: copy.titles.circle };

export default function Page() {
  return <CircleView />;
}
