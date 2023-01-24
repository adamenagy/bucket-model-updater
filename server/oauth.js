/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

'use strict'; // http://www.w3schools.com/js/js_strict.asp

// token handling in session
var token = require('./token');

// web framework
var express = require('express');
var router = express.Router();

var forgeSDK = require('forge-apis');

// forge config information, such as client ID and secret
var config = require('./config');

// this end point will logoff the user by destroying the session
// as of now there is no Forge endpoint to invalidate tokens
router.get('/user/logoff', function (req, res) {
    req.session.destroy();
    res.end('/');
});

// wait for Autodesk callback (oAuth callback)
router.get('/user/token', function (req, res) {
    console.log("Existing session", req.session.credentials);
    var tokenSession = new token(req.session);

    try {
      var client_id = req.query.client_id;
      var client_secret = req.query.client_secret;
      var socket_id = req.query.socket_id;
      var scopes = req.query.scopes;
      scopes = scopes.split(' ')

      var authReq = new forgeSDK.AuthClientTwoLegged(client_id, client_secret, scopes);
      authReq.authenticate()
          .then(function (credentials) {

              tokenSession.setCredentials(credentials);
              tokenSession.setOAuth(authReq);
              tokenSession.setClientId(client_id);
              if (socket_id) {
                req.session.socket_id = socket_id;
              }

              console.log("Newly set session:", req.session.credentials);

              console.log('Token: ' + credentials.access_token);
              req.session.save();
            //res.setHeader('Access-Control-Allow-Origin', '*');
            res.json({ token: credentials.access_token, expires_in: credentials.expires_in });
          })
          .catch(function (error) {
            res.status(500).end(error.developerMessage);
          });
    } catch (err) {
        res.status(500).end(err);
    }
});

module.exports = router;