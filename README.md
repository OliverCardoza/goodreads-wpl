## TODO

CSS: https://dohliam.github.io/dropin-minimal-css/

## Demo

https://olivercardoza.com/goodreads-wpl

## Development

Below is only needed when working with Firebase functions. I'm behind the times
when it comes to Node/NPM dev (NVM?), commands below work but may not be recommended.

*    sudo apt-get install node npm
*    sudo npm install -g firebase-tools
*    (cd functions && npm install)

## Debugging

Start local webserver:

    firebase login
    firebase functions:shell

Call function:

    curl localhost:5000/goodreads-library-345d3/us-central1/getBooks?goodreadsUserId=100923376-wpl-test
    curl localhost:5000/goodreads-library-345d3/us-central1/getGoodreadsBooks?goodreadsUserId=100923376-wpl-test

   
