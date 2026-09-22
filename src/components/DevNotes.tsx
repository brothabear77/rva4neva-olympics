import { Banner } from "./ui";

/**
 * Mistakes in the content files, shown only while running locally. A bio written
 * for a name that is not on the roster, or a photo path with a typo, would
 * otherwise just never appear, with nothing to say why.
 */
export function DevNotes({ file, notes }: { file: string; notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="mb-6">
      <Banner tone="error">
        <p className="font-semibold">Check {file}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">This notice only appears while running locally.</p>
      </Banner>
    </div>
  );
}
