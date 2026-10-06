package com.example.realestate.propertyrequest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * L3 (#1793): one shared resolver mirrors {@code PhoneEncryptionConverter#resolveKey} source for
 * source, and {@link PhoneHasher} is keyed from it - never from a different source than the
 * converter. Sources are injected as maps, so no JVM-global state is touched.
 */
class PhoneKeyResolverTest {

    private static final String ENV = "PHONE_ENCRYPTION_KEY";
    private static final String PROP = "security.phone.encryption-key";
    private static final String PHONE = "+919876541234";

    private static final String ENV_KEY = "ZW52LWtleS1mb3ItcmVzb2x2ZXItdGVzdC0wMDAwMDE=";
    private static final String SYS_KEY = "c3lzLWtleS1mb3ItcmVzb2x2ZXItdGVzdC0wMDAwMDI=";
    private static final String SPRING_KEY = "c3ByaW5nLWtleS1mb3ItcmVzb2x2ZXItdGVzdC0wMDAz";

    private static PhoneKeyResolver resolver(Map<String, String> env, Map<String, String> props) {
        return new PhoneKeyResolver(SPRING_KEY, env::get, props::get);
    }

    @Test
    @DisplayName("precedence: non-blank env > non-blank system property > Spring property (the yml default = the converter's dev literal)")
    void precedence() {
        PhoneKeyResolver.Resolution r = resolver(Map.of(ENV, ENV_KEY), Map.of(PROP, SYS_KEY)).resolve();
        assertThat(r.key()).isEqualTo(ENV_KEY);
        assertThat(r.source()).isEqualTo(PhoneKeyResolver.Source.ENVIRONMENT);

        r = resolver(Map.of(ENV, "   "), Map.of(PROP, SYS_KEY)).resolve();
        assertThat(r.key()).isEqualTo(SYS_KEY);
        assertThat(r.source()).isEqualTo(PhoneKeyResolver.Source.SYSTEM_PROPERTY);

        r = resolver(Map.of(ENV, ""), Map.of(PROP, " ")).resolve();
        assertThat(r.key()).isEqualTo(SPRING_KEY);
        assertThat(r.source()).isEqualTo(PhoneKeyResolver.Source.SPRING_DEFAULT);

        r = resolver(Map.of(), Map.of()).resolve();
        assertThat(r.source()).isEqualTo(PhoneKeyResolver.Source.SPRING_DEFAULT);
    }

    @Test
    @DisplayName("no trimming: a padded value is returned verbatim (the converter does not trim either)")
    void noTrimming() {
        assertThat(resolver(Map.of(ENV, " " + ENV_KEY + "\n"), Map.of()).resolve().key())
                .isEqualTo(" " + ENV_KEY + "\n");
    }

    @Test
    @DisplayName("the resolution exposes the Spring property so the guard can detect a disagreement")
    void exposesSpringProperty() {
        assertThat(resolver(Map.of(ENV, ENV_KEY), Map.of()).resolve().springProperty()).isEqualTo(SPRING_KEY);
    }

    @Test
    @DisplayName("toString never contains a key value")
    void toStringIsValueFree() {
        String s = resolver(Map.of(ENV, ENV_KEY), Map.of()).resolve().toString();
        assertThat(s).doesNotContain(ENV_KEY).doesNotContain(SPRING_KEY);
    }

    @Test
    @DisplayName("hasher key == resolver key for the ENV source, even when the Spring property differs")
    void hasherKeyedByEnvSource() {
        PhoneKeyResolver r = resolver(Map.of(ENV, ENV_KEY), Map.of(PROP, SYS_KEY));
        String viaResolver = new PhoneHasher(r).hash(PHONE);
        assertThat(viaResolver).isEqualTo(new PhoneHasher(ENV_KEY).hash(PHONE));
        assertThat(viaResolver).isNotEqualTo(new PhoneHasher(SPRING_KEY).hash(PHONE));
        assertThat(viaResolver).isNotEqualTo(new PhoneHasher(SYS_KEY).hash(PHONE));
    }

    @Test
    @DisplayName("hasher key == resolver key for the SYSTEM-PROPERTY source, even when the Spring property differs")
    void hasherKeyedBySystemPropertySource() {
        PhoneKeyResolver r = resolver(Map.of(), Map.of(PROP, SYS_KEY));
        String viaResolver = new PhoneHasher(r).hash(PHONE);
        assertThat(viaResolver).isEqualTo(new PhoneHasher(SYS_KEY).hash(PHONE));
        assertThat(viaResolver).isNotEqualTo(new PhoneHasher(SPRING_KEY).hash(PHONE));
    }

    @Test
    @DisplayName("fallback: with neither source set the hasher uses the Spring property (the converter's dev literal by yml default); the guard already refuses this when the flag is on")
    void hasherFallsBackToSpringProperty() {
        PhoneKeyResolver r = resolver(Map.of(), Map.of());
        assertThat(new PhoneHasher(r).hash(PHONE)).isEqualTo(new PhoneHasher(SPRING_KEY).hash(PHONE));
    }
}
