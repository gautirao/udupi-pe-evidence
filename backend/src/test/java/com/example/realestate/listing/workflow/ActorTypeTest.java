package com.example.realestate.listing.workflow;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ActorTypeTest {

    @ParameterizedTest
    @EnumSource(ActorType.class)
    void roundTrip_allValues(ActorType actor) {
        // fromDbValue(toDbValue(x)) == x for BROKER, ADMIN, SYSTEM
        assertThat(ActorType.fromDbValue(actor.toDbValue())).isEqualTo(actor);
    }

    @Test
    void fromDbValue_lowercaseInput_normalisedToUpperCase() {
        // toUpperCase() normalisation allows lowercase DB reads to be handled safely
        assertThat(ActorType.fromDbValue("admin")).isEqualTo(ActorType.ADMIN);
        assertThat(ActorType.fromDbValue("broker")).isEqualTo(ActorType.BROKER);
        assertThat(ActorType.fromDbValue("system")).isEqualTo(ActorType.SYSTEM);
    }

    @Test
    void fromDbValue_unknownValue_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> ActorType.fromDbValue("UNKNOWN"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void fromDbValue_nullInput_throwsNullPointerException() {
        // String.toUpperCase() on null throws NullPointerException before valueOf is reached
        assertThatThrownBy(() -> ActorType.fromDbValue(null))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void toDbValue_returnsUppercaseName() {
        assertThat(ActorType.BROKER.toDbValue()).isEqualTo("BROKER");
        assertThat(ActorType.ADMIN.toDbValue()).isEqualTo("ADMIN");
        assertThat(ActorType.SYSTEM.toDbValue()).isEqualTo("SYSTEM");
    }
}
