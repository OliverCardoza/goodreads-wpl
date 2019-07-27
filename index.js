// Copied from my fiddle: https://jsfiddle.net/oliver_law/q1ydgsm6/86/ 



console.log("Hello Console");

// TODO: retry load if goodreads-id changes
// TODO: actually make request once have Firebase project.

class GoodreadsApi {
  constructor() {
    this.request = null;
    
  }
  
  getBooksFirebase() {
    const profileId = document.getElementById("goodreads-id").value;
    console.log(`Loading Goodreads data for profile ${profileId}`);

    this.request = new XMLHttpRequest();
    const requestUrl = `https://us-central1-goodreads-library-345d3.cloudfunctions.net/getBooks?goodreadsUserId=${profileId}`;
    this.request.open("GET", requestUrl);
    this.request.responseType = "xml";
    this.request.send();
    this.request.onload = () => {
      console.log(`Firebase returned ${this.request.response.length} books`);
      // Think this is probably unsafe. Relies on Goodreads to not be compromised.
      // Should do some sanitizing in the Firebase function.
      const books = JSON.parse(this.request.response);
      const booksEl = document.getElementById("books");
      for (let book of books) {
        let bookEl = document.createElement("tr");
        bookEl.innerHTML = `
          <td><img src="${book.imageUrl}" height="100" width="70"/></td>
          <td>${book.title}</td>
          <td>${book.isbn}</td>`;
        booksEl.appendChild(bookEl);
      }
    }
  }
}

const api = new GoodreadsApi();
api.getBooksFirebase();



console.log("Goodbye Console");


