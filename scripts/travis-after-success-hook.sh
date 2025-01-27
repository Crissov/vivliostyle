#!/bin/bash
set -eo pipefail

DEBUG_HOOK=false

function setup-git() {
    echo "===> Configuring credentials"
    git config user.email "travis@travis-ci.org"
    git config user.name "Travis CI"
    echo -e "$GITHUB_DEPLOY_KEY" | base64 -d > ~/.ssh/deploy.key
    echo -e "$GITHUB_DEPLOY_KEY_VIVLIOSTYLE_ORG" | base64 -d > ~/.ssh/deploy-vivliostyle-org.key
    echo -e "$GITHUB_DEPLOY_KEY_VIVLIOSTYLE_GITHUB_IO" | base64 -d > ~/.ssh/deploy-vivliostyle-github-io.key
    chmod 600 ~/.ssh/deploy.key
    chmod 600 ~/.ssh/deploy-vivliostyle-org.key
    chmod 600 ~/.ssh/deploy-vivliostyle-github-io.key
    echo -e "Host github.com\n\tStrictHostKeyChecking no\nHostName github.com\nIdentityFile ~/.ssh/deploy.key\n" >> ~/.ssh/config
    echo -e "Host github-vivliostyle-org\n\tStrictHostKeyChecking no\nHostName github.com\nIdentityFile ~/.ssh/deploy-vivliostyle-org.key\n" >> ~/.ssh/config
    echo -e "Host github-vivliostyle-github-io\n\tStrictHostKeyChecking no\nHostName github.com\nIdentityFile ~/.ssh/deploy-vivliostyle-github-io.key\n" >> ~/.ssh/config
}

function build-archive() {
    echo "===> Generating Viewer Archive"
    archiveDir=${1:-vivliostyle-latest}
    archiveName=${2:-vivliostyle.zip}
    echo "Generating ${archiveName} from ${archiveDir}"

    mkdir ${archiveDir}
    cp    ./CHANGELOG.md ${archiveDir}/

    mkdir ${archiveDir}/viewer/
    cp -R ./packages/viewer/lib/* ${archiveDir}/viewer/
    cp -R ./scripts/package-artifacts/* ${archiveDir}/

    zip -qr ${archiveName} ${archiveDir}
    rm -rf ${archiveDir}
}

function inject-env-var() {
    if [ ${TRAVIS_PULL_REQUEST} = "false" ] && ( [[ ${TRAVIS_BRANCH} = "master" ]] || [[ ${TRAVIS_TAG} != "" ]] ); then
        CANARY_RELEASE=true
    else
        CANARY_RELEASE=false
    fi
    if [ ${TRAVIS_PULL_REQUEST} = "false" ] && [[ ${TRAVIS_TAG} =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._]+)?$ ]]; then
        TAGGED_RELEASE=true
    else
        TAGGED_RELEASE=false
    fi
    if [[ ${TRAVIS_TAG} =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        STABLE_RELEASE=true
    else
        STABLE_RELEASE=false
    fi
    if [[ ${TRAVIS_TAG} =~ ^v[0-9]+\.[0-9]+\.[0-9]+-[a-zA-Z0-9._]+$ ]]; then
        PRE_RELEASE=true
    else
        PRE_RELEASE=false
    fi
    ARCHIVE_DIR="vivliostyle"
    ARCHIVE_PATH="vivliostyle.zip"
    VIEWER_ARTIFACTS=packages/viewer/lib/*
    VERSION=$(echo ${TRAVIS_TAG} | sed 's/^v\(.*\)/\1/')
}

# for DEBUG
if [[ $DEBUG_HOOK = true ]]; then
    TRAVIS_PULL_REQUEST=false
    TRAVIS_BRANCH=v2.0.0-pre
    TRAVIS_TAG=v2.0.0-pre
fi
inject-env-var

echo "===> DEBUG_HOOK=${DEBUG_HOOK}"
echo "===> BUILD_PACKAGE=${BUILD_PACKAGE}"
echo "===> TAGGED_RELEASE=${TAGGED_RELEASE}"
echo "===> STABLE_RELEASE=${STABLE_RELEASE}"
echo "===> PRE_RELEASE=${PRE_RELEASE}"
echo "===> ARCHIVE_DIR=${ARCHIVE_DIR}"
echo "===> ARCHIVE_PATH=${ARCHIVE_PATH}"
echo "===> VIEWER_ARTIFACTS=${VIEWER_ARTIFACTS}"
echo "===> VERSION=${VERSION}"

if [[ $CANARY_RELEASE = true ]] || [[ $TAGGED_RELEASE = true ]]; then
    [[ $DEBUG_HOOK = false ]] && setup-git
    build-archive "${ARCHIVE_DIR}" "${ARCHIVE_PATH}"
fi

if [[ $CANARY_RELEASE = true ]]; then
    # Canary
    echo "===> Cloning gh-pages"
    git clone -q --depth=1 --branch=gh-pages git@github.com:vivliostyle/vivliostyle.git gh-pages
    echo "===> Copying viewer to gh-pages/viewer"
    CANARY_VIEWER_ROOT="gh-pages/viewer"
    mkdir -p "${CANARY_VIEWER_ROOT}"
    cp -R ${VIEWER_ARTIFACTS} "gh-pages/viewer/"
    cp -R "${ARCHIVE_PATH}" "gh-pages/downloads/vivliostyle-canary.zip"
    echo "===> Pushing changes to gh-pages"
    cd gh-pages
    git add .
    git status
    git commit -m "Update Vivliostyle Canary (original commit: $TRAVIS_COMMIT)"
    [[ $DEBUG_HOOK = false ]] && git push origin gh-pages
    cd ..
elif [[ $TAGGED_RELEASE = true ]]; then
    # if stable or pre-release tag push

    # publish to npm
    echo "===> Publishing packages in npm"
    [[ $DEBUG_HOOK = false ]] && echo "//registry.npmjs.org/:_authToken=${NPM_AUTH_TOKEN}" > ~/.npmrc
    if [[ $STABLE_RELEASE = true ]]; then
        [[ $DEBUG_HOOK = false ]] && yarn ship --yes
    else
        [[ $DEBUG_HOOK = false ]] && yarn ship:prerelease --yes
    fi
    
    # GitHub releases
    echo "===> Creating GitHub Release"
    npm i -g conventional-changelog-cli github-release-cli
    CHANGELOG=$(conventional-changelog -p angular)
    echo "===> CHANGELOG=${CHANGELOG}"
    TAGGED_ARCHIVE="vivliostyle-${VERSION}.zip"
    cp ${ARCHIVE_PATH} ${TAGGED_ARCHIVE}
    if [[ $STABLE_RELEASE = true ]]; then
        [[ $DEBUG_HOOK = false ]] && github-release upload \
            --token "${GH_TOKEN}" \
            --owner vivliostyle \
            --repo vivliostyle \
            --tag "${TRAVIS_TAG}" \
            --name "${TRAVIS_TAG}" \
            --body "${CHANGELOG}" \
            "${TAGGED_ARCHIVE}"
    else
        [[ $DEBUG_HOOK = false ]] && github-release upload \
            --token "${GH_TOKEN}" \
            --owner vivliostyle \
            --repo vivliostyle \
            --tag "${TRAVIS_TAG}" \
            --name "${TRAVIS_TAG}" \
            --body "${CHANGELOG}" \
            --prerelease \
            "${TAGGED_ARCHIVE}"
    fi

    # Tagged Viewer
    echo "===> Cloning vivliostyle.github.io"
    if [[ $DEBUG_HOOK = true ]]; then
        VIVLIOSTYLE_GITHUB_IO_GIT_HOST=github.com
    else
        VIVLIOSTYLE_GITHUB_IO_GIT_HOST=github-vivliostyle-github-io
    fi
    git clone -q --depth=1 --branch=master git@${VIVLIOSTYLE_GITHUB_IO_GIT_HOST}:vivliostyle/vivliostyle.github.io.git vivliostyle.github.io
    echo "===> Copying viewer to vivliostyle.github.io/viewer/${TRAVIS_TAG}"
    mkdir -p vivliostyle.github.io/viewer/${TRAVIS_TAG}
    cp -R ${VIEWER_ARTIFACTS} vivliostyle.github.io/viewer/${TRAVIS_TAG}/
    echo "${TRAVIS_TAG},${VERSION}" >> vivliostyle.github.io/_data/releases.csv
    echo "===> Pushing changes to vivliostyle.github.io"
    cd vivliostyle.github.io
    git add .
    git status
    git commit -m "Update Vivliostyle Pre-release (original commit: $TRAVIS_COMMIT)"
    [[ $DEBUG_HOOK = false ]] && git push origin master
    cd ..

    if [[ $STABLE_RELEASE = true ]]; then
        # Stable Viewer
        echo "===> Copying viewer to vivliostyle.org/viewer"
        if [[ $DEBUG_HOOK = true ]]; then
            VIVLIOSTYLE_ORG_GIT_HOST=github.com
        else
            VIVLIOSTYLE_ORG_GIT_HOST=github-vivliostyle-org
        fi
        git clone -q --depth=1 --branch=master git@${VIVLIOSTYLE_ORG_GIT_HOST}:vivliostyle/vivliostyle.org.git vivliostyle.org
        mkdir -p vivliostyle.org/viewer
        cp -R ${VIEWER_ARTIFACTS} vivliostyle.org/viewer/
        cp -R ${ARCHIVE_PATH} vivliostyle.org/downloads/vivliostyle-latest.zip
        echo "===> Pushing changes to vivliostyle.org"
        cd vivliostyle.org
        git add .
        git status
        git commit -m "Update Vivliostyle Latest release (original commit: $TRAVIS_COMMIT)"
        [[ $DEBUG_HOOK = false ]] && git push origin master
        cd ..
    fi
fi

if [[ $CANARY_RELEASE = true ]] || [[ $TAGGED_RELEASE = true ]]; then
    echo "===> Cleaning up"
    rm -rf vivliostyle.github.io vivliostyle.org gh-pages
fi
