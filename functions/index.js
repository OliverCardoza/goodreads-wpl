const functions = require("firebase-functions");
const requestPromise = require("request-promise");
const xml2js = require("xml2js");

/**
 * Goodreads API to retrieve the list of books to read.
 * Docs: https://www.goodreads.com/api/
 */
class GoodreadsApi {
  constructor() {
    /**
     * The key identifying this application to Goodreads.
     * It's better practice to not check this in but since it's only used for
     * reads it's not a big deal.
     * Docs: https://www.goodreads.com/api/keys
     */ 
    this.goodreadsKey = "vX4SiJZGCXiLglZ0FndqA";
  }

  /**
   * Returns a promise resolving to a list of "to-read" books for the given
   * Goodreads user id. Under the hood this uses makes a HTTP request and
   * parses the XMl response (json not supported :/).
   * Docs: https://www.goodreads.com/api/index#reviews.list
   */
  getBooksToRead(goodreadsUserId) {
    console.log(`Requesting books for user ${goodreadsUserId}`);
    const options = {
      uri: "https://www.goodreads.com/review/list",
      qs: {
        "v": 2,
        "id": goodreadsUserId, // User-provided value, proceed with caution.
        "shelf": "to-read",
        "format": "xml", // No JSON :/
        // TODO set back to 200
        "per_page": 10, // TODO: Support list of >200 with paging.
        "key": this.goodreadsKey,
      },
    };
    return requestPromise(options)
      .then((response) => {
        return this.getBooksFromXmlResponse(response);
      })
      .catch((error) => {
        console.log("found error");
        console.log(error);
        return error;
      });
  }

  /**
   * Retrieves a list of books from a Goodreads XML response.
   */
  getBooksFromXmlResponse(xmlResponse) {
    return new Promise((resolve, reject) => {
      xml2js.parseString(xmlResponse, (err, result) => {
        if (err) {
          console.log("Error parsing XML");
          reject(err);
        }
        // TODO: Be more defensive if fields missing. 
        const reviews = result.GoodreadsResponse.reviews[0];
        const books = [];
        for (let review of reviews.review) {
          const grBook = review.book[0]
          const book = {
            title: grBook.title[0],
            isbn: grBook.isbn[0],
            imageUrl: grBook.image_url[0],
          }
          book.imageUrl =
              this.maybeGetFallbackCoverUrl(book.imageUrl, book.isbn);
          books.push(book);
        }
        console.log(`Returning ${books.length} books`);
        resolve(books);
      });
    });
  }

  /**
   * Gets an alternative image URL for book cover if Goodreads is missing one.
   * Goodreads doesn't have a licence to distribute all book covers so fall
   * back to openlibrary.org
   * https://www.goodreads.com/topic/show/18208456-api-issue---cover-images
   */
  maybeGetFallbackCoverUrl(goodreadsImageUrl, isbn) {
    if (goodreadsImageUrl.indexOf("nophoto") !== -1) {
      return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
    }
    return goodreadsImageUrl;
  }
}
const goodreadsApi = new GoodreadsApi();


/**
 * Waterloo Public Library API to retrieve book availability info.
 */
class WaterlooPublicLibraryApi {
  constructor() {
  }

  /**
   * Returns book availability at the library based on ISBN.
   */
  getBookAvailability(isbn) {
    console.log(`Requesting book availability for ISBN: ${isbn}`);
    const options = {
      uri: "https://www.goodreads.com/review/list",
      qs: {
        "v": 2,
        "id": goodreadsUserId, // User-provided value, proceed with caution.
        "shelf": "to-read",
        "format": "xml", // No JSON :/
        // TODO set back to 200
        "per_page": 10, // TODO: Support list of >200 with paging.
        "key": this.goodreadsKey,
      },
    };
    return requestPromise(options)
      .then((response) => {
        return this.getBooksFromXmlResponse(response);
      })
      .catch((error) => {
        console.log("found error");
        console.log(error);
        return error;
      });
  }
}

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.getBooks = functions.https.onRequest((request, response) => {
  // console.log('getting info for book: 0553380966 ');
  // return;

  if (!request.query.goodreadsUserId) {
    console.log("Missing goodreadsUserId URL param");
    response.status(400).send("Missing goodreadsUserId URL param");
    return;
  }

  return goodreadsApi.getBooksToRead(request.query.goodreadsUserId)
    .then((books) => {
      response
        // Disable CORS for prototyping
        // TODO: Re-enable and specify domain used
        .set("Access-Control-Allow-Origin", "*")
        .json(books);
      return;
    });
});
