package com.example.realestate.discover.citylaunch;

/**
 * How a {@link SandboxCityRegionMembership} was assigned to its region.
 * Maps to the {@code assignment_source} CHECK constraint in V118:
 * {@code assignment_source IN ('AUTO','OVERRIDE')}.
 */
public enum AssignmentSource {
    AUTO, OVERRIDE
}
