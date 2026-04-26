class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class UpstreamError extends HttpError {
  constructor(apiName) {
    super(502, `${apiName} returned an invalid response`);
    this.apiName = apiName;
  }
}

module.exports = { HttpError, UpstreamError };
