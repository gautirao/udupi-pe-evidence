package com.example.realestate.discover.navigation;

/**
 * The five controlled-override kinds (#1955 Areas PR A, SLICE 2f+2g). Maps to the {@code
 * override_kind} CHECK constraint in V122.
 */
public enum OverrideKind {
    EXCLUDE_AREA, REASSIGN_AREA_REGION, MOVE_AREA, RELABEL, SET_REPRESENTATIVES
}
