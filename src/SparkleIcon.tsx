/**
 * The usual "made by AI" mark: a large four-pointed sparkle with a small one
 * beside it. Drawn in currentColor so it follows the button's text color
 * (theme and disabled state alike). Decorative: the text next to it, and the
 * card's "Written by AI" line, say the same in words.
 */
export function SparkleIcon() {
  return (
    <svg className="sparkle-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6.5 1.5c.4 2.9 1.6 4.6 4.5 5-2.9.4-4.1 2.1-4.5 5-.4-2.9-1.6-4.6-4.5-5 2.9-.4 4.1-2.1 4.5-5Z"
      />
      <path fill="currentColor" d="M12.5 9.5c.2 1.4.8 2.1 2 2.3-1.2.2-1.8.9-2 2.2-.2-1.3-.8-2-2-2.2 1.2-.2 1.8-.9 2-2.3Z" />
    </svg>
  );
}
