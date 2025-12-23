Foundry REST API provides various API endpoints for fetching and interacting with your foundry world data through a node.js server that act as a relay.

Getting started guide
To start using the Foundry REST API, you need to -

Have your API key in the module settings.

Each request must have the your API key in the "x-api-key" header.

Endpoints other than /clients require a clientId parameter that matches a connected world.

https://github.com/ThreeHats/foundryvtt-rest-api-relay/wiki#how-to-use-foundry-rest-api 

Get clients:

curl -X GET https://foundryvtt-rest-api-relay.fly.dev/clients \
  -H "x-api-key: YOUR_API_KEY"

  