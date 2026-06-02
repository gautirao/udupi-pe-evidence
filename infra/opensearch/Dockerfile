FROM opensearchproject/opensearch:2.13.0

# Single-node cluster with security plugin enabled.
# OPENSEARCH_INITIAL_ADMIN_PASSWORD must be set via the Render Dashboard
# environment variables — do NOT bake it into this Dockerfile.
ENV discovery.type=single-node
ENV DISABLE_SECURITY_PLUGIN=false

# REST API and inter-node transport
EXPOSE 9200 9300

# With DISABLE_SECURITY_PLUGIN=false, OpenSearch 2.13 serves on HTTPS with a
# self-signed certificate. Use -k to accept the self-signed cert and -f to
# return non-zero on HTTP error status codes.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -sf -k https://localhost:9200/_cluster/health || exit 1
