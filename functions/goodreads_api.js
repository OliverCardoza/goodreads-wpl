const requestPromise = require("request-promise");
const xml2js = require("xml2js");

const constants = require("./constants");

// The number of pages of results to request from Goodreads.
const MAX_GOODREADS_PAGES = 10;
// The number of books to request per page of results from Goodreads.
const BOOKS_PER_PAGE = 20;

/**
 * Goodreads API to retrieve the list of books to read.
 * Docs: https://www.goodreads.com/api/
 */
class GoodreadsApi {
  constructor() {
    /**
     * The key identifying this application to Goodreads.
     * It's better practice to not check this in to git but since it's only
     * used for reads it's not a big deal.
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
  async getBooksToRead(goodreadsUserId) {
    console.log(`[goodreads][${goodreadsUserId}]: Requesting books on "to-read" shelf.`);
    let books = [];
    let pageIndex = 1;
    // Max out requesting 10 pages.
    /* eslint-disable no-await-in-loop */
    while (pageIndex < MAX_GOODREADS_PAGES) {
      const booksForPage =
          await this.getBooksToReadForPage(goodreadsUserId, pageIndex, BOOKS_PER_PAGE);
      books = books.concat(booksForPage);
      console.log(`[goodreads][${goodreadsUserId}]: Found ${books.length} books so far...`);
      if (booksForPage.length === 0) {
        // Reached the end, have all results.
        break;
      }
      pageIndex++;
    }
    /* eslint-enable no-await-in-loop */
    console.log(`[goodreads][${goodreadsUserId}]: Found ${books.length} books on the "to-read" shelf.`);
    return books;
  }

  /**
   * Returns a promise resolving to a list of "to-read" books for the given
   * Goodreads user id. Under the hood this uses makes a HTTP request and
   * parses the XMl response (json not supported :/).
   * The pageIndex param uses 1 as the first index.
   * Docs: https://www.goodreads.com/api/index#reviews.list
   */
  getBooksToReadForPage(goodreadsUserId, pageIndex, booksPerPage) {
    const options = {
      uri: "https://www.goodreads.com/review/list",
      qs: {
        "v": 2,
        "id": goodreadsUserId, // User-provided value, proceed with caution.
        "shelf": "to-read",
        "format": "xml", // No JSON :/
        "page": pageIndex,
        "per_page": booksPerPage,
        "key": this.goodreadsKey,
      },
      headers: constants.COMMON_HEADERS,
    };
    return requestPromise(options)
      .then((response) => {
        return this.getBooksFromXmlResponse(response, goodreadsUserId);
      })
      .catch((error) => {
        console.log(`[goodreads][${goodreadsUserId}]: found error`);
        console.log(error);
        return error;
      });
  }

   /**
   * Retrieves a list of books from a Goodreads XML response.
   */
  getBooksFromXmlResponse(xmlResponse, goodreadsUserId) {
    return new Promise((resolve, reject) => {
      xml2js.parseString(xmlResponse, (err, result) => {
        if (err) {
          console.log(`[goodreads][${goodreadsUserId}]: Error parsing XML`);
          reject(err);
          return;
        }
        const books = [];
        if (result && result.GoodreadsResponse && result.GoodreadsResponse.reviews &&
            result.GoodreadsResponse.reviews.length > 0 &&
            result.GoodreadsResponse.reviews[0].review &&
            result.GoodreadsResponse.reviews[0].review.length > 0) {
          const reviews = result.GoodreadsResponse.reviews[0].review;
          for (let review of reviews) {
            if (review.book && review.book.length > 0) {
              const grBook = review.book[0];
              const book = {
                title: grBook.title.length > 0 ? grBook.title[0] : "",
                isbn: grBook.isbn.length > 0 ? grBook.isbn[0] : "",
                imageUrl: grBook.image_url.length > 0 ? grBook.image_url[0] : null,
              };
              book.imageUrl =
                  this.maybeGetFallbackCoverUrl(book.imageUrl, book.isbn);
              books.push(book);
            }
          }
        }
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
    if (goodreadsImageUrl && goodreadsImageUrl.indexOf("nophoto") !== -1) {
      return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
    }
    return goodreadsImageUrl;
  }
}

module.exports = GoodreadsApi;
 
