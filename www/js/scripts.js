var MyVars = {
};

$(document).ready(function () {
    fillCredentialControls();

    $("#createBucket").click(function (evt) {
        createBucket();
    });

    $("#forgeUploadHidden").change(function (evt) {
        startCancellableOperation()
        showProgress("Uploading file... ", "inprogress");
        uploadChunks(this.files[0]);
    });

    $("#showZipContents").click(function (evt) {
        showZipContents(MyVars.selectedNode.original.id);
    });

    $("#translate").click(function (evt) {
        translate();
    });

    $("#showParams").click(function (evt) {
        showParams(MyVars.selectedNode.original.id);
    });

    $("#uploadFile").click(function (evt) {
        evt.preventDefault();
        $("#forgeUploadHidden").trigger("click");
    });

    $("#authenticate").click(function () {
        authenticate();
    });

    $('#progressInfo').click(function () {
        cleanupCancellableOperation()
    });
});

function fillCredentialControls() {
    var url = new URL(window.location.href);
    var client_id = url.searchParams.get("client_id");
    if (client_id) {
        $("#client_id").val(client_id);
    }
    var client_secret = url.searchParams.get("client_secret");
    if (client_secret) {
        $("#client_secret").val(client_secret);
    }
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function updateAccessToken() {
    return new Promise((resolve, reject) => {
        get2LegToken(function (token) {
            MyVars.token2Leg = token;
            resolve();
        })
    })
}

function uploadChunk(fileName, folderId, sessionId, range, readerResult) {
    return new Promise((resolve, reject) => {
        console.log("uploadChunk [before]: sessionId = " + sessionId + ", range = " + range);

        MyVars.cancellableOperation.ajaxCalls.push($.ajax({
            url: "/dm/chunks",
            type: "POST",
            headers: {
                'Content-Type': 'application/octet-stream',
                'x-file-name': fileName,
                'id': folderId,
                'sessionid': sessionId,
                'range': range
            },
            processData: false,
            data: readerResult                     // d is the chunk got by readAsBinaryString(...)
        }).done(function (response) {           // if 'd' is uploaded successfully then ->
            console.log("uploadChunk [done]: sessionId = " + sessionId + ", range = " + range);
            resolve(response)
        }).fail(function (error) {
            console.log("uploadChunk [fail]: sessionId = " + sessionId + ", range = " + range);
            reject(error)
        }));
    })
}

async function readChunk(file, start, end, total) {
    return new Promise((resolve, reject) => {
        var reader = new FileReader();
        var blob = file.slice(start, end);

        reader.onload = function (e) {
            var currentStart = start
            var currentEnd = start + e.loaded - 1;
            var range = 'bytes ' + currentStart + "-" + currentEnd + "/" + total

            resolve({ readerResult: reader.result, range: range });
        };

        reader.readAsArrayBuffer(blob);
    });
}

async function uploadChunks(file) {
    const retryMax = 3;
    const step = 2 * 1024 * 1024; // 2 MB suggested
    const total = file.size;    // total size of file
    const folderId = MyVars.selectedNode.id;
    const fileName = file.name;
    const sessionId = uuidv4();
    const stepsMax = Math.floor(total / step) + 1;
    let stepsCount = 0;

    let createPromise = function (start, end) {
        console.log(`createPromise: ${start} - ${end}`);
        return new Promise(async (resolve, reject) => {
            let retryCount = 0;

            console.log(`runPromise: ${start} - ${end}`);
            let resRead = await readChunk(file, start, end, total);

            while (true) {
                try {
                    if (!MyVars.cancellableOperation.keepTrying) {
                        reject(false);
                        return;
                    }

                    console.log(`before uploadChunk: retryCount =  ${retryCount}`);
                    let resUpload = await uploadChunk(fileName, folderId, sessionId, resRead.range, resRead.readerResult);
                    showProgress("Uploading file... " + Math.ceil(++stepsCount / stepsMax * 100).toString() + "%", "inprogress");
                    resolve(true);
                    return;
                } catch {
                    if (++retryCount > retryMax) {
                        reject(false);
                        return;
                    }

                    await updateAccessToken();
                }
            }
        });
    }

    let promises = [];
    for (let start = 0; start < total; start += step) {
        promises.push(createPromise(start, start + step));
    }

    // Whether some failed or not, let's wait for all of them to return resolve or reject
    Promise.allSettled(promises)
        .then((results) => {
            let failed = results.find((item) => {
                return item.status === 'rejected';
            })

            if (failed) {
                if (MyVars.cancellableOperation.keepTrying) {
                    console.log("uploadChunks >> fail");
                    showProgress("Upload failed", "failed");
                } else {
                    console.log("uploadChunks >> cancelled");
                    showProgress("Upload cancelled", "failed");
                }
            } else {
                console.log("uploadChunks >> done");
                showProgress("File uploaded", "success");
                $('#forgeFiles').jstree(true).refresh();
            }

            $("#forgeUploadHidden").val('');
            cleanupCancellableOperation()
        })
}

function createBucket() {
    var bucketName = $("#bucketName").val()
    var bucketType = $("#bucketType").val()
    MyVars.cancellableOperation.ajaxCalls.push($.ajax({
        url: '/dm/buckets',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
            bucketName: bucketName,
            bucketType: bucketType
        })
    }).done(function (data) {
        console.log('Response' + data);
        showProgress("Bucket created", "success")
        $('#forgeFiles').jstree(true).refresh()
    }).fail(function (xhr, ajaxOptions, thrownError) {
        console.log('Bucket creation failed!')
        showProgress("Could not create bucket", "failed")
    }));
}

function cleanupCancellableOperation() {
    if (MyVars.cancellableOperation) {
        MyVars.cancellableOperation.keepTrying = false;

        // In case there are parallel downloads or any calls, just cancel them
        MyVars.cancellableOperation.ajaxCalls.map((ajaxCall) => {
            ajaxCall.abort();
        });

        MyVars.cancellableOperation = undefined;
    }
}

function startCancellableOperation() {
    MyVars.cancellableOperation = { ajaxCalls: [], keepTrying: true }
}

function base64encode(str) {
    var ret = "";
    if (window.btoa) {
        ret = window.btoa(str);
    } else {
        // IE9 support
        ret = window.Base64.encode(str);
    }

    // Remove ending '=' signs
    // Use _ instead of /
    // Use - insteaqd of +
    // Have a look at this page for info on "Unpadded 'base64url' for "named information" URI's (RFC 6920)"
    // which is the format being used by the Model Derivative API
    // https://en.wikipedia.org/wiki/Base64#Variants_summary_table
    var ret2 = ret.replace(/=/g, '').replace(/[/]/g, '_').replace(/[+]/g, '-');

    console.log('base64encode result = ' + ret2);

    return ret2;
}

function logoff() {
    MyVars.cancellableOperation.ajaxCalls.push($.ajax({
        url: '/user/logoff',
        success: function (oauthUrl) {
            location.href = oauthUrl;
        }
    }));
}

function get2LegToken(onSuccess, onError) {
    if (onSuccess) {
        var client_id = $('#client_id').val();
        var client_secret = $('#client_secret').val();
        var scopes = $('#scopes').val();
        $.ajax({
            url: '/user/token',
            data: {
                client_id: client_id,
                client_secret: client_secret,
                scopes: scopes
            },
            success: function (data) {
                onSuccess(data.token, data.expires_in);
            },
            error: function (err, text) {
                if (onError) {
                    onError(err);
                }
            }
        });
    } else {
        console.log('Returning saved 3 legged token (User Authorization): ' + MyVars.token2Leg);

        return MyVars.token2Leg;
    }
}

function authenticate() {
    get2LegToken(function (token) {
        var auth = $("#authenticate");

        MyVars.token2Leg = token;
        console.log('Returning new 3 legged token (User Authorization): ' + MyVars.token2Leg);
        showProgress()

        auth.html('Logged in');

        // Fill the tree with A360 items
        prepareFilesTree();
    }, function (err) {
        showProgress(err.responseText, 'failed');
    });
}

// http://stackoverflow.com/questions/4068373/center-a-popup-window-on-screen
function PopupCenter(url, title, w, h) {
    // Fixes dual-screen position                         Most browsers      Firefox
    var dualScreenLeft = window.screenLeft != undefined ? window.screenLeft : screen.left;
    var dualScreenTop = window.screenTop != undefined ? window.screenTop : screen.top;

    var width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
    var height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;

    var left = ((width / 2) - (w / 2)) + dualScreenLeft;
    var top = ((height / 2) - (h / 2)) + dualScreenTop;
    var newWindow = window.open(url, title, 'scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);

    // Puts focus on the newWindow
    if (window.focus) {
        newWindow.focus();
    }
}

function downloadDerivative(urn, derUrn, fileName) {
    console.log("downloadDerivative for urn=" + urn + " and derUrn=" + derUrn);
    // fileName = file name you want to use for download
    var url = window.location.protocol + "//" + window.location.host +
        "/md/download?urn=" + urn +
        "&derUrn=" + derUrn +
        "&fileName=" + encodeURIComponent(fileName);

    window.open(url, '_blank');
}

function getThumbnail(urn) {
    console.log("downloadDerivative for urn=" + urn);
    // fileName = file name you want to use for download
    var url = window.location.protocol + "//" + window.location.host +
        "/dm/thumbnail?urn=" + urn;

    window.open(url, '_blank');
}

function isArraySame(arr1, arr2) {
    // If both are undefined or has no value
    if (!arr1 && !arr2)
        return true;

    // If just one of them has no value
    if (!arr1 || !arr2)
        return false;

    return (arr1.sort().join(',') === arr2.sort().join(','));
}

// OBJ: guid & objectIds are also needed
// SVF, STEP, STL, IGES:
// Posts the job then waits for the manifest and then download the file
// if it's created
function askForFileType(format, urn, guid, objectIds, rootFileName, fileExtType, onsuccess) {
    console.log("askForFileType " + format + " for urn=" + urn);
    startCancellableOperation();

    var advancedOptions = {
        'stl': {
            "format": "binary",
            "exportColor": true,
            "exportFileStructure": "single" // "multiple" does not work
        },
        'obj': {
            "modelGuid": guid,
            "objectIds": objectIds
        }
    };

    MyVars.cancellableOperation.ajaxCalls.push($.ajax({
        url: '/md/export',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(
            {
                urn: urn,
                format: format,
                advanced: advancedOptions[format],
                rootFileName: rootFileName,
                fileExtType: fileExtType
            }
        )
    }).done(function (data) {
        console.log(data);

        if (data.result === 'success' // newly submitted data
            || data.result === 'created') { // already submitted data
            getManifest(urn, function (res) {
                cleanupCancellableOperation();
                showProgress("File translated", "success");
                onsuccess(res);
            });
        } else {
            cleanupCancellableOperation();
            showProgress(err.responseText, "failed");
            console.log('Translation failed');
        }
    }).fail(function (err) {
        cleanupCancellableOperation();
        showProgress(err.responseText, "failed");
        console.log('/md/export call failed\n' + err.statusText);
    }));
}

function translate() {
    if (!MyVars.selectedNode) {
        alert("A file needs to be selected!");
        return;
    }

    var ext = getFileType(MyVars.selectedNode.text);
    if (!MyVars.rootFileNode && ext === 'zip') {
        alert('You need to provide a root file when translating a zip');
        return;
    }

    let rootFilename = (MyVars.rootFileNode) ? MyVars.rootFileNode.text : "";
    askForFileType("svf", MyVars.selectedUrn, null, null, rootFilename, ext, (res) => {
        initializeViewer(MyVars.selectedUrn);
    })
}

// We need this in order to get an OBJ file for the model
function getMetadata(urn, onsuccess, onerror) {
    console.log("getMetadata for urn=" + urn);
    MyVars.cancellableOperation.ajaxCalls.push($.ajax({
        url: '/md/metadatas/' + urn,
        type: 'GET'
    }).done(function (data) {
        console.log(data);

        // Get first model guid
        // If it does not exists then something is wrong
        // let's check the manifest
        // If get manifest sees a failed attempt then it will
        // delete the manifest
        var md0 = data.data.metadata[0];
        if (!md0) {
            getManifest(urn, function () { });
        } else {
            var guid = md0.guid;
            if (onsuccess !== undefined) {
                onsuccess(guid);
            }
        }
    }).fail(function (err) {
        console.log('GET /md/metadata call failed\n' + err.statusText);
        onerror();
    }));
}

function getManifest(urn, onsuccess) {
    console.log("getManifest for urn=" + urn);
    MyVars.cancellableOperation.ajaxCalls.push($.ajax({
        url: '/md/manifests/' + urn,
        type: 'GET'
    }).done(function (data) {
        console.log(data);

        if (data.status !== 'failed') {
            if (data.progress !== 'complete') {
                showProgress("Translation progress: " + data.progress, data.status);

                if (MyVars.cancellableOperation.keepTrying) {
                    // Keep calling until it's done
                    window.setTimeout(function () {
                        getManifest(urn, onsuccess);
                    }, 500
                    );
                } else {
                    cleanupCancellableOperation()
                }
            } else {
                showProgress("Translation completed", data.status);
                cleanupCancellableOperation()
                onsuccess(data);
            }
            // if it's a failed translation best thing is to delete it
        } else {
            showProgress("Translation failed", data.status);
            cleanupCancellableOperation()
            // Should we do automatic manifest deletion in case of a failed one?
            //delManifest(urn, function () {});
        }
    }).fail(function (err) {
        if (!MyVars.cancellableOperation.keepTrying) {
            showProgress("Translation cancelled", 'failed');
        } else {
            showProgress("Translation failed", 'failed');
        }
        cleanupCancellableOperation()
        console.log('GET /api/manifest call failed\n' + err.statusText);
    }));
}

function delManifest(urn, onsuccess) {
    console.log("delManifest for urn=" + urn);
    MyVars.cancellableOperation.ajaxCalls.push($.ajax({
        url: '/md/manifests/' + urn,
        type: 'DELETE'
    }).done(function (data) {
        console.log(data);
        if (data.status === 'success') {
            if (onsuccess !== undefined) {
                onsuccess(data);
                showProgress("Manifest deleted", "success")
            }
        }
    }).fail(function (err) {
        console.log('DELETE /api/manifest call failed\n' + err.statusText);
    }));
}

/////////////////////////////////////////////////////////////////
// Files Tree / #forgeFiles
// Shows the A360 hubs, projects, folders and files of
// the logged in user
/////////////////////////////////////////////////////////////////

function getFileType(fileName) {
    var fileNameParts = fileName.split('.')
    return fileNameParts[fileNameParts.length - 1]
}

function prepareFilesTree() {
    console.log("prepareFilesTree");
    $('#forgeFiles').jstree({
        'core': {
            'themes': { "icons": true },
            'check_callback': true, // make it modifiable
            'data': {
                "url": '/dm/treeNode',
                "dataType": "json",
                "data": function (node) {
                    return {
                        "id": node.id
                    };
                }
            }
        },
        "ui": {
            "select_limit": 1
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            'bucket': {
                'icon': 'glyphicon glyphicon-folder-open'
            },
            'file': {
                'icon': 'glyphicon glyphicon-file'
            }
        },
        "plugins": ["types", "contextmenu"], // let's not use sort or state: , "state" and "sort"],
        'contextmenu': {
            'select_node': true,
            'items': filesTreeContextMenu
        }
    }).bind("select_node.jstree", function (evt, data) {
        // Clean up previous instance
        cleanupViewer();

        // Just open the children of the node, so that it's easier
        // to find the actual versions
        $('#forgeFiles').jstree("open_node", data.node);

        MyVars.selectedNode = data.node;

        if (data.node.type === 'file') {
            $("#deleteManifest").removeAttr('disabled');
            $("#uploadFile").removeAttr('disabled');

            // Clear hierarchy tree
            $('#forgeZipContents').empty().jstree('destroy');

            // Clear properties tree
            $('#forgeModelParams').empty().jstree('destroy');

            // Delete cached data
            $('#forgeModelParams').data('forgeModelParams', null);

            MyVars.fileExtType = getFileType(data.node.text)

            MyVars.selectedUrn = base64encode(data.node.id);
            MyVars.rootFileName = data.node.text
            if (MyVars.fileExtType === 'zip') {
                // mypart.iam.zip >> mypart.iam
                MyVars.rootFileName = MyVars.rootFileName.slice(0, -4);
                if (MyVars.rootFileName.indexOf('~') > 0) {
                    // maypart~asd.iam >> mypart.iam
                    let parts = MyVars.rootFileName.split('~');
                    MyVars.rootFileName = parts[0] + '.' + parts[1].split('.')[1];
                }
            }

            console.log(
                "MyVars.selectedUrn = " + MyVars.selectedUrn
            );
        } else {
            $("#deleteManifest").attr('disabled', 'disabled');
            $("#uploadFile").attr('disabled', 'disabled');

            // Just open the children of the node, so that it's easier
            // to find the actual versions
            $("#forgeFiles").jstree("open_node", data.node);

            // And clear trees to avoid confusion thinking that the
            // data belongs to the clicked model
            $('#forgeZipContents').empty().jstree('destroy');
            $('#forgeModelParams').empty().jstree('destroy');
        }
    });
}

function downloadFile(id) {
    console.log("Download file = " + id);
    // fileName = file name you want to use for download
    var url = window.location.protocol + "//" + window.location.host +
        "/dm/files/" + encodeURIComponent(id);

    window.open(url, '_blank');
}

function deleteFile(id) {
    console.log("Delete file = " + id);
    $.ajax({
        url: '/dm/files/' + encodeURIComponent(id),
        type: 'DELETE'
    }).done(function (data) {
        console.log(data);
        if (data.status === 'success') {
            $('#forgeFiles').jstree(true).refresh()
            showProgress("File deleted", "success")
        }
    }).fail(function (err) {
        console.log('DELETE /dm/files/ call failed\n' + err.statusText);
    });
}

function deleteBucket(id) {
    console.log("Delete bucket = " + id);
    $.ajax({
        url: '/dm/buckets/' + encodeURIComponent(id),
        type: 'DELETE'
    }).done(function (data) {
        console.log(data);
        if (data.status === 'success') {
            $('#forgeFiles').jstree(true).refresh()
            showProgress("Bucket deleted", "success")
        }
    }).fail(function (err) {
        console.log('DELETE /dm/buckets/ call failed\n' + err.statusText);
    });
}

function getPublicUrl(id) {
    $.ajax({
        url: '/dm/files/' + encodeURIComponent(id) + '/publicurl',
        type: 'GET'
    }).done(function (data) {
        console.log(data);
        alert(data.signedUrl);
    }).fail(function (err) {
        console.log('DELETE /dm/buckets/ call failed\n' + err.statusText);
    });
}

function filesTreeContextMenu(node, callback) {
    MyVars.selectedNode = node
    if (node.type === 'bucket') {
        callback({
            refreshTree: {
                "label": "Refresh",
                "action": function () {
                    $('#forgeFiles').jstree(true).refresh()
                }
            },
            bucketDelete: {
                "label": "Delete bucket",
                "action": function (obj) {
                    deleteBucket(MyVars.selectedNode.id)
                }
            },
            fileUpload: {
                "label": "Upload file",
                "action": function (obj) {
                    $("#forgeUploadHidden").trigger("click");
                }
            }
        })
    } else {
        callback({
            fileDelete: {
                "label": "Delete file",
                "action": function (obj) {
                    deleteFile(MyVars.selectedNode.id)
                }
            },
            fileDownload: {
                "label": "Download file",
                "action": function (obj) {
                    downloadFile(MyVars.selectedNode.id)
                }
            },
            publicUrl: {
                "label": "Public URL",
                "action": function (obj) {
                    getPublicUrl(MyVars.selectedNode.id)
                }
            }
        })
    }

    return;
}

/////////////////////////////////////////////////////////////////
// Zip contents Tree / #forgeZipContents
// Shows the contents of the selected zip file
/////////////////////////////////////////////////////////////////

function showZipContents(id) {
    startCancellableOperation()
    showProgress("Fetching zip contents...", "inprogress")
    MyVars.cancellableOperation.ajaxCalls.push($.ajax({
        url: '/da/zipcontents/' + encodeURIComponent(id),
        type: 'GET'
    }).done(function (data) {
        console.log(data);
        prepareZipContentsTree(data)
        cleanupCancellableOperation()
        showProgress("Fetched zip content", 'success');
    }).fail(function (err) {
        if (!MyVars.cancellableOperation.keepTrying) {
            showProgress("Cancelled getting zip content", 'failed');
        } else {
            showProgress("Failed to get zip content", 'failed');
        }
        cleanupCancellableOperation()
        console.log('GET /da/zipcontents/ call failed\n' + err.statusText);
    }));
}

function prepareForTree(nodes) {
    for (var nodeId in nodes) {
        var node = nodes[nodeId];
        node.text = node.name

        if (node.children) {
            prepareForTree(node.children);
        }
    }
}

function prepareZipContentsTree(json) {
    prepareForTree(json)

    // init the tree
    $('#forgeZipContents').jstree({
        'core': {
            'check_callback': true,
            'themes': { "icons": true },
            'data': json
        },
        'checkbox': {
            'whole_node': false
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            'file': {
                'icon': 'glyphicon glyphicon-file'
            },
            'folder': {
                'icon': 'glyphicon glyphicon-folder-open'
            },
            'used': {
                'icon': 'glyphicon glyphicon-ok'
            }
        },
        "plugins": ["types", "sort", "ui", "themes", "contextmenu"],
        'contextmenu': {
            'select_node': true,
            'items': zipContentsTreeContextMenu
        }
    }).bind("select_node.jstree", function (evt, data) {
        // Just open the children of the node, so that it's easier
        // to find the actual versions
        $('#forgeZipContents').jstree("open_node", data.node);

        if (data.node.type === 'object') {
            var urn = MyVars.selectedUrn;
            var guid = MyVars.selectedGuid;
            var objectId = data.node.original.objectid;

            // Empty the property tree
            $('#forgeModelParams').empty().jstree('destroy');

            fetchProperties(urn, guid, function (props) {
                preparePropertyTree(urn, guid, objectId, props);
                selectInViewer([objectId]);
            });
        }
    });
}

function zipContentsTreeContextMenu(node) {
    let parts = node.text.split('.')
    let extension = (parts.length > 1) ? parts[parts.length - 1] : "";

    if (extension === "ipj") {
        return {
            "useAsProject": {
                "label": "Use project file",
                "action": function (obj) {
                    if (MyVars.projectFileNode) {
                        $('#forgeZipContents').jstree(true).set_type(MyVars.projectFileNode.id, 'file');
                    }

                    $('#forgeZipContents').jstree(true).set_type(node.id, 'used');
                    MyVars.projectFileNode = node;
                }
            }
        }
    } else if (extension !== "") {
        return {
            "useAsRoot": {
                "label": "Use as root file",
                "action": function (obj) {
                    if (MyVars.rootFileNode) {
                        $('#forgeZipContents').jstree(true).set_type(MyVars.rootFileNode.id, 'file');
                    }

                    if (MyVars.rootFileNode !== node) {
                        $('#forgeZipContents').jstree(true).set_type(node.id, 'used');
                        MyVars.rootFileNode = node;
                    } else {
                        MyVars.rootFileNode = undefined;
                    }
                }
            }
        }
    }

    return null;
}


/////////////////////////////////////////////////////////////////
// Model parameters list / #forgeModelParams
// Shows the user parameters available in the model
/////////////////////////////////////////////////////////////////

function showParams(id) {
     
    if (!MyVars.rootFileNode) {
        alert("You have to select the root file you want the parameters from");
        return;
    }

    startCancellableOperation()
    showProgress("Fetching parameters...", "inprogress")

    let documentPath = $('#forgeZipContents').jstree().get_path(MyVars.rootFileNode, '/');
    let projectPath = (MyVars.projectFileNode) ? 
        $('#forgeZipContents').jstree().get_path(MyVars.projectFileNode, '/') : '';    

    MyVars.cancellableOperation.ajaxCalls.push($.ajax({
        url: `/da/params/${encodeURIComponent(id)}?documentPath=${documentPath}&projectPath=${encodeURIComponent(projectPath)}`,
        type: 'GET'
    }).done(function (data) {
        console.log(data);
        prepareParamsList(data)
        cleanupCancellableOperation()
        showProgress("Fetched parameters", 'success');
    }).fail(function (err) {
        if (!MyVars.cancellableOperation.keepTrying) {
            showProgress("Cancelled getting parameters", 'failed');
        } else {
            showProgress("Failed to get parameters", 'failed');
        }
        cleanupCancellableOperation()
        console.log('GET /da/params/ call failed\n' + err.statusText);
    }));
}

function prepareParamsList(json) {
    var parameters = $('#forgeModelParams');
    parameters.html('');
  
    for (let key in json) {
      let item = json[key];
      let id = `parameters_${key}`;
  
      if (item.values && item.values.length > 0) {
        parameters.append($(`
          <div class="form-group">
            <label for="${id}">${key}</label>
            <select class="form-control" id="${id}"></select>
          </div>`));
        let select = $(`#${id}`);
        for (let key2 in item.values) {
          let value = item.values[key2];
          select.append($('<option>', { value: value, text: value }))
        }
        // Activate current selection
        select.val(item.value);
      } else if (item.unit === "Boolean") {
        parameters.append($(`
          <div class="form-group">
            <label for="${id}">${key}</label>
            <select class="form-control" id="${id}">
              <option value="True">True</option>
              <option value="False">False</option>
            </select>
          </div>`));
        let select = $(`#${id}`);
        select.val(item.value);
      } else {
        parameters.append($(`
          <div class="form-group">
            <label for="${id}">${key}</label>
            <input type="text" class="form-control" id="${id}" placeholder="Enter new ${key} value">
          </div>`));
        let input = $(`#${id}`);
        input.val(item.value);
      }
    }
}

/////////////////////////////////////////////////////////////////
// Property Tree / #forgeModelParams
// Shows the properties of the selected sub-component
/////////////////////////////////////////////////////////////////

// Storing the collected properties since you get them for the whole
// model. So when clicking on the various sub-components in the
// hierarchy tree we can reuse it instead of sending out another
// http request
function fetchProperties(urn, guid, onsuccess) {
    var props = $("#forgeModelParams").data("forgeModelParams");
    if (!props) {
        getProperties(urn, guid, function (data) {
            $("#forgeModelParams").data("forgeModelParams", data.data);
            onsuccess(data.data);
        })
    } else {
        onsuccess(props);
    }
}

// Recursively add all the additional properties under each
// property node
function addSubProperties(node, props) {
    node.children = node.children || [];
    for (var subPropId in props) {
        var subProp = props[subPropId];
        if (subProp instanceof Object) {
            var length = node.children.push({
                "text": subPropId,
                "type": "properties"
            });
            var newNode = node.children[length - 1];
            addSubProperties(newNode, subProp);
        } else {
            node.children.push({
                "text": subPropId + " = " + subProp.toString(),
                "type": "property"
            });
        }
    }
}

// Add all the properties of the selected sub-component
function addProperties(node, props) {
    // Find the relevant property section
    for (var propId in props) {
        var prop = props[propId];
        if (prop.objectid === node.objectid) {
            addSubProperties(node, prop.properties);
        }
    }
}

function preparePropertyTree(urn, guid, objectId, props) {
    // Convert data to expected format
    var data = { 'objectid': objectId };
    addProperties(data, props.collection);

    // init the tree
    $('#forgeModelParams').jstree({
        'core': {
            'check_callback': true,
            'themes': { "icons": true },
            'data': data.children
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            'property': {
                'icon': 'glyphicon glyphicon-tag'
            },
            'properties': {
                'icon': 'glyphicon glyphicon-folder-open'
            }
        },
        "plugins": ["types", "sort"]
    }).bind("activate_node.jstree", function (evt, data) {
        //
    });
}

/////////////////////////////////////////////////////////////////
// Viewer
// Based on Autodesk Viewer basic sample
// https://developer.autodesk.com/api/viewerapi/
/////////////////////////////////////////////////////////////////

function cleanupViewer() {
    // Clean up previous instance
    if (MyVars.viewer && MyVars.viewer.model) {
        console.log("Unloading current model from Autodesk Viewer");

        MyVars.viewer.tearDown();
        MyVars.viewer.setUp(MyVars.viewer.config);
    }
}

function initializeViewer(urn) {
    cleanupViewer();

    console.log("Launching Autodesk Viewer for: " + urn);

    var options = {
        document: 'urn:' + urn,
        env: 'AutodeskProduction', //'AutodeskStaging', //'AutodeskProduction',
        getAccessToken: get2LegToken
    };

    if (MyVars.viewer) {
        loadDocument(MyVars.viewer, options.document);
    } else {
        var viewerElement = document.getElementById('forgeViewer');
        var config = {
            //extensions: ['Autodesk.Viewing.webVR', 'Autodesk.Viewing.MarkupsGui'],
            //experimental: ['webVR_orbitModel']
        };
        MyVars.viewer = new Autodesk.Viewing.GuiViewer3D(viewerElement, config);
        Autodesk.Viewing.Initializer(
            options,
            function () {
                MyVars.viewer.start(); // this would be needed if we also want to load extensions
                loadDocument(MyVars.viewer, options.document);
                addSelectionListener(MyVars.viewer);
            }
        );
    }
}

function addSelectionListener(viewer) {
    viewer.addEventListener(
        Autodesk.Viewing.SELECTION_CHANGED_EVENT,
        function (event) {

            var dbId = event.dbIdArray[0];
            if (dbId) {
                viewer.getProperties(dbId, function (props) {
                    console.log(props.externalId);
                });
            }
        });
}

function loadDocument(viewer, documentId) {
    // Set the Environment to "Riverbank"
    //viewer.setLightPreset(8);

    // Make sure that the loaded document's setting won't
    // override it and change it to something else
    //viewer.prefs.tag('ignore-producer');

    Autodesk.Viewing.Document.load(
        documentId,
        // onLoad
        function (doc) {
            var geometryItems = doc.getRoot().search({ "role": "3d", "type": "geometry" });

            // Try 3d geometry first
            if (geometryItems.length < 1) {
                geometryItems.push(doc.getRoot().getDefaultGeometry())
            }

            viewer.loadDocumentNode(doc, geometryItems[0]).then(i => {
                // documented loaded, any action?
            });
        },
        // onError
        function (errorMsg) {
            //showThumbnail(documentId.substr(4, documentId.length - 1));
        }
    )
}

function selectInViewer(objectIds) {
    if (MyVars.viewer) {
        MyVars.viewer.select(objectIds);
    }
}

/////////////////////////////////////////////////////////////////
// Other functions
/////////////////////////////////////////////////////////////////

function showProgress(text, status) {
    var progressInfo = $('#progressInfo');
    var progressInfoText = $('#progressInfoText');
    var progressInfoIcon = $('#progressInfoIcon');

    var oldClasses = progressInfo.attr('class');
    var newClasses = "";
    var newText = text;

    if (status === 'failed') {
        newClasses = 'btn btn-danger';
    } else if (status === 'inprogress' || status === 'pending') {
        newClasses = 'btn btn-warning';
        if (MyVars.cancellableOperation) {
            newText += " (Click to stop)";
        }
    } else if (status === 'success') {
        newClasses = 'btn btn-success';
    } else {
        newClasses = 'btn btn-info';
        newText = "Progress info"
    }

    // Only update if changed
    if (progressInfoText.text() !== newText) {
        progressInfoText.text(newText);
    }

    if (oldClasses !== newClasses) {
        progressInfo.attr('class', newClasses);

        if (newClasses === 'btn btn-warning') {
            progressInfoIcon.attr('class', 'glyphicon glyphicon-refresh glyphicon-spin');
        } else {
            progressInfoIcon.attr('class', '');
        }
    }
}

// *******************************************
// Property Inspector Extension
// *******************************************
function PropertyInspectorExtension(viewer, options) {
    Autodesk.Viewing.Extension.call(this, viewer, options);
    this.panel = null;
}

PropertyInspectorExtension.prototype = Object.create(Autodesk.Viewing.Extension.prototype);
PropertyInspectorExtension.prototype.constructor = PropertyInspectorExtension;

PropertyInspectorExtension.prototype.load = function () {
    if (this.viewer.toolbar) {
        // Toolbar is already available, create the UI
        this.createUI();
    } else {
        // Toolbar hasn't been created yet, wait until we get notification of its creation
        this.onToolbarCreatedBinded = this.onToolbarCreated.bind(this);
        this.viewer.addEventListener(av.TOOLBAR_CREATED_EVENT, this.onToolbarCreatedBinded);
    }
    return true;
};

PropertyInspectorExtension.prototype.onToolbarCreated = function () {
    this.viewer.removeEventListener(av.TOOLBAR_CREATED_EVENT, this.onToolbarCreatedBinded);
    this.onToolbarCreatedBinded = null;
    this.createUI();
};

PropertyInspectorExtension.prototype.createUI = function () {
    var viewer = this.viewer;
    var panel = this.panel;

    // button to show the docking panel
    var toolbarButtonShowDockingPanel = new Autodesk.Viewing.UI.Button('showPropertyInspectorPanel');
    toolbarButtonShowDockingPanel.icon.classList.add("adsk-icon-properties");
    toolbarButtonShowDockingPanel.container.style.color = "orange";
    toolbarButtonShowDockingPanel.onClick = function (e) {
        // if null, create it
        if (panel == null) {
            panel = new PropertyInspectorPanel(viewer, viewer.container, 'AllPropertiesPanel', 'All Properties');
            panel.showProperties(viewer.model.getRootId());
        }
        // show/hide docking panel
        panel.setVisible(!panel.isVisible());
    };

    toolbarButtonShowDockingPanel.addClass('propertyInspectorToolbarButton');
    toolbarButtonShowDockingPanel.setToolTip('Property Inspector Panel');

    // SubToolbar
    this.subToolbar = new Autodesk.Viewing.UI.ControlGroup('PropertyInspectorToolbar');
    this.subToolbar.addControl(toolbarButtonShowDockingPanel);

    viewer.toolbar.addControl(this.subToolbar);
};

PropertyInspectorExtension.prototype.unload = function () {
    this.viewer.toolbar.removeControl(this.subToolbar);
    return true;
};

Autodesk.Viewing.theExtensionManager.registerExtension('PropertyInspectorExtension', PropertyInspectorExtension);

// *******************************************
// Property Inspector Extension
// *******************************************

function PropertyInspectorPanel(viewer, container, id, title, options) {
    this.viewer = viewer;
    this.breadcrumbsItems = [];
    Autodesk.Viewing.UI.PropertyPanel.call(this, container, id, title, options);

    this.showBreadcrumbs = function () {
        // Create it if not there yet
        if (!this.breadcrumbs) {
            this.breadcrumbs = document.createElement('span');
            this.title.appendChild(this.breadcrumbs);
        } else {
            while (this.breadcrumbs.firstChild) {
                this.breadcrumbs.removeChild(this.breadcrumbs.firstChild);
            }
        }

        // Fill it with items
        this.breadcrumbs.appendChild(document.createTextNode(' ['));
        this.breadcrumbsItems.forEach(dbId => {
            if (this.breadcrumbs.children.length > 0) {
                var text = document.createTextNode(' > ');
                this.breadcrumbs.appendChild(text);
            }

            var item = document.createElement('a');
            item.innerText = dbId;
            item.style.cursor = "pointer";
            item.onclick = this.onBreadcrumbClick.bind(this);
            this.breadcrumbs.appendChild(item);
        });
        this.breadcrumbs.appendChild(document.createTextNode(']'));
    }; // showBreadcrumbs

    this.showProperties = function (dbId) {
        this.removeAllProperties();

        var that = this;
        this.viewer.getProperties(dbId, props => {
            props.properties.forEach(prop => {
                that.addProperty(
                    prop.displayName + ((prop.type === 11) ? "[dbId]" : ""),
                    prop.displayValue,
                    prop.displayCategory
                );
            });
        });

        this.breadcrumbsItems.push(dbId);
        this.showBreadcrumbs();
    }; // showProperties

    this.onBreadcrumbClick = function (event) {
        var dbId = parseInt(event.currentTarget.text);
        var index = this.breadcrumbsItems.indexOf(dbId)
        this.breadcrumbsItems = this.breadcrumbsItems.splice(0, index);

        this.showProperties(dbId);
    }; // onBreadcrumbClicked

    // This is overriding the default property click handler
    // of Autodesk.Viewing.UI.PropertyPanel
    this.onPropertyClick = function (property) {
        if (!property.name.includes("[dbId]")) {
            return;
        }

        var dbId = property.value;
        this.showProperties(dbId);
    }; // onPropertyClick

    this.onSelectionChanged = function (event) {
        var dbId = event.dbIdArray[0];

        if (!dbId) {
            dbId = this.viewer.model.getRootId();
        }

        this.breadcrumbsItems = [];
        this.showProperties(dbId);
    } // onSelectionChanged

    viewer.addEventListener(
        Autodesk.Viewing.SELECTION_CHANGED_EVENT,
        this.onSelectionChanged.bind(this)
    );
}; // PropertyInspectorPanel
PropertyInspectorPanel.prototype = Object.create(Autodesk.Viewing.UI.PropertyPanel.prototype);
PropertyInspectorPanel.prototype.constructor = PropertyInspectorPanel;

