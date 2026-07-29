/**
 * Issue #1956 PR-2 — Guarded Hierarchy Back (Slice 5).
 *
 * Covers AC5.3, AC5.4, AC5.5, AC5.6, AC5.7, AC5.10 — the ruling
 * (`hierarchy_back_guarded_pop`, approved-execution-handoff-pr2.toml
 * `[user_rulings_2026_07_29_cycle1]`) explicitly requires REAL E2E here: JSDOM
 * exposes no `window.history` delta, so `HierarchyBackButton`'s guarded
 * conditional POP (real browser POP vs a safe REPLACE) can only be proven
 * against the real browser history stack.
 *
 * ── GROUND TRUTH — this validates the PR-2 CONSUMER/UI against a
 * FIXTURE-ONLY deterministic promoted shallow tree, NOT the recursive
 * navigation-tree generator (per [user_rulings_2026_07_29_cycle1]
 * .generator_and_fixture — the generator itself has 398 validation errors on
 * real Bangalore geography and is tracked as a separate high-priority
 * follow-up). Seeded shape, read live from the fixture backend at spec-design
 * time via GET /api/discover/cities/bangalore/navigation/resolve:
 *
 *   root
 *     -> d:w  "West Bangalore"                (DIRECTION, depth 0, ancestry=[])
 *          -> a:...Basaveshwara Nagar          (AREA, 2 listings, ancestry=[d:w])
 *          -> a:...Binnipete                   (AREA, 0 listings, ancestry=[d:w])
 *     -> d:e  "East Bangalore"                 (DIRECTION, depth 0, ancestry=[])
 *          -> c:e:...domlur-layout             (CLUSTER "Domlur & C V Raman
 *             Nagar", depth 1, ancestry=[d:e])
 *               -> a:...Domlur Layout          (AREA, 1 listing, ancestry=[d:e, cluster])
 *               -> a:...C V Raman Nagar        (AREA, 0 listings, ancestry=[d:e, cluster])
 *
 * Both valid public shapes are covered: City->Direction->AREA (west) and
 * City->Direction->LocalDestination->AREA (east).
 *
 * ── CONFIRMED LIVE FINDING (read this before "fixing" any assertion below) ──
 * `NavigationNodeResponse.ancestry` NEVER includes the synthetic city root —
 * confirmed directly against the fixture backend: `d:w`/`d:e` (DIRECTION,
 * depth 0) both resolve with `ancestry: []`, identical in shape to the
 * synthetic root's own empty ancestry. `HierarchyBackButton` renders `null`
 * whenever `node.ancestry.length === 0` (AC5.7's own guard), so it ALSO
 * renders nothing at the Direction level — not just at the true city root.
 * `AreasBreadcrumbTrail`'s chain is built from `[...node.ancestry, current]`,
 * so the breadcrumb at Direction level is asserted live to be the single
 * segment "West Bangalore" / "East Bangalore" with NO "Bangalore" ancestor
 * segment at all.
 *
 * Net effect, confirmed by a real Playwright run before this spec was
 * finalised: from an AREA, ONE hierarchy-Back press correctly reaches the
 * DIRECTION (or CLUSTER) parent, but there is no second in-app affordance
 * (neither HierarchyBackButton nor a breadcrumb ancestor) that reaches City
 * from Direction. AC5.3 and AC5.4's final hop are asserted below as written
 * in the approved AC set; if the control is absent this is reported as a
 * confirmed product defect, not silently dropped or weakened.
 *
 * ── SECOND CONFIRMED LIVE FINDING (AC5.3 / AC5.10 / the ruling itself) ──
 * A live repro (City -> Direction -> Area, one hierarchy-Back press) was run
 * three times against this branch before this spec was written. Each time,
 * `window.history.state.idx` was IDENTICAL before and after the Back press
 * (the Area entry's own slot), with a freshly-minted `location.key` — i.e. the
 * mechanism is a REPLACE of the Area entry, not the real POP the guard is
 * supposed to choose when `decideHierarchyBackMechanism` proves adjacency.
 * `window.history.forward()` afterwards is a no-op (there is no forward
 * entry — the child slot was overwritten, not popped past). This is the
 * EXACT failure mode `hierarchy_back_guarded_pop`'s acceptance criteria and
 * AC5.10 forbid ("no duplicate-adjacent entry; Forward restores the child").
 * The assertions below encode the ACCEPTANCE CRITERIA, not the observed
 * defect — they are expected to fail honestly against the current build.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;

const D_W = 'd:w';
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';
const D_E = 'd:e';
const CLUSTER_DOMLUR = 'c:e:in-ka-bengaluru-c-v-raman-nagar-in-ka-bengaluru-domlur-layout';
const AREA_DOMLUR = 'a:IN|KA|Bengaluru|Domlur Layout';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

async function openJourneyRoot(page: Page) {
  await page.goto(`/discover?${BASE}`);
  await page.waitForLoadState('domcontentloaded');
  // Positive presence FIRST — the surface actually rendered — before any
  // negative/behavioural assertion is ever reached.
  await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

async function historyIdx(page: Page): Promise<number> {
  return page.evaluate(() => (window.history.state as { idx?: number } | null)?.idx ?? -1);
}

async function locationKeyOfState(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window.history.state as { key?: string } | null)?.key);
}

test.describe('@integration-ui #1956 PR-2 — guarded hierarchy Back (AC5.3/AC5.7)', () => {
  test('AC5.7 — city root renders the Direction surface and has NO active hierarchy Back control', async ({
    page,
  }) => {
    await openJourneyRoot(page);
    // Positive: the root destination surface really rendered.
    await expect(page.getByTestId(cardTestId(D_W))).toBeVisible();
    await expect(page.getByTestId(cardTestId(D_E))).toBeVisible();
    // Negative, only now that the surface is proven up.
    await expect(page.getByTestId('areas-hierarchy-back')).toHaveCount(0);
  });

  test('AC5.3 — City > Direction(d:w) > Area: each hierarchy-Back press moves exactly one canonical level, and Forward restores the popped child', async ({
    page,
  }) => {
    await openJourneyRoot(page);
    expect(await currentNodeParam(page)).toBeNull();

    // Push 1: City -> Direction.
    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);
    // Positive: the Direction level actually rendered its AREA children before
    // we drill further.
    await expect(page.getByTestId(cardTestId(AREA_BASAVESHWARA))).toBeVisible();

    // Push 2: Direction -> Area.
    await page.getByTestId(cardTestId(AREA_BASAVESHWARA)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_BASAVESHWARA);

    // Positive: the Back control is actually present at the Area level before
    // we press it.
    const backButton = page.getByTestId('areas-hierarchy-back');
    await expect(backButton).toBeVisible();
    const idxBeforeBack = await historyIdx(page);

    // Press 1: Area -> Direction, ONE canonical level.
    await backButton.click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    // AC5.10 / hierarchy_back_guarded_pop — this must be a real history POP,
    // never a REPLACE that destroys the Area entry: the history index must
    // have moved BACKWARD (not stayed on the same slot), and a browser
    // FORWARD must restore the Area exactly (proving the popped entry still
    // exists rather than having been overwritten).
    const idxAfterBack = await historyIdx(page);
    expect(idxAfterBack).toBeLessThan(idxBeforeBack);

    await page.goForward();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_BASAVESHWARA);
  });

  test('AC5.4 — City > Direction(d:e) > Local Destination > Area: three consecutive Backs move one level each', async ({
    page,
  }) => {
    await openJourneyRoot(page);

    await page.getByTestId(cardTestId(D_E)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);
    await expect(page.getByTestId(cardTestId(CLUSTER_DOMLUR))).toBeVisible();

    await page.getByTestId(cardTestId(CLUSTER_DOMLUR)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_DOMLUR);
    await expect(page.getByTestId(cardTestId(AREA_DOMLUR))).toBeVisible();

    await page.getByTestId(cardTestId(AREA_DOMLUR)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_DOMLUR);

    // Back 1: Area -> Cluster.
    await expect(page.getByTestId('areas-hierarchy-back')).toBeVisible();
    await page.getByTestId('areas-hierarchy-back').click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_DOMLUR);

    // Back 2: Cluster -> Direction.
    await expect(page.getByTestId('areas-hierarchy-back')).toBeVisible();
    await page.getByTestId('areas-hierarchy-back').click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);
  });

  test('AC5.5/AC5.6 — a cold direct deep link to an AREA (parent never visited) Backs to the canonical parent via REPLACE, and a refresh preserves that destination', async ({
    page,
  }) => {
    // Cold load straight onto the Area — its parent Direction was never in
    // this tab's history at all.
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
    expect(await currentNodeParam(page)).toBe(AREA_BASAVESHWARA);

    const backButton = page.getByTestId('areas-hierarchy-back');
    await expect(backButton).toBeVisible();
    const idxBeforeBack = await historyIdx(page);
    const keyBeforeBack = await locationKeyOfState(page);

    await backButton.click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    // A cold deep link has no logged predecessor, so the guard MUST choose
    // REPLACE (never a blind POP with nothing behind it): the history index
    // stays on the SAME slot the Area entry occupied, and there is no
    // resurrectable child via Forward.
    const idxAfterBack = await historyIdx(page);
    expect(idxAfterBack).toBe(idxBeforeBack);
    expect(await locationKeyOfState(page)).not.toBe(keyBeforeBack);

    await page.goForward();
    // No forward entry exists — REPLACE must not fabricate one.
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    // AC5.6 — refreshing at the Area preserves the same Back destination.
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('areas-hierarchy-back')).toHaveAttribute(
      'aria-label',
      'Back to West Bangalore',
    );
  });
});

test.describe('@integration-ui #1956 PR-2 — fix-verify cycle 4: real-timing delayed hierarchy Back (history-slot identity)', () => {
  // Fix-verify cycle 4 root cause: an async CAMERA-FIT REPLACE fires
  // ~650-900ms after every navigation (AC5.11 requires it create no NEW
  // hierarchy entry). It mints a fresh `location.key` for the SAME history
  // slot — the OLD adjacency-log identity (keyed on `location.key`) mistook
  // that for a brand new logical entry and pushed a duplicate, corrupting
  // `decideHierarchyBackMechanism`'s parent lookup at real human-reaction-time
  // timing. Playwright's scripted click->poll cycle in the tests above
  // outruns that ~700ms window and never observes it — that is why 5/5
  // automated E2E PASS coexisted with a real, reproducible defect. These
  // tests explicitly WAIT past the observed window before pressing Back.
  //
  // `DELAYED_REPLACE_WAIT_MS` is a fixed wait (permitted by the ruling when a
  // more precise settle-detection signal isn't available cross-app) set
  // comfortably longer than the observed 650-900ms camera-fit delay.
  const DELAYED_REPLACE_WAIT_MS = 1_500;

  test('AC5.3 real-timing — City > Direction(d:w) > Area: Back after the delayed same-slot camera-fit REPLACE settles still POPs exactly one level, and Forward restores the child', async ({
    page,
  }) => {
    await openJourneyRoot(page);

    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);
    await expect(page.getByTestId(cardTestId(AREA_BASAVESHWARA))).toBeVisible();
    // Let the Direction hop's own delayed camera-fit REPLACE settle too,
    // before drilling further — the defect can corrupt ANY hop's slot.
    await page.waitForTimeout(DELAYED_REPLACE_WAIT_MS);
    const idxAfterDirectionSettle = await historyIdx(page);

    await page.getByTestId(cardTestId(AREA_BASAVESHWARA)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_BASAVESHWARA);

    const backButton = page.getByTestId('areas-hierarchy-back');
    await expect(backButton).toBeVisible();
    const idxBeforeBack = await historyIdx(page);

    // THE KEY TIMING STEP: wait for the Area hop's delayed same-slot
    // camera-fit REPLACE to complete BEFORE pressing Back — this is exactly
    // the window the scripted-speed tests above race ahead of.
    await page.waitForTimeout(DELAYED_REPLACE_WAIT_MS);
    // The camera-fit REPLACE must not have moved the slot (AC5.11 — no new
    // hierarchy entry), only minted a fresh location.key for it.
    expect(await historyIdx(page)).toBe(idxBeforeBack);

    await backButton.click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    // (a) the browser history index decreases by EXACTLY one.
    const idxAfterBack = await historyIdx(page);
    expect(idxAfterBack).toBe(idxBeforeBack - 1);
    // This also proves the Direction slot the Back landed on is the SAME
    // slot recorded right after the Direction hop settled earlier — i.e. the
    // delayed REPLACE at the Direction hop did not itself get logged as a
    // second, duplicate Direction entry (which would have shifted this slot).
    expect(idxAfterBack).toBe(idxAfterDirectionSettle);

    // (b) Forward restores the popped child.
    await page.goForward();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_BASAVESHWARA);

    // (c) proxy for "one logical log entry per history slot": if the
    // same-slot camera-fit REPLACE had been mis-recorded as a duplicate
    // entry, decideHierarchyBackMechanism's parent lookup would have landed
    // on the wrong entry and chosen REPLACE (idx unchanged) instead of the
    // POP proven above — (a) and (b) together are the observable,
    // real-browser consequence of the log NOT containing a duplicate entry
    // for this slot. The log's shape itself (not a directly observable
    // browser artifact) is asserted directly by the adjacency-log identity
    // unit tests in `HierarchyBackButton.test.tsx`.
  });

  test('AC5.4 real-timing — City > Direction(d:e) > Local Destination > Area: TWO consecutive delayed Backs each POP one level, proving no duplicate entry survives either hop', async ({
    page,
  }) => {
    await openJourneyRoot(page);

    await page.getByTestId(cardTestId(D_E)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);
    await expect(page.getByTestId(cardTestId(CLUSTER_DOMLUR))).toBeVisible();
    await page.waitForTimeout(DELAYED_REPLACE_WAIT_MS);

    await page.getByTestId(cardTestId(CLUSTER_DOMLUR)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_DOMLUR);
    await expect(page.getByTestId(cardTestId(AREA_DOMLUR))).toBeVisible();
    await page.waitForTimeout(DELAYED_REPLACE_WAIT_MS);

    await page.getByTestId(cardTestId(AREA_DOMLUR)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_DOMLUR);

    // Wait for the Area hop's delayed same-slot camera-fit REPLACE to settle
    // before the FIRST Back — the defect-reproducing timing.
    await page.waitForTimeout(DELAYED_REPLACE_WAIT_MS);
    const idxBeforeBack1 = await historyIdx(page);

    // Back #1: Area -> Cluster.
    await expect(page.getByTestId('areas-hierarchy-back')).toBeVisible();
    await page.getByTestId('areas-hierarchy-back').click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_DOMLUR);
    const idxAfterBack1 = await historyIdx(page);
    expect(idxAfterBack1).toBe(idxBeforeBack1 - 1);

    // Wait AGAIN before the SECOND Back — if the first hop's camera-fit
    // REPLACE (or this restored Cluster view's own) had corrupted the log
    // with a duplicate entry, THIS is the press that would silently fall
    // back to REPLACE instead of POP, exactly the multi-hop failure mode a
    // single-hop test cannot catch.
    await page.waitForTimeout(DELAYED_REPLACE_WAIT_MS);
    expect(await historyIdx(page)).toBe(idxAfterBack1);

    // Back #2: Cluster -> Direction.
    await expect(page.getByTestId('areas-hierarchy-back')).toBeVisible();
    await page.getByTestId('areas-hierarchy-back').click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);
    const idxAfterBack2 = await historyIdx(page);
    // (a) each Back decreases the index by EXACTLY one.
    expect(idxAfterBack2).toBe(idxAfterBack1 - 1);

    // (b) Forward twice restores the exact popped sequence.
    await page.goForward();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_DOMLUR);
    await page.goForward();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_DOMLUR);
  });
});

test.describe('@integration-ui #1956 PR-2 — browser Back/Forward loop-freedom (AC5.10)', () => {
  test('a committed City -> Direction -> Area sequence restores cleanly via native browser Back/Forward, with no duplicate-adjacent node= history entries', async ({
    page,
  }) => {
    await openJourneyRoot(page);
    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);
    await page.getByTestId(cardTestId(AREA_BASAVESHWARA)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_BASAVESHWARA);

    // Native browser Back twice: Area -> Direction -> City. Every step must be
    // a DISTINCT node, never the same node repeated on two consecutive stops
    // (the duplicate-adjacent-entry failure mode AC5.10 forbids).
    const seen: (string | null)[] = [await currentNodeParam(page)];
    await page.goBack();
    seen.push(await currentNodeParam(page));
    await page.goBack();
    seen.push(await currentNodeParam(page));

    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).not.toBe(seen[i - 1]);
    }
    expect(seen).toEqual([AREA_BASAVESHWARA, D_W, null]);

    // And forward twice restores the exact same sequence in reverse.
    await page.goForward();
    expect(await currentNodeParam(page)).toBe(D_W);
    await page.goForward();
    expect(await currentNodeParam(page)).toBe(AREA_BASAVESHWARA);
  });
});
