# RBAC Matrix — Leadership That Works

## Legend

`C/R/U/D` = Create / Read / Update / Delete. `X` = execute domain action (Open, Lock, Reveal, Send Event, Close Game, Export). `AGG` = aggregate-only read. `OWN` = own record only. `TEAM` = assigned team only. `SUB` = mapped subordinate only. `META` = metadata/progress only, not content.

All authorization is enforced server-side and scoped by `tenant_id` and, when applicable, `batch_id`. UI hiding is not an authorization control.

| Module / Resource | Super Admin | Program Admin / L&D | Lead Trainer | Co-Facilitator | Participant | Line Manager | Sponsor Viewer |
|---|---|---|---|---|---|---|---|
| Tenant / bank | CRUD | R tenant sendiri | R | - | - | - | - |
| Program template & master content | CRUD | R | R | R | R published | - | - |
| Program scoring/config version | CRUD | R | R/U batch/program scope | R | R published | - | R summary |
| Batch | CRUD | CRUD tenant sendiri | R/U assigned batch | R assigned batch | R own batch | R mapped batch | R assigned batch |
| Participant import / roster | CRUD | CRUD | R/U team assignment | R TEAM | R OWN profile | R SUB minimal profile | AGG only |
| Team management | CRUD | CRUD | CRUD assigned batch | R TEAM | R own team | - | AGG only |
| Session sequence | CRUD | CRUD template/batch | R/U/X | R | R opened sessions | - | AGG status |
| Trainer Console | R/X support | R status | R/U/X | R TEAM | R state only | - | - |
| Activity configuration | CRUD | R | R/U before lock | R | R opened config | - | - |
| Individual submissions (non-private) | R support/audit only | META | R | R TEAM when activity allows | C/R/U OWN until locked | R SUB only where explicitly shared | AGG only |
| Private reflection payload | - | - | R assigned batch | - | C/R/U OWN | - | - |
| Self Diagnostic / Planner / Decision tools | R support/audit only | META | R | R TEAM only if activity is team-scoped | C/R/U OWN | R SUB only if explicitly shared in 30-Day workflow | AGG only |
| Pre/Post Test attempt | R support/audit only | R result, not unrevealed key | R result | R TEAM result if assigned | C/R OWN | - | AGG result |
| Question bank / answer key | CRUD | R published metadata | R | - | R only after Reveal and only allowed explanation | - | - |
| Reveal answer key | X | - | X | - | - | - | - |
| Game submission / vote | R support/audit only | R result | R | R TEAM | C/R/U OWN or TEAM as activity permits | - | AGG result |
| Twist / Event Card dispatch | CRUD content | - | X | - | R received card | - | - |
| Game configuration | CRUD | R | R/U | - | - | - | - |
| Observer rubric score | R support/audit only | R result | R/U admin correction with audit | C/R/U TEAM | R own/team result after reveal policy | - | AGG result |
| Leaderboard | R | R | R/X projector | R TEAM/all if trainer exposes | R when exposed | - | AGG |
| 30-Day Plan | R support/audit only | META | R | - | C/R/U OWN | R SUB | AGG only |
| D7 self review | R support/audit only | META | R | - | C/R/U OWN | R SUB after submit | AGG only |
| D14/D30 Manager Follow-up | R support/audit only | META | R | - | R OWN | C/R/U SUB | AGG only |
| Impact Metrics baseline/D30 | R support/audit only | R result | R | - | C/R/U OWN participant fields | C/R/U SUB manager fields | AGG only |
| L1 Evaluation | R support/audit only | R/Export aggregate | R | - | C/R/U OWN | - | AGG |
| Kirkpatrick L1–L4 dashboard | R | R | R batch | R limited | R own | R SUB limited | AGG only, k>=5 |
| Batch/unit aggregate dashboard | R | R | R | R TEAM | R own | R SUB | AGG only, k>=5 |
| Export XLSX/PDF | X | X tenant/batch | X assigned batch | - | X own report/certificate | X SUB follow-up summary if enabled | X aggregate only, k>=5 |
| Audit log | R global | R tenant admin events | R own privileged actions | R own rubric events | R own security/account events | R own events | - |
| Retention / deletion request | CRUD policy | C/R/U tenant policy; execute approved deletion | R policy | - | C/R OWN request | - | - |

## Mandatory authorization predicates

Every protected query/action evaluates all applicable predicates: authenticated user; tenant membership; batch membership; required role/action; resource belongs to same tenant; resource belongs to allowed batch; ownership/team/subordinate scope; activity status (Open/Locked/Revealed); and privacy classification.

Sponsor aggregation uses a hard minimum cohort size of 5. Any slice producing fewer than 5 participants returns suppressed values, not zero and not individual rows.

Private reflections are deliberately excluded from Super Admin and Program Admin payload access. Super Admin may see operational metadata/audit events but not the reflection body. This follows the prompt's rule that reflection content is visible only to Participant and Lead Trainer.

## Automated test requirements

`packages/authz/test/rbac.matrix.test.ts` covers the critical matrix constraints. Integration tests must additionally verify PostgreSQL tenant isolation, assigned-team observer scope, subordinate mapping, activity lock/reveal state, and sponsor k-anonymity suppression.
