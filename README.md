# Model Updater

AppBundles are created from these three apps:
- **GetZipContents** AppBundle: Created from AppBundles\GetZipContentsExe \
**Note**: GetZipContents folder contains a **.NET Core** version of GetZipContentsExe and that did not seem to work on **DA**
- **ExtractUserParams** AppBundle: Created from https://github.com/adamenagy/parameter-extractor
- **UpdateModel** AppBundle: Created from AppBundles\UpdateUserParams

Activity setups can be found in the source code

## URL query strings

The URL accepts some parameters:
- **client_id**: Client ID of the Forge application you want to use
- **client_secret**: Client Secret of the Forge application you want to use
Note: the above two help with not having to type them in every time you want to use the sample 
- **force_setup**: set to "true" to force the setup of the various AppBundles and Activities that the sample is using. By defult if such things with the given name already exist for the given Forge application then the sample will assume that they are set up correctly and are ready to use

# Live version

[https://forge-model-updater.herokuapp.com/](https://forge-model-updater.herokuapp.com/)

You can also specify the client credentials in the URL so you don't have to type them again and again:
e.g. https://forge-model-updater.herokuapp.com/?client_id=%3Cmy%20client%20id%3E&client_secret=%3Cmy%20client%20secret%3E#

[See youtube video showing how to use it](https://youtu.be/yvCk5v4ZE3U)

# Local testing

When testing locally run `ngrok http 3000 -host-header="localhost:3000"` and set environment variables based on that

