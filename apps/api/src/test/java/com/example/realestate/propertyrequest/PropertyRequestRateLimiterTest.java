package com.example.realestate.propertyrequest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Unit tests for {@link PropertyRequestRateLimiter}: bounded eviction and client-key canonicalisation. */
class PropertyRequestRateLimiterTest {

    private static final int MAX = 5;

    private static void assertLimited(Runnable call) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode().value()).isEqualTo(429));
    }

    private static void exhaust(java.util.function.Consumer<String> check, String key, int allowed) {
        for (int i = 0; i < allowed; i++) {
            check.accept(key);
        }
        for (int i = 0; i < 4; i++) {
            assertLimited(() -> check.accept(key));
        }
    }

    @Test
    @DisplayName("eviction: an exhausted client/phone key stays 429 after many other keys overflow max-entries (no clear-all reset)")
    void exhaustedKeysSurviveOverflow() {
        PropertyRequestRateLimiter limiter = new PropertyRequestRateLimiter(2, 2, false, MAX);
        exhaust(limiter::checkClient, "client-A", 2);
        exhaust(limiter::checkPhone, "phone-A", 2);

        // Caffeine evicts COLD entries individually when the cap is exceeded, so a key that keeps
        // being hit (the attacker retrying) stays resident, while the old clear-all reset every
        // bucket as soon as size reached the cap. Survival of a never-touched key is deliberately
        // NOT asserted: under a bounded cache it is a legitimate eviction candidate.
        for (int i = 0; i < 20; i++) {
            limiter.checkClient("client-other-" + i);
            limiter.checkPhone("phone-other-" + i);
            limiter.cleanUp();
            assertLimited(() -> limiter.checkClient("client-A"));
            assertLimited(() -> limiter.checkPhone("phone-A"));
        }

        assertThat(limiter.clientEntries()).as("client cache stays bounded").isLessThanOrEqualTo(MAX);
        assertThat(limiter.phoneEntries()).as("phone cache stays bounded").isLessThanOrEqualTo(MAX);
    }

    @Test
    @DisplayName("IPv6 clients in the same /64 share one bucket; a different /64 and IPv4 are separate")
    void ipv6KeyedBySlash64() {
        PropertyRequestRateLimiter limiter = new PropertyRequestRateLimiter(10, 10, false, 1000);
        String a = limiter.resolveClientKey(request("2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
        String b = limiter.resolveClientKey(request("2001:0db8:0001:0002:0000:0000:0000:0001"));
        String otherNet = limiter.resolveClientKey(request("2001:db8:1:3:aaaa:bbbb:cccc:dddd"));
        assertThat(a).isEqualTo(b).isNotEqualTo(otherNet);

        PropertyRequestRateLimiter tight = new PropertyRequestRateLimiter(1, 10, false, 1000);
        tight.checkClient(tight.resolveClientKey(request("2001:db8:1:2:aaaa::1")));
        assertLimited(() -> tight.checkClient(tight.resolveClientKey(request("2001:db8:1:2:bbbb::2"))));
        tight.checkClient(tight.resolveClientKey(request("2001:db8:1:3::1")));

        assertThat(limiter.resolveClientKey(request("203.0.113.7"))).isEqualTo("203.0.113.7");
        assertThat(limiter.resolveClientKey(request("203.0.113.8"))).isNotEqualTo("203.0.113.7");
    }

    private static MockHttpServletRequest request(String remoteAddr) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.setRemoteAddr(remoteAddr);
        return r;
    }

    private static MockHttpServletRequest forwarded(String remoteAddr, String... xffHeaderValues) {
        MockHttpServletRequest r = request(remoteAddr);
        for (String v : xffHeaderValues) {
            r.addHeader("X-Forwarded-For", v);
        }
        return r;
    }

    private static PropertyRequestRateLimiter trusting() {
        return new PropertyRequestRateLimiter(10, 10, true, 1000);
    }

    // ---- X1: no DNS lookup; only IP literals are accepted ---------------------------------

    @Test
    @DisplayName("X1: hostname-shaped XFF values are not literals -> fallback to remote address (localhost must NOT resolve to 127.0.0.1)")
    void hostnamesFallBackToRemoteAddress() {
        PropertyRequestRateLimiter limiter = trusting();
        String remote = "203.0.113.9";
        String expected = limiter.resolveClientKey(request(remote));
        for (String bad : new String[] {"evil.example", "z.example:1", "g::1", "localhost", "1.2.3", "1.2.3.4.5",
                "256.1.1.1", "01.2.3.4", "1.2.3.4:80", "::1::2", "1:2:3:4:5:6:7:8:9", "[::1", "fe80::1%", "0x7f.0.0.1"}) {
            assertThat(limiter.resolveClientKey(forwarded(remote, bad)))
                    .as("value '%s' must fall back to remote addr", bad)
                    .isEqualTo(expected);
        }
        assertThat(limiter.resolveClientKey(forwarded(remote, "localhost"))).isNotEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("X1: valid IPv4 / IPv6 / bracketed / zone-id / IPv4-mapped literals key correctly (/64 for IPv6)")
    void validLiteralsKeyCorrectly() {
        PropertyRequestRateLimiter limiter = trusting();
        String remote = "198.51.100.1";
        assertThat(limiter.resolveClientKey(forwarded(remote, "203.0.113.7"))).isEqualTo("203.0.113.7");
        assertThat(limiter.resolveClientKey(forwarded(remote, "::ffff:203.0.113.7"))).isEqualTo("203.0.113.7");
        assertThat(limiter.resolveClientKey(forwarded(remote, "::FFFF:cb00:7107"))).isEqualTo("203.0.113.7");

        String v6 = limiter.resolveClientKey(forwarded(remote, "2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
        assertThat(v6).isNotEqualTo("198.51.100.1");
        assertThat(limiter.resolveClientKey(forwarded(remote, "[2001:db8:1:2::9]"))).isEqualTo(v6);
        assertThat(limiter.resolveClientKey(forwarded(remote, "2001:db8:1:2::9%eth0"))).isEqualTo(v6);
        assertThat(limiter.resolveClientKey(forwarded(remote, "2001:db8:1:2:0:0:1.2.3.4"))).isEqualTo(v6);
        assertThat(limiter.resolveClientKey(forwarded(remote, "2001:db8:1:3::9"))).isNotEqualTo(v6);
        assertThat(limiter.resolveClientKey(forwarded(remote, "::1"))).isEqualTo(
                limiter.resolveClientKey(forwarded(remote, "0:0:0:0:ffff:0:0:1")));
    }

    @Test
    @DisplayName("X1: the literal parser is a pure function - names are rejected, literals parse to bytes")
    void parserIsPureAndStrict() {
        for (String name : new String[] {"evil.example", "localhost", "z.example:1", "g::1", "", " ", "a.b.c.d", "1.2.3.4 "}) {
            assertThat(PropertyRequestRateLimiter.parseIpLiteral(name)).as(name).isNull();
        }
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("255.0.0.1")).containsExactly((byte) 255, 0, 0, 1);
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("::ffff:1.2.3.4")).containsExactly(1, 2, 3, 4);
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("[2001:db8::1]%eth0")).isNull(); // zone only inside/after bare literal
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("2001:db8::1%eth0")).hasSize(16);
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("::")).hasSize(16);
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("1:2:3:4:5:6:7::")).hasSize(16);
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("1:2:3:4:5:6:7:8::")).isNull();
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("1.2.3.4::")).isNull();
    }

    @Test
    @DisplayName("X1: the limiter never references java.net.InetAddress (no name lookup is even expressible)")
    void limiterNeverReferencesInetAddress() throws Exception {
        try (java.io.InputStream in = PropertyRequestRateLimiter.class
                .getResourceAsStream("PropertyRequestRateLimiter.class")) {
            assertThat(in).isNotNull();
            String constantPool = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.ISO_8859_1);
            assertThat(constantPool).doesNotContain("java/net/InetAddress").doesNotContain("java/net/Inet6Address");
        }
    }

    // ---- X2: rightmost valid entry; default ignores header ---------------------------------

    @Test
    @DisplayName("X2: spoofed leftmost XFF is ignored - same rightmost (proxy-appended) value shares one bucket -> 429")
    void spoofedLeftmostIsIgnored() {
        PropertyRequestRateLimiter tight = new PropertyRequestRateLimiter(1, 10, true, 1000);
        tight.checkClient(tight.resolveClientKey(forwarded("10.0.0.1", "9.9.9.1, 203.0.113.7")));
        assertLimited(() -> tight.checkClient(tight.resolveClientKey(forwarded("10.0.0.1", "9.9.9.2, 203.0.113.7"))));
        assertLimited(() -> tight.checkClient(tight.resolveClientKey(forwarded("10.0.0.1", "evil.example, 203.0.113.7"))));
    }

    @Test
    @DisplayName("X2: rightmost valid literal is used; across multiple header lines the last line's last entry wins")
    void rightmostValidLiteralIsUsed() {
        PropertyRequestRateLimiter limiter = trusting();
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "1.1.1.1, 2.2.2.2, 203.0.113.7")))
                .isEqualTo("203.0.113.7");
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "1.1.1.1", "2.2.2.2, 203.0.113.7")))
                .isEqualTo("203.0.113.7");
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "  203.0.113.7  ")))
                .isEqualTo("203.0.113.7");
    }

    @Test
    @DisplayName("X2: an invalid rightmost entry NEVER walks left - it falls to the remote address")
    void invalidRightmostUsesRemoteAddressNeverWalksLeft() {
        PropertyRequestRateLimiter limiter = trusting();
        String remoteKey = limiter.resolveClientKey(request("10.0.0.1"));
        assertThat(remoteKey).isEqualTo("10.0.0.1");
        // A port-suffixed rightmost entry is not a literal; the valid-looking 9.9.9.9 to its left
        // is attacker-controllable and must not be used.
        String portSuffixed = limiter.resolveClientKey(forwarded("10.0.0.1", "9.9.9.9, 203.0.113.7:443"));
        assertThat(portSuffixed).isEqualTo(remoteKey).isNotEqualTo("9.9.9.9");
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "203.0.113.7, evil.example"))).isEqualTo(remoteKey);
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "evil.example, localhost"))).isEqualTo(remoteKey);
        // Across header lines the rightmost entry is the last entry of the last line.
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "9.9.9.9", "evil.example"))).isEqualTo(remoteKey);
    }

    @Test
    @DisplayName("X2: an empty/blank rightmost entry falls to the remote address (no skip-left)")
    void blankRightmostUsesRemoteAddress() {
        PropertyRequestRateLimiter limiter = trusting();
        String remoteKey = limiter.resolveClientKey(request("10.0.0.1"));
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "9.9.9.9, "))).isEqualTo(remoteKey);
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "203.0.113.7, , "))).isEqualTo(remoteKey);
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", " , "))).isEqualTo(remoteKey);
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", ""))).isEqualTo(remoteKey);
    }

    @Test
    @DisplayName("X1: bracketed IPv4 '[1.2.3.4]' is rejected - brackets only wrap IPv6")
    void bracketedIpv4IsRejected() {
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("[1.2.3.4]")).isNull();
        assertThat(PropertyRequestRateLimiter.parseIpLiteral("[::1]")).hasSize(16);
        PropertyRequestRateLimiter limiter = trusting();
        assertThat(limiter.resolveClientKey(forwarded("10.0.0.1", "[1.2.3.4]")))
                .isEqualTo(limiter.resolveClientKey(request("10.0.0.1")));
    }

    @Test
    @DisplayName("X2: default trust=false ignores X-Forwarded-For entirely - different XFF, same remote addr -> same bucket")
    void defaultFalseIgnoresHeader() {
        PropertyRequestRateLimiter tight = new PropertyRequestRateLimiter(1, 10, false, 1000);
        tight.checkClient(tight.resolveClientKey(forwarded("10.0.0.1", "9.9.9.1")));
        assertLimited(() -> tight.checkClient(tight.resolveClientKey(forwarded("10.0.0.1", "9.9.9.2"))));
        assertThat(tight.resolveClientKey(forwarded("10.0.0.1", "203.0.113.7"))).isEqualTo("10.0.0.1");
    }
}
