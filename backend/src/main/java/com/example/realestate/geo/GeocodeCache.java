package com.example.realestate.geo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "geocode_cache", schema = "public")
public class GeocodeCache {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String locality;

    @Column(nullable = false)
    private double latitude;

    @Column(nullable = false)
    private double longitude;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "fetched_at", nullable = false)
    private OffsetDateTime fetchedAt;

    public GeocodeCache() {}

    public GeocodeCache(String locality, double latitude, double longitude,
                        String displayName, OffsetDateTime fetchedAt) {
        this.locality = locality;
        this.latitude = latitude;
        this.longitude = longitude;
        this.displayName = displayName;
        this.fetchedAt = fetchedAt;
    }

    public UUID getId() { return id; }
    public String getLocality() { return locality; }
    public double getLatitude() { return latitude; }
    public double getLongitude() { return longitude; }
    public String getDisplayName() { return displayName; }
    public OffsetDateTime getFetchedAt() { return fetchedAt; }
}
