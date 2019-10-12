function getBucketKeyObjectName(objectId) {
    // the objectId comes in the form of
    // urn:adsk.objects:os.object:BUCKET_KEY/OBJECT_NAME
    var objectIdParams = objectId.split('/');
    var objectNameValue = objectIdParams[objectIdParams.length - 1];
    // then split again by :
    var bucketKeyParams = objectIdParams[objectIdParams.length - 2].split(':');
    // and get the BucketKey
    var bucketKeyValue = bucketKeyParams[bucketKeyParams.length - 1];

    var ret = {
        bucketKey: decodeURIComponent(bucketKeyValue),
        objectName: decodeURIComponent(objectNameValue)
    };

    return ret;
}

function setTimeoutPromise(delayms) {
    return new Promise(function (resolve, reject) {
        setTimeout(resolve, delayms);
    });
}

module.exports = {
    getBucketKeyObjectName: getBucketKeyObjectName,
    setTimeoutPromise: setTimeoutPromise
}