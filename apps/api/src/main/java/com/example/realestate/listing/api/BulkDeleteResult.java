package com.example.realestate.listing.api;

import java.util.List;

public record BulkDeleteResult(int deleted, int skipped, List<String> errors) {}
