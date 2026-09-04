package com.example.realestate.savedsearch;

/**
 * How often a saved search's alert should be evaluated by Slice B's matcher. This slice
 * only persists the column; no matcher reads it yet. {@code OFF} opts a saved search out
 * of alerting entirely while keeping it active for browsing/re-running.
 */
public enum AlertFrequency {
    INSTANT,
    DAILY,
    WEEKLY,
    OFF
}
