package com.example.realestate.propertyrequest;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.HexFormat;
import java.util.List;

/**
 * Anti-abuse limits for the public property-request POST (#1793): one bucket per client key and
 * one per phone hash. Exceeding either throws 429 {@code RATE_LIMIT_EXCEEDED}.
 *
 * <p><strong>Known limitation:</strong> buckets are in-memory and per-instance, so in a
 * multi-instance deployment the effective limit is {@code limit x instances}, and a restart
 * resets all history. Distributed (Redis-backed) limiting is a follow-up.
 *
 * <p>Memory is bounded by two Caffeine caches (one per bucket kind): entries expire one window
 * after last access and the size is capped at {@code max-entries}. Exceeding the cap evicts
 * individual cold entries; it never resets every bucket, so an attacker cannot flush an exhausted
 * key by flooding distinct keys.
 *
 * <p>Client key: {@code getRemoteAddr()}, or - only when
 * {@code app.ratelimit.property-request.trust-forwarded-header=true} - ONLY the rightmost
 * {@code X-Forwarded-For} entry (last entry of the last header line). If it is an IP literal it is
 * used; otherwise the remote address is used and a value-free WARN is logged. Entries to its left
 * are never consulted. The flag defaults to false. When true this is correct only if the single
 * proxy directly in front of the app appends the true client address. Per-client limiting behind
 * Render is UNRESOLVED (the rightmost entry there may be a Cloudflare/Render hop); follow-up issue
 * #2793 must be resolved (staging probe, then a client-IP source) BEFORE enabling the public
 * endpoint. Values are parsed by a pure literal parser ({@link #parseIpLiteral});
 * {@code java.net.InetAddress} is deliberately not used, so no forwarded value can ever trigger a
 * DNS lookup. IPv6 addresses are keyed by their /64 prefix (one subscriber commonly controls a
 * whole /64); IPv4 and IPv4-mapped IPv6 are keyed as dotted quads.
 *
 * <p>Log hygiene: the client key (an IP) and phone hash are never logged here.
 */
@Component
public class PropertyRequestRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(PropertyRequestRateLimiter.class);

    static final String ERROR_CODE = "RATE_LIMIT_EXCEEDED";
    private static final Duration WINDOW = Duration.ofHours(1);
    private static final String UNKNOWN_CLIENT_KEY = "unknown";
    private static final String FORWARDED_FOR_HEADER = "X-Forwarded-For";
    private static final int IPV6_PREFIX_BYTES = 8; // /64

    private final int clientPerHour;
    private final int phonePerHour;
    private final boolean trustForwardedHeader;

    private final Cache<String, Bucket> clientBuckets;
    private final Cache<String, Bucket> phoneBuckets;

    public PropertyRequestRateLimiter(
            @Value("${app.ratelimit.property-request.client-per-hour:10}") int clientPerHour,
            @Value("${app.ratelimit.property-request.phone-per-hour:3}") int phonePerHour,
            @Value("${app.ratelimit.property-request.trust-forwarded-header:false}") boolean trustForwardedHeader,
            @Value("${app.ratelimit.property-request.max-entries:100000}") int maxEntries) {
        if (clientPerHour <= 0 || phonePerHour <= 0 || maxEntries <= 0) {
            throw new IllegalArgumentException(
                    "app.ratelimit.property-request.* limits and max-entries must all be > 0");
        }
        this.clientPerHour = clientPerHour;
        this.phonePerHour = phonePerHour;
        this.trustForwardedHeader = trustForwardedHeader;
        this.clientBuckets = newCache(maxEntries);
        this.phoneBuckets = newCache(maxEntries);
    }

    private static Cache<String, Bucket> newCache(int maxEntries) {
        return Caffeine.newBuilder()
                .expireAfterAccess(WINDOW)
                .maximumSize(maxEntries)
                .build();
    }

    public String resolveClientKey(HttpServletRequest request) {
        if (trustForwardedHeader) {
            String rightmost = rightmostForwardedEntry(request);
            if (rightmost != null) {
                byte[] forwarded = parseIpLiteral(rightmost);
                if (forwarded != null) {
                    return keyOf(forwarded);
                }
                // Never walk further left: entries to the left are client-controllable. No value
                // (IP or header text) is logged.
                log.warn("property-request rate limit: rightmost forwarded entry is not an IP literal; "
                        + "using remote address");
            }
        }
        String remoteAddr = request.getRemoteAddr();
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return UNKNOWN_CLIENT_KEY;
        }
        byte[] parsed = parseIpLiteral(remoteAddr.trim());
        return parsed != null ? keyOf(parsed) : remoteAddr;
    }

    /**
     * The single rightmost {@code X-Forwarded-For} entry (last entry of the last header line),
     * trimmed; may be empty. {@code null} when the header is absent.
     */
    private static String rightmostForwardedEntry(HttpServletRequest request) {
        String last = null;
        Enumeration<String> headers = request.getHeaders(FORWARDED_FOR_HEADER);
        while (headers != null && headers.hasMoreElements()) {
            last = headers.nextElement();
        }
        if (last == null) {
            return null;
        }
        String[] entries = last.split(",", -1);
        return entries[entries.length - 1].trim();
    }

    /** IPv4 -> dotted quad; IPv6 -> its /64 prefix. */
    private static String keyOf(byte[] address) {
        if (address.length == 4) {
            return (address[0] & 0xff) + "." + (address[1] & 0xff) + "." + (address[2] & 0xff) + "."
                    + (address[3] & 0xff);
        }
        return "v6/64:" + HexFormat.of().formatHex(address, 0, IPV6_PREFIX_BYTES);
    }

    /**
     * Pure, side-effect-free literal parser: it performs no I/O and never resolves a name. Accepts a
     * strict IPv4 dotted quad, or an IPv6 literal (optionally in brackets, with an optional
     * {@code %zone} suffix that is discarded, {@code ::} compression, and an optional embedded IPv4
     * tail). Returns 4 bytes (IPv4 or IPv4-mapped IPv6), 16 bytes (other IPv6), or {@code null}
     * when the value is not a literal.
     */
    static byte[] parseIpLiteral(String value) {
        if (value == null || value.isEmpty() || value.length() > 64) {
            return null;
        }
        String candidate = value;
        if (candidate.startsWith("[")) {
            if (!candidate.endsWith("]")) {
                return null;
            }
            candidate = candidate.substring(1, candidate.length() - 1);
            if (candidate.indexOf(':') < 0) {
                return null; // brackets wrap IPv6 only; "[1.2.3.4]" is not a literal
            }
        }
        if (candidate.indexOf(':') < 0) {
            return parseIpv4(candidate);
        }
        int zone = candidate.indexOf('%');
        if (zone >= 0) {
            String zoneId = candidate.substring(zone + 1);
            if (zoneId.isEmpty() || !zoneId.chars().allMatch(c -> c > 0x20 && c < 0x7f && c != '%' && c != ',')) {
                return null;
            }
            candidate = candidate.substring(0, zone);
        }
        byte[] v6 = parseIpv6(candidate);
        if (v6 == null) {
            return null;
        }
        for (int i = 0; i < 10; i++) {
            if (v6[i] != 0) {
                return v6;
            }
        }
        boolean mapped = v6[10] == (byte) 0xff && v6[11] == (byte) 0xff;
        return mapped ? Arrays.copyOfRange(v6, 12, 16) : v6;
    }

    private static byte[] parseIpv4(String s) {
        String[] parts = s.split("\\.", -1);
        if (parts.length != 4) {
            return null;
        }
        byte[] out = new byte[4];
        for (int i = 0; i < 4; i++) {
            String p = parts[i];
            if (p.isEmpty() || p.length() > 3 || (p.length() > 1 && p.charAt(0) == '0')) {
                return null;
            }
            int n = 0;
            for (int j = 0; j < p.length(); j++) {
                char c = p.charAt(j);
                if (c < '0' || c > '9') {
                    return null;
                }
                n = n * 10 + (c - '0');
            }
            if (n > 255) {
                return null;
            }
            out[i] = (byte) n;
        }
        return out;
    }

    private static byte[] parseIpv6(String s) {
        int dc = s.indexOf("::");
        if (dc >= 0 && s.indexOf("::", dc + 1) >= 0) {
            return null; // more than one "::" (also rejects ":::")
        }
        String head = dc >= 0 ? s.substring(0, dc) : s;
        String tail = dc >= 0 ? s.substring(dc + 2) : "";
        // An embedded IPv4 tail is only legal as the very last element of the address.
        List<byte[]> headGroups = parseGroups(head, dc < 0);
        List<byte[]> tailGroups = parseGroups(tail, true);
        if (headGroups == null || tailGroups == null) {
            return null;
        }
        int total = sixteenBitCount(headGroups) + sixteenBitCount(tailGroups);
        if (dc >= 0 ? total > 7 : total != 8) {
            return null;
        }
        byte[] out = new byte[16];
        int pos = 0;
        for (byte[] g : headGroups) {
            System.arraycopy(g, 0, out, pos, g.length);
            pos += g.length;
        }
        pos = 16;
        for (int i = tailGroups.size() - 1; i >= 0; i--) {
            byte[] g = tailGroups.get(i);
            pos -= g.length;
            System.arraycopy(g, 0, out, pos, g.length);
        }
        return out;
    }

    private static int sixteenBitCount(List<byte[]> groups) {
        int n = 0;
        for (byte[] g : groups) {
            n += g.length / 2;
        }
        return n;
    }

    /** Colon-separated hex groups (2 bytes each); the last may be an IPv4 literal (4 bytes). */
    private static List<byte[]> parseGroups(String s, boolean allowV4Tail) {
        List<byte[]> groups = new ArrayList<>();
        if (s.isEmpty()) {
            return groups;
        }
        String[] parts = s.split(":", -1);
        for (int i = 0; i < parts.length; i++) {
            String p = parts[i];
            if (p.isEmpty() || p.length() > 4 && p.indexOf('.') < 0) {
                return null;
            }
            if (p.indexOf('.') >= 0) {
                byte[] v4 = (allowV4Tail && i == parts.length - 1) ? parseIpv4(p) : null;
                if (v4 == null) {
                    return null;
                }
                groups.add(v4);
                continue;
            }
            int n = 0;
            for (int j = 0; j < p.length(); j++) {
                int d = hexDigit(p.charAt(j));
                if (d < 0) {
                    return null;
                }
                n = n * 16 + d;
            }
            groups.add(new byte[] {(byte) (n >> 8), (byte) n});
        }
        return groups;
    }

    private static int hexDigit(char c) {
        if (c >= '0' && c <= '9') {
            return c - '0';
        }
        if (c >= 'a' && c <= 'f') {
            return c - 'a' + 10;
        }
        if (c >= 'A' && c <= 'F') {
            return c - 'A' + 10;
        }
        return -1;
    }

    public void checkClient(String clientKey) {
        consume(clientBuckets, clientKey, clientPerHour, "client");
    }

    public void checkPhone(String phoneHash) {
        consume(phoneBuckets, phoneHash, phonePerHour, "phone");
    }

    private void consume(Cache<String, Bucket> buckets, String key, int perHour, String scope) {
        Bucket bucket = buckets.get(key, k -> Bucket.builder()
                .addLimit(Bandwidth.builder().capacity(perHour).refillGreedy(perHour, WINDOW).build())
                .build());
        if (!bucket.tryConsume(1)) {
            log.warn("Property request rate limit exceeded scope={}", scope);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, ERROR_CODE);
        }
    }

    /** Runs pending cache maintenance (eviction). Test support. */
    void cleanUp() {
        clientBuckets.cleanUp();
        phoneBuckets.cleanUp();
    }

    long clientEntries() {
        return clientBuckets.estimatedSize();
    }

    long phoneEntries() {
        return phoneBuckets.estimatedSize();
    }

    /** Clears all buckets. Test support. */
    void reset() {
        clientBuckets.invalidateAll();
        phoneBuckets.invalidateAll();
    }
}
