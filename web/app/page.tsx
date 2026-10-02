import { copy } from "@/lib/copy";
import { Bar, LinkButton, Page } from "./_components/ui";
import { DemoRing } from "./_components/DemoRing";
import { DEMO_CIRCLE } from "@/lib/demo";

export default function Home() {
  return (
    <>
      <Page>
        <h1 className="t-headline mt-2 text-ink">{copy.home.headline}</h1>
        <p className="mt-3 text-body">{copy.home.lead}</p>
        <div className="my-8">
          <DemoRing />
        </div>
        <ul className="flex flex-col gap-3">
          {copy.home.points.map((p) => (
            <li key={p} className="rounded-card bg-surface px-4 py-3 text-ink">
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center">
          <a href="/c/" className="t-small font-semibold text-ink underline underline-offset-4">
            {copy.home.haveLink}
          </a>
        </p>
        <p className="mt-2 text-center">
          <a href={`/c/?id=${DEMO_CIRCLE}`} className="t-small font-semibold text-ink underline underline-offset-4">
            {copy.home.seeCircle}
          </a>
        </p>
      </Page>
      <Bar>
        <LinkButton href="/new/">{copy.home.start}</LinkButton>
      </Bar>
    </>
  );
}
