/** “Name (copy)”, or “Name (copy 2)” when that is taken: for a duplicated experiment or project. */
export function copyName(name: string, taken: ReadonlySet<string>): string {
  for (let i = 1; ; i += 1) {
    const candidate = i === 1 ? `${name} (copy)` : `${name} (copy ${String(i)})`;
    if (!taken.has(candidate)) return candidate;
  }
}
