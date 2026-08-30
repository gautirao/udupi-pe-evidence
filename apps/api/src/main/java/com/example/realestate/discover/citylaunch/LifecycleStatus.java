package com.example.realestate.discover.citylaunch;

/**
 * Lifecycle state of a {@link CityLaunchRevision}.
 * Maps to the {@code lifecycle_status} CHECK constraint in V118:
 * {@code lifecycle_status IN ('PREPARING','PREPARED','VALIDATED','PROMOTING','PROMOTED',
 * 'SUPERSEDED','FAILED')}.
 *
 * <p>No transition logic lives here or anywhere in PR1 — this enum is a pure value-mapping
 * type. The prep -> validate -> promote -> supersede state machine ships in a later PR.
 */
public enum LifecycleStatus {
    PREPARING, PREPARED, VALIDATED, PROMOTING, PROMOTED, SUPERSEDED, FAILED
}
