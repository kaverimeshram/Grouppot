import { copy } from "@/lib/copy";
import { Bar, LinkButton, Page } from "./_components/ui";
import { DemoRing } from "./_components/DemoRing";
import { MyCircles } from "./_components/MyCircles";
import { DEMO_CIRCLE } from "@/lib/demo";

const textLink = "t-small inline-flex min-h-11 items-center px-3 font-semibold text-ink underline underline-offset-4";

export default function Home() {
  return (
    <>
      <Page>
        <h1 className="t-headline mt-2 text-ink">{copy.home.headline}</h1>
        <p className="mt-3 text-body">{copy.home.lead}</p>
        <div className="my-8">
          <DemoRing />
        </div>
        <MyCircles />

        <section aria-labelledby="how" className="mt-8">
          <h2 id="how" className="t-lead text-ink">
            {copy.home.howHeading}
          </h2>
          <ol className="mt-4 flex flex-col gap-6">
            {copy.home.steps.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span aria-hidden="true" className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface font-semibold text-ink">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-ink">{step.title}</p>
                  <p className="mt-1 text-body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="protect" className="mt-8">
          <h2 id="protect" className="t-lead text-ink">
            {copy.home.protectHeading}
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {copy.home.points.map((p) => (
              <li key={p} className="rounded-card bg-surface px-4 py-3 text-ink">
                {p}
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" aria-labelledby="faq-heading" className="mt-8 scroll-mt-6">
          <h2 id="faq-heading" className="t-lead text-ink">
            {copy.faq.heading}
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {copy.faq.items.map((item) => (
              <details key={item.q} className="group rounded-card bg-surface px-4">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden="true" className="shrink-0 text-mute transition-transform group-open:rotate-45 motion-reduce:transition-none">
                    +
                  </span>
                </summary>
                <div className="flex flex-col gap-3 pb-4 text-body">
                  {item.a.map((block) =>
                    typeof block === "string" ? (
                      <p key={block}>{block}</p>
                    ) : (
                      <ul key={block[0]} className="flex list-disc flex-col gap-2 pl-5">
                        {block.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <p className="mt-8 text-center">
          <a href="/c/" className={textLink}>
            {copy.home.haveLink}
          </a>
        </p>
        <p className="mt-2 text-center">
          <a href={`/c/?id=${DEMO_CIRCLE}`} className={textLink}>
            {copy.home.seeCircle}
          </a>
        </p>
        <p className="mt-2 text-center">
          <a href="/tab/new/" className={textLink}>
            {copy.home.splitBill}
          </a>
        </p>
      </Page>
      <Bar>
        <LinkButton href="/new/">{copy.home.start}</LinkButton>
      </Bar>
    </>
  );
}
