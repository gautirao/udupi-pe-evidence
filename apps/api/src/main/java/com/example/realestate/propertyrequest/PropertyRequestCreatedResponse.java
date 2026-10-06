package com.example.realestate.propertyrequest;

import java.time.OffsetDateTime;
import java.util.UUID;

/** 201 body for a created property request. Deliberately carries no contact data. */
public record PropertyRequestCreatedResponse(UUID id, String status, OffsetDateTime createdAt) {
}
