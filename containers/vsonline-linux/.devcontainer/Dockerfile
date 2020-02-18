#-------------------------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See https://go.microsoft.com/fwlink/?linkid=2090316 for license information.
#-------------------------------------------------------------------------------------------------------------
FROM buildpack-deps:stretch@sha256:d095aae2ecefdc786823e02b2cb0abc62b432202a49abd716c12cce37aee702b as builddeps
FROM mcr.microsoft.com/oryx/build:20200114.13 as kitchensink

# Copy back python into the Oryx image from builddeps.
COPY --from=builddeps /usr/bin/py* /usr/bin/

# Install debugger for developer
ARG DeveloperBuild
RUN if [ -z $DeveloperBuild]; \
        then \
        echo "not including debugger" ; \
        else \
        apt-get -yq update \
        && apt-get install -y --no-install-recommends unzip \
        && rm -rf /var/lib/apt/lists/* \
        && curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l /vsdbg ; \
    fi

# Install packages
# We remove 'imagemagick imagemagick-6-common' due to http://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2019-10131
RUN apt-get update -yq && apt-get install -yq default-jdk vim sudo xtail fish zsh \
        && apt-get purge -y imagemagick imagemagick-6-common \
        && apt-get autoremove -y && apt-get clean -y \
        && rm -rf /var/lib/apt/lists/*

# Install Live Share dependencies
RUN curl -sSL https://aka.ms/vsls-linux-prereq-script | bash -s

# Install Git LFS
RUN curl -s https://packagecloud.io/install/repositories/github/git-lfs/script.deb.sh | bash
RUN apt-get install -y git-lfs && git lfs install

# Install PowerShell
RUN apt-get update && apt-get install -y curl gnupg apt-transport-https
RUN curl -s https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
RUN sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/microsoft-debian-stretch-prod stretch main" > /etc/apt/sources.list.d/microsoft.list'
RUN apt-get update && apt-get install -y powershell

# Install Azure CLI
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

#RUN git config --system --add credential.helper '/.vsonline/bin/vso gitCredential'

ENV ORYX_ENV_TYPE=vsonline-present

# Set npm global directory for the current Node.js version to a user-writable location. It is also added to PATH below.
RUN npm config -g set prefix /home/vsonline/.npm-global

ARG BASH_PROMPT="PS1='\[\e]0;\u: \w\a\]\[\033[01;32m\]\u\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '"
ARG FISH_PROMPT="function fish_prompt\n    set_color green\n    echo -n (whoami)\n    set_color normal\n    echo -n \":\"\n    set_color blue\n    echo -n (pwd)\n    set_color normal\n    echo -n \"> \"\nend\n"
ARG ZSH_PROMPT="autoload -Uz promptinit\npromptinit\nprompt adam2"

# Define extra paths:
# Language executables provided by Oryx -  see https://github.com/microsoft/Oryx/blob/master/images/build/slim.Dockerfile#L223
ARG EXTRA_PATHS="/opt/oryx:/opt/nodejs/lts/bin:/opt/python/latest/bin:/opt/yarn/stable/bin"
ARG EXTRA_PATHS_OVERRIDES="~/.dotnet"
# ~/.local/bin - For 'pip install --user'
# ~/.npm-global/bin - For npm global bin directory in user directory
ARG USER_EXTRA_PATHS="${EXTRA_PATHS}:~/.local/bin:~/.npm-global/bin"

RUN { echo && echo "PATH=${EXTRA_PATHS_OVERRIDES}:\$PATH:${USER_EXTRA_PATHS}" ; } | tee -a /etc/bash.bashrc >> /etc/skel/.bashrc
RUN { echo && echo $BASH_PROMPT ; } | tee -a /etc/bash.bashrc >> /etc/skel/.bashrc
RUN printf "$FISH_PROMPT" >> /etc/fish/conf.d/fish_prompt.fish
RUN { echo && echo $ZSH_PROMPT ; } >> /etc/zsh/zshrc >> /etc/skel/.zshrc

RUN useradd --create-home --shell /bin/bash vsonline && \
        mkdir -p /etc/sudoers.d && \
        echo "vsonline ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/nopasswd && \
        echo "Defaults secure_path=\"/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bin:${EXTRA_PATHS}\"" >> /etc/sudoers.d/securepath

USER vsonline

# Create a directory to store VSOnline transaction data.
RUN mkdir /home/vsonline/.vsonline

# Default to bash shell (other shells available at /usr/bin/fish and /usr/bin/zsh)
ENV SHELL=/bin/bash

# .NET Core #
# Hack to get dotnet core sdks in the right place
# Oryx images do not put dotnet on the path because it will break AppService.
# The following script will put the dotnet's at /home/vsonline/.dotnet folder where dotnet will look by default.
ADD symlinkDotNetCore.sh /home/vsonline/symlinkDotNetCore.sh
RUN sudo chmod +x /home/vsonline/symlinkDotNetCore.sh 
RUN bash -c /home/vsonline/symlinkDotNetCore.sh
RUN rm /home/vsonline/symlinkDotNetCore.sh

# Node.js #
# Install nvm (popular Node.js version-management tool)
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.1/install.sh | bash
RUN rm -rf /home/vsonline/.nvm/.git
# Install nvs (alternate cross-platform Node.js version-management tool)
ARG NVS_HOME="/home/vsonline/.nvs"
RUN git clone -b v1.5.4 -c advice.detachedHead=false --depth 1 https://github.com/jasongin/nvs ${NVS_HOME}
RUN /bin/bash ${NVS_HOME}/nvs.sh install
RUN rm -rf ${NVS_HOME}/.git
# Clear the nvs cache and link to an existing node binary to reduce the size of the image.
RUN rm ${NVS_HOME}/cache/*
RUN ln -s /opt/nodejs/10.17.0/bin/node ${NVS_HOME}/cache/node
RUN sed -i "s/node\/[0-9.]\+/node\/10.17.0/" ${NVS_HOME}/defaults.json

# Clean up
RUN sudo apt-get autoremove -y \
    && sudo apt-get clean -y

#CMD ["/.vsonline/bin/vso", "bootstrap"]