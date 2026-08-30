package com.example.realestate.discover.citylaunch;

/**
 * Progress state of the offline prep pipeline run backing a {@link CityLaunchRevision}.
 * Maps to the {@code prep_state} CHECK constraint in V118:
 * {@code prep_state IN ('PENDING','RUNNING','DONE','FAILED')}.
 */
public enum PrepState {
    PENDING, RUNNING, DONE, FAILED
}
