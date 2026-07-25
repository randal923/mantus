/**
 * The spell-parity report. It is generated from the parsed catalog entries and
 * is deterministic: the same entries always produce the same report, so it can
 * be recomputed from the committed catalog without a Canary checkout.
 *
 * The counts deliberately separate *registered gameplay definitions* from
 * non-content (Canary's `#example.lua` documentation stubs). Only registered
 * definitions are gated: the zero target is meaningless if a documentation
 * file can hold it above zero forever.
 */
export function buildSpellReport(entries) {
  const registered = entries.filter(
    (entry) => entry.parity.status !== "non-content",
  );
  const disabled = registered.filter((entry) => !entry.supported);
  const reasons = [
    ...new Set(registered.flatMap((entry) => entry.unsupportedReasons)),
  ].sort();
  const owners = [
    ...new Set(disabled.map((entry) => entry.parity.blockedBy)),
  ].sort();
  return {
    total: entries.length,
    nonContent: entries.length - registered.length,
    registered: registered.length,
    supported: registered.filter((entry) => entry.supported).length,
    disabled: {
      total: disabled.length,
      spells: disabled.filter((entry) => entry.origin === "spell").length,
      runes: disabled.filter((entry) => entry.origin === "rune").length,
      byOwner: Object.fromEntries(
        owners.map((owner) => [
          owner,
          disabled.filter((entry) => entry.parity.blockedBy === owner).length,
        ]),
      ),
    },
    /** Declared formula inputs Canary applies and this importer drops. */
    ignoredFormulaFields: registered.reduce(
      (total, entry) => total + entry.ignoredFormulaFields.length,
      0,
    ),
    /** Registered definitions whose Lua body has no reviewed counterpart. */
    unreviewedCallbacks: registered.filter((entry) =>
      entry.unsupportedReasons.some(
        (reason) =>
          reason === "procedural cast callback" ||
          reason === "procedural combat callback",
      ),
    ).length,
    reasons: Object.fromEntries(
      reasons.map((reason) => [
        reason,
        registered.filter((entry) => entry.unsupportedReasons.includes(reason))
          .length,
      ]),
    ),
  };
}
