# Dockerfile for running Shamela Windows application
FROM scottyhardy/docker-wine:stable-8.0.2

# Install dependencies
USER root
RUN apt-get update && apt-get install -y \
    p7zip-full \
    sqlite3 \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Create work directory
WORKDIR /shamela

# Set up wine prefix
USER wineuser
RUN winecfg

# Copy the mounted ISO contents will be available at /shamela/iso
# Extracted databases will be written to /shamela/output

CMD ["/bin/bash"]
