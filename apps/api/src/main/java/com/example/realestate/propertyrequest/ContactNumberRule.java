package com.example.realestate.propertyrequest;

/**
 * Detects an Indian phone number typed into a free-text field (#1793 PR-C). Contact numbers belong
 * only in the dedicated phone field of {@link CreatePropertyRequestDto} (validated there by
 * {@code ^\+?[0-9]{10,14}$}); this rule keeps them out of {@code requirement}, {@code areaLabel} and
 * {@code city}, which are shown to admins and not encrypted.
 *
 * <p><strong>Rule.</strong> Scan for maximal digit groups: a group starts and ends with an ASCII
 * digit and its digits may be joined only by the separators space, {@code .}, {@code -},
 * {@code (} and {@code )}. An optional {@code +} directly before a group is allowed and ignored
 * (it cannot change the digit count). Within a group, the digits are split into <em>chunks</em> (runs
 * of digits between separators). The text is rejected if any contiguous span of one or more chunks
 * has concatenated digits that are
 * <ul>
 *   <li>exactly 10 digits starting 6-9 (Indian mobile),</li>
 *   <li>exactly 12 digits starting {@code 91} followed by 6-9 (with country code), or</li>
 *   <li>exactly 11 digits starting {@code 0} followed by 6-9 (trunk-prefix form).</li>
 * </ul>
 * so two numbers joined by spaces (e.g. {@code "9876543210 9123456780"}) are rejected.
 *
 * <p><strong>Range exemption.</strong> A span made of two or more chunks is a legitimate rounded
 * range, and not tested against the shapes above, only if <em>all</em> of its chunks end in
 * {@code "00"}: {@code "60000-75000"}, {@code "80000 - 95000"}, {@code "65000 75000"}. If any chunk
 * does not end in {@code "00"} the normal shape test applies, so {@code "98765 43200"} and
 * {@code "+91 98765 43200"} are rejected. Single-chunk spans are never exempt
 * ({@code "9876543200"} is rejected). Known limits: a number split so that <em>every</em> chunk
 * ends in {@code "00"} (e.g. {@code "98700 43200"}) is accepted (a slip); a 6-digit pincode followed
 * by a number (e.g. {@code "600028 1200"}) is rejected; short-chunk concatenations such as
 * {@code "98765 4 3210"} are rejected; full-width digits and other separators (NBSP, {@code /},
 * {@code _}, zero-width characters) are not separators, so such splits are not joined (known LOW
 * gap, follow-up). BHK counts, areas, years and "₹50,00,000" ({@code ,} is not a separator) are
 * accepted.
 *
 * <p><strong>Scope and limits.</strong> ASCII {@code [0-9]} only. A span is never extended past 12
 * digits, so the work is O(n * 12) with no regex and no backtracking: no ReDoS. Chunk bookkeeping
 * grows lazily with the chunk count of a group, not with the input length.
 */
public final class ContactNumberRule {

    /** Field error message returned to the client; static, never carries the rejected value. */
    public static final String MESSAGE = "Please enter contact numbers only in the Phone / WhatsApp field.";

    /** A span is never extended beyond the longest phone form (12 digits); this bounds the work. */
    private static final int MAX_SPAN_DIGITS = 12;

    private ContactNumberRule() {
    }

    /** @return true if {@code text} contains a phone-like group; false for null/blank/other text. */
    public static boolean containsContactNumber(String text) {
        if (text == null) {
            return false;
        }
        int n = text.length();
        int i = 0;
        StringBuilder digits = new StringBuilder();
        int[] chunkStart = new int[16]; // grown lazily (doubling) to the chunk count of the largest group
        while (i < n) {
            if (!isDigit(text.charAt(i))) {
                i++;
                continue;
            }
            // A group starts at a digit; extend over digits and separators, remember the last digit.
            // chunkStart[k] = offset into digits where chunk k begins; a final sentinel marks the end.
            digits.setLength(0);
            int chunks = 0;
            int lastDigit = i;
            boolean prevDigit = false;
            int j = i;
            while (j < n) {
                char c = text.charAt(j);
                if (isDigit(c)) {
                    if (!prevDigit) {
                        if (chunks + 2 > chunkStart.length) { // room for this start plus the end sentinel
                            chunkStart = java.util.Arrays.copyOf(chunkStart, chunkStart.length * 2);
                        }
                        chunkStart[chunks++] = digits.length();
                    }
                    digits.append(c);
                    lastDigit = j;
                    prevDigit = true;
                } else if (isSeparator(c)) {
                    prevDigit = false;
                } else {
                    break;
                }
                j++;
            }
            chunkStart[chunks] = digits.length();
            if (anySpanIsPhone(digits, chunkStart, chunks)) {
                return true;
            }
            i = lastDigit + 1;
        }
        return false;
    }

    /** Tests every contiguous run of chunks whose total digit count is at most {@link #MAX_SPAN_DIGITS}. */
    private static boolean anySpanIsPhone(CharSequence digits, int[] chunkStart, int chunks) {
        for (int s = 0; s < chunks; s++) {
            boolean allEndInDoubleZero = true;
            for (int e = s; e < chunks; e++) {
                int len = chunkStart[e + 1] - chunkStart[s];
                if (len > MAX_SPAN_DIGITS) {
                    break;
                }
                allEndInDoubleZero &= endsInDoubleZero(digits, chunkStart[e], chunkStart[e + 1]);
                // Multi-chunk spans are a legitimate rounded range only if EVERY chunk ends in "00".
                if ((e == s || !allEndInDoubleZero) && isPhoneDigits(digits, chunkStart[s], len)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean endsInDoubleZero(CharSequence d, int from, int to) {
        return to - from >= 2 && d.charAt(to - 1) == '0' && d.charAt(to - 2) == '0';
    }

    private static boolean isPhoneDigits(CharSequence d, int from, int len) {
        if (len == 10) {
            return isMobileLead(d.charAt(from));
        }
        if (len == 12) {
            return d.charAt(from) == '9' && d.charAt(from + 1) == '1' && isMobileLead(d.charAt(from + 2));
        }
        if (len == 11) {
            return d.charAt(from) == '0' && isMobileLead(d.charAt(from + 1));
        }
        return false;
    }

    private static boolean isMobileLead(char c) {
        return c >= '6' && c <= '9';
    }

    private static boolean isDigit(char c) {
        return c >= '0' && c <= '9';
    }

    private static boolean isSeparator(char c) {
        return c == ' ' || c == '.' || c == '-' || c == '(' || c == ')';
    }
}
