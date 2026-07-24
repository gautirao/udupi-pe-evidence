package com.example.realestate.discover.navigation;

import java.util.List;

/** The structured report a future preview/promotion slice consumes instead of a raw exception. */
public record ValidationReport(List<ValidationError> errors) {

    public boolean isValid() {
        return errors.isEmpty();
    }
}
