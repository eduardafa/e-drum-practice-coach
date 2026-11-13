import { createContext, useContext } from "react";
import { DEFAULT_HANDEDNESS, type Handedness } from "./handedness";

/** The drummer's kit setup, from Settings. Provided by App; read wherever sides matter. */
export const HandednessContext = createContext<Handedness>(DEFAULT_HANDEDNESS);

export function useHandedness(): Handedness {
  return useContext(HandednessContext);
}
