import { FITTED_SIZES, headCircumference } from "@/lib/engine";

/** Fitted cap size chart. Pure arithmetic (size x pi), no brand data. */
export function SizeTable({ highlight }: { highlight?: string[] }) {
  return (
    <div className="table-scroll">
      <table className="size-table">
        <caption className="sr-only">Fitted cap sizes and head measurements</caption>
        <thead>
          <tr>
            <th scope="col">Cap size</th>
            <th scope="col">Head (cm)</th>
            <th scope="col">Head (inches)</th>
          </tr>
        </thead>
        <tbody>
          {FITTED_SIZES.map((s) => {
            const c = headCircumference(s)!;
            const here = highlight?.includes(s);
            return (
              <tr key={s} style={here ? { background: "var(--sea-soft)", fontWeight: 700 } : undefined}>
                <th scope="row">{s}</th>
                <td>{c.cm.toFixed(1)}</td>
                <td>{c.inches.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HowToMeasure() {
  return (
    <ol className="small" style={{ paddingLeft: "1.2rem" }}>
      <li>Wrap a soft tape measure around your head, about one finger above your ears and eyebrows.</li>
      <li>Keep it level and snug, not tight.</li>
      <li>Read the measurement and pick the cap size with the same or the next bigger number.</li>
    </ol>
  );
}
