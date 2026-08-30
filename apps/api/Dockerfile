# ---- Stage 1: Build ----
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /app

# Copy POM first to cache dependency downloads
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source and build the fat jar (skip tests — they need a live DB)
COPY src ./src
RUN mvn package -DskipTests -B

# ---- Stage 2: Runtime ----
FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=build /app/target/*.jar app.jar

RUN chown appuser:appgroup app.jar
USER appuser

EXPOSE 8080

# Container-aware JVM flags:
#   UseContainerSupport  — respect cgroup memory/CPU limits
#   MaxRAMPercentage=75  — leave headroom for off-heap / OS
# Render injects PORT at runtime; fall back to 8080 for local use.
CMD ["sh", "-c", "java -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Dserver.port=${PORT:-8080} -jar app.jar"]
