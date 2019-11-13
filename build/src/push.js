/*--------------------------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See https://go.microsoft.com/fwlink/?linkid=2090316 for license information.
 *-------------------------------------------------------------------------------------------------------------*/

const os = require('os');
const path = require('path');
const jsonc = require('jsonc').jsonc;
const utils = require('./utils');
const stub = require('./stub');

async function push(release, updateLatest, registry, registryPath, stubRegistry, stubRegistryPath, definitionId) {
    stubRegistry = stubRegistry || registry;
    stubRegistryPath = stubRegistryPath || registryPath;

    const version = utils.getVersionFromRelease(release);
    const stagingFolder = path.join(os.tmpdir(), 'vscode-dev-containers', version);
    console.log(`(*) Copying files to ${stagingFolder}\n`);
    await utils.rimraf(stagingFolder); // Clean out folder if it exists
    await utils.mkdirp(stagingFolder); // Create the folder
    await utils.copyFiles(
        path.resolve(__dirname, '..', '..'),
        utils.getConfig('filesToStage'),
        stagingFolder);

    const definitionStagingFolder = path.join(stagingFolder, 'containers');
    const allDefinitions = definitionId ? [definitionId] : await utils.readdir(definitionStagingFolder);
    const definitionsToSkip = definitionId ? [] : utils.getConfig('definitionsToSkip', []);
    const definitionsToPush = definitionId ? [definitionId] : utils.getConfig('definitionsToPush', allDefinitions.slice(0));
    for (let i = 0; i < allDefinitions.length; i++) {
        const currentDefinitionId = allDefinitions[i];
        await annotateDevContainerJson(path.join(definitionStagingFolder, currentDefinitionId), currentDefinitionId, release);
        if(definitionsToSkip.indexOf(currentDefinitionId) < 0 && definitionsToPush.indexOf(currentDefinitionId) >= 0) {
            console.log(`\n**** Pushing ${currentDefinitionId} ${release} ****`);
            await pushImage(path.join(definitionStagingFolder, currentDefinitionId), currentDefinitionId, release, updateLatest, registry, registryPath, stubRegistry, stubRegistryPath);
        }
    }

    return stagingFolder;
}

async function pushImage(definitionPath, definitionId, release, updateLatest, registry, registryPath, stubRegistry, stubRegistryPath) {
    const dotDevContainerPath = path.join(definitionPath, '.devcontainer');
    // Use base.Dockerfile for image build if found, otherwise use Dockerfile
    const baseDockerFileExists = await utils.exists(path.join(dotDevContainerPath, 'base.Dockerfile'));
    const dockerFilePath = path.join(dotDevContainerPath, `${baseDockerFileExists ? 'base.' : ''}Dockerfile`);

    // Make sure there's a Dockerfile present
    if (!await utils.exists(dockerFilePath)) {
        throw `Invalid path ${dockerFilePath}`;
    }

    // Determine tags to use
    const versionTags = utils.getTagList(definitionId, release, updateLatest, registry, registryPath)
    console.log(`(*) Tags:${versionTags.reduce((prev, current) => prev += `\n     ${current}`, '')}`);

    // Look for context in devcontainer.json and use it to build the Dockerfile
    console.log('(*) Reading devcontainer.json...');
    const devContainerJsonPath = path.join(dotDevContainerPath, 'devcontainer.json');
    const devContainerJsonRaw = await utils.readFile(devContainerJsonPath);
    const devContainerJson = jsonc.parse(devContainerJsonRaw);

    // Build
    console.log(`(*) Building image...`);
    const workingDir = path.resolve(dotDevContainerPath, devContainerJson.context || '.')
    const buildParams = versionTags.reduce((prev, current) => prev.concat(['-t', current]), []);
    const spawnOpts = { stdio: 'inherit', cwd: workingDir, shell: true };
    await utils.spawn('docker', ['build', workingDir, '-f', dockerFilePath].concat(buildParams), spawnOpts);

    // Push
    console.log(`(*) Pushing ${definitionId}...`);
    for (let i = 0; i < versionTags.length; i++) {
        await utils.spawn('docker', ['push', versionTags[i]], spawnOpts);
    }

    // If base.Dockerfile found, update stub/devcontainer.json, otherwise create
    if (baseDockerFileExists) {
        await stub.updateStub(dotDevContainerPath, definitionId, release, baseDockerFileExists, stubRegistry, stubRegistryPath);
        console.log('(*) Updating devcontainer.json...');
        await utils.writeFile(devContainerJsonPath, devContainerJsonRaw.replace('"base.Dockerfile"', '"Dockerfile"'));
        console.log('(*) Removing base.Dockerfile...');
        await utils.rimraf(dockerFilePath);
    } else {
        await stub.createStub(dotDevContainerPath, definitionId, release, baseDockerFileExists, stubRegistry, stubRegistryPath);
    }    

    console.log('(*) Done!\n');
}

async function annotateDevContainerJson(definitionPath, definitionId, release) {
    // Look for context in devcontainer.json and use it to build the Dockerfile
    console.log(`(*) Annotating devcontainer.json for ${definitionId}...`);
    const dotDevContainerPath = path.join(definitionPath, '.devcontainer');
    const devContainerJsonPath = path.join(dotDevContainerPath, 'devcontainer.json');
    const devContainerJsonRaw = await utils.readFile(devContainerJsonPath);
    const devContainerJsonModified =
        `// ${utils.getConfig('devContainerJsonPreamble')}\n// ${utils.getConfig('vscodeDevContainersRepo')}/tree/${release}/${utils.getConfig('containersPathInRepo')}/${definitionId}\n` +
        devContainerJsonRaw;
    await utils.writeFile(devContainerJsonPath, devContainerJsonModified);
}

module.exports = {
    push: push
}
