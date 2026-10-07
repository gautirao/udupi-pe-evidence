package com.example.realestate.propertyrequest;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** Valid when the value is null or {@link ContactNumberRule#containsContactNumber} is false. */
public class NoContactNumberValidator implements ConstraintValidator<NoContactNumber, String> {

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return !ContactNumberRule.containsContactNumber(value);
    }
}
