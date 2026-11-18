import { useMemo } from "react";
import { dynamicsTip, sessionDynamics, type DynamicCount } from "./history/dynamics";
import type { SessionRecord } from "./history/record";
import { Term } from "./Term";

interface Props {
  record: SessionRecord;
}

function count(c: DynamicCount, what: string): string {
  return `${c.good} of ${c.played} ${what}`;
}

/**
 * Loud and soft (EDU-127): how many accents were loud enough and ghost notes
 * soft enough, with one tip. Shown on the results screen and in a session
 * opened from History; nothing when the exercise has no accents or ghost notes.
 */
export function DynamicsSummary({ record }: Props) {
  const result = useMemo(() => sessionDynamics(record), [record]);
  if (!result) return null;
  const parts: string[] = [];
  if (result.accents && result.accents.played > 0) parts.push(`Accents: ${count(result.accents, "loud enough")}`);
  if (result.ghosts && result.ghosts.played > 0) parts.push(`Ghost notes: ${count(result.ghosts, "soft enough")}`);
  return (
    <section className="dynamics-summary" aria-labelledby={`dynamics-${record.id}`}>
      <h3 id={`dynamics-${record.id}`}>Loud and soft</h3>
      {!result.sameStrength && parts.length > 0 && <p className="dynamics-counts">{parts.join(" · ")}</p>}
      <p className="dynamics-tip">{dynamicsTip(result)}</p>
      <p className="hint">
        {result.accents && (
          <>
            <Term word="accent">Accents</Term> (marked &gt;) should be clearly louder than your other notes.{" "}
          </>
        )}
        {result.ghosts && (
          <>
            <Term word="ghost note">Ghost notes</Term> (in brackets) should be clearly softer.{" "}
          </>
        )}
        How hard you hit doesn&apos;t change your timing score.
      </p>
    </section>
  );
}
