package com.example.realestate.intelligence;

import java.io.Serializable;
import java.util.Objects;

/**
 * Composite primary key for {@link AreaIntelligenceSnapshot}.
 *
 * <p>Maps to the {@code (city_slug, area_key)} primary key on
 * {@code area_intelligence_snapshot}. Used with {@code @IdClass}.
 *
 * <p>Must implement {@link Serializable} and override {@link #equals} and
 * {@link #hashCode} as required by the JPA spec for composite keys.
 */
public class AreaIntelligenceSnapshotId implements Serializable {

    private String citySlug;
    private String areaKey;

    /** JPA no-arg constructor. */
    public AreaIntelligenceSnapshotId() {
    }

    public AreaIntelligenceSnapshotId(String citySlug, String areaKey) {
        this.citySlug = citySlug;
        this.areaKey = areaKey;
    }

    public String getCitySlug() {
        return citySlug;
    }

    public void setCitySlug(String citySlug) {
        this.citySlug = citySlug;
    }

    public String getAreaKey() {
        return areaKey;
    }

    public void setAreaKey(String areaKey) {
        this.areaKey = areaKey;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AreaIntelligenceSnapshotId)) return false;
        AreaIntelligenceSnapshotId that = (AreaIntelligenceSnapshotId) o;
        return Objects.equals(citySlug, that.citySlug)
                && Objects.equals(areaKey, that.areaKey);
    }

    @Override
    public int hashCode() {
        return Objects.hash(citySlug, areaKey);
    }
}
