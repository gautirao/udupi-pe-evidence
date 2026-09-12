/**
 * Issue #2450 — the Commercial subtype row must WRAP at 390px, never truncate and never scroll.
 *
 * RED BY DESIGN, and that claim is only worth making once the spec has been observed failing
 * AT THE ASSERTION rather than at page load. An earlier revision ran with no dev server and died
 * at `page.goto` with ERR_CONNECTION_REFUSED — which is CLAUDE.md §11 TEST_ENV_FAILURE, not RED,
 * and is indistinguishable from the same failure against a perfect implementation. Run this
 * against a live server (`scripts/run-e2e-local.sh`, which reads this lane's `.env.e2e.local`
 * port pair) or it proves nothing in either direction.
 *
 * WHY THIS IS AN E2E AND NOT A UNIT TEST. The owner ratified D3 in the stronger form — wrapping
 * is REQUIRED, truncation and horizontal scrolling are forbidden. That is a statement about
 * measured layout, and JSDOM has no layout engine: `offsetWidth`, `scrollWidth` and
 * `getBoundingClientRect` are all zero there, so a unit assertion would pass on any markup.
 *
 * A CLASS ASSERTION WOULD NOT CLOSE THIS EITHER. Asserting `flex-wrap` is present tests that
 * someone typed a class name, not that the row wrapped — the two diverge the moment a parent sets
 * `nowrap`, a min-width blocks the break, or a later refactor moves the container. The contract is
 * the rendered result, so the assertion has to measure the rendered result.
 *
 * PRECEDENT for reasoning about this viewport rather than inventing one:
 * `AreaFirstBreadcrumb.tsx:83-101` documents the same problem for the breadcrumb pill — a genuine
 * full-depth trail needs ~700px on one line, so it wraps at mobile (`flex-wrap`) and restores
 * single-line behaviour at `sm:` and up. The Commercial row has the same shape:
 * `Warehouse / Godown` and `Commercial Building` are materially longer than `Villas`.
 *
 * WHAT EACH ASSERTION RULES OUT, because "it wrapped" is not one observation:
 *   - `scrollWidth <= clientWidth`  -> the row does not scroll horizontally;
 *   - row height > one chip height  -> it actually wrapped onto more than one line, rather than
 *                                      fitting by having been truncated or shrunk;
 *   - full label text present       -> no chip was ellipsised to make it fit;
 *   - ALL SIX CHIPS RENDERED        -> the row was not made to fit by rendering fewer chips.
 *
 * THE FOURTH IS NOT REDUNDANT, and it is the mode the other three miss TOGETHER. A row that shows
 * three subtypes behind a "More" control wraps, does not scroll, and ellipsises nothing — it
 * passes all three while never rendering the two long labels that are the entire reason this
 * requirement exists. `openCommercialSubtypeRow` therefore asserts the full vocabulary is present
 * before any measurement is taken, so every arm inherits it.
 *
 * ── MERGE READINESS: THIS FILE IS UNCONDITIONALLY RED AND MUST NOT REACH `main` AS-IS ────────
 *
 * There is no implementation behind it yet, so every arm fails whenever the suite reaches them.
 * Two measured facts about WHICH suites reach them, because the answer is not the same everywhere:
 *
 *   - The PRE-PUSH GATE NEVER RUNS THIS FILE. `.githooks/pre-push:60` runs `test:e2e:local`,
 *     which is `scripts/run-e2e-local.sh` with no arguments, and that script appends
 *     `--project=smoke` when no project is passed (`:316-319`). `smoke`'s `testMatch`
 *     (`playwright.config.ts:44-52`) lists seven specs and this is not one of them. A green
 *     pre-push on this branch is therefore not evidence about this file in either direction.
 *   - ANY `--project=full` RUN DOES collect it — `full` declares no `testMatch` and a single
 *     `testIgnore` (`:79-83`) — and it fails, correctly.
 *
 * So "is main green" currently depends on which runner is asked. RESOLVED HERE, rather than left to
 * whoever merges: the describe below is `test.describe.fixme`, so the pending state is explicit and
 * the answer is the same from every runner.
 *
 * An earlier revision of this paragraph deferred the choice to the owner. That was a
 * misclassification — picking between annotate, `test.fixme` and a capability-flag gate is
 * implementation ordering, not a product decision — and it is corrected rather than deleted so the
 * reasoning is legible. The three candidates, and why this one:
 *
 *   - GATE ON THE CAPABILITY FLAG — REJECTED, and it is the dangerous option rather than merely the
 *     weakest. It re-introduces SILENT SKIP AT EXIT 0, the exact failure this file diagnoses and
 *     corrects one screen below (see the storage-state guard: creds unset "SKIPPED SILENTLY AT EXIT
 *     0 while the contract went unchecked"). Worse than the silence: a conditional gate makes two
 *     runners disagree about whether the contract was checked, which destroys the single answer the
 *     gate exists to give.
 *   - ANNOTATE ONLY — REJECTED. It does not stop `--project=full` collecting and failing these arms,
 *     so the merge blocker survives the annotation.
 *   - `test.describe.fixme` — CHOSEN. Unconditional, so it cannot be accidentally true in one
 *     environment and false in another. Still REPORTED, as declared-pending rather than vanished,
 *     which deletion would not preserve. And greppable, so REMOVING IT IS A MECHANICALLY CHECKABLE
 *     ENTRY CONDITION for the enabling change rather than something to remember.
 *
 * In-repo precedent, checked before choosing: `issue-2419-mobile-invalid-polygon.spec.ts:617`
 * ("fixme'd rather than deleted so it cannot be forgotten") and `journey/anon-teaser.spec.ts:54,198`.
 * The zero-authored-skips prohibition is CANONICAL-SUITE-SCOPED ONLY
 * (`canonical/listing-lifecycle.canonical.ts:119`), so it does not reach this file.
 *
 * TO ENABLE: delete `.fixme` from the describe below. THAT IS NOT SUFFICIENT ON ITS OWN, and an
 * earlier revision of this line claimed it was — it read "Nothing else in this file is conditional",
 * which is FALSE. Corrected rather than deleted, because the false version was the instruction the
 * enabling head was going to follow. THREE conditionals on `userAuthStorageStateExists()` remain,
 * and `.fixme` is currently masking all three:
 *
 * CITED BY GREPPABLE ANCHOR, NOT BY LINE NUMBER, and that is deliberate. The first revision of this
 * block cited `:135-138`, `:265` and `:287-290` — numbers carried over from the pre-edit file. The
 * same commit inserted 22 lines ABOVE them, so every one pointed 21 lines high, into the middle of
 * this comment. A note whose job is to be followed cannot hand its reader anchors that move when the
 * note itself grows. THE FIRST ANCHOR SET WAS ALSO WRONG, in a second and independent way: it was
 * written in unwrapped single-line form (`test.use({ storageState:` and
 * `test.skip(!userAuthStorageStateExists(`) while BOTH of those call sites are in fact wrapped
 * across several lines in this file. Two of the three anchors therefore resolved to nothing but
 * THIS COMMENT — an anchor whose only hit is the note telling you to grep it. Greppability is a
 * property of the anchor against the source AS ACTUALLY WRITTEN, not a style of citation; the
 * forms below were each grepped against this file before being written here. Grep them:
 *
 *   - `storageState: userAuthStorageStateExists()` — the fixture-gated context. Its false branch is
 *     `undefined`, so it falls back to an ANONYMOUS context rather than failing, and the run
 *     proceeds unauthenticated.
 *   - `...(userAuthStorageStateExists() ? { storageState:` — the `beforeAll` warm-up context, same
 *     predicate.
 *   - `!userAuthStorageStateExists(),` — THIS IS THE ONE THAT MATTERS. The `test.skip(` that owns
 *     this argument sits on the line ABOVE it; the wrapping is precisely why the anchor is the
 *     argument rather than the call. It
 *     is a SILENT SKIP AT EXIT 0 keyed on an environment-dependent fixture file — the same shape
 *     rejected for the capability-flag gate one screen above, by the argument one screen above.
 *     The moment `.fixme` comes off, a runner whose `user-auth.json` carries no `sb-*-auth-token`
 *     gets a green exit 0 with the wrap contract UNCHECKED, and two runners disagree again about
 *     whether it was checked — which is the exact failure this file was rewritten to end.
 *
 * THE GUARD'S ORIGINAL JUSTIFICATION NO LONGER HOLDS, and this is the correction of it rather than
 * a deletion, because the superseded version is the instruction the enabling head was going to
 * follow. It read: the guard "must not simply be removed: it exists because an unauthenticated run
 * fails at the family chip for the wrong reason". That was true against the disabled-with-
 * explanation anon posture. THE OWNER HAS SINCE RULED THAT ANONYMOUS BUYERS BROWSE AND FILTER
 * COMMERCIAL EXACTLY AS THEY DO RESIDENTIAL, and the gate is gone from the panel — so an
 * unauthenticated run now reaches the family chip and the subtype row normally, and no longer fails
 * for that reason.
 *
 * WHAT THE ENABLING HEAD OWES IS THEREFORE BOTH QUESTIONS, not the one the earlier note narrowed it
 * to. The skip's EXIT SIGNAL is still wrong in the way described above (a silent skip at exit 0 on
 * an environment-dependent fixture). But its PREDICATE is now open too: with no anon gate, this
 * spec may no longer need an authenticated session at all to measure the row's wrapping, in which
 * case the right answer is to drop the fixture dependency rather than to make its absence fail.
 * Neither is decided here — this file is `.fixme` and measuring the question is enablement work.
 *
 * Until it is settled, removing `.fixme` moves the silent-skip hazard from masked to live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { grantDiscoverConsent } from './helpers';

const __dirname_esm = path.dirname(fileURLToPath(import.meta.url));
const USER_AUTH_PATH = path.join(__dirname_esm, 'fixtures', 'user-auth.json');

/**
 * THE REAL PRECONDITION IS AN AUTHENTICATED STORAGE STATE, NOT CREDENTIALS AND NOT MERE PRESENCE.
 *
 * An earlier revision skipped on `SMOKE_USER_EMAIL`/`SMOKE_USER_PASSWORD`, which this file never
 * reads — there is no login fallback here, the session comes entirely from `user-auth.json`. That
 * guard was wrong in both directions: creds set + fixture missing ran and failed at fixture setup,
 * and fixture present + creds unset SKIPPED SILENTLY AT EXIT 0 while the contract went unchecked.
 *
 * `fs.existsSync` ALONE IS ALSO NOT ENOUGH HERE, and that is a departure from the precedent rather
 * than an oversight. `global-setup.ts:409-410` and `:431-432` write `{"cookies":[],"origins":[]}`
 * whenever a role's credentials are absent or its login fails, *specifically* so `test.use` never
 * throws ENOENT. So the file is ALWAYS present after any run and presence proves nothing.
 *
 * THE CONSEQUENCE ORIGINALLY GIVEN FOR THAT IS NOW STALE, corrected in place: this note used to say
 * an unauthenticated run "would sail past an existence check and then fail at the family chip
 * because the anon gate is showing". There is no anon gate any more — the owner ruled that
 * anonymous buyers get the same Commercial browsing posture as Residential, and the panel's gate
 * was removed. An unauthenticated run now reaches the family chip and the subtype row.
 *
 * The token check below is kept, not because that failure mode survives, but because this spec's
 * auth dependency has not yet been re-measured against the new posture — see the `.fixme` note at
 * the top of this file, which records the predicate as an open question for the enabling head. A
 * guard retained for a stated, current reason is a different thing from one retained for a reason
 * that has quietly expired.
 *
 * `discover-agri-price-gate-1551.spec.ts:66` can rely on presence because it carries a second
 * instrument, `isPageAuthenticated` (`:77-81`), which re-checks the session at runtime. This file
 * has no such fallback, so the guard has to do that work up front: require a Supabase auth token
 * in the persisted origins, which is exactly what a real login writes.
 *
 * BUT THIS IS STILL A BUILD-TIME PROXY FOR A RUNTIME PROPERTY, and the gap is real rather than
 * theoretical. It reads a key NAME out of a file at module load; it does not establish that the
 * token is still VALID when the page runs. An expired session satisfies every condition above and
 * then produces exactly the wrong-reason failure this guard exists to exclude — the anon
 * gate renders, the family chip never appears, and the run reads as a finding about missing code.
 * `assertSessionLiveAtRuntime` below is the missing runtime half; this function alone is not
 * sufficient and should not be cited as if it were.
 */
function userAuthStorageStateExists(): boolean {
  if (!fs.existsSync(USER_AUTH_PATH)) return false;
  try {
    const state = JSON.parse(fs.readFileSync(USER_AUTH_PATH, 'utf-8')) as {
      origins?: { localStorage?: { name?: string }[] }[];
    };
    return (state.origins ?? []).some((origin) =>
      (origin.localStorage ?? []).some(
        (entry) => entry.name?.startsWith('sb-') && entry.name.endsWith('-auth-token'),
      ),
    );
  } catch {
    return false;
  }
}

test.use({
  storageState: userAuthStorageStateExists() ? 'e2e/fixtures/user-auth.json' : undefined,
  viewport: { width: 390, height: 844 },
});

const DISCOVER_URL = `/discover?city=udupi&areaKey=${encodeURIComponent('IN|KA|Udupi|Manipal')}`;

/**
 * The whole ratified #2450 vocabulary — five subtypes plus the family-local clear control.
 * Mirrors `COMMERCIAL_SUBTYPE_CHOICES` in the unit spec.
 *
 * AN EARLIER REVISION OF THIS NOTE CLAIMED THE UNIT SPEC'S `covers the whole vocabulary` ARM PINS
 * THIS LIST, "so this list cannot drift from the constant without that arm failing first". THAT IS
 * FALSE, and corrected rather than deleted because a claimed guard that does not exist is worse
 * than an acknowledged gap — it stops the next reader looking. That arm maps `.value` and compares
 * the VALUE SET against `DISCOVER_COMMERCIAL_SUBTYPES`. It never compares LABELS, and this list
 * carries no values at all, only `testId` and `label`. So it constrains neither axis of this table.
 *
 * THE LABEL GUARD IS PARTIAL, NOT ABSENT. An earlier revision of this note said the labels were
 * unguarded across all three copies, and that renaming `Warehouse / Godown` in the panel "leaves
 * every unit arm green". BOTH CLAIMS ARE FALSE. The unit spec's `selecting Commercial reveals the
 * Commercial subtype row` arm asserts `toHaveTextContent(choice.label)` for all six chips, so that
 * rename does go red there.
 *
 * What is actually missing is EQUALITY, and the distinction is load-bearing because
 * `toHaveTextContent` matches a SUBSTRING. The guard is directional:
 *   - `Warehouse / Godown` -> `Warehouse/Godown`           FAILS — existing text was altered.
 *   - `Warehouse / Godown` -> `Warehouse / Godown (Large)` PASSES — text was only appended.
 * A reader who knows only "the labels are guarded" will mis-scope the next change in exactly that
 * direction.
 *
 * In THIS file the coverage is narrower still. An earlier revision claimed "the arms below do
 * assert these strings at runtime"; only ONE arm does — `shows every label in full` — and it
 * iterates `LONGEST_LABELS`, which is `Warehouse / Godown` and `Commercial Building`, two of the
 * six. Every other arm resolves by testId and interpolates labels only into failure messages. That
 * one arm also runs only under `--project=full`, and only once `.fixme` comes off. A
 * label-EQUALITY assertion in the unit spec is the real fix and belongs to the enabling head.
 */
const SUBTYPE_CHIPS = [
  { testId: 'quick-chip-subtype-all', label: 'All commercial' },
  { testId: 'quick-chip-subtype-shop', label: 'Shop' },
  { testId: 'quick-chip-subtype-office', label: 'Office' },
  { testId: 'quick-chip-subtype-building', label: 'Commercial Building' },
  { testId: 'quick-chip-subtype-warehouse', label: 'Warehouse / Godown' },
  { testId: 'quick-chip-subtype-land', label: 'Commercial Land' },
] as const;

/** The two labels that make this row wrap; both are #2450's ratified wording. */
const LONGEST_LABELS = ['Warehouse / Godown', 'Commercial Building'] as const;

/**
 * THE RUNTIME HALF OF THE AUTH PRECONDITION. `userAuthStorageStateExists` proves a token was
 * written; only the live page can prove one is still being honoured. Modelled on
 * `discover-agri-price-gate-1551.spec.ts:77-81`.
 *
 * Deliberately called AFTER the subtype row resolves rather than straight after navigation: run
 * earlier, it would fire on today's head — where the row legitimately does not exist yet — and
 * mask the missing-control RED with an auth message. Placed here it can only speak once the
 * control is present, which is precisely the state in which a dead session becomes the confusing
 * explanation rather than the obvious one.
 */
async function assertSessionLiveAtRuntime(
  page: import('@playwright/test').Page,
): Promise<void> {
  const authed = await page.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
  );
  expect(
    authed,
    'storage state carried a token but the live page holds no Supabase session — the fixture has ' +
      'expired. Refresh e2e/fixtures/user-auth.json; do not read this run as a finding about code.',
  ).toBe(true);
}

async function openCommercialSubtypeRow(page: import('@playwright/test').Page): Promise<void> {
  await grantDiscoverConsent(page);
  await page.goto(DISCOVER_URL);
  await page.waitForLoadState('domcontentloaded');
  // 20s, the value arms 2 and 3 have always passed at. It is deliberately NOT raised: whatever
  // made arm 1 miss it is to be paid off before the run, not by a bigger number here. The warm-up
  // above is the intended remedy; note that its EFFICACY IS UNPROVEN — on a host that has been
  // warm for hours, arm 1 reaching this line does not discriminate between "the warm-up worked"
  // and "nothing was cold". What IS proven is that arm 1 now reaches the next line at this
  // unchanged 20s budget. See that block for why raising this was the wrong fix.
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('quick-chip-family-commercial').click();

  const row = page.getByTestId('quick-subtype-row');
  await expect(row).toBeVisible({ timeout: 10_000 });
  await assertSessionLiveAtRuntime(page);

  // Guard against "it fit because we showed fewer chips". Every measurement below is only
  // meaningful over the complete row, so this runs before any of them.
  for (const chip of SUBTYPE_CHIPS) {
    await expect(
      row.getByTestId(chip.testId),
      `subtype chip "${chip.label}" is not rendered — the row cannot be measured for wrapping ` +
        'until the whole vocabulary is on screen',
    ).toBeVisible();
  }
  await expect(
    row.getByTestId(/^quick-chip-subtype-/),
    'the subtype row renders a different number of chips than the ratified vocabulary',
  ).toHaveCount(SUBTYPE_CHIPS.length);
}

test.describe.fixme('#2450 — Commercial subtype row at 390x844', () => {
  /**
   * WARM-UP — PAY THE COLD-START COST OUTSIDE EVERY ASSERTION'S BUDGET.
   *
   * Whichever arm runs first absorbs the Vite dev server's first compile of the Discover route
   * plus the first data round-trip, and two runs showed that is a property of being FIRST rather
   * than of any arm's assertions:
   *
   *   04:15Z  arm 1 died at `page.goto` (30s);  arms 2-3 reached the chip click.
   *   04:32Z  navigation budget raised -> arm 1 died one step later, at `discover-right-panel`
   *           (20s);                            arms 2-3 again reached the chip click.
   *
   * A failure that MOVES when you raise a budget is not a slow step, it is a cost in the wrong
   * place, and a third increase would just relocate it again — each one a number no completed run
   * had verified. This pays it once, before any test starts, in a throwaway context. Nothing here
   * asserts: a warm-up that failed the suite would be a new wrong-reason failure of its own, so it
   * swallows errors and lets the arms speak. The per-test budget and the panel budget are both back
   * to their defensible defaults as a result.
   *
   * SWALLOWING ERRORS IS NOT THE SAME AS BEING UNOBSERVABLE, and an earlier revision conflated the
   * two: it discarded the caught error entirely, so a warm-up that ran and a warm-up that was
   * SILENTLY INERT produced byte-identical output. That matters because this host has been warm
   * across hours of continuous runs, which means "arm 1 now reaches the chip step" does NOT
   * discriminate between "the warm-up paid the cold-start cost" and "nothing was cold to begin
   * with". Re-running cannot separate them either, so the fix is not another run — it is to emit
   * what happened and let a future reader on a cold host tell the two apart.
   *
   * WHAT IS LOGGED AND WHY EACH LINE EARNS ITS PLACE:
   *   - resolved baseURL  -> `testInfo.project.use.baseURL` is read here, but `baseURL` is declared
   *                          only in TOP-LEVEL `use` (`playwright.config.ts:35`); the `full`
   *                          project's own `use` is `{ browserName: 'chromium' }`. If Playwright did
   *                          not fold top-level `use` into `FullProject.use`, this would be
   *                          `undefined`, `page.goto` would get a relative URL with no base, and the
   *                          warm-up would have been inert since the day it was written. Logged so
   *                          that is settled by observation rather than by belief about Playwright.
   *   - final url + ms    -> distinguishes a warm-up that actually loaded Discover from one that
   *                          silently landed somewhere else (an auth redirect, say). The elapsed
   *                          time is what a cold host would show as large and a warm one as small.
   *   - caught error      -> the previous revision's blind spot, first line only to stay readable.
   *
   * STILL DELIBERATELY NON-ASSERTING. Making it observable must not make it capable of failing the
   * suite; that would reintroduce exactly the wrong-reason failure this block exists to avoid.
   */
  test.beforeAll(async ({ browser }, testInfo) => {
    const resolvedBaseURL = testInfo.project.use.baseURL;
    console.log(`[2450-warmup] resolved baseURL=${JSON.stringify(resolvedBaseURL)}`);

    const context = await browser.newContext({
      baseURL: resolvedBaseURL,
      ...(userAuthStorageStateExists() ? { storageState: USER_AUTH_PATH } : {}),
    });
    const page = await context.newPage();
    const startedAt = Date.now();
    try {
      await page.goto(DISCOVER_URL, { timeout: 180_000 });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
      console.log(
        `[2450-warmup] completed in ${Date.now() - startedAt}ms, settled at url=${page.url()}`,
      );
    } catch (err) {
      // Still swallowed — see above. Recorded rather than discarded so an inert warm-up is
      // visible as inert instead of being indistinguishable from a working one.
      console.log(
        `[2450-warmup] DID NOT COMPLETE after ${Date.now() - startedAt}ms, url=${page.url()}, ` +
          `error=${String(err).split('\n')[0]}`,
      );
    } finally {
      await context.close();
    }
  });

  test.skip(
    !userAuthStorageStateExists(),
    'e2e/fixtures/user-auth.json missing — run the auth fixture setup first',
  );

  test('does not scroll horizontally', async ({ page }) => {
    await openCommercialSubtypeRow(page);

    const box = await page.getByTestId('quick-subtype-row').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      box.scrollWidth,
      `row scrolls horizontally: scrollWidth ${box.scrollWidth} > clientWidth ${box.clientWidth}`,
    ).toBeLessThanOrEqual(box.clientWidth);
  });

  /**
   * THIS IS THE ARM THAT CARRIES THE OWNER'S RATIFIED "WRAP, DON'T TRUNCATE" DECISION, so it has
   * to discriminate on its own. The `does not scroll` arm above cannot help: `overflow: hidden`
   * makes `scrollWidth` and `clientWidth` EQUAL, so a truncated single-line row passes it
   * trivially.
   *
   * MEASURE WRAPPING DIRECTLY — DO NOT INFER IT FROM ROW HEIGHT. An earlier revision asserted
   * `rowHeight > chipHeight * 1.5`, which row vertical padding alone satisfies without any chip
   * ever moving to a second line: against today's `h-8` (32px) chips, 16px of padding is enough.
   * Distinct `y` positions cannot be produced by padding — only by a line break.
   */
  test('wraps onto more than one line rather than fitting by shrinking', async ({ page }) => {
    await openCommercialSubtypeRow(page);

    const row = page.getByTestId('quick-subtype-row');
    const tops: number[] = [];
    for (const chip of SUBTYPE_CHIPS) {
      const box = await row.getByTestId(chip.testId).boundingBox();
      expect(box, `chip "${chip.label}" has no box — layout did not run`).not.toBeNull();
      tops.push(box!.y);
    }

    // Round to whole pixels so sub-pixel baseline jitter within one line does not read as a wrap.
    const distinctRows = new Set(tops.map((y) => Math.round(y)));
    expect(
      distinctRows.size,
      `all six chips share ${distinctRows.size} vertical position(s) (${[...distinctRows].join(', ')}) ` +
        '— the row did not wrap onto a second line',
    ).toBeGreaterThan(1);
  });

  test('shows every label in full — nothing ellipsised to make it fit', async ({ page }) => {
    await openCommercialSubtypeRow(page);

    const row = page.getByTestId('quick-subtype-row');

    for (const label of LONGEST_LABELS) {
      const chip = row.getByTestId(
        SUBTYPE_CHIPS.find((c) => c.label === label)!.testId,
      );
      await expect(chip).toBeVisible();

      // Resolving the chip BY TESTID rather than by text is deliberate: `getByText(label,
      // { exact: true })` is a strict-mode violation the moment a result card also reads
      // "Commercial Building", which is a legitimate #2430 card label.
      await expect(chip, `"${label}" is not rendered in full`).toHaveText(label);

      // Truncation shows fewer pixels of text than the text needs, and the element doing the
      // clipping can sit on EITHER side of the chip in the tree:
      //   - an ANCESTOR (`truncate`/`overflow-hidden` wrapper) clips its child without the
      //     child's own scrollWidth ever exceeding its clientWidth;
      //   - a DESCENDANT — the common shape, since the chip is a Button and the label usually
      //     lives in an inner <span> — carries the ellipsis itself while the button box is
      //     comfortably wide enough.
      // Checking only one direction leaves the other open, so scan the chip, its ancestors up to
      // the row, and its descendants, and name whichever element is clipping.
      const clipped = await chip.evaluate((el, rowTestId) => {
        const report = (node: HTMLElement) => ({
          tag: node.tagName,
          testId: node.dataset.testid ?? null,
        });
        for (let node: HTMLElement | null = el as HTMLElement; node; node = node.parentElement) {
          if (node.scrollWidth > node.clientWidth) return report(node);
          if (node.dataset.testid === rowTestId) break;
        }
        for (const node of Array.from((el as HTMLElement).querySelectorAll<HTMLElement>('*'))) {
          if (node.scrollWidth > node.clientWidth) return report(node);
        }
        return null;
      }, 'quick-subtype-row');

      expect(
        clipped,
        `"${label}" is ellipsised at 390px by ${clipped?.testId ?? clipped?.tag ?? ''}`,
      ).toBeNull();
    }
  });
});
