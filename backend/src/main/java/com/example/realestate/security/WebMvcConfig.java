package com.example.realestate.security;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Registers {@link CallerInfoResolver} so Spring MVC can inject {@link CallerInfo}
 * as a controller method parameter.
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final CallerInfoResolver callerInfoResolver;

    public WebMvcConfig(CallerInfoResolver callerInfoResolver) {
        this.callerInfoResolver = callerInfoResolver;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(callerInfoResolver);
    }
}
