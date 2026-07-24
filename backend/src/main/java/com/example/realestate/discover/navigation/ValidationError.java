package com.example.realestate.discover.navigation;

/** One blocking structural finding from {@link NavigationTreeValidationService} (#1955 AC7). */
public record ValidationError(String code, String message, String nodeKey) {
}
