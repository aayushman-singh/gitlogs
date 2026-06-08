/**
 * Self-contained demo fixtures for the keyless /demo route.
 *
 * These are fictional, deterministic examples drawn from fixtures/seed-data.json
 * (octo-dev/payments-api, mira-builds/design-system, kai-ships/realtime-sync,
 * nova-labs/ml-pipeline). They replay the gitlogs pipeline entirely client-side:
 *
 *   commit + diff  ->  interpolated Gemini prompt  ->  generated tweet thread
 *
 * No network calls. No backend. No PII. Everything renders offline.
 *
 * Each example exposes `promptTemplate(persona)` so the prompt card re-renders
 * with the active persona's instruction line, mirroring the real
 * "regenerate with a different persona" behaviour.
 */

const PERSONA_ORDER = ['professional', 'hype', 'technical'];

/**
 * Build the Gemini prompt that the backend would send for a given example and
 * persona. The diff, commit, and repo context are interpolated in so viewers
 * can see the prompt engineering, not just the output.
 */
function buildPrompt(example, persona) {
  return `You are gitlogs, an AI that turns a git commit into a developer changelog post for X.

PERSONA
${persona.instruction}

REPO CONTEXT
- Repository: ${example.repoFullName}
- Author: @${example.author}
- Branch: ${example.commit.branch}
- About: ${example.projectContext}

COMMIT
- SHA: ${example.commit.sha}
- Message: ${example.commit.message}

GIT DIFF (ground truth — describe ONLY what changed here, never invent)
${example.diff}

RULES
- Each post is <= 280 characters.
- Describe only changes evident in the diff above. No hallucinated features.
- No hashtags. No emojis.
- If the change is large, return a short thread (2-3 posts) instead of one post.
- Match the PERSONA's voice exactly.

Return the post(s) as the changelog, nothing else.`;
}

const rawExamples = [
  {
    id: 'payments-idempotency',
    repoFullName: 'octo-dev/payments-api',
    author: 'octo-dev',
    avatarSeed: 'octo-dev',
    projectContext:
      'A payments service handling charges, refunds and webhooks. Node.js + Postgres ledger.',
    commit: {
      sha: 'a1b2c3d',
      message: 'feat: idempotency keys on POST /charges',
      branch: 'main',
    },
    diff: `diff --git a/src/routes/charges.js b/src/routes/charges.js
index 4f1c2a0..9b7e3d1 100644
--- a/src/routes/charges.js
+++ b/src/routes/charges.js
@@ -12,9 +12,21 @@ router.post('/charges', async (req, res) => {
-  const charge = await ledger.createCharge(req.body);
-  res.status(201).json(charge);
+  const key = req.header('Idempotency-Key');
+  if (!key) {
+    return res.status(400).json({ error: 'Idempotency-Key header required' });
+  }
+
+  const existing = await ledger.findChargeByKey(key);
+  if (existing) {
+    return res.status(200).json(existing);
+  }
+
+  const charge = await ledger.createCharge({ ...req.body, idempotencyKey: key });
+  res.status(201).json(charge);
 });
diff --git a/migrations/0007_idempotency.sql b/migrations/0007_idempotency.sql
new file mode 100644
index 0000000..a3f9c80
--- /dev/null
+++ b/migrations/0007_idempotency.sql
@@ -0,0 +1,3 @@
+ALTER TABLE charges ADD COLUMN idempotency_key TEXT;
+CREATE UNIQUE INDEX idx_charges_idem_key
+  ON charges (idempotency_key) WHERE idempotency_key IS NOT NULL;`,
    personas: {
      professional: {
        thread: [
          'shipped: idempotency keys on POST /charges. retries now return the original charge instead of creating a duplicate. one required header, zero double-charges. (a1b2c3d)',
        ],
      },
      hype: {
        thread: [
          'double-charges are DEAD. POST /charges now takes an Idempotency-Key and replays the exact same result on retry. your customers will never get billed twice again. (a1b2c3d)',
          'the trick: a unique partial index on idempotency_key in the ledger. retried request hits the index, we hand back the original charge. boring infra, huge payoff.',
        ],
      },
      technical: {
        thread: [
          'POST /charges: require Idempotency-Key header (400 if missing). lookup by key first, return existing charge 200 if found, else create with key. backed by a partial unique index where key is not null. (a1b2c3d)',
        ],
      },
    },
  },
  {
    id: 'design-combobox',
    repoFullName: 'mira-builds/design-system',
    author: 'mira-builds',
    avatarSeed: 'mira-builds',
    projectContext:
      'An accessible React component library with design tokens and dark-mode support.',
    commit: {
      sha: 'f607182',
      message: 'feat: add accessible <Combobox> with async loading',
      branch: 'main',
    },
    diff: `diff --git a/src/Combobox/Combobox.tsx b/src/Combobox/Combobox.tsx
new file mode 100644
index 0000000..1d8e4a2
--- /dev/null
+++ b/src/Combobox/Combobox.tsx
@@ -0,0 +1,18 @@
+export function Combobox({ options, onSearch, loading }: ComboboxProps) {
+  const [open, setOpen] = useState(false);
+  const [active, setActive] = useState(0);
+
+  function onKeyDown(e: KeyboardEvent) {
+    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, options.length - 1));
+    if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
+    if (e.key === 'Enter') select(options[active]);
+    if (e.key === 'Escape') setOpen(false);
+  }
+
+  return (
+    <div role="combobox" aria-expanded={open} aria-busy={loading}>
+      {/* listbox + options with aria-activedescendant */}
+    </div>
+  );
+}
diff --git a/src/index.ts b/src/index.ts
index 8a1b0c3..c2d4e5f 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -4,3 +4,4 @@ export { Tooltip } from './Tooltip';
 export { Dialog } from './Dialog';
+export { Combobox } from './Combobox/Combobox';`,
    personas: {
      professional: {
        thread: [
          'new: a <Combobox> with full keyboard navigation and async option loading. arrow keys, enter, escape, and aria-activedescendant all wired up. accessible by default, no aria gymnastics required. (f607182)',
        ],
      },
      hype: {
        thread: [
          'the <Combobox> you actually wanted just landed. keyboard-first, async-loading, screen-reader-ready out of the box. drop it in and stop hand-rolling autocomplete forever. (f607182)',
        ],
      },
      technical: {
        thread: [
          'added Combobox.tsx: role=combobox, aria-expanded, aria-busy for loading. keydown handles ArrowUp/Down (clamped), Enter to select, Escape to close. exported from index.ts. (f607182)',
        ],
      },
    },
  },
  {
    id: 'sync-backoff',
    repoFullName: 'kai-ships/realtime-sync',
    author: 'kai-ships',
    avatarSeed: 'kai-ships',
    projectContext:
      'An offline-first realtime sync engine using CRDTs over a websocket channel.',
    commit: {
      sha: 'b4c5d6e',
      message: 'fix: reconnect storm after wifi drop',
      branch: 'main',
    },
    diff: `diff --git a/src/socket/reconnect.ts b/src/socket/reconnect.ts
index 2c9f1a0..7e3b8d4 100644
--- a/src/socket/reconnect.ts
+++ b/src/socket/reconnect.ts
@@ -3,12 +3,17 @@ export function scheduleReconnect(socket: SyncSocket) {
-  // immediately retry on every close
-  socket.on('close', () => socket.connect());
+  let attempt = 0;
+  socket.on('close', () => {
+    const base = Math.min(1000 * 2 ** attempt, 30000);
+    const jitter = Math.random() * base * 0.25;
+    attempt += 1;
+    setTimeout(() => socket.connect(), base + jitter);
+  });
+  socket.on('open', () => { attempt = 0; });
 }`,
    personas: {
      professional: {
        thread: [
          'fix: the reconnect storm after a wifi drop is gone. the socket now backs off exponentially (capped at 30s) with jitter, and resets on a successful open. one flaky network no longer hammers the server. (b4c5d6e)',
        ],
      },
      hype: {
        thread: [
          'killed the reconnect storm. lose wifi for a second and the old code would slam the server with retries. now it backs off exponentially with jitter and chills out the moment it reconnects. (b4c5d6e)',
        ],
      },
      technical: {
        thread: [
          'reconnect.ts: replace tight close->connect loop with backoff = min(1000 * 2^attempt, 30000) + up to 25% jitter. attempt increments per close, resets to 0 on open. (b4c5d6e)',
        ],
      },
    },
  },
  {
    id: 'ml-rollback',
    repoFullName: 'nova-labs/ml-pipeline',
    author: 'nova-labs',
    avatarSeed: 'nova-labs',
    projectContext:
      'An ML training and serving pipeline with a feature store and model registry.',
    commit: {
      sha: '091a2b3',
      message: 'feat: one-click model rollback on eval regression',
      branch: 'main',
    },
    diff: `diff --git a/serving/registry.py b/serving/registry.py
index 5a2c1f0..d9e7b34 100644
--- a/serving/registry.py
+++ b/serving/registry.py
@@ -22,6 +22,18 @@ class ModelRegistry:
     def promote(self, version: str) -> None:
         self._set_active(version)

+    def rollback(self) -> str:
+        history = self._active_history()
+        if len(history) < 2:
+            raise NoPreviousVersionError("nothing to roll back to")
+        previous = history[-2]
+        self._set_active(previous.version)
+        log.warning("rolled back active model to %s", previous.version)
+        return previous.version
+
+    def rollback_if_regressed(self, metrics: EvalMetrics) -> str | None:
+        if metrics.regressed_against(self.active_baseline()):
+            return self.rollback()
+        return None`,
    personas: {
      professional: {
        thread: [
          'new: one-click model rollback when eval metrics regress. the registry keeps active-version history and rollback() restores the previous version. ship boldly, revert calmly. (091a2b3)',
        ],
      },
      hype: {
        thread: [
          'bad model in prod? one call and you are back on the last good version. rollback_if_regressed() watches eval metrics and yanks the model the instant it slips. deploy without the fear. (091a2b3)',
        ],
      },
      technical: {
        thread: [
          'registry.py: rollback() reads active-version history, raises NoPreviousVersionError if <2 entries, else re-activates history[-2] and logs a warning. rollback_if_regressed() triggers it when metrics.regressed_against(baseline). (091a2b3)',
        ],
      },
    },
  },
];

export const PERSONA_LABELS = {
  professional: { label: 'Professional', instruction: 'Sharp and factual. State what shipped and why it matters. No hype, no emojis, no hashtags.' },
  hype: { label: 'Hype / Launch', instruction: 'High-energy launch voice. Lead with the win, sell the impact, keep it punchy. Still no emojis, still no hashtags.' },
  technical: { label: 'Deadpan Technical', instruction: 'Dry and precise for a senior-engineer audience. Reference the actual mechanism (functions, indexes, params). Zero fluff.' },
};

/**
 * Each example, decorated with its persona definitions (label + instruction +
 * thread) and a promptTemplate(persona) function bound to that example.
 */
export const DEMO_EXAMPLES = rawExamples.map((example) => {
  const personas = {};
  for (const key of PERSONA_ORDER) {
    personas[key] = {
      key,
      label: PERSONA_LABELS[key].label,
      instruction: PERSONA_LABELS[key].instruction,
      thread: example.personas[key].thread,
    };
  }
  return {
    ...example,
    personas,
    promptTemplate: (persona) => buildPrompt(example, persona),
  };
});

export const PERSONA_KEYS = PERSONA_ORDER;
