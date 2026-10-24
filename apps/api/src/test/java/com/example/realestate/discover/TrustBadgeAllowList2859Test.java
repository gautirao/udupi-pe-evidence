package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * #2859 B6 (handoff 285906) backend slice, L95 1567-3: the {@link TrustBadge} allow-list with its
 * positive control in the SAME test (R_control_existing). The existing TrustBadgeTest asserts the
 * "no badge" arms in methods / parameterised invocations that never assert a known tier, so a
 * projection that returned null for everything would satisfy each of them on its own.
 */
class TrustBadgeAllowList2859Test {

    @Test
    @DisplayName("#2859 B6 1567-3 (L95): A/B/C map to verified/trusted/listed, and in the same test D, null, "
            + "lowercase and unknown values map to no badge (never a fallback word, never the raw letter)")
    void allowList_knownTiersMap_andEverythingElseIsNull_sameTest() {
        // positive control: the projection does produce a badge for the allow-listed grades
        assertThat(TrustBadge.publicBadge("A")).isEqualTo("verified");
        assertThat(TrustBadge.publicBadge("B")).isEqualTo("trusted");
        assertThat(TrustBadge.publicBadge("C")).isEqualTo("listed");

        // negative arms: nothing outside the allow-list becomes a badge
        for (String raw : new String[] {"D", null, "a", "d", "E", "AA", "", "verified", "gold"}) {
            assertThat(TrustBadge.publicBadge(raw)).as("publicBadge(%s)", raw).isNull();
        }
    }
}
