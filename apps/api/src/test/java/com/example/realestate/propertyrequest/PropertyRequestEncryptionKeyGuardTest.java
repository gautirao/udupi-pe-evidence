package com.example.realestate.propertyrequest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.function.UnaryOperator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * FF2 (#1793): when the public endpoint is enabled the app must refuse to start on an absent or
 * dev-fallback phone encryption key, judged exactly as {@code PhoneEncryptionConverter} resolves
 * it (env PHONE_ENCRYPTION_KEY, then system property security.phone.encryption-key, then the dev
 * literal). The environment / system properties are injected as functions, so no JVM-global state
 * is touched.
 *
 * <p>The dev key is read from application.yml (its documented default), never copied here.
 */
class PropertyRequestEncryptionKeyGuardTest {

    private static final String ENV = "PHONE_ENCRYPTION_KEY";
    private static final String PROP = "security.phone.encryption-key";
    private static final String FLAG = "app.property-requests.enabled";

    /** The development fallback, taken from the yml default `${PHONE_ENCRYPTION_KEY:<dev>}`. */
    static String devKey() throws Exception {
        PropertySource<?> ps = new YamlPropertySourceLoader()
                .load("application", new ClassPathResource("application.yml")).get(0);
        String raw = String.valueOf(ps.getProperty(PROP));
        assertThat(raw).startsWith("${" + ENV + ":");
        return raw.substring(raw.indexOf(':') + 1, raw.length() - 1);
    }

    static String realKey() {
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        return Base64.getEncoder().encodeToString(k);
    }

    private static UnaryOperator<String> lookup(Map<String, String> m) {
        return m::get;
    }

    /**
     * What Spring would resolve for {@code security.phone.encryption-key} given the same sources: a
     * system property outranks the yml default {@code ${PHONE_ENCRYPTION_KEY:<dev>}}, which resolves
     * to the environment variable when set, else to the dev literal.
     */
    private static String springProperty(Map<String, String> env, Map<String, String> props) throws Exception {
        if (props.get(PROP) != null) {
            return props.get(PROP);
        }
        return env.get(ENV) != null ? env.get(ENV) : devKey();
    }

    static PhoneKeyResolver resolver(String springProperty, Map<String, String> env, Map<String, String> props) {
        return new PhoneKeyResolver(springProperty, lookup(env), lookup(props));
    }

    private static PropertyRequestEncryptionKeyGuard guard(Map<String, String> env, Map<String, String> props)
            throws Exception {
        return guardWithSpring(springProperty(env, props), env, props);
    }

    private static PropertyRequestEncryptionKeyGuard guardWithSpring(
            String spring, Map<String, String> env, Map<String, String> props) {
        return new PropertyRequestEncryptionKeyGuard(resolver(spring, env, props));
    }

    @Test
    @DisplayName("FF2: env real key -> ok")
    void envRealKey_ok() throws Exception {
        assertThatCode(() -> guard(Map.of(ENV, realKey()), Map.of()).validate()).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("FF2: env blank + system property real key -> ok (converter falls to the system property)")
    void blankEnvAndRealSystemProperty_ok() throws Exception {
        assertThatCode(() -> guard(Map.of(ENV, "  "), Map.of(PROP, realKey())).validate()).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("FF2: neither env nor system property -> fails (the converter would use the dev literal)")
    void absent_fails() throws Exception {
        assertThatThrownBy(() -> guard(Map.of(), Map.of()).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(ENV);
    }

    @Test
    @DisplayName("FF2: env set to the dev key -> fails")
    void envDevKey_fails() throws Exception {
        String dev = devKey();
        assertThatThrownBy(() -> guard(Map.of(ENV, dev), Map.of()).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining(dev);
    }

    @Test
    @DisplayName("FF2: system property set to the dev key (env absent) -> fails")
    void propDevKey_fails() throws Exception {
        assertThatThrownBy(() -> guard(Map.of(), Map.of(PROP, devKey())).validate())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("FF2: the dev key with surrounding whitespace is rejected (the converter does not trim, so it would fail later)")
    void devKeyVariants_fail() throws Exception {
        String dev = devKey();
        assertThatThrownBy(() -> guard(Map.of(ENV, "  " + dev + "\n"), Map.of()).validate())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("FF2: env wins over the system property, exactly like the converter (env dev + prop real -> fails)")
    void envPrecedenceMirrorsConverter() throws Exception {
        String dev = devKey();
        String real = realKey();
        assertThatThrownBy(() -> guard(Map.of(ENV, dev), Map.of(PROP, real)).validate())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("L3: a whitespace-padded REAL key fails the guard (the converter does not trim, so it would 500 later)")
    void paddedKey_fails_valueFree() throws Exception {
        String real = realKey();
        for (String padded : new String[] {" " + real, real + " ", real + "\n", "\t" + real + "\r\n"}) {
            assertThatThrownBy(() -> guard(Map.of(ENV, padded), Map.of()).validate())
                    .as("env padded").isInstanceOf(IllegalStateException.class)
                    .hasMessageNotContaining(real);
            assertThatThrownBy(() -> guard(Map.of(), Map.of(PROP, padded)).validate())
                    .as("system property padded").isInstanceOf(IllegalStateException.class)
                    .hasMessageNotContaining(real);
        }
    }

    @Test
    @DisplayName("L3: the Spring property (e.g. SECURITY_PHONE_ENCRYPTION_KEY) disagreeing with the resolved key fails closed, value-free")
    void conflictingSpringProperty_failsClosed() throws Exception {
        String dev = devKey();
        String real = realKey();
        assertThatThrownBy(() -> guardWithSpring(dev, Map.of(ENV, real), Map.of()).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining(dev).hasMessageNotContaining(real);
        String otherReal = realKey();
        assertThatThrownBy(() -> guardWithSpring(otherReal, Map.of(), Map.of(PROP, real)).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining(otherReal).hasMessageNotContaining(real);
        assertThatCode(() -> guardWithSpring(real, Map.of(ENV, real), Map.of()).validate())
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("L3: context level - conflicting Spring property dev value + real env key -> startup FAILS closed, value-free")
    void conflictingSpringProperty_contextFails() throws Exception {
        String dev = devKey();
        String real = realKey();
        runner(guardWithSpring(dev, Map.of(ENV, real), Map.of()), FLAG + "=true").run(ctx -> {
            assertThat(ctx).hasFailed();
            assertThat(rootCause(ctx.getStartupFailure())).isInstanceOf(IllegalStateException.class)
                    .hasMessageNotContaining(dev).hasMessageNotContaining(real);
        });
    }

    @Test
    @DisplayName("FF2: a key that is not valid Base64 / not 32 bytes fails, and the message never contains the supplied value")
    void malformedKey_fails_valueFree() throws Exception {
        String notBase64 = "this is !!! not base64 SECRETVALUE";
        assertThatThrownBy(() -> guard(Map.of(ENV, notBase64), Map.of()).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("SECRETVALUE");
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);
        assertThatThrownBy(() -> guard(Map.of(ENV, shortKey), Map.of()).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining(shortKey);
    }

    // ---- context level: the @ConditionalOnProperty gate + @PostConstruct fail-closed ----

    private ApplicationContextRunner runner(PropertyRequestEncryptionKeyGuard guard, String... props) {
        return new ApplicationContextRunner().withPropertyValues(props)
                .withBean(PropertyRequestEncryptionKeyGuard.class, () -> guard);
    }

    @Test
    @DisplayName("FF2: enabled + absent key -> context FAILS at startup with a value-free message")
    void enabledAbsentKey_contextFails() throws Exception {
        runner(guard(Map.of(), Map.of()), FLAG + "=true").run(ctx -> {
            assertThat(ctx).hasFailed();
            Throwable root = rootCause(ctx.getStartupFailure());
            assertThat(root).isInstanceOf(IllegalStateException.class).hasMessageContaining(ENV);
        });
    }

    @Test
    @DisplayName("FF2: enabled + dev key -> context FAILS at startup, message does not contain the key")
    void enabledDevKey_contextFails() throws Exception {
        String dev = devKey();
        runner(guard(Map.of(ENV, dev), Map.of()), FLAG + "=true").run(ctx -> {
            assertThat(ctx).hasFailed();
            assertThat(rootCause(ctx.getStartupFailure())).hasMessageNotContaining(dev);
        });
    }

    @Test
    @DisplayName("FF2: enabled + non-dev test key -> context starts")
    void enabledRealKey_contextStarts() throws Exception {
        runner(guard(Map.of(ENV, realKey()), Map.of()), FLAG + "=true").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).hasSingleBean(PropertyRequestEncryptionKeyGuard.class);
        });
    }

    @Test
    @DisplayName("FF2: disabled + dev key -> context starts and the guard is not even created")
    void disabledDevKey_contextStarts() throws Exception {
        runner(guard(Map.of(ENV, devKey()), Map.of()), FLAG + "=false").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).doesNotHaveBean(PropertyRequestEncryptionKeyGuard.class);
        });
    }

    @Test
    @DisplayName("FF2: flag unset (default) + absent key -> context starts, guard not created")
    void unsetFlagAbsentKey_contextStarts() throws Exception {
        runner(guard(Map.of(), Map.of())).run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).doesNotHaveBean(PropertyRequestEncryptionKeyGuard.class);
        });
    }

    private static Throwable rootCause(Throwable t) {
        Throwable c = t;
        while (c.getCause() != null) {
            c = c.getCause();
        }
        return c;
    }
}
