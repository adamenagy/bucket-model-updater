'use strict'; // http://www.w3schools.com/js/js_strict.asp

// token handling in session
var token = require('./token');
var fs = require('fs');
var path = require('path');

// web framework
var express = require('express');
var router = express.Router();

var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
const request = require('request');
const requestPromise = require('request-promise');


var utils = require('./utils');

var forgeSDK = require('forge-apis');

const crypto = require('crypto');

const uuidv4 = require('uuid/v4');

const vars = {
    "appName": "BucketModelUpdater",
    "appVersion": "1.0.0",
    "appDescription": "A sample app to update Inventor models using Design Automation API",
    "alias": "prod",
    "engine": "Autodesk.Inventor+2025",
    "extractUserParams": "ExtractUserParams",
    "getZipContents": "GetZipContents",
    "updateModel": "UpdateModel",  
}

function getDaResourceName(name, isAliasAdded) {
    // e.g. BucketModelUpdater_GetZipContents+prod
    let ret = `${vars.appName}_${name}`;
    if (isAliasAdded) {
        ret += `+${vars.alias}`;
    }
    return ret;
}

async function daRequest(req, path, method, headers, body) {
    headers = headers || {};
    if (!headers['Authorization']) {
        var tokenSession = new token(req.session);
        var credentials = tokenSession.getCredentials();

        headers['Authorization'] = 'Bearer ' + credentials.access_token;
        headers['content-type'] = 'application/json';
    }

    let url = 'https://developer.api.autodesk.com/da/us-east/v3/' + path;
    let options = {
        uri: url,
        method: method,
        headers: headers,
        json: true
    };

    if (body) {
        options.body = body;
    }
    
    let data = [];
    while (true) {
        let response = null;
        
        try {
            response = await requestPromise(options);
        } catch (error) {
            console.log(error);
        }
    
        if (!response || !response.paginationToken) {
            if (data.length > 0) {
                response.data = [...response.data, ...data];
            }

            return response;
        } else {
            options.uri = url + "?page=" + response.paginationToken;
            data = [...data, ...response.data];
        }
    } 
    
}

function getUrn(bucketKey, objectName) {
    return `urn:adsk.objects:os.object:${bucketKey}/${objectName}`;
}

/////////////////////////////////////////////////////////////////
// Items (AppBundles and Activities)
/////////////////////////////////////////////////////////////////

function getNameParts(name) {
    var parts1 = name.split('.');
    var parts2 = parts1[1].split('+');

    return [parts1[0], parts2[0], parts2[1]];
}

function getFullName(nickName, name, alias) {
    return `${nickName}.${name}+${alias}`;
}

async function getItems(req, type, isPersonal) {
    let response = await daRequest(req, type, 'GET');
    let nickname = await daRequest(req, 'forgeapps/me', 'GET');
    let items = [];

    response.data.forEach((item, index) => {
        if (!item.startsWith(nickname) ^ isPersonal) {
            // Show only personal items
            let nameParts = getNameParts(item);
            if (!includesItem(items, nameParts[1])) {
                items.push({
                    id: nameParts[1],
                    nickName: nameParts[0],
                    alias: nameParts[2],
                    children: isPersonal
                });
            }
        }
    })

    return items;
}

async function getItem(req, type, id) {
    let response = await daRequest(req, `${type}/${id}`, 'GET');

    return response;
}

function readFilePromise(path) {
    return new Promise(function (resolve, reject) {
        fs.readFile(path, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    })
}

async function uploadFile(inputUrl, uploadParameters) {
    var downloadOptions = {
        uri: inputUrl,
        method: 'GET'
    }

    var uploadOptions = {
        uri: uploadParameters.endpointURL,
        method: 'POST',
        headers: {
            'Content-Type': 'multipart/form-data',
            'Cache-Control': 'no-cache'
        },
        formData: uploadParameters.formData
    }
    if (inputUrl.startsWith("http")) {
        uploadOptions.formData.file = request(downloadOptions);
    } else {
        try {
            uploadOptions.formData.file = await readFilePromise(inputUrl);
        } catch (err) {
            console.error(`Error reading file ${inputUrl}:`, err);
            throw new Error(`Failed to read file: ${inputUrl}`);
        }
    }

    await requestPromise(uploadOptions);
}

async function createItem(req, type, body) {
    let response = await daRequest(req, `${type}`, 'POST', null, body);

    // Upload the file from OSS
    if (response.uploadParameters) {
        try {
            await uploadFile(body.bundle, response.uploadParameters)
        } catch { }
    }

    return response;
}

async function deleteItem(req, type, id) {
    let response = await daRequest(req, `${type}/${id}`, 'DELETE');

    return { response: 'done' };
}

function includesItem(list, id) {
    return list.find(item => {
        if (item.id === id) {
            return true;
        }
    });
}

function setItemVersionsChildren(versions, aliases) {
    aliases.forEach(alias => {
        versions.find(version => {
            if (version.id === alias.version) {
                version.children = true;
                return true;
            }
        });
    })
}

async function getItemVersions(req, type, id) {
    let versions = [];
    let page = '';

    while (true) {
        let response = await daRequest(req, `${type}/${id}/versions?${page}`, 'GET');
        response.data.map((item) => {
            versions.push({ id: item, children: false });
        })

        if (!response.paginationToken)
            break;

        page = `page=${response.paginationToken}`;
    }

    return versions;
}

async function createItemVersion(req, type, id, body) {
    let response = await daRequest(req, `${type}/${id}/versions`, 'POST', null, body);

    // Upload the file from OSS
    if (response.uploadParameters) {
        try {
            await uploadFile(body.bundle, response.uploadParameters)
        } catch { }
    }

    return response;
}

async function deleteItemVersion(req, type, id, version) {
    let response = await daRequest(req, `${type}/${id}/versions/${version}`, 'DELETE');

    return { response: 'done' };
}

async function getItemAliases(req, type, id) {
    let aliases = [];

    while (true) {
        let response = await daRequest(req, `${type}/${id}/aliases`, 'GET');

        aliases = aliases.concat(response.data);

        if (!response.paginationToken)
            break;
    }

    return aliases;
}

function getAliasesForVersion(aliases, version) {
    let versionAliases = [];

    aliases.forEach((item, index) => {
        if (item.version === version) {
            versionAliases.push(item);
        }
    })

    return versionAliases;
}

async function createItemAlias(req, type, id, version, alias) {
    let response = await daRequest(req, `${type}/${id}/aliases`, 'POST', null, {
        "version": parseInt(version), // has to be numeric
        "id": alias
    });

    return response; 
}

async function deleteItemAlias(req, type, id, alias) {
    let response = await daRequest(req, `${type}/${id}/aliases/${alias}`, 'DELETE');

    return { response: 'done' };
}

router.get('/:type/treeNode', async function(req, res) {
    console.log('GET /:type/treeNode');
    try {
        var id = decodeURIComponent(req.query.id);
        var type = req.params.type;
        console.log(`GET /:type/treeNode, :type = ${type}, id = ${id}`);

        var folders = [
            { id: 'Personal', children: true },
            { id: 'Shared', children: true }
        ];
        var paths = id.split('/');
        var level = paths.length;

        // Levels are:
        // Root >> Personal/Shared >> Items >> Versions >> Aliases
        // Root >> Personal/Shared >> Activities >> Versions >> Aliases
        // e.g. "Personal/ChangeParams/98/prod"

        if (id === '#') {
            // # stands for ROOT
            res.json(makeTree(folders, 'folder', '', true));
        } else if (level === 1) {
            var items = await getItems(req, type, id === 'Personal');
            res.json(makeTree(items, 'item', `${id}/`));
        } else if (level === 2) {
            var appName = paths[1];
            var versions = await getItemVersions(req, type, appName);
            var aliases = await getItemAliases(req, type, appName);
            setItemVersionsChildren(versions, aliases);
            res.json(makeTree(versions, 'version', `${id}/`));
        } else if (level === 3) {
            var appName = paths[1];
            var aliases = await getItemAliases(req, type, appName);
            var versionAliases = getAliasesForVersion(aliases, parseInt(paths[2]));
            res.json(makeTree(versionAliases, 'alias', `${id}/`));
        }
    } catch (ex) {
        res.status(ex.statusCode ? ex.statusCode : 500).json({ message: (ex.message ? ex.message : ex) });
    }
});

router.get('/:type/info', async function(req, res) {
    console.log('GET /:type/info');
    try {
        var id = decodeURIComponent(req.query.id);
        var type = req.params.type;
        console.log(`GET /:type/info, :type = ${type}, id = ${id}`);

        var paths = id.split('/');
        var level = paths.length;

        if (level === 1) {
            var info = await getItem(req, type, id);
            console.log(info);
            res.json(info);
        } else if (level === 2) {
            // item
            if (paths[0] === 'Shared') {
                var nickName = req.query.nickName;
                var alias = req.query.alias;
                var fullName = getFullName(nickName, paths[1], alias);
                var info = await getItem(req, type, fullName);
                console.log(info);
                res.json(info);
            }
        } else if (level === 3) {
            // version

        } else if (level === 4) {
            // alias
            var nickName = decodeURIComponent(req.query.nickName);
            var fullName = getFullName(nickName, paths[1], paths[3]);
            var info = await getItem(req, type, fullName);
            console.log(info);
            res.json(info);
        } else {
            // Bad daRequest
            res.status(400).end();
        }
    } catch (ex) {
        res.status(ex.statusCode ? ex.statusCode : 500).json({ message: (ex.message ? ex.message : ex) });
    }
});

router.post('/:type', jsonParser, async function(req, res) {
    console.log('POST /:type');
    try {
        var id = req.body.id;
        var type = req.params.type;
        console.log(`POST /:type, :type = ${type}, id = ${id}`);

        var paths = id.split('/');
        var level = paths.length;

        if (level === 1) {
            // create item for folder
            var reply = await createItem(req, type, req.body.body);
            res.json(reply);
        } else if (level === 2) {
            // create version for item
            var reply = await createItemVersion(req, type, paths[1], req.body.body);
            res.json(reply);
        } else if (level === 3) {
            // create alias for version
            var reply = await createItemAlias(req, type, paths[1], paths[2], req.body.alias);
            res.json(reply);
        } else {
            // create workitem
            var reply = await createItem(req, type, req.body.body);
            res.json(reply);
        }
    } catch (ex) {
        console.log(ex);
        res.status(ex.statusCode ? ex.statusCode : 500).json({ message: (ex.message ? ex.message : ex) });
    }
});

router.delete('/:type/:id', async function(req, res) {
    console.log('DELETE /:type/:id');
    try {
        var id = decodeURIComponent(req.params.id);
        var type = req.params.type;
        console.log(`DELETE /:type, :type = ${type}, id = ${id}`);

        var paths = id.split('/');
        var level = paths.length;

        if (level === 1) {
            // item
            var reply = await deleteItem(req, type, paths[0]);
            res.json(reply);
        } else if (level === 2) {
            // item
            var reply = await deleteItem(req, type, paths[1]);
            res.json(reply);
        } else if (level === 3) {
            // version
            var reply = await deleteItemVersion(req, type, paths[1], paths[2]);
            res.json(reply);
        } else if (level === 4) {
            // version
            var reply = await deleteItemAlias(req, type, paths[1], paths[3]);
            res.json(reply);
        }
    } catch (ex) {
        res.status(ex.statusCode ? ex.statusCode : 500).json({ message: (ex.message ? ex.message : ex) });
    }
});

/////////////////////////////////////////////////////////////////
// WorkItems
/////////////////////////////////////////////////////////////////

router.get('/workitems/treeNode', async function(req, res) {
    console.log('GET /workitems/treeNode');
    try {
        var id = decodeURIComponent(req.query.id);
        console.log("GET /workitems/treeNode, id = " + id);

        var tokenSession = new token(req.session);
        var folders = [
            { id: 'Personal', children: true },
            { id: 'Shared', children: true }
        ];
        var paths = id.split('/');
        var level = paths.length;

        // Levels are:
        // Root >> Personal/Shared >> Bundles >> Versions >> Aliases
        // e.g. "Personal/ChangeParams/98/prod"

        if (id === '#') {
            // # stands for ROOT
            res.json(makeTree(folders, 'folder', '', true));
        } else if (level === 1) {
            var items = await getItems(req, type, id === 'Personal');
            res.json(makeTree(items, 'appbundle', `${id}/`));
        } else if (level === 2) {
            var appName = paths[1];
            var versions = await getItemVersions(req, type, appName);
            var aliases = await getItemAliases(req, appName);
            setItemVersionsChildren(versions, aliases);
            res.json(makeTree(versions, 'version', `${id}/`));
        } else {
            var appName = paths[1];
            var aliases = await getItemAliases(req, appName);
            res.json(makeTree(aliases, 'alias', `${id}/`));
        }
    } catch (ex) {
        res.status(ex.statusCode ? ex.statusCode : 500).json({ message: (ex.message ? ex.message : ex) });
    }
});

/////////////////////////////////////////////////////////////////
// Get zip contents
// This will generate a contents json file named "<file>.contents"
// e.g.: "model.iam.zip.contents"
// id - object id of the ".contents" file
/////////////////////////////////////////////////////////////////

router.get('/zipcontents/:id', async function(req, res) {
    var id = decodeURIComponent(req.params.id)
    console.log(id);
    var contentsInfo = utils.getBucketKeyObjectName(id);
    var contentsName = contentsInfo.objectName + ".contents";
    var tokenSession = new token(req.session);
    var credentials = tokenSession.getCredentials();

    // check if json file already exists and newer than the file
    // it contains info about
    var utcJson = 0;
    var utcFile = 0;
    var objects = new forgeSDK.ObjectsApi();
    try {
        console.log("Checking if json for zip file exists");
        let data = await objects.getObjectDetails(contentsInfo.bucketKey, contentsName, { "_with": "lastModifiedDate" }, tokenSession.getOAuth(), tokenSession.getCredentials())
        utcJson = data.body.lastModifiedDate;

        console.log("Getting info about the zip file");
        data = await objects.getObjectDetails(contentsInfo.bucketKey, contentsInfo.objectName, { "_with": "lastModifiedDate" }, tokenSession.getOAuth(), tokenSession.getCredentials())
        utcFile = data.body.lastModifiedDate;
    } catch (error) {
        console.log(error);
    }

    // if the json file is older than the file it has info about
    // then lets fetch the info again
    if (utcJson <= utcFile) {
        console.log("Running job to get contents of zip file into a json file...");

        // run workitem
        var clientId = tokenSession.getClientId();
        const activityId = `${clientId}.${getDaResourceName(vars.getZipContents, true)}`;
            
        var createReply = await createItem(req, "workitems", {
            "activityId": activityId, 
            "arguments": {
                "inputFile": {
                    "zip": true,
                    "verb": "get",
                    "localName": "inputFile",
                    "url": getUrn(contentsInfo.bucketKey, contentsInfo.objectName),
                    "headers": {
                        "Authorization": "Bearer " + credentials.access_token,
                        "Content-type": "application/octet-stream"
                    }
                },
                "outputFile": {
                    "verb": "put",
                    "localName": "outputFile.json",
                    "url": getUrn(contentsInfo.bucketKey, contentsName),
                    "headers": {
                        "Authorization": "Bearer " + credentials.access_token,
                        "Content-type": "application/octet-stream"
                    }
                },
                "onComplete": {
                    "ondemand": true,
                    "verb": "post",
                    "url": process.env.FORGE_ONCOMPLETE_CALLBACK,
                    "headers": {
                        "activity-id": activityId, // the user we have to pass the message to
                        "oss-id": id, // the user we have to pass the message to
                        "socket-id": req.session.socket_id // the user we have to pass the message to
                    }
                }
            }
        });

        // check status
        /*
        let getReply = { status: "pending"}
        while (getReply.status === "pending" || getReply.status === "inprogress") {
            getReply = await getItem(req, "workitems", createReply.id);
            await utils.setTimeoutPromise(1000);
        }
        console.log(getReply, getReply.reportUrl);
        */
       res.json(createReply);
    } else {
        // fetch json document
        try {
            console.log("Fetching json file with info about the zip file's content");
            let data = await objects.downloadResources(contentsInfo.bucketKey, [{ objectKey: contentsName, responseType: 'json' }], {}, null, tokenSession.getCredentials());
            res.json(data[0].data);
        } catch (error) {
            console.log(error);
            res.status(error.statusCode).end(error.statusMessage);
        }
    }
});

/////////////////////////////////////////////////////////////////
// Get model parameters
// This will generate a json file named "<file>.params"
// e.g.: "model.iam.zip.params"
// id - object id of the ".params" file
/////////////////////////////////////////////////////////////////

router.get('/params/:id', async function(req, res) {
    var id = decodeURIComponent(req.params.id)
    var projectPath = decodeURIComponent(req.query.projectPath);
    var documentPath = decodeURIComponent(req.query.documentPath);
    var paramsInfo = utils.getBucketKeyObjectName(id);
    var paramsName = paramsInfo.objectName + ".params";
    var tokenSession = new token(req.session);
    var credentials = tokenSession.getCredentials();

    // check if json file already exists and newer than the file
    // it contains info about
    var utcParam = 0;
    var utcFile = 0;
    var objects = new forgeSDK.ObjectsApi();
    try {
        console.log("Checking if json for zip file exists");
        let data = await objects.getObjectDetails(paramsInfo.bucketKey, paramsName, { "_with": "lastModifiedDate" }, tokenSession.getOAuth(), tokenSession.getCredentials())
        utcParam = data.body.lastModifiedDate;

        console.log("Getting info about the zip file");
        data = await objects.getObjectDetails(paramsInfo.bucketKey, paramsInfo.objectName, { "_with": "lastModifiedDate" }, tokenSession.getOAuth(), tokenSession.getCredentials())
        utcFile = data.body.lastModifiedDate;
    } catch (error) {
        console.log(error);
    }

    // if the json file is older than the file it has info about
    // then lets fetch the info again
    if (utcParam <= utcFile) {
        console.log("Running job to get parameters of model into a json file...");

        // run workitem
        var clientId = tokenSession.getClientId();
        const activityId = `${clientId}.${getDaResourceName(vars.extractUserParams, true)}`;

        documentPath = `"documentPath":"inputFile/${documentPath}"`;
        projectPath = (projectPath !== '') ? `, "projectPath":"inputFile/${projectPath}"` : '';
        var createReply = await createItem(req, "workitems", {
            "activityId": activityId, 
            "arguments": {
                "inputFile": {
                    "zip": true,
                    "verb": "get",
                    "localName": "inputFile",
                    "url": getUrn(paramsInfo.bucketKey, paramsInfo.objectName),
                    "headers": {
                        "Authorization": "Bearer " + credentials.access_token,
                        "Content-type": "application/octet-stream"
                    }
                },
                "inputParams": {
                    "verb": "get",
                    "localName": "inputParams.json",
                    "url": `data:application/json,{${documentPath}${projectPath}}`
                },
                "documentParams": {
                    "verb": "put",
                    "localName": "documentParams.json",
                    "url": getUrn(paramsInfo.bucketKey, paramsName),
                    "headers": {
                        "Authorization": "Bearer " + credentials.access_token,
                        "Content-type": "application/octet-stream"
                    }
                },
                "onComplete": {
                    "ondemand": true,
                    "verb": "post",
                    "url": process.env.FORGE_ONCOMPLETE_CALLBACK,
                    "headers": {
                        "activity-id": activityId, // the user we have to pass the message to,
                        "oss-id": id, // the user we have to pass the message to
                        "socket-id": req.session.socket_id // the user we have to pass the message to
                    }
                }
            }
        });

        // check status
        /*
        let getReply = { status: "pending"}
        while (getReply.status === "pending" || getReply.status === "inprogress") {
            getReply = await getItem(req, "workitems", createReply.id);
            await utils.setTimeoutPromise(1000);
        }

        if (getReply.status !== "success") {
            console.log(getReply.reportUrl);
            res.status(500).end(getReply.status);
            return;
        }
        */
      
       res.json(createReply);
    } else {
        // fetch json document
        try {
            console.log("Fetching json file with info about the parameters in the model");
            let data = await objects.downloadResources(paramsInfo.bucketKey, [{ objectKey: paramsName, responseType: 'json' }], {}, null, tokenSession.getCredentials());
            res.json(data[0].data);
        } catch (error) {
            res.status(error.statusCode).end(error.statusMessage);
        }
    }
});

/////////////////////////////////////////////////////////////////
// Update model parameters and get viewable
// This will generate a json file named "<file>.viewables.<hash>"
// e.g.: "model.iam.zip.viewables.asdad56756wyuytdsa"
// The hash is generated from the list or parameters and values
// that have been changed from the original model
// This file will contain the name of the OSS bucket that will store
// all the viewables for the given configuration
// Bucket name: "<client id lower case>_guid"
// The name of the bucket is saved in 
// the "<file>.viewables.<hash>" file
/////////////////////////////////////////////////////////////////

function getHash(text) {
    return crypto.createHash('md5').update(text).digest("hex");
}

function getGuid() {
    return uuidv4();
}

// The incoming message will be something like:
// {"permissions":"write","files":["textfile1.txt","textfile2.txt"]} 
// We have to return something like:
// { 
//   "textfile1.txt": "https://developer.api.autodesk.com/oss/v2/signedresources/a5ab33f3-8308-4458-8393-7c633f492c9c?region=US",
//   "textfile2.txt": "https://developer.api.autodesk.com/oss/v2/signedresources/31ad4c55-1b41-40e0-a8ca-ddb02dde8545?region=US"
// }
// The files will have names already URL encoded because of Windows restrictions on file names, 
// so no need to do encode() on them
router.post('/svf/callback', jsonParser, async function(req, res) {
    try {
        console.log("/svf/callback");
        console.log(req.body);

        let bucketKey = req.headers["viewables-bucket-key"];
        let urls = {};
        for (let fileNameEncoded of req.body.files) {
            let options = {
                uri: `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${fileNameEncoded}/signed?access=write&useCdn=true`,
                method: "post",
                headers: {
                    "Content-Type": "application/json;charset=UTF-8",
                    "Authorization": req.headers["authorization"]
                },
                body: {
                    "minutesExpiration" : 45,
                    "singleUse" : true
                },
                json: true
            };
            
            let response = await requestPromise(options);
            urls[fileNameEncoded] = response.signedUrl;
        }

        console.log("Returning URLS: ", urls);
        res.json(urls);
    } catch (error) {
        console.log(error);
        res.json({ status: "failed", message: error.message });
    }
});

async function getInfoFile(bucketKey, objectName, authorization) {
    let options = {
        uri: `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectName)}`,
        method: "get",
        headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Authorization": authorization
        },
        json: true
    };
    let viewablesInfo = await requestPromise(options);
    console.log("getInfoFile: ", viewablesInfo);

    return viewablesInfo;
}

async function updateInfoFile(bucketKey, objectName, authorization, data) {
    console.log("updateInfoFile: ", data);
    let viewablesInfo = {};
    try {
        viewablesInfo = await getInfoFile(bucketKey, objectName, authorization);

        for (let key in data) {
            viewablesInfo[key] = data[key];
        }
    } catch (error) {
        console.log(error);
        viewablesInfo = data;
    }
    
    // save new content in file
    let options = {
        uri: `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectName)}`,
        method: "put",
        headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Authorization": authorization
        },
        body: viewablesInfo,
        json: true
    };
    
    return await requestPromise(options);
}

router.post('/oncomplete/callback', jsonParser, async function(req, res) {
    // Return straight away
    console.log("Report: " + req.body.reportUrl);
    res.json({});

    try {
        console.log("/oncomplete/callback");
        console.log(req.body);

        let socketId = req.headers["socket-id"];
        let ossId = req.headers["oss-id"];
        let activityId = req.headers["activity-id"];
        if (activityId.includes(getDaResourceName(vars.updateModel))) {
            let bucketKey = req.headers["viewables-info-bucket-key"];
            let objectNme = req.headers["viewables-info-object-name"];
            let authorization = req.headers["authorization"];
    
            await updateInfoFile(bucketKey, objectNme, authorization, { status: req.body.status });
        } 

        io.to(socketId).emit('oncomplete', { status: req.body.status, activityId: activityId, ossId: ossId });
    } catch (error) {
        console.log(error);
    }  
})

router.post('/params/hash', jsonParser, async function(req, res) {
    let body = JSON.stringify(req.body);
    let viewablesInfoNameHash = getHash(body);

    return res.json({ hash: viewablesInfoNameHash });
});

var _daItems = {};
_daItems[getDaResourceName(vars.getZipContents)] = {
    "appbundles": {
        "engine": vars.engine,
        "description": "Gets contents of zip file"
    },
    "activities": {
        "commandLine": [
            `\"$(appbundles[${getDaResourceName(vars.getZipContents)}].path)\\DA4I_BasicInfoPlugin.bundle\\Contents\\GetZipContentsExe.exe\" \"$(args[inputFile].path)\" outputFile.json`
        ],
        "parameters": {
        "inputFile": {
            "zip": true,
            "verb": "get",
            "localName": "inputFile"
        },
        "outputFile": {
            "verb": "put",
            "localName": "outputFile.json"
        }
        },
        "engine": vars.engine,
        "appbundles": [
        ],
        "description": "Get Zip Contents into a json file"
    }                 
};
_daItems[getDaResourceName(vars.extractUserParams)] = {
    "appbundles": {
        "engine": vars.engine,
        "description": "Gets user parameters from the Inventor model"
    },
    "activities": {
        "commandLine": [
            `$(engine.path)\\\\InventorCoreConsole.exe /al \"$(appbundles[${getDaResourceName(vars.extractUserParams)}].path)\"`
        ],
        "parameters": {
        "inputFile": {
            "zip": true,
            "verb": "get",
            "localName": "inputFile"
        },
        "inputParams": {
            "verb": "get",
            "localName": "inputParams.json"
        },
        "documentParams": {
            "verb": "put",
            "localName": "documentParams.json"
        }
        },
        "engine": vars.engine,
        "appbundles": [
        ],
        "description": "Extract params from Inventor documents"
    }
};
_daItems[getDaResourceName(vars.updateModel)] = {
    "appbundles": {
        "engine": vars.engine,
        "description": "Updates user parameters in the model with the provided values"
    },
    "activities": {
        "commandLine": [
            `$(engine.path)\\InventorCoreConsole.exe /al \"$(appbundles[${getDaResourceName(vars.updateModel)}].path)\"`
        ],
        "parameters": {
            "inputFile": {
            "zip": true,
            "verb": "get",
            "localName": "inputFile"
            },
            "inputParams": {
            "verb": "get",
            "localName": "inputParams.json"
            },
            "documentParams": {
            "verb": "get",
            "localName": "documentParams.json"
            },
            "svfOutput": {
            "ondemand": true,
            "verb": "put",
            "localName": "SvfOutput"
            }
        },
        "engine": vars.engine,
        "appbundles": [
        ],
        "description": "Update model using callback"
    }         
};


// Create all the AppBundles and Activities needed
router.post('/items/setup', jsonParser, async function(req, res) {
    let forceUpdate = req.body.forceUpdate;

    try {
        let tokenSession = new token(req.session);
        let clientId = tokenSession.getClientId();
        for (let id in _daItems) {
            console.log(id);
            let fullId = `${clientId}.${id}+${vars.alias}`;        

            let item = _daItems[id]
            for (let type in item) {
                console.log(type);
                let data = item[type] 
                data.id = id
                if (type === "activities") {
                    data.appbundles.push(fullId)
                } else if (type === "appbundles") {
                    let filePath = path.join(__dirname, "zipfiles/" + id.replace(vars.appName + "_", "") + ".zip");
                    if (!fs.existsSync(filePath)) {
                        console.error(`File ${filePath} does not exist. Please upload the appbundle zip file.`);
                        res.status(400).json({ status: "failed", message: `File ${filePath} does not exist.` });
                        return;
                    }
                    data.bundle = filePath;
                }

                try {
                    let ret = await getItemVersions(req, type, id)
                    console.log("Already exists");
                    if (forceUpdate) {
                        ret = await deleteItem(req, type, id)
                        throw "Recreate items after deletion"
                    }
                } catch (error) {
                    let ret = await createItem(req, type, data)
                    ret = await createItemAlias(req, type, id, 1, vars.alias)
                    console.log(error);
                }
            }   
        }

        res.json({ status: "success" });
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
})


router.post('/viewables/:id', jsonParser, async function(req, res) {
    var id = decodeURIComponent(req.params.id)
    var projectPath = decodeURIComponent(req.query.projectPath);
    var documentPath = decodeURIComponent(req.query.documentPath);
    var viewablesInfoObject = utils.getBucketKeyObjectName(id);
    let body = JSON.stringify(req.body);
    let viewablesInfoNameHash = getHash(body);
    var viewablesInfoName = viewablesInfoObject.objectName + ".viewables." + viewablesInfoNameHash;
    let workitemStatus = "failed";
    var tokenSession = new token(req.session);
    var credentials = tokenSession.getCredentials();

    // check if json file already exists and newer than the file
    // it contains info about
    var utcViewable = 0;
    var utcFile = 0;
    var objects = new forgeSDK.ObjectsApi();
    try {
        console.log("Checking if viewables info for zip file exists");
        let data = await objects.getObjectDetails(viewablesInfoObject.bucketKey, viewablesInfoName, { "_with": "lastModifiedDate" }, tokenSession.getOAuth(), tokenSession.getCredentials())
        utcViewable = data.body.lastModifiedDate;

        data = await objects.downloadResources(viewablesInfoObject.bucketKey, [{ objectKey: viewablesInfoName, responseType: 'json' }], {}, null, tokenSession.getCredentials())
        workitemStatus = data[0].data.status;

        console.log("Getting info about the zip file");
        data = await objects.getObjectDetails(viewablesInfoObject.bucketKey, viewablesInfoObject.objectName, { "_with": "lastModifiedDate" }, tokenSession.getOAuth(), tokenSession.getCredentials())
        utcFile = data.body.lastModifiedDate;
    } catch (error) {
        console.log(error);
    }

    // if the json file is older than the file it has info about
    // then lets fetch the info again
    if (utcViewable <= utcFile && workitemStatus.startsWith('failed')) {
        let clientId = tokenSession.getClientId();
        let bucketKey = clientId.toLowerCase() + "_" + getGuid(); 

        //  Create bucket for viewables
        try {
            let buckets = new forgeSDK.BucketsApi();
            let reply = await buckets.createBucket({
                    "bucketKey": bucketKey,
                    "policyKey": "persistent"
                }, {}, tokenSession.getOAuth(), tokenSession.getCredentials())
        } catch (error) {
            console.log(error);
            res.json({ status: "failed", message: "Could not create bucket for viewables named: " + bucketKey });
            return;
        }

        // Create file with info about the viewables 
        try {
            await updateInfoFile(viewablesInfoObject.bucketKey, viewablesInfoName, "Bearer " + credentials.access_token, {
                "bucketKey": bucketKey, "status": "pending"
            });
        } catch (error) {
            console.log(error);

            res.json({ status: "failed", message: "Could not create file for viewables" });
            return;
        }

        console.log("Running job to update model...");

        // run workitem
        const activityId = `${clientId}.${getDaResourceName(vars.updateModel, true)}`;

        documentPath = `"inputFile":"inputFile/${documentPath}"`;
        projectPath = (projectPath !== '') ? `, "projectFile":"inputFile/${projectPath}"` : '';

        let workitemBody = {
            "activityId": activityId, 
            "arguments": {
                "inputFile": { 
                    "verb": "get",
                    "localName": "inputFile",
                    "zip": true,
                    "url": getUrn(viewablesInfoObject.bucketKey, viewablesInfoObject.objectName),
                    "headers": {
                        "Authorization": "Bearer " + credentials.access_token,
                        "Content-type": "application/octet-stream"
                    } 
                },
                "inputParams": {
                    "verb": "get",
                    "localName": "inputParams.json",
                    //"url": `data:application/json,{${documentPath}${projectPath}, "dontFlattenFolder": true, "verboseLogs": true, "outputType":"svf"}`
                    "url": `data:application/json,{${documentPath}${projectPath}, "outputType":"svf"}`
                },
                "documentParams": {
                    "verb": "get",
                    "localName": "documentParams.json",
                    "url": `data:application/json,${body}`
                },
                "svfOutput": {
                    "ondemand": true,
                    "zip": false,
                    "verb": "put",
                    "localName": "SvfOutput",
                    "url": process.env.FORGE_VIEWABLES_CALLBACK,
                    "headers": {
                        "Authorization": "Bearer " + credentials.access_token,
                        "Content-type": "application/octet-stream",
                        "viewables-bucket-key": bucketKey // where the viewables need to be uploaded
                    }
                },
                "onComplete": {
                    "ondemand": true,
                    "verb": "post",
                    "url": process.env.FORGE_ONCOMPLETE_CALLBACK,
                    "headers": {
                        "Authorization": "Bearer " + credentials.access_token,
                        "viewables-info-bucket-key": viewablesInfoObject.bucketKey,  // where the model file is
                        "viewables-info-object-name": viewablesInfoName, // file with info about workitem 
                        "activity-id": activityId, // the user we have to pass the message to
                        "oss-id": id, // the user we have to pass the message to
                        "socket-id": req.session.socket_id // the user we have to pass the message to
                    }
                }
            }
        };
        console.log(JSON.stringify(workitemBody));

        var createReply = await createItem(req, "workitems", workitemBody);
        console.log(createReply);

        try {
            await updateInfoFile(viewablesInfoObject.bucketKey, viewablesInfoName, "Bearer " + credentials.access_token, {
                "bucketKey": bucketKey, "status": createReply.status, "workitemId": createReply.id
            });
        } catch (error) {
            console.log(error);
            res.json({ status: "failed", message: "Could not update file for viewables" });
            return;
        }
        
        res.json(createReply);

        return;
    } else {
        // Find the folder that has the viewables
        console.log("Getting data from the file with info about the viewables");
        let viewablesInfo = await getInfoFile(viewablesInfoObject.bucketKey, viewablesInfoName, "Bearer " + credentials.access_token);       
        console.log(viewablesInfo);

        let bucketKey = viewablesInfo.bucketKey;
        tokenSession.setFolderPath(bucketKey);

        res.json(viewablesInfo);
    }
});

/////////////////////////////////////////////////////////////////
// Collects the information that we need to pass to the
// file tree object on the client
/////////////////////////////////////////////////////////////////

function makeTree(items, type, prefix) {
    if (!items) return '';
    var treeList = [];
    items.forEach(function(item, index) {
        var treeItem = {
            id: prefix + item.id,
            nickName: item.nickName,
            alias: item.alias,
            text: item.id,
            type: type,
            children: item.children
        };
        console.log(treeItem);
        treeList.push(treeItem);
    });

    return treeList;
}

/////////////////////////////////////////////////////////////////
// Return the router object that contains the endpoints
/////////////////////////////////////////////////////////////////

module.exports = router;