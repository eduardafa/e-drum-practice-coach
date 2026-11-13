import type { Exercise } from "./exercises/types";
import { releasing } from "./releasing";

interface Props {
  exercise: Exercise;
  loops: number;
  wrongHits: number;
  onPlayAlong: () => void;
  onAgain: () => void;
  onClose: () => void;
}

/** After a wait-mode run: what was played, and the next step, playing it in time with the click. */
export function LearnSummary({ exercise, loops, wrongHits, onPlayAlong, onAgain, onClose }: Props) {
  return (
    <section className="calibration results" aria-labelledby="learn-title">
      <h2 id="learn-title">{exercise.name} · learned without the click</h2>
      <p className="results-score">{loops === 1 ? "1 loop" : `${loops} loops`}</p>
      <p className="calibration-meta">
        {wrongHits === 0 ? "No wrong hits." : `${wrongHits} wrong ${wrongHits === 1 ? "hit" : "hits"} along the way.`}
      </p>
      <p className="path-advice ready">
        {wrongHits <= loops
          ? "You know the pattern. Next, play it in time with the click."
          : "Try it once more until the wrong hits drop, then play it in time with the click."}
      </p>
      <div className="calibration-actions">
        <button className={wrongHits <= loops ? "primary" : "secondary"} onClick={releasing(onPlayAlong)}>
          Play along with the click
        </button>
        <button className={wrongHits <= loops ? "secondary" : "primary"} onClick={releasing(onAgain)}>
          Learn again
        </button>
        <button className="secondary" onClick={releasing(onClose)}>
          Close
        </button>
      </div>
      <p className="hint">Learn isn't timed or saved to History. Play along scores your timing.</p>
    </section>
  );
}
