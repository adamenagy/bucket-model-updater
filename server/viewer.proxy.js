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

function findFile(req, res, id) {
    var tokenSession = new token(req.session);
    
    try {
        let clientId = tokenSession.getClientId();
        let folderPath = tokenSession.getFolderPath();
        let fullPath = "";
        if (id === "bubble.json") {
            fullPath = path.join(folderPath, id);
            console.log('fullPath = ' + fullPath);
        } else {
            fullPath = path.join(folderPath, "output\\1\\" + id);
            console.log('fullPath = ' + fullPath);
        }
         
        res.sendFile(fullPath);
    } catch (error) {
        console.log(error);
        res.status(404).end();
    }
}

/*
router.get('/lmv_proxy/:id', async function(req, res) {
    var id = decodeURIComponent(req.params.id)
    findFile(req, res, id);
});
*/

router.get('/*', async function(req, res) {
    var id = decodeURIComponent(req.path)
    id = id.replace("/", "");
    id = id.replace(/\//g, "\\")
    findFile(req, res, id);
});

/////////////////////////////////////////////////////////////////
// Return the router object that contains the endpoints
/////////////////////////////////////////////////////////////////

module.exports = router;