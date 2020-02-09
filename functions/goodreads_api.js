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
      if (booksForPage.length === 0) {
        // Reached the end, have all results.
        break;
      }
      books = books.concat(booksForPage);
      console.log(`[goodreads][${goodreadsUserId}]: Found ${books.length} books so far...`);
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
        // Log error with user id here but propagate up for handling.
        console.log(`[goodreads][${goodreadsUserId}]: Error loading books from Goodreads.`);
        throw error;
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
        if (!result || !result.GoodreadsResponse) {
          console.log("Found no GoodreadsResponse in xml2js result.");
          resolve(books);
          return;
        }
        const reviews = this.getXmlProperty(result.GoodreadsResponse, "reviews");
        if (!reviews || !reviews.review) {
          resolve(books);
          return;
        }
        for (let review of reviews.review) {
          const grBook = this.getXmlProperty(review, "book", null /* defaultValue */);
          const book = {
            title: this.getXmlProperty(grBook, "title"),
            isbn: this.getXmlProperty(grBook, "isbn"),
            isbn13: this.getXmlProperty(grBook, "isbn13"),
            goodreadsUrl: this.getXmlProperty(grBook, "link"),
            imageUrl: this.getXmlProperty(grBook, "image_url", null /* defaultValue */),
            author: this.getAuthorForBook(grBook),
          };
          book.imageUrl =
              this.maybeGetFallbackCoverUrl(book.imageUrl, book.isbn);
          books.push(book);
        }
        resolve(books);
      });
    });
  }

  /**
   * Gets author for a book. This simplifies by returning the first author name if there are
   * multiple.
   */
  getAuthorForBook(grBook) {
    const authors = this.getXmlProperty(grBook, "authors", null /* defaultValue */);
    if (!authors || !authors.author || authors.author.length === 0) {
      return "";
    }
    return this.getXmlProperty(authors.author[0], "name");
  }

  /**
   * Retrieves a property from an xml2js object. xml2js parses properties into
   * an array even if it's not repeated. This will return the first value if
   * multiple are defined.
   */
  getXmlProperty(xmlObject, propertyName, defaultValue="") {
    if (!xmlObject || !xmlObject[propertyName] || xmlObject[propertyName].length === 0) {
      return defaultValue;
    }
    const propertyValue = xmlObject[propertyName][0];
    if (typeof propertyValue === "object" &&
        propertyValue["$"] &&
        propertyValue["$"]["nil"] &&
        propertyValue["$"]["nil"] === "true") {
      // Goodreads API returns <isbn nil="true" /> for empty nodes.
      return defaultValue;
    }
    return propertyValue;
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
 
