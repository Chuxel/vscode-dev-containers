/*--------------------------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See https://go.microsoft.com/fwlink/?linkid=2090316 for license information.
 *-------------------------------------------------------------------------------------------------------------*/

const fs = require('fs');
const rimrafCb = require('rimraf');
const mkdirpCb = require('mkdirp');
const copyFilesCb = require('copyfiles');
const spawnCb = require('child_process').spawn;
const config = require('../config.json');

/** Async file, spawn, and cp functions **/

function getConfig(property, defaultVal) {
    defaultVal = defaultVal || null;
    // Generate env var name from property - camelCase to CAMEL_CASE
    const envVar = property.split('').reduce((prev, next) => {
        if (next >= 'A' && next <= 'Z') {
            return prev + '_' + next;
        } else {
            return prev + next.toLocaleUpperCase();
        }
    }, '');

    return process.env[envVar] || config[property] || defaultVal;
}

function getBaseTag(definitionId, registry, registryPath) {
    registry = registry || getConfig('containerRegistry', 'docker.io');
    registryPath = registryPath || getConfig('registryUser');
    return `${registry}/${registryPath}/${definitionId}`;
}

module.exports = {
    spawn: async function (command, args, opts) {
        opts = opts || { stdio: 'inherit', shell: true };
        return new Promise((resolve, reject) => {
            const proc = spawnCb(command, args, opts);
            proc.on('close', (code, signal) => {
                if (code !== 0) {
                    reject(`Non-zero exit code: ${code} ${signal || ''}`);
                    return;
                }
                resolve();
            });
            proc.on('error', (err) => {
                reject(err)
            });
        });
    },

    rename: async function (from, to) {
        return new Promise((resolve, reject) => {
            fs.rename(from, to, (err) => err ? reject(err) : resolve());
        });
    },

    readFile: async function (filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (err, data) => err ? reject(err) : resolve(data.toString()));
        });
    },

    writeFile: async function (filePath, data) {
        return new Promise((resolve, reject) => {
            fs.writeFile(filePath, data, 'utf8', (err) => err ? reject(err) : resolve(filePath));
        });
    },

    mkdirp: async function (pathToMake) {
        return new Promise((resolve, reject) => {
            mkdirpCb(pathToMake, (err, made) => err ? reject(err) : resolve(made));
        });
    },

    rimraf: async function (pathToRemove, opts) {
        opts = opts || {};
        return new Promise((resolve, reject) => {
            rimrafCb(pathToRemove, opts, (err) => err ? reject(err) : resolve(pathToRemove));
        });
    },

    copyFiles: async function (source, blobs, target) {
        return new Promise((resolve, reject) => {
            process.chdir(source);
            copyFilesCb(
                blobs.concat(target),
                { all: true },
                (err) => err ? reject(err) : resolve(target));
        });
    },

    readdir: async function (dirPath, opts) {
        opts = opts || {};
        return new Promise((resolve, reject) => {
            fs.readdir(dirPath, opts, (err, files) => err ? reject(err) : resolve(files));
        });
    },

    exists: function (filePath) {
        return fs.existsSync(filePath);
    },

    getTagList: function(definitionId, version, updateLatest, registry, registryPath) {
        const versionParts = version.split('.');
        if (versionParts.length !== 3) {
            throw(`Invalid version format in ${version}.`);    
        }

        const baseTag = getBaseTag(definitionId, registry, registryPath);
        return updateLatest ?
            [
                `${baseTag}:${versionParts[0]}`,
                `${baseTag}:${versionParts[0]}.${versionParts[1]}`,
                `${baseTag}:${version}`,
                `${baseTag}:latest`
            ] :
            [  
                `${baseTag}:${versionParts[0]}.${versionParts[1]}`,
                `${baseTag}:${version}`
            ];
    },

    majorMinorFromRelease: function(release) {
        const version = (release === 'master' ? 
            'latest' :
            (release.charAt(0) === 'v' ? release.substr(1) : release));
        const versionParts = version.split('.');
        return `${versionParts[0]}.${versionParts[1]}`;
    },

    getBaseTag: getBaseTag,

    getConfig: getConfig
};
