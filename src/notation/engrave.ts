/**
 * Engraves an exercise as drum notation with VexFlow.
 *
 * VexFlow is large (about 100 KB gzipped plus a 250 KB music font), so this
 * module is only ever loaded with a dynamic import(), when notation is shown.
 * The fonts are served from our own origin: VexFlow's defaults (a CDN, or
 * fonts inlined as data: URIs) are both blocked by the Content-Security-Policy.
 *
 * The staff is drawn once per exercise. The playhead and hit results are
 * drawn on top by the caller, using the returned layout, so VexFlow never
 * runs in the animation loop.
 */
import academicoUrl from "@vexflow-fonts/academico/academico.woff2?url";
import bravuraUrl from "@vexflow-fonts/bravura/bravura.woff2?url";
import {
  Annotation,
  AnnotationVerticalJustify,
  Articulation,
  Beam,
  Dot,
  Font,
  Formatter,
  Fraction,
  GraceNote,
  GraceNoteGroup,
  ModifierPosition,
  Parenthesis,
  Renderer,
  Stave,
  StaveNote,
  Tuplet,
  VexFlow,
  Voice,
} from "vexflow/core";
import { exerciseLengthTicks, type Exercise } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";
import { mergePoints, type NoteMark, type StaffLayout, type StaffPoint } from "./layout";
import { isCompound, spellBar, type SpelledEvent, type StaffVoice } from "./spelling";

/**
 * Standard drum-kit positions on a five-line percussion staff (written as
 * treble-clef pitches): kick in the bottom space, snare in the third space,
 * toms around it, cymbals as x noteheads above, hi-hat pedal as an x below.
 */
const STAFF_KEYS: Readonly<Record<PadId, string>> = {
  crash: "a/5/x",
  hihat: "g/5/x",
  ride: "f/5/x",
  tom1: "e/5",
  tom2: "d/5",
  snare: "c/5",
  tom3: "a/4",
  kick: "f/4",
  hihatPedal: "d/4/x",
};

const STEM: Readonly<Record<StaffVoice, number>> = { hands: 1, feet: -1 };

let fontsReady: Promise<void> | null = null;

/** Loads the music and text fonts once. Resolves when notation can be drawn. */
export function loadNotationFonts(): Promise<void> {
  fontsReady ??= (async () => {
    await Promise.all([Font.load("Bravura", bravuraUrl), Font.load("Academico", academicoUrl)]);
    VexFlow.setFonts("Bravura", "Academico");
  })();
  return fontsReady;
}

function restKey(voice: StaffVoice, twoVoices: boolean): string {
  if (!twoVoices) return "b/4";
  return voice === "hands" ? "e/5" : "e/4";
}

function toStaveNote(event: SpelledEvent, voice: StaffVoice, twoVoices: boolean): StaveNote {
  const stemDirection = STEM[voice];
  const duration = `${event.value}${event.notes.length === 0 ? "r" : ""}`;
  const keys = event.notes.length === 0 ? [restKey(voice, twoVoices)] : event.notes.map((n) => STAFF_KEYS[n.pad]);
  const note = new StaveNote({ keys, duration, stemDirection, dots: event.dotted ? 1 : 0 });
  if (event.dotted) Dot.buildAndAttach([note], { all: true });
  const notes = event.notes;
  if (notes.some((n) => n.dynamic === "accent")) {
    note.addModifier(new Articulation("a>").setPosition(voice === "hands" ? ModifierPosition.ABOVE : ModifierPosition.BELOW));
  }
  if (notes.some((n) => n.dynamic === "ghost")) Parenthesis.buildAndAttach([note]);
  if (notes.some((n) => n.open)) {
    note.addModifier(new Annotation("o").setVerticalJustification(AnnotationVerticalJustify.TOP));
  }
  const flam = notes.find((n) => n.flam);
  if (flam) {
    const grace = new GraceNote({ keys: [STAFF_KEYS[flam.pad]], duration: "8", slash: true, stemDirection: 1 });
    note.addModifier(new GraceNoteGroup([grace], true));
  }
  const hand = notes.find((n) => n.hand)?.hand;
  if (hand) note.addModifier(new Annotation(hand).setVerticalJustification(AnnotationVerticalJustify.BOTTOM));
  return note;
}

const BAR_WIDTH = 420;
/** Extra room in the first bar for the clef and time signature. */
const FIRST_BAR_EXTRA = 60;
const HEIGHT = 150;
const STAFF_Y = 30;

/**
 * Draws every bar of the exercise in one row into `host` (its contents are
 * replaced) and returns where each note landed. A narrower `barWidth` packs
 * the notes closer, so the same staff is drawn bigger in the same width.
 * Call loadNotationFonts() first.
 */
export function engraveExercise(exercise: Exercise, host: HTMLDivElement, barWidth = BAR_WIDTH): StaffLayout {
  host.replaceChildren();
  const ts = exercise.timeSignature;
  const width = exercise.bars * barWidth + FIRST_BAR_EXTRA + 2;
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, HEIGHT);
  const ctx = renderer.getContext();
  // Draw in the surrounding text color, so the page's CSS themes the notation.
  ctx.setFillStyle("currentColor");
  ctx.setStrokeStyle("currentColor");
  const beamGroups = [isCompound(ts) || ts.unit === 8 ? new Fraction(3, 8) : new Fraction(1, 4)];
  const points: StaffPoint[] = [];
  const marks: NoteMark[] = [];

  let x = 0;
  for (let bar = 0; bar < exercise.bars; bar++) {
    const staveWidth = barWidth + (bar === 0 ? FIRST_BAR_EXTRA : 0);
    const stave = new Stave(x, STAFF_Y, staveWidth);
    if (bar === 0) stave.addClef("percussion").addTimeSignature(`${ts.beats}/${ts.unit}`);
    stave.setContext(ctx).draw();

    const spelled = spellBar(exercise, bar);
    const voices = (["hands", "feet"] as const).flatMap((voice) => {
      const events = spelled[voice];
      return events ? [{ voice, events }] : [];
    });
    // A bar with nothing to play still gets a whole-bar rest in the hands voice.
    if (voices.length === 0) {
      voices.push({ voice: "hands", events: [{ tick: 0, ticks: 0, value: "w", dotted: false, tuplet: null, notes: [] }] });
    }
    const twoVoices = voices.length === 2;

    const built = voices.map(({ voice, events }) => {
      const notes = events.map((e) => toStaveNote(e, voice, twoVoices));
      // Tuplets must be created before the notes join a voice: they change the notes' tick counts.
      const groups = new Map<number, StaveNote[]>();
      events.forEach((e, i) => {
        if (e.tuplet === null) return;
        const group = groups.get(e.tuplet) ?? [];
        group.push(notes[i]);
        groups.set(e.tuplet, group);
      });
      const tuplets = [...groups.values()].map((g) => new Tuplet(g, { bracketed: false, location: voice === "hands" ? 1 : -1 }));
      const vfVoice = new Voice({ numBeats: ts.beats, beatValue: ts.unit });
      // Strict mode checks that every bar adds up; the whole-bar rest placeholder is the one exception.
      if (events.length === 1 && events[0].ticks === 0) vfVoice.setMode(Voice.Mode.SOFT);
      vfVoice.addTickables(notes);
      const beams = Beam.generateBeams(notes, { groups: beamGroups, stemDirection: STEM[voice] });
      return { voice, events, notes, vfVoice, tuplets, beams };
    });

    new Formatter().joinVoices(built.map((b) => b.vfVoice)).formatToStave(built.map((b) => b.vfVoice), stave);
    for (const b of built) {
      b.vfVoice.draw(ctx, stave);
      b.beams.forEach((beam) => beam.setContext(ctx).draw());
      b.tuplets.forEach((t) => t.setContext(ctx).draw());
      b.events.forEach((e, i) => {
        const note = b.notes[i];
        if (e.ticks > 0) points.push({ tick: e.tick, x: note.getAbsoluteX() });
        // Keys were built in the order of e.notes, so getYs() lines up with them.
        const ys = note.getYs();
        const headX = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
        e.notes.forEach((n, k) => marks.push({ index: exercise.notes.indexOf(n), x: headX, y: ys[k] }));
      });
    }
    x += staveWidth;
  }

  const lengthTicks = exerciseLengthTicks(exercise);
  // The bar line at the end, so the playhead keeps moving through the last beat.
  points.push({ tick: lengthTicks, x: x - 10 });
  // Scalable: drop the fixed size so CSS can size the staff to fit, keeping its proportions.
  const svg = host.querySelector("svg");
  if (svg) {
    svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.removeProperty("width");
    svg.style.removeProperty("height");
  }
  return {
    width,
    height: HEIGHT,
    points: mergePoints(points),
    lengthTicks,
    marks,
    playheadTop: STAFF_Y - 6,
    playheadHeight: 92,
  };
}
