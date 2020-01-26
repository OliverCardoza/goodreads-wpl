

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
  ERROR: "Error",
  LOADED: "Loaded",
};

const GOODREADS_PROFILE_ID_PARAM = "goodreadsProfileId";

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
    
    // Percentage of books with library data.
    this.libraryLoadedPercent = 0;
    
    this.requestQueue = new RequestQueue(5 /* maxParallelRequests */);
  }

  getGoodreadsIdInput() {
    return document.getElementById("goodreads-id");
  }
  
  getSubmitButton() {
    return document.getElementById("submit");
  }

  init() {
    this.getSubmitButton().addEventListener("click", (event) => this.onSubmitClicked(event));
    this.getGoodreadsIdInput().addEventListener("keydown", (event) => {
      if (event.key == "Enter") {
        this.onSubmitClicked(event);
      }
    });

    const goodreadsProfileId = this.getGoodreadsProfileIdFromUrl();
    if (goodreadsProfileId) {
      this.getGoodreadsIdInput().value = goodreadsProfileId;
      this.loadBooks(goodreadsProfileId);
    } else {
      this.setState(AppStateEnum.UNINITIALIZED);
    }
  }

  getGoodreadsProfileIdFromUrl() {
    const url = new URL(window.location);
    return url.searchParams.get(GOODREADS_PROFILE_ID_PARAM);
  }

  onSubmitClicked(event) {
    const goodreadsProfileId = this.getGoodreadsIdInput().value;
    if (goodreadsProfileId &&
        goodreadsProfileId != this.currentsGoodreadsProfileId) {
      window.history.pushState(
          goodreadsProfileId,
          goodreadsProfileId,
          `?${GOODREADS_PROFILE_ID_PARAM}=${goodreadsProfileId}`);
      this.loadBooks(goodreadsProfileId);
    } else {
      this.setState(AppStateEnum.UNINITIALIZED);
    }
  }

  loadBooks(goodreadsProfileId) {
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
    document.querySelector("#statusOutput").innerHTML = this.state;
  }
  
  setLibraryLoadedPercent(libraryLoadedPercent) {
    this.libraryLoadedPercent = libraryLoadedPercent;
    document.querySelector("#libraryPercentLoadedOutput").innerHTML = this.libraryLoadedPercent + "%";
  }
  
  async fetchLibraryData() {
    const libraryBooksTemplate = document.querySelector("#libraryBooksTemplate").innerText;
    let booksLoaded = 0;
    // Load library data one at a time to limit active requests to WPL site.
    for (let [index, book] of this.books.entries()) {
      this.fetchLibraryBooks(book).then((libraryBooks) => {
        book.libraryBooks = libraryBooks;
        const libraryBooksEl = document.querySelector(`#libraryBook${book.index}`);
        libraryBooksEl.innerHTML = Mustache.render(libraryBooksTemplate, {libraryBooks: book.libraryBooks});
        booksLoaded++;
        this.setLibraryLoadedPercent(Math.round((booksLoaded / this.books.length) * 100));
      });
    }
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


