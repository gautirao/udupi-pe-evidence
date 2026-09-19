package com.example.realestate.listing.storage;

import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Surfaces the effective state of {@link R2StorageService} at {@code /actuator/info} (#2630).
 * Exposes provider readiness without leaking secret access keys or credentials.
 */
@Component
public class R2StorageInfoContributor implements InfoContributor {

    private final R2StorageService r2StorageService;

    public R2StorageInfoContributor(R2StorageService r2StorageService) {
        this.r2StorageService = r2StorageService;
    }

    @Override
    public void contribute(Info.Builder builder) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("enabled", r2StorageService.isEnabled());
        details.put("reason", r2StorageService.getStatusReason());
        details.put("bucket", r2StorageService.getBucket());
        details.put("publicBaseUrl", r2StorageService.getPublicBaseUrl());
        builder.withDetail("r2Storage", details);
    }
}
