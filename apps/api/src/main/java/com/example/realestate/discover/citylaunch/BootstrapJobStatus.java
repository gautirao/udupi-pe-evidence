package com.example.realestate.discover.citylaunch;

/**
 * Lifecycle of a {@link CityBootstrapJob} (V145, #2676 Slice A).
 *
 * <p>RESOLVING -&gt; DISAMBIGUATION_REQUIRED -&gt; CITY_CREATED is the ambiguous-name path;
 * RESOLVING -&gt; CITY_CREATED is the unambiguous/already-exists path. RESOLVING or
 * DISAMBIGUATION_REQUIRED -&gt; FAILED is terminal and non-retryable in place — the operator
 * must submit a fresh "Start launch" (a FAILED row is not in-flight, so the unique-in-flight
 * index does not block a retry under the same normalized name).
 */
public enum BootstrapJobStatus {
    RESOLVING,
    DISAMBIGUATION_REQUIRED,
    CITY_CREATED,
    FAILED
}
