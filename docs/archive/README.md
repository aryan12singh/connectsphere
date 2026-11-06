# Archive

Superseded documents, kept for history. Don't rely on them for current behaviour.

| File | What it was | Use instead |
|---|---|---|
| [development-log-pointer.md](development-log-pointer.md) | The old `docs/development-log/dev-log.md`, a short pointer left when the log moved | [docs/devlogs/DEVLOG.md](../devlogs/DEVLOG.md) |
| [erd/schema.prisma](erd/schema.prisma) | Sprint 1 draft of the whole logical data model, from before the services were split | Each service's `services/<service>/prisma/schema.prisma`, and the [venue data model](../architecture/venue-data-model.md) |
| [erd/schema-updated.prisma](erd/schema-updated.prisma) | A proposed revision of that draft for CS-10/CS-11/CS-30 review | The same live service schemas |

Neither `.prisma` file here is deployable or migrated.
