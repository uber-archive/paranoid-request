// Copyright (c) 2016 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import extend from 'xtend';
import request from 'request';

export function setupMakeTestParams(baseParams) {
  return function makeTestParams(name, url, params = {}) {
    return {
      name,
      requestParams: url,
      params: extend(baseParams, params)
    };
  };
}

const baseBadParams = {
  shouldError: true
};

const badUri = {
  errorMessage: 'Invalid URI "/"',
  errorName: 'Error'
};
const badDomain = {
  errorMessage: /^getaddrinfo ENOTFOUND\b/,
  errorName: 'Error',
  errorAssertions: {
    code: 'ENOTFOUND',
    errno: 'ENOTFOUND',
    syscall: 'getaddrinfo'
  }
};
const connectionRefused = {
  errorMessage: /^connect ECONNREFUSED\b/,
  errorName: 'Error',
  errorAssertions: {
    code: 'ECONNREFUSED',
    errno: 'ECONNREFUSED',
    syscall: 'connect'
  }
};
const notFound = {
  statusCode: 404
};

const withOriginalRequest = {
  requester: request
};

const baseGoodParams = {
  statusCode: 200
};

export const params = {
  baseBadParams,
  baseGoodParams,

  badDomain,
  badUri,
  connectionRefused,
  notFound,
  withOriginalRequest
};

export function setupBadTest() {
  return setupMakeTestParams(extend(baseBadParams, ...arguments));
}

export function setupGoodTest() {
  return setupMakeTestParams(extend(baseGoodParams, ...arguments));
}
