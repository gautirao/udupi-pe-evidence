package com.example.realestate.savedsearch;

/**
 * Slice B (matcher) delivery status for a saved search's most recent alert cycle. This
 * slice never transitions a row out of {@code IDLE} — no matcher, no delivery, no email
 * exist yet. Column is written now so Slice B needs no further migration.
 */
public enum AlertStatus {
    IDLE,
    PENDING,
    SENT,
    ERROR
}
