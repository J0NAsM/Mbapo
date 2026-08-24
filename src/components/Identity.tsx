import type { CSSProperties } from "react";

export type PersonIdentity = {
  color?: string;
  initials?: string;
  name?: string;
};

function initialsFor(person: PersonIdentity) {
  if (person.initials) return person.initials;
  return (person.name || "MB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function Avatar({
  person,
  size = "",
}: {
  person: PersonIdentity;
  size?: string;
}) {
  const style: CSSProperties | undefined = person.color
    ? { background: person.color }
    : undefined;
  return (
    <span className={`avatar ${size}`} style={style} aria-hidden="true">
      {initialsFor(person)}
    </span>
  );
}

export function Stars({ value }: { value: number | string }) {
  return (
    <span className="stars">
      ★ <b>{value}</b>
    </span>
  );
}
