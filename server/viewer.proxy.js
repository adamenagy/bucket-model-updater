'use strict'; // http://www.w3schools.com/js/js_strict.asp

// token handling in session
var token = require('./token');

// web framework
var express = require('express');
var router = express.Router();

var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
var rawParser = bodyParser.raw({ limit: '10mb' });
const request = require('request');
const requestPromise = require('request-promise');

var config = require('./config');

var utils = require('./utils');

var fs = require('fs');
var path = require('path');

var forgeSDK = require('forge-apis');

const unzipper = require('unzipper');
var AdmZip = require('adm-zip');

var stream = require('stream');

/////////////////////////////////////////////////////////////////
// Update model parameters and get viewable
/////////////////////////////////////////////////////////////////

function findFileLocal(req, res, id) {
    var tokenSession = new token(req.session);
    
    try {
        let clientId = tokenSession.getClientId();
        let folderPath = tokenSession.getFolderPath();
        let fullPath = path.join(folderPath, "output\\1\\" + id);
        console.log('fullPath = ' + fullPath);
         
        res.sendFile(fullPath);
    } catch (error) {
        console.log(error);
        res.status(404).end();
    }
}

async function findFileOss(req, res, id) {
    var tokenSession = new token(req.session);
    var credentials = tokenSession.getCredentials();
    
    try {
        let bucketKey = tokenSession.getFolderPath();

        // when accessing objects from bucket the object path cannot contain '/' it needs to be URL encoded to '%2F'
        // that's what encodeURIComponent() achieves 
        // use redirect instead of downloading to server and passing it to client
        res.redirect(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(id)}`);
    } catch (error) {
        console.log(error);
        res.status(404).end();
    }
}

router.get('/*', async function(req, res) {
    var id = decodeURIComponent(req.path)
    
    // Remove first forward slash from name
    // "/bubble.json" => "bubble.json"
    id = id.replace("/", ""); 
    
    if (req.session.local) {
        findFileLocal(req, res, id);
    } else {
        findFileOss(req, res, id);
    }
});

/////////////////////////////////////////////////////////////////
// Return the router object that contains the endpoints
/////////////////////////////////////////////////////////////////

module.exports = router;