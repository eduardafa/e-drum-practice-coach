/**
 * The "Before you play" card: the setup checks a beginner can't get from the
 * app's timing feedback (seat, grip, hi-hat pedal, loose wrists, volume), and
 * when to offer the card on its own. Pure, so the rules are tested without a dialog.
 */
import { PATHS } from "../exercises/path";
import type { Handedness } from "../handedness";

export interface SetupCheck {
  id: "seat" | "grip" | "hihat" | "relax" | "volume";
  title: string;
  text: string;
}

/** The checks, one sentence each. The hi-hat foot follows the kit's handedness. */
export function beforeYouPlayChecks(handedness: Handedness): readonly SetupCheck[] {
  const hihatFoot = handedness === "left" ? "right" : "left";
  return [
    {
      id: "seat",
      title: "Seat",
      text: "Set the seat so your thighs are level or slope slightly down toward your knees, with both feet resting on the pedals.",
    },
    {
      id: "grip",
      title: "Grip",
      text: "Hold each stick about a third of the way up from the end, loosely between your thumb and first two fingers, so it can bounce.",
    },
    {
      id: "hihat",
      title: "Hi-hat pedal",
      text: `Keep your ${hihatFoot} foot pressing the hi-hat pedal down, so the hi-hat stays closed and sounds a short "chick", unless the exercise says to open it.`,
    },
    {
      id: "relax",
      title: "Loose shoulders and wrists",
      text: "Let your shoulders drop and your wrists stay loose: each hit comes from the wrist, and the stick springs back up by itself.",
    },
    {
      id: "volume",
      title: "Volume",
      text: "Turn the drum module's volume down, or use headphones, before you start.",
    },
  ];
}

/** Whether `exerciseId` is one of the numbered First steps exercises, on any part. */
export function isFirstStepsExercise(exerciseId: string): boolean {
  return PATHS.some((path) => path.steps.some((step) => step.id === exerciseId));
}

/**
 * Whether to show the card on its own: the first time a First steps exercise is
 * chosen (or is already chosen when the app opens), until it has been dismissed once.
 * After that it opens only from the metronome guide.
 */
export function shouldOfferBeforeYouPlay(exerciseId: string | null | undefined, seen: boolean): boolean {
  return !seen && typeof exerciseId === "string" && isFirstStepsExercise(exerciseId);
}
