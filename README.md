## Debugging

Start local webserver:

    firebase functions:shell

Call function:

    curl localhost:5000/goodreads-library-345d3/us-central1/getBooks?goodreadsUserId=11714314-oliver
    curl localhost:5000/goodreads-library-345d3/us-central1/getBooks?goodreadsUserId=100923376-wpl-test
