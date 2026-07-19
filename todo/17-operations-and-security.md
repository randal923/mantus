# Production observability, operations, error handling, and security

Hardening runs alongside every feature and is required before public access.
The [`authentication follow-ups`](18-auth-follow-ups.md) track the currently
known auth-specific gaps.

Split into one-session units. 17a and 17e protect the live game and should
land earliest; 17h is the final pre-launch gate:

1. [Network and resource limits](17a-network-and-resource-limits.md)
2. [Structured logging and tracing](17b-structured-logging.md)
3. [Metrics, dashboards, and alerting](17c-metrics-and-alerting.md)
4. [Administration tooling](17d-admin-tooling.md)
5. [Server error-handling hardening](17e-server-error-handling.md)
6. [Continuous durability and deployment](17f-durability-and-deployment.md)
7. [Database, audit, and recovery](17g-database-audit-and-recovery.md)
8. [Testing, release gates, and production checklist](17h-testing-and-release-gates.md)

[Back to overview](README.md)
