package com.example.realestate.broker.dto;

/**
 * One resolved finding entry (applied component only).
 *
 * @param component  The {@link com.example.realestate.quality.QualityComponentType} name.
 * @param score      Component score in [0, 100].
 * @param applied    Always {@code true} — only applied components reach the response.
 * @param finding    Human-readable finding text verbatim from QualityComponent.finding().
 */
public record QualityFinding(
        String component,
        int score,
        boolean applied,
        String finding
) {}
