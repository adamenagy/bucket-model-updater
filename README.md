AppBundles are created from these three apps:
- **GetZipContents** AppBundle: Created from AppBundles\GetZipContentsExe \
**Note**: GetZipContents folder contains a **.NET Core** version of GetZipContentsExe and that did not seem to work on **DA**
- **ExtractUserParams** AppBundle: Created from https://github.com/adamenagy/parameter-extractor
- **UpdateModel** AppBundle: Created from AppBundles\UpdateUserParams

Activity setups can be found in the source code

The URL accepts some parameters:
- **client_id**: Client ID of the Forge application you want to use
- **client_secret**: Client Secret of the Forge application you want to use
Note: the above two help with not having to type them in every time you want to use the sample 
- **force_setup**: set to "true" to force the setup of the various AppBundles and Activities that the sample is using. By defult if such things with the given name already exist for the given Forge application then the sample will assume that they are set up correctly and are ready to use

e.g. https://forge-model-updater.herokuapp.com/?client_id=<client id>&client_secret=<client secret>&force_setup=true#

When testing locally run `ngrok http 3000 -host-header="localhost:3000"` and set environment variables based on that

