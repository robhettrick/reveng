FROM node:24

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest

# Dev tools
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  zsh \
  fzf \
  neovim \
  jq \
  procps \
  sudo \
  less \
  man-db \
  unzip \
  zip \
  curl \
  bat \
  ripgrep \
  btop \
  gnupg2 \
  gh \
  chromium \
  fonts-liberation \
  && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && ln -s /usr/bin/batcat /usr/local/bin/bat

# git-delta
ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) \
  && wget -q "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" \
  && dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" \
  && rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Passwordless sudo for node user
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
  && chmod 0440 /etc/sudoers.d/node

# Locale
RUN apt-get update && apt-get install -y --no-install-recommends locales \
  && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
  && locale-gen
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# Directories and permissions
RUN mkdir -p /workspace /home/node/.claude /commandhistory /usr/local/share/npm-global \
  && chown -R node:node /workspace /home/node/.claude /commandhistory /usr/local/share/npm-global

# Shell history persistence
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && touch /commandhistory/.bash_history \
  && chown -R node /commandhistory

ENV DEVCONTAINER=true
ENV SHELL=/bin/zsh

WORKDIR /workspace

# Switch to non-root user
USER node

# Global npm packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# zsh with powerlevel10k
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Claude Code
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# mermaid-cli, for the validate-mermaid skill. Uses the distro chromium rather
# than letting puppeteer download its own (no arm64 build for some versions,
# and it would duplicate ~150MB). Both env vars are needed at runtime too, so
# they are set as ENV rather than only for the install.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ARG MERMAID_CLI_VERSION=11.16.0
RUN npm install -g "@mermaid-js/mermaid-cli@${MERMAID_CLI_VERSION}"

# Chromium cannot use its own sandbox inside the container, so mmdc needs a
# puppeteer config passed with -p (there is no env var for this). The container
# is already the isolation boundary. Shadow mmdc on PATH with a wrapper that
# supplies the config, so `mmdc ...` just works and the skill needs no special
# knowledge. /usr/local/bin precedes the npm global bin dir on PATH.
# --disable-dev-shm-usage matters here: Docker gives a container 64MB of
# /dev/shm by default, which headless Chromium exhausts mid-render on larger
# diagrams and dies. The flag makes it write shared memory to /tmp instead.
RUN printf '{\n  "args": ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]\n}\n' \
  > /home/node/.puppeteer.json \
  && printf '#!/bin/sh\nexec /usr/local/share/npm-global/bin/mmdc -p /home/node/.puppeteer.json "$@"\n' \
  | sudo tee /usr/local/bin/mmdc >/dev/null \
  && sudo chmod +x /usr/local/bin/mmdc
