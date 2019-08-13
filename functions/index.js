const functions = require("firebase-functions");

const GoodreadsApi = require("./goodreads_api");
const WaterlooPublicLibraryApi = require("./wpl_api");


const goodreadsApi = new GoodreadsApi();
const wplApi = new WaterlooPublicLibraryApi();

const runtimeOpts = {
    timeoutSeconds: 300,
};

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.getBooks = functions.runWith(runtimeOpts).https.onRequest((request, response) => {
  if (!request.query.goodreadsUserId) {
    console.log("Missing goodreadsUserId URL param");
    response.status(400).send("Missing goodreadsUserId URL param");
    return;
  }

  return goodreadsApi.getBooksToRead(request.query.goodreadsUserId)
    .then((grBooks) => {
      // TODO: Limit grBooks which are requested from WPL.
      return Promise.all(grBooks.map((grBook) => {
        return wplApi.getBookAvailability(grBook);
      }));
    })
    .then((books) => {
      response
        // Disable CORS for prototyping
        // TODO: Re-enable and specify domain used
        .set("Access-Control-Allow-Origin", "*")
        .json(books);
      return;
    });
});
