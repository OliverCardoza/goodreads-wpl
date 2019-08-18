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

exports.getGoodreadsBooks = functions.runWith(runtimeOpts).https.onRequest((request, response) => {
  if (!request.query.goodreadsUserId) {
    console.log("Missing goodreadsUserId URL param");
    response.status(400).send("Missing goodreadsUserId URL param");
    return;
  }

  return goodreadsApi.getBooksToRead(request.query.goodreadsUserId)
    .then((grBooks) => {
      // Disable CORS for prototyping
      // TODO: Re-enable and specify domain used
      response.set("Access-Control-Allow-Origin", "*").json(grBooks);
      return;
    });
});

exports.getLibraryStatus = functions.runWith(runtimeOpts).https.onRequest((request, response) => {
  if (!request.query.title && !request.query.isbn) {
    const errorMessage = "Missing query params: need either title or isbn to look up book";
    console.log(errorMessage);
    response.status(400).send(errorMessage);
    return;
  }
  return wplApi.getBookAvailability(request.query)
    .then((bookAvailability) => {
      response
        // Disable CORS for prototyping
        // TODO: Re-enable and specify domain used
        .set("Access-Control-Allow-Origin", "*")
        .json(bookAvailability);
      return;
    })
});
