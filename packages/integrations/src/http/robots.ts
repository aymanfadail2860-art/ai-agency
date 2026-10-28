/**
 * Minimal robots.txt-fortolker (User-agent: * og eget agentnavn).
 * Indhold hentes kun fra stier, der ikke er udelukket.
 */
export interface RobotsRules {
  disallow: string[];
  allow: string[];
}

export function parseRobots(text: string, agentToken = "aiagencyresearchbot"): RobotsRules {
  const groups: Array<{ agents: string[]; rules: RobotsRules }> = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: { disallow: [], allow: [] } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "disallow" && value) current.rules.disallow.push(value);
    if (field === "allow" && value) current.rules.allow.push(value);
  }

  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && agentToken.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  return (specific ?? wildcard)?.rules ?? { disallow: [], allow: [] };
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const longest = (list: string[]) =>
    list.filter((p) => matches(p, path)).reduce((max, p) => Math.max(max, p.length), -1);
  const disallowed = longest(rules.disallow);
  if (disallowed < 0) return true;
  return longest(rules.allow) >= disallowed;
}
