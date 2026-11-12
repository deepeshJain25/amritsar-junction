import { useEffect, useState } from 'react';

// A sticky bar on the menu page: jump to a chapter, or show vegetarian dishes only.
// Every dish is already in the HTML for Google; this only hides and scrolls.
interface Props {
  chapters: { id: string; title: string }[];
}

export default function MenuTools({ chapters }: Props) {
  const [vegOnly, setVegOnly] = useState(false);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-veg-only', vegOnly);
  }, [vegOnly]);

  return (
    <div className="aj-tools">
      <label className="aj-tools__jump">
        <span className="aj-sr">Jump to a chapter</span>
        <select
          className="aj-input"
          defaultValue=""
          onChange={(e) => {
            const target = document.getElementById(e.target.value);
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            e.target.value = '';
          }}
        >
          <option value="" disabled>
            Jump to chapter
          </option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="aj-tools__veg">
        <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} />
        <span>
          Veg<span className="aj-tools__long">etarian</span> only
        </span>
      </label>
    </div>
  );
}
