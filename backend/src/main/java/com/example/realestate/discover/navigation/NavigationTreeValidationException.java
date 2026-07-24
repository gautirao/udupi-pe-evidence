package com.example.realestate.discover.navigation;

/** Thrown when a generated tree fails {@link NavigationTreeValidationService} BEFORE any DB write. */
public class NavigationTreeValidationException extends RuntimeException {

    private final ValidationReport report;

    public NavigationTreeValidationException(ValidationReport report) {
        super("Navigation tree failed validation with " + report.errors().size() + " error(s): " + report.errors());
        this.report = report;
    }

    public ValidationReport report() {
        return report;
    }
}
