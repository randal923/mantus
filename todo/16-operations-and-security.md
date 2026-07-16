# Production observability, operations, error handling, and security

Hardening runs alongside every feature and is required before public access.
The [`authentication follow-ups`](17-auth-follow-ups.md) track the currently
known auth-specific gaps.

Split into one-session units. 16a and 16e protect the live game and should
land earliest; 16h is the final pre-launch gate:

1. [Network and resource limits](16a-network-and-resource-limits.md)
2. [Structured logging and tracing](16b-structured-logging.md)
3. [Metrics, dashboards, and alerting](16c-metrics-and-alerting.md)
4. [Administration tooling](16d-admin-tooling.md)
5. [Server error-handling hardening](16e-server-error-handling.md)
6. [Continuous durability and deployment](16f-durability-and-deployment.md)
7. [Database, audit, and recovery](16g-database-audit-and-recovery.md)
8. [Testing, release gates, and production checklist](16h-testing-and-release-gates.md)

[Back to overview](README.md)
