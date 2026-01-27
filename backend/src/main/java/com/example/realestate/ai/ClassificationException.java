package com.example.realestate.ai;

public class ClassificationException extends RuntimeException {

    public ClassificationException(String message) {
        super(message);
    }

    public ClassificationException(String message, Throwable cause) {
        super(message, cause);
    }
}
