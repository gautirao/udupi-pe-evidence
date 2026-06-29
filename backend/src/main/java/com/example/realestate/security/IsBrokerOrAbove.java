package com.example.realestate.security;

import org.springframework.security.access.prepost.PreAuthorize;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Requires the caller to have {@code ROLE_BROKER}, {@code ROLE_DEALER}, or {@code ROLE_ADMIN} authority.
 *
 * <p>Applied declaratively to controller methods to replace imperative role-set checks.
 * The authority is populated by {@link DbRoleJwtAuthenticationConverter} via the {@code user_roles} DB lookup.
 *
 * <p>On denial, Spring Security throws {@code AccessDeniedException} which
 * {@link com.example.realestate.exception.GlobalExceptionHandler} maps to
 * {@code 403 {"error": "Requires admin role"}}.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@PreAuthorize("hasAnyAuthority('ROLE_BROKER','ROLE_DEALER','ROLE_ADMIN')")
public @interface IsBrokerOrAbove {
}
