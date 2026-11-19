/**
 * In place of the keyboard hint on an iPhone or iPad, where no browser can connect a kit: why, what still works
 * here, and where to play with the kit instead.
 */
export function NoKitOnApple({ device }: { device: "iPhone" | "iPad" }) {
  return (
    <div className="suggestion no-kit" role="note">
      <p>
        <strong>The kit can't connect on {device === "iPhone" ? "an iPhone" : "an iPad"}.</strong> Apple doesn't let any{" "}
        {device} browser use MIDI, which is how the app hears your pads, so Chrome and Brave can't either.
      </p>
      <p>
        Here you can still read the notation, listen to exercises, use the metronome and the guides, and check your
        History. To play along with your kit, open the app on a computer or an Android phone.
      </p>
    </div>
  );
}
