package com.example.realestate.school;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * JPA entity for the {@code schools} table.
 * Stores known educational institutions for school-first search
 * and nearby schools overlay on listings.
 */
@Entity
@Table(name = "schools", schema = "public")
public class School {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "board_type", length = 50)
    private String boardType;

    @Column(name = "latitude", nullable = false)
    private Double latitude;

    @Column(name = "longitude", nullable = false)
    private Double longitude;

    @Column(name = "address")
    private String address;

    @Column(name = "district", length = 100)
    private String district;

    @Column(name = "source", length = 50)
    private String source;

    @Column(name = "udise_code")
    private String udiseCode;

    @Column(name = "state")
    private String state;

    @Column(name = "board")
    private String board;

    @Column(name = "school_category")
    private String schoolCategory;

    @Column(name = "prominence_tier")
    private String prominenceTier;

    @Column(name = "area_key")
    private String areaKey;

    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    // ===== Getters and setters =====

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getBoardType() { return boardType; }
    public void setBoardType(String boardType) { this.boardType = boardType; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getUdiseCode() { return udiseCode; }
    public void setUdiseCode(String udiseCode) { this.udiseCode = udiseCode; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getBoard() { return board; }
    public void setBoard(String board) { this.board = board; }

    public String getSchoolCategory() { return schoolCategory; }
    public void setSchoolCategory(String schoolCategory) { this.schoolCategory = schoolCategory; }

    public String getProminenceTier() { return prominenceTier; }
    public void setProminenceTier(String prominenceTier) { this.prominenceTier = prominenceTier; }

    public String getAreaKey() { return areaKey; }
    public void setAreaKey(String areaKey) { this.areaKey = areaKey; }

    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
