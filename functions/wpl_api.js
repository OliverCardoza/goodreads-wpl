const cheerio = require("cheerio");
const querystring = require("querystring");
const requestPromise = require("request-promise");

const constants = require("./constants");

/**
 * Waterloo Public Library API to retrieve book availability info.
 */
class WaterlooPublicLibraryApi {
  constructor() {
    /** Define a cookie jar to pass cookie auth and avoid redirect loops. */
    this.cookieJar = requestPromise.jar();
    // TODO: This might expire. If it does then rethink this whole request-promise thing.
    // Ideally there should be a request library that can keep cookie state through redirects.
    this.cookieJar.setCookie(
        "JSESSIONID=5100F4DF5A87E8F91095371F6103B93A; Path=/iii/encore_wpl/; HttpOnly",
        "https://encore.kpl.org");
  }

  /**
   * Returns availability at the library for a Goodreads book.
   *
   * This relies primarily on title for now.
   * Originally I planned to use ISBN but it turns out that books often have
   * multiple editions each with a different ISBN. Often times the ISBN of the
   * book on my Goodreads would not match an entry in WPL but WPL would have
   * a different version.
   */
  getBookAvailability(grBook) {
    // TODO: support query without full grBook and potentially ISBN alone.
    const title = grBook.title;
    console.log(`[wpl][${title}]: Searching catalog...`);
    const normalizedTitle = this.normalizeBookTitle(title);
    const encodedTitle = querystring.escape(normalizedTitle);
    const url = `https://encore.kpl.org/iii/encore_wpl/search/C__St:(${encodedTitle})?lang=eng`;
    const options = {
      uri: url,
      qs: {
        "lang": "eng",
      },
      headers: constants.COMMON_HEADERS,
      // Required because some search results pages have some insecure content.
      insecure: true,
      // Inlude a cookie jar to pass cookie-redirect logic in the request flow.
      jar: this.cookieJar,
    };
    return requestPromise(options)
      .then((response) => {
        return this.parseBookSearchResults(response, title);
      })
      .then((bookRecords) => {
        return {
          grBook: grBook,
          libraryBooks: bookRecords,
        };
      })
      .catch((error) => {
        console.log("found error");
        console.log(error);
        return error;
      });
  }

  /**
   * Parses the HTTP Document for a WPL search results page to return a list of book records.
   */
  parseBookSearchResults(response, title) {
    const $ = cheerio.load(response);
    const results = $(".searchResult");
    console.log(`[wpl][${title}]: Found ${results.length} results`);
    const bookRecords = results.map((index, element) => {
      const titleNode = $(element).find(".title");
      const idAttr = $(element).attr("id");
      const recordId = idAttr ? idAttr.replace("resultRecord-", "") : "";
      const recordUrl =
          recordId
              ? `https://encore.kpl.org/iii/encore_wpl/record/C__R${recordId}?lang=eng`
              : "";
      const mediaTypeNode = $(element).find(".itemMediaDescription")
      return {
        title: titleNode.length ? titleNode.first().text().trim(): "",
        recordId: recordId,
        recordUrl: recordUrl,
        mediaType:
            mediaTypeNode.length ? mediaTypeNode.first().text().trim(): "",
      };
    }).get();
    const filteredBookRecords = this.filterBookRecords(title, bookRecords);
    console.log(
        `[wpl][${title}]: Found ${filteredBookRecords.length} after filtering`);
    return Promise.all(filteredBookRecords.map((bookRecord) => {
      return this.getBookRecordAvailability(bookRecord);
    }));
  }

  /**
   * Returns promise with book availability for a book record.
   */
  getBookRecordAvailability(bookRecord) {
    console.log(`[wpl][${bookRecord.recordId}]: Getting availability at ${bookRecord.recordUrl}`);
    const options = {
      uri: bookRecord.recordUrl,
      headers: constants.COMMON_HEADERS,
      // Required because some search results pages have some insecure content.
      insecure: true,
      // Inlude a cookie jar to pass cookie-redirect logic in the request flow.
      jar: this.cookieJar,
    };
    return requestPromise(options)
      .then((response) => {
        bookRecord.availabilities = this.parseBookAvailabilities(response, bookRecord.recordId);
        bookRecord.status = this.createBookStatus(bookRecord.availabilities);
        console.log(`[wpl][${bookRecord.recordId}]: Status = "${bookRecord.status}"`);
        return bookRecord;
      });
  }

  /**
   * Parses the HTTP Document for a WPL book page to return an array of book availabilities.
   */
  parseBookAvailabilities(response, bookRecordId) {
    const $ = cheerio.load(response);
    const rows = $(".itemTable").find("tr");
    if (rows.length === 0) {
      console.log(`[wpl][${bookRecordId}]: Unable to find availability data.`);
      return [];
    }
    // Remove header row.
    const dataRows = rows.slice(1, rows.length);
    const availabilities = dataRows.map((index, dataRowEl) => {
      const dataColumns = $(dataRowEl).find("td");
      if (dataColumns.length < 3) {
        console.log(`[wpl][${bookRecordId}]: Availability row has less than 3 columns`);
        return null;
      }
      return {
        location: dataColumns.eq(0).text().trim(),
        callNumber: dataColumns.eq(1).text().trim(),
        status: dataColumns.eq(2).text().trim(),
      };
    }).get();
    return availabilities.filter((availability) => availability !== null);
  }

  /**
   * Creates a short string status line based on this book's availability.
   *
   * WPL book status has a few options with only "CHECK SHELVES" meaning
   * available. Documenting some options I've seen below:
   * - DUE MM-DD-YY
   * - # HOLD
   * - DAMAGE CHECK
   * - CHECK SHELVES
   * - IN TRANSIT
   */
  createBookStatus(availabilities) {
    const availableRegex = /CHECK SHELVES/i;
    const numAvailable = availabilities.reduce((accumulator, availability) => {
      if (availability && availability.status && availability.status.match(availableRegex)) {
        return accumulator + 1;
      }
      return accumulator;
    }, 0);
    const shortStatus = numAvailable > 0 ? "AVAILABLE" : "NOT AVAILABLE";
    return `${shortStatus}: ${numAvailable} of ${availabilities.length} copies available`;
  }

  /**
   * Normalizes a book title for searching and matching.
   */
  normalizeBookTitle(title) {
    return title.replace(/[^A-Za-z'.\s]/g, "").toLowerCase();
  }

  /**
   * Filters search results to only those appearing to match the intended
   * query.
   */
  filterBookRecords(title, bookRecords) {
    return bookRecords.filter((bookRecord) => {
      return bookRecord.mediaType === "Book";
    });
  }
}

module.exports = WaterlooPublicLibraryApi;
