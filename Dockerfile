FROM ubuntu:18.04

RUN apt-get update -y && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git

# Install Node.JS
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash - && \
    apt-get update -y && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nodejs

# Install dependencies first, in a different location
# for easier app bind mounting for local development
WORKDIR /

COPY package.json package-lock.json ./
RUN npm ci --production

FROM ubuntu:18.04

RUN apt-get update -y && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl

# Install Node.JS
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash - && \
    apt-get update -y && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nodejs

LABEL maintainer="Dash Developers <dev@dash.org>"
LABEL description="Test suite for Dash Platform"

# Copy NPM modules
COPY package.json package-lock.json ./
COPY --from=0 /node_modules/ /node_modules

ENV PATH /node_modules/.bin:$PATH

# Copy project files
WORKDIR /usr/src/app
COPY . ./

ARG NODE_ENV=production
ENV NODE_ENV ${NODE_ENV}

ENTRYPOINT ["/usr/src/app/bin/test.sh"]
