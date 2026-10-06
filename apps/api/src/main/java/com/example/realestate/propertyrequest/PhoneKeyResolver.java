package com.example.realestate.propertyrequest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.function.UnaryOperator;

/**
 * The single place the property-request feature resolves the phone encryption key (#1793, L3).
 * Both {@link PhoneHasher} and {@link PropertyRequestEncryptionKeyGuard} use it, so the hasher can
 * never be keyed by a different source than {@code PhoneEncryptionConverter} (which is deliberately
 * not touched).
 *
 * <p>Precedence mirrors {@code PhoneEncryptionConverter#resolveKey} exactly: environment variable
 * {@code PHONE_ENCRYPTION_KEY} if non-blank, else system property {@code security.phone.encryption-key}
 * if non-blank, else the converter falls back to its hardcoded dev literal. That literal is NOT copied
 * here: in that last case {@link Source#SPRING_DEFAULT} is reported and the key is the Spring property
 * {@code security.phone.encryption-key}, whose application.yml default is the same dev literal. This
 * is the only case where the Spring property is used as the key, and it is exactly the case the guard
 * refuses when the endpoint is enabled; with the flag off the hasher is never exercised.
 *
 * <p>Values are returned verbatim (the converter does not trim, so neither does this class). No
 * value is ever included in a message or {@code toString()}.
 */
@Component
public class PhoneKeyResolver {

    static final String ENV_VAR = "PHONE_ENCRYPTION_KEY";
    static final String SYSTEM_PROPERTY = "security.phone.encryption-key";

    public enum Source { ENVIRONMENT, SYSTEM_PROPERTY, SPRING_DEFAULT }

    /**
     * @param key            the key text the converter would decode (verbatim), or, for
     *                       {@link Source#SPRING_DEFAULT}, the Spring property value
     * @param source         where {@code key} came from
     * @param springProperty the Spring property value, for disagreement detection by the guard
     */
    public record Resolution(String key, Source source, String springProperty) {
        @Override
        public String toString() {
            return "Resolution[source=" + source + "]";
        }
    }

    private final String springProperty;
    private final UnaryOperator<String> env;
    private final UnaryOperator<String> systemProperties;

    @Autowired
    public PhoneKeyResolver(@Value("${security.phone.encryption-key}") String springProperty) {
        this(springProperty, System::getenv, System::getProperty);
    }

    PhoneKeyResolver(String springProperty, UnaryOperator<String> env, UnaryOperator<String> systemProperties) {
        this.springProperty = springProperty;
        this.env = env;
        this.systemProperties = systemProperties;
    }

    public Resolution resolve() {
        String value = env.apply(ENV_VAR);
        if (value != null && !value.isBlank()) {
            return new Resolution(value, Source.ENVIRONMENT, springProperty);
        }
        value = systemProperties.apply(SYSTEM_PROPERTY);
        if (value != null && !value.isBlank()) {
            return new Resolution(value, Source.SYSTEM_PROPERTY, springProperty);
        }
        return new Resolution(springProperty, Source.SPRING_DEFAULT, springProperty);
    }
}
