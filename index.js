

console.log("Hello Console");

class RequestQueue {
  constructor(maxParallelRequests) {
    // The maxmimum number of parallel requests that can be in flight.
    this.maxParallelRequests_ = maxParallelRequests;
  
    // Array of XMLHttpRequest objects that have been sent but not resolved yet.
    this.activeRequests_ = [];

    // Array of XMLHttpRequest objects that have not been sent yet.
    this.pendingRequests_ = [];
  }

  addRequest(request) {
    request.addEventListener("load", () => {
      this.onRequestLoad_(request);
    });
    this.pendingRequests_.push(request);
    this.maybeQueueRequest_();
  }
  
  onRequestLoad_(request) {
    const requestIndex = this.activeRequests_.indexOf(request);
    if (requestIndex === -1) {
      console.log("Error: unable to find request to remove from activeRequests");
    } else {
      // Remove finished request from active array.
      this.activeRequests_.splice(requestIndex, 1);
    }
    this.maybeQueueRequest_();
  }
  
  maybeQueueRequest_() {
    if (this.activeRequests_.length === this.maxParallelRequests_ ||
        this.pendingRequests_.length === 0) {
      return;
    }
    const request = this.pendingRequests_.shift();
    this.activeRequests_.push(request);
    request.send();
  }
}

// TODO: retry load if goodreads-id changes
// TODO: actually make request once have Firebase project.

const AppStateEnum = {
  UNINITIALIZED: "Uninitialized",
  LOADING_GOODREADS: "Loading Goodreads books...",
  LOADING_LIBRARY: "Loading Library book data...",
  ERROR: "Error, oh no!",
  LOADED: "Loaded",
};

const SimpleStateEnum = {
  UNINITIALIZED: "Uninitialized",
  LOADING: "Loading...",
  ERROR: "Error, oh no!",
  LOADED: "Loaded!",
};

const LibraryAvailabilityEnum = {
  UNDEFINED: "Undefined",
  AVAILABLE: "Available",
  UNAVAILABLE: "Unavailable",
  NO_MATCHES: "No Matches",
};

const GOODREADS_PROFILE_ID_PARAM = "goodreadsProfileId";

const DEFAULT_GOODREADS_PROFILE_ID = "100923376-wpl-test";

class GoodreadsWplApp {
  constructor() {
    // The Goodreads Profile ID currently in use on the app.
    this.currentGoodreadsProfileId = "";

    // The primary data store for the app which is an Array of books.
    // This array is mutated after fetching data from Goodreads and again after checking
    // library availability.
    this.books = [];
    
    // List of books indices from the `books` array with data still being loaded.
    // this.booksIndicesLoading = [];
    
    // State of the app.
    this.state = AppStateEnum.UNINITIALIZED;
    
    this.requestQueue = new RequestQueue(5 /* maxParallelRequests */);
  }

  getGoodreadsIdInput() {
    return document.getElementById("goodreadsId");
  }
  
  getSubmitButton() {
    return document.getElementById("submit");
  }

  getOverallStatusElement() {
    return document.getElementById("overallStatus");
  }

  getGoodreadsStatusElement() {
    return document.getElementById("goodreadsStatus");
  }

  getWplStatusElement() {
    return document.getElementById("wplStatus");
  }

  getBooksAvailableToggle() {
    return document.getElementById("booksAvailableToggle");
  }

  getBooksUnavailableToggle() {
    return document.getElementById("booksUnavailableToggle");
  }

  getBooksNoMatchesToggle() {
    return document.getElementById("booksNoMatchesToggle");
  }

  init() {
    this.registerEventListeners();

    let goodreadsProfileId = this.getGoodreadsProfileIdFromUrl();
    if (!goodreadsProfileId) {
      goodreadsProfileId = DEFAULT_GOODREADS_PROFILE_ID;
    }
    this.getGoodreadsIdInput().value = goodreadsProfileId;
    this.loadBooks(goodreadsProfileId, /* updateUrlParam= */ false);
  }

  registerEventListeners() {
    this.getSubmitButton().addEventListener("click", (event) => this.onSubmitClicked(event));
    this.getGoodreadsIdInput().addEventListener("keydown", (event) => {
      if (event.key == "Enter") {
        this.onSubmitClicked(event);
      }
    });

    this.getBooksAvailableToggle()
        .addEventListener("click", (event) => this.onFilterClicked(event));
    this.getBooksUnavailableToggle()
        .addEventListener("click", (event) => this.onFilterClicked(event));
    this.getBooksNoMatchesToggle()
        .addEventListener("click", (event) => this.onFilterClicked(event));
  }

  getGoodreadsProfileIdFromUrl() {
    const url = new URL(window.location);
    return url.searchParams.get(GOODREADS_PROFILE_ID_PARAM);
  }

  onSubmitClicked(event) {
    const goodreadsProfileId = this.getGoodreadsIdInput().value;
    if (goodreadsProfileId &&
        goodreadsProfileId != this.currentsGoodreadsProfileId) {
      this.loadBooks(goodreadsProfileId, /* updateUrlParam= */ true);
    } else {
      this.setState(AppStateEnum.UNINITIALIZED);
    }
  }

  onFilterClicked(event) {
    for (let [index, book] of this.books.entries()) {
      this.updateBookVisibility(index);
    }
  }

  updateBookVisibility(bookIndex) {
    const showAvailable = this.getBooksAvailableToggle().checked;
    const showUnavailable = this.getBooksUnavailableToggle().checked;
    const showNoMatches = this.getBooksNoMatchesToggle().checked;
    const book = this.books[bookIndex];
    const availability = this.getLibraryAvailabilityEnum(book.libraryBooks);
    const displayBook =
        showAvailable && availability == LibraryAvailabilityEnum.AVAILABLE ||
        showUnavailable && availability == LibraryAvailabilityEnum.UNAVAILABLE ||
        showNoMatches && availability == LibraryAvailabilityEnum.NO_MATCHES;
    const bookEl = document.querySelector(`#book${bookIndex}`);
    bookEl.style.display = displayBook ? "flex" : "none";
  }

  getLibraryAvailabilityEnum(libraryBooks) {
    if (!libraryBooks) {
      return LibraryAvailabilityEnum.NO_MATCHES;
    }
    let hasMatches = false;
    const availableRegex = /CHECK SHELVES/i;
    for (const libraryBook of libraryBooks) {
      if (libraryBook.availabilities) {
        hasMatches = true;
      }
      for (const availability of libraryBook.availabilities) {
        if (availability.status.match(availableRegex)) {
          return LibraryAvailabilityEnum.AVAILABLE;
        }
      }
    }
    return hasMatches
      ? LibraryAvailabilityEnum.UNAVAILABLE
      : LibraryAvailabilityEnum.NO_MATCHES;
  }

  loadBooks(goodreadsProfileId, updateUrlParam) {
    if (updateUrlParam) {
      window.history.pushState(
          goodreadsProfileId,
          goodreadsProfileId,
          `?${GOODREADS_PROFILE_ID_PARAM}=${goodreadsProfileId}`);
    }
    this.currentGoodreadsProfileId = goodreadsProfileId;
    this.setState(AppStateEnum.LOADING_GOODREADS);
    this.fetchGoodreadsBooks(goodreadsProfileId).then((responseData) => {
      this.setGoodreadsBooks(responseData.goodreadsBooks);
      this.setState(AppStateEnum.LOADING_LIBRARY);
      this.fetchLibraryData().then(() => {
        this.setState(AppStateEnum.LOADED);
      });
    });
  }
  
  fetchGoodreadsBooks(profileId) {
    console.log(`Loading Goodreads data for profile ${profileId}`);
    const request = new XMLHttpRequest();
    const requestUrl = `https://us-central1-goodreads-library-345d3.cloudfunctions.net/getGoodreadsBooks?goodreadsUserId=${profileId}`;
    request.open("GET", requestUrl);
    return new Promise((resolve, reject) => {
      request.send();
      request.onload = () => {
        // Think this is probably unsafe. Relies on Goodreads to not be compromised.
        // Should do some sanitizing in the Firebase function.
        const responseData = JSON.parse(request.response);
        console.log(responseData);
        console.log(`Firebase returned ${responseData.goodreadsBooks.length} books`);
        resolve(responseData);
      };
    });
  }
  
  setGoodreadsBooks(goodreadsBooks) {
    this.books = goodreadsBooks.map((goodreadsBook, index) => {
      return {
        index: index,
        goodreadsBook: goodreadsBook,
        libraryBook: {},
      };
    });
    const booksTemplate = document.querySelector("#goodreadsBooksTemplate").innerText;
    const booksOutputEl = document.querySelector("#booksOutput");
    const booksOutput = Mustache.render(booksTemplate, {books: this.books});
    booksOutputEl.innerHTML = booksOutput;
  }
  
  setState(state) {
    this.state = state;
    this.getOverallStatusElement().innerHTML = this.state;

    if (this.state == AppStateEnum.UNINITIALIZED) {
      this.getGoodreadsStatusElement().innerHTML = SimpleStateEnum.UNINITIALIZED;
      this.getWplStatusElement().innerHTML = SimpleStateEnum.UNINITIALIZED;
    } else if (this.state == AppStateEnum.LOADING_GOODREADS) {
      this.getGoodreadsStatusElement().innerHTML = SimpleStateEnum.LOADING;
      this.getWplStatusElement().innerHTML = SimpleStateEnum.UNINITIALIZED;
    } else if (this.state == AppStateEnum.LOADING_LIBRARY) {
      this.getGoodreadsStatusElement().innerHTML = SimpleStateEnum.LOADED;
      this.setLibraryStatus(/* booksLoaded= */ 0, this.books.length);
    } else if (this.statue == AppStateEnum.ERROR) {
      this.getGoodreadsStatusElement().innerHTML = SimpleStateEnum.ERROR;
      this.getWplStatusElement().innerHTML = SimpleStateEnum.ERROR;
    }
  }
  
  setLibraryStatus(booksLoaded, totalBooks) {
    const percentLoaded = Math.round((booksLoaded / totalBooks) * 100);
    this.getWplStatusElement().innerHTML =
        `${percentLoaded}% loaded (${booksLoaded} / ${totalBooks} books)`;
  }
  
  fetchLibraryData() {
    const libraryPromises = [];
    let booksLoaded = 0;
    // Load library data one at a time to limit active requests to WPL site.
    for (let [index, book] of this.books.entries()) {
      const libraryPromise = this.fetchLibraryBooks(book).then((libraryBooks) => {
        book.libraryBooks = libraryBooks;
        this.updateBookVisibility(index);
        const libraryBooksEl = document.querySelector(`#libraryBook${book.index}`);
        this.renderLibraryBooks(libraryBooks, libraryBooksEl);
        booksLoaded++;
        this.setLibraryStatus(booksLoaded, this.books.length);
      });
      libraryPromises.push(libraryPromise);
    }
    return Promise.all(libraryPromises);
  }

  renderLibraryBooks(libraryBooks, libraryBooksEl) {
    let htmlContent;
    if (libraryBooks && libraryBooks.length) {
      const libraryBooksTemplate = document.querySelector("#libraryBooksTemplate").innerText;
      htmlContent = Mustache.render(libraryBooksTemplate, {libraryBooks: libraryBooks});
    } else {
      const libraryBooksEmptyTemplate =
          document.querySelector("#libraryBooksEmptyTemplate").innerText;
      htmlContent = Mustache.render(libraryBooksEmptyTemplate, {});
    }
    libraryBooksEl.innerHTML = htmlContent;
  }
  
  fetchLibraryBooks(book) {
    console.log(book);
    console.log(`Fetching library books for title: ${book.goodreadsBook.title}`);

    const request = new XMLHttpRequest();
    const params = {
      title: book.goodreadsBook.title,
      author: book.goodreadsBook.author,
      isbn: book.goodreadsBook.isbn,
      isbn13: book.goodreadsBook.isbn13,
    };
    const queryString = Object.keys(params).reduce((reducer, key) => {
      return reducer.concat(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]) + "&");
    }, "");
    const requestUrl = `https://us-central1-goodreads-library-345d3.cloudfunctions.net/getLibraryStatus?${queryString}`;
    request.open("GET", requestUrl);
    return new Promise((resolve, reject) => {
      request.addEventListener("load", () => {
        // Think this is probably unsafe. Relies on Goodreads to not be compromised.
        // Should do some sanitizing in the Firebase function.
        const responseData = JSON.parse(request.response);
        console.log(`Firebase returned ${responseData.libraryBooks.length} library books`);
        resolve(responseData.libraryBooks);
      });
      this.requestQueue.addRequest(request);
    });
  }
}

const app = new GoodreadsWplApp();
app.init();

console.log("Goodbye Console");


