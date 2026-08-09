/**
 * Semantic version parsing & comparison.
 *
 * Used by the update checker so that:
 *  - "1.0.6" < "1.0.7" < "1.1.0" < "2.0.0"
 *  - missing segments are treated as zero ("1.0" === "1.0.0")
 *  - prereleases sort BELOW their release counterpart and never masquerade as
 *    a stable release ("1.0.7-beta" < "1.0.7").
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Prerelease identifiers, e.g. ["beta", "2"] for "1.0.7-beta.2". */
  prerelease: string[];
}

const VERSION_RE = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?\s*$/;

export function parseVersion(input: string | null | undefined): ParsedVersion | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = VERSION_RE.exec(trimmed);
  if (!match) return null;
  const major = Number(match[1]);
  if (!Number.isFinite(major)) return null;
  return {
    major,
    minor: match[2] !== undefined ? Number(match[2]) : 0,
    patch: match[3] !== undefined ? Number(match[3]) : 0,
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

export function isValidVersion(input: string | null | undefined): boolean {
  return parseVersion(input) !== null;
}

/**
 * Compares two versions. Returns:
 *   1 when a > b
 *   0 when a == b
 *  -1 when a < b
 *
 * Invalid input sorts below any valid version (so a malformed remote version
 * can never falsely trigger an update).
 */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  // No prerelease on either side → equal.
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
  // A version with a prerelease is OLDER than the same version without one.
  if (pa.prerelease.length === 0) return 1;
  if (pb.prerelease.length === 0) return -1;

  // Compare prerelease identifiers (numeric < alphanumeric, fewer ids = lower).
  const len = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ai = pa.prerelease[i];
    const bi = pb.prerelease[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const aiNumeric = /^\d+$/.test(ai);
    const biNumeric = /^\d+$/.test(bi);
    if (aiNumeric && biNumeric) {
      const na = Number(ai);
      const nb = Number(bi);
      if (na !== nb) return na > nb ? 1 : -1;
    } else if (aiNumeric) {
      return -1;
    } else if (biNumeric) {
      return 1;
    } else if (ai !== bi) {
      return ai > bi ? 1 : -1;
    }
  }
  return 0;
}

/** True when `remote` is strictly newer than `local`. */
export function isNewerVersion(remote: string | null | undefined, local: string | null | undefined): boolean {
  return compareVersions(remote, local) > 0;
}
