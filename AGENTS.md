# AGENTS.md

This file defines the repository-wide working agreement for agents operating in this
project.

More specific instructions may be added in nested `AGENTS.md` files. The closest
applicable file takes precedence.

Keep component-specific rules near the component they govern. Do not duplicate
repository-wide instructions in child directories.

---

## 1. Project Context

Before making changes, understand what this repository contains and how its major
components interact.

At minimum:

* Read the root `README.md`.
* Inspect the top-level repository structure.
* Read the nearest component README before modifying an unfamiliar area.
* Check for nested `AGENTS.md` files.
* Inspect relevant configuration, tests, interfaces, and documentation.
* Preserve the current architecture unless the task explicitly requires a redesign,
  migration, or compatibility break.

Do not infer component responsibilities solely from filenames. Confirm how the code is
actually structured before changing it.

---

## 2. Operating Model

The main thread is responsible for:

* understanding requirements;
* resolving important ambiguities;
* architecture and design decisions;
* decomposition of work;
* integration of changes;
* verification;
* final acceptance.

For any non-trivial task containing two or more independently verifiable,
non-overlapping work units, use sub-agents by default.

Good candidates for delegation include:

* independent modules;
* implementation and test work in separate areas;
* documentation and code updates with non-overlapping ownership;
* investigation of multiple independent failure hypotheses;
* independent repository audits;
* evaluation of alternative implementations.

Do not delegate merely to create more threads.

Simple, indivisible, tightly coupled, sequentially dependent, or overlapping work is
exempt.

When parallel write-capable agents are used:

* assign explicit file, directory, or module ownership;
* never allow concurrent agents to modify overlapping files;
* clearly define the expected output of each subtask;
* prevent subtasks from silently expanding their scope.

Architecture, compatibility, security, data-model, public-interface, deployment, and
product decisions remain the responsibility of the main thread.

A sub-agent result is evidence, not automatic acceptance. The main thread must inspect
and verify integrated work.

---

## 3. Before Making Changes

Before implementation:

1. Read applicable instructions.
2. Inspect repository structure.
3. Inspect relevant documentation.
4. Check current Git status.
5. Inspect files directly related to the task.
6. Identify existing tests and verification commands.
7. Identify compatibility boundaries that may be affected.

Assume existing modified and untracked files belong to the user or another active
workstream.

Preserve them.

Do not:

* discard unrelated changes;
* overwrite unrelated work;
* reformat unrelated files;
* perform repository-wide cleanup without permission;
* include unrelated modifications in task-owned commits.

If required work overlaps unrelated modifications and cannot be separated safely,
stop and report the conflict before making destructive changes.

For non-trivial tasks, state a short implementation plan with explicit completion
criteria before starting.

Resolve ambiguities that could materially change:

* architecture;
* public behavior;
* security;
* privacy;
* persisted data;
* APIs;
* file formats;
* deployment;
* compatibility;
* experimental validity;
* user-visible behavior.

Prefer the smallest coherent change that satisfies the requirement.

Do not perform opportunistic refactors outside the requested scope.

---

## 4. Scope and Change Ownership

Every task should have a clearly bounded scope.

Agents must distinguish between:

* files intentionally changed for the task;
* files inspected but not modified;
* generated artifacts;
* pre-existing user changes;
* unrelated repository state.

A task must not silently expand from a local fix into a broader redesign.

When a broader change appears necessary:

1. identify why;
2. explain the affected compatibility or architecture boundary;
3. return the decision to the main thread.

Avoid speculative abstractions, generalized frameworks, or future-proofing that is not
required by the current task.

---

## 5. Git and Repository Safety

Do not:

* commit;
* amend;
* squash;
* rebase;
* push;
* force-push;
* delete branches;
* open a pull request;
* merge branches;

unless the user explicitly requests the corresponding action.

When a commit is requested:

1. inspect Git status;
2. review the final diff;
3. confirm verification results;
4. stage only task-owned files;
5. ensure secrets and unrelated modifications are excluded;
6. commit only verified work.

Use focused imperative commit subjects.

Examples:

```text
Add retry handling for artifact uploads
Fix incorrect cache invalidation
Split parser state from transport layer
Document experiment reproducibility workflow
```

Never describe partially verified or failing work as complete.

Never absorb, rewrite, or discard unrelated user changes.

---

## 6. Development Records

Important delivered changes should be recorded in the repository's existing
development log system when one exists.

Use a dated record such as:

```text
devlog/YYYY-MM-DD.md
```

when appropriate for:

* major features;
* architecture changes;
* multi-phase implementation;
* deployment changes;
* compatibility changes;
* important algorithm changes;
* substantial experimental work;
* significant security changes;
* changes whose rationale will matter later.

Small fixes, investigations, code reviews, and minor documentation corrections do not
require a devlog entry unless requested.

Do not create a second repository-wide logging system when one already exists.

Development records should summarize:

* what changed;
* why it changed;
* important design decisions;
* verification performed;
* unresolved limitations.

Do not paste raw terminal output unless it is necessary evidence.

---

## 7. Versioning

Follow the repository's existing versioning system.

If the repository or component uses Semantic Versioning, classify delivered updates
using the highest applicable level:

* **MAJOR**: breaking change to a public compatibility boundary;
* **MINOR**: backward-compatible feature or material capability addition;
* **PATCH**: backward-compatible bug fix, refactor, test change, maintenance, or
  documentation correction.

Compatibility boundaries may include:

* public APIs;
* CLI interfaces;
* configuration formats;
* environment variables;
* persisted data;
* database schemas;
* file formats;
* network protocols;
* plugin interfaces;
* deployment contracts;
* serialized artifacts;
* SDK interfaces;
* externally consumed behavior.

Do not invent a new versioning mechanism solely because this file mentions versioning.

If this repository documents component versions in README files or release records,
keep them consistent with delivered changes.

Do not update unrelated component versions.

Generated output or a devlog entry alone does not require another version increment.

Keep component release versions distinct from internal schema, model, protocol,
dataset, experiment, migration, or artifact revisions.

---

## 8. Architecture and Implementation Quality

Keep responsibilities explicit and localized.

Prefer separation between:

* domain logic;
* orchestration;
* interfaces;
* transport;
* persistence;
* configuration;
* external integrations;
* presentation;
* infrastructure;
* evaluation logic.

Avoid:

* hidden global state;
* circular dependencies;
* unbounded `utils`, `helpers`, or `common` modules;
* unrelated responsibilities in one module;
* oversized god objects;
* unnecessary inheritance hierarchies;
* speculative frameworks;
* duplicated business logic.

Prefer:

* composition;
* small stable interfaces;
* explicit dependencies;
* deterministic behavior where practical;
* testable pure logic;
* clear ownership of state.

Follow the repository's existing conventions for:

* naming;
* formatting;
* typing;
* error handling;
* package organization;
* configuration;
* dependency injection;
* logging.

Validate inputs at system boundaries.

Handle failures deliberately.

Do not:

* silently swallow exceptions;
* return ambiguous success states;
* silently substitute invalid values;
* hide important errors behind broad fallback behavior.

Keep configuration outside core business logic.

Document non-obvious constants, invariants, assumptions, and tradeoffs.

Comments should explain **why**, not restate obvious code.

Remove dead code introduced by the current task.

Preserve compatibility shims only when their purpose and removal conditions are clear.

---

## 9. Modularity and File Structure

Prefer modular implementations with clear responsibility boundaries.

Do not place unrelated features into the same file merely because it is convenient.

For new files or substantial expansions:

* reconsider cohesion around approximately 300 lines;
* strongly justify growth beyond approximately 500 lines.

These are review signals, not hard limits.

Existing large legacy files do not need unrelated decomposition.

However, if a task adds a new responsibility to an already-large module, prefer
extracting a named and testable unit when this can be done safely within scope.

For functions:

* around 50 lines should trigger a cohesion review;
* extract logic when doing so improves readability, testing, reuse, or responsibility
  boundaries.

Avoid artificial fragmentation where every small operation becomes a separate layer.

Generated code, schemas, fixtures, migrations, datasets, model definitions, and source
corpora are exempt when splitting would reduce correctness or provenance.

---

## 10. README and Directory Documentation

Use documentation hierarchically.

The root README should describe:

* repository purpose;
* major components;
* top-level setup;
* high-level architecture;
* navigation.

Component READMEs should describe:

* local responsibilities;
* setup;
* execution;
* configuration;
* interfaces;
* testing;
* important design constraints.

Add nested READMEs when a directory has meaningful independent responsibilities that
would otherwise be difficult to understand.

Do not add README files to:

* trivial leaf directories;
* caches;
* generated output;
* vendored dependencies;
* obvious fixture folders.

Parent documentation should not duplicate details already owned by child
documentation.

---

## 11. Dependencies

Reuse existing dependencies when they adequately solve the problem.

Before introducing a new production dependency, consider:

* maintenance burden;
* security exposure;
* licensing;
* binary size;
* bundle size;
* startup cost;
* runtime cost;
* memory usage;
* GPU requirements;
* platform compatibility;
* deployment complexity;
* long-term ownership.

Ask before adding a dependency that materially affects these concerns.

Follow the repository's existing version pinning or constraint conventions.

Do not install packages merely to avoid understanding an existing implementation.

---

## 12. APIs, Schemas, and Compatibility

Preserve existing externally consumed interfaces unless a breaking change is
explicitly approved.

This includes:

* APIs;
* CLI arguments;
* configuration keys;
* environment variables;
* database schemas;
* file layouts;
* exported libraries;
* serialized data;
* network contracts;
* generated interfaces;
* model input/output contracts;
* plugin interfaces.

When modifying a shared contract:

1. identify known consumers;
2. preserve backward compatibility where practical;
3. update schemas or generated types if required;
4. update documentation;
5. add compatibility tests;
6. document migration requirements for approved breaking changes.

Database and persisted-data migrations should protect existing data and be reversible
when practical.

---

## 13. Security, Privacy, and Sensitive Data

Treat security boundaries as explicit design constraints.

Do not commit:

* credentials;
* access tokens;
* API keys;
* passwords;
* private keys;
* populated secret files;
* confidential datasets;
* user data;
* production data;
* sensitive logs.

Use synthetic examples and fixtures whenever possible.

Maintain appropriate isolation between users, tenants, environments, projects,
workspaces, accounts, and resources when such boundaries exist.

Security controls should fail closed.

Development bypasses must be:

* explicit;
* disabled by default;
* clearly documented;
* prevented from weakening production behavior.

Do not send private or sensitive data to a new external service without explicit user
approval.

Avoid logging full payloads when they may contain sensitive information.

---

## 14. Generated Files and Derived Artifacts

Determine whether a file is source-controlled input or generated output before
editing it.

Do not hand-edit generated files when a canonical generator exists.

When changing source definitions:

1. update the source;
2. regenerate derived files using the documented process;
3. verify generated diffs;
4. include only expected generated changes.

Do not regenerate unrelated artifacts merely to normalize repository state.

If a generator affects multiple independently controlled components, do not run it
blindly. Confirm the requested scope first.

---

## 15. Tests and Verification

Every behavior change should include or update tests at the lowest effective level.

For bug fixes, add a deterministic regression test whenever the defect can be reliably
reproduced.

Test relevant:

* normal behavior;
* boundary cases;
* malformed input;
* expected failures;
* permission or authorization failures;
* compatibility behavior;
* fallback behavior;
* concurrency where applicable.

Run the narrowest useful checks during development.

Run broader checks when the change affects:

* multiple components;
* shared libraries;
* public interfaces;
* schemas;
* persistence;
* concurrency;
* deployment;
* security;
* performance-critical behavior.

Never weaken, delete, skip, or rewrite tests merely to make an implementation pass.

Do not claim a test passed unless it actually ran successfully.

If a required check cannot run, report:

* the exact command;
* why it could not run;
* what remains unverified.

Prefer the environment already configured for the repository.

Do not install dependencies, download large artifacts, start external services, use
production infrastructure, or perform destructive operations unless required and
authorized.

---

## 16. Performance and Resource Usage

Do not optimize without evidence unless the task is explicitly performance-related.

When performance matters:

* establish a baseline;
* identify the actual bottleneck;
* measure before and after;
* separate CPU, GPU, memory, I/O, network, and latency effects where relevant.

Avoid introducing hidden asymptotic regressions.

Be cautious with:

* repeated full-data scans;
* unnecessary copies;
* unbounded caching;
* excessive concurrency;
* blocking I/O;
* accidental quadratic algorithms;
* large model or dataset loading;
* repeated external API calls.

Performance improvements must preserve correctness unless an explicitly accepted
tradeoff is documented.

---

## 17. Concurrency and State

When modifying concurrent or stateful systems, consider:

* race conditions;
* atomicity;
* retries;
* idempotency;
* cancellation;
* timeouts;
* partial failure;
* duplicate work;
* stale state;
* lock ordering;
* crash recovery.

Do not assume single-threaded execution unless the architecture guarantees it.

State transitions should be explicit and testable where practical.

---

## 18. Research, Data, and Machine Learning Work

For experiments, data pipelines, simulations, numerical work, or ML systems, preserve
reproducibility.

Record relevant:

* random seeds;
* dataset versions;
* cohort definitions;
* train/validation/test splits;
* preprocessing;
* configuration;
* software versions;
* model versions;
* checkpoints;
* prompts;
* retrieval configuration;
* evaluation metrics;
* hardware assumptions;
* experiment identifiers.

Separate:

* source data;
* preprocessing;
* configuration;
* generated data;
* checkpoints;
* evaluation output;
* reports;
* figures.

Use immutable run identifiers or versioned result directories.

Do not overwrite prior experimental results unless explicitly intended.

Record failed and inconclusive experiments when they materially affect later
decisions.

Prevent relevant forms of leakage, including:

* train/test leakage;
* duplicate-sample leakage;
* subject-level leakage;
* temporal leakage;
* answer leakage;
* evaluation against material used to construct the system.

Report separately:

1. measured results;
2. assumptions;
3. interpretation;
4. speculation.

Do not present exploratory findings as confirmed conclusions.

---

## 19. Numerical and Scientific Computing

For numerical implementations:

* state units;
* define coordinate systems;
* document sign conventions;
* track normalization;
* avoid silent unit conversion;
* verify dimensional consistency;
* record solver tolerances;
* record convergence criteria;
* distinguish numerical approximation from physical assumptions.

For optimization or simulation:

* inspect feasibility;
* test multiple initializations where relevant;
* identify boundary-seeking solutions;
* report constraints that are active or violated;
* distinguish solver success from problem validity.

For stochastic methods, report enough information to reproduce the run.

---

## 20. External Services and Network Access

Do not rely on external network services unless the task requires them.

External integrations should have:

* explicit configuration;
* timeouts;
* error handling;
* retry policy where appropriate;
* mockable or replaceable boundaries for testing.

Do not access production systems unless explicitly authorized.

Avoid tests that require live external services when deterministic local tests are
possible.

---

## 21. Documentation Changes

Update relevant documentation when changing:

* setup;
* execution;
* configuration;
* architecture;
* public interfaces;
* deployment behavior;
* persistent formats;
* compatibility;
* experimental procedures;
* operational requirements.

Documentation should describe the delivered system, not an intended future state.

Keep examples synthetic and free of secrets.

Do not duplicate the same detailed instructions across multiple README files.

---

## 22. Code Review Rules

Review in this order:

1. Functional correctness and regressions.
2. Security and privacy.
3. Data integrity and state correctness.
4. Concurrency and failure handling.
5. Public interfaces and compatibility.
6. Persistence and migration safety.
7. Tests and verification gaps.
8. Architecture and maintainability.
9. Performance where relevant.

For each actionable finding, provide:

* severity;
* exact file and line when available;
* concrete failure scenario;
* expected impact;
* why existing guards or tests do not prevent it;
* smallest safe correction.

Do not report formatting preferences already enforced by automated tooling.

If no actionable issue is found, say so and list remaining inspection or verification
gaps.

---

## 23. Refactoring Rules

Refactor only when it directly improves delivery of the requested task or removes a
clear obstacle to correctness, testing, or maintainability.

Do not combine unrelated cleanup with feature work.

When a larger refactor is justified:

* preserve behavior before changing structure;
* add or rely on regression coverage;
* make responsibility boundaries clearer;
* avoid changing public interfaces unnecessarily;
* prefer incremental transformations.

Do not rewrite working systems purely for stylistic preference.

---

## 24. Destructive and Consequential Actions

Require explicit user intent before:

* deleting significant files or data;
* rewriting Git history;
* force pushing;
* running destructive database migrations;
* deploying to production;
* publishing packages;
* creating releases;
* rotating credentials;
* modifying production infrastructure;
* sending messages or notifications externally;
* incurring meaningful cloud or API cost.

When consequences are material, explain the affected scope before executing.

---

## 25. Definition of Done

Completion depends on task type.

### Investigation or Review

A task is complete when:

* the relevant scope has been inspected;
* conclusions are evidence-based;
* uncertainties are explicit;
* verification gaps are identified;
* no files were changed unless requested.

### Small Implementation

A task is complete when:

* requested behavior is implemented;
* relevant tests are added or updated;
* focused verification passes;
* affected documentation or version records are updated when required;
* the diff is reviewed for unrelated changes and secrets.

### Cross-Component or Architectural Change

Also require:

* broader verification;
* compatibility analysis;
* affected documentation updates;
* development log update when appropriate;
* migration or operational impact disclosure.

### Research or Experimental Work

Also require:

* reproducible configuration;
* preserved prior results;
* explicit experiment identifiers;
* evaluation methodology;
* separation of measured results from interpretation;
* documented limitations.

### Commit, Push, Release, or PR Work

Perform these actions only when explicitly requested.

Report resulting:

* commit hash;
* branch;
* pull request;
* release identifier;

as applicable.

---

## 26. Final Handoff

Every final handoff must summarize:

* outcome;
* task-owned files changed;
* important design decisions;
* checks actually run;
* checks not run;
* known limitations;
* compatibility or migration impact;
* unresolved decisions or required next steps.

Do not claim completion when required verification is missing.

Do not describe uncommitted work as committed.

Do not describe local changes as deployed.

Do not describe an experiment as successful merely because the code executed.

The final handoff should make it possible for another engineer or agent to understand
what was changed, why it was changed, and how confidently it has been verified.
