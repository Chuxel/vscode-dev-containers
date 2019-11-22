/*--------------------------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See https://go.microsoft.com/fwlink/?linkid=2090316 for license information.
 *-------------------------------------------------------------------------------------------------------------*/

const path = require('path');
const push = require('./push').push;
const asyncUtils = require('./utils/async');
const configUtils = require('./utils/config');
const packageJson = require('../../package.json');

async function package(repo, release, updateLatest, registry, registryPath, stubRegistry, stubRegistryPath, simulate) {
    stubRegistry = stubRegistry || registry;
    stubRegistryPath = stubRegistryPath || registryPath;

    // First, push images, update content
    const stagingFolder = await push(repo, release, updateLatest, registry, registryPath, stubRegistry, stubRegistryPath, simulate);

    // Then package
    console.log(`\n(*) **** Package ${release} ****`);

    console.log(`(*) Updating package.json with release version...`);
    const version = configUtils.getVersionFromRelease(release);
    const packageJsonVersion = version === 'dev' ? packageJson.version + '-dev' : version;
    const packageJsonPath = path.join(stagingFolder, 'package.json');
    const packageJsonRaw = await asyncUtils.readFile(packageJsonPath);
    const packageJsonModified = packageJsonRaw.replace(/"version".?:.?".+"/, `"version": "${packageJsonVersion}"`);
    await asyncUtils.writeFile(packageJsonPath, packageJsonModified);

    console.log('(*) Packaging...');
    const opts = { stdio: 'inherit', cwd: stagingFolder, shell: true };
    await asyncUtils.spawn('yarn', ['install'], opts);
    await asyncUtils.spawn('npm', ['pack'], opts); // Need to use npm due to https://github.com/yarnpkg/yarn/issues/685

    let outputPath = null;
    if (simulate) {
        console.log('(*) Simulating: Skipping package move.');
    } else {
        console.log('(*) Moving package...');
        // Output filename should use the release vX.X.X like yarn rather than just version like npm
        // since release tag includes the "v" and this is what is easily available during CI.
        outputPath = path.join(__dirname, '..', '..', `${packageJson.name}-v${packageJsonVersion}.tgz`);
        await asyncUtils.rename(path.join(stagingFolder, `${packageJson.name}-${packageJsonVersion}.tgz`), outputPath);
    }

    // And finally clean up
    console.log('(*) Cleaning up...');
    await asyncUtils.rimraf(stagingFolder);

    console.log('(*) Done!!');

    return outputPath;
}

module.exports = {
    package: package
}