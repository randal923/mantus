# Combat condition lifetime

Combat conditions are authoritative in-memory state owned by a creature and
advanced only from the game tick's server clock.

- Poison, fire, and energy stack up to three times. Refreshing keeps the
  strongest magnitude, preserves the next tick deadline, and extends expiry.
- Other conditions replace the prior source data, refresh expiry, and keep the
  strongest numeric magnitude.
- At most five overdue condition ticks are applied in one server tick.
- All current conditions are session-scoped. Logout, death, and server restart
  clear them; none currently require persistence across an offline boundary.

If a future condition must survive logout, its absolute expiry and validated
payload must be added to the character persistence snapshot before that
condition is enabled.
