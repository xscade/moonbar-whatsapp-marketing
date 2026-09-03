FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_MAJOR=22

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        git \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Node.js (matches the runtime the app is developed against)
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# MongoDB Community Server (local database backing the app)
RUN curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
      | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor \
    && echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
      > /etc/apt/sources.list.d/mongodb-org-8.0.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends mongodb-org \
    && rm -rf /var/lib/apt/lists/*

# Writable locations for the local MongoDB instance, owned by the agent user
RUN mkdir -p /data/db /var/log/mongodb \
    && chown -R ubuntu:ubuntu /data/db /var/log/mongodb

USER ubuntu
